#!/usr/bin/env node

/**
 * 2GIS Session Saver
 *
 * Qo'llanma:
 * 1. https://account.2gis.ru ga kiring va login qiling
 * 2. Bu skriptni ishga tushiring
 * 3. Browser ochiladi va session saqlanadi
 *
 * Masalan:
 *   node scripts/save-2gis-session.js
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const STORAGE_PATH = path.join(__dirname, "../storage");
const SESSION_FILE = path.join(STORAGE_PATH, "2gis.json");

async function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function saveSession() {
  console.log("🔐 2GIS Session Saver");
  console.log("==================================================\n");

  // Storage folder yaratish
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
    console.log(`✅ Created storage directory: ${STORAGE_PATH}\n`);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox"]
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "ru-RU"
    });

    const page = await context.newPage();

    console.log("📱 Browser ochildi. 2GIS accountga login qiling:");
    console.log("   1. https://account.2gis.ru ga o'ting");
    console.log("   2. Email va password bilan login qiling");
    console.log("   3. Firms bo'limini ochib, reviews-ni ko'ring");
    console.log("   4. Ready bo'lganida, terminal-da ENTER bosing\n");

    // 2GIS account page-ga o'tish
    await page.goto("https://account.2gis.ru", { waitUntil: "load" });

    // User login qilishni kutish
    await promptUser("Login qildingizmi? ENTER bosing... ");

    console.log("\n⏳ Session saqlanmoqda...\n");

    // Session state saqlash (cookies + localStorage)
    const storageState = await context.storageState();

    // File-ni saqlash
    fs.writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2));

    console.log(`✅ Session muvaffaqiyatli saqlandi!`);
    console.log(`📁 Fayl: ${SESSION_FILE}\n`);
    console.log(`📊 Session ma'lumotlari:`);
    console.log(`   - Cookies: ${storageState.cookies?.length || 0}`);
    console.log(`   - LocalStorage: ${storageState.origins?.length || 0}`);
    console.log("\n🚀 Endi sync-dgis.js ishga tushirasiz:");
    console.log("   node sync-dgis.js\n");

    await context.close();
  } catch (err) {
    console.error("❌ Xato:", err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

saveSession().catch(console.error);
