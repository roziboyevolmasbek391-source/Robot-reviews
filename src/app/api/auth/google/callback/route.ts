import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { SYSTEM_SETTING_KEYS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.json({ error: `Google ruxsat bermadi: ${error}` }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ error: "Code parametri topilmadi" }, { status: 400 });
    }

    // Client ma'lumotlarini bazadan o'qiymiz
    const clientIdSetting = await prisma.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_KEYS.GOOGLE_CLIENT_ID },
    });
    const clientSecretSetting = await prisma.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_KEYS.GOOGLE_CLIENT_SECRET },
    });

    if (!clientIdSetting?.value || !clientSecretSetting?.value) {
      return NextResponse.json({ error: "Client ID yoki Secret bazadan topilmadi" }, { status: 500 });
    }

    const clientId = decrypt(clientIdSetting.value);
    const clientSecret = decrypt(clientSecretSetting.value);
    const redirectUri = "http://localhost:3001/api/auth/google/callback";

    // Google token API ga POST so'rov yuboramiz
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: tokenData.error_description || tokenData.error || "Token olishda xatolik" },
        { status: 400 }
      );
    }

    const refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      return NextResponse.json(
        { 
          error: "Refresh Token qaytmadi. Iltimos Google hisobingiz ruxsatini o'chirib, qaytadan urinib ko'ring (prompt=consent orqali majburiy so'rash uchun)." 
        }, 
        { status: 400 }
      );
    }

    // Refresh token'ni shifrlab bazaga yozamiz
    await prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.GOOGLE_REFRESH_TOKEN },
      update: {
        value: encrypt(refreshToken),
        isSecret: true,
      },
      create: {
        key: SYSTEM_SETTING_KEYS.GOOGLE_REFRESH_TOKEN,
        value: encrypt(refreshToken),
        isSecret: true,
      },
    });

    // Muvaffaqiyatli yakunlanganda, sozlamalar sahifasiga qaytaramiz
    return NextResponse.redirect(new URL("/admin/settings?status=success", req.url));

  } catch (error) {
    console.error("Google Callback error:", error);
    return NextResponse.json({ error: "Serverda xatolik yuz berdi" }, { status: 500 });
  }
}
