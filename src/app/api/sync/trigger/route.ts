import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { syncService } from "@/features/sync/services/sync.service";
import { ReviewSource } from "@prisma/client";

// Sinxronizatsiyani ishga tushirish (Qo'lda boshlash)
export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { branchId, source } = body;

    // Agar ma'lum bir filial va manba berilgan bo'lsa, faqat uni sinxron qilamiz
    if (branchId && source) {
      console.log(`[Sync API] Manual sync triggered for branch ${branchId} and source ${source}`);
      const syncResult = await syncService.syncBranchSource(branchId, source as ReviewSource);
      return NextResponse.json({ success: true, result: syncResult });
    }

    // Aks holda barchasini sinxronizatsiya qilamiz (background job sifatida)
    console.log("[Sync API] Full manual sync triggered");
    // Vaqtni tejash uchun asinxron ishga tushiramiz
    syncService.syncAll().catch(err => {
      console.error("[Sync API] Full manual sync async error:", err);
    });

    return NextResponse.json({ 
      success: true, 
      message: "Sinxronizatsiya jarayoni fonda (background) ishga tushirildi. Loglar sahifasidan holatni kuzatishingiz mumkin." 
    });
  } catch (error) {
    console.error("Sync trigger API error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}

// Sinxronizatsiya loglarini olish
export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const logs = await prisma.reviewSyncLog.findMany({
      take: 20,
      orderBy: {
        startedAt: "desc",
      },
      include: {
        branch: {
          select: {
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Sync logs API error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
