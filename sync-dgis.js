const { PrismaClient, ReviewSource } = require("@prisma/client");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { saveAndAlertReview } = require("./src/lib/sync-helper");

// Load environment variables from .env file
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

const prisma = new PrismaClient();
const SESSION_PATH = path.join(__dirname, "storage/2gis.json");

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseDgisDate(dateText) {
  if (!dateText) return new Date();

  const now = new Date();
  const cleaned = dateText.trim().toLowerCase();

  if (cleaned.includes("сегодня")) {
    const timePart = cleaned.match(/(\d{1,2}):(\d{2})/);
    if (timePart) {
      const hours = parseInt(timePart[1], 10);
      const minutes = parseInt(timePart[2], 10);
      now.setHours(hours, minutes, 0, 0);
    }
    return now;
  }

  if (cleaned.includes("вчера")) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const timePart = cleaned.match(/(\d{1,2}):(\d{2})/);
    if (timePart) {
      const hours = parseInt(timePart[1], 10);
      const minutes = parseInt(timePart[2], 10);
      yesterday.setHours(hours, minutes, 0, 0);
    }
    return yesterday;
  }

  const daysAgoMatch = cleaned.match(/(\d+)\s*дн?[яей]?.*назад/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    const dateAgo = new Date(now);
    dateAgo.setDate(dateAgo.getDate() - days);
    const timePart = cleaned.match(/(\d{1,2}):(\d{2})/);
    if (timePart) {
      const hours = parseInt(timePart[1], 10);
      const minutes = parseInt(timePart[2], 10);
      dateAgo.setHours(hours, minutes, 0, 0);
    }
    return dateAgo;
  }

  const monthMap = {
    "января": 0, "февраля": 1, "марта": 2, "апреля": 3, "мая": 4, "июня": 5,
    "июля": 6, "августа": 7, "сентября": 8, "октября": 9, "ноября": 10, "декабря": 11,
    "янв": 0, "фев": 1, "мар": 2, "апр": 3, "июн": 5,
    "июл": 6, "авг": 7, "сен": 8, "окт": 9, "ноя": 10, "дек": 11
  };

  for (const [monthName, monthIdx] of Object.entries(monthMap)) {
    if (cleaned.includes(monthName)) {
      const dateMatch = cleaned.match(/(\d{1,2})\s+[а-яА-ЯёЁ.]+\s+(\d{4})/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const year = parseInt(dateMatch[2], 10);
        const timePart = cleaned.match(/(\d{1,2}):(\d{2})/);
        let hours = 0, minutes = 0;
        if (timePart) {
          hours = parseInt(timePart[1], 10);
          minutes = parseInt(timePart[2], 10);
        }
        return new Date(year, monthIdx, day, hours, minutes, 0, 0);
      }
    }
  }

  return new Date();
}

async function scrapeDgisReviewsWithSession(firmId, sessionPath, limit = 50) {
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`Session file not found at ${sessionPath}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const storageState = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    const context = await browser.newContext({
      storageState,
      viewport: { width: 1440, height: 900 },
      locale: "ru-RU",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    });

    const page = await context.newPage();
    const url = `https://account.2gis.ru/firms/${firmId}/feedbacks`;

    console.log(`  -> Opening authenticated account: ${url}`);
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    // Check for auth errors (redirected to login, 401, etc)
    if (response.status() === 401 || response.url().includes('/login')) {
      throw new Error("Session expired or invalid. Please re-authenticate.");
    }

    // Wait for feedback list to load
    await page.waitForSelector('[data-review], article, .feedback-item', { timeout: 20000 }).catch(() => {
      console.log(`  -> Warning: selector not found, attempting to scroll anyway`);
    });

    await delay(2000);

    // Load all reviews by scrolling
    let previousCount = 0;
    let stableCount = 0;
    for (let scroll = 0; scroll < 10 && stableCount < 2; scroll++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await delay(2000);

      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-review], article, .feedback-item').length;
      });

      if (currentCount === previousCount) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      previousCount = currentCount;
    }

    // Extract reviews from page
    const reviews = await page.evaluate((firmId) => {
      const items = document.querySelectorAll('[data-review], article, .feedback-item');
      const parsed = [];

      items.forEach((item, idx) => {
        try {
          // Author name
          let author = "Anonim";
          const authorEl = item.querySelector('[data-author-name], .author-name, [class*="author"], span[class*="user"]');
          if (authorEl?.textContent?.trim()) {
            author = authorEl.textContent.trim();
          }

          // Rating (look for data attribute or star count)
          let rating = 5;
          const ratingEl = item.querySelector('[data-rating], [class*="rating"], [class*="stars"]');
          if (ratingEl) {
            const ratingVal = ratingEl.getAttribute('data-rating') || ratingEl.getAttribute('data-value');
            if (ratingVal) {
              rating = Math.min(5, Math.max(1, parseInt(ratingVal, 10)));
            }
          }

          // Review text
          let text = "";
          const textEl = item.querySelector('[data-text], .feedback-text, [class*="text"], p');
          if (textEl?.textContent?.trim()) {
            text = textEl.textContent.trim();
          }

          // Date
          let dateText = "";
          const dateEl = item.querySelector('[data-date], time, [class*="date"], [class*="time"]');
          if (dateEl?.textContent?.trim()) {
            dateText = dateEl.textContent.trim();
          }

          // Review ID
          let externalReviewId = item.getAttribute('data-review-id') ||
                                 item.getAttribute('id') ||
                                 `dgis_${idx}_${Date.now()}`;

          if (text && text.length > 5) {
            parsed.push({
              externalReviewId: String(externalReviewId),
              author,
              rating,
              text,
              dateText,
              reviewUrl: `https://account.2gis.ru/firms/${firmId}/feedbacks`
            });
          }
        } catch (e) {
          console.error(`Parse error item ${idx}:`, e.message);
        }
      });

      return parsed;
    }, firmId);

    console.log(`  -> ✅ Successfully extracted ${reviews.length} reviews from account`);
    return reviews;

  } catch (err) {
    console.error(`  -> ❌ Session scraping error:`, err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("==================================================");
  console.log("🚀 2GIS AUTHENTICATED SESSION SYNC (Variant B)");
  console.log("==================================================");

  // Check if session file exists
  if (!fs.existsSync(SESSION_PATH)) {
    console.error(`\n❌ CRITICAL ERROR: Session file not found at ${SESSION_PATH}`);
    console.error("   You need to authenticate first. See SETUP.md for instructions.");
    process.exit(1);
  }

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: { platformIds: true }
  });

  console.log(`Loaded ${branches.length} active branches.\n`);

  for (const branch of branches) {
    console.log(`--------------------------------------------------`);
    console.log(`Processing Branch: "${branch.name}"`);

    const platformMapping = branch.platformIds.find(p => p.source === ReviewSource.DGIS);
    const firmId = platformMapping?.platformId;

    if (!firmId) {
      console.log(`  -> ⚠️ 2GIS Firm ID not configured. Skipping.`);
      continue;
    }

    console.log(`  -> 2GIS Firm ID: ${firmId}`);
    const startedAt = new Date();
    let logId = null;

    try {
      // Create sync log
      const log = await prisma.reviewSyncLog.create({
        data: {
          source: ReviewSource.DGIS,
          branchId: branch.id,
          status: "RUNNING",
          startedAt
        }
      });
      logId = log.id;

      // Scrape reviews using authenticated session
      let reviews = [];
      try {
        reviews = await scrapeDgisReviewsWithSession(firmId, SESSION_PATH, 50);
      } catch (sessionErr) {
        console.error(`  -> 🔴 Session error: ${sessionErr.message}`);
        if (sessionErr.message.includes("expired") || sessionErr.message.includes("invalid")) {
          console.error(`     Session needs to be renewed. Run: node scripts/auth-2gis.js`);
        }
        throw sessionErr;
      }

      console.log(`  -> Found total: ${reviews.length} reviews`);

      let newCount = 0;
      let dupCount = 0;
      let errors = [];

      for (const rawReview of reviews) {
        try {
          // Check if review already exists in database
          const exists = await prisma.review.findUnique({
            where: {
              source_externalReviewId: {
                source: ReviewSource.DGIS,
                externalReviewId: rawReview.externalReviewId
              }
            }
          });

          if (exists) {
            dupCount++;
            continue;
          }

          // Parse Cyrillic date
          if (!rawReview.reviewDate) {
            rawReview.reviewDate = parseDgisDate(rawReview.dateText);
          }

          // Save review and send alert
          await saveAndAlertReview(rawReview, branch.id, branch.name, ReviewSource.DGIS);
          newCount++;
        } catch (reviewErr) {
          errors.push(`Review ${rawReview.externalReviewId}: ${reviewErr.message}`);
        }
      }

      console.log(`  -> Results: ${newCount} new, ${dupCount} duplicates`);
      if (errors.length > 0) {
        console.log(`  -> Errors: ${errors.length}`);
        errors.slice(0, 3).forEach(e => console.log(`     - ${e}`));
      }

      // Update sync log
      if (logId) {
        await prisma.reviewSyncLog.update({
          where: { id: logId },
          data: {
            status: "COMPLETED",
            syncedReviews: newCount,
            duplicates: dupCount,
            totalFound: reviews.length,
            finishedAt: new Date()
          }
        });
      }
    } catch (err) {
      console.error(`  -> ❌ Branch sync failed: ${err.message}`);
      if (logId) {
        await prisma.reviewSyncLog.update({
          where: { id: logId },
          data: {
            status: "FAILED",
            error: err.message,
            finishedAt: new Date()
          }
        });
      }
    }
  }

  await prisma.$disconnect();
  console.log("\n==================================================");
  console.log("✅ 2GIS Sync Complete!");
  console.log("==================================================\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
