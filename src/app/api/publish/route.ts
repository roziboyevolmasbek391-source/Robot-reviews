import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PublishJobStatus } from "@prisma/client";
import { enqueuePublishJob } from "@/lib/jobs/publish";
import { getSession } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await request.json();
    
    const session = await getSession();
    let userId = session?.id;
    if (!userId) {
      const fallbackUser = await db.user.findFirst();
      userId = fallbackUser?.id;
    }
    if (!userId) {
      return NextResponse.json({ error: "No users found in the database" }, { status: 500 });
    }

    // Get business
    const business = await db.business.findUnique({
      where: { id: businessId },
    });

    if (!business || business.userId !== userId) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Validate business data
    if (!business.name || !business.category) {
      return NextResponse.json(
        { error: "Business information incomplete" },
        { status: 400 }
      );
    }

    // Create publish job
    const job = await db.publishJob.create({
      data: {
        businessId,
        status: PublishJobStatus.PENDING,
      },
    });

    // Enqueue publish job
    await enqueuePublishJob({
      jobId: job.id,
      businessId,
      userId,
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Publish error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publish failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const job = await db.publishJob.findUnique({
      where: { id: jobId },
      include: {
        attempts: true,
        steps: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("Get job error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Get job failed" },
      { status: 500 }
    );
  }
}
