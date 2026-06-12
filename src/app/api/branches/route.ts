import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { ReviewSource } from "@prisma/client";

// Filiallar ro'yxatini olish
export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const onlyActive = searchParams.get("active") === "true";

    const where: any = {};
    if (onlyActive) {
      where.isActive = true;
    }

    const branches = await prisma.branch.findMany({
      where,
      include: {
        platformIds: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({ branches });
  } catch (error) {
    console.error("Branches GET error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}

// Yangi filial yaratish
export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Ruxsat etilmagan (Faqat admin uchun)" }, { status: 403 });
    }

    const body = await req.json();
    const { name, city, address, latitude, longitude, platformIds } = body;

    if (!name || !city || !address) {
      return NextResponse.json({ error: "Nom, shahar va manzil bo'lishi shart" }, { status: 400 });
    }

    // Tranzaksiya bilan filial va uning platforma ID'larini birga saqlaymiz
    const branch = await prisma.$transaction(async (tx) => {
      const normalizedCity = (city || "").toLowerCase() === "tashkent" || (city || "").toLowerCase() === "ташкент" ? "Ташкент" : (city || "Ташкент");
      const newBranch = await tx.branch.create({
        data: {
          name,
          city: normalizedCity,
          address,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
        },
      });

      if (platformIds && Array.isArray(platformIds)) {
        await tx.branchPlatformId.createMany({
          data: platformIds.map((p: any) => ({
            branchId: newBranch.id,
            source: p.source as ReviewSource,
            platformId: p.platformId,
          })),
        });
      }

      return newBranch;
    });

    return NextResponse.json({ success: true, branch });
  } catch (error) {
    console.error("Branch POST error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
