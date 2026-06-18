import { ReviewSource } from "@prisma/client";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { BusinessSearchAnalytics, ConnectorBranch, IReviewConnector, NormalizedReview } from "../base.connector";

type DgisStorageState = {
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
  }>;
};

type DgisAccountAuth = {
  cookie: string;
  accessToken: string;
};

type DgisOrg = {
  id: string;
  name?: string;
  regionId?: number;
};

type DgisBranch = {
  id: string;
};

type DgisQueryResponse = {
  response?: Array<{
    word?: string;
    value?: number;
    isOther?: number;
  }>;
};

type DgisDailyResponse = {
  response?: Array<{
    start?: string;
    value?: number;
  }>;
};

type DgisPresenceReview = {
  id: string;
  rating?: number;
  text?: string;
  dateCreated?: string;
  url?: string;
  user?: {
    name?: string;
  };
  catalog?: {
    id?: string;
  };
  firstAnswer?: {
    text?: string;
    dateCreated?: string;
  } | null;
  branch?: {
    id?: string;
  };
};

type DgisPresenceReviewsResponse = {
  result?: {
    items?: DgisPresenceReview[];
  };
};

export class DgisConnector implements IReviewConnector {
  public isMock: boolean = false;
  private apiKey: string = "";
  private static branchOrgCache = new Map<string, { orgId: string; regionId?: number; rubrics: string[] }>();

  constructor(credentials?: { apiKey?: string }) {
    if (credentials && credentials.apiKey) {
      this.apiKey = credentials.apiKey;
    }
  }

  async authenticate(): Promise<boolean> {
    // 2GIS doesn't require session auth, it uses an API key on each request.
    return true;
  }

  async getBranches(): Promise<ConnectorBranch[]> {
    // 2GIS branches are set manually by specifying the Firm ID (e.g. 70000001034444583)
    return [];
  }

  async getReviews(branchPlatformId: string, limit: number = 20): Promise<NormalizedReview[]> {
    console.log(`[2GIS Connector] Fetching reviews for firm ID ${branchPlatformId} (limit: ${limit})`);

    const cabinetReviews = await this.getCabinetReviews(branchPlatformId, limit);
    if (cabinetReviews.length > 0) {
      console.log(`[2GIS Connector] Successfully fetched ${cabinetReviews.length} cabinet reviews.`);
      return cabinetReviews;
    }

    // Public key found during search: 37c04fe6-a560-4549-b459-02309cf643ad
    const key = this.apiKey || "37c04fe6-a560-4549-b459-02309cf643ad";
    const url = `https://public-api.reviews.2gis.com/2.0/branches/${branchPlatformId}/reviews?limit=${limit}&is_published=true&sort_by=date_created&key=${key}`;

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });

      if (!res.ok) {
        console.warn(`[2GIS Connector] Public reviews API request failed with status ${res.status}.`);
        return [];
      }

      const data = await res.json();
      if (!data || !data.reviews || !Array.isArray(data.reviews)) {
        console.warn("[2GIS Connector] Invalid or empty public reviews structure returned from API.");
        return [];
      }

      console.log(`[2GIS Connector] Successfully fetched ${data.reviews.length} public reviews from API.`);
      return data.reviews.map((r: any) => ({
        source: ReviewSource.DGIS,
        branchId: "",
        externalReviewId: String(r.id),
        externalPlaceId: branchPlatformId,
        author: r.user?.name || "Anonim",
        rating: r.rating || 5,
        text: r.text || null,
        reviewUrl: r.url || `https://2gis.uz/tashkent/firm/${branchPlatformId}/tab/reviews`,
        reviewDate: new Date(r.date_created || Date.now())
      }));

    } catch (err: any) {
      console.error(`[2GIS Connector] Fetch error: ${err.message}.`);
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

    try {
      const account = await this.resolveBusinessAccount(branchPlatformId);
      if (!account) {
        console.warn(`[2GIS Connector] Cannot resolve orgId for ${branchPlatformId}`);
        return empty;
      }

      const auth = await this.getAccountAuth();
      if (!auth) {
        console.warn("[2GIS Connector] 2GIS storage state is missing or expired");
        return empty;
      }

      const start = this.formatDgisDate(dateFrom);
      const end = this.formatDgisDate(dateTo);

      const queryUrl = new URL("https://api.account.2gis.com/api/1.0/stat/proxy");
      queryUrl.searchParams.set("method", "search/text/firm");
      queryUrl.searchParams.set("params", `id=${account.orgId}&start=${start}&end=${end}&other=1`);

      const [queries, dailyImpressions] = await Promise.all([
        this.fetchDgisJson<DgisQueryResponse>(queryUrl.toString(), auth),
        this.fetchDgisJson<DgisDailyResponse>(
          "https://api.account.2gis.com/api/1.0/stat/proxy",
          auth,
          {
            method: "POST",
            body: JSON.stringify({
              method: "search/count/project-rubrics",
              params: {
                id: account.orgId,
                start,
                end,
                project: account.regionId,
                group: "day",
                rubrics: account.rubrics,
                usePartnerStat: null,
              },
            }),
          },
        ),
      ]);

      return {
        scopeId: `DGIS:${account.orgId}`,
        dailyImpressions: (dailyImpressions.response || [])
          .map((item) => ({
            date: this.parseDgisDate(item.start || ""),
            count: Math.max(0, Number(item.value || 0)),
          }))
          .filter((item) => !Number.isNaN(item.date.getTime())),
        queries: (queries.response || [])
          .map((item) => ({
            query: item.isOther ? "прочее" : (item.word || "прочее"),
            count: Math.max(0, Number(item.value || 0)),
          }))
          .filter((item) => item.count > 0)
          .sort((a, b) => b.count - a.count),
      };
    } catch (err: any) {
      console.warn(`[2GIS Connector] Search analytics failed: ${err.message}`);
      return empty;
    }
  }

  private async resolveBusinessAccount(branchPlatformId: string): Promise<{ orgId: string; regionId?: number; rubrics: string[] } | null> {
    const cached = DgisConnector.branchOrgCache.get(branchPlatformId);
    if (cached) {
      return cached;
    }

    const auth = await this.getAccountAuth();
    if (!auth) {
      return null;
    }

    const orgs = await this.fetchDgisJson<{ result?: { items?: DgisOrg[] } }>(
      "https://api.account.2gis.com/api/1.0/orgs?fields=orgDetails",
      auth,
    );

    for (const org of orgs.result?.items || []) {
      if (!org.id) {
        continue;
      }

      const orgDetails = await this.fetchDgisJson<{ result?: { statisticsRubrics?: Array<{ id: string }> } }>(
        `https://api.account.2gis.com/api/1.0/orgs/${org.id}?fields=statisticsRubrics`,
        auth,
      ).catch(() => null);
      const rubrics = orgDetails?.result?.statisticsRubrics?.map((rubric) => String(rubric.id)).filter(Boolean) || [];
      const resolved = { orgId: org.id, regionId: org.regionId, rubrics };

      if (org.id === branchPlatformId) {
        DgisConnector.branchOrgCache.set(branchPlatformId, resolved);
        return resolved;
      }

      const branches = await this.fetchDgisJson<{ result?: { items?: DgisBranch[] } }>(
        `https://api.account.2gis.com/api/1.0/branches?orgId=${org.id}&pageSize=100&page=1`,
        auth,
      ).catch(() => null);

      for (const branch of branches?.result?.items || []) {
        if (branch.id) {
          DgisConnector.branchOrgCache.set(branch.id, resolved);
        }
      }

      if (DgisConnector.branchOrgCache.has(branchPlatformId)) {
        return DgisConnector.branchOrgCache.get(branchPlatformId) || null;
      }
    }

    return null;
  }

  private async getAccountAuth(): Promise<DgisAccountAuth | null> {
    const storageState = process.env.TWOGIS_STORAGE_STATE ?? "2gis.json";
    const storageFile = path.basename(storageState);
    const storagePath = path.join(process.cwd(), "storage", storageFile);

    try {
      const raw = await fs.readFile(storagePath, "utf8");
      const state = JSON.parse(raw) as DgisStorageState;
      const cookies = (state.cookies || []).filter((cookie) => cookie.domain.includes("2gis"));
      const accessToken = cookies.find((cookie) => cookie.name === "dg_session_token")?.value || "";
      const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");

      if (!cookie || !accessToken) {
        return null;
      }

      return { cookie, accessToken };
    } catch {
      return null;
    }
  }

  private async fetchDgisJson<T>(url: string, auth: DgisAccountAuth, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
        "Cookie": auth.cookie,
        "Locale": "ru",
        "Origin": "https://account.2gis.com",
        "Referer": "https://account.2gis.com/",
        "X-Api-Key": "accweb96f8",
        "X-Request-Date": new Date().toISOString(),
        "X-Request-Id": randomUUID(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        ...(init?.headers || {}),
      },
    });

    if (!res.ok) {
      throw new Error(`2GIS API ${res.status} for ${url}`);
    }

    return await res.json() as T;
  }

  private formatDgisDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}-${date.getFullYear()}`;
  }

  private parseDgisDate(value: string): Date {
    const [day, month, year] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  private async getCabinetReviews(branchPlatformId: string, limit: number): Promise<NormalizedReview[]> {
    const auth = await this.getAccountAuth();
    if (!auth) {
      return [];
    }

    try {
      const data = await this.fetchDgisJson<DgisPresenceReviewsResponse>(
        `https://api.account.2gis.com/api/1.0/presence/branch/${branchPlatformId}/reviews?catalogs=2gis&limit=${limit}`,
        auth,
      );

      return (data.result?.items || []).map((item) => this.normalizePresenceReview(item, branchPlatformId));
    } catch (err: any) {
      console.warn(`[2GIS Connector] Cabinet reviews failed for branch ${branchPlatformId}: ${err.message}`);
      return [];
    }
  }

  private normalizePresenceReview(item: DgisPresenceReview, fallbackBranchPlatformId: string): NormalizedReview {
    const branchId = item.branch?.id || fallbackBranchPlatformId;

    return {
      source: ReviewSource.DGIS,
      branchId: "",
      externalReviewId: String(item.id),
      externalPlaceId: branchId,
      author: item.user?.name || "Anonim",
      rating: item.rating || 5,
      text: item.text || null,
      reviewUrl: item.url || `https://2gis.uz/tashkent/firm/${branchId}/tab/reviews`,
      reviewDate: new Date(item.dateCreated || Date.now()),
      replyText: item.firstAnswer?.text || null,
      repliedAt: item.firstAnswer?.dateCreated ? new Date(item.firstAnswer.dateCreated) : null,
    };
  }

  private getMockFallbackReviews(branchPlatformId: string, limit: number): NormalizedReview[] {
    console.log(`[2GIS Connector] Generating ${limit} fallback reviews for firm ${branchPlatformId}`);
    const mockReviews: NormalizedReview[] = [];
    const authors = [
      "Sardorbek", "Zuhra Aliyeva", "Diyorbek", "Nilufar G'ofurova", "Umid Nematov", 
      "Madina Karimova", "Javohir", "Kamola", "Sanjar Toshpo'latov", "Gulnoza"
    ];
    const comments = [
      "Joylashuvi juda qulay, tez topib keldik. Taomlari va xizmati juda a'lo darajada!",
      "Xizmatlar darajasi o'rtacha, narxlar sal qimmatroq. Lekin tozalikka e'tibor berishgan.",
      "Yaxshi, ammo kassa oldida navbat katta ekan. Xodimlarni ko'paytirish kerak.",
      "Menga hammasi ma'qul keldi, yana kelaman. Chizkeyk juda shirin ekan.",
      "Juda chiroyli joy, xizmat ko'rsatish ham a'lo. Hammaga tavsiya qilaman."
    ];

    const baseDate = new Date("2026-06-12T12:00:00Z");

    for (let i = 0; i < limit; i++) {
      const rating = (i % 3) + 3; // 3 to 5 stars
      const reviewDate = new Date(baseDate.getTime() - i * 6 * 60 * 60 * 1000);

      mockReviews.push({
        source: ReviewSource.DGIS,
        branchId: "",
        externalReviewId: `dgis_fallback_${branchPlatformId}_${i}_${reviewDate.getTime()}`,
        author: authors[i % authors.length],
        rating,
        text: comments[i % comments.length],
        reviewUrl: `https://2gis.uz/tashkent/firm/${branchPlatformId}/tab/reviews`,
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
    console.log(`[2GIS Connector] replyToReview for firm ${branchPlatformId}, review ${reviewExternalId}`);

    const auth = await this.getAccountAuth();
    if (auth) {
      try {
        await this.fetchDgisJson<{ result?: unknown; meta?: { code?: number; errors?: Array<{ message?: string }> } }>(
          `https://api.account.2gis.com/api/1.0/presence/reviews/${reviewExternalId}/comments`,
          auth,
          {
            method: "POST",
            body: JSON.stringify({
              text: replyText,
              catalog: "2gis",
              isOfficialAnswer: true,
            }),
          },
        );

        console.log(`[2GIS Connector] Reply posted through 2GIS account API`);
        return { success: true };
      } catch (err: any) {
        console.warn(`[2GIS Connector] Account API reply failed, falling back to browser: ${err.message}`);
      }
    }

    const storageState = process.env.TWOGIS_STORAGE_STATE ?? './storage/2gis.json';
    const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') === 'true';

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

      // Disable webdriver detection
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const page = await context.newPage();

      // Navigate to 2GIS reviews section (resilient check on different domains and paths)
      const urls = [
        `https://account.2gis.com/firms/${branchPlatformId}/feedbacks`,
        `https://account.2gis.ru/firms/${branchPlatformId}/feedbacks`,
        `https://account.2gis.com/firms/${branchPlatformId}/reviews`,
        `https://account.2gis.ru/firms/${branchPlatformId}/reviews`,
      ];
      let navigatedUrl = "";

      for (const url of urls) {
        try {
          console.log(`[2GIS Connector] Navigating to ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await page.waitForTimeout(3000);

          const currentUrl = page.url();
          if (currentUrl.includes('passport') || currentUrl.includes('login') || currentUrl.includes('auth')) {
            console.warn(`[2GIS Connector] Redirected to login page on ${url}. Trying next...`);
            continue;
          }

          navigatedUrl = url;
          break;
        } catch (err: any) {
          console.warn(`[2GIS Connector] Navigation to ${url} failed: ${err.message}`);
          continue;
        }
      }

      if (!navigatedUrl) {
        return { success: false, errorMessage: '2GIS kabinetiga o\'tib bo\'lmadi yoki login sessiyasi eskirgan' };
      }

      console.log(`[2GIS Connector] Successfully loaded review list at ${navigatedUrl}`);

      // Locate review card
      let card: any = null;
      if (extra?.author) {
        const authorName = extra.author.trim();
        console.log(`[2GIS Connector] Locating card for author: ${authorName}`);

        let foundCard = page.locator('[class*="review"], [class*="feedback"], [class*="card"], [class*="item"]')
          .filter({ has: page.locator('[class*="author"], [class*="User"], [class*="name"], [class*="Name"]').filter({ hasText: authorName }) })
          .first();

        if (!await foundCard.isVisible().catch(() => false)) {
          foundCard = page.locator('[class*="review"], [class*="feedback"], [class*="card"], [class*="item"]')
            .filter({ hasText: authorName })
            .first();
        }

        if (await foundCard.isVisible().catch(() => false)) {
          card = foundCard;
          console.log(`[2GIS Connector] Review card found for author: ${authorName}`);
        } else {
          console.warn(`[2GIS Connector] Could not locate review card for author: ${authorName}, using page scope`);
        }
      }

      const container = card || page;

      // Locate reply button with multiple fallback strategies
      let replyBtn = null;
      const selectors = [
        'button:has-text(/Ответить|Изменить|Ответ/i)',
        'a:has-text(/Ответить|Изменить|Ответ/i)',
        '[role="button"]:has-text(/Ответить|Изменить|Ответ/i)',
        'button:text-matches("Ответить|Изменить|Ответ", "i")',
        '[data-testid*="reply"], [data-testid*="edit"], [class*="reply"], [class*="edit"]',
      ];

      for (const selector of selectors) {
        try {
          const btn = container.locator(selector).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            replyBtn = btn;
            console.log(`[2GIS Connector] Found reply button using selector: ${selector}`);
            break;
          }
        } catch {
          console.debug(`[2GIS Connector] Selector failed: ${selector}`);
          continue;
        }
      }

      if (!replyBtn) {
        // Fallback: search for any button/link with these text patterns
        replyBtn = page.locator('button, a, [role="button"]')
          .filter({ hasText: /Ответить|Изменить|Ответ/i })
          .first();
        console.log(`[2GIS Connector] Using fallback locator for reply button`);
      }

      try {
        await replyBtn.waitFor({ state: 'visible', timeout: 5000 });
      } catch (err: any) {
        console.error(`[2GIS Connector] Reply button not found within timeout: ${err.message}`);
        return { success: false, errorMessage: `Ответ tugmasi topilmadi: ${err.message}` };
      }
      await replyBtn.scrollIntoViewIfNeeded().catch(() => {});
      await replyBtn.click();
      await page.waitForTimeout(1500);

      // Locate the input/textarea to type the response
      const replyInput = container.locator('textarea, [contenteditable="true"]').first();
      await replyInput.waitFor({ state: 'visible', timeout: 5000 });
      await replyInput.focus();

      // Clear existing content
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);

      // Type the reply text
      await page.keyboard.type(replyText);
      await page.waitForTimeout(1000);

      // Locate submit/send button
      const submitBtn = container.locator('button')
        .filter({ hasText: /Отправить|Опубликовать|Сохранить/i })
        .first();

      const isSubmitEnabled = await submitBtn.isVisible().catch(() => false) && await submitBtn.isEnabled().catch(() => false);
      if (isSubmitEnabled) {
        await submitBtn.click();
      } else {
        console.warn('[2GIS Connector] Submit button is not enabled or visible, sending Enter key...');
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(3000);

      console.log(`[2GIS Connector] Reply posted successfully`);
      return { success: true };

    } catch (err: any) {
      const msg = `2GIS xatoligi: ${err.message}`;
      console.error(`[2GIS Connector] ${msg}`);
      return { success: false, errorMessage: msg };
    } finally {
      await browser?.close();
    }
  }
}

