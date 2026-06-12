const { PrismaClient } = require("@prisma/client");
const { analyzeReview } = require("./ai-analyzer");
const { Bot, InlineKeyboard } = require("grammy");
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

async function saveAndAlertReview(rawReview, branchId, branchName, source) {
  // 1. Run AI Analysis (Sentiment, Topics, Draft suggestions)
  const analysis = await analyzeReview(
    rawReview.text,
    rawReview.rating,
    rawReview.author || "Anonim",
    branchName
  );

  // 2. Save Review to DB with AI fields
  const savedReview = await prisma.review.create({
    data: {
      branchId,
      source,
      externalReviewId: rawReview.externalReviewId,
      author: rawReview.author || "Anonim",
      rating: rawReview.rating,
      text: rawReview.text,
      reviewUrl: rawReview.reviewUrl,
      reviewDate: new Date(rawReview.reviewDate),
      isNew: true,
      aiSentiment: analysis.sentiment,
      aiTopics: analysis.topics.join(", ")
    }
  });

  // 3. Send Telegram Alert if negative (rating <= 2)
  if (savedReview.rating <= 2) {
    try {
      const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: "TELEGRAM_BOT_TOKEN" } });
      const chatSetting = await prisma.systemSetting.findUnique({ where: { key: "TELEGRAM_CHAT_ID" } });

      if (tokenSetting && tokenSetting.value && chatSetting && chatSetting.value) {
        const token = decrypt(tokenSetting.value);
        const chatId = chatSetting.isSecret ? decrypt(chatSetting.value) : chatSetting.value;

        if (token && chatId) {
          const bot = new Bot(token);
          const platformLabels = {
            GOOGLE_MAPS: "Google Maps 🔵",
            YANDEX_MAPS: "Yandex Maps 🔴",
            YANDEX_VENDOR: "Yandex Vendor 🟣",
            DGIS: "2GIS 🟢",
            UZUM_VENDOR: "Uzum Vendor 🟠"
          };

          const ratingStars = "⭐".repeat(savedReview.rating) + "☆".repeat(5 - savedReview.rating);
          const dateFormatted = new Date(savedReview.reviewDate).toLocaleString("ru-RU", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          });

          const message = `
⚠️ <b>УВЕДОМЛЕНИЕ О НОВОМ НЕГАТИВНОМ ОТЗЫВЕ</b>

<b>🏢 Филиал:</b> ${branchName}
<b>📌 Платформа:</b> ${platformLabels[source] || source}
<b>⭐ Оценка:</b> ${savedReview.rating} / 5 (${ratingStars})
<b>🏷️ Темы:</b> ${analysis.topics.join(", ") || "Не определено"}
<b>👤 Автор:</b> ${savedReview.author}
<b>📅 Дата:</b> ${dateFormatted}

<b>📝 Текст отзыва:</b>
<i>"${savedReview.text || "Отзыв без комментария"}"</i>
`;

          const keyboard = new InlineKeyboard();
          if (savedReview.reviewUrl) {
            keyboard.url("Открыть оригинал 🔗", savedReview.reviewUrl);
          }
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const isVendor = source === "YANDEX_VENDOR" || source === "UZUM_VENDOR";
          const replyPath = isVendor ? "vendors" : "maps-reviews";
          keyboard.url("Ответить в системе 🤖", `${appUrl}/${replyPath}?reviewId=${savedReview.id}`);

          await bot.api.sendMessage(chatId, message, {
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          console.log(`  -> [Telegram Alert Helper] Interactive alert sent successfully for review ID ${savedReview.id}`);
        }
      }
    } catch (err) {
      console.error("  -> ❌ [Telegram Alert Helper] Error sending message:", err.message);
    }
  }

  return savedReview;
}

module.exports = {
  saveAndAlertReview
};
