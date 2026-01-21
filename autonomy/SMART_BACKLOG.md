# 🧠 GSTD Autonomy: Smart Backlog for Ollama (Qwen2.5-Coder)

This document defines the rules of engagement for the autonomous AI agent (Ollama) running on the local VPS.

## 🛡️ Core Rules
1.  **Do No Harm:** Never modify existing logic in `internal/services/` without explicit approval or if it changes the function signature.
2.  **Stability First:** Prioritize system uptime over new features.
3.  **Security:** Never output private keys, API keys, or `.env` contents to logs or external chats.

## 🟢 Autonomous Tasks (Allowed without Approval)
The AI agent is AUTHORIZED to autonomously perform the following via n8n triggers:

### 1. Code Checks & Minor Fixes
*   **Linting:** Fix formatting issues (e.g., `gofmt`).
*   **Comments:** Add documentation comments to exported functions if missing.
*   **Typos:** Fix spelling errors in strings/logs.
*   **Unit Tests:** Generate new unit tests for functions that have < 50% coverage, saving them to `*_test.go` files.

### 2. Monitoring & Scaling
*   **Alerting:** Notify the admin via Telegram if CPU > 80% or RAM > 90%.
*   **Log Analysis:** Parse `error_logs` table (severity 'ERROR') and summarize patterns. Suggest fixes to the human admin.

### 3. Documentation
*   **API Docs:** Update `README.md` or `docs/` if API endpoints change (detected via simple file diffs).

## 🟡 Semi-Autonomous (Requires Confirmation)
The agent can **propose** these actions via Telegram (User must click "Approve"):

*   **New Clusters:** "Load is high. Should I provision a new worker node on `192.168.x.x`?"
*   **Refactoring:** "Function `ProcessQueue` is too complex (CC > 15). Shall I split it?"
*   **Config Changes:** "Rate limit hit frequently. Increase limit from 100 to 200?"

## 🔴 Forbidden (Human Intervention Required)
The agent must **NEVER** attempt:

*   **Database Migrations:** Modifying schema (ALTER/DROP tables).
*   **Smart Contracts:** Deploying or interacting with contracts (except read-only).
*   **Payment Logic:** Changing reward calculations or escrow release conditions.
*   **Dependency Updates:** Upgrading `go.mod` dependencies (risk of breaking changes).

## 🔄 Interaction Loop (n8n Workflow)
1.  **Monitor:** n8n polls API/Logs every minute.
2.  **Analyze:** If issue found -> Send context to Ollama.
3.  **Decide:** Ollama classifies as Green/Yellow/Red.
4.  **Act:**
    *   Green -> Execute fix via shell/git.
    *   Yellow -> Send Telegram Poll.
    *   Red -> Alert Admin immediately.
