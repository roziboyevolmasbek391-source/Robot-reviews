const { PrismaClient, ReviewSource } = require("@prisma/client");
const puppeteer = require("puppeteer");
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

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "your-fallback-32-char-encryption-key-for-dev!!";
const IV_LENGTH = 16;

// Local decryption helper removed in favor of central sync-helper.js

const months = {
  "января": 0, "февраля": 1, "марта": 2, "апреля": 3, "мая": 4, "июня": 5,
  "июля": 6, "августа": 7, "сентября": 8, "октября": 9, "ноября": 10, "декабря": 11
};

function parseRussianDate(dateStr) {
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

// Local Telegram alert helper removed in favor of central sync-helper.js

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeYandexReviews(orgId, limit = 20) {
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
          break;
        }
      }
    } catch (err) {
      // Ignore domain fetch failures and try next
    }
  }

  if (!html) {
    throw new Error(`Failed to fetch reviews widget for org ID ${orgId}`);
  }

  const reviews = [];
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
      author,
      rating,
      text,
      reviewUrl,
      reviewDate,
      externalReviewId
    });
  }

  return reviews;
}

async function main() {
  console.log("==================================================");
  console.log("🚀 YANDEX MAPS SYNC & AUTO-DISCOVERY START");
  console.log("==================================================");

  // 1. Fetch active branches
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: { platformIds: true }
  });

  console.log(`Loaded ${branches.length} active branches from database.`);

  // 2. Launch Puppeteer for auto-discovery
  console.log("\nLaunching Puppeteer for auto-discovery...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    for (const branch of branches) {
      console.log(`\n--------------------------------------------------`);
      console.log(`Processing Branch: "${branch.name}"`);
      console.log(`Address: "${branch.address}"`);

      let platformMapping = branch.platformIds.find(p => p.source === ReviewSource.YANDEX_MAPS);
      let orgId = platformMapping?.platformId;

      // Check if Yandex Maps ID is missing
      if (!orgId) {
        console.log(`  -> 🔍 Yandex Maps Org ID is missing. Attempting auto-discovery...`);
        const searchQuery = `Mazzali ${branch.address}`;
        const searchUrl = `https://yandex.ru/maps/10335/tashkent/search/${encodeURIComponent(searchQuery)}/`;

        try {
          await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 25000 });
          await delay(3000);

          const currentUrl = page.url();
          const orgIdMatch = currentUrl.match(/\/org\/(\d+)/) || currentUrl.match(/\/org\/[^/]+\/(\d+)/);

          if (orgIdMatch) {
            orgId = orgIdMatch[1];
            console.log(`  -> 🎯 Auto-discovered Org ID (from redirect URL): ${orgId}`);
          } else {
            // Check links on page
            const orgLinks = await page.evaluate(() => {
              const links = document.querySelectorAll('a[href*="/org/"]');
              const results = [];
              links.forEach(link => {
                const href = link.getAttribute("href");
                const text = link.innerText || "";
                if (href) results.push({ href, text });
              });
              return results;
            });

            if (orgLinks.length > 0) {
              const firstLink = orgLinks[0].href;
              const linkMatch = firstLink.match(/\/org\/(\d+)/) || firstLink.match(/\/org\/[^/]+\/(\d+)/);
              if (linkMatch) {
                orgId = linkMatch[1];
                console.log(`  -> 🎯 Auto-discovered Org ID (from search result links): ${orgId}`);
              }
            }
          }

          if (orgId) {
            // Check if this Org ID is already mapped to another branch
            const existingMapping = await prisma.branchPlatformId.findUnique({
              where: {
                source_platformId: {
                  source: ReviewSource.YANDEX_MAPS,
                  platformId: orgId
                }
              },
              include: { branch: true }
            });

            if (existingMapping) {
              console.log(`  -> ⚠️ Discarded auto-discovered Org ID ${orgId} because it is already mapped to branch "${existingMapping.branch.name}".`);
              orgId = null; // Reset so we don't proceed to sync reviews under this branch
            } else {
              try {
                // Save to database
                platformMapping = await prisma.branchPlatformId.create({
                  data: {
                    branchId: branch.id,
                    source: ReviewSource.YANDEX_MAPS,
                    platformId: orgId
                  }
                });
                console.log(`  -> Saved new YANDEX_MAPS platform mapping to DB (Org ID: ${orgId})`);
              } catch (dbErr) {
                console.error(`  -> ❌ Failed to save platform mapping to DB:`, dbErr.message);
                orgId = null; // Reset
              }
            }
          } else {
            console.log(`  -> ❌ Yandex Maps Org ID could not be found for branch.`);
          }
        } catch (searchErr) {
          console.error(`  -> ❌ Search auto-discovery failed:`, searchErr.message);
        }
      } else {
        console.log(`  -> Yandex Maps Org ID already configured: ${orgId}`);
      }

      // If we have an Org ID, sync reviews
      if (orgId) {
        console.log(`  -> ⚡ Syncing reviews for Yandex Maps Org ID: ${orgId}...`);
        const startedAt = new Date();
        let logId = null;

        try {
          // Create sync log
          const log = await prisma.reviewSyncLog.create({
            data: {
              source: ReviewSource.YANDEX_MAPS,
              branchId: branch.id,
              status: "RUNNING",
              startedAt
            }
          });
          logId = log.id;

          const reviews = await scrapeYandexReviews(orgId, 20);
          console.log(`  -> Found ${reviews.length} reviews. Saving...`);

          let newCount = 0;
          let dupCount = 0;

          for (const rawReview of reviews) {
            const exists = await prisma.review.findUnique({
              where: {
                source_externalReviewId: {
                  source: ReviewSource.YANDEX_MAPS,
                  externalReviewId: rawReview.externalReviewId
                }
              }
            });

            if (exists) {
              dupCount++;
              continue;
            }

            await saveAndAlertReview(rawReview, branch.id, branch.name, ReviewSource.YANDEX_MAPS);
            newCount++;
          }

          console.log(`  -> Completed: ${newCount} new, ${dupCount} duplicates.`);

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

        } catch (syncErr) {
          console.error(`  -> ❌ Sync failed:`, syncErr.message);
          if (logId) {
            await prisma.reviewSyncLog.update({
              where: { id: logId },
              data: {
                status: "FAILED",
                error: syncErr.message,
                finishedAt: new Date()
              }
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Puppeteer automation error:", err);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log("🎉 SUCCESS: Sync complete!");
  console.log("==================================================");
}

main().catch(err => {
  console.error("Fatal error in main script:", err);
  prisma.$disconnect();
  process.exit(1);
});
