'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/security/session';
import {
  confirmAutomation,
  executeAutomationRun,
  startAutomations
} from '@/features/automations/automation-service';
import {
  confirmAutomationSchema,
  startAutomationSchema
} from '@/features/automations/schema';

export async function startAutomationAction(input: unknown) {
  const session = await requireSession();
  const payload = startAutomationSchema.parse(input);
  const runs = await startAutomations(payload, session.id);

  void (async () => {
    for (const run of runs) {
      try {
        await executeAutomationRun(run.id);
      } catch (error) {
        console.error(`[Automation] Run ${run.id} failed:`, error);
      }
    }
  })();

  revalidatePath('/automations');
  revalidatePath(`/branches/${payload.branchId}`);
}

export async function confirmAutomationAction(input: unknown) {
  await requireSession();
  const payload = confirmAutomationSchema.parse(input);
  await confirmAutomation(payload.runId, payload.confirmationToken);

  revalidatePath('/automations');
}

import { YandexBusinessAutomation } from '@/features/automations/services/yandex-business-automation';
import { prisma } from '@/lib/db/prisma';
import { AutomationStatus, AutomationProvider } from '@prisma/client';

export async function submitAutomationVerificationCodeAction(input: { runId: string; code: string }) {
  await requireSession();
  const { runId, code } = input;

  if (!code || code.trim() === '') {
    throw new Error('Код подтверждения обязателен');
  }

  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { branch: true }
  });

  if (!run) {
    throw new Error('Запуск автоматизации не найден');
  }

  if (run.status !== AutomationStatus.WAITING_FOR_USER) {
    throw new Error('Этот запуск не ожидает ввода кода');
  }

  // 1. Update status to RUNNING in database first
  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: AutomationStatus.RUNNING,
      state: { reason: "Ввод кода подтверждения...", verificationCode: code }
    }
  });

  // 2. Trigger provider resumption
  if (run.provider === AutomationProvider.YANDEX_BUSINESS) {
    // For Yandex, the open browser page is polling the database for verificationCode.
    // We updated the database, so the background process will pick it up automatically.
    // No need to spawn a new browser context.
  } else {
    // For other providers, set status back to QUEUED so execution reads code from state
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationStatus.QUEUED
      }
    });
    void executeAutomationRun(runId);
  }

  revalidatePath('/automations');
  revalidatePath(`/branches/${run.branchId}`);
}

