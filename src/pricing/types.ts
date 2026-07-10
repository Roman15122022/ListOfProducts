import type {
  CurrencyCode,
  PriceObservationSource,
  ShoppingUnit,
} from "../domain/types";

export type PriceChannel = "online" | "pickup" | "physical-store";

export interface PriceContext {
  countryCode: string;
  currency: CurrencyCode;
  channel: PriceChannel;
  regionCode?: string;
  city?: string;
  storeId?: string;
}

export interface ProductQuoteRequest {
  normalizedName: string;
  quantity: number;
  unit: ShoppingUnit;
}

export interface ProductQuote {
  providerId: string;
  source: PriceObservationSource;
  normalizedName: string;
  itemName: string;
  amountMinor: number;
  currency: CurrencyCode;
  packageQuantity: number;
  packageUnit: ShoppingUnit;
  countryCode: string;
  channel: PriceChannel;
  observedAt: number;
  confidence: number;
  retailerId?: string;
  retailerName?: string;
  externalProductId?: string;
  regionCode?: string;
  city?: string;
  storeId?: string;
  validUntil?: number;
  sourceUrl?: string;
}

export interface StorePriceProvider {
  id: string;
  countryCodes: readonly string[] | "*";
  channels: readonly PriceChannel[];
  search(
    request: ProductQuoteRequest,
    context: PriceContext,
  ): Promise<readonly ProductQuote[]>;
}
