import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { ReviewSource } from "@prisma/client";

// Filialni yangilash
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, city, address, latitude, longitude, platformIds, isActive } = body;

    const updatedBranch = await prisma.$transaction(async (tx) => {
      const normalizedCity = city !== undefined ? ((city || "").toLowerCase() === "tashkent" || (city || "").toLowerCase() === "ташкент" ? "Ташкент" : (city || "Ташкент")) : undefined;
      // 1. Filialni asosiy ma'lumotlarini yangilash
      const branch = await tx.branch.update({
        where: { id },
        data: {
          name,
          city: normalizedCity,
          address,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          isActive: isActive !== undefined ? isActive : undefined,
        },
      });

      // 2. Platforma ID'larini yangilash
      if (platformIds && Array.isArray(platformIds)) {
        // Avvalgi platforma ID'larini o'chiramiz
        await tx.branchPlatformId.deleteMany({
          where: { branchId: id },
        });

        // Yangilarini qo'shamiz
        await tx.branchPlatformId.createMany({
          data: platformIds
            .filter((p: any) => p.platformId) // Bo'sh bo'lmaganlarini saqlaymiz
            .map((p: any) => ({
              branchId: id,
              source: p.source as ReviewSource,
              platformId: p.platformId,
            })),
        });
      }

      return branch;
    });

    return NextResponse.json({ success: true, branch: updatedBranch });
  } catch (error) {
    console.error("Branch PUT error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}

// Filialni o'chirish
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 403 });
    }

    const { id } = await params;

    // Cascade delete prisma schema'da belgilangan (reviews va platformIds o'chib ketadi)
    await prisma.branch.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Branch DELETE error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}

// Filial avtomatizatsiya statusini olish (Polling uchun)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        automationRuns: {
          orderBy: { createdAt: 'desc' },
          include: {
            logs: {
              orderBy: { createdAt: 'desc' },
              take: 5
            }
          }
        }
      }
    });

    if (!branch) {
      return NextResponse.json({ error: "Filial topilmadi" }, { status: 404 });
    }

    return NextResponse.json({ success: true, automationRuns: branch.automationRuns });
  } catch (error) {
    console.error("Branch GET error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}

