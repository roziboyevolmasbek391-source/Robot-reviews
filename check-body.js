const fs = require("fs");
const html = fs.readFileSync("scrape-places.html", "utf-8");

const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (bodyMatch) {
  const bodyContent = bodyMatch[1].trim();
  console.log("Body length:", bodyContent.length);
  // Remove scripts from body to see clean HTML
  const cleanBody = bodyContent.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, "");
  console.log("Clean body content (no scripts):");
  console.log(cleanBody.slice(0, 1500));
} else {
  console.log("No body tag found.");
}
