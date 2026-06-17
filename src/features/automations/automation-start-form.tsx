'use client';

import { useState, useTransition } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startAutomationAction } from '@/server/actions/automation-actions';
import {
  automationProviders,
  providerLabel,
  type AutomationProviderValue
} from './provider-label';

type BranchOption = {
  id: string;
  name: string;
};

export function AutomationStartForm({ branches }: { branches: BranchOption[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [providers, setProviders] = useState<AutomationProviderValue[]>(['YANDEX_BUSINESS']);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleProvider(provider: AutomationProviderValue) {
    setProviders((current) =>
      current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]
    );
  }

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        await startAutomationAction({ branchId, providers });
      } catch (startError) {
        setError(startError instanceof Error ? startError.message : 'Не удалось запустить автоматизацию');
      }
    });
  }

  return (
    <div className="grid gap-4 rounded-xl border border-white/10 bg-white/4 p-4 backdrop-blur-sm">
      {branches.length === 0 ? (
        <div className="rounded-md border border-white/10 bg-white/4 p-3 text-sm text-slate-400">
          Сначала создайте хотя бы один филиал, потом здесь можно будет запускать автоматизацию.
        </div>
      ) : null}
      <select
        className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
        value={branchId}
        onChange={(event) => setBranchId(event.target.value)}
        disabled={branches.length === 0}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <div className="grid gap-2 sm:grid-cols-3">
        {automationProviders.map((provider) => (
          <label key={provider} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/4 p-3 text-sm text-slate-300 hover:border-violet-400/30 hover:bg-white/8 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={providers.includes(provider)}
              onChange={() => toggleProvider(provider)}
            />
            {providerLabel(provider)}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
      <Button type="button" onClick={start} disabled={!branchId || providers.length === 0 || isPending}>
        <Play className="h-4 w-4" />
        Запустить
      </Button>
    </div>
  );
}
