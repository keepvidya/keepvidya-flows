/**
 * Domain-adaptation test: proves the flow does NOT stick to one domain.
 *   Part 1 — scene routing for 11 domains (deterministic, fast).
 *   Part 2 — real storybook generation for several domains; asserts the output
 *            is ABOUT that domain (e.g. finance doc → finance story).
 *   run: node test/check-domains.js          (Ollama running for Part 2)
 */
'use strict';
const { sceneFor, SCENES } = require('../lib/scenes');
const { runFlow } = require('../lib/flowEngine');
const sceneName = (svg) => Object.keys(SCENES).find((k) => SCENES[k] === svg) || '?';

let pass = 0, fail = 0;
const log = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };

const SCENE_CASES = [
  ['Macronutrients: carbohydrates, protein and fat give calories', 'food'],
  ['Stock market investing, revenue, profit and the bank', 'money'],
  ['The heart pumps blood around the body, good for health', 'health'],
  ['Planets orbit the sun across the solar system in space', 'space'],
  ['Atoms and molecules react in a chemistry experiment', 'science'],
  ['Software algorithms and code run on the computer', 'tech'],
  ['The Roman empire, ancient kings and medieval war', 'history'],
  ['Photosynthesis in the green leaves of a tree', 'leaf'],
  ['Rain and rivers flow down to the ocean', 'water'],
];

const GEN_CASES = [
  { domain: 'finance', text: 'Compound interest is interest earned on both your original investment and the interest already added. Over the years it makes savings in a bank or stock market grow much faster.', re: /interest|money|invest|sav|bank|grow|financ|compound|return|wealth/i },
  { domain: 'space', text: 'The solar system has eight planets orbiting the Sun. Earth is the only planet known to support life. Jupiter is the largest, a giant ball of gas, far across space.', re: /planet|sun|earth|space|solar|orbit|star|gas|jupiter|sky|world/i },
];

(async () => {
  console.log('=== Part 1: scene routing across domains ===');
  for (const [txt, exp] of SCENE_CASES) {
    const got = sceneName(sceneFor(txt));
    log(got === exp, `${exp.padEnd(8)} <- "${txt.slice(0, 38)}"` + (got !== exp ? `  (got ${got})` : ''));
  }
  console.log('\n=== Part 2: real generation adapts to the domain ===');
  for (const c of GEN_CASES) {
    const r = await runFlow({ input: c.text, flow: 'book', provider: 'local' });
    const blob = (r.cover.title + ' ' + r.cover.sub + ' ' + r.pages.map((p) => p.title + ' ' + p.prose).join(' '));
    const onDomain = c.re.test(blob);
    const scenes = [...new Set(r.pages.map((p) => sceneName(p.scene)))].join(',');
    log(onDomain && !r.degraded, `${c.domain.padEnd(8)} -> "${r.cover.title}"  [scenes: ${scenes}]`);
  }
  console.log(`\nDOMAIN RESULT: ${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? 'DOMAINS_OK' : 'DOMAINS_FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
