import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

await loadEnvFile();

const storageStatePath = process.env.GOOGLE_BUSINESS_STORAGE_STATE ?? './storage/google.json';
const absoluteStorageStatePath = path.resolve(storageStatePath);
const logPath = path.resolve('./storage/google-session-save.log');
const waitMs = Number(process.env.GOOGLE_SESSION_WAIT_MS || 10 * 60 * 1000);
const pollMs = 3000;

await mkdir(path.dirname(absoluteStorageStatePath), { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
  args: ['--disable-blink-features=AutomationControlled'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const page = await context.newPage();
await safeGoto(page, 'https://business.google.com/', 'Google Business Profile');

const startedAt = Date.now();
let saved = false;

while (Date.now() - startedAt < waitMs) {
  await page.waitForTimeout(pollMs);
  const state = await context.storageState();
  const url = page.url();
  const loggedIn = hasGoogleAuthCookies(state) && !isLoginUrl(url) && await hasBusinessPageText(page);

  await appendLog(`url=${url} cookies=${state.cookies.length} loggedIn=${loggedIn}`);

  if (loggedIn) {
    await context.storageState({ path: absoluteStorageStatePath });
    saved = true;
    await appendLog(`saved=${absoluteStorageStatePath}`);
    break;
  }
}

await browser.close();

if (!saved) {
  await appendLog('not saved: timeout');
  process.exitCode = 1;
}

function isLoginUrl(url) {
  return /accounts\.google\.com|signin|ServiceLogin/i.test(url);
}

function hasGoogleAuthCookies(state) {
  const names = new Set((state.cookies || []).map((cookie) => cookie.name));
  return names.has('SID') || names.has('__Secure-1PSID') || names.has('__Secure-3PSID');
}

async function hasBusinessPageText(page) {
  try {
    const bodyText = await page.locator('body').innerText({ timeout: 2000 });
    return /business|profile|reviews|locations|бизнес|профиль|отзывы|филиал|компания/i.test(bodyText);
  } catch {
    return false;
  }
}

async function safeGoto(page, url, label) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendLog(`warning: could not fully open ${label}: ${message}`);
  }
}

async function appendLog(line) {
  const { appendFile } = await import('fs/promises');
  await appendFile(logPath, `[${new Date().toISOString()}] ${line}\n`);
}

async function loadEnvFile() {
  const envPath = path.resolve('.env');

  try {
    const content = await readFile(envPath, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const [rawKey, ...rawValue] = trimmed.split('=');
      const key = rawKey.trim();
      const value = rawValue.join('=').trim().replace(/^["']|["']$/g, '');

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Environment variables are optional for this helper.
  }
}
