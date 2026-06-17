import { chromium } from 'playwright';
import { existsSync } from 'fs';
import path from 'path';

(async () => {
  const storageStatePath = './storage/yandex.json';
  const absoluteStorageStatePath = path.resolve(storageStatePath);
  const loginUrl = 'https://yandex.ru/sprav/companies';

  console.log(`Loading session from: ${absoluteStorageStatePath}`);
  
  const launchOptions = {
    headless: false,
    viewport: null, // Allow browser to size naturally
    args: ['--start-maximized'] // Open maximized
  };

  const browser = await chromium.launch(launchOptions);
  
  const contextOptions = {};
  if (existsSync(absoluteStorageStatePath)) {
    contextOptions.storageState = absoluteStorageStatePath;
  } else {
    console.log('No saved Yandex session found in storage/yandex.json. You will need to log in.');
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  console.log(`Navigating to Yandex Cabinet: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('Browser is now open. You can view and manage your branches.');
  console.log('Close the browser window or press Ctrl+C in this terminal when you are done.');

  // Keep the script running so the browser doesn't close automatically.
  // We can use page.waitForEvent('close') to wait until the page is closed.
  try {
    await page.waitForEvent('close', { timeout: 0 });
  } catch (err) {
    // Ignore timeout/close errors
  } finally {
    await browser.close().catch(() => {});
  }
})();
