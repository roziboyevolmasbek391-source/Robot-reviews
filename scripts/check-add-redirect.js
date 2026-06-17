import { chromium } from 'playwright';
import { writeFile } from 'fs/promises';
import path from 'path';

const storageState = './storage/yandex.json';
const addUrl = 'https://yandex.ru/sprav/add';

console.log('🚀 Diagnosing Yandex Add Page Redirection...');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ storageState });
const page = await context.newPage();

try {
  await page.goto(addUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  console.log(`URL after load: ${page.url()}`);
  const html = await page.content();
  await writeFile('debug-html/add-redirect.html', html, 'utf8');
  await page.screenshot({ path: path.resolve('debug-html/add-redirect.png'), fullPage: true });
  console.log('🏁 Diagnostic screenshot and HTML saved!');
} catch (e) {
  console.log('❌ Diagnostic failed:', e.message);
} finally {
  await browser.close();
}
