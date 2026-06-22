// SSRF guard test for the Web-link fetch (lib/docloader.loadUrl).
'use strict';
const dl = require('../lib/docloader');
const BLOCK = [
  'http://localhost:8124/x', 'http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data',
  'http://10.1.2.3/', 'http://192.168.1.1/', 'http://[::1]/', 'http://0.0.0.0/',
  'http://router.local/', 'http://files.internal/secret', 'file:///etc/passwd',
];
const ALLOW = ['https://en.wikipedia.org/wiki/Compound_interest'];
(async () => {
  let pass = 0, fail = 0;
  for (const u of BLOCK) {
    let blocked = false, msg = '';
    try { await dl.loadUrl(u); } catch (e) { blocked = true; msg = e.message; }
    blocked ? pass++ : fail++;
    console.log((blocked ? 'PASS ' : 'FAIL ') + 'block ' + u.padEnd(42) + (blocked ? '(' + msg + ')' : '<-- NOT BLOCKED!'));
  }
  for (const u of ALLOW) {
    let ok = false, info = '';
    try { const r = await dl.loadUrl(u); ok = r.text.length > 200; info = r.text.length + ' chars'; } catch (e) { info = e.message; }
    ok ? pass++ : fail++;
    console.log((ok ? 'PASS ' : 'FAIL ') + 'allow ' + u.padEnd(42) + '(' + info + ')');
  }
  console.log(`\nSSRF: ${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? 'SSRF_OK' : 'SSRF_FAIL');
  process.exit(fail === 0 ? 0 : 1);
})();
