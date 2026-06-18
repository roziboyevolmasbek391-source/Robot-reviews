import { NextRequest, NextResponse } from 'next/server';
import { AutomationProvider, AutomationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/security/session';

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/verification/[id]
 *
 * Submit a verification code (e.g. SMS, phone call) for a running automation.
 * This triggers the provider-specific verification resumption flow that
 * re-opens the browser, enters the code, and completes the publish.
 */
export async function POST(request: NextRequest, props: Params) {
  try {
    const session = await requireSession();
    const { id } = await props.params;
    const { code } = (await request.json()) as { code?: string };

    if (!code) {
      return NextResponse.json({ error: 'Verification code required' }, { status: 400 });
    }

    // ── Find the verification request ──
    const verificationRequest = await db.verificationRequest.findUnique({
      where: { id },
    });

    if (!verificationRequest) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
    }

    // ── Find the corresponding automation run ──
    // The jobId in VerificationRequest links to PublishJob, but the actual
    // browser automation state lives in AutomationRun. Try to find the
    // automation run that is WAITING_FOR_USER for this provider.
    const automationRun = await db.automationRun.findFirst({
      where: {
        status: AutomationStatus.WAITING_FOR_USER,
        provider: verificationRequest.provider,
      },
      orderBy: { createdAt: 'desc' },
      include: { branch: true },
    });

    if (!automationRun) {
      // Fallback: try old path through publishJob
      const publishJob = await db.publishJob.findUnique({
        where: { id: verificationRequest.jobId },
        include: { business: true },
      });

      if (!publishJob) {
        return NextResponse.json({ error: 'No pending automation found' }, { status: 404 });
      }

      // Update verification request with the code (for audit)
      await db.verificationRequest.update({
        where: { id },
        data: { status: 'SUBMITTED', code },
      });

      return NextResponse.json({
        success: false,
        message: 'No browser automation is waiting for verification. The code has been recorded.',
      });
    }

    // ── Trigger provider-specific verification resumption ──
    let success = false;

    switch (verificationRequest.provider) {
      case AutomationProvider.YANDEX_BUSINESS: {
        const { YandexBusinessAutomation } = await import(
          '@/features/automations/services/yandex-business-automation'
        );
        const yandex = new YandexBusinessAutomation();
        // This will re-open the browser, enter the code, and complete
        void yandex.resumeAfterVerification(automationRun.id, code);
        success = true;
        break;
      }
      default: {
        // For other providers, just record the code for now
        await db.automationRun.update({
          where: { id: automationRun.id },
          data: {
            status: AutomationStatus.QUEUED,
            state: { verificationCode: code },
          },
        });
        success = true;
      }
    }

    // ── Update verification request ──
    await db.verificationRequest.update({
      where: { id },
      data: {
        status: success ? 'SUBMITTED' : 'FAILED',
        code,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      success,
      message: success
        ? 'Verification code submitted. Automation is resuming.'
        : 'Failed to submit verification code.',
    });
  } catch (error) {
    console.error('Submit verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/verification/[id]?jobId=xxx
 *
 * List verification requests for a given publish job.
 */
export async function GET(request: NextRequest) {
  try {
    await requireSession();

    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const verifications = await db.verificationRequest.findMany({
      where: { jobId },
      orderBy: { requestedAt: 'desc' },
    });

    return NextResponse.json(verifications);
  } catch (error) {
    console.error('Get verifications error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Get failed' },
      { status: 500 },
    );
  }
}
