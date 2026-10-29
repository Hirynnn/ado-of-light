import type { ItemMarketPrice, ItemSalesRank } from "./types.js";

export function formatGil(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value).toLocaleString("pt-BR")} gil`;
}

export function formatDailyRanking(
  ranking: ItemSalesRank[],
  names: Map<number, string>,
  prices: Map<number, number | null>,
  window: { start: number; end: number },
): string {
  const start = new Date(window.start * 1000).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const end = new Date(window.end * 1000).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const rows = ranking.slice(0, 10);
  const lines = rows.length
    ? rows.map(
        (row, index) =>
          `${index + 1}. **${escapeDiscord(names.get(row.itemId) ?? `Item ${row.itemId}`)}** — ${row.unitsSold} un. · média ${formatGil(row.weightedAveragePrice)} · menor anúncio ${formatGil(prices.get(row.itemId) ?? null)}`,
      )
    : ["Nenhuma venda registrada nesse intervalo."];
  const priceNote = rows.some((row) => prices.get(row.itemId) == null)
    ? "\n— indica menor anúncio não disponível para aquele item."
    : "";
  return `**Ado of Light · vendas em Primal**\nIntervalo: ${start} — ${end} (horário de Brasília)\nMédia ponderada por unidades. Dados observados pelo Universalis; cobertura depende dos envios recebidos.${priceNote}\n\n${lines.join("\n")}`;
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
  return `**Ado of Light · especial mensal (${monthLabel})**\nVendas concluídas registradas pelo Universalis em Primal; média ponderada por unidades. Não são anúncios ativos e não representam garantia de cobertura de todas as vendas reais.\n\n${lines.join("\n")}`;
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
