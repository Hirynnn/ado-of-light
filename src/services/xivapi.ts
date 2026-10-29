import { fetchJson, normalizeBaseUrl } from "./http.js";

const DEFAULT_XIVAPI = "https://v2.xivapi.com/api";

interface SearchResponse {
  results?: Array<{
    row_id: number;
    fields?: { Name?: string };
    score?: number;
  }>;
}

interface SheetResponse {
  fields?: { Name?: string };
}

export interface ItemMatch {
  id: number;
  name: string;
}

export class XIVApiClient {
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl, DEFAULT_XIVAPI);
  }

  async searchItem(query: string): Promise<ItemMatch | null> {
    const results = await this.searchItems(query, 25);
    if (!results.length) return null;
    const normalized = query.trim().toLocaleLowerCase();
    return (
      results.find((row) => row.name.toLocaleLowerCase() === normalized) ??
      results[0]!
    );
  }

  async searchItems(
    query: string,
    limit = 25,
    timeoutMs = 8_000,
  ): Promise<ItemMatch[]> {
    const term = query.trim().replace(/["\\]/g, "");
    if (!term) return [];
    const params = new URLSearchParams({
      sheets: "Item",
      fields: "Name",
      query: `Name~"${term.slice(0, 80)}"`,
      limit: String(Math.min(Math.max(limit, 1), 25)),
    });
    const response = await fetchJson<SearchResponse>(
      `${this.baseUrl}/search?${params}`,
      timeoutMs,
      timeoutMs <= 2_000 ? 0 : 2,
    );
    const results = (response.results ?? []).filter(
      (row) => Number.isInteger(row.row_id) && !!row.fields?.Name?.trim(),
    );
    return results.map((row) => ({ id: row.row_id, name: row.fields!.Name! }));
  }

  async getItemNames(ids: number[]): Promise<Map<number, string>> {
    const uniqueIds = [...new Set(ids)];
    const pairs = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const params = new URLSearchParams({ fields: "Name" });
          const response = await fetchJson<SheetResponse>(
            `${this.baseUrl}/sheet/Item/${id}?${params}`,
            10_000,
          );
          const name = response.fields?.Name?.trim();
          return name ? ([id, name] as const) : null;
        } catch {
          return null;
        }
      }),
    );
    return new Map(
      pairs.filter((pair): pair is readonly [number, string] => pair !== null),
    );
  }
}
