# GSTD Project Structure

## 📂 Root Directory
| Path | Description |
|------|-------------|
| `/backend` | Go (Gin) API Server, Workers, Database Logic |
| `/frontend` | Next.js Web App, Mobile Worker Logic, PWA |
| `/autonomy` | The "Brain" of the platform. AI Bots, Scripts, Automation |
| `/contracts` | Smart Contracts (TON/Tact) for Payouts |
| `/nginx` | Load Balancer Configurations |
| `/docs` | Technical Documentation & Specifications |
| `/scripts` | Deployment & Maintenance Utilities |

## 🏗 Backend (`/backend`)
Core logic of the Distributed Compute Network.
- `cmd/`: Entry points for services.
- `internal/api/`: REST & WebSocket Handlers.
- `internal/services/`: Business Logic (Mining, Payouts, AI Dispatch).
- `internal/models/`: Database Structs.
- `migrations/`: PostgreSQL Schema definitions.

## 🖥 Frontend (`/frontend`)
User Interface and Edge Computing Logic.
- `src/components/`: React UI Components (Glassmorphism).
- `public/mobile_worker.js`: **Core Mining Logic** (Web Worker).
- `src/services/WorkerService.ts`: Bridge between UI and Worker.
- `src/pages/`: Next.js Routes.

## 🧠 Autonomy (`/autonomy`)
Infrastructure Purification & AI Management.
- `bot/`: The Telegram OS Bot source code (Go).
- `scripts/autonomous_maintenance.sh`: Self-healing script.
- `workflows/`: Automated tasks for the AI Agent.

## 📜 Configuration Files
- `docker-compose.prod.yml`: Production Stack Definition.
- `.env`: Global Environment Variables.
