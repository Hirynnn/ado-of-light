import { describe, expect, it } from "vitest";
import {
  filterSalesByWindow,
  getLast24HoursWindow,
  getLocalMonthWindow,
  isLastDayOfMonth,
  isTruncatedByLimit,
  rankSalesByUnits,
  weightedSaleAverage,
} from "../src/core/market.js";
import type { SaleEntry } from "../src/core/types.js";

const entry = (
  timestamp: number,
  quantity: number,
  pricePerUnit: number,
): SaleEntry => ({ timestamp, quantity, pricePerUnit });

describe("regras de mercado", () => {
  it("usa intervalo de 24 horas fechado no início e aberto no fim", () => {
    const window = getLast24HoursWindow(100_000);
    expect(window).toEqual({ start: 13_600, end: 100_000 });
    expect(
      filterSalesByWindow([entry(13_600, 1, 5), entry(100_000, 1, 9)], window),
    ).toEqual([entry(13_600, 1, 5)]);
  });

  it("converte o mês de Brasília em limites UTC corretos", () => {
    const window = getLocalMonthWindow(2026, 2);
    expect(new Date(window.start * 1000).toISOString()).toBe(
      "2026-02-01T03:00:00.000Z",
    );
    expect(new Date(window.end * 1000).toISOString()).toBe(
      "2026-03-01T03:00:00.000Z",
    );
  });

  it("reconhece o último dia do mês, inclusive em fevereiro", () => {
    expect(isLastDayOfMonth(new Date("2024-02-29T12:00:00Z"))).toBe(true);
    expect(isLastDayOfMonth(new Date("2026-02-28T12:00:00Z"))).toBe(true);
    expect(isLastDayOfMonth(new Date("2026-02-27T12:00:00Z"))).toBe(false);
  });

  it("agrega unidades, calcula média ponderada e ordena o ranking", () => {
    const ranked = rankSalesByUnits([
      { itemId: 20, entries: [entry(10, 2, 100), entry(11, 3, 200)] },
      { itemId: 10, entries: [entry(12, 4, 50)] },
    ]);
    expect(ranked.map((row) => [row.itemId, row.unitsSold])).toEqual([
      [20, 5],
      [10, 4],
    ]);
    expect(ranked[0]?.weightedAveragePrice).toBe(160);
  });

  it("retorna dados vazios sem inventar média", () => {
    expect(rankSalesByUnits([{ itemId: 1, entries: [] }])).toEqual([]);
    expect(weightedSaleAverage([])).toBeNull();
  });

  it("identifica quando a resposta mensal atingiu o teto da API", () => {
    expect(isTruncatedByLimit(new Array(99_999).fill(entry(1, 1, 1)))).toBe(
      true,
    );
    expect(isTruncatedByLimit([entry(1, 1, 1)])).toBe(false);
  });
});
