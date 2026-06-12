import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    return NextResponse.json({
      user: session.user
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
