import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

await loadEnvFile();

const storageStatePath = process.env.YANDEX_BUSINESS_STORAGE_STATE ?? './storage-states/yandex.json';
const loginUrl =
  process.env.YANDEX_BUSINESS_LOGIN_URL ??
  process.env.YANDEX_BUSINESS_ADD_URL ??
  'https://yandex.ru/sprav/add';
const absoluteStorageStatePath = path.resolve(storageStatePath);

await mkdir(path.dirname(absoluteStorageStatePath), { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
await safeGoto(page, loginUrl, 'initial Yandex login page');

console.log('');
console.log('Yandex login browser is open.');
console.log(`Target page: ${loginUrl}`);
console.log('Log in as the admin account. The browser should land on the add organization page.');
console.log('After the page asks for the company name, return to this terminal and press Enter.');
console.log('');

const rl = createInterface({ input, output });
await rl.question('Press Enter after successful Yandex login...');
rl.close();

await safeGoto(page, process.env.YANDEX_BUSINESS_ADD_URL ?? 'https://yandex.ru/sprav/add', 'Yandex add organization page');
await context.storageState({ path: absoluteStorageStatePath });
await browser.close();

console.log(`Saved Yandex browser session to: ${absoluteStorageStatePath}`);

async function safeGoto(page, url, label) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: could not fully open ${label}. Session will still be saved.`);
    console.warn(message);
  }
}

async function loadEnvFile() {
  const envPath = path.resolve('.env');

  try {
    const content = await readFile(envPath, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        continue;
      }

      const [rawKey, ...rawValue] = trimmed.split('=');
      const key = rawKey.trim();
      const value = rawValue.join('=').trim().replace(/^["']|["']$/g, '');

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional for this helper. Environment variables still work.
  }
}
