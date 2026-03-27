# GSTD Backend (v1.4.0)

Go-based core server infrastructure powering the GSTD Sovereign AI Network, serving a mix of Swarm/A2A logic, AI Model routing, Tokenomics management, and the Sovereign Protocol features.

## Technologies Used
- **Go 1.21+** (for fast, concurrent infrastructure)
- **Gin Web Framework**
- **gRPC** (for super-low latency inter-node communication)
- **Redis / PostgreSQL** (Hive Memory + Database persistence)
- **Docker**

## Architecture & Features

### The Sovereign Reputations (New in 1.4.0)
- Contains detailed streak multipliers enforcing Node Operations daily.
- Implements revenue splitting: `85% Worker`, `10% Treasury`, `5% Token Burn`.
- Asynchronous database writing to limit load spikes natively in `NodeWalletHandler`. 

### The AI Gateway
- Rate-limited and completely anonymous multi-model proxy.
- Fallback routing for resilience.

## Running Locally

1. Setup environment variables (`.env`) mirroring values needed such as PG connection strings, Redis details, and external LLM keys.

2. Ensure DB schemas have been migrated up.

```bash
go mod tidy
go run main.go
```

**Testing**: Run `go test ./...` in the backend folder to verify internal functions cleanly.
