'use client';

import { useEffect, useState, useTransition } from 'react';
import { ExternalLink, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClassName } from '@/components/ui/button';

type YandexStatus = {
  connected: boolean;
  scope: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
};

type YandexSessionStatus = {
  ready: boolean;
  storageStatePath: string;
  updatedAt: string | null;
};

type YandexBusinessProfile = {
  Id: number;
  Name?: string;
  Address?: string;
  IsPublished?: 'YES' | 'NO';
};

export function YandexIntegrationPanel() {
  const [status, setStatus] = useState<YandexStatus | null>(null);
  const [sessionStatus, setSessionStatus] = useState<YandexSessionStatus | null>(null);
  const [businesses, setBusinesses] = useState<YandexBusinessProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void loadStatus();
    void loadSessionStatus();
  }, []);

  async function loadStatus() {
    setError(null);
    const response = await fetch('/api/integrations/yandex/status');
    const payload = (await response.json()) as YandexStatus & { error?: string };

    if (!response.ok) {
      setError(payload.error ?? 'Не удалось проверить подключение Яндекса');
      return;
    }

    setStatus(payload);
  }

  async function loadSessionStatus() {
    const response = await fetch('/api/integrations/yandex/session-status');
    const payload = (await response.json()) as YandexSessionStatus & { error?: string };

    if (!response.ok) {
      setError(payload.error ?? 'Не удалось проверить браузерную сессию Яндекса');
      return;
    }

    setSessionStatus(payload);
  }

  function loadBusinesses() {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/integrations/yandex/business-profiles');
      const payload = (await response.json()) as {
        businesses?: YandexBusinessProfile[];
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? 'Не удалось получить организации Яндекса');
        return;
      }

      setBusinesses(payload.businesses ?? []);
    });
  }

  return (
    <div className="grid gap-4 rounded-xl border border-white/10 bg-white/4 p-4 backdrop-blur-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Яндекс Бизнес</h2>
          <p className="mt-1 text-sm text-slate-400">
            Browser session используется роботом для добавления компаний, OAuth - только для официальных API-запросов.
          </p>
        </div>
        <Badge tone={sessionStatus?.ready ? 'success' : 'warning'}>
          {sessionStatus?.ready ? 'Сессия готова' : 'Нужен логин'}
        </Badge>
      </div>

      <div className="rounded-md border border-white/8 bg-white/5 p-3 text-sm text-slate-300">
        Для автоматического добавления компаний запустите локально <code>npm run yandex:login</code>, войдите в Яндекс
        как админ и нажмите Enter в терминале. После этого Playwright сохранит session state, и робот сможет работать без
        повторного логина.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={loadSessionStatus}>
          <RefreshCcw className="h-4 w-4" />
          Проверить сессию
        </Button>
        <a className={buttonClassName()} href="/api/integrations/yandex/connect">
          <ExternalLink className="h-4 w-4" />
          OAuth Яндекс
        </a>
        <Button type="button" variant="secondary" onClick={loadBusinesses} disabled={!status?.connected || isPending}>
          <RefreshCcw className="h-4 w-4" />
          Получить организации
        </Button>
      </div>

      {sessionStatus?.storageStatePath ? (
        <p className="text-xs text-muted">Session file: {sessionStatus.storageStatePath}</p>
      ) : null}
      {sessionStatus?.updatedAt ? (
        <p className="text-xs text-muted">
          Browser session updated: {new Date(sessionStatus.updatedAt).toLocaleString('ru-RU')}
        </p>
      ) : null}
      {status?.updatedAt ? (
        <p className="text-xs text-muted">Последнее обновление: {new Date(status.updatedAt).toLocaleString('ru-RU')}</p>
      ) : null}
      {status?.scope ? <p className="text-xs text-muted">Scope: {status.scope}</p> : null}
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}

      {businesses.length > 0 ? (
        <div className="grid gap-2">
          {businesses.map((business) => (
            <div key={business.Id} className="rounded-md border border-white/8 bg-white/4 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-200">{business.Name ?? `ID ${business.Id}`}</p>
                <Badge tone={business.IsPublished === 'YES' ? 'success' : 'warning'}>
                  {business.IsPublished === 'YES' ? 'Опубликовано' : 'Не опубликовано'}
                </Badge>
              </div>
              {business.Address ? <p className="mt-1 text-xs text-muted">{business.Address}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
