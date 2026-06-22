# Security Policy

## Supported versions

Keepvidya Flows is pre-1.0 and ships from `main`. Security fixes land in the latest release; please always update to the newest version before reporting.

| Version | Supported |
|---------|-----------|
| latest  | ✅ |
| older   | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's [security advisories](https://github.com/keepvidya/keepvidya-flows/security/advisories/new). We aim to acknowledge within a few days and will coordinate a fix and disclosure with you.

## Scope & design notes

Flows is **local-first** — by default it runs on a bundled model and nothing leaves your machine. A few areas are security-relevant:

- **Web-link intake** fetches arbitrary URLs, so it is **SSRF-guarded**: only public `http`/`https` hosts are allowed; loopback, private, link-local, and reserved ranges (including the cloud-metadata address `169.254.169.254`) are blocked; hostnames are DNS-resolved and re-checked; and every redirect hop is re-validated. See `app/lib/docloader.js`.
- **BYOK keys** are stored encrypted on-device with Electron `safeStorage` and are never committed or sent anywhere except the provider you configured.
- **Document loading** never executes file contents; it extracts text only.

If you find a way around any of these, we want to hear about it.
