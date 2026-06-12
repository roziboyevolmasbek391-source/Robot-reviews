const puppeteer = require("puppeteer");
const path = require("path");

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const sessionPath = path.join(__dirname, "uzum-session");
  
  console.log("Launching Puppeteer headlessly with saved session...");
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: sessionPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  // Log all request URLs
  page.on("request", req => {
    console.log(`[Request] ${req.method()} -> ${req.url()}`);
    const headers = req.headers();
    if (req.url().includes("uzum") || req.url().includes("daymarket")) {
      console.log(`   Headers: ${JSON.stringify(headers)}`);
    }
  });

  page.on("response", async res => {
    try {
      const url = res.url();
      if (url.includes("uzum") || url.includes("daymarket")) {
        console.log(`[Response] ${res.status()} -> ${url}`);
        const text = await res.text();
        console.log(`   Body preview: ${text.slice(0, 1000)}`);
      }
    } catch (e) {
      // Ignore
    }
  });

  try {
    console.log("Navigating to Uzum Tezkor partner dashboard...");
    await page.goto("https://partners.uzumtezkor.uz/", { waitUntil: "networkidle2", timeout: 30000 });
    
    console.log("Dashboard loaded. Waiting 10 seconds to collect network requests...");
    await delay(10000);

    // Let's try to navigate to feedbacks tab if we can find it
    console.log("Looking for feedbacks link...");
    const feedBacksClicked = await page.evaluate(() => {
      // Find link containing feedbacks or reviews or "Отзывы"
      const links = Array.from(document.querySelectorAll("a"));
      const target = links.find(l => l.href.includes("feedback") || l.href.includes("review") || l.innerText.includes("Отзывы"));
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (feedBacksClicked) {
      console.log("Clicked feedbacks tab. Waiting 5 seconds...");
      await delay(5000);
    } else {
      console.log("Feedbacks tab link not found or couldn't click. Let's try direct navigation.");
      await page.goto("https://partners.uzumtezkor.uz/ru/feedbacks", { waitUntil: "networkidle2" }).catch(() => {});
      await delay(5000);
    }

  } catch (err) {
    console.error("Error during navigation:", err);
  } finally {
    await browser.close();
  }
}

main();
