import { stat } from 'fs/promises';
import path from 'path';

export function getYandexStorageStatePath() {
  return path.resolve(process.env.YANDEX_BUSINESS_STORAGE_STATE ?? './storage-states/yandex.json');
}

export async function getYandexBrowserSessionStatus() {
  const storageStatePath = getYandexStorageStatePath();

  try {
    const file = await stat(storageStatePath);

    return {
      ready: file.isFile(),
      storageStatePath,
      updatedAt: file.mtime
    };
  } catch {
    return {
      ready: false,
      storageStatePath,
      updatedAt: null
    };
  }
}
