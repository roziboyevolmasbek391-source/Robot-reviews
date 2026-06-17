import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

await loadEnvFile();

const storageStatePath = process.env.TWOGIS_STORAGE_STATE ?? './storage/2gis.json';
const loginUrl = 'https://account.2gis.ru/';
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
await safeGoto(page, loginUrl, '2GIS Account login page');

console.log('');
console.log('2GIS login browser is open.');
console.log(`Target page: ${loginUrl}`);
console.log('Log in to your 2GIS Partner account. Make sure you can see your business list.');
console.log('After logging in successfully, return to this terminal and press Enter.');
console.log('');

const rl = createInterface({ input, output });
await rl.question('Press Enter after successful 2GIS login...');
rl.close();

await context.storageState({ path: absoluteStorageStatePath });
await browser.close();

console.log(`Saved 2GIS browser session to: ${absoluteStorageStatePath}`);

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
