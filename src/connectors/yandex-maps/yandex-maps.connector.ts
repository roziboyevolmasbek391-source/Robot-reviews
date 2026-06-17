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

  // Static cache for reviews to avoid repeated scrapes within sync cycle
  private static cachedReviews: NormalizedReview[] = [];
  private static cacheTimestamp: number = 0;
  private static CACHE_DURATION_MS = 120_000; // 2 minutes

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
    console.log(`[Yandex Maps Connector] Fetching reviews for branch platform ID: ${branchPlatformId}`);
    
    // Check Cache
    const now = Date.now();
    const cacheAge = now - YandexMapsConnector.cacheTimestamp;
    const hasBranchInCache = YandexMapsConnector.cachedReviews.some(r => r.externalPlaceId === branchPlatformId);
    if (hasBranchInCache && cacheAge < YandexMapsConnector.CACHE_DURATION_MS) {
      console.log(`[Yandex Maps Connector] Returning cached reviews (cache age: ${Math.round(cacheAge / 1000)}s)`);
      return YandexMapsConnector.cachedReviews.filter(r => r.externalPlaceId === branchPlatformId);
    }

    console.log("[Yandex Maps Connector] Cache empty or expired. Attempting Yandex Business Cabinet scraping...");
    const cabinetReviews = await this.scrapeCabinetReviews(branchPlatformId, limit);
    if (cabinetReviews && cabinetReviews.length > 0) {
      // Save to cache
      const otherReviews = YandexMapsConnector.cachedReviews.filter(r => r.externalPlaceId !== branchPlatformId);
      YandexMapsConnector.cachedReviews = [...otherReviews, ...cabinetReviews];
      YandexMapsConnector.cacheTimestamp = Date.now();
      console.log(`[Yandex Maps Connector] Successfully cached ${cabinetReviews.length} cabinet reviews.`);
      return cabinetReviews;
    }

    console.log("[Yandex Maps Connector] Cabinet scraper returned no reviews. Falling back to public widget scraper...");
    const publicReviews = await this.scrapeYandexReviews(branchPlatformId, limit);
    return publicReviews;
  }

  async getNewReviews(branchPlatformId: string, sinceDate: Date): Promise<NormalizedReview[]> {
    const allReviews = await this.getReviews(branchPlatformId, 10);
    return allReviews.filter(review => new Date(review.reviewDate) > sinceDate);
  }

  private async scrapeCabinetReviews(orgId: string, limit: number): Promise<NormalizedReview[]> {
    const storageState = process.env.YANDEX_BUSINESS_STORAGE_STATE ?? './storage/yandex.json';
    const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') === 'true';

    let browser: import('playwright').Browser | null = null;
    const scrapedReviews: NormalizedReview[] = [];

    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless, channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined });
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1440, height: 1000 },
        locale: 'ru-RU',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      });

      // Disable webdriver detection
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const page = await context.newPage();
      const cabinetUrl = `https://yandex.ru/sprav/${orgId}/p/edit/reviews`;
      console.log(`[Yandex Maps Connector] Navigating to cabinet reviews: ${cabinetUrl}`);
      await page.goto(cabinetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      const currentUrl = page.url();
      if (currentUrl.includes('passport.yandex') || currentUrl.includes('auth')) {
        console.warn('[Yandex Maps Connector] Session expired or invalid. Cannot scrape cabinet reviews.');
        await browser.close();
        return [];
      }

      // Check if Review cards exist
      await page.waitForSelector('.Review', { state: 'visible', timeout: 10000 }).catch(() => {
        console.log('[Yandex Maps Connector] Timeout waiting for reviews to load in cabinet.');
      });

      const pageReviews = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.Review'));
        return cards.map(card => {
          const authorEl = card.querySelector('.Review-UserName') as HTMLElement;
          const author = authorEl ? authorEl.innerText.trim() : 'Anonim';

          const starsEl = card.querySelector('.StarsRating');
          let rating = 5;
          if (starsEl) {
            const classes = Array.from(starsEl.classList);
            const valClass = classes.find(c => c.startsWith('StarsRating_value_'));
            if (valClass) {
              const val = parseInt(valClass.replace('StarsRating_value_', ''), 10);
              rating = Math.round(val / 2);
            }
          }

          const dateEl = card.querySelector('.Review-Date') as HTMLElement;
          const relativeDate = dateEl ? dateEl.innerText.trim() : '';

          const textEl = card.querySelector('.Review-Text') as HTMLElement;
          const text = textEl ? textEl.innerText.trim() : '';

          const replyEl = card.querySelector('.BusinessResponseSaved-ResponseTextContent') as HTMLElement;
          const replyText = replyEl ? replyEl.innerText.trim() : '';

          return {
            author,
            rating,
            relativeDate,
            text,
            replyText
          };
        });
      });

      console.log(`[Yandex Maps Connector] Cabinet scraped ${pageReviews.length} reviews.`);

      for (const pr of pageReviews) {
        const reviewDate = parseRussianDate(pr.relativeDate);
        const stableDateStr = reviewDate.toISOString().slice(0, 10);
        const externalReviewId = crypto
          .createHash("md5")
          .update(`${pr.author}_${stableDateStr}_${pr.rating}_${pr.text}`)
          .digest("hex");

        scrapedReviews.push({
          source: ReviewSource.YANDEX_MAPS,
          branchId: '',
          externalReviewId,
          externalPlaceId: orgId,
          author: pr.author,
          rating: pr.rating,
          text: pr.text || null,
          reviewUrl: `https://yandex.ru/maps/org/${orgId}/reviews/`,
          reviewDate,
          replyText: pr.replyText || null,
          repliedAt: pr.replyText ? new Date() : null
        });
      }

      await browser.close();
      return scrapedReviews;
    } catch (e: any) {
      console.error('[Yandex Maps Connector] Playwright cabinet scraping error:', e.message);
      if (browser) await browser.close();
      return [];
    }
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

  async replyToReview(
    branchPlatformId: string,
    reviewExternalId: string,
    replyText: string,
    extra?: { author?: string; text?: string }
  ): Promise<{ success: boolean; errorMessage?: string }> {
    console.log(`[Yandex Maps Connector] replyToReview for org ${branchPlatformId}, review ${reviewExternalId}`);

    const storageState = process.env.YANDEX_BUSINESS_STORAGE_STATE ?? './storage/yandex.json';
    const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'false') === 'true';

    let browser: import('playwright').Browser | null = null;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless, channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined });
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1440, height: 900 },
        locale: 'ru-RU',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      // Navigate to Sprav cabinet first, fallback to public maps
      const urls = [
        `https://yandex.ru/sprav/${branchPlatformId}/p/edit/reviews`,
        `https://yandex.ru/maps/org/${branchPlatformId}/reviews/`,
        `https://yandex.uz/maps/org/${branchPlatformId}/reviews/`,
      ];
      let navigatedUrl = "";

      for (const url of urls) {
        try {
          console.log(`[Yandex Maps Connector] Navigating to ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await page.waitForTimeout(3000);

          const currentUrl = page.url();
          if (currentUrl.includes('passport.yandex') || currentUrl.includes('auth')) {
            console.warn(`[Yandex Maps Connector] Redirected to login page on ${url}. Trying next...`);
            continue;
          }

          if (url.includes('/sprav/')) {
            // Check if review editor textarea or wrapper is present (indicates permission & successful load)
            const hasEditor = await page.locator('textarea, .BusinessResponseDraft-CompositeTextareaWrapper').first().isVisible().catch(() => false);
            if (!hasEditor) {
              console.warn(`[Yandex Maps Connector] Sprav page loaded but no reviews editor found. Trying next...`);
              continue;
            }
          }

          navigatedUrl = url;
          break;
        } catch (err: any) {
          console.warn(`[Yandex Maps Connector] Navigation to ${url} failed: ${err.message}`);
          continue;
        }
      }

      if (!navigatedUrl) {
        return { success: false, errorMessage: 'Yandex Maps sahifasiga o\'tib bo\'lmadi yoki login eskirgan' };
      }

      if (navigatedUrl.includes('/sprav/')) {
        // A) Sprav Cabinet Reply Flow
        console.log(`[Yandex Maps Connector] Posting reply via Yandex Business Cabinet...`);
        let card: any = null;

        if (extra?.author) {
          console.log(`[Yandex Maps Connector] Locating card for author: ${extra.author}`);
          const authorName = extra.author.trim();
          let foundCard = page.locator('.Review')
            .filter({ has: page.locator('.Review-UserName', { hasText: authorName }) })
            .first();
            
          if (!await foundCard.isVisible().catch(() => false)) {
            foundCard = page.locator('.Review, [class*="review"], [class*="comment"]')
              .filter({ has: page.locator('[class*="author"], [class*="User"], [class*="name"], [class*="Name"]').filter({ hasText: authorName }) })
              .first();
          }

          if (!await foundCard.isVisible().catch(() => false)) {
            foundCard = page.locator('.Review, [class*="review"], [class*="comment"]')
              .filter({ hasText: authorName })
              .first();
          }

          if (await foundCard.isVisible().catch(() => false)) {
            card = foundCard;
          }
        }

        const container = card || page;

        // If review is already answered and we are updating it, click to edit
        const editBlock = container.locator('.Review-BusinessResponse, [class*="response"]').first();
        if (await editBlock.isVisible().catch(() => false)) {
          await editBlock.click();
          await page.waitForTimeout(1000);
        }

        const textarea = container.locator('textarea').first();
        await textarea.waitFor({ state: 'visible', timeout: 8000 });
        await textarea.focus();

        // Clear existing reply using keyboard to trigger event listeners
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(500);

        // Type using keyboard to ensure the submit button gets enabled
        await page.keyboard.type(replyText);
        await page.waitForTimeout(1000);

        const submitBtn = container.locator('.BusinessResponseDraft-SendButton').first()
          .or(container.locator('button[class*="SendButton"]').first())
          .or(container.getByRole('button', { name: /Отправить|Опубликовать/i }).first());

        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click();
        await page.waitForTimeout(2500);

        console.log(`[Yandex Maps Connector] Reply posted successfully via Sprav Cabinet`);
        return { success: true };
      } else {
        // B) Public Maps Page Reply Flow (Fallback)
        console.log(`[Yandex Maps Connector] Posting reply via public Maps page...`);
        let replyBtn;
        let targetReviewCard: any = null;

        if (extra?.author) {
          console.log(`[Yandex Maps Connector] Searching for review card with author: ${extra.author}`);
          const authorName = extra.author.trim();
          let reviewCard = page.locator('[class*="review-view"], [class*="ReviewView"], [class*="comment"], [class*="Comment"]')
            .filter({ has: page.locator('[class*="author"], [class*="User"], [class*="name"], [class*="Name"]').filter({ hasText: authorName }) })
            .first();

          if (!await reviewCard.isVisible().catch(() => false)) {
            reviewCard = page.locator('[class*="review-view"], [class*="ReviewView"], [class*="comment"], [class*="Comment"]')
              .filter({ hasText: authorName })
              .first();
          }

          const cardReplyBtn = reviewCard.getByRole('button', { name: /Ответить|Изменить/i }).first()
            .or(reviewCard.locator('button:has-text("Ответить")').first())
            .or(reviewCard.locator('button:has-text("Изменить")').first());
          if (await cardReplyBtn.isVisible().catch(() => false)) {
            replyBtn = cardReplyBtn;
            targetReviewCard = reviewCard;
          }
        }

        if (!replyBtn) {
          replyBtn = page.getByRole('button', { name: /Ответить|Изменить/i }).first()
            .or(page.locator('button:has-text("Ответить")').first())
            .or(page.locator('button:has-text("Изменить")').first())
            .or(page.locator('[class*="reply"], [class*="Reply"], [class*="answer"]').first());
        }

        await replyBtn.waitFor({ state: 'visible', timeout: 12_000 });
        await replyBtn.scrollIntoViewIfNeeded().catch(() => {});
        await replyBtn.click();
        await page.waitForTimeout(1550);

        // Scope to targetReviewCard if found, otherwise search page
        const scope = targetReviewCard || page;

        // Find the reply text input that opens
        const replyInput = scope.locator('textarea').last()
          .or(scope.locator('[contenteditable="true"]').last())
          .or(scope.locator('[class*="textarea"], [class*="input"]').last());

        await replyInput.waitFor({ state: 'visible', timeout: 5000 });
        await replyInput.focus();

        // Clear existing reply
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(500);

        // Type reply
        await page.keyboard.type(replyText);
        await page.waitForTimeout(1000);

        // Click submit/publish button
        const submitBtn = scope.getByRole('button', { name: /Опубликовать|Отправить|Сохранить|Publish|Send/i }).last()
          .or(scope.locator('button[type="submit"]').last());

        const isSubmitEnabled = await submitBtn.isVisible().catch(() => false) && await submitBtn.isEnabled().catch(() => false);

        if (isSubmitEnabled) {
          await submitBtn.click();
        } else {
          console.warn('[Yandex Maps Connector] Submit button is not enabled or visible, sending Enter key...');
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(2500);

        console.log(`[Yandex Maps Connector] Reply posted successfully via Public Maps page`);
        return { success: true };
      }
    } catch (err: any) {
      const msg = `Yandex xatoligi: ${err.message}`;
      console.error(`[Yandex Maps Connector] ${msg}`);
      return { success: false, errorMessage: msg };
    } finally {
      await browser?.close();
    }
  }
}
