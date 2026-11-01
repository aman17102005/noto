// Try the AI from the terminal (the dev server must be running: npm run dev).
//
//   npm run try -- samples/ptm-notice.txt      ← a text notice
//   npm run try -- path/to/photo.jpg           ← a photo of a notice
//
// Prints the result in all 5 languages and saves the full answer to .output/last-result.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.log('Usage: npm run try -- <notice.txt | photo.jpg>');
  process.exit(1);
}

const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const ext = path.extname(file).toLowerCase();
const body = IMAGE_TYPES[ext]
  ? { image: { mimeType: IMAGE_TYPES[ext], data: readFileSync(file).toString('base64') } }
  : { text: readFileSync(file, 'utf8') };

const url = `http://localhost:${process.env.PORT || 3000}/api/generate`;
console.log(`Sending ${file} to ${url} …`);
const started = Date.now();

let res;
try {
  res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
} catch {
  console.log('Could not connect. Is the dev server running? (npm run dev)');
  process.exit(1);
}
const data = await res.json();
const seconds = ((Date.now() - started) / 1000).toFixed(1);

mkdirSync('.output', { recursive: true });
writeFileSync('.output/last-result.json', JSON.stringify(data, null, 2));

if (!res.ok) {
  console.log(`\n❌ ${res.status} (${data.code}) after ${seconds}s\n${data.error}`);
  process.exit(1);
}

const { notice, model } = data;
console.log(`\n✅ Done in ${seconds}s using ${model}`);
console.log(`School: ${notice.school || '(none)'}`);
for (const w of notice.warnings) console.log(`⚠️  [${w.lang}] ${w.message}`);

for (const [code, lang] of Object.entries(notice.languages)) {
  console.log(`\n── ${code.toUpperCase()} ── ${lang.title}`);
  console.log(lang.summary);
  for (const item of lang.checklist) console.log(`  ☐ ${item}`);
  for (const d of lang.dates) console.log(`  📅 ${d.date} — ${d.label}  [${d.iso} ${d.start}${d.end ? '–' + d.end : ''}]`);
}
console.log('\nFull answer saved to .output/last-result.json');
