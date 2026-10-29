import {
  DAY_SECONDS,
  MONTHLY_ENTRY_LIMIT,
  PRIMAL_DC,
  type ItemEntries,
} from "../core/market.js";
import type {
  CurrentItemResponse,
  CurrentMultiResponse,
  HistoryItemResponse,
  HistoryMultiResponse,
  SaleEntry,
} from "../core/types.js";
import {
  chunk,
  fetchJson,
  mapWithConcurrency,
  normalizeBaseUrl,
} from "./http.js";

const DEFAULT_UNIVERSALIS = "https://universalis.app/api/v2";

export class UniversalisClient {
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl, DEFAULT_UNIVERSALIS);
  }

  async getMarketableItemIds(): Promise<number[]> {
    const data = await fetchJson<unknown>(`${this.baseUrl}/marketable`);
    const values = Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.items)
        ? data.items
        : null;
    if (!values)
      throw new Error(
        "Resposta inesperada da lista de itens negociáveis do Universalis.",
      );
    return [
      ...new Set(
        values.filter(
          (value): value is number => Number.isInteger(value) && value > 0,
        ),
      ),
    ];
  }

  async getSales(
    itemIds: number[],
    seconds: number,
    entriesToReturn = MONTHLY_ENTRY_LIMIT,
  ): Promise<ItemEntries[]> {
    const batches = chunk(itemIds, 100);
    const responses = await mapWithConcurrency(batches, 4, async (ids) => {
      const query = new URLSearchParams({
        entriesWithin: String(seconds),
        entriesToReturn: String(entriesToReturn),
      });
      const url = `${this.baseUrl}/history/${PRIMAL_DC}/${ids.join(",")}?${query}`;
      return fetchJson<HistoryMultiResponse | HistoryItemResponse[]>(url);
    });
    const byItem = new Map<number, SaleEntry[]>();
    responses.forEach((response, batchIndex) => {
      const batchIds = batches[batchIndex]!;
      const dataItems = Array.isArray(response)
        ? new Map(
            response.map((item) => [
              Number(
                (item as HistoryItemResponse & { itemID?: number }).itemID,
              ),
              item,
            ]),
          )
        : new Map(
            Object.entries(response.items ?? {}).map(([id, item]) => [
              Number(id),
              item,
            ]),
          );
      for (const id of batchIds) {
        const item = dataItems.get(id);
        byItem.set(id, Array.isArray(item?.entries) ? item.entries : []);
      }
    });
    return itemIds.map((itemId) => ({
      itemId,
      entries: byItem.get(itemId) ?? [],
    }));
  }

  async getSalesForLast24Hours(
    nowSeconds: number,
    itemIds?: number[],
  ): Promise<ItemEntries[]> {
    const ids = itemIds ?? (await this.getMarketableItemIds());
    // Ask for a slightly wider feed window, then apply the exact interval to API timestamps in memory.
    const queryWindow =
      DAY_SECONDS + Math.max(60, Math.floor(Date.now() / 1000) - nowSeconds);
    return this.getSales(ids, queryWindow);
  }

  async getCurrentItem(itemId: number): Promise<CurrentItemResponse> {
    const query = new URLSearchParams({
      entries: "20",
      entriesWithin: String(7 * DAY_SECONDS),
    });
    const response = await fetchJson<
      CurrentMultiResponse | CurrentItemResponse
    >(`${this.baseUrl}/${PRIMAL_DC}/${itemId}?${query}`);
    if (isRecord(response) && isRecord(response.items))
      return response.items[String(itemId)] ?? {};
    return response as CurrentItemResponse;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
