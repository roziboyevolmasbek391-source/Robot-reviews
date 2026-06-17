import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { destroySession } from "@/lib/security/session";

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  session.destroy();

  // Destroy Publisher session
  await destroySession();
  
  const response = NextResponse.json({ success: true });
  const cookieHeader = res.headers.get("set-cookie");
  if (cookieHeader) {
    response.headers.append("set-cookie", cookieHeader);
  }

  return response;
}
