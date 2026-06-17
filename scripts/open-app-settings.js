import { chromium } from 'playwright';

(async () => {
  const loginUrl = 'http://localhost:3000/login';
  const settingsUrl = 'http://localhost:3000/settings';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

  console.log('🚀 App settings page is opening...');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Navigating to: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  try {
    // Fill login form
    console.log('Auto-filling login details...');
    await page.waitForSelector('input[type="email"]', { timeout: 3000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for navigation to settings
    await page.waitForURL('**/settings', { timeout: 5000 });
    console.log('✅ Logged in successfully. Redirected to /settings.');
  } catch (err) {
    console.log('Note: Auto-login failed or was not needed. Directing to /settings...');
    await page.goto(settingsUrl, { waitUntil: 'domcontentloaded' });
  }

  console.log('\n==================================================');
  console.log('Please click "OAuth Яндекс" on the settings page to connect your Yandex account.');
  console.log('Do not close the browser or stop this script until you are finished.');
  console.log('==================================================\n');

  try {
    // Wait until user closes the window
    await page.waitForEvent('close', { timeout: 0 });
  } catch (e) {
    // Ignore close/timeout error
  } finally {
    await browser.close().catch(() => {});
  }
})();
