import { prisma } from '@/lib/db/prisma';

export async function createNotification(input: {
  userId?: string | null;
  automationRunId?: string;
  title: string;
  body: string;
}) {
  const userExists = input.userId ? await prisma.user.findUnique({ where: { id: input.userId } }) : null;
  const dbUserId = userExists ? input.userId : null;

  return prisma.notification.create({
    data: {
      userId: dbUserId,
      automationRunId: input.automationRunId,
      title: input.title,
      body: input.body
    }
  });
}

export async function listUnreadNotifications(userId: string) {
  return prisma.notification.findMany({
    where: {
      userId,
      readAt: null
    },
    orderBy: { createdAt: 'desc' }
  });
}
