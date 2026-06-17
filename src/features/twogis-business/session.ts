import { stat } from 'fs/promises';
import path from 'path';

export function getTwoGISStorageStatePath() {
  return path.resolve(process.env.TWOGIS_STORAGE_STATE ?? './storage/2gis.json');
}

export async function getTwoGISBrowserSessionStatus() {
  const storageStatePath = getTwoGISStorageStatePath();

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
