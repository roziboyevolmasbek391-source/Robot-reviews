import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { ReviewSource } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    // 1. Autentifikatsiyani tekshirish
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const source = searchParams.get("source") as ReviewSource | null;
    const ratingParam = searchParams.get("rating") || "";
    const branchId = searchParams.get("branchId") || null;
    const dateFrom = searchParams.get("dateFrom") ? new Date(searchParams.get("dateFrom")!) : null;
    const dateTo = searchParams.get("dateTo") ? new Date(searchParams.get("dateTo")!) : null;
    const sortBy = searchParams.get("sortBy") || "reviewDate";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";

    const idParam = searchParams.get("id") || null;
    const skip = (page - 1) * limit;

    // 2. WHERE shartlarini qurish
    const where: any = {};

    if (idParam) {
      where.id = idParam;
    }

    if (search) {
      where.OR = [
        { author: { contains: search, mode: "insensitive" } },
        { text: { contains: search, mode: "insensitive" } },
      ];
    }

    if (source) {
      where.source = source;
    }

    if (ratingParam) {
      if (ratingParam === "positive") {
        where.rating = { in: [4, 5] };
      } else if (ratingParam === "negative") {
        where.rating = { in: [1, 2] };
      } else if (ratingParam === "neutral") {
        where.rating = 3;
      } else {
        const parsedRating = parseInt(ratingParam);
        if (!isNaN(parsedRating)) {
          where.rating = parsedRating;
        }
      }
    }

    if (branchId) {
      where.branchId = branchId;
    }

    if (dateFrom || dateTo) {
      where.reviewDate = {};
      if (dateFrom) {
        where.reviewDate.gte = dateFrom;
      }
      if (dateTo) {
        where.reviewDate.lte = dateTo;
      }
    }

    // 3. Ma'lumotlarni so'rash
    const [reviews, total] = await prisma.$transaction([
      prisma.review.findMany({
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
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      }),
      prisma.review.count({ where }),
    ]);

    return NextResponse.json({
      reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Reviews API error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
