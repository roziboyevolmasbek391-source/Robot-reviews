#!/usr/bin/env node

/**
 * Quick 2GIS Session Checker
 *
 * Qo'llanma:
 *   node scripts/check-2gis-session.js
 */

const fs = require("fs");
const path = require("path");

const SESSION_FILE = path.join(__dirname, "../storage/2gis.json");

console.log("🔍 2GIS Session Status Checker\n");

// Fayl mavjudligini tekshir
if (!fs.existsSync(SESSION_FILE)) {
  console.log("❌ Session file topilmadi: " + SESSION_FILE);
  console.log("\n📌 Qanday qilish kerak:");
  console.log("   1. Browser bilan login qiling:");
  console.log("      https://account.2gis.ru");
  console.log("   2. Session saqlang:");
  console.log("      node scripts/save-2gis-session.js");
  process.exit(1);
}

// Fayl o'qish va parse qilish
try {
  const storageState = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  const stat = fs.statSync(SESSION_FILE);

  console.log("✅ Session file MAVJUD\n");
  console.log("📊 Session Details:");
  console.log(`   - File: ${SESSION_FILE}`);
  console.log(`   - Size: ${(stat.size / 1024).toFixed(2)} KB`);
  console.log(`   - Modified: ${stat.mtime.toLocaleString("uz-UZ")}`);
  console.log(`   - Cookies: ${storageState.cookies?.length || 0}`);
  console.log(`   - Origins: ${storageState.origins?.length || 0}\n`);

  // Session age ni tekshir
  const ageMs = Date.now() - stat.mtimeMs;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays > 7) {
    console.log(`⚠️  Session ${ageDays} kun qadimgi (7+ kun expire bo'ladi)`);
    console.log("   Yangilash uchun: node scripts/save-2gis-session.js\n");
  } else {
    console.log(`✅ Session fresh (${ageDays} kun eski)\n`);
  }

  // Key cookies check
  const keyTokens = ["dg_session_id", "dg_session_token", "spid"];
  const hasCookies = keyTokens.filter(token =>
    storageState.cookies?.some(c => c.name === token)
  );

  console.log(`🔑 Authentication Cookies: ${hasCookies.length}/${keyTokens.length}`);
  hasCookies.forEach(token => console.log(`   ✓ ${token}`));

  if (hasCookies.length < keyTokens.length) {
    console.log("   ⚠️  Some tokens missing - session may be incomplete");
  }

  console.log("\n🚀 Ready to sync:");
  console.log("   node sync-dgis.js\n");
} catch (err) {
  console.log(`❌ Session file damaged: ${err.message}`);
  console.log("\n📌 Yangilash uchun:");
  console.log("   node scripts/save-2gis-session.js\n");
  process.exit(1);
}
