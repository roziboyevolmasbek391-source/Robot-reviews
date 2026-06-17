import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProviderAdapter } from "@/lib/providers/factory";
import { getSession } from "@/lib/security/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    let userId = session?.id;
    if (!userId) {
      const fallbackUser = await db.user.findFirst();
      userId = fallbackUser?.id;
    }
    if (!userId) {
      return NextResponse.json({ error: "No users found in the database" }, { status: 500 });
    }

    const sessions = await db.providerSession.findMany({
      where: { userId },
    });

    const statusList = await Promise.all(
      sessions.map(async (session) => {
        try {
          const adapter = getProviderAdapter(session.provider);
          const authState = {
            accessToken: session.accessToken || undefined,
            refreshToken: session.refreshToken || undefined,
            tokenExpiresAt: session.tokenExpiresAt || undefined,
          };

          const status = await adapter.getStatus(authState);

          return {
            id: session.id,
            provider: session.provider,
            status: session.status,
            lastSuccessfulLogin: session.lastSuccessfulLogin,
            lastValidationAt: session.lastValidationAt,
            lastPublishAt: session.lastPublishAt,
            ...status,
          };
        } catch (error) {
          return {
            id: session.id,
            provider: session.provider,
            status: "ERROR",
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    return NextResponse.json(statusList);
  } catch (error) {
    console.error("Get provider status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Get status failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");
    
    const session = await getSession();
    let userId = session?.id;
    if (!userId) {
      const fallbackUser = await db.user.findFirst();
      userId = fallbackUser?.id;
    }
    if (!userId) {
      return NextResponse.json({ error: "No users found in the database" }, { status: 500 });
    }

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const providerSession = await db.providerSession.findUnique({
      where: { id: sessionId },
    });

    if (!providerSession || providerSession.userId !== userId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await db.providerSession.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete provider error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
