const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "your-fallback-32-char-encryption-key-for-dev!!";

function decrypt(text) {
  try {
    const textParts = text.split(":");
    const ivHex = textParts.shift();
    if (!ivHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    return "";
  }
}

async function main() {
  console.log("Loading credentials from database...");
  const cookieSetting = await prisma.systemSetting.findUnique({ where: { key: "UZUM_COOKIE" } });
  const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: "UZUM_TOKEN" } });

  const cookie = cookieSetting?.value ? decrypt(cookieSetting.value) : "";
  const token = tokenSetting?.value ? decrypt(tokenSetting.value) : "";

  if (!token) {
    console.error("Token not found in database! Make sure you logged in successfully.");
    return;
  }

  console.log("Token and cookie loaded successfully.");
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  const endpoints = [
    "https://vendors.uzumtezkor.uz/api/v1/vendors",
    "https://vendors.uzumtezkor.uz/api/v1/profile",
    "https://vendors.uzumtezkor.uz/api/v1/me",
    "https://vendors.uzumtezkor.uz/api/v1/auth/me",
    "https://vendors.uzumtezkor.uz/api/v1/users/me"
  ];

  for (const url of endpoints) {
    console.log(`\nQuerying: ${url}...`);
    try {
      const res = await fetch(url, { headers });
      console.log(`Status: ${res.status} ${res.statusText}`);
      if (res.ok) {
        const json = await res.json();
        console.log("Response body:");
        console.log(JSON.stringify(json, null, 2).slice(0, 1500));
      } else {
        const text = await res.text();
        console.log(`Response text: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      console.error(`Error querying ${url}:`, e.message);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
});
