import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

await loadEnvFile();

const storageStatePath = process.env.GOOGLE_BUSINESS_STORAGE_STATE ?? './storage/google.json';
const loginUrl = 'https://business.google.com/';
const absoluteStorageStatePath = path.resolve(storageStatePath);

await mkdir(path.dirname(absoluteStorageStatePath), { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
  args: ['--disable-blink-features=AutomationControlled']
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
});

// Disable webdriver detection
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined
  });
});

const page = await context.newPage();
await safeGoto(page, loginUrl, 'Google Business Profile login page');

console.log('');
console.log('Google Maps login browser is open.');
console.log(`Target page: ${loginUrl}`);
console.log('Log in to your Google Account. Make sure you can see your business cabinet.');
console.log('After logging in successfully, return to this terminal and press Enter.');
console.log('');

const rl = createInterface({ input, output });
await rl.question('Press Enter after successful Google login...');
rl.close();

await context.storageState({ path: absoluteStorageStatePath });
await browser.close();

console.log(`Saved Google browser session to: ${absoluteStorageStatePath}`);

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
