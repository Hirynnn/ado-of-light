import { formatDailyRanking, formatMonthlyRanking } from "../core/format.js";
import {
  DAY_SECONDS,
  filterSalesByWindow,
  getLast24HoursWindow,
  getLocalMonthWindow,
  isLastDayOfMonth,
  isTruncatedByLimit,
  PRIMAL_WORLDS,
  rankSalesByUnits,
} from "../core/market.js";
import type { Environment } from "../core/types.js";
import { fetchJson, mapWithConcurrency } from "../services/http.js";
import { UniversalisClient } from "../services/universalis.js";
import { XIVApiClient } from "../services/xivapi.js";

const DISCORD_API = "https://discord.com/api/v10";
const MONTHLY_MARKER = "ado-monthly";

export async function runScheduledPublication(
  env: Environment,
  now = new Date(),
  publish = true,
): Promise<void> {
  const deadlineMs = Date.now() + 60 * 60 * 1000;
  if (publish && (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID))
    throw new Error(
      "Configure DISCORD_BOT_TOKEN e DISCORD_CHANNEL_ID no ambiente.",
    );
  const market = new UniversalisClient(
    env.UNIVERSALIS_BASE_URL,
    deadlineMs,
  );
  const xivapi = new XIVApiClient(env.XIVAPI_BASE_URL);
  const ids = await market.getMarketableItemIds();
  if (!ids.length)
    throw new Error("O Universalis não retornou itens negociáveis.");

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const dailyWindow = getLast24HoursWindow(nowSeconds);
  const dailySales = await market.getSales(ids, DAY_SECONDS + 60);
  const dailyRanks = rankSalesByUnits(
    dailySales.map((item) => ({
      itemId: item.itemId,
      entries: filterSalesByWindow(item.entries, dailyWindow),
    })),
  );
  const dailyTop = dailyRanks.slice(0, 10);
  const [dailyNames, worldPriceRows] = await Promise.all([
    xivapi.getItemNames(dailyTop.map((row) => row.itemId)),
    mapWithConcurrency([...PRIMAL_WORLDS], 4, async (world) => {
      try {
        const currentItems = await market.getCurrentItems(
          world,
          dailyTop.map((row) => row.itemId),
        );
        return [
          world,
          new Map(
            dailyTop.map((row) => {
              const current = currentItems.get(row.itemId);
              const minPrice =
                current?.minPrice ??
                current?.listings?.reduce<number | null>(
                  (min, listing) =>
                    min === null || listing.pricePerUnit < min
                      ? listing.pricePerUnit
                      : min,
                  null,
                ) ??
                null;
              return [row.itemId, minPrice] as const;
            }),
          ),
        ] as const;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("Tempo limite de uma hora consultando")
        )
          throw error;
        return [
          world,
          new Map<number, number | null>(
            dailyTop.map((row) => [row.itemId, null]),
          ),
        ] as const;
      }
    }),
  ]);
  const dailyMessage = formatDailyRanking(
    dailyRanks,
    dailyNames,
    new Map(worldPriceRows),
    dailyWindow,
  );
  if (publish) await postLongMessage(env, dailyMessage, deadlineMs);
  else console.info(`[dry-run diário]\n${dailyMessage}`);

  const localDate = getSaoPauloDate(now);
  if (
    !isLastDayOfMonth(
      new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)),
    )
  )
    return;

  const marker = `${MONTHLY_MARKER}:${localDate.year}-${String(localDate.month).padStart(2, "0")}`;
  if (publish && (await hasRecentMarker(env, marker, deadlineMs))) {
    console.info(
      `Publicação mensal ${marker} já existe no canal; ignorando a duplicata.`,
    );
    return;
  }

  // Month interval is local midnight-to-midnight in São Paulo (UTC-03:00).
  const monthWindow = getLocalMonthWindow(localDate.year, localDate.month);
  const secondsInMonth = monthWindow.end - monthWindow.start;
  const monthlySales = await market.getSales(ids, secondsInMonth);
  const wasTruncated = monthlySales.some((item) =>
    isTruncatedByLimit(item.entries),
  );
  if (wasTruncated) {
    const warning = `**Especial mensal não publicado:** pelo menos um item atingiu o limite de ${(99_999).toLocaleString("pt-BR")} registros do endpoint. O ranking poderia estar incompleto. Referência: ||${marker}:limit||`;
    if (publish) await postLongMessage(env, warning, deadlineMs);
    else console.info(`[dry-run mensal: incompleto]\n${warning}`);
    return;
  }

  const monthlyRanks = rankSalesByUnits(
    monthlySales.map((item) => ({
      itemId: item.itemId,
      entries: filterSalesByWindow(item.entries, monthWindow),
    })),
  );
  const monthlyNames = await xivapi.getItemNames(
    monthlyRanks.slice(0, 10).map((row) => row.itemId),
  );
  const monthlyMessage = `${formatMonthlyRanking(localDate.year, localDate.month, monthlyRanks, monthlyNames)}\n||${marker}||`;
  if (publish) await postLongMessage(env, monthlyMessage, deadlineMs);
  else console.info(`[dry-run mensal]\n${monthlyMessage}`);
}

export async function postLongMessage(
  env: Environment,
  content: string,
  deadlineMs = Date.now() + 60 * 60 * 1000,
): Promise<void> {
  const pieces = splitMessage(content, 1900);
  for (const piece of pieces) await postMessage(env, piece, deadlineMs);
}

export function splitMessage(content: string, maxLength: number): string[] {
  const lines = content.split("\n");
  const result: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      result.push(current);
      current = line;
    } else current = next;
  }
  if (current) result.push(current);
  return result;
}

async function postMessage(
  env: Environment,
  content: string,
  deadlineMs: number,
): Promise<void> {
  await discordRequest(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  }, deadlineMs);
}

async function hasRecentMarker(
  env: Environment,
  marker: string,
  deadlineMs: number,
): Promise<boolean> {
  let before: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (before) query.set("before", before);
    const messages = await discordRequest<
      Array<{ id: string; content?: string }>
    >(
      env,
      `/channels/${env.DISCORD_CHANNEL_ID}/messages?${query}`,
      {},
      deadlineMs,
    );
    if (messages.some((message) => message.content?.includes(marker)))
      return true;
    if (messages.length < 100) return false;
    before = messages.at(-1)?.id;
    if (!before) return false;
  }
  return false;
}

async function discordRequest<T = unknown>(
  env: Environment,
  path: string,
  init: RequestInit = {},
  deadlineMs = Date.now() + 60 * 60 * 1000,
): Promise<T> {
  let attempt = 0;
  while (Date.now() < deadlineMs) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(20_000, deadlineMs - Date.now()),
    );
    let response: Response;
    try {
      response = await fetch(`${DISCORD_API}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch (error) {
      if (Date.now() >= deadlineMs)
        throw new Error(
          "Tempo limite de uma hora aguardando resposta do Discord.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 429) {
      const retryAfterHeader = Number(response.headers.get("retry-after"));
      const body = await response.text();
      let retryAfterBody = Number.NaN;
      try {
        const parsed = JSON.parse(body) as { retry_after?: number };
        retryAfterBody = Number(parsed.retry_after);
      } catch {
        // Some edge responses are HTML and omit Discord's JSON retry_after.
      }
      const retryAfterSeconds =
        Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader
          : Number.isFinite(retryAfterBody) && retryAfterBody > 0
            ? retryAfterBody
            : Math.min(2 ** Math.min(attempt, 6), 60);
      const waitMs = retryAfterSeconds * 1000;
      if (waitMs >= deadlineMs - Date.now()) {
        throw new Error(
          `Discord HTTP 429; Retry-After de ${retryAfterSeconds}s excede o limite de uma hora. Publicação cancelada.`,
        );
      }
      console.warn(
        `Discord HTTP 429 (${response.headers.get("content-type") ?? "content-type desconhecido"}); nova tentativa em ${waitMs}ms.`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt += 1;
      continue;
    }
    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "desconhecido";
      const retryAfter = response.headers.get("retry-after");
      const detail = (await response.text()).slice(0, 160).replace(/\s+/g, " ");
      throw new Error(
        `Discord HTTP ${response.status} (content-type: ${contentType}${retryAfter ? `, retry-after: ${retryAfter}` : ""}): ${detail}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  throw new Error("Tempo limite de uma hora aguardando resposta do Discord.");
}

function getSaoPauloDate(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}
