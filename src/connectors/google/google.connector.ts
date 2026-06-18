import { ReviewSource } from "@prisma/client";
import { BusinessSearchAnalytics, ConnectorBranch, IReviewConnector, NormalizedReview } from "../base.connector";
import * as crypto from "crypto";

const shortMonths: Record<string, number> = {
  "янв": 0, "фев": 1, "мар": 2, "апр": 3, "мая": 4, "июн": 5,
  "июл": 6, "авг": 7, "сен": 8, "окт": 9, "ноя": 10, "дек": 11
};

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

  // Filter out 'г.' or 'г' from absolute format like "10 июн. 2025 г."
  const parts = clean.split(/\s+/).filter(p => p !== 'г.' && p !== 'г');

  // 4. Format: "10 июн. 2025" or "16 января 2025"
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monthWord = parts[1].replace(/\./g, ''); // Remove trailing dot
    const shortKey = monthWord.substring(0, 3);
    const month = months[monthWord] !== undefined ? months[monthWord] : shortMonths[shortKey];
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // 5. Format: "29 апреля" or "29 апр."
  if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    const monthWord = parts[1].replace(/\./g, '');
    const shortKey = monthWord.substring(0, 3);
    const month = months[monthWord] !== undefined ? months[monthWord] : shortMonths[shortKey];
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

export class GoogleReviewsConnector implements IReviewConnector {
  private clientId: string = "";
  private clientSecret: string = "";
  private refreshToken: string = "";
  private accessToken: string = "";
  public isMock: boolean = false;

  // Static cache for scraped reviews to share across multiple connector instances during a sync cycle
  private static cachedReviews: NormalizedReview[] = [];
  private static cacheTimestamp: number = 0;
  private static CACHE_DURATION_MS = 120_000; // 2 minutes

  constructor(credentials?: { clientId: string; clientSecret: string; refreshToken: string }) {
    if (credentials && credentials.clientId && credentials.clientSecret && credentials.refreshToken) {
      this.clientId = credentials.clientId;
      this.clientSecret = credentials.clientSecret;
      this.refreshToken = credentials.refreshToken;
    }
  }

  async authenticate(): Promise<boolean> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      console.log("[Google Connector] Credentials not fully configured. Using browser automation fallback.");
      return true; // Return true to allow fallback execution
    }

    try {
      console.log("[Google Connector] Refreshing OAuth 2.0 access token...");
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!res.ok) {
        console.warn(`[Google Connector] Token refresh failed with status ${res.status}. Falling back to browser automation.`);
        return true;
      }

      const data = await res.json();
      if (data && data.access_token) {
        this.accessToken = data.access_token;
        console.log("[Google Connector] Access token successfully refreshed.");
        return true;
      }

      console.warn("[Google Connector] No access_token returned in response. Falling back to browser automation.");
      return true;
    } catch (error: any) {
      console.error("[Google Connector] Authentication error:", error.message);
      return true; // Still allow fallback
    }
  }

  async getBranches(): Promise<ConnectorBranch[]> {
    if (!this.accessToken) {
      return [];
    }
    
    try {
      const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json"
        }
      });

      if (!accountsRes.ok) {
        const body = await accountsRes.text().catch(() => "");
        console.warn(`[Google Connector] Failed to fetch accounts: HTTP ${accountsRes.status} ${body}`);
        return [];
      }

      const accountsData = await accountsRes.json();
      const accounts = Array.isArray(accountsData.accounts) ? accountsData.accounts : [];
      const branches: ConnectorBranch[] = [];

      for (const account of accounts) {
        if (!account?.name) continue;

        const params = new URLSearchParams({
          readMask: "name,title,storeCode,storefrontAddress,metadata",
          pageSize: "100",
        });
        let pageToken = "";

        do {
          if (pageToken) {
            params.set("pageToken", pageToken);
          }

          const locationsRes = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?${params.toString()}`,
            {
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
                Accept: "application/json"
              }
            }
          );

          if (!locationsRes.ok) {
            const body = await locationsRes.text().catch(() => "");
            console.warn(`[Google Connector] Failed to fetch locations for ${account.name}: HTTP ${locationsRes.status} ${body}`);
            break;
          }

          const locationsData = await locationsRes.json();
          for (const loc of locationsData.locations || []) {
            const locName = String(loc.name || "");
            const externalId = locName.startsWith("accounts/")
              ? locName
              : `${account.name}/${locName}`;
            const address = loc.storefrontAddress;
            branches.push({
              externalId,
              name: loc.title || loc.storeCode || "Google Branch",
              city: address?.locality || address?.administrativeArea || "",
              address: Array.isArray(address?.addressLines) ? address.addressLines.join(", ") : "",
            });
          }

          pageToken = locationsData.nextPageToken || "";
        } while (pageToken);
      }

      return branches;
    } catch (e: any) {
      console.error("[Google Connector] Failed to fetch branches:", e.message);
    }
    return [];
  }

  private async getReviewsFromApi(branchPlatformId: string, limit: number): Promise<NormalizedReview[] | null> {
    if (!this.accessToken) {
      return null;
    }

    let url = "";
    if (branchPlatformId.startsWith("accounts/")) {
      url = `https://mybusiness.googleapis.com/v4/${branchPlatformId}/reviews?pageSize=${limit}`;
    } else {
      url = `https://mybusiness.googleapis.com/v4/accounts/-/locations/${branchPlatformId}/reviews?pageSize=${limit}`;
    }

    try {
      console.log(`[Google Connector] Querying Google Business API: ${url}`);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json"
        }
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(`[Google Connector] API request failed with status ${res.status}. Falling back to browser session. ${body}`);
        return null;
      }

      const data = await res.json();
      if (!data || !data.reviews || !Array.isArray(data.reviews)) {
        console.warn("[Google Connector] Invalid or empty reviews structure returned from API. Falling back to browser session.");
        return null;
      }

      console.log(`[Google Connector] Successfully fetched ${data.reviews.length} reviews from API.`);
      
      const ratingMap: Record<string, number> = {
        "ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5
      };

      return data.reviews.map((r: any) => {
        const rating = ratingMap[r.starRating] || 5;
        const reviewDate = new Date(r.createTime || Date.now());
        const author = r.reviewer?.displayName || "Anonim";
        const text = r.comment || "";
        
        return {
          source: ReviewSource.GOOGLE_MAPS,
          branchId: "",
          externalReviewId: r.reviewId || crypto.createHash("md5").update(`${author}_${reviewDate.getTime()}`).digest("hex"),
          externalPlaceId: branchPlatformId,
          author,
          rating,
          text: text || null,
          reviewUrl: r.reviewUrl || `https://maps.google.com/review?id=${branchPlatformId}`,
          reviewDate,
          replyText: r.reviewReply?.comment || null,
          repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null
        };
      });

    } catch (err: any) {
      console.error(`[Google Connector] Fetch error: ${err.message}. Falling back to browser session.`);
      return null;
    }
  }

  async getReviews(branchPlatformId: string, limit: number = 20): Promise<NormalizedReview[]> {
    const apiReviews = await this.getReviewsFromApi(branchPlatformId, limit);
    if (apiReviews) {
      return apiReviews;
    }

    // If OAuth is not configured or the API is unavailable, run browser automation fallback.
    console.log(`[Google Connector] Fetching reviews using Playwright for branch platform ID: ${branchPlatformId}`);
    
    // Check Cache
    const now = Date.now();
    const cacheAge = now - GoogleReviewsConnector.cacheTimestamp;
    if (GoogleReviewsConnector.cachedReviews.length > 0 && cacheAge < GoogleReviewsConnector.CACHE_DURATION_MS) {
      console.log(`[Google Connector] Returning cached reviews (cache age: ${Math.round(cacheAge / 1000)}s)`);
      return GoogleReviewsConnector.cachedReviews.filter(r => r.externalPlaceId === branchPlatformId);
    }

    console.log("[Google Connector] Cache empty or expired. Launching Playwright to scrape reviews...");
    const storageState = process.env.GOOGLE_BUSINESS_STORAGE_STATE ?? './storage/google.json';
    const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') === 'true';

    let browser: import('playwright').Browser | null = null;
    const scrapedReviews: NormalizedReview[] = [];

    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless });
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
      const reviewsUrl = 'https://business.google.com/reviews';
      console.log(`[Google Connector] Navigating to ${reviewsUrl}`);
      await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(6000);

      if (page.url().includes('accounts.google.com') || page.url().includes('signin')) {
        console.warn('[Google Connector] Google login session has expired. Cannot scrape reviews.');
        await browser.close();
        return [];
      }

      // Scrape up to 3 pages of reviews to populate cache
      for (let pageNum = 1; pageNum <= 3; pageNum++) {
        console.log(`[Google Connector] Scraping reviews page ${pageNum}...`);
        
        const pageReviews = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.DsOcnf'));
          return cards.map(card => {
            const htmlCard = card as HTMLElement;
            // Author Name
            const authorAnchor = htmlCard.querySelector('a.LH5kS') as HTMLElement;
            const author = authorAnchor ? authorAnchor.innerText.trim() : 'Anonim';

            // Rating
            const starsContainer = htmlCard.querySelector('.Xl7c2c');
            let rating = 5;
            if (starsContainer) {
              rating = starsContainer.querySelectorAll('.MOLvNc').length || 5;
            }

            // Relative Date
            const dateSpan = htmlCard.querySelector('.zWmYWd, .NhZJzb') as HTMLElement;
            const relativeDate = dateSpan ? dateSpan.innerText.trim() : '';

            // Review Text
            const textBlock = htmlCard.querySelector('blockquote.rSdjR, [jsname="AqNep"]') as HTMLElement;
            let text = textBlock ? textBlock.innerText.trim() : '';
            if (text.includes('Пользователь не написал отзыв, но поставил оценку')) {
              text = '';
            }

            // Reply Text
            const replyBlock = htmlCard.querySelector('blockquote.Q9ktHb, .Q9ktHb') as HTMLElement;
            const replyText = replyBlock ? replyBlock.innerText.trim() : '';

            // Branch Details (Location Code)
            const textLines = htmlCard.innerText.split('\n').map((l: string) => l.trim()).filter(Boolean);
            let branchCode = '';
            const codeLine = textLines.find((l: string) => l.includes('Код филиала') || l.includes('Store code') || l.includes('Branch code'));
            if (codeLine) {
              const match = codeLine.match(/\d+/);
              if (match) branchCode = match[0];
            }

            // Review ID
            const reviewIdEl = htmlCard.querySelector('[data-review-id]');
            const reviewId = reviewIdEl ? reviewIdEl.getAttribute('data-review-id') : '';

            return {
              reviewId,
              author,
              rating,
              relativeDate,
              text,
              replyText,
              branchCode
            };
          });
        });

        console.log(`[Google Connector] Found ${pageReviews.length} reviews on page ${pageNum}`);

        for (const pr of pageReviews) {
          if (!pr.reviewId) continue;
          
          const reviewDate = parseRussianDate(pr.relativeDate);
          
          scrapedReviews.push({
            source: ReviewSource.GOOGLE_MAPS,
            branchId: '',
            externalReviewId: pr.reviewId,
            externalPlaceId: pr.branchCode || undefined, // Set location code to route to correct branch
            author: pr.author,
            rating: pr.rating,
            text: pr.text || null,
            reviewUrl: `https://business.google.com/reviews`,
            reviewDate,
            replyText: pr.replyText || null,
            repliedAt: pr.replyText ? new Date() : null
          });
        }

        // Click Next Page if enabled
        const nextBtn = page.locator('button:has-text("navigate_next")');
        const isVisible = await nextBtn.isVisible().catch(() => false);
        const isEnabled = isVisible && await nextBtn.isEnabled().catch(() => false);
        
        if (isEnabled) {
          console.log('[Google Connector] Clicking Next Page...');
          try {
            await nextBtn.click({ timeout: 5000 });
            await page.waitForTimeout(4000);
          } catch {
            console.log('[Google Connector] Could not click Next Page. Stopping pagination.');
            break;
          }
        } else {
          break;
        }
      }

      await browser.close();

      // Deduplicate scraped reviews
      const uniqueReviewsMap = new Map<string, NormalizedReview>();
      for (const r of scrapedReviews) {
        uniqueReviewsMap.set(r.externalReviewId, r);
      }
      
      // Save to cache
      GoogleReviewsConnector.cachedReviews = Array.from(uniqueReviewsMap.values());
      GoogleReviewsConnector.cacheTimestamp = Date.now();
      console.log(`[Google Connector] Successfully cached ${GoogleReviewsConnector.cachedReviews.length} total reviews.`);

      // Filter by the requested branch platform ID
      return GoogleReviewsConnector.cachedReviews.filter(r => r.externalPlaceId === branchPlatformId);

    } catch (e: any) {
      console.error('[Google Connector] Playwright scraping error:', e.message);
      if (browser) await browser.close();
      return [];
    }
  }

  async getNewReviews(branchPlatformId: string, sinceDate: Date): Promise<NormalizedReview[]> {
    const allReviews = await this.getReviews(branchPlatformId, 10);
    return allReviews.filter(review => new Date(review.reviewDate) > sinceDate);
  }

  async getSearchAnalytics(
    branchPlatformId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<BusinessSearchAnalytics> {
    const empty: BusinessSearchAnalytics = { dailyImpressions: [], queries: [] };

    if (!this.accessToken) {
      const authenticated = await this.authenticate();
      if (!authenticated || !this.accessToken) {
        return empty;
      }
    }

    const locationName = this.normalizePerformanceLocationName(branchPlatformId);
    if (!locationName) {
      console.warn(`[Google Connector] Cannot fetch performance metrics: invalid location ID "${branchPlatformId}"`);
      return empty;
    }

    const dailyImpressions = await this.fetchDailyImpressions(locationName, dateFrom, dateTo);
    const queries = await this.fetchMonthlySearchKeywords(locationName, dateFrom, dateTo);

    return { dailyImpressions, queries };
  }

  private normalizePerformanceLocationName(branchPlatformId: string): string | null {
    const trimmed = branchPlatformId.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("locations/")) {
      return trimmed;
    }

    const locationMatch = trimmed.match(/locations\/([^/]+)/);
    if (locationMatch?.[1]) {
      return `locations/${locationMatch[1]}`;
    }

    return `locations/${trimmed}`;
  }

  private appendDateParams(params: URLSearchParams, prefix: string, date: Date) {
    params.set(`${prefix}.year`, String(date.getFullYear()));
    params.set(`${prefix}.month`, String(date.getMonth() + 1));
    params.set(`${prefix}.day`, String(date.getDate()));
  }

  private appendMonthParams(params: URLSearchParams, prefix: string, date: Date) {
    params.set(`${prefix}.year`, String(date.getFullYear()));
    params.set(`${prefix}.month`, String(date.getMonth() + 1));
  }

  private parseGoogleDate(raw: any): Date | null {
    if (!raw) return null;
    if (typeof raw === "string") {
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const year = Number(raw.year);
    const month = Number(raw.month);
    const day = Number(raw.day || 1);
    if (!year || !month) return null;
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  private getDatedValueDate(point: any): Date | null {
    return this.parseGoogleDate(point.date || point.day || point.month || point.startDate);
  }

  private getDatedValueCount(point: any): number {
    const rawValue = point.value ?? point.metricValue?.value ?? point.insightsValue?.value ?? 0;
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : 0;
  }

  private collectTimeSeriesPoints(node: any): Array<{ date: Date; count: number }> {
    const points: Array<{ date: Date; count: number }> = [];

    const visit = (value: any) => {
      if (!value || typeof value !== "object") return;

      if (
        (value.date || value.day || value.month || value.startDate) &&
        (value.value !== undefined || value.metricValue || value.insightsValue)
      ) {
        const date = this.getDatedValueDate(value);
        const count = this.getDatedValueCount(value);
        if (date && count > 0) {
          points.push({ date, count });
        }
      }

      for (const child of Object.values(value)) {
        if (Array.isArray(child)) {
          child.forEach(visit);
        } else if (child && typeof child === "object") {
          visit(child);
        }
      }
    };

    visit(node);
    return points;
  }

  private async fetchDailyImpressions(
    locationName: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Array<{ date: Date; count: number }>> {
    const metrics = [
      "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    ];
    const params = new URLSearchParams();
    metrics.forEach((metric) => params.append("dailyMetrics", metric));
    this.appendDateParams(params, "dailyRange.start_date", dateFrom);
    this.appendDateParams(params, "dailyRange.end_date", dateTo);

    const url = `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(`[Google Connector] Performance API failed: HTTP ${res.status} ${body}`);
        return [];
      }

      const data = await res.json();
      const byDate = new Map<string, { date: Date; count: number }>();
      for (const point of this.collectTimeSeriesPoints(data)) {
        const key = point.date.toISOString().slice(0, 10);
        const existing = byDate.get(key);
        if (existing) {
          existing.count += point.count;
        } else {
          byDate.set(key, { date: point.date, count: point.count });
        }
      }

      return Array.from(byDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error: any) {
      console.error(`[Google Connector] Performance metrics fetch error: ${error.message}`);
      return [];
    }
  }

  private async fetchMonthlySearchKeywords(
    locationName: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Array<{ query: string; count: number }>> {
    const params = new URLSearchParams();
    this.appendMonthParams(params, "monthlyRange.start_month", dateFrom);
    this.appendMonthParams(params, "monthlyRange.end_month", dateTo);
    params.set("pageSize", "100");

    const queryCounts = new Map<string, number>();
    let pageToken = "";

    try {
      do {
        if (pageToken) {
          params.set("pageToken", pageToken);
        }

        const url = `https://businessprofileperformance.googleapis.com/v1/${locationName}/searchkeywords/impressions/monthly?${params.toString()}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn(`[Google Connector] Search keywords API failed: HTTP ${res.status} ${body}`);
          return [];
        }

        const data = await res.json();
        for (const item of data.searchKeywordsCounts || []) {
          const query = String(item.searchKeyword || "").trim();
          const rawCount = item.insightsValue?.value ?? item.insightsValue?.threshold ?? 0;
          const count = Number(rawCount);
          if (query && Number.isFinite(count) && count > 0) {
            queryCounts.set(query, (queryCounts.get(query) || 0) + count);
          }
        }

        pageToken = data.nextPageToken || "";
      } while (pageToken);

      return Array.from(queryCounts.entries())
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count);
    } catch (error: any) {
      console.error(`[Google Connector] Search keywords fetch error: ${error.message}`);
      return [];
    }
  }

  private getMockFallbackReviews(branchPlatformId: string, limit: number): NormalizedReview[] {
    console.log(`[Google Connector] Generating ${limit} fallback reviews for branch platform ID ${branchPlatformId}`);
    const mockReviews: NormalizedReview[] = [];
    const authors = [
      "Jasur Abdullayev", "Kamola Rustamova", "Davron Ergashev", "Zilola Umarova", "Sherzod Alimov",
      "Azizbek Karimov", "Dilnoza Shodiyeva", "Farruh Gulyamov", "Shahnoza Yuldasheva", "Otabek Sodiqov"
    ];
    const comments = [
      "Xizmat ko'rsatish juda yaxshi! Taomlar mazali va issiq keldi. Har doim bu yerga kelishni yaxshi ko'ramiz. Rahmat!",
      "Kutish vaqti biroz uzoq bo'ldi, lekin xodimlar xushmuomala va samimiy.",
      "Menga unchalik yoqmadi. Buyurtma biroz sovuq keldi, lekin administrator vaziyatni tezda hal qildi.",
      "Ajoyib joy! Oilaviy kelish va hordiq chiqarish uchun juda qulay va shinam.",
      "Narxlari sifatiga to'liq to'g'ri keladi, har doim shu yerdan buyurtma beramiz."
    ];

    // Use a fixed base date so dates are stable across server restarts and sync calls
    const baseDate = new Date("2026-06-12T12:00:00Z");

    for (let i = 0; i < limit; i++) {
      // Deterministic rating (3, 4, or 5)
      const rating = (i % 3) + 3;
      
      // Deterministic date spaced by 8 hours
      const reviewDate = new Date(baseDate.getTime() - i * 8 * 60 * 60 * 1000); 

      const author = authors[i % authors.length];
      const text = comments[i % comments.length];
      const stableDateStr = reviewDate.toISOString().slice(0, 10);

      // Create a stable externalReviewId to avoid duplicate syncs
      const externalReviewId = crypto
        .createHash("md5")
        .update(`google_fallback_${branchPlatformId}_${author}_${stableDateStr}_${rating}`)
        .digest("hex");

      mockReviews.push({
        source: ReviewSource.GOOGLE_MAPS,
        branchId: "",
        externalReviewId,
        author,
        rating,
        text,
        reviewUrl: `https://maps.google.com/review?id=${branchPlatformId}_${i}`,
        reviewDate,
      });
    }
    return mockReviews;
  }
  async replyToReview(
    branchPlatformId: string,
    reviewExternalId: string,
    replyText: string,
    extra?: { author?: string; text?: string }
  ): Promise<{ success: boolean; errorMessage?: string }> {
    console.log(`[Google Connector] replyToReview called for review ${reviewExternalId}`);

    // Try API method first if credentials exist
    if (this.clientId && this.clientSecret && this.refreshToken) {
      try {
        console.log("[Google Connector] Attempting to reply to review via API...");
        const authenticated = await this.authenticate();
        if (authenticated && this.accessToken) {
          // branchPlatformId can be like: accounts/123/locations/456
          // reviewExternalId is reviewId
          let reviewName = "";
          if (reviewExternalId.startsWith("accounts/")) {
            reviewName = reviewExternalId;
          } else if (branchPlatformId.startsWith("accounts/")) {
            reviewName = `${branchPlatformId}/reviews/${reviewExternalId}`;
          } else {
            reviewName = `accounts/-/locations/${branchPlatformId}/reviews/${reviewExternalId}`;
          }

          const url = `https://mybusiness.googleapis.com/v4/${reviewName}/reply`;
          console.log(`[Google Connector] API PUT Request to: ${url}`);
          const res = await fetch(url, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ comment: replyText }),
          });

          if (res.ok) {
            console.log("[Google Connector] Reply posted successfully via API!");
            return { success: true };
          } else {
            const errorText = await res.text();
            console.warn(`[Google Connector] API reply failed: HTTP ${res.status} - ${errorText}. Falling back to browser automation...`);
          }
        }
      } catch (apiErr: any) {
        console.warn(`[Google Connector] API reply error: ${apiErr.message}. Falling back to browser automation...`);
      }
    }

    // Fallback: Playwright browser automation
    console.log("[Google Connector] Falling back to Playwright browser automation for reply...");
    const storageState = process.env.GOOGLE_BUSINESS_STORAGE_STATE ?? './storage/google.json';
    const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'false') === 'true';

    let browser: import('playwright').Browser | null = null;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless, channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined });
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1440, height: 900 },
        locale: 'ru-RU',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      });

      // Disable webdriver detection
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const page = await context.newPage();

      // Navigate to Google Business reviews page
      const reviewsUrl = branchPlatformId.startsWith('accounts/')
        ? `https://business.google.com/${branchPlatformId}/reviews`
        : `https://business.google.com/reviews`;
      
      console.log(`[Google Connector] Navigating to ${reviewsUrl}`);
      await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);

      // Search for the specific review card by author name across pages
      let replyBtn;
      let found = false;
      let targetReviewCard: any = null;

      for (let pageNum = 1; pageNum <= 10; pageNum++) {
        // Wait for reviews to load on current page
        await page.waitForSelector('.DsOcnf', { state: 'visible', timeout: 10000 }).catch(() => {
          console.log(`[Google Connector] Timeout waiting for reviews to load on page ${pageNum}`);
        });
        await page.waitForTimeout(2000);

        console.log(`[Google Connector] Searching page ${pageNum} for review card with author: ${extra?.author}`);
        
        const authorName = extra?.author?.trim() || "";
        let reviewCard = page.locator('.DsOcnf')
          .filter({ has: page.locator('a.LH5kS', { hasText: authorName }) })
          .first();

        if (!await reviewCard.isVisible().catch(() => false)) {
          reviewCard = page.locator('.DsOcnf')
            .filter({ has: page.locator('[class*="author"], [class*="User"], [class*="name"], [class*="Name"]').filter({ hasText: authorName }) })
            .first();
        }

        if (!await reviewCard.isVisible().catch(() => false)) {
          reviewCard = page.locator('.DsOcnf').filter({ hasText: authorName }).first();
        }

        if (await reviewCard.isVisible().catch(() => false)) {
          const cardReplyBtn = reviewCard.getByRole('button', { name: /Ответить|Reply|Изменить|Edit/i }).first();
          if (await cardReplyBtn.isVisible().catch(() => false)) {
            replyBtn = cardReplyBtn;
            targetReviewCard = reviewCard;
            found = true;
            break;
          }
        }

        // Try to click Next Page if not found
        const nextBtn = page.locator('button:has-text("navigate_next")');
        const isVisible = await nextBtn.isVisible().catch(() => false);
        const isEnabled = isVisible && await nextBtn.isEnabled().catch(() => false);
        
        if (isEnabled) {
          console.log(`[Google Connector] Author not found on page ${pageNum}. Navigating to next page...`);
          try {
            await nextBtn.click({ timeout: 5000 });
          } catch {
            console.log('[Google Connector] Could not click next page button.');
            break;
          }
        } else {
          break;
        }
      }

      if (!found || !replyBtn || !targetReviewCard) {
        const msg = `Google: Review card for author "${extra?.author || ''}" not found in reviews list`;
        console.error(`[Google Connector] ${msg}`);
        return { success: false, errorMessage: msg };
      }

      try {
        await replyBtn.waitFor({ state: 'visible', timeout: 10_000 });
        await replyBtn.click();
        await page.waitForTimeout(1500);

        // Type the reply in the textarea that appears inside targetReviewCard
        const replyInput = targetReviewCard.locator('textarea, [contenteditable="true"]').last();
        await replyInput.waitFor({ state: 'visible', timeout: 5000 });
        await replyInput.focus();
        
        // Clear existing reply using keyboard to trigger event listeners
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(500);

        // Type using keyboard to ensure the Publish button gets enabled
        await page.keyboard.type(replyText);
        await page.waitForTimeout(1000);

        // Submit the reply
        const submitBtn = targetReviewCard.getByRole('button', { name: /Опубликовать|Publish|Сохранить|Submit|Send/i }).last();
        const isSubmitEnabled = await submitBtn.isVisible().catch(() => false) && await submitBtn.isEnabled().catch(() => false);

        if (isSubmitEnabled) {
          await submitBtn.click();
        } else {
          console.warn('[Google Connector] Submit button is not enabled or visible inside card. Sending Enter key...');
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(3000);

        console.log(`[Google Connector] Reply posted successfully via Playwright`);
        return { success: true };
      } catch (e: any) {
        const msg = `Google: Reply button not found or failed: ${e.message}`;
        console.error(`[Google Connector] ${msg}`);
        return { success: false, errorMessage: msg };
      }
    } catch (err: any) {
      const msg = `Google Playwright error: ${err.message}`;
      console.error(`[Google Connector] ${msg}`);
      return { success: false, errorMessage: msg };
    } finally {
      await browser?.close();
    }
  }
}

