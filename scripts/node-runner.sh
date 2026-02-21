#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# GSTD Node — Universal Installer & Runner
# Works on: Linux (x86_64, ARM64), macOS, WSL
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

GSTD_VERSION="1.0.0"
GSTD_DIR="${GSTD_DIR:-$HOME/.gstd}"
GSTD_API="${GSTD_API:-https://api.gstdtoken.com}"
NODE_TYPE="auto"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

banner() {
    echo -e "${CYAN}"
    echo "  ╔═══════════════════════════════════════════════╗"
    echo "  ║   🔱 GSTD Global Super Computer Node v${GSTD_VERSION}   ║"
    echo "  ╚═══════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log() { echo -e "${GREEN}[GSTD]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERR]${NC} $1"; exit 1; }

# ─── System Detection ─────────────────────────────────────────
detect_system() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case "$ARCH" in
        x86_64|amd64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        armv7*|armhf)  ARCH="armv7" ;;
        *)             err "Unsupported architecture: $ARCH" ;;
    esac

    case "$OS" in
        linux)   OS="linux" ;;
        darwin)  OS="darwin" ;;
        *)       err "Unsupported OS: $OS (use WSL on Windows)" ;;
    esac

    # Detect capabilities
    CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024)}' || echo 4194304)
    TOTAL_MEM_GB=$((TOTAL_MEM_KB / 1048576))
    HAS_GPU="false"
    GPU_MEM_GB=0

    if command -v nvidia-smi &>/dev/null; then
        HAS_GPU="true"
        GPU_MEM_GB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | awk '{print int($1/1024)}' || echo 0)
    fi

    log "System: ${OS}/${ARCH}, ${CPU_CORES} cores, ${TOTAL_MEM_GB}GB RAM, GPU=${HAS_GPU} (${GPU_MEM_GB}GB VRAM)"
}

# ─── Determine Node Type ──────────────────────────────────────
determine_node_type() {
    if [ "$HAS_GPU" = "true" ] && [ "$GPU_MEM_GB" -ge 24 ]; then
        NODE_TYPE="gpu"
        log "Mode: 🚀 GPU Worker (${GPU_MEM_GB}GB VRAM) — High-priority inference"
    elif [ "$HAS_GPU" = "true" ]; then
        NODE_TYPE="gpu-light"
        log "Mode: ⚡ GPU Worker Light (${GPU_MEM_GB}GB VRAM)"
    elif [ "$CPU_CORES" -ge 8 ] && [ "$TOTAL_MEM_GB" -ge 16 ]; then
        NODE_TYPE="edge"
        log "Mode: 💻 Edge Node (${CPU_CORES} cores, ${TOTAL_MEM_GB}GB)"
    elif [ "$CPU_CORES" -ge 4 ]; then
        NODE_TYPE="micro"
        log "Mode: 📱 Micro Node (lightweight tasks)"
    else
        NODE_TYPE="relay"
        log "Mode: 📡 Relay Node (message passing only)"
    fi
}

# ─── Prerequisites ─────────────────────────────────────────────
check_prereqs() {
    if ! command -v docker &>/dev/null; then
        warn "Docker not found. Installing..."
        if [ "$OS" = "linux" ]; then
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker "$USER" 2>/dev/null || true
        else
            err "Install Docker Desktop from https://docker.com"
        fi
    fi

    if ! command -v docker compose &>/dev/null && ! command -v docker-compose &>/dev/null; then
        warn "Docker Compose not found. It should be included with Docker."
    fi

    log "✅ Prerequisites OK"
}

# ─── Setup Node Directory ─────────────────────────────────────
setup_node() {
    mkdir -p "$GSTD_DIR"

    # Generate node ID if not exists
    if [ ! -f "$GSTD_DIR/node_id" ]; then
        NODE_ID="${NODE_TYPE}-$(cat /proc/sys/kernel/random/uuid 2>/dev/null | cut -d'-' -f1 || head -c 8 /dev/urandom | xxd -p)"
        echo "$NODE_ID" > "$GSTD_DIR/node_id"
        log "Generated node ID: $NODE_ID"
    else
        NODE_ID=$(cat "$GSTD_DIR/node_id")
        log "Existing node ID: $NODE_ID"
    fi

    # Create .env for node
    if [ ! -f "$GSTD_DIR/.env" ]; then
        cat > "$GSTD_DIR/.env" << EOF
# GSTD Node Configuration
GSTD_NODE_ID=${NODE_ID}
GSTD_NODE_TYPE=${NODE_TYPE}
GSTD_API_URL=${GSTD_API}
GSTD_WALLET_ADDRESS=
# Set your TON wallet to receive GSTD rewards:
# GSTD_WALLET_ADDRESS=EQYour_TON_Wallet_Address_Here
OLLAMA_URL=http://localhost:11434
EOF
        log "Created $GSTD_DIR/.env — edit to set your wallet address"
    fi
}

# ─── Docker Compose for Node ──────────────────────────────────
generate_compose() {
    cat > "$GSTD_DIR/docker-compose.yml" << 'COMPOSE'
# GSTD Node — Auto-generated. Do not edit manually.
services:
  gstd-node:
    image: ghcr.io/gstdcoin/gstd-node:latest
    container_name: gstd_node
    restart: unless-stopped
    env_file: .env
    environment:
      - REDIS_HOST=gstd-redis
      - REDIS_PORT=6379
    ports:
      - "127.0.0.1:8090:8080"
    volumes:
      - node_data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      gstd-redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - gstd

  gstd-redis:
    image: redis:7-alpine
    container_name: gstd_redis_node
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - gstd

volumes:
  node_data:
  redis_data:

networks:
  gstd:
    driver: bridge
COMPOSE

    # Add Ollama service if GPU detected
    if [ "$HAS_GPU" = "true" ]; then
        cat >> "$GSTD_DIR/docker-compose.yml" << 'GPU_COMPOSE'

  gstd-ollama:
    image: ollama/ollama:latest
    container_name: gstd_ollama
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "127.0.0.1:11434:11434"
    networks:
      - gstd

volumes:
  ollama_data:
GPU_COMPOSE
        log "GPU detected — Ollama service added"
    fi
}

# ─── Start Node ────────────────────────────────────────────────
start_node() {
    cd "$GSTD_DIR"

    log "Starting GSTD node..."
    docker compose up -d 2>/dev/null || docker-compose up -d

    echo ""
    log "═══════════════════════════════════════════════"
    log "🔱 GSTD Node is RUNNING"
    log "   ID:   $NODE_ID"
    log "   Type: $NODE_TYPE"
    log "   Dir:  $GSTD_DIR"
    log "   API:  http://127.0.0.1:8090"
    log ""
    log "   💰 Set your wallet to earn GSTD:"
    log "   Edit $GSTD_DIR/.env → GSTD_WALLET_ADDRESS=..."
    log "═══════════════════════════════════════════════"
}

# ─── Stop Node ─────────────────────────────────────────────────
stop_node() {
    cd "$GSTD_DIR" 2>/dev/null || err "Node not installed"
    docker compose down 2>/dev/null || docker-compose down
    log "Node stopped"
}

# ─── Status ────────────────────────────────────────────────────
status_node() {
    cd "$GSTD_DIR" 2>/dev/null || err "Node not installed"
    docker compose ps 2>/dev/null || docker-compose ps
}

# ─── Main ──────────────────────────────────────────────────────
main() {
    banner

    case "${1:-start}" in
        start|run)
            detect_system
            determine_node_type
            check_prereqs
            setup_node
            generate_compose
            start_node
            ;;
        stop)
            stop_node
            ;;
        status)
            status_node
            ;;
        restart)
            stop_node
            sleep 2
            detect_system
            determine_node_type
            setup_node
            generate_compose
            start_node
            ;;
        uninstall)
            stop_node
            rm -rf "$GSTD_DIR"
            log "Node uninstalled"
            ;;
        *)
            echo "Usage: $0 {start|stop|status|restart|uninstall}"
            exit 1
            ;;
    esac
}

main "$@"
