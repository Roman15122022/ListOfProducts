import type { PriceObservation } from "../domain/types";
import type {
  PriceContext,
  ProductQuote,
  ProductQuoteRequest,
  StorePriceProvider,
} from "./types";
import { arePriceUnitsCompatible } from "./units";

const HISTORY_PROVIDER_ID = "local-history";

const normalizeProductName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const providerSupportsContext = (
  provider: StorePriceProvider,
  context: PriceContext,
): boolean =>
  (provider.countryCodes === "*" || provider.countryCodes.includes(context.countryCode)) &&
  provider.channels.includes(context.channel);

const sortQuotes = (quotes: readonly ProductQuote[]): ProductQuote[] =>
  [...quotes].sort((firstQuote, secondQuote) => {
    if (firstQuote.confidence !== secondQuote.confidence) {
      return secondQuote.confidence - firstQuote.confidence;
    }

    return secondQuote.observedAt - firstQuote.observedAt;
  });

const quoteMatchesContext = (quote: ProductQuote, context: PriceContext): boolean =>
  quote.countryCode === context.countryCode &&
  quote.currency === context.currency &&
  quote.channel === context.channel &&
  (quote.regionCode === undefined || quote.regionCode === context.regionCode) &&
  (quote.city === undefined || quote.city === context.city) &&
  (quote.storeId === undefined || quote.storeId === context.storeId);

export class StorePriceProviderRegistry {
  private readonly providers = new Map<string, StorePriceProvider>();

  constructor(providers: readonly StorePriceProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: StorePriceProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  getAvailable(context: PriceContext): StorePriceProvider[] {
    return Array.from(this.providers.values()).filter((provider) =>
      providerSupportsContext(provider, context),
    );
  }

  async search(
    request: ProductQuoteRequest,
    context: PriceContext,
  ): Promise<ProductQuote[]> {
    const quoteGroups = await Promise.all(
      this.getAvailable(context).map((provider) => provider.search(request, context)),
    );

    return sortQuotes(
      quoteGroups.flat().filter((quote) => quoteMatchesContext(quote, context)),
    );
  }
}

export const createLocalHistoryPriceProvider = (
  getObservations: () => readonly PriceObservation[],
): StorePriceProvider => ({
  id: HISTORY_PROVIDER_ID,
  countryCodes: "*",
  channels: ["physical-store"],
  search: async (
    request: ProductQuoteRequest,
    context: PriceContext,
  ): Promise<ProductQuote[]> => {
    const normalizedRequestName = normalizeProductName(request.normalizedName);

    return getObservations()
      .filter(
        (observation) =>
          observation.source === "manual" &&
          observation.currency === context.currency &&
          observation.countryCode === context.countryCode &&
          normalizeProductName(observation.normalizedName) === normalizedRequestName &&
          arePriceUnitsCompatible(observation.packageUnit, request.unit),
      )
      .sort((firstObservation, secondObservation) =>
        secondObservation.observedAt - firstObservation.observedAt,
      )
      .slice(0, 10)
      .map((observation) => ({
        providerId: HISTORY_PROVIDER_ID,
        source: observation.source,
        normalizedName: observation.normalizedName,
        itemName: observation.itemName,
        amountMinor: observation.amountMinor,
        currency: observation.currency,
        packageQuantity: observation.packageQuantity,
        packageUnit: observation.packageUnit,
        countryCode: observation.countryCode,
        channel: "physical-store",
        observedAt: observation.observedAt,
        confidence: 1,
      }));
  },
});

export const createLocalPriceProviderRegistry = (
  getObservations: () => readonly PriceObservation[],
): StorePriceProviderRegistry =>
  new StorePriceProviderRegistry([createLocalHistoryPriceProvider(getObservations)]);
