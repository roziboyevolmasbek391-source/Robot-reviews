import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  session.destroy();
  
  const response = NextResponse.json({ success: true });
  const cookieHeader = res.headers.get("set-cookie");
  if (cookieHeader) {
    response.headers.set("set-cookie", cookieHeader);
  }

  return response;
}
