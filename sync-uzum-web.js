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

async function saveSessionToDb(cookie, token, merchantId) {
  try {
    if (cookie) {
      const encryptedCookie = encrypt(cookie);
      await prisma.systemSetting.upsert({
        where: { key: "UZUM_COOKIE" },
        update: { value: encryptedCookie },
        create: { key: "UZUM_COOKIE", value: encryptedCookie, isSecret: true }
      });
      console.log("  -> Saved UZUM_COOKIE to database.");
    }
    if (token) {
      const encryptedToken = encrypt(token);
      await prisma.systemSetting.upsert({
        where: { key: "UZUM_TOKEN" },
        update: { value: encryptedToken },
        create: { key: "UZUM_TOKEN", value: encryptedToken, isSecret: true }
      });
      console.log("  -> Saved UZUM_TOKEN to database.");
    }
    if (merchantId) {
      await prisma.systemSetting.upsert({
        where: { key: "UZUM_MERCHANT_ID" },
        update: { value: merchantId },
        create: { key: "UZUM_MERCHANT_ID", value: merchantId, isSecret: false }
      });
      console.log("  -> Saved UZUM_MERCHANT_ID to database.");
    }
  } catch (err) {
    console.error("  -> ❌ Error saving Uzum session to DB:", err.message);
  }
}

// Local Telegram alert helper removed in favor of central sync-helper.js

async function main() {
  console.log("==================================================");
  console.log("🚀 UZUM TEZKOR BROWSER AUTOMATION START");
  console.log("==================================================");

  const sessionPath = path.join(__dirname, "uzum-session");
  
  let authToken = "";
  let cookiesString = "";
  let merchantId = "";
  let interceptedVendors = [];
  let interceptedReviews = [];

  const setupInterception = async (pageInstance) => {
    await pageInstance.setRequestInterception(true);
    pageInstance.on("request", interceptedRequest => {
      const reqUrl = interceptedRequest.url();
      const headers = interceptedRequest.headers();
      
      // Intercept Authorization header
      const auth = headers["authorization"] || headers["Authorization"];
      if (auth && auth.toLowerCase().startsWith("bearer ")) {
        authToken = auth.replace(/^bearer\s+/i, "").trim();
      }

      interceptedRequest.continue();
    });

    pageInstance.on("response", async (response) => {
      try {
        const reqUrl = response.url();
        const status = response.status();
        
        if (status === 200) {
          // Log any api responses under vendors.uzumtezkor.uz to reverse-engineer
          if (reqUrl.includes("vendors.uzumtezkor.uz/api/v1/")) {
            const data = await response.json();
            
            // Check if it's vendors list
            if (reqUrl.includes("/vendors") && !reqUrl.includes("/feedbacks") && !reqUrl.includes("/reviews")) {
              console.log("Captured vendors list API request!");
              interceptedVendors = data.vendors || data.result?.vendors || data.result || data.items || data || [];
              fs.writeFileSync(path.join(__dirname, "uzum_vendors_api_response.json"), JSON.stringify(data, null, 2));
            }
            
            // Check if it's feedbacks/reviews
            if (reqUrl.includes("/feedbacks") || reqUrl.includes("/reviews")) {
              console.log("Captured feedbacks/reviews API request!");
              interceptedReviews = data.feedbacks || data.reviews || data.result?.feedbacks || data.items || data || [];
              fs.writeFileSync(path.join(__dirname, "uzum_reviews_api_response.json"), JSON.stringify(data, null, 2));
            }
          }
        }
      } catch (err) {
        // Ignore response parsing errors
      }
    });
  };

  // 1. Launch Puppeteer (first run in headless: true to check if already logged in)
  console.log("1. Checking Uzum session status...");
  let browser = await puppeteer.launch({
    headless: true,
    userDataDir: sessionPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  let page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  await setupInterception(page);
  
  try {
    await page.goto("https://partners.uzumtezkor.uz/", { waitUntil: "networkidle2", timeout: 20000 });
    await delay(3000);
  } catch (e) {
    console.log("Navigation timeout or error, checking current state.");
  }

  const currentUrl = page.url();
  console.log("Current page URL:", currentUrl);

  let isLoggedIn = !currentUrl.includes("/auth");

  if (!isLoggedIn) {
    console.log("\n⚠️ NOT LOGGED IN! Closing headless browser and opening headed browser for authentication...");
    await browser.close();

    // Relaunch headed
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
    console.log("Ochilgan brauzer oynasida Uzum Tezkor hisobingizga kiring.");
    console.log("Telefon raqamingizni kiriting, SMS kodni yozing.");
    console.log("Kirganingizdan so'ng, tizim avtomatik ravishda boshqaruv paneliga o'tadi va skript davom etadi.");
    console.log("Iltimos, kiritganingizdan so'ng 'Отзывы' bo'limiga o'ting, sharhlarni yuklash formatini aniqlashimiz uchun.");
    console.log("==================================================\n");

    await page.goto("https://partners.uzumtezkor.uz/ru/auth");

    // Poll until logged in
    let loginChecked = false;
    let pollCount = 0;
    while (!loginChecked) {
      await delay(2000);
      pollCount++;
      
      const url = page.url();
      if (pollCount % 10 === 0) {
        console.log(`Polling status: URL="${url}" | Intercepted Token="${authToken ? 'YES' : 'NO'}"`);
      }

      if (!url.includes("/auth") && authToken) {
        console.log("✅ Successful login detected via URL and Auth Token!");
        loginChecked = true;
      }
    }
    
    // Allow a few seconds to load
    await delay(5000);
  }

  // Get cookies
  const cookies = await page.cookies();
  cookiesString = cookies.map(c => `${c.name}=${c.value}`).join("; ");

  // Save session credentials
  await saveSessionToDb(cookiesString, authToken, merchantId);

  console.log("\n2. Session credentials captured:");
  console.log(`- Token: ${authToken ? "Bearer " + authToken.slice(0, 15) + "..." : "NONE"}`);
  console.log(`- Cookies length: ${cookiesString.length} chars`);

  // Define headers for API calls
  const headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ru",
    "Authorization": authToken.startsWith("Bearer ") ? authToken : `Bearer ${authToken}`,
    "Cookie": cookiesString,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://partners.uzumtezkor.uz",
    "Referer": "https://partners.uzumtezkor.uz/"
  };

  // 1. Get user identity to find user ID and scope
  let userId = "";
  let scope = "";
  try {
    const resId = await fetch("https://vendors.uzumtezkor.uz/api/v2/auth/identity", { headers });
    if (resId.ok) {
      userId = resId.headers.get("x-user-id") || "";
      scope = resId.headers.get("x-scope") || "";
      console.log(`Extracted User ID from identity headers: ${userId}`);
      console.log(`Extracted Scope: ${scope}`);
    }
  } catch (err) {
    console.error("Error fetching identity:", err.message);
  }

  if (!userId) {
    console.error("Could not obtain user ID. Exiting.");
    await browser.close();
    await prisma.$disconnect();
    return;
  }

  const isVapp = scope === "vendorapp.authorized";

  // 2. Fetch vendors list from Uzum Tezkor partner API
  let vendors = [];
  try {
    const response = await fetch(`https://vendors.uzumtezkor.uz/api/v1/vendor-auth/users/id/${userId}/vendors?is_vapp=${isVapp}`, {
      method: "GET",
      headers,
    });
    if (response.ok) {
      const data = await response.json();
      vendors = data.vendors || data.result?.vendors || data.result || data.items || data || [];
      console.log(`Fetched ${vendors.length} vendors from API.`);
    }
  } catch (err) {
    console.error("Error fetching vendors list:", err.message);
  }

  // If we fetched vendors, log and update database branches
  if (vendors && vendors.length > 0) {
    console.log("\n3. Processing Uzum vendors in database...");
    
    for (const vendor of vendors) {
      const vendorId = String(vendor.vendor_public_id);
      const vendorName = vendor.vendor_name || `Uzum Restaurant #${vendorId}`;
      const vendorAddress = vendor.address || "Tashkent";
      const vendorCity = "Tashkent";
      const placeName = vendorName;

      console.log(`Processing Uzum Vendor ID: ${vendorId} | Name: ${placeName}`);

      // Check if mapping exists
      const existingMapping = await prisma.branchPlatformId.findUnique({
        where: {
          source_platformId: {
            source: ReviewSource.UZUM_VENDOR,
            platformId: vendorId
          }
        },
        include: {
          branch: true
        }
      });

      let branchId = null;

      if (existingMapping && existingMapping.branch) {
        await prisma.branch.update({
          where: { id: existingMapping.branch.id },
          data: {
            name: placeName,
            address: vendorAddress,
            city: vendorCity
          }
        });
        branchId = existingMapping.branch.id;
        console.log(`  -> Updated existing branch in DB (ID: ${branchId})`);
      } else {
        // Create new branch
        const newBranch = await prisma.branch.create({
          data: {
            name: placeName,
            city: vendorCity,
            address: vendorAddress,
            isActive: true
          }
        });
        branchId = newBranch.id;

        await prisma.branchPlatformId.create({
          data: {
            branchId,
            source: ReviewSource.UZUM_VENDOR,
            platformId: vendorId
          }
        });
        console.log(`  -> Created new branch in DB (ID: ${branchId})`);
      }

      // 4. Fetch and process reviews for this vendor
      console.log(`  -> Syncing reviews for vendor ${vendorId}...`);
      try {
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 30); // 30 days of reviews
        
        const dateFromStr = fromDate.toISOString().split('T')[0];
        const dateToStr = toDate.toISOString().split('T')[0];

        const queryParams = new URLSearchParams({
          dateFrom: dateFromStr,
          dateTo: dateToStr,
          limit: "50",
          offset: "0",
          question_id: "order",
          vendorIDs: vendorId
        });

        const rateUrl = `https://vendors.uzumtezkor.uz/api/v2/feedback/rate?${queryParams.toString()}`;
        const resRate = await fetch(rateUrl, { headers });
        if (resRate.ok) {
          const rateData = await resRate.json();
          const feedbacksList = rateData.rates || rateData.items || rateData.result || [];
          console.log(`  -> Found ${feedbacksList.length} reviews for this vendor.`);
          
          let newReviewsCount = 0;
          let dupReviewsCount = 0;

          for (const item of feedbacksList) {
            const reviewId = String(item.id);
            const author = item.order_display_id ? `Заказ #${item.order_display_id}` : "Anonim";
            const rating = item.rate || 5;
            
            // Parse tags
            let text = item.text || "";
            if (Array.isArray(item.tags)) {
              const selectedTags = item.tags.filter(t => t.selected).map(t => t.name.replace(/\n/g, ' '));
              if (selectedTags.length > 0) {
                text += (text ? "\n" : "") + `[Теги: ${selectedTags.join(', ')}]`;
              }
            }

            const reviewDate = new Date(item.rate_created_at || item.order_created_at || Date.now());
            const reviewUrl = "https://partners.uzumtezkor.uz/ru/feedbacks";

            // Check if review already exists
            const exists = await prisma.review.findUnique({
              where: {
                source_externalReviewId: {
                  source: ReviewSource.UZUM_VENDOR,
                  externalReviewId: reviewId
                }
              }
            });

            if (exists) {
              dupReviewsCount++;
              continue;
            }

            await saveAndAlertReview({ externalReviewId: reviewId, author, rating, text, reviewUrl, reviewDate }, branchId, placeName, ReviewSource.UZUM_VENDOR);
            newReviewsCount++;
          }

          // Write sync log
          await prisma.reviewSyncLog.create({
            data: {
              source: ReviewSource.UZUM_VENDOR,
              branchId,
              syncedReviews: newReviewsCount,
              totalFound: feedbacksList.length,
              duplicates: dupReviewsCount,
              status: "COMPLETED",
              finishedAt: new Date()
            }
          });
          
          console.log(`  -> Sync completed: ${newReviewsCount} new, ${dupReviewsCount} duplicates.`);
        } else {
          console.error(`  -> Failed to fetch reviews: ${resRate.status} ${resRate.statusText}`);
        }
      } catch (err) {
        console.error(`  -> ❌ Error syncing reviews for vendor ${vendorId}:`, err.message);
        await prisma.reviewSyncLog.create({
          data: {
            source: ReviewSource.UZUM_VENDOR,
            branchId,
            status: "FAILED",
            error: err.message,
            finishedAt: new Date()
          }
        });
      }
    }
  }

  console.log("\n==================================================");
  console.log("🎉 SUCCESS: Uzum sync complete / credentials captured!");
  console.log("==================================================");

  await browser.close();
  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Fatal error in Uzum script:", err);
  prisma.$disconnect();
  process.exit(1);
});
