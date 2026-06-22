// Verify each fixture extracts to real text via the real document loader (lib/docloader).
'use strict';
const fs = require('fs'), path = require('path');
const docloader = require('../lib/docloader');
const dir = path.join(__dirname, 'fixtures');
(async () => {
  let allOk = true;
  for (const f of fs.readdirSync(dir).sort()) {
    let t = '', kind = '';
    try { const d = await docloader.loadFile(path.join(dir, f)); t = d.text; kind = d.kind; } catch (e) { t = ''; }
    const preview = t.replace(/\s+/g, ' ').slice(0, 60);
    // real readable text, and (for html) tags stripped
    const ok = t.length > 20 && /[a-z]{4,}/i.test(t) && !/<html|<body|<!doctype/i.test(t);
    if (!ok) allOk = false;
    console.log((ok ? 'PASS ' : 'FAIL ') + f.padEnd(16) + kind.padEnd(5) + t.length + ' chars | ' + JSON.stringify(preview));
  }
  console.log(allOk ? '\nALL FIXTURES EXTRACT OK' : '\nSOME FIXTURES FAILED');
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
