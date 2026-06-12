const fs = require("fs");
const html = fs.readFileSync("scrape-places.html", "utf-8");

console.log("HTML length:", html.length);

// Let's search for script tags or window properties
const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
let match;
let count = 0;
while ((match = regex.exec(html)) !== null) {
  count++;
  const scriptContent = match[1].trim();
  if (scriptContent.length > 0) {
    console.log(`\nScript #${count} (length: ${scriptContent.length}):`);
    console.log(scriptContent.slice(0, 300) + (scriptContent.length > 300 ? "..." : ""));
  }
}

// Let's search for some text indicators
const indicators = ["login", "passport", "войти", "авторизация", "ошибка", "error", "restapp"];
console.log("\nSearching for indicators:");
for (const ind of indicators) {
  const contains = html.toLowerCase().includes(ind);
  console.log(`- "${ind}": ${contains}`);
}

// Let's print the title
const titleMatch = html.match(/<title>(.*?)<\/title>/i);
if (titleMatch) {
  console.log("\nTitle:", titleMatch[1]);
}
