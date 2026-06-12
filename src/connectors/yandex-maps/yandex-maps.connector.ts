import { ReviewSource } from "@prisma/client";
import { ConnectorBranch, IReviewConnector, NormalizedReview } from "../base.connector";
import * as crypto from "crypto";

const months: Record<string, number> = {
  "января": 0, "февраля": 1, "марта": 2, "апреля": 3, "мая": 4, "июня": 5,
  "июля": 6, "августа": 7, "сентября": 8, "октября": 9, "ноября": 10, "декабря": 11
};

function parseRussianDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  const clean = dateStr.trim().toLowerCase();
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  // 1. "сегодня" / "минут назад" / "часов назад"
  if (clean.includes("сегодня") || clean.includes("минут") || clean.includes("час") || clean.includes("секунд")) {
    return now;
  }

  // 2. "вчера"
  if (clean.includes("вчера")) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  // 3. "назад" (relative days / weeks / months / years ago)
  if (clean.includes("назад")) {
    const match = clean.match(/(\d+)\s+(день|дня|дне|недел|месяц|год|лет)/);
    let daysAgo = 1;
    if (match) {
      const num = parseInt(match[1], 10);
      const unit = match[2];
      if (unit.startsWith("недел")) {
        daysAgo = num * 7;
      } else if (unit.startsWith("месяц")) {
        daysAgo = num * 30;
      } else if (unit.startsWith("год") || unit.startsWith("лет")) {
        daysAgo = num * 365;
      } else {
        daysAgo = num;
      }
    } else {
      if (clean.includes("неделю")) {
        daysAgo = 7;
      } else if (clean.includes("месяц")) {
        daysAgo = 30;
      } else if (clean.includes("год")) {
        daysAgo = 365;
      } else if (clean.includes("день")) {
        daysAgo = 1;
      }
    }
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() - daysAgo);
    return targetDate;
  }

  const parts = clean.split(/\s+/);

  // 4. Format: "16 января 2025"
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = months[parts[1]];
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // 5. Format: "29 апреля"
  if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    const month = months[parts[1]];
    if (!isNaN(day) && month !== undefined) {
      let year = now.getFullYear();
      const candidate = new Date(year, month, day, 12, 0, 0);
      if (candidate > now) {
        year -= 1;
      }
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  return now;
}

export class YandexMapsConnector implements IReviewConnector {
  public isMock: boolean = false;
  private apiKey: string = "";

  constructor(credentials?: { apiKey?: string }) {
    if (credentials && credentials.apiKey) {
      this.apiKey = credentials.apiKey;
    }
  }

  async authenticate(): Promise<boolean> {
    return true;
  }

  async getBranches(): Promise<ConnectorBranch[]> {
    // Yandex Maps branches are configured manually in the admin dashboard by specifying the organization ID.
    return [];
  }

  async getReviews(branchPlatformId: string, limit: number = 20): Promise<NormalizedReview[]> {
    return this.scrapeYandexReviews(branchPlatformId, limit);
  }

  async getNewReviews(branchPlatformId: string, sinceDate: Date): Promise<NormalizedReview[]> {
    const allReviews = await this.getReviews(branchPlatformId, 10);
    return allReviews.filter(review => new Date(review.reviewDate) > sinceDate);
  }

  private async scrapeYandexReviews(orgId: string, limit: number): Promise<NormalizedReview[]> {
    console.log(`[Yandex Maps Scraper] Organization ID ${orgId} uchun widget scraping boshlanmoqda...`);
    
    const domains = ["yandex.uz", "yandex.ru"];
    let html = "";
    
    for (const domain of domains) {
      const url = `https://${domain}/maps-reviews-widget/${orgId}?comments=1`;
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ru-RU,ru;q=0.9"
          }
        });

        if (res.ok) {
          html = await res.text();
          if (!html.includes("Что-то пошло не так")) {
            console.log(`[Yandex Maps Scraper] Successfully fetched reviews widget from ${domain}`);
            break;
          } else {
            console.warn(`[Yandex Maps Scraper] Widget returned 'Something went wrong' on ${domain}`);
          }
        }
      } catch (err: any) {
        console.error(`[Yandex Maps Scraper] Fetch failed on ${domain}:`, err.message);
      }
    }

    if (!html) {
      console.error(`[Yandex Maps Scraper] Failed to fetch reviews widget for org ID ${orgId}`);
      return [];
    }

    const reviews: NormalizedReview[] = [];
    const parts = html.split('<div class="comment">');
    if (parts.length <= 1) {
      return [];
    }

    for (let i = 1; i < parts.length && reviews.length < limit; i++) {
      const block = parts[i];

      const authorMatch = block.match(/<p class="comment__name">([\s\S]*?)<\/p>/);
      const author = authorMatch ? authorMatch[1].trim() : "Anonim";

      const dateMatch = block.match(/<p class="comment__date">([\s\S]*?)<\/p>/);
      const dateText = dateMatch ? dateMatch[1].trim() : "";
      const reviewDate = parseRussianDate(dateText);

      const starListMatch = block.match(/<ul class="stars-list">([\s\S]*?)<\/ul>/);
      let rating = 5;
      if (starListMatch) {
        const starHtml = starListMatch[1];
        const emptyCount = (starHtml.match(/_empty/g) || []).length;
        rating = 5 - emptyCount;
      }

      const textMatch = block.match(/<p class="comment__text">([\s\S]*?)<\/p>/);
      const text = textMatch ? textMatch[1].replace(/<br\s*\/?>/gi, "\n").trim() : "";

      const stableDateStr = reviewDate.toISOString().slice(0, 10);
      const externalReviewId = crypto
        .createHash("md5")
        .update(`${author}_${stableDateStr}_${rating}_${text}`)
        .digest("hex");

      const reviewUrl = `https://yandex.uz/maps/org/mazzali/${orgId}/reviews`;

      reviews.push({
        source: ReviewSource.YANDEX_MAPS,
        branchId: "",
        externalReviewId,
        author,
        rating,
        text,
        reviewUrl,
        reviewDate
      });
    }

    return reviews;
  }
}
