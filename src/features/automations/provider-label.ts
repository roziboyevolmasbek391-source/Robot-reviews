export const automationProviders = [
  'GOOGLE_BUSINESS',
  'YANDEX_BUSINESS',
  'TWOGIS'
] as const;

export type AutomationProviderValue =
  (typeof automationProviders)[number];

export function providerLabel(provider: AutomationProviderValue) {
  const labels: Record<AutomationProviderValue, string> = {
    GOOGLE_BUSINESS: 'Google Business Profile',
    YANDEX_BUSINESS: 'Яндекс Бизнес',
    TWOGIS: '2ГИС'
  };

  return labels[provider] ?? provider;
}