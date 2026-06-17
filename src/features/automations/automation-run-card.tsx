'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { providerLabel, type AutomationProviderValue } from './provider-label';
import { submitAutomationVerificationCodeAction } from '@/server/actions/automation-actions';

type Log = {
  id: string;
  message: string;
  createdAt: string;
};

type Run = {
  id: string;
  provider: string;
  status: string;
  createdAt: string;
  branch: {
    name: string;
  };
  state: any;
  logs: Log[];
};

type AutomationRunCardProps = {
  run: Run;
};

export function AutomationRunCard({ run }: AutomationRunCardProps) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isSubmitting, startSubmitTransition] = useTransition();

  const isActive =
    run.status === 'RUNNING' ||
    run.status === 'QUEUED' ||
    run.status === 'WAITING_FOR_USER';

  // Poll for updates when active
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 2000);

    return () => clearInterval(interval);
  }, [isActive, router]);

  async function submitCode() {
    if (!code.trim() || isSubmitting) return;

    startSubmitTransition(async () => {
      try {
        await submitAutomationVerificationCodeAction({ runId: run.id, code: code.trim() });
        setCode('');
        router.refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Не удалось отправить код');
      }
    });
  }

  const badgeTone = (status: string): 'neutral' | 'success' | 'danger' | 'warning' => {
    if (status === 'COMPLETED') return 'success';
    if (status === 'FAILED') return 'danger';
    if (status === 'RUNNING' || status === 'QUEUED' || status === 'WAITING_FOR_USER') return 'warning';
    return 'neutral';
  };

  const statusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      QUEUED: 'В очереди',
      RUNNING: 'Выполняется',
      WAITING_FOR_USER: 'Ожидает кода',
      COMPLETED: 'Успешно',
      FAILED: 'Ошибка',
      CANCELLED: 'Отменено',
    };
    return labels[status] ?? status;
  };

  return (
    <Card className={`transition-all duration-300 ${run.status === 'RUNNING' ? 'border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.05)] bg-white/6' : ''}`}>
      <CardBody>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {run.status === 'RUNNING' && <Loader2 className="h-4 w-4 animate-spin text-violet-400" />}
              {run.status === 'WAITING_FOR_USER' && <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse" />}
              <p className="text-sm font-semibold text-ink">{providerLabel(run.provider as AutomationProviderValue)}</p>
            </div>
            <p className="text-xs text-muted mt-0.5">{run.branch.name}</p>
          </div>
          <Badge tone={badgeTone(run.status)}>{statusLabel(run.status)}</Badge>
        </div>

        {/* Verification Code Input */}
        {run.status === 'WAITING_FOR_USER' && (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 animate-pulse-subtle">
            <p className="text-xs text-amber-300 font-medium mb-2">
              {run.state && typeof run.state === 'object' && run.state.reason
                ? run.state.reason
                : 'Площадка ожидает ввода кода подтверждения (SMS/Звонок):'}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Введите код подтверждения"
                className="h-9 flex-1 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-all"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.trim()) {
                    submitCode();
                  }
                }}
                disabled={isSubmitting}
                autoFocus
              />
              <button
                type="button"
                onClick={submitCode}
                disabled={!code.trim() || isSubmitting}
                className="h-9 px-4 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Отправить
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-2">
          {run.logs.map((log) => (
            <div key={log.id} className="rounded-md border border-white/5 bg-white/3 px-3 py-2 text-xs text-muted flex items-start justify-between gap-4">
              <span>{log.message}</span>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                {new Date(log.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
