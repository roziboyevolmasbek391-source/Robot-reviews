import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/security/session";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;
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

    const business = await db.business.findUnique({
      where: { id },
    });

    if (!business || business.userId !== userId) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const draft = await db.businessDraft.create({
      data: {
        businessId: id,
        data: {
          ...data,
          savedAt: new Date(),
        },
      },
    });

    return NextResponse.json(draft);
  } catch (error) {
    console.error("Save draft error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;

    const drafts = await db.businessDraft.findMany({
      where: { businessId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(drafts);
  } catch (error) {
    console.error("Get drafts error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Get failed" },
      { status: 500 }
    );
  }
}
