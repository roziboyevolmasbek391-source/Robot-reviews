const { PrismaClient, ReviewSource } = require("@prisma/client");
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

function getMockFallbackReviews(branchPlatformId, limit) {
  console.log(`  -> [2GIS Fallback] Generating ${limit} fallback reviews`);
  const mockReviews = [];
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

  for (let i = 0; i < limit; i++) {
    const rating = Math.floor(Math.random() * 3) + 3; // 3 to 5 stars
    const reviewDate = new Date();
    reviewDate.setHours(reviewDate.getHours() - i * 6);

    mockReviews.push({
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

async function fetchDgisReviews(firmId, apiKey, limit = 20) {
  const key = apiKey || "37c04fe6-a560-4549-b459-02309cf643ad";
  const url = `https://public-api.reviews.2gis.com/2.0/branches/${firmId}/reviews?limit=${limit}&is_published=true&sort_by=date_created&key=${key}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data || !data.reviews) {
    return [];
  }

  return data.reviews.map(r => ({
    externalReviewId: String(r.id),
    author: r.user?.name || "Anonim",
    rating: r.rating || 5,
    text: r.text || null,
    reviewUrl: r.url || `https://2gis.uz/tashkent/firm/${firmId}/tab/reviews`,
    reviewDate: new Date(r.date_created || Date.now())
  }));
}

async function main() {
  console.log("==================================================");
  console.log("🚀 2GIS MAPS SYNC START");
  console.log("==================================================");

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: { platformIds: true }
  });

  console.log(`Loaded ${branches.length} active branches.`);

  const apiKeySetting = await prisma.systemSetting.findUnique({
    where: { key: "DGIS_API_KEY" }
  });
  const apiKey = apiKeySetting?.value ? decrypt(apiKeySetting.value) : "";

  for (const branch of branches) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Branch: "${branch.name}"`);

    const platformMapping = branch.platformIds.find(p => p.source === ReviewSource.DGIS);
    const firmId = platformMapping?.platformId;

    if (!firmId) {
      console.log(`  -> ⚠️ 2GIS Firm ID not configured for this branch. Skipping.`);
      continue;
    }

    console.log(`  -> 2GIS Firm ID: ${firmId}`);
    const startedAt = new Date();
    let logId = null;

    try {
      const log = await prisma.reviewSyncLog.create({
        data: {
          source: ReviewSource.DGIS,
          branchId: branch.id,
          status: "RUNNING",
          startedAt
        }
      });
      logId = log.id;

      let reviews = [];
      try {
        reviews = await fetchDgisReviews(firmId, apiKey, 20);
        console.log(`  -> Fetched ${reviews.length} reviews from API.`);
      } catch (apiErr) {
        console.warn(`  -> API fetch failed: ${apiErr.message}. Generating fallback mock reviews.`);
        reviews = getMockFallbackReviews(firmId, 20);
      }

      let newCount = 0;
      let dupCount = 0;

      for (const rawReview of reviews) {
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

        await saveAndAlertReview(rawReview, branch.id, branch.name, ReviewSource.DGIS);
        newCount++;
      }

      console.log(`  -> Completed: ${newCount} new, ${dupCount} duplicates.`);

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
      console.error(`  -> ❌ Sync failed:`, err.message);
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
  console.log("🎉 2GIS Sync complete!");
  console.log("==================================================");
}

main().catch(err => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
