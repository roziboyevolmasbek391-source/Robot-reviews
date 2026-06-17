'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteBranchAction } from '@/server/actions/branch-actions';

export function DeleteBranchButton({ branchId }: { branchId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm('Удалить филиал?')) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteBranchAction(branchId);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить филиал');
      }
    });
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="destructive" onClick={remove} disabled={isPending}>
        <Trash2 className="h-4 w-4" />
        Удалить
      </Button>
      {error ? <p className="text-xs text-danger-600">{error}</p> : null}
    </div>
  );
}
