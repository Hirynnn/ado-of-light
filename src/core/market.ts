import type { ItemSalesRank, SaleEntry } from "./types.js";

export const PRIMAL_DC = "Primal";
export const PRIMAL_WORLDS = [
  "Behemoth",
  "Excalibur",
  "Famfrit",
  "Hyperion",
  "Lamia",
  "Leviathan",
  "Ultros",
] as const;
export const DAY_SECONDS = 24 * 60 * 60;
export const MONTHLY_ENTRY_LIMIT = 99_999;

export interface TimeWindow {
  start: number;
  end: number;
}

export interface ItemEntries {
  itemId: number;
  entries: SaleEntry[];
}

export function getLast24HoursWindow(nowSeconds: number): TimeWindow {
  return { start: nowSeconds - DAY_SECONDS, end: nowSeconds };
}

export function getLocalMonthWindow(
  year: number,
  monthOneBased: number,
): TimeWindow {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthOneBased) ||
    monthOneBased < 1 ||
    monthOneBased > 12
  ) {
    throw new RangeError("Ano ou mês inválido.");
  }
  // America/Sao_Paulo is currently UTC-03:00 and has no daylight-saving shift.
  const start = Date.UTC(year, monthOneBased - 1, 1) / 1000 + 3 * 60 * 60;
  const end = Date.UTC(year, monthOneBased, 1) / 1000 + 3 * 60 * 60;
  return { start, end };
}

export function getSaoPauloDateParts(date: Date): {
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

export function filterSalesByWindow(
  entries: SaleEntry[],
  window: TimeWindow,
): SaleEntry[] {
  return entries.filter(
    (sale) =>
      Number.isFinite(sale.timestamp) &&
      Number.isFinite(sale.quantity) &&
      sale.quantity > 0 &&
      Number.isFinite(sale.pricePerUnit) &&
      sale.pricePerUnit >= 0 &&
      sale.timestamp >= window.start &&
      sale.timestamp < window.end,
  );
}

export function rankSalesByUnits(
  items: ItemEntries[],
  window?: TimeWindow,
): ItemSalesRank[] {
  const totals = new Map<
    number,
    { units: number; priceTotal: number; count: number }
  >();
  for (const item of items) {
    for (const sale of item.entries) {
      if (
        !Number.isFinite(sale.quantity) ||
        sale.quantity <= 0 ||
        !Number.isFinite(sale.pricePerUnit) ||
        sale.pricePerUnit < 0
      )
        continue;
      if (
        window &&
        (!Number.isFinite(sale.timestamp) ||
          sale.timestamp < window.start ||
          sale.timestamp >= window.end)
      )
        continue;
      const current = totals.get(item.itemId) ?? {
        units: 0,
        priceTotal: 0,
        count: 0,
      };
      current.units += sale.quantity;
      current.priceTotal += sale.pricePerUnit * sale.quantity;
      current.count += 1;
      totals.set(item.itemId, current);
    }
  }
  return [...totals.entries()]
    .map(([itemId, total]) => ({
      itemId,
      unitsSold: total.units,
      weightedAveragePrice: total.units ? total.priceTotal / total.units : 0,
      salesCount: total.count,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold || a.itemId - b.itemId);
}

export function isLastDayOfMonth(date: Date): boolean {
  const nextDay = new Date(date.getTime());
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.getUTCDate() === 1;
}

export function isTruncatedByLimit(
  entries: SaleEntry[],
  limit = MONTHLY_ENTRY_LIMIT,
): boolean {
  return entries.length >= limit;
}

export function weightedSaleAverage(entries: SaleEntry[]): number | null {
  let units = 0;
  let total = 0;
  for (const sale of entries) {
    if (
      !Number.isFinite(sale.quantity) ||
      sale.quantity <= 0 ||
      !Number.isFinite(sale.pricePerUnit) ||
      sale.pricePerUnit < 0
    )
      continue;
    units += sale.quantity;
    total += sale.quantity * sale.pricePerUnit;
  }
  return units ? total / units : null;
}
