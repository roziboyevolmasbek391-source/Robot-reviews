'use client';

import { useState, useTransition } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { createBranchAction } from '@/server/actions/branch-actions';
import { defaultWorkingHours } from '@/features/branches/schema';
import { useChatStore } from './store';

export function ChatPanel() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { messages, draft, missingFields, canCreateBranch, pushMessage, setAssistantState, setDraftValue } =
    useChatStore();

  function sendMessage() {
    if (!text.trim()) {
      return;
    }

    const userMessage = { role: 'user' as const, content: text.trim() };
    pushMessage(userMessage);
    setText('');
    setError(null);

    startTransition(async () => {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage], draft })
      });
      const payload = (await response.json()) as {
        content?: string;
        draftPatch?: Record<string, unknown>;
        missingFields?: string[];
        canCreateBranch?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? 'Ошибка AI-чата');
        return;
      }

      for (const [key, value] of Object.entries(payload.draftPatch ?? {})) {
        setDraftValue(key, value);
      }

      setAssistantState({
        message: { role: 'assistant', content: payload.content ?? 'Уточните данные филиала.' },
        missingFields: payload.missingFields ?? [],
        canCreateBranch: Boolean(payload.canCreateBranch)
      });
    });
  }

  function createFromDraft() {
    startTransition(async () => {
      try {
        await createBranchAction({
          ...draft,
          workingHours: Array.isArray(draft.workingHours) ? draft.workingHours : defaultWorkingHours,
          photos: Array.isArray(draft.photos) ? draft.photos : []
        });
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : 'Не удалось создать филиал');
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border border-white/10 bg-white/4 backdrop-blur-sm">
        <div className="border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-violet-400" />
            AI-чат
          </div>
        </div>
        <div className="grid max-h-[540px] gap-3 overflow-y-auto px-5 py-4">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'assistant'
                  ? 'max-w-2xl rounded-md bg-white/6 border border-white/8 px-4 py-3 text-sm text-slate-200'
                  : 'ml-auto max-w-2xl rounded-md bg-violet-600/80 backdrop-blur-sm px-4 py-3 text-sm text-white'
              }
            >
              {message.content}
            </div>
          ))}
        </div>
        <div className="border-t border-white/8 p-4">
          <div className="flex gap-2">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Например: название: Филиал Самарканд"
              className="min-h-16"
            />
            <Button type="button" onClick={sendMessage} disabled={isPending} aria-label="Отправить сообщение">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {error ? <p className="mt-2 text-sm text-danger-600">{error}</p> : null}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/4 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-ink">Черновик филиала</h2>
        <div className="mt-4 grid gap-3">
          {['name', 'category', 'address', 'latitude', 'longitude', 'phone', 'email', 'website'].map((key) => (
            <label key={key} className="grid gap-1 text-xs font-medium text-muted">
              {key}
              <Input
                value={String(draft[key] ?? '')}
                onChange={(event) => setDraftValue(key, event.target.value)}
              />
            </label>
          ))}
          <label className="grid gap-1 text-xs font-medium text-muted">
            description
            <Textarea
              value={String(draft.description ?? '')}
              onChange={(event) => setDraftValue('description', event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 rounded-md bg-white/5 border border-white/8 p-3 text-xs text-slate-400">
          Не хватает: {missingFields.length ? missingFields.join(', ') : 'нет'}
        </div>
        <Button className="mt-4 w-full" type="button" onClick={createFromDraft} disabled={!canCreateBranch || isPending}>
          Создать филиал
        </Button>
      </div>
    </div>
  );
}
