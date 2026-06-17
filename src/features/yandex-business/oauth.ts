import { OAuthProvider } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { decryptSecret, encryptSecret } from '@/lib/security/crypto';
import type { YandexOAuthTokenResponse } from './types';

const yandexAuthorizeUrl = 'https://oauth.yandex.ru/authorize';
const yandexTokenUrl = 'https://oauth.yandex.ru/token';

function getYandexOAuthConfig() {
  const clientId = process.env.YANDEX_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YANDEX_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.YANDEX_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('YANDEX_OAUTH_CLIENT_ID, YANDEX_OAUTH_CLIENT_SECRET and YANDEX_OAUTH_REDIRECT_URI are required');
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildYandexAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getYandexOAuthConfig();
  const url = new URL(yandexAuthorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  return url.toString();
}

export async function exchangeYandexCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getYandexOAuthConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  const response = await fetch(yandexTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    throw new Error(`Yandex OAuth token exchange failed: ${response.status}`);
  }

  return (await response.json()) as YandexOAuthTokenResponse;
}

export async function refreshYandexToken(refreshToken: string) {
  const { clientId, clientSecret } = getYandexOAuthConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(yandexTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    throw new Error(`Yandex OAuth refresh failed: ${response.status}`);
  }

  return (await response.json()) as YandexOAuthTokenResponse;
}

export async function saveYandexCredential(userId: string, token: YandexOAuthTokenResponse) {
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;

  return prisma.oAuthCredential.upsert({
    where: {
      provider_userId: {
        provider: OAuthProvider.YANDEX_BUSINESS,
        userId
      }
    },
    update: {
      encryptedAccessToken: encryptSecret(token.access_token),
      encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : undefined,
      tokenType: token.token_type ?? 'bearer',
      scope: token.scope,
      expiresAt
    },
    create: {
      provider: OAuthProvider.YANDEX_BUSINESS,
      userId,
      encryptedAccessToken: encryptSecret(token.access_token),
      encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : null,
      tokenType: token.token_type ?? 'bearer',
      scope: token.scope,
      expiresAt
    }
  });
}

export async function getYandexAccessToken(userId: string) {
  const credential = await prisma.oAuthCredential.findUnique({
    where: {
      provider_userId: {
        provider: OAuthProvider.YANDEX_BUSINESS,
        userId
      }
    }
  });

  if (!credential) {
    return null;
  }

  const shouldRefresh =
    credential.expiresAt &&
    credential.expiresAt.getTime() < Date.now() + 5 * 60 * 1000 &&
    credential.encryptedRefreshToken;

  if (!shouldRefresh) {
    return decryptSecret(credential.encryptedAccessToken);
  }

  const refreshed = await refreshYandexToken(decryptSecret(credential.encryptedRefreshToken!));
  await saveYandexCredential(userId, refreshed);

  return refreshed.access_token;
}

export async function getYandexConnectionStatus(userId: string) {
  const credential = await prisma.oAuthCredential.findUnique({
    where: {
      provider_userId: {
        provider: OAuthProvider.YANDEX_BUSINESS,
        userId
      }
    },
    select: {
      id: true,
      scope: true,
      expiresAt: true,
      updatedAt: true
    }
  });

  return {
    connected: Boolean(credential),
    scope: credential?.scope ?? null,
    expiresAt: credential?.expiresAt ?? null,
    updatedAt: credential?.updatedAt ?? null
  };
}
