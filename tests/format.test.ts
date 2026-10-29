import { describe, expect, it } from "vitest";
import {
  formatDailyRanking,
  formatPrice,
  formatMonthlyRanking,
} from "../src/core/format.js";
import type { ItemMarketPrice } from "../src/core/types.js";

describe("mensagens", () => {
  it("formata ranking vazio e deixa claro quando o menor anúncio falta", () => {
    const window = { start: 1_700_000_000, end: 1_700_086_400 };
    expect(formatDailyRanking([], new Map(), new Map(), window)).toContain(
      "Nenhuma venda registrada",
    );
    expect(
      formatDailyRanking(
        [{ itemId: 1, unitsSold: 4, weightedAveragePrice: 25, salesCount: 2 }],
        new Map([[1, "Item A"]]),
        new Map(),
        window,
      ),
    ).toContain("menor anúncio não disponível");
  });

  it("diferencia vendas do mês de anúncios e formata preço sem inventar média", () => {
    const monthly = formatMonthlyRanking(
      2026,
      8,
      [{ itemId: 1, unitsSold: 5, weightedAveragePrice: 10, salesCount: 1 }],
      new Map([[1, "Item A"]]),
    );
    expect(monthly).toContain("agosto de 2026");
    expect(monthly).toContain("Vendas concluídas");
    const price: ItemMarketPrice = {
      itemId: 1,
      name: "Item A",
      minListingPrice: null,
      listingCount: 0,
      listings: [],
      recentSalesWeightedAverage: null,
      recentSalesCount: 0,
      lastUpdatedAt: null,
      queriedAt: "2026-08-01T12:00:00.000Z",
    };
    expect(formatPrice(price)).toContain("sem registros retornados");
    expect(formatPrice(price)).toContain("Anúncios disponíveis: 0");
  });
});
