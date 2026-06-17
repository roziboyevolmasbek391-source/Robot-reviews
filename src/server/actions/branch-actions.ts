'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { requireSession } from '@/lib/security/session';
import { createBranch, deleteBranch, updateBranch } from '@/features/branches/branch-service';
import { branchPatchSchema, branchSchema } from '@/features/branches/schema';

export async function createBranchAction(input: unknown) {
  const session = await requireSession();
  const payload = branchSchema.parse(input);
  const branch = await createBranch(payload, session.id);

  revalidatePath('/branches');
  redirect(`/branches/${branch.id}`);
}

export async function updateBranchAction(id: string, input: unknown) {
  const session = await requireSession();
  const payload = branchPatchSchema.parse(input);
  await updateBranch(id, payload, session.id);

  revalidatePath('/branches');
  revalidatePath(`/branches/${id}`);
}

export async function deleteBranchAction(id: string) {
  const session = await requireSession([Role.ADMIN]);
  await deleteBranch(id, session.id);

  revalidatePath('/branches');
  redirect('/branches');
}
