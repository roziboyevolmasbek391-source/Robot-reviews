import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "your-fallback-32-char-encryption-key-for-dev!!"; // Must be 32 bytes
const IV_LENGTH = 16; // For AES-256-GCM

export function encrypt(text: string): string {
  // Ensure the key is exactly 32 bytes
  const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string): string {
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
