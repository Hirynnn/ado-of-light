import { weightedSaleAverage } from "../core/market.js";
import type { Environment, ItemMarketPrice } from "../core/types.js";
import { UniversalisClient } from "./universalis.js";
import { XIVApiClient } from "./xivapi.js";

export function validateItemName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (
    value.length < 2 ||
    value.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  return value;
}

export async function lookupPrice(
  name: string,
  env: Environment,
): Promise<ItemMarketPrice | null> {
  const term = validateItemName(name);
  if (!term)
    throw new RangeError("Informe um nome de item entre 2 e 100 caracteres.");
  const xivapi = new XIVApiClient(env.XIVAPI_BASE_URL);
  const match = await xivapi.searchItem(term);
  if (!match) return null;

  const market = new UniversalisClient(env.UNIVERSALIS_BASE_URL);
  const [current, itemSales] = await Promise.all([
    market.getCurrentItem(match.id),
    market.getSales([match.id], 7 * 24 * 60 * 60, 500),
  ]);
  const sales = itemSales[0]?.entries ?? [];
  const listings = [...(current.listings ?? [])].sort(
    (a, b) => a.pricePerUnit - b.pricePerUnit,
  );
  const minListingPrice = listings.length
    ? listings[0]!.pricePerUnit
    : Number.isFinite(current.minPrice)
      ? current.minPrice!
      : null;
  const lastUpdatedMs = current.lastUploadTime ?? null;
  return {
    itemId: match.id,
    name: match.name,
    minListingPrice,
    listingCount: Number.isInteger(current.listingsCount)
      ? current.listingsCount!
      : listings.length,
    listings: listings.slice(0, 5),
    recentSalesWeightedAverage: weightedSaleAverage(sales),
    recentSalesCount: sales.length,
    lastUpdatedAt: lastUpdatedMs,
    queriedAt: new Date().toISOString(),
  };
}
