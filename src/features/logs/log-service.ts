import { LogLevel, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export async function listAutomationLogs(limit = 100) {
  return prisma.automationLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      automationRun: {
        include: { branch: true }
      }
    }
  });
}

export async function createAutomationLog(input: {
  automationRunId: string;
  level?: LogLevel;
  message: string;
  metadata?: Prisma.InputJsonValue;
  screenshotPath?: string;
}) {
  return prisma.automationLog.create({
    data: {
      automationRunId: input.automationRunId,
      level: input.level ?? LogLevel.INFO,
      message: input.message,
      metadata: input.metadata,
      screenshotPath: input.screenshotPath
    }
  });
}
