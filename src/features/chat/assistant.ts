import { getOpenAIClient, openAIModel } from '@/lib/openai/client';
import { getMissingRequiredFields, type ChatMessage } from './schema';

const fieldPrompts: Record<string, string> = {
  name: 'Как называется филиал?',
  category: 'Какая основная категория бизнеса у филиала?',
  address: 'Укажите полный адрес филиала.',
  latitude: 'Какая широта филиала?',
  longitude: 'Какая долгота филиала?',
  phone: 'Какой телефон нужно указать в карточках?',
  email: 'Какой email использовать для филиала?',
  website: 'Укажите сайт филиала в формате URL.',
  description: 'Дайте описание компании для публикации, минимум 20 символов.',
  workingHours: 'Какой график работы по дням недели?',
  photos: 'Добавьте пути или URL фотографий, если они уже есть.',
  logo: 'Добавьте путь или URL логотипа, если он уже есть.',
  socialLinks: 'Какие социальные сети нужно указать?',
  additionalData: 'Есть ли дополнительные данные для площадок?'
};

export async function getAssistantReply(messages: ChatMessage[], draft: Record<string, unknown>) {
  const deterministicPatch = extractDeterministicPatch(messages.at(-1)?.content ?? '');
  const mergedDraft = { ...draft, ...deterministicPatch };
  const missingFields = getMissingRequiredFields(mergedDraft);
  const nextField = missingFields[0];

  if (!process.env.OPENAI_API_KEY) {
    return { ...deterministicReply(missingFields), draftPatch: deterministicPatch };
  }

  const client = getOpenAIClient();

  if (!client) {
    return { ...deterministicReply(missingFields), draftPatch: deterministicPatch };
  }

  const response = await client.chat.completions.create({
    model: openAIModel,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Ты внутренний AI-ассистент компании. Собирай данные филиала для Google Business Profile, Яндекс Бизнес и 2ГИС. Не завершай диалог, пока обязательные поля не валидны. Верни строго JSON: {"content":"ответ пользователю","draftPatch":{...}}. draftPatch содержит только явно названные пользователем поля.'
      },
      {
        role: 'system',
        content: `Текущий черновик JSON: ${JSON.stringify(mergedDraft)}. Не хватает или невалидны поля: ${missingFields.join(', ') || 'нет'}. Следующий вопрос должен быть про: ${nextField ?? 'финальное подтверждение'}.`
      },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ]
  });

  const raw = response.choices[0]?.message.content;
  const parsed = parseModelJson(raw);
  const draftPatch = { ...deterministicPatch, ...parsed.draftPatch };
  const finalDraft = { ...draft, ...draftPatch };
  const finalMissingFields = getMissingRequiredFields(finalDraft);
  const content = parsed.content ?? fieldPrompts[finalMissingFields[0] ?? ''];

  return {
    content: content ?? 'Все обязательные поля собраны. Можно создать филиал.',
    draftPatch,
    missingFields: finalMissingFields,
    canCreateBranch: finalMissingFields.length === 0
  };
}

function deterministicReply(missingFields: string[]) {
  const nextField = missingFields[0];

  if (!nextField) {
    return {
      content: 'Все обязательные поля собраны. Проверьте данные и создайте филиал.',
      missingFields,
      canCreateBranch: true
    };
  }

  return {
    content: fieldPrompts[nextField] ?? `Уточните поле: ${nextField}`,
    missingFields,
    canCreateBranch: false
  };
}

function parseModelJson(raw: string | null | undefined) {
  if (!raw) {
    return { content: undefined, draftPatch: {} as Record<string, unknown> };
  }

  try {
    const parsed = JSON.parse(raw) as { content?: string; draftPatch?: Record<string, unknown> };
    return {
      content: parsed.content,
      draftPatch: parsed.draftPatch ?? {}
    };
  } catch {
    return { content: raw, draftPatch: {} as Record<string, unknown> };
  }
}

function extractDeterministicPatch(text: string) {
  const aliases: Record<string, string> = {
    название: 'name',
    филиал: 'name',
    категория: 'category',
    адрес: 'address',
    широта: 'latitude',
    долгота: 'longitude',
    телефон: 'phone',
    email: 'email',
    сайт: 'website',
    описание: 'description',
    логотип: 'logo',
    фото: 'photos',
    фотографии: 'photos'
  };
  const patch: Record<string, unknown> = {};

  for (const line of text.split('\n')) {
    const [rawKey, ...rest] = line.split(':');
    const key = aliases[rawKey?.trim().toLowerCase()];
    const value = rest.join(':').trim();

    if (!key || !value) {
      continue;
    }

    if (key === 'latitude' || key === 'longitude') {
      patch[key] = Number(value.replace(',', '.'));
    } else if (key === 'photos') {
      patch[key] = value.split(',').map((item) => item.trim());
    } else {
      patch[key] = value;
    }
  }

  return patch;
}
