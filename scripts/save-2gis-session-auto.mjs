import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const storageStatePath = process.env.TWOGIS_STORAGE_STATE ?? './storage/2gis.json';
const absoluteStorageStatePath = path.resolve(storageStatePath);
const maxWaitMs = Number(process.env.TWOGIS_SESSION_WAIT_MS ?? 600_000);
const startedAt = Date.now();

function isLoginUrl(url) {
  return /passport|login|auth|sso|id\.2gis/i.test(url);
}

function isCabinetUrl(url) {
  return /\/(firms|feedbacks|reviews|statistics|stats|analytics|branches|company|companies|profile)(\/|$|\?)/i.test(url);
}

async function hasCabinetText(page) {
  const text = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  return /отзывы|аналитика|статистика|филиал|компан|reviews|feedback|analytics|statistics|firms|branches|kompan|filial/i.test(text);
}

function hasAuthState(storageState) {
  const cookies = storageState.cookies ?? [];
  const origins = storageState.origins ?? [];
  const has2gisCookie = cookies.some((cookie) =>
    /2gis|dg|account/i.test(cookie.domain) &&
    /session|token|sid|spid|auth/i.test(cookie.name),
  );
  const has2gisLocalStorage = origins.some((origin) =>
    /2gis/i.test(origin.origin) && (origin.localStorage?.length ?? 0) > 0,
  );

  return has2gisCookie || has2gisLocalStorage;
}

await mkdir(path.dirname(absoluteStorageStatePath), { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  console.log('2GIS auto session saver opened.');
  console.log('Log in to 2GIS Business in the browser window. I will save the session automatically.');
  console.log(`Session file: ${absoluteStorageStatePath}`);

  await page.goto('https://account.2gis.ru', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  while (Date.now() - startedAt < maxWaitMs) {
    await page.waitForTimeout(3_000);

    const storageState = await context.storageState();
    const url = page.url();
    const loggedIn = !isLoginUrl(url) && hasAuthState(storageState) && (isCabinetUrl(url) || await hasCabinetText(page));

    console.log(`Checking 2GIS login: url=${url} cookies=${storageState.cookies.length} loggedIn=${loggedIn}`);

    if (loggedIn) {
      await writeFile(absoluteStorageStatePath, JSON.stringify(storageState, null, 2), 'utf8');
      console.log(`2GIS session saved: ${absoluteStorageStatePath}`);
      await context.close();
      await browser.close();
      process.exit(0);
    }
  }

  throw new Error('Timed out waiting for 2GIS login.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await browser.close();
  process.exit(1);
}
