import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";

// Bu route FAQAT DB ga saqlaydi — xaritaga yuborish alohida /api/reviews/reply/publish endpoint'dan
export async function POST(req: NextRequest) {
  try {
    // 1. Session tekshirish
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const body = await req.json();
    const { reviewId, replyText } = body;

    if (!reviewId || !replyText?.trim()) {
      return NextResponse.json(
        { error: "Review ID va javob matni kiritilishi shart" },
        { status: 400 }
      );
    }

    // 2. Review ni DB dan olish
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        branch: { include: { platformIds: true } },
      },
    });

    if (!review) {
      return NextResponse.json({ error: "Sharh topilmadi" }, { status: 404 });
    }

    // 3. DB ga saqlash
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        replyText: replyText.trim(),
        repliedAt: new Date(),
        repliedBy: session.user.username,
        isNew: false,
      },
    });

    // 4. Platforma ID
    const platformEntry = review.branch.platformIds.find(
      (p) => p.source === review.source
    );
    const branchPlatformId = platformEntry?.platformId ?? "";

    const supportsMapReply =
      (review.source === "GOOGLE_MAPS" || review.source === "YANDEX_MAPS" || review.source === "DGIS") &&
      branchPlatformId !== "";

    // 5. Darhol javob qaytaramiz — UI muzlamaydi
    return NextResponse.json({
      success: true,
      review: updatedReview,
      mapReplyQueued: supportsMapReply,
      branchPlatformId,
      source: review.source,
      platforms: supportsMapReply
        ? { [review.source]: { success: true } }
        : {},
      message: supportsMapReply
        ? `Javob saqlandi ✅. Xaritaga yuborish uchun /api/reviews/reply/publish ni chaqiring.`
        : "Javob faqat DB ga saqlandi.",
    });
  } catch (error: any) {
    console.error("[Reply API] Error:", error);
    return NextResponse.json(
      { error: "Serverda xatolik: " + error.message },
      { status: 500 }
    );
  }
}
