'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { providerLabel, type AutomationProviderValue } from '../automations/provider-label';
import { submitAutomationVerificationCodeAction } from '@/server/actions/automation-actions';

type Log = {
  id: string;
  message: string;
  createdAt: string | Date;
};

type Run = {
  id: string;
  provider: string;
  status: string;
  startedAt: string | Date | null;
  createdAt: string | Date;
  state: any;
  logs: Log[];
};

type BranchPlatformsStatusProps = {
  branchId: string;
  initialRuns: any[];
};

// Estimated runtimes in seconds for progress bar estimation
const ESTIMATED_DURATIONS: Record<string, number> = {
  YANDEX_BUSINESS: 90,
  GOOGLE_BUSINESS: 60,
  TWOGIS: 45,
};

export function BranchPlatformsStatus({ branchId, initialRuns }: BranchPlatformsStatusProps) {
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [verificationCodes, setVerificationCodes] = useState<Record<string, string>>({});
  const [isSubmittingCode, setIsSubmittingCode] = useState<Record<string, boolean>>({});

  // Sync state with props when initialRuns updates from the server
  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  // 1. Check if any run is active (RUNNING, QUEUED, or WAITING_FOR_USER)
  const hasActiveRuns = runs.some(
    (run) =>
      run.status === 'RUNNING' ||
      run.status === 'QUEUED' ||
      run.status === 'WAITING_FOR_USER'
  );

  // 2. Poll for updates if there are active runs
  useEffect(() => {
    if (!hasActiveRuns) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/branches/${branchId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.automationRuns) {
            setRuns(data.automationRuns);
          }
        }
      } catch (error) {
        console.error('Failed to fetch platform status updates:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [hasActiveRuns, branchId]);

  // 3. Keep current time fresh for accurate countdowns
  useEffect(() => {
    if (!hasActiveRuns) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [hasActiveRuns]);

  // Handle verification code submission
  async function submitCode(runId: string, provider: string) {
    const code = verificationCodes[runId];
    if (!code || code.trim() === '') return;

    setIsSubmittingCode((prev) => ({ ...prev, [runId]: true }));
    try {
      await submitAutomationVerificationCodeAction({ runId, code });
      
      // Update local state temporarily to show running progress while polling starts
      setRuns((prevRuns) =>
        prevRuns.map((r) =>
          r.id === runId
            ? {
                ...r,
                status: 'RUNNING',
                logs: [
                  {
                    id: 'temp-log',
                    message: 'Код отправлен, возобновление работы...',
                    createdAt: new Date(),
                  },
                ],
              }
            : r
        )
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось отправить код');
    } finally {
      setIsSubmittingCode((prev) => ({ ...prev, [runId]: false }));
    }
  }

  // Providers list to iterate through
  const providers = ['GOOGLE_BUSINESS', 'YANDEX_BUSINESS', 'TWOGIS'] as const;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Площадки</h2>
          {hasActiveRuns && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Обновление в реальном времени...
            </span>
          )}
        </div>
      </CardHeader>
      <CardBody className="grid gap-4">
        {providers.map((provider) => {
          // Find the latest run for this provider
          const run = runs.find((r) => r.provider === provider);
          const status = run?.status ?? 'Нет запуска';
          const latestLog = run?.logs?.[0];

          // Compute progress calculations if running
          let percent = 0;
          let remainingSeconds = 0;
          if (status === 'RUNNING') {
            const est = ESTIMATED_DURATIONS[provider] || 60;
            const startTimestamp = run?.startedAt
              ? new Date(run.startedAt).getTime()
              : new Date(run?.createdAt || Date.now()).getTime();
            const elapsed = Math.max(0, Math.floor((currentTime - startTimestamp) / 1000));
            remainingSeconds = Math.max(1, est - elapsed);
            percent = Math.min(98, Math.floor((elapsed / est) * 100));
          }

          // Return render configs for each status badge/layout
          const statusConfig = getStatusConfig(status, remainingSeconds, percent);

          return (
            <div
              key={provider}
              className={`flex flex-col gap-2 rounded-xl border border-white/10 bg-white/4 p-4 backdrop-blur-sm transition-all duration-300 ${
                status === 'RUNNING' ? 'shadow-[0_0_15px_rgba(139,92,246,0.1)] border-violet-500/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusConfig.icon}
                  <span className="text-sm font-medium text-slate-200">
                    {providerLabel(provider as AutomationProviderValue)}
                  </span>
                </div>
                <Badge className={`${statusConfig.badgeColor} text-xs font-semibold px-2.5 py-0.5 border border-white/5`}>
                  {statusConfig.label}
                </Badge>
              </div>

              {/* Progress Bar & Countdown timer for RUNNING status */}
              {status === 'RUNNING' && (
                <div className="mt-2 grid gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Примерно осталось: ~{remainingSeconds} сек</span>
                    <span className="font-semibold text-violet-400">{percent}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-1000 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Verification input field for WAITING_FOR_USER status */}
              {status === 'WAITING_FOR_USER' && run && (
                <div className="mt-3 grid gap-2 border-t border-white/5 pt-3">
                  <p className="text-xs text-amber-300 font-medium">
                    {run.state && typeof run.state === 'object' && run.state.reason
                      ? run.state.reason
                      : 'Площадка ожидает ввода кода подтверждения (SMS/Звонок):'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Введите код подтверждения"
                      className="h-9 flex-1 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-all"
                      value={verificationCodes[run.id] ?? ''}
                      onChange={(e) =>
                        setVerificationCodes((prev) => ({ ...prev, [run.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && verificationCodes[run.id]) {
                          submitCode(run.id, provider);
                        }
                      }}
                      disabled={isSubmittingCode[run.id]}
                    />
                    <button
                      type="button"
                      onClick={() => submitCode(run.id, provider)}
                      disabled={!verificationCodes[run.id] || isSubmittingCode[run.id]}
                      className="h-9 px-4 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5"
                    >
                      {isSubmittingCode[run.id] && <Loader2 className="h-3 w-3 animate-spin" />}
                      Отправить
                    </button>
                  </div>
                </div>
              )}

              {/* Real-time status logs stream preview */}
              {latestLog && status !== 'Нет запуска' && (
                <div className="mt-2 border-t border-white/5 pt-2">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                    Последнее действие:
                  </p>
                  <p className="mt-0.5 text-xs text-slate-300 line-clamp-1 italic">
                    {latestLog.message}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

function getStatusConfig(status: string, remaining: number, percent: number) {
  switch (status) {
    case 'QUEUED':
      return {
        label: 'В очереди',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        icon: <Clock className="h-4 w-4 text-indigo-400 animate-pulse" />,
      };
    case 'RUNNING':
      return {
        label: `Выполняется (~${remaining}s)`,
        badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30 animate-pulse',
        icon: <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />,
      };
    case 'WAITING_FOR_USER':
      return {
        label: 'Ожидает кода',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        icon: <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse" />,
      };
    case 'COMPLETED':
      return {
        label: 'Успешно',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      };
    case 'FAILED':
      return {
        label: 'Ошибка',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        icon: <XCircle className="h-4 w-4 text-rose-400" />,
      };
    case 'CANCELLED':
      return {
        label: 'Отменено',
        badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
        icon: <XCircle className="h-4 w-4 text-slate-400" />,
      };
    default:
      return {
        label: 'Нет запуска',
        badgeColor: 'bg-white/5 text-slate-400 border-white/5',
        icon: <Clock className="h-4 w-4 text-slate-500" />,
      };
  }
}
