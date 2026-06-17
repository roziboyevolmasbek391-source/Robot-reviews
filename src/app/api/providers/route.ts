import { NextRequest, NextResponse } from "next/server";
import { getProviderAdapter } from "@/lib/providers/factory";
import { db } from "@/lib/db";
import { AutomationProvider, ProviderSessionStatus } from "@prisma/client";
import CryptoJS from "crypto-js";

import { getSession } from "@/lib/security/session";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-key";

function encryptToken(token: string): string {
  return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
}

function decryptToken(encryptedToken: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json();

    if (!provider || !Object.values(AutomationProvider).includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const callbackUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/providers/${provider}/callback`;

    const adapter = getProviderAdapter(provider as AutomationProvider);
    const authUrl = await adapter.connect(callbackUrl);

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error("Provider connect error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get("provider");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!provider || !code) {
      return NextResponse.json(
        { error: "Missing provider or code" },
        { status: 400 }
      );
    }

    const adapter = getProviderAdapter(provider as AutomationProvider);
    const authState = await adapter.handleCallback(code, state || "");

    // Get user ID from session
    const session = await getSession();
    let userId = session?.id;
    if (!userId) {
      const fallbackUser = await db.user.findFirst();
      userId = fallbackUser?.id;
    }
    if (!userId) {
      return NextResponse.json({ error: "No users found in the database" }, { status: 500 });
    }

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptToken(authState.accessToken || "");
    const encryptedRefreshToken = authState.refreshToken
      ? encryptToken(authState.refreshToken)
      : null;

    // Save session
    await db.providerSession.upsert({
      where: {
        provider_userId: {
          provider: provider as AutomationProvider,
          userId,
        },
      },
      create: {
        provider: provider as AutomationProvider,
        userId,
        status: ProviderSessionStatus.CONNECTED,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: authState.tokenExpiresAt,
        lastSuccessfulLogin: new Date(),
      },
      update: {
        status: ProviderSessionStatus.CONNECTED,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: authState.tokenExpiresAt,
        lastSuccessfulLogin: new Date(),
      },
    });

    // Redirect to success page
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/settings?provider=${provider}&success=true`
    );
  } catch (error) {
    console.error("Provider callback error:", error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/settings?error=connection_failed`
    );
  }
}
