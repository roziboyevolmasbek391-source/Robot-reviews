export type YandexOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type YandexBusinessProfile = {
  Id: number;
  Name?: string;
  Address?: string;
  Phone?: string;
  IsPublished?: 'YES' | 'NO';
  HasOffice?: 'YES' | 'NO';
};
