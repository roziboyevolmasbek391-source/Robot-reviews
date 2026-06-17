import type { Branch } from '@prisma/client';

export type AutomationContext = {
  runId: string;
  branch: Branch;
};

export type AutomationStep = {
  name: string;
  selector?: string;
  required?: boolean;
};
