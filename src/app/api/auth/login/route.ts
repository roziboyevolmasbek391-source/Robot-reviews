import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { createSession } from "@/lib/security/session";

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
    },
  });
}

function errorResponse(req: NextRequest, message: string, status: number, isJsonRequest: boolean) {
  if (isJsonRequest) {
    return NextResponse.json({ error: message }, { status });
  }

  return redirectTo(`/login?error=${encodeURIComponent(message)}`);
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isJsonRequest = contentType.includes("application/json");
    const payload = isJsonRequest
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries());

    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!username || !password) {
      return errorResponse(req, "Введите имя пользователя и пароль", 400, isJsonRequest);
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      return errorResponse(req, "Пользователь не найден или отключен", 401, isJsonRequest);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return errorResponse(req, "Неверный пароль", 401, isJsonRequest);
    }

    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    session.user = {
      id: user.id,
      username: user.username || "",
      fullName: user.fullName || "User",
      role: user.role,
    };
    session.isLoggedIn = true;
    await session.save();

    await createSession({
      id: user.id,
      email: user.email || "",
      name: user.name || user.fullName || user.username || "User",
      role: user.role,
    });

    const cookieHeader = res.headers.get("set-cookie");
    const response = isJsonRequest
      ? NextResponse.json({
          success: true,
          user: {
            username: user.username || "",
            fullName: user.fullName,
            role: user.role,
          },
        })
      : redirectTo("/dashboard");

    if (cookieHeader) {
      response.headers.append("set-cookie", cookieHeader);
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "На сервере произошла ошибка" }, { status: 500 });
  }
}
