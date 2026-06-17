const { PrismaClient, ReviewSource } = require("@prisma/client");
const path = require("path");
const fs = require("fs");
const { saveAndAlertReview, updateReviewIfChanged } = require("./src/lib/sync-helper");

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

// Local crypto and Telegram helpers removed in favor of central sync-helper.js

function getMockFallbackReviews(branchPlatformId, limit) {
  console.log(`  -> [Google Fallback] Generating ${limit} fallback reviews`);
  const mockReviews = [];
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

  for (let i = 0; i < limit; i++) {
    const rating = Math.floor(Math.random() * 3) + 3; // 3 to 5 stars
    const reviewDate = new Date();
    reviewDate.setHours(reviewDate.getHours() - (i * 8 + 2)); 

    const author = authors[i % authors.length];
    const text = comments[i % comments.length];
    const stableDateStr = reviewDate.toISOString().slice(0, 10);

    const externalReviewId = crypto
      .createHash("md5")
      .update(`google_fallback_${branchPlatformId}_${author}_${stableDateStr}_${rating}`)
      .digest("hex");

    mockReviews.push({
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

async function fetchGoogleReviews(branchPlatformId, accessToken, limit = 20) {
  let url = "";
  if (branchPlatformId.startsWith("accounts/")) {
    url = `https://mybusiness.googleapis.com/v4/${branchPlatformId}/reviews?pageSize=${limit}`;
  } else {
    url = `https://mybusiness.googleapis.com/v4/accounts/-/locations/${branchPlatformId}/reviews?pageSize=${limit}`;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data || !data.reviews) {
    return [];
  }

  const ratingMap = {
    "ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5
  };

  return data.reviews.map(r => {
    const rating = ratingMap[r.starRating] || 5;
    const author = r.reviewer?.displayName || "Anonim";
    const reviewDate = new Date(r.createTime || Date.now());
    return {
      externalReviewId: r.reviewId || crypto.createHash("md5").update(`${author}_${reviewDate.getTime()}`).digest("hex"),
      author,
      rating,
      text: r.comment || null,
      reviewUrl: r.reviewUrl || `https://maps.google.com/review?id=${branchPlatformId}`,
      reviewDate,
      replyText: r.reviewReply?.comment || null,
      repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null
    };
  });
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.access_token || "";
}

async function main() {
  console.log("==================================================");
  console.log("🚀 GOOGLE MAPS SYNC START");
  console.log("==================================================");

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    include: { platformIds: true }
  });

  console.log(`Loaded ${branches.length} active branches.`);

  const clientIdSetting = await prisma.systemSetting.findUnique({ where: { key: "GOOGLE_CLIENT_ID" } });
  const clientSecretSetting = await prisma.systemSetting.findUnique({ where: { key: "GOOGLE_CLIENT_SECRET" } });
  const refreshTokenSetting = await prisma.systemSetting.findUnique({ where: { key: "GOOGLE_REFRESH_TOKEN" } });

  const clientId = clientIdSetting?.value ? decrypt(clientIdSetting.value) : "";
  const clientSecret = clientSecretSetting?.value ? decrypt(clientSecretSetting.value) : "";
  const refreshToken = refreshTokenSetting?.value ? decrypt(refreshTokenSetting.value) : "";

  let accessToken = "";
  if (clientId && clientSecret && refreshToken) {
    try {
      console.log("  -> Authenticating with Google APIs...");
      accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
      console.log("  -> Successfully authenticated.");
    } catch (authErr) {
      console.warn(`  -> Google authentication failed: ${authErr.message}.`);
    }
  } else {
    console.log("  -> Google credentials not fully configured. Skipping Google Maps sync.");
  }

  for (const branch of branches) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Branch: "${branch.name}"`);

    const platformMapping = branch.platformIds.find(p => p.source === ReviewSource.GOOGLE_MAPS);
    const locationId = platformMapping?.platformId;

    if (!locationId) {
      console.log(`  -> ⚠️ Google Location ID not configured for this branch. Skipping.`);
      continue;
    }

    console.log(`  -> Google Location ID: ${locationId}`);
    const startedAt = new Date();
    let logId = null;

    try {
      const log = await prisma.reviewSyncLog.create({
        data: {
          source: ReviewSource.GOOGLE_MAPS,
          branchId: branch.id,
          status: "RUNNING",
          startedAt
        }
      });
      logId = log.id;

      let reviews = [];
      if (accessToken) {
        try {
          reviews = await fetchGoogleReviews(locationId, accessToken, 20);
          console.log(`  -> Fetched ${reviews.length} reviews from Google Business API.`);
        } catch (apiErr) {
          console.warn(`  -> API fetch failed: ${apiErr.message}. Returning empty.`);
        }
      } else {
        console.log(`  -> Google credentials not configured. Skipping sync.`);
      }

      let newCount = 0;
      let dupCount = 0;

      for (const rawReview of reviews) {
        let exists = await prisma.review.findUnique({
          where: {
            source_externalReviewId: {
              source: ReviewSource.GOOGLE_MAPS,
              externalReviewId: rawReview.externalReviewId
            }
          }
        });

        // Fallback duplicate check for Google Maps reviews (truncated vs full text)
        if (!exists) {
          const sameDay = new Date(rawReview.reviewDate);
          const startOfDay = new Date(sameDay.getFullYear(), sameDay.getMonth(), sameDay.getDate(), 0, 0, 0);
          const endOfDay = new Date(sameDay.getFullYear(), sameDay.getMonth(), sameDay.getDate(), 23, 59, 59);

          const candidates = await prisma.review.findMany({
            where: {
              source: ReviewSource.GOOGLE_MAPS,
              branchId: branch.id,
              author: rawReview.author || "Anonim",
              rating: rawReview.rating,
              reviewDate: {
                gte: startOfDay,
                lte: endOfDay
              }
            }
          });

          if (candidates.length > 0) {
            const rawNorm = (rawReview.text || "").toLowerCase().replace(/[^a-z0-9а-яё]/g, "");
            for (const cand of candidates) {
              const candNorm = (cand.text || "").toLowerCase().replace(/[^a-z0-9а-яё]/g, "");
              if (rawNorm === candNorm || rawNorm.includes(candNorm) || candNorm.includes(rawNorm)) {
                exists = cand;
                console.log(`  -> [sync-google] Fuzzy matched existing review in DB: ID=${cand.id}, Author="${cand.author}"`);
                break;
              }
            }
          }
        }

        if (exists) {
          const rawText = rawReview.text || "";
          const existingText = exists.text || "";
          const bestText = rawText.length > existingText.length ? rawText : existingText;

          const hasReplyTextDiff = rawReview.replyText !== exists.replyText;
          const hasTextDiff = bestText !== exists.text;
          const hasRatingDiff = rawReview.rating !== exists.rating;
          const hasHashDiff = rawReview.externalReviewId !== exists.externalReviewId;

          if (hasReplyTextDiff || hasTextDiff || hasRatingDiff || hasHashDiff) {
            console.log(`  -> [sync-google] Updating existing review ${exists.id}: ReplyTextDiff=${hasReplyTextDiff}, TextDiff=${hasTextDiff}, RatingDiff=${hasRatingDiff}, HashDiff=${hasHashDiff}`);
            await prisma.review.update({
              where: { id: exists.id },
              data: {
                externalReviewId: rawReview.externalReviewId,
                replyText: rawReview.replyText || exists.replyText || null,
                repliedAt: rawReview.repliedAt || exists.repliedAt || (rawReview.replyText ? new Date() : null),
                text: bestText || null,
                rating: rawReview.rating,
                isNew: rawReview.replyText ? false : exists.isNew
              }
            });
            newCount++;
          } else {
            dupCount++;
          }
          continue;
        }

        await saveAndAlertReview(rawReview, branch.id, branch.name, ReviewSource.GOOGLE_MAPS);
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
  console.log("🎉 Google Sync complete!");
  console.log("==================================================");
}

main().catch(err => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});
