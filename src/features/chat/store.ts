'use client';

import { create } from 'zustand';
import type { ChatMessage } from './schema';

type ChatState = {
  messages: ChatMessage[];
  draft: Record<string, unknown>;
  missingFields: string[];
  canCreateBranch: boolean;
  setDraftValue: (key: string, value: unknown) => void;
  pushMessage: (message: ChatMessage) => void;
  setAssistantState: (payload: {
    message: ChatMessage;
    missingFields: string[];
    canCreateBranch: boolean;
  }) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  messages: [
    {
      role: 'assistant',
      content: 'Начнем сбор данных филиала. Как называется филиал?'
    }
  ],
  draft: {},
  missingFields: [],
  canCreateBranch: false,
  setDraftValue: (key, value) =>
    set((state) => ({
      draft: {
        ...state.draft,
        [key]: value
      }
    })),
  pushMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),
  setAssistantState: (payload) =>
    set((state) => ({
      messages: [...state.messages, payload.message],
      missingFields: payload.missingFields,
      canCreateBranch: payload.canCreateBranch
    }))
}));
