import { stat } from 'fs/promises';
import path from 'path';

export function getGoogleStorageStatePath() {
  return path.resolve(process.env.GOOGLE_BUSINESS_STORAGE_STATE ?? './storage/google.json');
}

export async function getGoogleBrowserSessionStatus() {
  const storageStatePath = getGoogleStorageStatePath();

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
