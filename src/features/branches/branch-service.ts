import { BranchStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { branchPatchSchema, branchSchema, type BranchInput, type BranchPatchInput } from './schema';

export async function listBranches() {
  return prisma.branch.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      automationRuns: {
        orderBy: { createdAt: 'desc' },
        take: 3
      }
    }
  });
}

export async function getBranch(id: string) {
  return prisma.branch.findUnique({
    where: { id },
    include: {
      history: {
        orderBy: { createdAt: 'desc' },
        include: { user: true }
      },
      automationRuns: {
        orderBy: { createdAt: 'desc' },
        include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } }
      }
    }
  });
}

export async function createBranch(input: BranchInput, userId?: string) {
  const data = branchSchema.parse(input);
  
  const userExists = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const dbUserId = userExists ? userId : undefined;

  const branch = await prisma.branch.create({
    data: {
      ...data,
      socialLinks: data.socialLinks as any,
      additionalData: data.additionalData as any,
      status: data.status ?? BranchStatus.DRAFT,
      logo: data.logo || null,
      history: {
        create: {
          userId: dbUserId,
          action: 'BRANCH_CREATED',
          payload: toJsonPayload(data)
        }
      }
    }
  });

  return branch;
}

export async function updateBranch(id: string, input: BranchPatchInput, userId?: string) {
  const data = branchPatchSchema.parse(input);

  const userExists = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const dbUserId = userExists ? userId : undefined;

  return prisma.branch.update({
    where: { id },
    data: {
      ...data,
      socialLinks: data.socialLinks as any,
      additionalData: data.additionalData as any,
      logo: data.logo === '' ? null : data.logo,
      history: {
        create: {
          userId: dbUserId,
          action: 'BRANCH_UPDATED',
          payload: toJsonPayload(data)
        }
      }
    }
  });
}

function toJsonPayload(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function deleteBranch(id: string, userId?: string) {
  const userExists = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const dbUserId = userExists ? userId : undefined;

  await prisma.branchHistory.create({
    data: {
      branchId: id,
      userId: dbUserId,
      action: 'BRANCH_DELETED',
      payload: { id }
    }
  });

  return prisma.branch.delete({ where: { id } });
}

export async function branchStats() {
  const [total, ready, inProgress, failed] = await Promise.all([
    prisma.branch.count(),
    prisma.branch.count({ where: { status: BranchStatus.READY } }),
    prisma.branch.count({ where: { status: BranchStatus.IN_PROGRESS } }),
    prisma.branch.count({ where: { status: BranchStatus.FAILED } })
  ]);

  return { total, ready, inProgress, failed };
}
