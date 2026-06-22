/**
 * Hand-built flat SVG scenes for storybook pages (no diffusion model).
 * Domain-routed: the flow adapts the illustration to whatever the document is
 * about — food, money, health, space, science, tech, history, nature, … —
 * rather than sticking to one theme. sceneFor() keyword-matches broadly and
 * falls back to a neutral scene only when nothing fits.
 */

'use strict';

const SCENES = {
  leaf:    '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#EAF1E4"/><circle cx="232" cy="40" r="20" fill="#E6A23C"/><path d="M150 120c-40 0-70-26-70-58 0-22 30-44 70-44s70 22 70 44c0 32-30 58-70 58Z" fill="#6FA15B"/><path d="M150 22v98M150 60l34-22M150 80l-34-22M150 96l30-18" stroke="#4C7A3E" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  sun:     '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#FBEFD8"/><circle cx="150" cy="78" r="34" fill="#E6A23C"/><g stroke="#C0703C" stroke-width="3" stroke-linecap="round"><path d="M150 20v14M150 122v14M82 78H68M232 78h14M104 32l-9-9M196 124l9 9M196 32l9-9M104 124l-9 9"/></g></svg>',
  night:   '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#23303A"/><path d="M210 40a26 26 0 1 0 14 47 30 30 0 0 1-14-47Z" fill="#E7DCC4"/><g fill="#D9C9A6"><circle cx="80" cy="44" r="2"/><circle cx="120" cy="30" r="1.6"/><circle cx="60" cy="80" r="1.6"/><circle cx="150" cy="56" r="1.6"/></g><rect x="96" y="96" width="108" height="10" rx="3" fill="#C0703C"/><rect x="120" y="78" width="60" height="18" rx="3" fill="#8A5A38"/></svg>',
  water:   '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#E3EEF2"/><circle cx="232" cy="40" r="18" fill="#E6A23C"/><path d="M150 38c10 16 18 26 18 36a18 18 0 1 1-36 0c0-10 8-20 18-36Z" fill="#3E6B82"/><path d="M20 120q30-16 60 0t60 0 60 0 60 0" stroke="#3E6B82" stroke-width="4" fill="none"/></svg>',
  food:    '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#FBEEE2"/><ellipse cx="150" cy="116" rx="92" ry="14" fill="#E7DACB"/><circle cx="150" cy="80" r="46" fill="#fff" stroke="#E2D2BE" stroke-width="3"/><circle cx="150" cy="80" r="26" fill="#C0703C"/><path d="M150 54c8-10 22-8 22 2 0 8-12 10-22 6Z" fill="#6FA15B"/><path d="M150 56v-12" stroke="#6B4A2A" stroke-width="3" stroke-linecap="round"/></svg>',
  money:   '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#ECF1EC"/><g fill="#E6A23C" stroke="#A85E2E" stroke-width="2"><ellipse cx="92" cy="64" rx="34" ry="13"/><path d="M58 64v18c0 7 15 13 34 13s34-6 34-13V64"/></g><g fill="#6FA15B"><rect x="158" y="92" width="16" height="34" rx="2"/><rect x="184" y="74" width="16" height="52" rx="2"/><rect x="210" y="54" width="16" height="72" rx="2"/></g><path d="M150 50l24-12 24 18" stroke="#3F7D5B" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  health:  '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#FBE9E7"/><path d="M150 122c-46-28-66-52-66-76a30 30 0 0 1 56-15 30 30 0 0 1 56 15c0 24-20 48-46 76Z" fill="#C0703C"/><path d="M104 80h22l8-16 12 32 8-16h26" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  space:   '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#1B2333"/><g fill="#E7DCC4"><circle cx="60" cy="40" r="2"/><circle cx="110" cy="28" r="1.4"/><circle cx="250" cy="38" r="1.6"/><circle cx="220" cy="100" r="1.4"/><circle cx="40" cy="100" r="1.6"/></g><circle cx="158" cy="80" r="34" fill="#C0703C"/><ellipse cx="158" cy="80" rx="58" ry="14" fill="none" stroke="#E6A23C" stroke-width="3" transform="rotate(-18 158 80)"/></svg>',
  science: '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#E9EEF4"/><circle cx="150" cy="78" r="9" fill="#C0703C"/><g fill="none" stroke="#3E6B82" stroke-width="2.5"><ellipse cx="150" cy="78" rx="56" ry="22"/><ellipse cx="150" cy="78" rx="56" ry="22" transform="rotate(60 150 78)"/><ellipse cx="150" cy="78" rx="56" ry="22" transform="rotate(120 150 78)"/></g><g fill="#6FA15B"><circle cx="206" cy="78" r="4"/><circle cx="122" cy="34" r="4"/><circle cx="122" cy="122" r="4"/></g></svg>',
  tech:    '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#ECEAF4"/><rect x="112" y="50" width="76" height="56" rx="8" fill="#25363D"/><rect x="128" y="66" width="44" height="24" rx="4" fill="#C0703C"/><g stroke="#8A5A38" stroke-width="3" stroke-linecap="round"><path d="M120 50v-12M150 50v-12M180 50v-12M120 106v12M150 106v12M180 106v12M112 64H98M112 92H98M188 64h14M188 92h14"/></g></svg>',
  history: '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#F1E9DA"/><rect x="96" y="40" width="108" height="74" rx="4" fill="#F8F1E2" stroke="#C9B79A" stroke-width="3"/><g stroke="#8A5A38" stroke-width="3" stroke-linecap="round"><path d="M112 58h76M112 72h76M112 86h54"/></g><path d="M88 40c0 6 8 6 8 0M204 114c0-6 8-6 8 0" fill="none" stroke="#A85E2E" stroke-width="3"/></svg>',
  gears:   '<svg viewBox="0 0 300 150"><rect width="300" height="150" rx="10" fill="#ECE6DC"/><g fill="none" stroke="#8A5A38" stroke-width="6"><circle cx="120" cy="75" r="30"/><circle cx="186" cy="92" r="20"/></g><g fill="#C0703C"><circle cx="120" cy="75" r="8"/><circle cx="186" cy="92" r="6"/></g><rect x="60" y="116" width="180" height="8" rx="3" fill="#A8743F"/></svg>',
};

/** Pick a scene SVG for a page's text (broad keyword routing, neutral default). */
function sceneFor(text) {
  const t = String(text || '').toLowerCase();
  const has = (re) => re.test(t);
  if (has(/nutri|food|diet|vitamin|calorie|protein|carb|fat\b|meal|fruit|veget|fibre|fiber|mineral|recipe|cook|sugar|snack/)) return SCENES.food;
  if (has(/money|financ|bank|invest|stock|market|econom|budget|profit|revenue|\btax|price|cost|trade|currenc|dollar|sales|wealth/)) return SCENES.money;
  if (has(/health|\bbody|heart|blood|\bcell|muscle|brain|medic|disease|patient|fitness|hydrat|wellness|hospital/)) return SCENES.health;
  if (has(/space|planet|\bstar|galaxy|orbit|\bmoon|astronaut|cosmos|universe|solar|comet|nasa/)) return SCENES.space;
  if (has(/scien|atom|molecul|chemi|physic|experiment|\blab\b|reaction|element|biolog|formula|theory/)) return SCENES.science;
  if (has(/tech|comput|software|\bcode|digital|machine|robot|circuit|\bdata\b|internet|\bai\b|algorithm|app\b|chip/)) return SCENES.tech;
  if (has(/histor|ancient|\bking|empire|\bwar\b|centur|civiliz|press|gutenberg|print|scribe|medieval|revolution|1[0-9]{3}/)) return SCENES.history;
  if (has(/leaf|leaves|photosyn|chlorophyll|\btree|forest|green|plant|garden|botan/)) return SCENES.leaf;
  if (has(/water|rain|\bsea\b|ocean|river|cloud|\bdrop|stream|wave|lake/)) return SCENES.water;
  if (has(/night|candle|\bdark|dream|sleep|midnight|nocturn/)) return SCENES.night;
  if (has(/gear|engine|factory|industr|mechan|motor/)) return SCENES.gears;
  return SCENES.sun;
}

module.exports = { SCENES, sceneFor };
