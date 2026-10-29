import { formatDailyRanking, formatMonthlyRanking } from "../core/format.js";
import {
  DAY_SECONDS,
  filterSalesByWindow,
  getLast24HoursWindow,
  getLocalMonthWindow,
  isLastDayOfMonth,
  isTruncatedByLimit,
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
  if (publish && (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID))
    throw new Error(
      "Configure DISCORD_BOT_TOKEN e DISCORD_CHANNEL_ID nos secrets do GitHub Actions.",
    );
  const market = new UniversalisClient(env.UNIVERSALIS_BASE_URL);
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
  const [dailyNames, currentRows] = await Promise.all([
    xivapi.getItemNames(dailyTop.map((row) => row.itemId)),
    mapWithConcurrency(dailyTop, 4, async (row) => {
      try {
        const current = await market.getCurrentItem(row.itemId);
        return [
          row.itemId,
          current.minPrice ??
            current.listings?.reduce<number | null>(
              (min, listing) =>
                min === null || listing.pricePerUnit < min
                  ? listing.pricePerUnit
                  : min,
              null,
            ) ??
            null,
        ] as const;
      } catch {
        return [row.itemId, null] as const;
      }
    }),
  ]);
  const dailyMessage = formatDailyRanking(
    dailyRanks,
    dailyNames,
    new Map(currentRows),
    dailyWindow,
  );
  if (publish) await postLongMessage(env, dailyMessage);
  else console.info(`[dry-run diário]\n${dailyMessage}`);

  const localDate = getSaoPauloDate(now);
  if (
    !isLastDayOfMonth(
      new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)),
    )
  )
    return;

  const marker = `${MONTHLY_MARKER}:${localDate.year}-${String(localDate.month).padStart(2, "0")}`;
  if (publish && (await hasRecentMarker(env, marker))) {
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
    if (publish) await postLongMessage(env, warning);
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
  if (publish) await postLongMessage(env, monthlyMessage);
  else console.info(`[dry-run mensal]\n${monthlyMessage}`);
}

export async function postLongMessage(
  env: Environment,
  content: string,
): Promise<void> {
  const pieces = splitMessage(content, 1900);
  for (const piece of pieces) await postMessage(env, piece);
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

async function postMessage(env: Environment, content: string): Promise<void> {
  await discordRequest(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
}

async function hasRecentMarker(
  env: Environment,
  marker: string,
): Promise<boolean> {
  let before: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (before) query.set("before", before);
    const messages = await discordRequest<
      Array<{ id: string; content?: string }>
    >(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages?${query}`);
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
): Promise<T> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Discord HTTP ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
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
