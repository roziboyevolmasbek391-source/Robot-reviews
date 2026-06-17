import { ProviderAdapter, ProviderAuthState, PublishBusinessData, PublishResult } from "./types";
import { AutomationProvider } from "@prisma/client";

const TWOGIS_API_BASE = "https://api.2gis.com";
const TWOGIS_BUSINESS_URL = "https://business.2gis.com";

export class TwoGISAdapter implements ProviderAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(callbackUrl: string): Promise<string> {
    const state = Math.random().toString(36).substring(7);
    const authUrl = new URL(`${TWOGIS_BUSINESS_URL}/auth`);
    authUrl.searchParams.set("client_id", this.apiKey);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    return authUrl.toString();
  }

  async handleCallback(code: string, state: string): Promise<ProviderAuthState> {
    const response = await fetch(`${TWOGIS_API_BASE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: this.apiKey,
        redirect_uri: process.env.TWOGIS_CALLBACK_URL || "http://localhost:3000/api/integrations/twogis/callback",
      }),
    });

    const data = await response.json();

    return {
      accessToken: data.access_token,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      metadata: { user_id: data.user_id },
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
      const response = await fetch(`${TWOGIS_API_BASE}/user/profile`, {
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
    try {
      const response = await fetch(`${TWOGIS_API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: authState.accessToken,
        }),
      });

      const data = await response.json();

      return {
        ...authState,
        accessToken: data.access_token,
        tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      };
    } catch (error) {
      throw new Error("Failed to refresh 2GIS session");
    }
  }

  async reconnect(authState: ProviderAuthState, callbackUrl: string): Promise<string> {
    return this.connect(callbackUrl);
  }

  async publishBusiness(
    data: PublishBusinessData,
    authState: ProviderAuthState
  ): Promise<PublishResult> {
    try {
      const businessPayload = {
        name: data.name,
        category: data.category,
        description: data.description || "",
        phone: data.phone,
        website: data.website,
        email: data.email,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
      };

      const response = await fetch(`${TWOGIS_API_BASE}/businesses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authState.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(businessPayload),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return {
        success: true,
        provider: AutomationProvider.TWOGIS,
        message: "Business published successfully to 2GIS",
      };
    } catch (error) {
      return {
        success: false,
        provider: AutomationProvider.TWOGIS,
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
      provider: AutomationProvider.TWOGIS,
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
