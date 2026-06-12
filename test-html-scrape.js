const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const fs = require("fs");

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
    console.error("Decryption error:", error);
    return "";
  }
}

async function main() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "YANDEX_EDA_COOKIE" }
  });

  if (!setting || !setting.value) {
    console.log("No YANDEX_EDA_COOKIE found.");
    return;
  }

  const cookie = decrypt(setting.value);
  console.log("Cookie length:", cookie.length);

  const urls = [
    { name: "root", url: "https://vendor.yandex.ru/" },
    { name: "places", url: "https://vendor.yandex.ru/places" }
  ];

  for (const item of urls) {
    console.log(`\nFetching ${item.url}...`);
    try {
      const response = await fetch(item.url, {
        headers: {
          "Cookie": cookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });
      console.log("Status:", response.status);
      const text = await response.text();
      fs.writeFileSync(`scrape-${item.name}.html`, text);
      console.log(`Saved to scrape-${item.name}.html (length: ${text.length})`);

      // Check if some place IDs are mentioned in the file
      const searchIds = ["3213569", "3260949", "3179915"];
      for (const id of searchIds) {
        if (text.includes(id)) {
          console.log(`-> SUCCESS: Found Place ID ${id} in HTML!`);
        }
      }
    } catch (e) {
      console.error(`Error fetching ${item.url}:`, e);
    }
  }

  await prisma.$disconnect();
}

main();
