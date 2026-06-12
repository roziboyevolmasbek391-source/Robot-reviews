const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("Launching Puppeteer to test Uzum Tezkor phone submit...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  // Intercept network requests and log details
  page.on("request", req => {
    const url = req.url();
    if (url.includes("api") || url.includes("auth") || url.includes("daymarket")) {
      console.log(`Request: ${req.method()} -> ${url}`);
      if (req.postData()) {
        console.log(`  -> Payload: ${req.postData()}`);
      }
    }
  });

  page.on("response", async res => {
    const url = res.url();
    if (url.includes("api") || url.includes("auth") || url.includes("daymarket")) {
      console.log(`Response: ${res.status()} -> ${url}`);
      try {
        const text = await res.text();
        console.log(`  -> Body: ${text.slice(0, 500)}`);
      } catch (e) {
        // Ignore
      }
    }
  });

  try {
    console.log("Navigating...");
    await page.goto("https://partners.uzumtezkor.uz/ru/auth", { waitUntil: "networkidle2", timeout: 30000 });
    await delay(3000);

    // Type mock phone number
    console.log("Typing mock phone number...");
    await page.type("input[name='phoneNumber']", "901234567");
    await delay(1000);

    // Take screenshot before clicking
    await page.screenshot({ path: path.join(__dirname, "before_click.png") });

    // Click continue
    console.log("Clicking Continue button...");
    await page.click(".continue-button");
    await delay(5000);

    // Take screenshot after clicking
    await page.screenshot({ path: path.join(__dirname, "after_click.png") });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

main();
