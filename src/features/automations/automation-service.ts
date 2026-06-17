import { AutomationProvider, AutomationStatus, BranchStatus, type Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { GoogleBusinessAutomation } from './services/google-business-automation';
import { TwoGISAutomation } from './services/two-gis-automation';
import { YandexBusinessAutomation } from './services/yandex-business-automation';
import { startAutomationSchema, type StartAutomationInput } from './schema';

export async function listAutomationRuns() {
  return prisma.automationRun.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      branch: true,
      logs: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  });
}

export async function startAutomations(input: StartAutomationInput, userId?: string) {
  const payload = startAutomationSchema.parse(input);
  
  const userExists = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const dbUserId = userExists ? userId : undefined;

  const runs = await prisma.$transaction(
    payload.providers.map((provider) =>
      prisma.automationRun.create({
        data: {
          provider,
          branchId: payload.branchId,
          requestedByUserId: dbUserId,
          status: AutomationStatus.QUEUED
        }
      })
    )
  );

  await prisma.branch.update({
    where: { id: payload.branchId },
    data: { status: BranchStatus.IN_PROGRESS }
  });

  return runs;
}

export async function executeAutomationRun(runId: string) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { branch: true }
  });

  if (!run) {
    throw new Error(`Automation run ${runId} not found`);
  }

  const service = createProviderService(run.provider);
  await service.run({
    runId: run.id,
    branch: run.branch
  });
}

export async function waitForUserConfirmation(runId: string, state: unknown) {
  const confirmationToken = randomBytes(24).toString('hex');

  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: AutomationStatus.WAITING_FOR_USER,
      confirmationToken,
      state: state as Prisma.InputJsonValue
    }
  });

  return confirmationToken;
}

export async function confirmAutomation(runId: string, confirmationToken: string) {
  const run = await prisma.automationRun.findUnique({ where: { id: runId } });

  if (!run || run.confirmationToken !== confirmationToken) {
    throw new Error('Invalid confirmation token');
  }

  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: AutomationStatus.QUEUED,
      confirmationToken: null
    }
  });

  await executeAutomationRun(runId);
}

function createProviderService(provider: AutomationProvider) {
  switch (provider) {
    case AutomationProvider.GOOGLE_BUSINESS:
      return new GoogleBusinessAutomation();
    case AutomationProvider.YANDEX_BUSINESS:
      return new YandexBusinessAutomation();
    case AutomationProvider.TWOGIS:
      return new TwoGISAutomation();
  }
}
