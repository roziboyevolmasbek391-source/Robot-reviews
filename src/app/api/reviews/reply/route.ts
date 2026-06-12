import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    // 1. Verify User Session
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const body = await req.json();
    const { reviewId, replyText } = body;

    if (!reviewId || !replyText) {
      return NextResponse.json({ error: "Review ID va javob matni kiritilishi shart" }, { status: 400 });
    }

    // 2. Fetch review
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return NextResponse.json({ error: "Sharh topilmadi" }, { status: 404 });
    }

    // 3. Update review with reply information
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        replyText,
        repliedAt: new Date(),
        repliedBy: session.user.username,
        isNew: false, // Mark as read/processed once replied
      },
    });

    return NextResponse.json({ success: true, review: updatedReview });
  } catch (error: any) {
    console.error("Save Reply API Error:", error);
    return NextResponse.json({ error: "Serverda xatolik: " + error.message }, { status: 500 });
  }
}
