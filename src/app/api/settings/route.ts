import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { encrypt } from "@/lib/encryption";

// Sozlamalarni olish (Xavfsiz holda maxfiylarni yashirish)
export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 403 });
    }

    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
    });

    // Maxfiy qiymatlarni yashirish
    const safeSettings = settings.map((s) => ({
      id: s.id,
      key: s.key,
      value: s.isSecret && s.value ? "********" : s.value,
      isSecret: s.isSecret,
    }));

    return NextResponse.json({ settings: safeSettings });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}

// Sozlamalarni yangilash
export async function PUT(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 403 });
    }

    const body = await req.json();
    const { settings } = body; // Array of { key: string, value: string }

    if (!settings || !Array.isArray(settings)) {
      return NextResponse.json({ error: "Sozlamalar massiv bo'lishi shart" }, { status: 400 });
    }

    for (const item of settings) {
      if (item.value === "********") {
        // Agar maxfiy qiymat o'zgartirilmagan bo'lsa, uni yangilamaymiz
        continue;
      }

      const existing = await prisma.systemSetting.findUnique({
        where: { key: item.key },
      });

      let finalValue = item.value;
      const isSecret = existing ? existing.isSecret : item.key.includes("SECRET") || item.key.includes("TOKEN") || item.key.includes("KEY") || item.key.includes("COOKIE");

      if (isSecret && item.value) {
        finalValue = encrypt(item.value);
      }

      await prisma.systemSetting.upsert({
        where: { key: item.key },
        update: {
          value: finalValue,
          isSecret,
        },
        create: {
          key: item.key,
          value: finalValue,
          isSecret,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings PUT error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
