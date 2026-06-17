import { z } from 'zod';
import { branchSchema, requiredBranchFields } from '@/features/branches/schema';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1)
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  draft: z.record(z.string(), z.unknown()).default({})
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export function getMissingRequiredFields(draft: Record<string, unknown>) {
  const missing = requiredBranchFields.filter((field) => {
    const value = draft[field];
    return value === undefined || value === null || value === '';
  });

  const validation = branchSchema.safeParse({
    ...draft,
    photos: Array.isArray(draft.photos) ? draft.photos : [],
    workingHours: Array.isArray(draft.workingHours) ? draft.workingHours : []
  });

  if (!validation.success) {
    const invalid = validation.error.issues.map((issue) => String(issue.path[0])).filter(Boolean);
    return Array.from(new Set([...missing, ...invalid]));
  }

  return missing;
}
