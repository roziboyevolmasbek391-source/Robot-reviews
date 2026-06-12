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

function encrypt(text) {
  const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// Local decryption helper removed in favor of central sync-helper.js

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveSessionToDb(cookie, oauth, partnerId) {
  try {
    if (cookie) {
      const encryptedCookie = encrypt(cookie);
      await prisma.systemSetting.upsert({
        where: { key: "YANDEX_EDA_COOKIE" },
        update: { value: encryptedCookie },
        create: { key: "YANDEX_EDA_COOKIE", value: encryptedCookie, isSecret: true }
      });
      console.log("  -> Saved YANDEX_EDA_COOKIE to database.");
    }
    if (oauth) {
      const encryptedOauth = encrypt(oauth);
      await prisma.systemSetting.upsert({
        where: { key: "YANDEX_EDA_OAUTH" },
        update: { value: encryptedOauth },
        create: { key: "YANDEX_EDA_OAUTH", value: encryptedOauth, isSecret: true }
      });
      console.log("  -> Saved YANDEX_EDA_OAUTH to database.");
    }
    if (partnerId) {
      await prisma.systemSetting.upsert({
        where: { key: "YANDEX_EDA_PARTNER_ID" },
        update: { value: partnerId },
        create: { key: "YANDEX_EDA_PARTNER_ID", value: partnerId, isSecret: false }
      });
      console.log("  -> Saved YANDEX_EDA_PARTNER_ID to database.");
    }
  } catch (err) {
    console.error("  -> ❌ Error saving session to DB:", err.message);
  }
}

// Local Telegram alert helper removed in favor of central sync-helper.js

async function main() {
  console.log("==================================================");
  console.log("🚀 YANDEX EDA BROWSER AUTOMATION (SCRAPING) START");
  console.log("==================================================");

  const sessionPath = path.join(__dirname, "yandex-session");
  
  // Variables to capture intercepted credentials
  let oauthToken = "";
  let partnerId = "";
  let placesData = null;

  const setupInterception = async (pageInstance) => {
    await pageInstance.setRequestInterception(true);
    pageInstance.on("request", interceptedRequest => {
      const reqUrl = interceptedRequest.url();
      const headers = interceptedRequest.headers();
      const oauth = headers["x-oauth"] || headers["X-Oauth"] || headers["Authorization"];
      if (oauth) {
        oauthToken = oauth.replace(/^bearer\s+/i, "").trim();
      }
      const pId = headers["x-partner-id"] || headers["X-Partner-Id"];
      if (pId) {
        partnerId = pId;
      }
      interceptedRequest.continue();
    });

    pageInstance.on("response", async (response) => {
      try {
        const reqUrl = response.url();
        if (reqUrl.includes("/places/v2/search") && response.status() === 200) {
          placesData = await response.json();
        }
      } catch (err) {
        // Ignore response reading errors
      }
    });
  };

  // 1. Launch Puppeteer (first run in headless: true to check if already logged in)
  console.log("1. Checking login status and session validity...");
  let browser = await puppeteer.launch({
    headless: true,
    userDataDir: sessionPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  let page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  await setupInterception(page);
  
  try {
    await page.goto("https://vendor.yandex.ru/places", { waitUntil: "networkidle2", timeout: 20000 });
    // Wait 5 seconds to let the background React page fetch configuration/places
    await delay(5000);
  } catch (e) {
    console.log("Navigation timeout or error, proceeding to verification check.");
  }

  const currentUrl = page.url();
  console.log("Current page URL:", currentUrl);

  let isLoggedIn = false;

  // Verify if session works (either traffic intercepted placesData or we can fetch)
  if (placesData && oauthToken && partnerId) {
    isLoggedIn = true;
    console.log("✅ Session verified successfully from headless traffic interception!");
  } else if (currentUrl.includes("/places") && !currentUrl.includes("/login") && !currentUrl.includes("passport.yandex")) {
    const cookiesList = await page.cookies();
    const initialCookieString = cookiesList.map(c => `${c.name}=${c.value}`).join("; ");
    try {
      // Fetch places from Node using cookies and new endpoint
      const response = await fetch("https://vendor.yandex.ru/4.0/restapp-front/places/v2/search?limit=999", {
        headers: {
          "Cookie": initialCookieString,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (response.ok) {
        placesData = await response.json();
        isLoggedIn = true;
        console.log("✅ Session is active and working (cookie fetch verified)!");
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!isLoggedIn) {
    console.log("\n⚠️ NOT LOGGED IN! Closing headless browser and opening headed browser for authentication...");
    await browser.close();

    // Relaunch headed so the user can log in
    browser = await puppeteer.launch({
      headless: false,
      userDataDir: sessionPath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    page = (await browser.pages())[0] || await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await setupInterception(page);

    console.log("\n==================================================");
    console.log("📢 DIQQAT / BROWSER LOGIN TALAB QILINADI:");
    console.log("Ochilgan brauzer oynasida Yandex Eda hisobingizga kiring.");
    console.log("Tizimga kirganingizdan so'ng, ushbu oyna avtomatik ravishda places ro'yxatiga o'tadi va skript davom etadi.");
    console.log("==================================================\n");

    await page.goto("https://vendor.yandex.ru/places");

    // Poll until logged in and places can be fetched
    let loginChecked = false;
    let pollCount = 0;
    while (!loginChecked) {
      await delay(2000);
      pollCount++;
      try {
        const url = page.url();
        if (pollCount % 5 === 0) {
          console.log(`Polling status: URL="${url}" | Intercepted OAuth="${oauthToken ? 'YES' : 'NO'}" | PartnerId="${partnerId ? 'YES' : 'NO'}"`);
        }
        
        if (oauthToken && partnerId) {
          try {
            const cookies = await page.cookies();
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

            const response = await fetch("https://vendor.yandex.ru/4.0/restapp-front/places/v2/search?limit=999", {
              headers: {
                "Cookie": cookieStr,
                "X-Oauth": oauthToken.startsWith("Bearer ") ? oauthToken : "Bearer " + oauthToken,
                "X-Partner-Id": partnerId,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            });
            if (response.ok) {
              placesData = await response.json();
              if (placesData) {
                console.log("✅ Successful login and session verification!");
                loginChecked = true;
              }
            }
          } catch (fetchErr) {
            // Ignore
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Give it a few seconds to load completely
    await delay(3000);
  }

  // Save the fresh session credentials to settings database
  console.log("\n2. Extracting session cookies and active headers...");
  const cookies = await page.cookies();
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  await saveSessionToDb(cookieString, oauthToken, partnerId);

  const places = placesData.places || placesData.result?.places || placesData.result || placesData.items || [];
  console.log(`Found ${places.length} places in Yandex Eda.`);

  if (places.length === 0) {
    console.log("No places found! Exiting.");
    await browser.close();
    process.exit(0);
  }

  console.log("\n3. Processing places in database...");
  const activePlaceIds = [];
  const placeMap = new Map();

  for (const place of places) {
    const placeId = String(place.id);
    const rawPlaceName = place.name || `Restoran Filiali #${placeId}`;
    const placeAddress = place.address || place.address_name || "Tashkent shahar";
    const placeCity = place.city || place.region_slug || "Tashkent";
    const placeName = `${rawPlaceName} (${placeAddress})`;
    activePlaceIds.push(placeId);

    console.log(`Processing Place ID: ${placeId} | Name: ${placeName}`);

    // Check if the mapping already exists
    const existingMapping = await prisma.branchPlatformId.findUnique({
      where: {
        source_platformId: {
          source: ReviewSource.YANDEX_VENDOR,
          platformId: placeId
        }
      },
      include: {
        branch: true
      }
    });

    let branchId = null;

    if (existingMapping && existingMapping.branch) {
      // Update existing branch name & address to the real ones
      await prisma.branch.update({
        where: { id: existingMapping.branch.id },
        data: {
          name: placeName,
          address: placeAddress,
          city: placeCity
        }
      });
      branchId = existingMapping.branch.id;
      console.log(`  -> Updated existing branch in database (ID: ${branchId})`);
    } else {
      // Create new branch
      const newBranch = await prisma.branch.create({
        data: {
          name: placeName,
          city: placeCity,
          address: placeAddress,
          isActive: true
        }
      });
      branchId = newBranch.id;

      await prisma.branchPlatformId.create({
        data: {
          branchId,
          source: ReviewSource.YANDEX_VENDOR,
          platformId: placeId
        }
      });

      console.log(`  -> Created new branch in database (ID: ${branchId})`);
    }

    placeMap.set(placeId, { branchId, placeName });
  }

  // 4. Fetch reviews for ALL places at once
  console.log(`\n4. Fetching reviews for all ${activePlaceIds.length} places...`);
  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 30); // 30 days of reviews

    const fromStr = fromDate.toISOString();
    const toStr = toDate.toISOString();
    
    const response = await fetch("https://vendor.yandex.ru/4.0/restapp-front/eats-place-rating/v1/places-order-feedbacks", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cookie": cookieString,
        "X-Oauth": oauthToken.startsWith("Bearer ") ? oauthToken : "Bearer " + oauthToken,
        "X-Partner-Id": partnerId,
        "Referer": `https://vendor.yandex.ru/feedback/places?from=${fromStr}&period=days&service=all&to=${toStr}&`,
        "X-Platform": "restapp_web_desktop",
        "X-Device-Id": "web_device_id",
        "X-App-Version": "15.0.0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: JSON.stringify({
        place_ids: activePlaceIds.map(id => parseInt(id, 10)),
        from: fromStr,
        to: toStr
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch reviews: ${response.statusText}`);
    }

    const reviewsData = await response.json();
    const reviewsList = reviewsData.feedbacks || [];
    console.log(`  -> Found ${reviewsList.length} reviews total. Saving to database...`);

    // Group stats per place to write logs
    const statsMap = new Map(); // placeId -> { newCount, dupCount, totalCount }
    for (const placeId of placeMap.keys()) {
      statsMap.set(placeId, { newCount: 0, dupCount: 0, totalCount: 0 });
    }

    for (const item of reviewsList) {
      const pId = String(item.order.place_id);
      const mapped = placeMap.get(pId);
      if (!mapped) continue;

      const { branchId, placeName } = mapped;
      const reviewId = String(item.order_feedback.id);
      const author = item.order.eater_name || "Anonim";
      const rating = item.order_feedback.rating || 5;
      const text = item.order_feedback.comment || "";
      const reviewDate = new Date(item.order_feedback.feedback_filled_at || Date.now());
      const reviewUrl = `https://eda.yandex.ru/restaurant/${pId}`;

      const stats = statsMap.get(pId);
      if (stats) stats.totalCount++;

      // Check if review already exists
      const exists = await prisma.review.findUnique({
        where: {
          source_externalReviewId: {
            source: ReviewSource.YANDEX_VENDOR,
            externalReviewId: reviewId
          }
        }
      });

      if (exists) {
        if (stats) stats.dupCount++;
        continue;
      }

      await saveAndAlertReview({ externalReviewId: reviewId, author, rating, text, reviewUrl, reviewDate }, branchId, placeName, ReviewSource.YANDEX_VENDOR);
      if (stats) stats.newCount++;
    }

    // Write Sync Logs for all places
    for (const [pId, stats] of statsMap.entries()) {
      const mapped = placeMap.get(pId);
      if (!mapped) continue;
      
      await prisma.reviewSyncLog.create({
        data: {
          source: ReviewSource.YANDEX_VENDOR,
          branchId: mapped.branchId,
          syncedReviews: stats.newCount,
          totalFound: stats.totalCount,
          duplicates: stats.dupCount,
          status: "COMPLETED",
          finishedAt: new Date()
        }
      });
    }

    console.log(`\nReview Sync Summary:`);
    for (const [pId, stats] of statsMap.entries()) {
      const mapped = placeMap.get(pId);
      if (mapped && (stats.newCount > 0 || stats.totalCount > 0)) {
        console.log(`  -> ${mapped.placeName} (ID: ${pId}): Synced: ${stats.newCount}, Duplicates: ${stats.dupCount}`);
      }
    }

  } catch (e) {
    console.error(`  -> ❌ Error syncing reviews:`, e.message);
    // Write failure logs for all places
    for (const [pId, mapped] of placeMap.entries()) {
      await prisma.reviewSyncLog.create({
        data: {
          source: ReviewSource.YANDEX_VENDOR,
          branchId: mapped.branchId,
          status: "FAILED",
          error: e.message,
          finishedAt: new Date()
        }
      });
    }
  }

  console.log("\n==================================================");
  console.log("🎉 SUCCESS: Sync complete!");
  console.log("==================================================");
  
  await browser.close();
  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Fatal error in main script:", err);
  prisma.$disconnect();
  process.exit(1);
});
