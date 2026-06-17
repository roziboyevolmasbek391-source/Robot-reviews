import { AutomationProvider } from '@prisma/client';
import { z } from 'zod';

export const startAutomationSchema = z.object({
  branchId: z.string().cuid(),
  providers: z.array(z.nativeEnum(AutomationProvider)).min(1)
});

export const confirmAutomationSchema = z.object({
  runId: z.string().cuid(),
  confirmationToken: z.string().min(16)
});

export type StartAutomationInput = z.infer<typeof startAutomationSchema>;
