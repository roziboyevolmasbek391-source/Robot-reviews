const fs = require("fs");
const html = fs.readFileSync("scrape-places.html", "utf-8");

console.log("Searching for 'csrf' (case-insensitive) in HTML...");
const matches = [];
const regex = /.{0,40}csrf.{0,40}/gi;
let match;
while ((match = regex.exec(html)) !== null) {
  matches.push(match[0].trim());
}

if (matches.length > 0) {
  console.log(`Found ${matches.length} occurrences:`);
  for (const m of matches.slice(0, 10)) {
    console.log("- ", m);
  }
} else {
  console.log("No occurrences of 'csrf' found.");
}
