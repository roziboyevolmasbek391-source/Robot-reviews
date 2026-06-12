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
    console.error("Decryption error:", error);
    return "";
  }
}

async function main() {
  const settings = await prisma.systemSetting.findMany();
  for (const s of settings) {
    let val = s.value;
    if (s.isSecret && val) {
      val = decrypt(val);
    }
    if (val) {
      const masked = val.length > 15 
        ? `${val.substring(0, 8)}...${val.substring(val.length - 8)}` 
        : val;
      console.log(`- ${s.key}: ${masked} (length: ${val.length})`);
    } else {
      console.log(`- ${s.key}: [EMPTY]`);
    }
  }
  await prisma.$disconnect();
}

main();
