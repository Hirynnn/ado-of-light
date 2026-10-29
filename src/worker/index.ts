import { formatPrice } from "../core/format.js";
import type { Environment, ItemMarketPrice } from "../core/types.js";
import { lookupPrice, validateItemName } from "../services/price.js";
import { XIVApiClient } from "../services/xivapi.js";

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface DiscordInteraction {
  type: number;
  application_id?: string;
  token?: string;
  data?: {
    name?: string;
    options?: Array<{ name?: string; value?: unknown; focused?: boolean }>;
  };
  member?: { user?: { id?: string } };
  user?: { id?: string };
}

const api = "https://discord.com/api/v10";
const clientCalls = new Map<string, number[]>();

const worker = {
  async fetch(
    request: Request,
    env: Environment,
    context: WorkerContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "ado-of-light",
        time: new Date().toISOString(),
      });
    }
    if (url.pathname === "/api/preco" && request.method === "GET") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      if (!allowPriceLookup(ip))
        return json(
          {
            error: "rate_limited",
            message:
              "Limite temporário de consultas atingido. Tente novamente em um minuto.",
          },
          429,
          { "Retry-After": "60" },
        );
      const name = validateItemName(url.searchParams.get("nome"));
      if (!name)
        return json(
          {
            error: "invalid_name",
            message: "Use o parâmetro nome com 2 a 100 caracteres.",
          },
          400,
        );
      try {
        const price = await lookupPrice(name, env);
        if (!price)
          return json(
            {
              error: "not_found",
              message: `Nenhum item encontrado para “${name}”.`,
            },
            404,
          );
        return json(price as ItemMarketPrice);
      } catch (error) {
        return serviceError(error);
      }
    }
    if (url.pathname === "/interactions" && request.method === "POST") {
      const rawBody = await request.text();
      if (
        !(await verifyDiscordSignature(
          request,
          rawBody,
          env.DISCORD_PUBLIC_KEY,
        ))
      ) {
        return json({ error: "invalid_signature" }, 401);
      }
      let interaction: DiscordInteraction;
      try {
        interaction = JSON.parse(rawBody) as DiscordInteraction;
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      if (interaction.type === 1) return json({ type: 1 });
      if (interaction.type === 4 && interaction.data?.name === "preco") {
        const focused = interaction.data.options?.find(
          (option) => option.name === "nome" && option.focused,
        );
        const value = validateItemName(focused?.value);
        if (!value) return json({ type: 8, data: { choices: [] } });
        try {
          const matches = await new XIVApiClient(
            env.XIVAPI_BASE_URL,
          ).searchItems(value, 25, 1_700);
          return json({
            type: 8,
            data: {
              choices: matches.map((match) => ({
                name: match.name.slice(0, 100),
                value: match.name.slice(0, 100),
              })),
            },
          });
        } catch {
          return json({ type: 8, data: { choices: [] } });
        }
      }
      if (
        interaction.type !== 2 ||
        interaction.data?.name !== "preco" ||
        !interaction.token ||
        !interaction.application_id
      ) {
        return json({
          type: 4,
          data: { content: "Interação não suportada.", flags: 64 },
        });
      }
      const rawName = interaction.data.options?.find(
        (option) => option.name === "nome",
      )?.value;
      const name = validateItemName(rawName);
      if (!name)
        return json({
          type: 4,
          data: {
            content: "Informe um nome de item entre 2 e 100 caracteres.",
            flags: 64,
          },
        });
      const userId =
        interaction.member?.user?.id ??
        interaction.user?.id ??
        "discord-unknown";
      if (!allowPriceLookup(`discord:${userId}`))
        return json({
          type: 4,
          data: {
            content:
              "Você atingiu o limite de consultas. Tente novamente em um minuto.",
            flags: 64,
          },
        });

      context.waitUntil(completeDiscordPriceLookup(interaction, name, env));
      return json({ type: 5, data: { flags: 64 } });
    }
    return json({ error: "not_found" }, 404);
  },
};

export default worker;

export function allowPriceLookup(ip: string, nowMs = Date.now()): boolean {
  const recent = (clientCalls.get(ip) ?? []).filter(
    (timestamp) => nowMs - timestamp < 60_000,
  );
  if (recent.length >= 8) {
    clientCalls.set(ip, recent);
    return false;
  }
  recent.push(nowMs);
  clientCalls.set(ip, recent);
  if (clientCalls.size > 500) {
    for (const [key, values] of clientCalls) {
      if (!values.length || nowMs - values.at(-1)! > 60_000)
        clientCalls.delete(key);
    }
  }
  return true;
}

export async function verifyDiscordSignature(
  request: Request,
  body: string,
  publicKey?: string,
): Promise<boolean> {
  const signatureHex = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (
    !publicKey ||
    !/^[0-9a-f]{64}$/i.test(publicKey) ||
    !signatureHex ||
    !/^[0-9a-f]{128}$/i.test(signatureHex) ||
    !timestamp ||
    !/^\d+$/.test(timestamp)
  )
    return false;
  const seconds = Number(timestamp);
  if (
    !Number.isSafeInteger(seconds) ||
    Math.abs(Date.now() / 1000 - seconds) > 300
  )
    return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(`${timestamp}${body}`),
    );
  } catch {
    return false;
  }
}

async function completeDiscordPriceLookup(
  interaction: DiscordInteraction,
  name: string,
  env: Environment,
): Promise<void> {
  const url = `${api}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  try {
    const result = await lookupPrice(name, env);
    await patchOriginal(
      url,
      result
        ? formatPrice(result)
        : `Não encontrei um item chamado “${name}” nos dados do XIVAPI.`,
    );
  } catch {
    await patchOriginal(
      url,
      "A consulta ao Universalis falhou ou está indisponível. Tente novamente em instantes.",
    ).catch(() => undefined);
  }
}

async function patchOriginal(url: string, content: string): Promise<void> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: content.slice(0, 1900),
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok)
    throw new Error(`Discord follow-up HTTP ${response.status}`);
}

function serviceError(error: unknown): Response {
  const message =
    error instanceof RangeError
      ? error.message
      : "Serviço de mercado indisponível; tente novamente mais tarde.";
  return json(
    {
      error: error instanceof RangeError ? "invalid_name" : "upstream_error",
      message,
    },
    error instanceof RangeError ? 400 : 502,
  );
}

function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}
