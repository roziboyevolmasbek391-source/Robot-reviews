import { chromium } from 'playwright';

const storageState = './storage/yandex.json';
const dashboardUrl = 'https://yandex.ru/sprav/companies';

console.log('🚀 Yandex Business kabineti ochilmoqda...');
console.log(`🔗 Manzil: ${dashboardUrl}`);

try {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  // Navigate to organizations list
  await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' });
  console.log('✅ Kabinet ochildi. Brauzer oynasini yopmang, bemalol tekshirishingiz mumkin.');
  
  // Keep the browser open for 15 minutes (900,000 ms)
  await page.waitForTimeout(900000);
  await browser.close();
} catch (e) {
  console.log('❌ Xatolik yuz berdi:', e.message);
}
