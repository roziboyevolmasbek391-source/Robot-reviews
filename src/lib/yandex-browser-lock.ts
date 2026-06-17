type YandexBrowserLockState = {
  owner: string;
  startedAt: number;
};

const LOCK_KEY = "__robot_otziv_yandex_browser_lock__";
const MAX_LOCK_AGE_MS = 30 * 60 * 1000;

type GlobalWithYandexLock = typeof globalThis & {
  [LOCK_KEY]?: YandexBrowserLockState;
};

function state() {
  return globalThis as GlobalWithYandexLock;
}

export function getYandexBrowserLock(): YandexBrowserLockState | null {
  const lock = state()[LOCK_KEY];

  if (!lock) {
    return null;
  }

  if (Date.now() - lock.startedAt > MAX_LOCK_AGE_MS) {
    delete state()[LOCK_KEY];
    return null;
  }

  return lock;
}

export function isYandexBrowserBusy() {
  return Boolean(getYandexBrowserLock());
}

export function tryAcquireYandexBrowserLock(owner: string): (() => void) | null {
  const globalState = state();

  if (globalState[LOCK_KEY]) {
    return null;
  }

  const lock: YandexBrowserLockState = {
    owner,
    startedAt: Date.now(),
  };

  globalState[LOCK_KEY] = lock;

  return () => {
    if (globalState[LOCK_KEY] === lock) {
      delete globalState[LOCK_KEY];
    }
  };
}
