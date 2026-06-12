import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { branchService } from "@/features/branches/services/branch.service";

export async function POST(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 403 });
    }

    const result = await branchService.importFromYandexEda();

    return NextResponse.json({
      success: true,
      message: `${result.total} ta filialdan ${result.created} tasi yangi yaratildi, ${result.updated} tasi yangilandi.`,
      result,
    });
  } catch (error: any) {
    console.error("Branch import API error:", error);
    return NextResponse.json({ error: error.message || "Import qilishda xatolik yuz berdi" }, { status: 500 });
  }
}
