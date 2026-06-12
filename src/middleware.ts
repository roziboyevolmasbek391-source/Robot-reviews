import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  const { pathname } = req.nextUrl;

  // 1. Agar foydalanuvchi tizimga kirmagan bo'lsa va login sahifasida bo'lmasa, yo'naltirish
  if (!session.isLoggedIn) {
    // API route'larni himoya qilish
    if (pathname.startsWith("/api/")) {
      // Login API'ga ruxsat beramiz
      if (pathname === "/api/auth/login") {
        return res;
      }
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    // Sahifalarni himoya qilish (login sahifasidan tashqari)
    if (pathname !== "/login") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // 2. Agar tizimga kirgan bo'lsa va login sahifasiga bormoqchi bo'lsa, dashboardga yo'naltiramiz
  if (session.isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/overview", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Quyidagi manzillardan tashqari barcha manzillarga middleware qo'llansin:
     * - _next/static (statik fayllar)
     * - _next/image (rasmlar optimizatsiyasi)
     * - favicon.ico (sayt belgisi)
     */
    "/((?!_next/static|_next/image|favicon.ico|logo.svg).*)",
  ],
};
