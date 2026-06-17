import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";

/**
 * POST /api/reviews/reply/publish
 * Xaritaga javob yuboradi (Playwright orqali).
 * Bu route sekin ishlaydi — frontendda timeout bilan chaqiriladi.
 */
export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const body = await req.json();
    const { reviewId } = body;

    if (!reviewId) {
      return NextResponse.json({ error: "reviewId kerak" }, { status: 400 });
    }

    // DB dan review ni olish
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        branch: { include: { platformIds: true } },
      },
    });

    if (!review || !review.replyText) {
      return NextResponse.json(
        { error: "Sharh yoki javob topilmadi" },
        { status: 404 }
      );
    }

    const platformEntry = review.branch.platformIds.find(
      (p) => p.source === review.source
    );
    const branchPlatformId = platformEntry?.platformId ?? "";

    if (!branchPlatformId) {
      return NextResponse.json(
        {
          success: false,
          errorMessage: `Bu filial uchun ${review.source} platformida ID sozlanmagan`,
        },
        { status: 400 }
      );
    }

    let result: { success: boolean; errorMessage?: string } = {
      success: false,
      errorMessage: "Qo'llab-quvvatlanmaydigan platforma",
    };

    if (review.source === "GOOGLE_MAPS") {
      const { GoogleReviewsConnector } = await import(
        "@/connectors/google/google.connector"
      );
      
      const clientIdSetting = await prisma.systemSetting.findUnique({ where: { key: "GOOGLE_CLIENT_ID" } });
      const clientSecretSetting = await prisma.systemSetting.findUnique({ where: { key: "GOOGLE_CLIENT_SECRET" } });
      const refreshTokenSetting = await prisma.systemSetting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } });

      const { decrypt } = await import("@/lib/encryption");
      const clientId = clientIdSetting?.value ? decrypt(clientIdSetting.value) : (process.env.GOOGLE_CLIENT_ID || "");
      const clientSecret = clientSecretSetting?.value ? decrypt(clientSecretSetting.value) : (process.env.GOOGLE_CLIENT_SECRET || "");
      const refreshToken = refreshTokenSetting?.value ? decrypt(refreshTokenSetting.value) : (process.env.GOOGLE_REFRESH_TOKEN || "");

      const connector = new GoogleReviewsConnector({ clientId, clientSecret, refreshToken });
      result = await connector.replyToReview!(
        branchPlatformId,
        review.externalReviewId,
        review.replyText,
        { author: review.author, text: review.text || "" }
      );
    } else if (review.source === "YANDEX_MAPS") {
      const { YandexMapsConnector } = await import(
        "@/connectors/yandex-maps/yandex-maps.connector"
      );
      const connector = new YandexMapsConnector();
      result = await connector.replyToReview!(
        branchPlatformId,
        review.externalReviewId,
        review.replyText,
        { author: review.author, text: review.text || "" }
      );
    } else if (review.source === "DGIS") {
      const { DgisConnector } = await import(
        "@/connectors/dgis/dgis.connector"
      );
      const connector = new DgisConnector();
      result = await connector.replyToReview!(
        branchPlatformId,
        review.externalReviewId,
        review.replyText,
        { author: review.author, text: review.text || "" }
      );
    }

    console.log(`[Publish Reply] ${review.source} result:`, result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Publish Reply API] Error:", error);
    return NextResponse.json(
      { success: false, errorMessage: error.message },
      { status: 500 }
    );
  }
}
