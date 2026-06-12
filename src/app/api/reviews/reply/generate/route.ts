import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { analyzeReview } from "@/lib/ai-analyzer";

export async function POST(req: NextRequest) {
  try {
    // 1. Verify User Session
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const body = await req.json();
    const { reviewId } = body;

    if (!reviewId) {
      return NextResponse.json({ error: "Review ID kiritilishi shart" }, { status: 400 });
    }

    // 2. Fetch review and branch details
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        branch: {
          select: { name: true }
        }
      }
    });

    if (!review) {
      return NextResponse.json({ error: "Sharh topilmadi" }, { status: 404 });
    }

    // 3. Run AI suggestion engine
    const analysis = await analyzeReview(
      review.text,
      review.rating,
      review.author || "Anonim",
      review.branch?.name || ""
    );

    return NextResponse.json({
      success: true,
      replyRu: analysis.replyRu,
      replyUz: analysis.replyUz,
      aiUsed: analysis.aiUsed
    });
  } catch (error: any) {
    console.error("Generate Suggestions API Error:", error);
    return NextResponse.json({ error: "Serverda xatolik: " + error.message }, { status: 500 });
  }
}
