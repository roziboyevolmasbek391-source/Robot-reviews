import { Bot, InlineKeyboard, InputFile } from "grammy";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { SYSTEM_SETTING_KEYS } from "@/lib/constants";

export class TelegramService {
  private bot: Bot | null = null;
  private chatId: string = "";

  private async init() {
    try {
      const tokenSetting = await prisma.systemSetting.findUnique({
        where: { key: SYSTEM_SETTING_KEYS.TELEGRAM_BOT_TOKEN },
      });
      const chatSetting = await prisma.systemSetting.findUnique({
        where: { key: SYSTEM_SETTING_KEYS.TELEGRAM_CHAT_ID },
      });

      if (tokenSetting && tokenSetting.value) {
        const token = decrypt(tokenSetting.value);
        if (token) {
          this.bot = new Bot(token);
        }
      }

      if (chatSetting && chatSetting.value) {
        // Chat ID is usually not encrypted unless specified, but we decrypt it just in case it is
        this.chatId = chatSetting.isSecret ? decrypt(chatSetting.value) : chatSetting.value;
      }
    } catch (e) {
      console.error("[Telegram Service] Error initializing bot:", e);
    }
  }

  async sendHtmlMessage(message: string): Promise<boolean> {
    await this.init();
    if (!this.bot || !this.chatId) {
      console.log("[Telegram Service] Telegram Bot or Chat ID is not configured. Message skipped.");
      return false;
    }
    try {
      await this.bot.api.sendMessage(this.chatId, message, {
        parse_mode: "HTML",
      });
      return true;
    } catch (error) {
      console.error("[Telegram Service] Error sending HTML message:", error);
      return false;
    }
  }

  async sendDocument(fileBuffer: Buffer, fileName: string, caption: string): Promise<boolean> {
    await this.init();
    if (!this.bot || !this.chatId) {
      console.log("[Telegram Service] Telegram Bot or Chat ID is not configured. Document skipped.");
      return false;
    }
    try {
      await this.bot.api.sendDocument(this.chatId, new InputFile(fileBuffer, fileName), {
        caption: caption,
        parse_mode: "HTML",
      });
      return true;
    } catch (error) {
      console.error("[Telegram Service] Error sending document:", error);
      return false;
    }
  }

  async sendNegativeReviewAlert(review: {
    id: string;
    source: string;
    branchName: string;
    rating: number;
    author: string;
    text: string | null;
    reviewDate: Date;
    reviewUrl: string | null;
    aiTopics?: string;
  }): Promise<boolean> {
    await this.init();

    if (!this.bot || !this.chatId) {
      console.log("[Telegram Service] Telegram Bot or Chat ID is not configured. Alert skipped.");
      return false;
    }

    const platformLabels: Record<string, string> = {
      GOOGLE_MAPS: "Google Maps 🔵",
      YANDEX_MAPS: "Yandex Maps 🔴",
      YANDEX_VENDOR: "Yandex Vendor 🟣",
      DGIS: "2GIS 🟢",
      UZUM_VENDOR: "Uzum Vendor 🟠",
    };

    const ratingStars = "⭐".repeat(review.rating) + "☆".repeat(5 - review.rating);
    const dateFormatted = new Date(review.reviewDate).toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const message = `
⚠️ <b>УВЕДОМЛЕНИЕ О НОВОМ НЕГАТИВНОМ ОТЗЫВЕ</b>

<b>🏢 Филиал:</b> ${review.branchName}
<b>📌 Платформа:</b> ${platformLabels[review.source] || review.source}
<b>⭐ Оценка:</b> ${review.rating} / 5 (${ratingStars})
<b>🏷️ Темы:</b> ${review.aiTopics || "Не определено"}
<b>👤 Автор:</b> ${review.author}
<b>📅 Дата:</b> ${dateFormatted}

<b>📝 Текст отзыва:</b>
<i>"${review.text || "Отзыв без комментария"}"</i>
`;

    // Keyboard configuration
    const keyboard = new InlineKeyboard();
    if (review.reviewUrl) {
      keyboard.url("Открыть оригинал 🔗", review.reviewUrl);
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const isVendor = review.source === "YANDEX_VENDOR" || review.source === "UZUM_VENDOR";
    const replyPath = isVendor ? "vendors" : "maps-reviews";
    keyboard.url("Ответить в системе 🤖", `${appUrl}/${replyPath}?reviewId=${review.id}`);

    try {
      await this.bot.api.sendMessage(this.chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      console.log(`[Telegram Service] Alert sent for review on ${review.source} (${review.branchName})`);
      return true;
    } catch (error) {
      console.error("[Telegram Service] Error sending message:", error);
      return false;
    }
  }
}
export const telegramService = new TelegramService();
