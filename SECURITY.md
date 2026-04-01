# Security

## Reporting a vulnerability

Please report security issues **privately** instead of opening a public issue.

- Prefer: [GitHub Security Advisories](https://github.com/gstdcoin/ai/security/advisories/new) (private disclosure).
- Alternatively: contact the maintainers through the official Telegram channel listed on [https://app.gstdtoken.com](https://app.gstdtoken.com) (footer).

Include steps to reproduce, affected components (frontend, backend, contracts), and severity if known.

## Scope

- Web application and API at `*.gstdtoken.com`
- This repository (Go backend, Next.js frontend, Tact contracts, automation scripts)

Out of scope: third-party wallet software, blockchain RPC providers, and user device compromise.

## Static analysis (Go)

CI runs [gosec](https://github.com/securego/gosec) via [`scripts/gosec-baseline.sh`](scripts/gosec-baseline.sh): excludes `docs/` and `scripts/` and a fixed rule set that matches known false positives in this tree (unchecked `Close()` / noisy rules). Tighten excludes over time; do not treat a clean baseline as “no security work left”.

## Response

We aim to acknowledge valid reports within a few business days. Critical issues affecting funds or authentication are prioritized.
