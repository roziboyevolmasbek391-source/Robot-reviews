import fs from 'fs';

const html = fs.readFileSync('debug-html/real-address.html', 'utf8');

console.log('=== SUGGEST/AUTOCOMPLETE DOM ELEMENTS ===');
const suggestRegex = /<[^>]*class="[^"]*Suggest[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
const itemRegex = /<[^>]*class="[^"]*(?:Suggest-Item|Suggest__item|item|option|popup|suggest)[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/gi;

// Let's print anything matching Suggest-Item or Suggest__item or similar
const r = /class="[^"]*Suggest[^"]*"/gi;
let match;
while ((match = r.exec(html)) !== null) {
  const start = Math.max(0, match.index - 100);
  const end = Math.min(html.length, match.index + 500);
  console.log(html.substring(start, end));
  console.log('---');
}
