import { PrismaClient } from "@prisma/client";
import { decrypt } from "./src/lib/encryption";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking saved settings from database...");
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: ["YANDEX_EDA_COOKIE", "YANDEX_EDA_OAUTH", "YANDEX_EDA_PARTNER_ID"]
        }
      }
    });

    const cookieSetting = settings.find((s: typeof settings[0]) => s.key === "YANDEX_EDA_COOKIE");
    const oauthSetting = settings.find((s: typeof settings[0]) => s.key === "YANDEX_EDA_OAUTH");
    const partnerIdSetting = settings.find((s: typeof settings[0]) => s.key === "YANDEX_EDA_PARTNER_ID");

    const cookie = cookieSetting?.value ? decrypt(cookieSetting.value) : "";
    const oauthRaw = oauthSetting?.value ? decrypt(oauthSetting.value) : "";
    
    // Strip "Bearer " prefix if present in the saved OAuth token
    const oauth = oauthRaw.replace(/^bearer\s+/i, "").trim();
    
    let partnerId = partnerIdSetting?.value || "";
    if (partnerIdSetting?.isSecret && partnerIdSetting.value) {
      partnerId = decrypt(partnerIdSetting.value);
    }

    console.log("Cookie length:", cookie ? cookie.length : 0);
    console.log("OAuth Raw:", oauthRaw ? `${oauthRaw.substring(0, 15)}...` : "None");
    console.log("OAuth Cleaned:", oauth ? `${oauth.substring(0, 15)}...` : "None");
    console.log("Partner ID:", partnerId);

    const testUrl = "https://vendor.yandex.ru/4.0/restapp-front/eats-restapp-menu/v1/places";

    const baseHeaders = {
      "Accept": "application/json",
      "Referer": "https://vendor.yandex.ru/places",
      "X-App-Version": "1.116.0",
      "X-Device-Id": "web_device_id",
      "X-Platform": "restapp_web_desktop",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    const scenarios = [
      {
        name: "A. Cleaned X-Oauth (No prefix) + Partner ID",
        headers: { ...baseHeaders, "X-Oauth": oauth, "X-Partner-Id": partnerId }
      },
      {
        name: "B. Cleaned X-Oauth with Bearer prefix + Partner ID",
        headers: { ...baseHeaders, "X-Oauth": `Bearer ${oauth}`, "X-Partner-Id": partnerId }
      },
      {
        name: "C. Cleaned Authorization OAuth + Partner ID",
        headers: { ...baseHeaders, "Authorization": `OAuth ${oauth}`, "X-Partner-Id": partnerId }
      },
      {
        name: "D. Cleaned Authorization Bearer + Partner ID",
        headers: { ...baseHeaders, "Authorization": `Bearer ${oauth}`, "X-Partner-Id": partnerId }
      },
      {
        name: "E. Cleaned X-Oauth (No prefix) + Cookie + Partner ID",
        headers: { ...baseHeaders, "Cookie": cookie, "X-Oauth": oauth, "X-Partner-Id": partnerId }
      },
      {
        name: "F. Cleaned X-Oauth with Bearer + Cookie + Partner ID",
        headers: { ...baseHeaders, "Cookie": cookie, "X-Oauth": `Bearer ${oauth}`, "X-Partner-Id": partnerId }
      }
    ];

    for (const scenario of scenarios) {
      console.log(`\n--- Running scenario: ${scenario.name} ---`);
      try {
        const response = await fetch(testUrl, {
          method: "GET",
          headers: scenario.headers as any
        });
        console.log("HTTP Status:", response.status);
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          console.log("JSON response (first 250 chars):", JSON.stringify(json).slice(0, 250));
        } catch (e) {
          console.log("Text response (first 250 chars):", text.slice(0, 250));
        }
      } catch (err: any) {
        console.error("Fetch failed:", err.message);
      }
    }

  } catch (error) {
    console.error("Error in check-settings:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
