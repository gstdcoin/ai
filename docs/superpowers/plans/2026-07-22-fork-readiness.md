# gstdai Fork-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close remaining fork-readiness gaps in this repo, beyond the two security fixes already shipped separately (default admin API key removal, live Next.js auth-bypass fixes). This plan covers: a real (if currently dormant) config default collision, two GSTD-address hardcodes with zero config reference, a CI job that fails loudly on forks, and 3 large binaries tracked directly in git.

**Architecture:** Four independent tasks, all backend/Go except the CI one. No behavior change to any currently-active code path -- every fix here either corrects dead/dormant config or adds a guard that's a no-op for the canonical repo.

**Tech Stack:** Go (backend), GitHub Actions (CI).

## Global Constraints

- The GSTD jetton address is `EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO` -- correct everywhere it appears; fixes are consolidation, not correction.
- Do NOT touch `backend/internal/services/autonomous_developer.go` or its sibling files (`auto_coder.go`, `obsidian_vault.go`, `operator_departments.go`) -- these were investigated and deliberately excluded from this plan. They implement an autonomous, unreviewed code-modification system that auto-commits and `git push origin main` across multiple repositories (this one, `gstdbot`, and paths outside any repo this session has context on), with dozens of hardcoded `/home/ubuntu` paths embedded inside shell-command strings (not simple path constants). Confirmed dormant (no process for this anywhere on this host, and `StartAutonomousDeveloper()` is gated behind `op.ai != nil`, itself never observed configured) -- but the combination of high blast radius (auto-push to git, multiple repos, no review gate) and the mechanical complexity of safely parameterizing paths embedded in shell strings makes this a genuinely separate, higher-risk piece of work. Flagged to the human partner as its own decision (fix vs. remove vs. leave), not silently rewritten here.
- `backend/` is NOT what's deployed to the live platform (confirmed via this repo's own `CLAUDE.md`: "Hosting: Vercel (serverless). No Go backend. No Docker in production.") -- these are lower-urgency correctness/hygiene fixes to code that isn't live, not emergency patches.

---

## Task 1: Fix `DAOVotingAddress`'s copy-paste default

**Files:**
- Modify: `/home/bot/gstdai/backend/internal/config/config.go`

**Why:** `DAOVotingAddress` (a "smart contract for DAO" voting, per its own comment) defaults to the exact same address as `XAUtJettonAddress` (Tether Gold's jetton master on TON) -- a semantically nonsensical coincidence that's almost certainly a copy-paste error. Confirmed via `grep -rn "DAOVotingAddress" backend/ --include="*.go"` that this field has zero readers anywhere in the codebase (dead config, no live behavior currently affected), so this is a correctness fix for whenever DAO voting is actually implemented, not an active bug.

- [ ] **Step 1: Confirm current state**

```bash
cd /home/bot/gstdai
grep -n "DAOVotingAddress\|XAUtJettonAddress\|XAUT_JETTON_MASTER\|DAO_VOTING_ADDRESS" backend/internal/config/config.go
```

Confirm both `XAUtJettonAddress` (line ~105) and `DAOVotingAddress` (line ~123) still default to the identical literal `EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k`.

- [ ] **Step 2: Give `DAOVotingAddress` its own honest default**

Replace (currently line 123):
```go
			DAOVotingAddress:         getEnv("DAO_VOTING_ADDRESS", "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k"),
```
with:
```go
			DAOVotingAddress:         getEnv("DAO_VOTING_ADDRESS", ""), // no DAO voting contract deployed yet -- was copy-pasted from XAUtJettonAddress
```

- [ ] **Step 3: Verify zero readers still holds (sanity re-check before committing)**

```bash
cd /home/bot/gstdai
grep -rn "DAOVotingAddress" backend/ --include="*.go" | grep -v "_test.go"
```

Expected: only the two lines in `config.go` (the struct field declaration and this one assignment) -- if a reader turns up that this plan's author missed, STOP and report NEEDS_CONTEXT rather than assuming an empty default is safe for it.

- [ ] **Step 4: Build**

```bash
cd /home/bot/gstdai/backend
export PATH="/home/bot/.local/go/bin:$PATH"
go build ./...
```

Expected: success (Go toolchain is at `/home/bot/.local/go/bin`, not on default PATH in this environment).

- [ ] **Step 5: Commit**

```bash
cd /home/bot/gstdai
git add backend/internal/config/config.go
git commit -m "$(cat <<'EOF'
fix: DAOVotingAddress no longer defaults to XAUt's jetton address

Both fields defaulted to the identical literal
(EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k) -- a DAO voting
contract and Tether Gold's jetton master are unrelated assets, so this
was almost certainly a copy-paste error. Confirmed DAOVotingAddress has
zero readers anywhere in the codebase (dead config -- no DAO voting
feature exists yet), so this doesn't change any current behavior, just
stops a future DAO-voting feature from silently pointing at the wrong
contract if it ever reads this default without setting DAO_VOTING_ADDRESS.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Consolidate 2 zero-config-reference GSTD address hardcodes

**Files:**
- Modify: `/home/bot/gstdai/backend/internal/services/sovereign_bridge_service.go`
- Modify: `/home/bot/gstdai/backend/internal/services/stonfi_service.go`

**Why:** Both files define their own standalone GSTD address literal instead of reading `config.TON.GSTDJettonAddress` (already the correct, env-overridable source of truth used elsewhere in `backend/`) -- a fork changing tokens would miss these two.

- [ ] **Step 1: Confirm current state and how each service accesses config**

```bash
cd /home/bot/gstdai
grep -n "gstdAddr := \"EQDv6\|Token_GSTD" backend/internal/services/sovereign_bridge_service.go backend/internal/services/stonfi_service.go
grep -n "type.*Service struct" -A 15 backend/internal/services/sovereign_bridge_service.go | head -20
grep -n "type.*Service struct" -A 15 backend/internal/services/stonfi_service.go | head -20
```

Read enough of each file's struct definition and constructor to determine whether the service already holds a reference to the loaded `*config.Config` (or a sub-struct of it) it could read from, or whether one needs to be threaded through. Both files are in the same package (`services`), so check whether a shared config-access pattern already exists (e.g. a package-level `config.GetConfig()` call used elsewhere in this package) before assuming a struct-field change is needed.

- [ ] **Step 2: Fix `sovereign_bridge_service.go`**

Currently (around line 553, inside a method body):
```go
	// Get real-time swap quote from STON.fi DEX
	gstdAddr := "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
```
Replace with a read from config, matching whatever pattern Step 1 found (e.g. if a package-level `config.GetConfig()` accessor exists elsewhere in this package, use it):
```go
	// Get real-time swap quote from STON.fi DEX
	gstdAddr := config.GetConfig().TON.GSTDJettonAddress
```
(adjust the exact accessor call to match this codebase's real pattern -- verify by finding another call site in the same package that reads `config.GetConfig()` or equivalent, and copy that exact style rather than guessing at import paths)

- [ ] **Step 3: Fix `stonfi_service.go`**

Currently (around line 207, inside a `const (...)` block):
```go
	const (
		Token_TON  = "TON"
		Token_GSTD = "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
		Token_XAUT = "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k" // From Pool Data
		// Note: Keep legacy XAUt address check if needed, but prioritized pool data
	)
```
A Go `const` block cannot call a function (`config.GetConfig()` isn't a compile-time constant), so this requires converting `Token_GSTD` from a `const` to a `var` read at the point of use, OR reading it once at the top of the enclosing function and using a local variable instead of the const for just this one value. Read the function this block lives in fully, then apply whichever change is more consistent with how the surrounding code already uses `Token_GSTD` (grep for its other usages within this same function/file first):
```bash
grep -n "Token_GSTD" backend/internal/services/stonfi_service.go
```
If `Token_GSTD` is used only within this one function, replace the const declaration line with a local variable declared just before or after the `const (...)` block:
```go
	const (
		Token_TON  = "TON"
		Token_XAUT = "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k" // From Pool Data
		// Note: Keep legacy XAUt address check if needed, but prioritized pool data
	)
	Token_GSTD := config.GetConfig().TON.GSTDJettonAddress
```
(again, match the exact config-access call style found in Step 1; if `Token_GSTD` is referenced in OTHER functions in this file too, you'll need a package-level `var` instead of a function-local one -- check before choosing)

- [ ] **Step 4: Verify no remaining zero-config-reference hardcodes**

```bash
cd /home/bot/gstdai
grep -n "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO" backend/internal/services/sovereign_bridge_service.go backend/internal/services/stonfi_service.go
```

Expected: no output (both now read from config instead of a literal).

- [ ] **Step 5: Build**

```bash
cd /home/bot/gstdai/backend
export PATH="/home/bot/.local/go/bin:$PATH"
go build ./...
```

Expected: success. If `stonfi_service.go`'s const-to-var conversion breaks compilation (e.g. `Token_GSTD` was relied on elsewhere as a true compile-time constant, such as in another `const` block's initializer), STOP and report NEEDS_CONTEXT with the exact compiler error rather than working around it blindly.

- [ ] **Step 6: Commit**

```bash
cd /home/bot/gstdai
git add backend/internal/services/sovereign_bridge_service.go backend/internal/services/stonfi_service.go
git commit -m "$(cat <<'EOF'
chore: read GSTD address from config in 2 services with no config reference

sovereign_bridge_service.go and stonfi_service.go each hardcoded their
own copy of the GSTD jetton address with no way to override it,
unlike every other service in this package which reads
config.TON.GSTDJettonAddress (env-overridable via GSTD_JETTON_ADDRESS).
A fork changing tokens would have missed these two.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Guard CI so forks don't get a failing Vercel deploy

**Files:**
- Modify: `/home/bot/gstdai/.github/workflows/ci.yml`

**Why:** The `deploy` job hardcodes `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` for this specific Vercel project and runs on every push to `main` -- a fork would get a failing "Deploy" check on every push (missing `VERCEL_TOKEN` secret, and even with one configured, the hardcoded org/project IDs point at the canonical deployment, not the fork's own).

- [ ] **Step 1: Confirm current state**

```bash
cd /home/bot/gstdai
grep -n "^  deploy:" -A 10 .github/workflows/ci.yml
```

Confirm the job is still named `deploy`, gated by `if: (github.ref == 'refs/heads/main' && github.event_name == 'push') || github.event_name == 'workflow_dispatch'` (currently line 52), immediately followed by the hardcoded `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` env values (lines 55-56).

- [ ] **Step 2: Add a repository guard**

Replace (currently line 52):
```yaml
    if: (github.ref == 'refs/heads/main' && github.event_name == 'push') || github.event_name == 'workflow_dispatch'
```
with:
```yaml
    if: github.repository == 'gstdcoin/ai' && ((github.ref == 'refs/heads/main' && github.event_name == 'push') || github.event_name == 'workflow_dispatch')
```

- [ ] **Step 3: Verify YAML validity**

```bash
cd /home/bot/gstdai
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
cd /home/bot/gstdai
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
fix(ci): skip Vercel deploy job on forks instead of failing it

The deploy job's VERCEL_ORG_ID/VERCEL_PROJECT_ID are hardcoded to this
specific Vercel project, and the job ran on every push to main
regardless of which repository -- a fork would get a failing "Deploy"
check every time (missing VERCEL_TOKEN, and even with one configured,
the hardcoded IDs point at the canonical project, not the fork's own).
Added a repository guard, matching the same pattern already applied to
gstdbot's Docker publish job and gstd-a2a's PyPI publish job.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Stop tracking 3 large binaries

**Files:**
- Delete from git: `/home/bot/gstdai/frontend/public/downloads/gstd-bridge` (12M)
- Delete from git: `/home/bot/gstdai/frontend/public/downloads/gstd-bridge.gz` (4.6M)
- Delete from git: `/home/bot/gstdai/backend/cmd/worker/gstd-worker` (8.6M)
- Modify: `/home/bot/gstdai/.gitignore`

**Why:** All 3 are compiled binaries checked directly into git -- bloats every clone by ~25MB and isn't a reproducible/verifiable artifact (no way to confirm it matches the source it claims to be built from).

- [ ] **Step 1: Confirm what references these files**

```bash
cd /home/bot/gstdai
grep -rn "public/downloads/gstd-bridge\|cmd/worker/gstd-worker" --include="*.ts" --include="*.tsx" --include="*.go" --include="*.md" --include="*.yml" . 2>/dev/null | grep -v node_modules
```

Read every hit's surrounding context. If `frontend/public/downloads/gstd-bridge{,.gz}` is served as a static download link (e.g. a "Download the bridge validator" button in the UI), removing it from git tracking without a replacement build/release step would break that download for real users -- this is a live-served static asset, different in kind from gstdbot's `cloudflared` (which is a build-time dependency, not something end users click "Download" for). If you find such a reference, STOP and report NEEDS_CONTEXT rather than deleting a file real users might currently be downloading -- this needs a decision about what replaces it (a GitHub Release asset? a build step that compiles it fresh? removing the download link entirely because gstd-bridge is dormant, per this session's other findings?), not a silent deletion.

- [ ] **Step 2: Handle `backend/cmd/worker/gstd-worker` (lower risk -- check first, likely a build artifact, not a served download)**

```bash
cd /home/bot/gstdai
grep -rn "cmd/worker/gstd-worker" --include="*.go" --include="*.yml" --include="*.sh" --include="*.md" . 2>/dev/null | grep -v node_modules
file backend/cmd/worker/gstd-worker 2>/dev/null
ls backend/cmd/worker/ 2>/dev/null
```

If this is a compiled binary sitting alongside its own Go source in `cmd/worker/` (i.e., `go build` would regenerate it from source already in this repo), it's safe to untrack -- it's a build artifact, not a distributed asset. If instead nothing in `backend/cmd/worker/` would rebuild it (no `.go` source file there), STOP and report NEEDS_CONTEXT.

- [ ] **Step 3: Untrack whichever files Steps 1-2 confirm are safe, add to `.gitignore`**

```bash
cd /home/bot/gstdai
# Only run for files confirmed safe in Steps 1-2 -- do not blindly run all three
git rm --cached <confirmed-safe-file-1> <confirmed-safe-file-2> ...
```

Add corresponding patterns to `.gitignore` (e.g. `/backend/cmd/worker/gstd-worker` and/or `/frontend/public/downloads/gstd-bridge*` -- only for what was actually untracked).

- [ ] **Step 4: Commit**

```bash
cd /home/bot/gstdai
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: stop tracking compiled binaries confirmed safe to untrack

[Adjust this message to describe exactly which file(s) were untracked
and why, based on what Steps 1-2 actually found -- do not use this
placeholder text verbatim.]

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(If Step 1 found that `frontend/public/downloads/gstd-bridge{,.gz}` is a live download link with no replacement plan, skip untracking those two specifically and report this to the human partner as a separate decision instead of guessing at a replacement strategy.)

---

## Task 5: Final verification and push

**Files:** none (verification only).

- [ ] **Step 1: Full backend build**

```bash
cd /home/bot/gstdai/backend
export PATH="/home/bot/.local/go/bin:$PATH"
go build ./...
```

- [ ] **Step 2: Full repo-wide check for the fixed items**

```bash
cd /home/bot/gstdai
grep -rn "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k" backend/internal/config/config.go
grep -n "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO" backend/internal/services/sovereign_bridge_service.go backend/internal/services/stonfi_service.go
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('OK')"
```

Expected: the first grep shows ONLY `XAUtJettonAddress`'s line (not `DAOVotingAddress`'s, which should now be empty-default); the second shows no output; the third prints `OK`.

- [ ] **Step 3: Push**

```bash
cd /home/bot/gstdai
git push origin main
```

**⚠ This triggers a live Vercel deploy of app.gstdtoken.com (per this repo's CI/CD).** None of this plan's changes touch `frontend/` behavior (Task 4 may remove a static download asset, pending Task 4's own investigation), so the deploy should be a no-behavior-change redeploy -- but confirm with the human partner before pushing if that assumption doesn't hold once Task 4 is actually executed.
