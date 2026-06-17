import { AutomationProvider } from "@prisma/client";
import { ProviderAdapter } from "./types";
import { YandexBusinessAdapter } from "./yandex";
import { GoogleBusinessProfileAdapter } from "./google";
import { TwoGISAdapter } from "./twogis";

export class ProviderFactory {
  private static instance: ProviderFactory;

  private providers: Map<AutomationProvider, ProviderAdapter> = new Map();

  private constructor() {
    this.initializeProviders();
  }

  static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  private initializeProviders() {
    this.providers.set(
      AutomationProvider.YANDEX_BUSINESS,
      new YandexBusinessAdapter(
        process.env.YANDEX_CLIENT_ID || "",
        process.env.YANDEX_CLIENT_SECRET || ""
      )
    );

    this.providers.set(
      AutomationProvider.GOOGLE_BUSINESS,
      new GoogleBusinessProfileAdapter(
        process.env.GOOGLE_CLIENT_ID || "",
        process.env.GOOGLE_CLIENT_SECRET || ""
      )
    );

    this.providers.set(
      AutomationProvider.TWOGIS,
      new TwoGISAdapter(process.env.TWOGIS_API_KEY || "")
    );
  }

  getProvider(provider: AutomationProvider): ProviderAdapter {
    const adapter = this.providers.get(provider);
    if (!adapter) {
      throw new Error(`Provider ${provider} not found`);
    }
    return adapter;
  }

  getAllProviders(): AutomationProvider[] {
    return Array.from(this.providers.keys());
  }
}

export function getProviderAdapter(provider: AutomationProvider): ProviderAdapter {
  return ProviderFactory.getInstance().getProvider(provider);
}
