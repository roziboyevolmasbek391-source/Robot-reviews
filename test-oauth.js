async function main() {
  const token = "y0_xDI5c6eCBjq5Rogt4ikphQPHoKouJ5NMSIGzLC7OY9ClzENPA";
  const partnerId = "2618f6ac-daca-4f49-ab19-1d54f856368d";

  console.log("Fetching places using exact screenshot headers...");
  try {
    const response = await fetch("https://vendor.yandex.ru/4.0/restapp-front/eats-restapp-menu/v1/places", {
      headers: {
        "Accept": "application/json",
        "Referer": "https://vendor.yandex.ru/places",
        "X-Oauth": `Bearer ${token}`,
        "X-Partner-Id": partnerId,
        "X-App-Version": "1.116.0",
        "X-Device-Id": "web_device_id",
        "X-Platform": "restapp_web_desktop",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"
      }
    });

    console.log("Status:", response.status);
    const text = await response.text();
    console.log("Response body:");
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(text.slice(0, 1000));
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
