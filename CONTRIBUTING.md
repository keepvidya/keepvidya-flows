# Contributing to Keepvidya Flows

Thanks for your interest! Flows is a local-first AI desktop app, and contributions of all kinds are welcome — bug reports, new flows, document loaders, provider support, docs, and design.

## Ways to help

- **Found a bug?** Open a [bug report](https://github.com/keepvidya/keepvidya-flows/issues/new?template=bug_report.yml).
- **Have an idea or a question?** Start a [Discussion](https://github.com/keepvidya/keepvidya-flows/discussions) — it's the best place before a big change.
- **Want to code?** Grab a [`good first issue`](https://github.com/keepvidya/keepvidya-flows/labels/good%20first%20issue) or comment on an issue to claim it.

## Development setup

```bash
cd app
npm install
npm start            # launches the Electron app  (npm run dev for --dev)
```

The default **Local** engine needs a local [Ollama](https://ollama.com) with a `shiva-chat` model; otherwise add a key in Settings (BYOK).

## Before you open a PR

Run the suites — at minimum the end-to-end one:

```bash
cd app
node test/make-fixtures.js
node test/check-extract.js
node test/check-ssrf.js
node_modules/.bin/electron test/e2e.js     # full UI E2E (should be all green)
```

Then:

1. Branch from `main`; keep changes focused.
2. Match the style of the surrounding code (no large reformatting).
3. Update `TEST-PLAN.md` / docs if behavior changes.
4. Open the PR — the template walks you through it, and an `area:` label is applied automatically.

## Project layout

| Path | What |
|------|------|
| `app/main.js` · `app/preload.js` | Electron main + the `window.kvflows` bridge |
| `app/lib/` | engine, providers, document loader, library, system probe, store |
| `app/renderer/` | the UI |
| `app/test/` | fixtures + extraction/domain/SSRF/E2E suites |

By contributing, you agree your contributions are licensed under the repository's [MIT License](LICENSE).
