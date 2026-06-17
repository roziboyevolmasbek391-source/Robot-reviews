import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const session = await getSession();
    let userId = session?.id;
    if (!userId) {
      const fallbackUser = await db.user.findFirst();
      userId = fallbackUser?.id;
    }
    if (!userId) {
      return NextResponse.json({ error: "No users found in the database" }, { status: 500 });
    }

    const business = await db.business.create({
      data: {
        userId,
        ...data,
      },
    });

    return NextResponse.json(business);
  } catch (error) {
    console.error("Create business error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 500 }
    );
  }
}

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

    const businesses = await db.business.findMany({
      where: { userId },
      include: {
        drafts: true,
        publishJobs: true,
      },
    });

    return NextResponse.json(businesses);
  } catch (error) {
    console.error("Get businesses error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Get failed" },
      { status: 500 }
    );
  }
}
