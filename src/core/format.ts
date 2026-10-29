import { PRIMAL_WORLDS } from "./market.js";
import type { ItemMarketPrice, ItemSalesRank } from "./types.js";

const WORLD_CODES: Record<(typeof PRIMAL_WORLDS)[number], string> = {
  Behemoth: "BHM",
  Excalibur: "EXC",
  Famfrit: "FAM",
  Hyperion: "HYP",
  Lamia: "LAM",
  Leviathan: "LEV",
  Ultros: "ULT",
};

export function formatGil(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value).toLocaleString("pt-BR")} gil`;
}

export function formatDailyRanking(
  ranking: ItemSalesRank[],
  names: Map<number, string>,
  pricesByWorld: Map<string, Map<number, number | null>>,
  window: { start: number; end: number },
): string {
  const start = new Date(window.start * 1000).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const end = new Date(window.end * 1000).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const rows = ranking.slice(0, 10);
  const legend = [
    PRIMAL_WORLDS.slice(0, 4)
      .map((world) => `${WORLD_CODES[world]} ${world}`)
      .join(" · "),
    PRIMAL_WORLDS.slice(4)
      .map((world) => `${WORLD_CODES[world]} ${world}`)
      .join(" · "),
  ];
  const lines = rows.length
    ? rows.map((row, index) => {
        const worldPrices = PRIMAL_WORLDS.map((world) => {
          const value = pricesByWorld.get(world)?.get(row.itemId) ?? null;
          return `${WORLD_CODES[world]} ${formatGilNumber(value)}`;
        });
        return [
          `**${index + 1}. ${escapeDiscord(names.get(row.itemId) ?? `Item ${row.itemId}`)}** · ${row.unitsSold.toLocaleString("pt-BR")} un. vendidas · média ${formatGil(row.weightedAveragePrice)}`,
          `> \`${worldPrices.slice(0, 4).join(" · ")}\``,
          `> \`${worldPrices.slice(4).join(" · ")}\``,
        ].join("\n");
      })
    : ["Nenhuma venda registrada nesse intervalo."];
  const hasMissingPrice = rows.some((row) =>
    PRIMAL_WORLDS.some(
      (world) => pricesByWorld.get(world)?.get(row.itemId) == null,
    ),
  );
  const priceNote = hasMissingPrice ? "\n`—` = sem anúncio disponível." : "";
  return [
    "✨ **ADO OF LIGHT** ✨",
    "🏆 **PRIMAL · TOP COMPRAS DAS ÚLTIMAS 24H**",
    `🕒 ${start} — ${end} (horário de Brasília)`,
    "📊 Preços = menor anúncio atual por mundo · Média = valor ponderado das compras",
    `🗺️ ${legend[0]}`,
    `　 ${legend[1]}`,
    priceNote,
    "",
    lines.join("\n\n"),
    "",
    "_Dados de vendas observados pelo Universalis; a cobertura depende dos envios recebidos._",
  ].join("\n");
}

function formatGilNumber(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : Math.round(value).toLocaleString("pt-BR");
}

export function formatMonthlyRanking(
  year: number,
  month: number,
  ranking: ItemSalesRank[],
  names: Map<number, string>,
): string {
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const rows = ranking.slice(0, 10);
  const lines = rows.length
    ? rows.map(
        (row, index) =>
          `${index + 1}. **${escapeDiscord(names.get(row.itemId) ?? `Item ${row.itemId}`)}** — ${row.unitsSold} un. · média ${formatGil(row.weightedAveragePrice)}`,
      )
    : ["Nenhuma venda registrada no período consultado."];
  return `✨ **ADO OF LIGHT · PRIMAL** ✨\n🌙 **ESPECIAL MENSAL · ${monthLabel}**\nVendas concluídas registradas pelo Universalis; média ponderada por unidades.\n\n${lines.map((line) => `> ${line}`).join("\n")}\n\n_Representa os registros recebidos, sem garantia de cobertura de todas as vendas reais._`;
}

export function formatPrice(price: ItemMarketPrice): string {
  const offers =
    price.listings
      .slice(0, 5)
      .map(
        (listing) =>
          `${formatGil(listing.pricePerUnit)}${listing.hq ? " (HQ)" : ""}`,
      )
      .join(" · ") || "sem detalhes de anúncios";
  const averageLabel =
    price.recentSalesWeightedAverage === null
      ? "Média ponderada de vendas recentes: sem registros retornados"
      : `Média ponderada das ${price.recentSalesCount} vendas recentes retornadas: ${formatGil(price.recentSalesWeightedAverage)}`;
  return `**${escapeDiscord(price.name)} · Primal**\nMenor anúncio atual: ${formatGil(price.minListingPrice)}\nAnúncios disponíveis: ${price.listingCount}\nOutros preços: ${offers}\n${averageLabel}\nConsulta: ${new Date(price.queriedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`;
}

function escapeDiscord(value: string): string {
  return value.replace(/[\\*_`~|>]/g, "\\$&").slice(0, 100);
}
