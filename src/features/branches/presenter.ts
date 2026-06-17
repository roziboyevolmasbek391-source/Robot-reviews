import type { Branch } from '@prisma/client';

export function formatBranchCoordinates(branch: Pick<Branch, 'latitude' | 'longitude'>) {
  return `${Number(branch.latitude).toFixed(6)}, ${Number(branch.longitude).toFixed(6)}`;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Черновик',
    READY: 'Готов',
    IN_PROGRESS: 'В работе',
    NEEDS_CONFIRMATION: 'Нужно подтверждение',
    PUBLISHED: 'Опубликован',
    FAILED: 'Ошибка'
  };

  return labels[status] ?? status;
}
