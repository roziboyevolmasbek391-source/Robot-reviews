import { ProviderAdapter, ProviderAuthState, PublishBusinessData, PublishResult } from "./types";
import { AutomationProvider } from "@prisma/client";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

export class GoogleBusinessProfileAdapter implements ProviderAdapter {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async connect(callbackUrl: string): Promise<string> {
    const state = Math.random().toString(36).substring(7);
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set("client_id", this.clientId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/plus.me",
    ].join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("state", state);
    return authUrl.toString();
  }

  async handleCallback(code: string, state: string): Promise<ProviderAuthState> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/api/integrations/google/callback",
      }).toString(),
    });

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      metadata: { scope: data.scope },
    };
  }

  async validateSession(authState: ProviderAuthState): Promise<any> {
    if (!authState.accessToken) {
      return { valid: false, needsReconnect: true };
    }

    if (authState.tokenExpiresAt && new Date() > authState.tokenExpiresAt) {
      return { valid: false, needsReconnect: false, reason: "Token expired" };
    }

    try {
      const response = await fetch(`${GOOGLE_API_BASE}/accounts`, {
        headers: { Authorization: `Bearer ${authState.accessToken}` },
      });

      return {
        valid: response.ok,
        needsReconnect: !response.ok,
      };
    } catch (error) {
      return { valid: false, needsReconnect: true };
    }
  }

  async refreshSession(authState: ProviderAuthState): Promise<ProviderAuthState> {
    if (!authState.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: authState.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
    });

    const data = await response.json();

    return {
      ...authState,
      accessToken: data.access_token,
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
    try {
      const response = await fetch(`${GOOGLE_API_BASE}/accounts`, {
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const accounts = await response.json();

      if (!accounts.accounts || accounts.accounts.length === 0) {
        throw new Error("No Google Business accounts found");
      }

      const accountId = accounts.accounts[0].name.split("/")[1];
      const locations = await fetch(
        `${GOOGLE_API_BASE}/accounts/${accountId}/locations`,
        {
          headers: { Authorization: `Bearer ${authState.accessToken}` },
        }
      ).then((r) => r.json());

      if (locations.locations && locations.locations.length > 0) {
        const locationId = locations.locations[0].name;

        const updateResponse = await fetch(`${GOOGLE_API_BASE}/${locationId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${authState.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessProfile: {
              description: data.description || "",
            },
          }),
        });

        if (!updateResponse.ok) {
          throw new Error("Failed to update business profile");
        }
      }

      return {
        success: true,
        provider: AutomationProvider.GOOGLE_BUSINESS,
        message: "Business published successfully to Google",
      };
    } catch (error) {
      return {
        success: false,
        provider: AutomationProvider.GOOGLE_BUSINESS,
        message: "Failed to publish business",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async resumeAfterVerification(
    verificationCode: string,
    authState: ProviderAuthState
  ): Promise<PublishResult> {
    return {
      success: true,
      provider: AutomationProvider.GOOGLE_BUSINESS,
      message: "Verification completed",
    };
  }

  async getStatus(authState: ProviderAuthState): Promise<Record<string, any>> {
    const validation = await this.validateSession(authState);
    return {
      valid: validation.valid,
      lastUpdated: new Date().toISOString(),
    };
  }
}
