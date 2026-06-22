# Keepvidya Flows — End-to-end test plan

Every interactive control, the action to take, and the expected result. Automated
coverage lives in `app/test/e2e.js` (drives the real renderer over IPC) and
`app/test/check-extract.js` (file extraction). Run them with:

```
cd app
node test/make-fixtures.js     # writes test/fixtures/* (txt md csv json pdf docx)
node test/check-extract.js     # asserts every fixture extracts to real text
node_modules/.bin/electron test/e2e.js    # full UI + generation E2E (needs Ollama running)
```

Legend: ✅ automated in e2e.js · 👁 manual/visual check.

---

## 1. Window chrome (frameless)
| Control | Action | Expected |
|---|---|---|
| Titlebar | drag it | window moves (whole titlebar is the drag region) ✅(region present) |
| Minimise | click ⎯ | window minimises 👁 |
| Maximise | click ▢ | toggles maximise/restore 👁 |
| Close | click ✕ | window hides to the system tray (not quit); reopen from tray 👁 |
| OS menu | — | there is NO File/Edit/View menu bar ✅ |
| Gutters | — | content fills the whole window, no dark side margins, no prototype dock ✅ |

## 2. First-run installer (only when not yet configured)
| Step | Action | Expected |
|---|---|---|
| Welcome | click **Begin setup** | advances to "How should Flows run?" ✅ |
| Path | pick **Local & private** / **Connect a key** | card selects; Continue enabled ✅ |
| Continue (local) | click | shows **system check** — Ollama status + hardware + recommended model ✅ |
| System check | — | Ollama detected → "skipping install"; recommends Fast/Quality per RAM/GPU ✅ |
| Continue | click | install runs (progress + Catch-the-Spark); local skips download if model present ✅ |
| Done → **Launch** | click | enters the app; mode saved → future launches skip the installer ✅ |
| BYOK path | pick Connect a key → finish | launches into **Settings** ("No engine yet") ✅ |

## 3. Sidebar navigation
| Item | Action | Expected |
|---|---|---|
| New flow / Make something | click | shows the generator ("Make something") ✅ |
| Library | click | shows **My library** (saved items grid, or empty state) ✅ |
| Playground | click | shows the playable Snake ✅ |
| Models | click | lists Shiva-Writer / Shiva-Chat / Shiva-Code with live install status ✅ |
| Settings | click | shows Settings (Providers tab) ✅ |
| **CV screener / Invoice & chase / Local intake** | click | **disabled ("Soon")** — no navigation ✅ |
| Doc → storybook | click | opens generator, paste filled with a sample, storybook picked ✅ |
| Model pill (top-right) | click | menu lists Shiva · Local + configured providers + "Manage in Settings" ✅ |

## 4. Generator — "Make something"
| Control | Action | Expected |
|---|---|---|
| Paste text tab | type/paste | char count updates; Generate enables ✅ |
| Quick-fill chips | click (e.g. Printing-press) | textarea fills; flow set; Generate enabled ✅ |
| Upload file tab | choose a file | extracts real text (txt/md/csv/json/**pdf**/**docx**); chip shows name; Generate enables ✅(extract) |
| Upload — unsupported/empty | choose e.g. .exe | shows a red error chip; Generate stays disabled ✅ |
| Web link tab | type a URL | Generate enables ✅ |
| Flow pick | Illustrated storybook / Playable game | card selects; button label tracks it ✅ |
| Generate (no input) | — | disabled, hint "Add some input" ✅ |
| Generate (with input) | click | goes to Wait, then the real result ✅ |

## 5. Wait / Playground
| Control | Action | Expected |
|---|---|---|
| Progress + live-peek | — | bar creeps; peek shows real model steps ✅ |
| Catch-the-Spark | click sparks | score increments 👁 |
| Skip to result | — | **hidden in the real app** (can't skip a live run) ✅ |
| Navigate away mid-run | click a sidebar item | run finishes silently; you are NOT yanked back ✅ (race fix) |

## 6. Result — storybook (immersive reader)
| Control | Action | Expected |
|---|---|---|
| Reader | — | cover + chapter pages from YOUR input (e.g. nutrition → nutrition story) ✅ |
| Prev / Next | click / ← → | flips pages; disabled at ends ✅ |
| Dots | click | jumps to that page ✅ |
| Download PDF | click | save dialog → writes an HTML storybook; flashes "Saved" 👁 |
| **Novelize** | click | re-runs as a richer book, opens reader ✅ |
| **Make another** | click | returns to the generator (NOT a dead end) ✅ (race fix) |
| See the game → | click | switches to the game result ✅ |
| Saved to library | — | the result auto-saved (appears in Library) ✅ |

## 7. Result — game
| Control | Action | Expected |
|---|---|---|
| Game | — | a generated HTML game in an iframe, or the built-in Snake fallback ✅ |
| Snake | arrows / WASD / D-pad | moves, scores, game-over → tap to replay 👁 |
| Download game.html | click | save dialog → writes the game; flashes "Saved" 👁 |
| Make another | click | returns to the generator ✅ |
| See the storybook → | click | switches to the storybook result ✅ |

## 8. Library
| Control | Action | Expected |
|---|---|---|
| Grid | — | every saved book/game, newest first, with model + age ✅ |
| Open | click | loads the item into the reader / game ✅ |
| Novelize (books) | click | novelizes it into a new saved book ✅ |
| Delete | click | removes it; grid updates ✅ |
| Empty state | (no items) | "Nothing here yet… Make something" ✅ |

## 9. Models
| Control | Action | Expected |
|---|---|---|
| Cards | — | Shiva-Writer / Shiva-Chat / Shiva-Code, job + size + install status ✅ |
| Open Settings → | click | goes to Settings ✅ |

## 10. Settings
| Control | Action | Expected |
|---|---|---|
| Providers tabs | Providers/Appearance/Updates/About | section switches ✅ |
| Default engine | select | persists ✅ |
| Provider card → Test & save | enter key, click | tests via real API; marks Connected; "N configured · 7 supported" ✅(wiring) |
| Local model | — | "Installed · offline ready" ✅ |
| Theme (Appearance) | Light/Dark | theme switches, persists ✅ |
| Check for updates | click | checks (no-op in dev) 👁 |

## 11. Auto-update (manual)
| Control | Action | Expected |
|---|---|---|
| New release pushed (tag) | — | GitHub Action builds + publishes installer + latest.yml 👁 |
| Installed app | — | downloads in background → "Restart to update" banner → restart 👁 |

---

## Regression checks for the 3 reported bugs
1. **PDF gave arithmetic** → upload `fixtures/nutrition.pdf` (or the real textbook): the storybook/game is about **nutrition**, because real text is extracted (not binary). ✅
2. **Skip → dead-end snake** → the Skip button is hidden in the app; a live run can't be skipped; navigating away no longer yanks you. ✅
3. **Make another builds nothing** → after any result, Make another reliably returns to the generator and a new run starts. ✅
