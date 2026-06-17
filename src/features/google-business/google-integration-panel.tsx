'use client';

import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type GoogleSessionStatus = {
  ready: boolean;
  storageStatePath: string;
  updatedAt: string | null;
};

export function GoogleIntegrationPanel() {
  const [sessionStatus, setSessionStatus] = useState<GoogleSessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void loadSessionStatus();
  }, []);

  async function loadSessionStatus() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/google/session-status');
      const payload = (await response.json()) as GoogleSessionStatus & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? 'Не удалось проверить браузерную сессию Google Maps');
        return;
      }

      setSessionStatus(payload);
    } catch {
      setError('Ошибка подключения к серверу');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-xl border border-white/10 bg-white/4 p-4 backdrop-blur-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Google Maps Бизнес</h2>
          <p className="mt-1 text-sm text-slate-400">
            Browser session используется роботом для добавления компаний на карты Google Maps.
          </p>
        </div>
        <Badge tone={sessionStatus?.ready ? 'success' : 'warning'}>
          {sessionStatus?.ready ? 'Сессия готова' : 'Нужен логин'}
        </Badge>
      </div>

      <div className="rounded-md border border-white/8 bg-white/5 p-3 text-sm text-slate-300">
        Для автоматического добавления компаний запустите локально <code>npm run google:login</code>, войдите в Google Account
        и нажмите Enter в терминале. Playwright сохранит session state, и робот сможет работать без повторного логина.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={loadSessionStatus} disabled={isLoading}>
          <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Проверить сессию
        </Button>
      </div>

      {sessionStatus?.storageStatePath ? (
        <p className="text-xs text-muted font-mono">Session file: {sessionStatus.storageStatePath}</p>
      ) : null}
      {sessionStatus?.updatedAt ? (
        <p className="text-xs text-muted">
          Browser session updated: {new Date(sessionStatus.updatedAt).toLocaleString('ru-RU')}
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
    </div>
  );
}
