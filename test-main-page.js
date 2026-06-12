const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  for (const line of envConfig.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...values] = trimmed.split("=");
      process.env[key.trim()] = values.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "your-32-char-secure-encryption-key-for-credentials";

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
    console.error("Decryption error:", error);
    return "";
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "YANDEX_EDA_COOKIE" }
    });

    if (!setting) {
      console.log("No YANDEX_EDA_COOKIE setting found.");
      return;
    }

    const cookie = decrypt(setting.value);
    console.log("Cookie decrypted.");

    console.log("Fetching vendor.yandex.ru main page...");
    const response = await fetch("https://vendor.yandex.ru/", {
      headers: {
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    console.log("Status:", response.status);
    console.log("Response headers:");
    const headers = Object.fromEntries(response.headers.entries());
    console.log(JSON.stringify(headers, null, 2));

    // Also let's print all key-value pairs of our decrypted cookie
    console.log("\nCookie fields:");
    const cookieParts = cookie.split(";");
    for (const part of cookieParts) {
      const trimmed = part.trim();
      if (trimmed) {
        const [k, v] = trimmed.split("=");
        if (k.toLowerCase().includes("csrf") || k.toLowerCase().includes("session") || k.toLowerCase().includes("token")) {
          console.log(`- ${k}: ${v}`);
        } else {
          console.log(`- ${k}: (length ${v ? v.length : 0})`);
        }
      }
    }
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
