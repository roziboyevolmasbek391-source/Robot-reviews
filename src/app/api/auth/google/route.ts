import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { decrypt } from "@/lib/encryption";
import { SYSTEM_SETTING_KEYS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    // Bazadan Client ID va Client Secret ni olamiz
    const clientIdSetting = await prisma.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_KEYS.GOOGLE_CLIENT_ID },
    });

    if (!clientIdSetting || !clientIdSetting.value) {
      return NextResponse.json(
        { error: "Google Client ID sozlanmagan. Avval sozlamalarda uni saqlang." },
        { status: 400 }
      );
    }

    const clientId = decrypt(clientIdSetting.value);
    const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
    
    // Google ruxsatnoma olish havolasini yaratamiz
    // access_type=offline va prompt=consent refresh_token olish uchun shart!
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent("https://www.googleapis.com/auth/business.manage")}` +
      `&access_type=offline` +
      `&prompt=consent`;

    return NextResponse.redirect(googleAuthUrl);
  } catch (error) {
    console.error("Google Auth error:", error);
    return NextResponse.json({ error: "Serverda xatolik yuz berdi" }, { status: 500 });
  }
}
