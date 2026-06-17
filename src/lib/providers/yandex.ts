import { ProviderAdapter, ProviderAuthState, PublishBusinessData, PublishResult } from "./types";
import { AutomationProvider } from "@prisma/client";

const YANDEX_AUTH_URL = "https://oauth.yandex.ru/authorize";
const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";

/**
 * Yandex Business adapter for the ProviderFactory.
 *
 * Handles OAuth flow and token management.
 * Actual browser automation (filling the wizard) is in
 * src/features/automations/services/yandex-business-automation.ts
 */
export class YandexBusinessAdapter implements ProviderAdapter {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async connect(callbackUrl: string): Promise<string> {
    const state = Math.random().toString(36).substring(7);
    const authUrl = new URL(YANDEX_AUTH_URL);
    authUrl.searchParams.set("client_id", this.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", "business-profile");
    return authUrl.toString();
  }

  async handleCallback(code: string, state: string): Promise<ProviderAuthState> {
    const response = await fetch(YANDEX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Yandex OAuth failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      metadata: { scope: data.scope },
    };
  }

  async validateSession(authState: ProviderAuthState): Promise<{
    valid: boolean;
    needsReconnect: boolean;
    reason?: string;
  }> {
    if (!authState.accessToken) {
      return { valid: false, needsReconnect: true, reason: "No access token" };
    }

    if (authState.tokenExpiresAt && new Date() > authState.tokenExpiresAt) {
      return { valid: false, needsReconnect: false, reason: "Token expired" };
    }

    try {
      // Verify token is still valid with Yandex API
      const response = await fetch("https://login.yandex.ru/info", {
        headers: { Authorization: `OAuth ${authState.accessToken}` },
      });

      return {
        valid: response.ok,
        needsReconnect: !response.ok,
        reason: response.ok ? undefined : `API check failed (${response.status})`,
      };
    } catch (error) {
      return { valid: false, needsReconnect: true, reason: "Network error" };
    }
  }

  async refreshSession(authState: ProviderAuthState): Promise<ProviderAuthState> {
    if (!authState.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(YANDEX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: authState.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Yandex token refresh failed (${response.status})`);
    }

    const data = await response.json();

    return {
      ...authState,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? authState.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  async reconnect(authState: ProviderAuthState, callbackUrl: string): Promise<string> {
    return this.connect(callbackUrl);
  }

  async publishBusiness(
    data: PublishBusinessData,
    authState: ProviderAuthState
  ): Promise<PublishResult> {
    // Publishing is handled by the browser automation in
    // src/features/automations/services/yandex-business-automation.ts
    // This adapter only manages the OAuth/API layer.
    return {
      success: false,
      provider: AutomationProvider.YANDEX_BUSINESS,
      message: "Use the automation service for publishing. This adapter handles OAuth only.",
    };
  }

  async resumeAfterVerification(
    verificationCode: string,
    authState: ProviderAuthState
  ): Promise<PublishResult> {
    // Verification is handled by YandexBusinessAutomation.resumeAfterVerification()
    return {
      success: false,
      provider: AutomationProvider.YANDEX_BUSINESS,
      message: "Use the automation service for verification. This adapter handles OAuth only.",
    };
  }

  async getStatus(authState: ProviderAuthState): Promise<Record<string, any>> {
    const validation = await this.validateSession(authState);
    return {
      provider: "YANDEX_BUSINESS",
      valid: validation.valid,
      needsReconnect: validation.needsReconnect,
      reason: validation.reason,
      lastUpdated: new Date().toISOString(),
    };
  }
}
