# GSTD repository maintenance and review queue

Checked 2026-11-18. [Project map](INDEX.md) · [Release evidence](READINESS.md) · [Start here](START_HERE.md).

## Canonical repositories

| Repository | Default branch | Owns | Boundary |
| --- | --- | --- | --- |
| [ai](https://github.com/gstdcoin/ai) | main | Platform, registry/task APIs, Redis ledger, escrow orchestration and Telegram webhook | Cloudflare application; bots do not run on compute nodes |
| [gstdbot](https://github.com/gstdcoin/gstdbot) | main | Compute daemon, Ollama integration, installer and operator dashboard | Source, approved signed release and installed process are separate |
| [web](https://github.com/gstdcoin/web) | main | Public website, explanation and optional demo | Main app/payment state belongs to ai |
| [contracts](https://github.com/gstdcoin/contracts) | master | Tact source, Sandbox tests and deployment evidence | Source/Testnet proof does not activate mainnet |
| [A2A](https://github.com/gstdcoin/A2A) | master | Python/JavaScript clients and bounded local MCP connector | Integration SDK; the monitors are not compute executors by default |
| [gstd-bridge](https://github.com/gstdcoin/gstd-bridge) | main | Deferred Rust bridge research | No production vaults, deposits or withdrawals |
| [gstdcoin](https://github.com/gstdcoin/gstdcoin) | main | Public profile and entry links | Navigation only |

Defaults remain unchanged so existing links and CI targets remain valid. All publication in this maintenance work uses gstdcoin repositories and branches. Repository About descriptions are already present; README summaries, canonical links and operating boundaries provide the longer descriptions. Existing LICENSE/NOTICE files and third-party rights are unchanged.

## Open review queue

| Proposal | Disposition | Next review |
| --- | --- | --- |
| [Node PR 7](https://github.com/gstdcoin/gstdbot/pull/7) | Retained: its shell-command changes are not in current main. | Review the scoped orchestrator/validator changes against current source; avoid importing stale lockfile churn. No remediation assurance is inferred from the PR title. |
| [Node PR 8](https://github.com/gstdcoin/gstdbot/pull/8) | Draft retained: signed installer/update candidate, separate from merged CPU/recovery work. | Rebase on current main and validate an operator-approved compatible release before promotion. |
| [Node PR 10](https://github.com/gstdcoin/gstdbot/pull/10) | Draft retained: self-tests, real task journal and scheduled maintenance are new changes. | Integrate with current capacity/CPU/failure behavior; verify drain semantics and persistent journal. |
| [Website PR 12](https://github.com/gstdcoin/web/pull/12) | Owned draft replaces the old external-head PR 10, preserving its proposal. | Website checks plus signed-installer/release dependency; no production deployment from this draft. The installer URL is immutable and its checksum was checked without execution. |
| [Platform host-offers branch](https://github.com/gstdcoin/ai/tree/codex/verified-host-offers) | Separate candidate, not promoted by the Redis deployment. | Compare with current registry/price contracts and test verified hardware/full price semantics. |
| [Platform mainnet-remediation branch](https://github.com/gstdcoin/ai/tree/codex/mainnet-remediation) | Preserve for scoped integration review. | Compare current main before reusing diagnostics/Telegram changes; do not overwrite the deployed runtime/RPC fixes. |

[Contracts PR 1](https://github.com/gstdcoin/contracts/pull/1) is retained as closed legacy design history. It proposes broad SettlementMaster changes and generated build artifacts for a retired reward-sender path. Current ledger withdrawals use custody-owner-signed canonical transfers; per-job escrow has separate v1/v2 evidence. No claim is made that every legacy proposal was implemented. Future reuse needs a scoped source change and current transfer tests.

Merged PRs and existing topic branches remain accessible for provenance. No branch, tag, release, operator state or signing material was deleted. A branch name alone does not establish an active implementation or deployment.

## Editing and verification

1. Read the repository's AGENTS.md and work in its actual default branch or a gstdcoin-owned review branch. Preserve unrelated local changes.
2. Use the owning component's lockfile. Platform/node/website/contracts use Node 22 and npm 11.13.0; SDK CI also tests Node 20 and Python 3.9/3.11/3.12; bridge checks require Rust.
3. Keep README instructions and the document index linked to actual files. Put current evidence in READINESS, historical material in the existing ARCHIVED files, and unmerged design work in this queue.
4. Run checks appropriate to the change. Documentation changes need link/path/command checks; runtime changes need their component's type/lint/tests/build. Do not disable existing CI gates to clean up the queue.
5. Platform and website source pushes can deploy. Preview isolation, runtime-secret validation, signed node releases and contract owner signatures remain separate controls. No secret belongs in a README or commit.

CI checks may run for documentation-only pushes in some repositories. Never interpret a green build as an independent security audit, paid demand, GPU capacity or a confirmed on-chain payout.
