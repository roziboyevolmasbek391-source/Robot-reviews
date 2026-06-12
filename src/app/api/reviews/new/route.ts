import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { ReviewSource } from "@prisma/client";

// Yangi sharhlarni olish
export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source") as ReviewSource | null;

    const where: any = { isNew: true };
    if (source) {
      where.source = source;
    }

    const reviews = await prisma.review.findMany({
      where,
      include: {
        branch: {
          select: {
            name: true,
            city: true,
          },
        },
      },
      orderBy: {
        reviewDate: "desc",
      },
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    console.error("New reviews API error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}

// Sharhlarni o'qilgan deb belgilash
export async function PUT(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const { reviewIds } = await req.json();

    if (!reviewIds || !Array.isArray(reviewIds)) {
      return NextResponse.json({ error: "reviewIds massiv bo'lishi shart" }, { status: 400 });
    }

    await prisma.review.updateMany({
      where: {
        id: { in: reviewIds },
      },
      data: {
        isNew: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark read API error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
