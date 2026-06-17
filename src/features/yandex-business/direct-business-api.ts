import type { YandexBusinessProfile } from './types';

const directBusinessesUrl = 'https://api.direct.yandex.com/json/v5/businesses';

export async function getYandexBusinessProfiles(accessToken: string) {
  const response = await fetch(directBusinessesUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Accept-Language': 'ru',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      method: 'get',
      params: {
        FieldNames: ['Id', 'Name', 'Address', 'Phone', 'IsPublished', 'HasOffice']
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Yandex Direct Businesses API failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: {
      Businesses?: YandexBusinessProfile[];
    };
    error?: {
      error_detail?: string;
      error_string?: string;
    };
  };

  if (payload.error) {
    throw new Error(payload.error.error_detail ?? payload.error.error_string ?? 'Yandex Direct API error');
  }

  return payload.result?.Businesses ?? [];
}
