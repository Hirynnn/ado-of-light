export interface SaleEntry {
  timestamp: number;
  quantity: number;
  pricePerUnit: number;
  hq?: boolean;
}

export interface Listing {
  pricePerUnit: number;
  quantity: number;
  hq?: boolean;
}

export interface ItemSalesRank {
  itemId: number;
  unitsSold: number;
  weightedAveragePrice: number;
  salesCount: number;
}

export interface ItemMarketPrice {
  itemId: number;
  name: string;
  minListingPrice: number | null;
  listingCount: number;
  listings: Listing[];
  recentSalesWeightedAverage: number | null;
  recentSalesCount: number;
  lastUpdatedAt: number | null;
  queriedAt: string;
}

export interface HistoryItemResponse {
  entries?: SaleEntry[];
  lastUploadTime?: number;
}

export interface HistoryMultiResponse {
  items?: Record<string, HistoryItemResponse>;
  itemIDs?: number[];
  unresolvedItems?: number[];
}

export interface CurrentItemResponse {
  listings?: Listing[];
  recentHistory?: SaleEntry[];
  listingsCount?: number;
  minPrice?: number;
  lastUploadTime?: number;
  worldUploadTimes?: Record<string, number>;
}

export interface CurrentMultiResponse {
  items?: Record<string, CurrentItemResponse>;
  unresolvedItems?: number[];
}

export interface Environment {
  UNIVERSALIS_BASE_URL?: string;
  XIVAPI_BASE_URL?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_CHANNEL_ID?: string;
  DISCORD_PUBLIC_KEY?: string;
}
