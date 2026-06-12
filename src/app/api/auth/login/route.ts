import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Foydalanuvchi nomi va parol kiritilishi shart" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Foydalanuvchi topilmadi yoki faolsizlantirilgan" },
        { status: 401 }
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { error: "Parol noto'g'ri" },
        { status: 401 }
      );
    }

    // Sessiya yaratish
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    session.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
    session.isLoggedIn = true;
    await session.save();

    // Sessiya cookie-sini response'ga qo'shish
    const cookieHeader = res.headers.get("set-cookie");
    const response = NextResponse.json({
      success: true,
      user: {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });

    if (cookieHeader) {
      response.headers.set("set-cookie", cookieHeader);
    }

    return response;
  } catch (error) {
    console.error("Login xatosi:", error);
    return NextResponse.json({ error: "Serverda xatolik yuz berdi" }, { status: 500 });
  }
}
