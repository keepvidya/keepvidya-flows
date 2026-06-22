/**
 * One-time generator for the file-intake test fixtures (test/fixtures/*).
 * Nutrition-themed (matches the kind of doc a user drops in). Produces a valid
 * PDF (computed xref offsets) and a valid DOCX (minimal stored ZIP) by hand so
 * we can test pdf-parse + mammoth extraction without extra tooling.
 *   run: node test/make-fixtures.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'fixtures');
fs.mkdirSync(dir, { recursive: true });
const w = (f, data) => { fs.writeFileSync(path.join(dir, f), data); console.log('  wrote', f, '(' + (data.length) + ' bytes)'); };

// ── plain text / markdown / csv / json ───────────────────────────────────────
w('nutrition.txt',
`Macronutrients are the nutrients the body needs in large amounts: carbohydrates, proteins and fats.
Carbohydrates are the body's main source of energy, providing about 4 kilocalories per gram.
Proteins build and repair tissue and also supply 4 kilocalories per gram.
Fats are the most energy-dense macronutrient at 9 kilocalories per gram and help absorb vitamins A, D, E and K.
A balanced diet combines all three in the right proportions, with plenty of water and fibre.`);

w('nutrition.md',
`# Water-soluble vitamins

Water-soluble vitamins dissolve in water and are not stored in large amounts, so they are needed regularly.

## Vitamin C
- Supports the immune system and collagen formation.
- Found in citrus fruits, peppers and broccoli.

## B vitamins
- **B1 (thiamine)** helps convert food into energy.
- **B9 (folate)** is vital during pregnancy for healthy cell growth.

> Because they are not stored, a varied diet keeps these vitamins topped up.`);

w('nutrition.csv',
`food,serving,calories,protein_g,carbs_g,fat_g
Banana,1 medium,105,1.3,27,0.4
Chicken breast,100 g,165,31,0,3.6
Brown rice,100 g cooked,123,2.7,26,1.0
Almonds,28 g,164,6,6,14
Broccoli,100 g,34,2.8,7,0.4`);

w('nutrition.json',
JSON.stringify({
  topic: 'Essential minerals',
  minerals: [
    { name: 'Calcium', role: 'Builds bones and teeth; muscle and nerve function', sources: ['dairy', 'leafy greens', 'tofu'] },
    { name: 'Iron', role: 'Carries oxygen in the blood as part of haemoglobin', sources: ['red meat', 'beans', 'spinach'] },
    { name: 'Potassium', role: 'Regulates fluid balance and blood pressure', sources: ['banana', 'potato', 'beans'] },
  ],
  note: 'Minerals are inorganic and, unlike vitamins, are not broken down by heat.',
}, null, 2));

// ── PDF (single page, computed byte offsets) ─────────────────────────────────
function makePdf(lines) {
  const escTxt = (s) => s.replace(/([()\\])/g, '\\$1');
  let content = 'BT /F1 11 Tf 14 TL 54 740 Td\n';
  lines.forEach((l) => { content += '(' + escTxt(l) + ') Tj T*\n'; });
  content += 'ET';
  const objs = {
    1: '<</Type/Catalog/Pages 2 0 R>>',
    2: '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    3: '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>',
    4: '<</Length ' + Buffer.byteLength(content) + '>>\nstream\n' + content + '\nendstream',
    5: '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  };
  let pdf = '%PDF-1.4\n';
  const off = {};
  for (let i = 1; i <= 5; i++) { off[i] = Buffer.byteLength(pdf); pdf += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) pdf += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(pdf, 'latin1');
}
w('nutrition.pdf', makePdf([
  'Dietary fibre',
  '',
  'Dietary fibre is the part of plant foods the body cannot digest.',
  'Soluble fibre (oats, beans, apples) helps lower cholesterol and',
  'steady blood sugar. Insoluble fibre (whole grains, vegetables)',
  'adds bulk and keeps the digestive system moving.',
  'Most adults need about 25 to 30 grams of fibre each day.',
]));

// ── DOCX (minimal stored ZIP, hand-built with CRC32) ─────────────────────────
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; }
function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += lh.length + name.length + data.length;
  }
  let cdSize = 0; central.forEach((c) => (cdSize += c.length));
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, eocd]);
}
const para = (t) => '<w:p><w:r><w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>';
const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  para('Healthy hydration') +
  para('Water makes up about 60 percent of adult body weight and is essential for every cell.') +
  para('It transports nutrients, regulates temperature through sweat, and removes waste.') +
  para('A common guideline is to drink around two litres of fluid a day, more in heat or exercise.') +
  '</w:body></w:document>';
w('nutrition.docx', zip([
  { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
  { name: 'word/document.xml', data: docXml },
]));

// ── different DOMAINS (and more types: html) to prove domain-agnostic behaviour ─
w('finance.md',
`# Compound interest

Compound interest is interest earned on both the original money invested and the
interest already added. Over years it makes savings and investments grow faster.

- A bank account paying 5% a year doubles in about 14 years through compounding.
- Reinvesting dividends from stocks compounds returns in the same way.
- The earlier you start saving, the more the market works in your favour.`);

w('history.html',
`<!doctype html><html><head><title>The printing press</title></head><body>
<h1>The printing press</h1>
<p>Around 1440 Johannes Gutenberg built a printing press with movable metal type.</p>
<p>Books, once copied by hand by scribes, could now be produced quickly and cheaply.</p>
<p>Ideas spread across Europe, literacy rose, and the medieval world began to change.</p>
</body></html>`);

w('space.json',
JSON.stringify({
  topic: 'The solar system',
  star: 'The Sun',
  planets: [
    { name: 'Mercury', note: 'Closest planet to the Sun, no atmosphere' },
    { name: 'Earth', note: 'The only planet known to support life' },
    { name: 'Jupiter', note: 'The largest planet, a giant ball of gas' },
  ],
  fact: 'Light from the Sun takes about eight minutes to reach Earth across space.',
}, null, 2));

console.log('fixtures written to', dir);
