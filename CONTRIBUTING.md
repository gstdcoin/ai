# Contributing to GSTD

## 🔱 Quick Start

```bash
git clone https://github.com/gstdcoin/ai.git && cd ai
cp .env.example .env
# Edit .env with your settings

# Backend
cd backend && go test ./... -race && cd ..

# Frontend
cd frontend && npm install --legacy-peer-deps && npm run dev && cd ..

# Full stack (Docker)
docker compose -f docker-compose.dev.yml up -d
```

## Structure

| Directory | Language | Purpose |
|-----------|----------|---------|
| `backend/` | Go 1.24 | API server, A2A protocol, inference routing |
| `frontend/` | Next.js 16 + TypeScript | Web dashboard & Telegram Web App |
| `contracts/` | Tact (TON) | Smart contracts (token, settlement, governance) |
| `scripts/` | Bash/PowerShell | Node runner scripts |

## Running a Node

### Linux / macOS / WSL
```bash
curl -fsSL https://raw.githubusercontent.com/gstdcoin/ai/main/scripts/node-runner.sh | bash
```

### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/gstdcoin/ai/main/scripts/node-runner.ps1 | iex
```

### Vercel (Frontend only)
```bash
cd frontend
npx vercel
```

## Checks Before PR

```bash
cd backend
go vet ./...        # No warnings
go test ./... -race # All pass
go build ./...      # Zero errors
```

## Code Style

- **Go**: `gofmt`, no exported functions without doc comments
- **TypeScript**: ESLint + Prettier
- **Tact**: Follow existing contract patterns
- **Commits**: `feat:`, `fix:`, `docs:`, `test:`, `ci:` prefixes

## License

MIT
