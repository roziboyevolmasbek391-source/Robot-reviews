import { chromium } from 'playwright';

const loginUrl = 'http://localhost:3000/login';
const settingsUrl = 'http://localhost:3000/settings';
const screenshotPath = 'C:\\Users\\Victus\\.gemini\\antigravity\\brain\\dac95f92-24e8-4909-b5ff-ee82f7237937\\settings-preview.png';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 960 }
});
const page = await context.newPage();

try {
  console.log(`Opening login page: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

  console.log('Filling in login credentials...');
  await page.fill('input[type="email"]', 'admin@example.com');
  await page.fill('input[type="password"]', 'ChangeMe123!');
  
  console.log('Submitting login form...');
  await page.click('button[type="submit"]');
  
  console.log('Waiting for navigation...');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  
  console.log(`Navigating to settings page: ${settingsUrl}`);
  await page.goto(settingsUrl, { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait a moment for any fetch to complete
  await page.waitForTimeout(3000);
  
  console.log(`Taking screenshot and saving to: ${screenshotPath}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot taken successfully!');
} catch (error) {
  console.error('Error during automation:', error);
} finally {
  await browser.close();
}
