import fs from 'fs';

const html = fs.readFileSync('debug-html/step5.html', 'utf8');

console.log('=== ALL INPUT ELEMENTS IN STEP 5 ===');
const inputRegex = /<input([^>]*)>/gi;
let match;
while ((match = inputRegex.exec(html)) !== null) {
  console.log(`INPUT attrs: ${match[1]}`);
}

console.log('\n=== DOM NEAR "Загрузить" ===');
const loadIndex = html.indexOf('Загрузить');
if (loadIndex !== -1) {
  console.log(html.substring(loadIndex - 300, loadIndex + 700));
}
