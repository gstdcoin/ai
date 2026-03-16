#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# GSTD Node — Universal Installer & Runner v2.0
# One command to install, run, and manage your GSTD compute node.
#
# Usage:
#   curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash
#   or
#   bash node-runner.sh start
#
# Works on: Linux (x86_64, ARM64), macOS, WSL
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

GSTD_VERSION="4.0.0-DeFi"
GSTD_DIR="${GSTD_DIR:-$HOME/.gstd}"
GSTD_API="${GSTD_API:-https://app.gstdtoken.com}"
NODE_TYPE="auto"
LOG_FILE="${GSTD_DIR}/node.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

banner() {
    echo -e "${CYAN}"
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║   🔱  GSTD Global Super Computer Node  v${GSTD_VERSION}          ║"
    echo "  ║      Decentralized AI · Earn GSTD · Sovereign Cloud     ║"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log()  { echo -e "${GREEN}[GSTD]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

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
    CPU_MODEL=$(grep "model name" /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Unknown")
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024)}' || echo 4194304)
    TOTAL_MEM_GB=$((TOTAL_MEM_KB / 1048576))
    FREE_DISK_GB=$(df -BG "$HOME" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G' || echo 10)
    HAS_GPU="false"
    GPU_NAME="none"
    GPU_MEM_GB=0

    if command -v nvidia-smi &>/dev/null; then
        HAS_GPU="true"
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU")
        GPU_MEM_GB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | awk '{print int($1/1024)}' || echo 0)
    fi

    echo ""
    info "System Detection:"
    echo -e "  ${DIM}OS:${NC}     ${BOLD}${OS}/${ARCH}${NC}"
    echo -e "  ${DIM}CPU:${NC}    ${BOLD}${CPU_CORES} cores${NC} — ${CPU_MODEL}"
    echo -e "  ${DIM}RAM:${NC}    ${BOLD}${TOTAL_MEM_GB} GB${NC}"
    echo -e "  ${DIM}Disk:${NC}   ${BOLD}${FREE_DISK_GB} GB${NC} free"
    if [ "$HAS_GPU" = "true" ]; then
        echo -e "  ${DIM}GPU:${NC}    ${BOLD}${GPU_NAME}${NC} (${GPU_MEM_GB} GB VRAM)"
    else
        echo -e "  ${DIM}GPU:${NC}    Not detected (CPU mode)"
    fi
    echo ""
}

# ─── Determine Node Type ──────────────────────────────────────
determine_node_type() {
    if [ "$HAS_GPU" = "true" ] && [ "$GPU_MEM_GB" -ge 24 ]; then
        NODE_TYPE="gpu"
        log "Node type: ${BOLD}🚀 GPU Worker${NC} (${GPU_MEM_GB}GB VRAM) — High-priority inference & training"
        EXPECTED_EARNINGS="50-200"
    elif [ "$HAS_GPU" = "true" ]; then
        NODE_TYPE="gpu-light"
        log "Node type: ${BOLD}⚡ GPU Light${NC} (${GPU_MEM_GB}GB VRAM) — Inference only"
        EXPECTED_EARNINGS="20-80"
    elif [ "$CPU_CORES" -ge 8 ] && [ "$TOTAL_MEM_GB" -ge 16 ]; then
        NODE_TYPE="edge"
        log "Node type: ${BOLD}💻 Edge Node${NC} (${CPU_CORES} cores, ${TOTAL_MEM_GB}GB) — Full compute"
        EXPECTED_EARNINGS="10-40"
    elif [ "$CPU_CORES" -ge 4 ]; then
        NODE_TYPE="micro"
        log "Node type: ${BOLD}📱 Micro Node${NC} — Lightweight tasks & relay"
        EXPECTED_EARNINGS="5-15"
    else
        NODE_TYPE="relay"
        log "Node type: ${BOLD}📡 Relay Node${NC} — Message passing & bandwidth sharing"
        EXPECTED_EARNINGS="2-8"
    fi
}

# ─── Prerequisites ─────────────────────────────────────────────
check_prereqs() {
    log "Checking prerequisites..."
    
    local MISSING=()
    
    # Docker
    if ! command -v docker &>/dev/null; then
        MISSING+=("docker")
        warn "Docker not found."
        if [ "$OS" = "linux" ]; then
            info "Installing Docker..."
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker "$USER" 2>/dev/null || true
            log "✅ Docker installed. You may need to re-login for group changes."
        else
            echo ""
            echo -e "  ${YELLOW}Please install Docker Desktop:${NC}"
            echo -e "  ${CYAN}https://www.docker.com/products/docker-desktop${NC}"
            echo ""
            err "Docker is required. Install it and re-run this script."
        fi
    fi

    # Docker Compose
    if ! docker compose version &>/dev/null 2>&1 && ! command -v docker-compose &>/dev/null; then
        warn "Docker Compose not found. It should be included with Docker Desktop."
    fi

    # curl
    if ! command -v curl &>/dev/null; then
        warn "curl not found. Installing..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update -qq && sudo apt-get install -y -qq curl
        elif command -v yum &>/dev/null; then
            sudo yum install -y curl
        fi
    fi
    
    log "✅ All prerequisites OK"
}

# ─── Setup Node Directory ─────────────────────────────────────
setup_node() {
    mkdir -p "$GSTD_DIR/data" "$GSTD_DIR/logs"

    # Generate node ID if not exists
    if [ ! -f "$GSTD_DIR/node_id" ]; then
        NODE_ID="${NODE_TYPE}-$(cat /proc/sys/kernel/random/uuid 2>/dev/null | cut -d'-' -f1 || head -c 8 /dev/urandom | xxd -p)"
        echo "$NODE_ID" > "$GSTD_DIR/node_id"
        log "Generated node ID: ${BOLD}$NODE_ID${NC}"
    else
        NODE_ID=$(cat "$GSTD_DIR/node_id")
        log "Existing node ID: ${BOLD}$NODE_ID${NC}"
    fi

    # Create .env for node
    if [ ! -f "$GSTD_DIR/.env" ]; then
        cat > "$GSTD_DIR/.env" << EOF
# ═══════════════════════════════════════════════════════════
# GSTD Node Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ═══════════════════════════════════════════════════════════

# Node Identity
GSTD_NODE_ID=${NODE_ID}
GSTD_NODE_TYPE=${NODE_TYPE}
GSTD_API_URL=${GSTD_API}

# ─── REQUIRED: Set your TON wallet to receive GSTD rewards ───
# Get a wallet: https://tonkeeper.com or https://tonhub.com
GSTD_WALLET_ADDRESS=

# Node Settings
GSTD_MAX_CONCURRENT_TASKS=4
GSTD_HEARTBEAT_INTERVAL=30
GSTD_LOG_LEVEL=info

# Sovereign Liquidity Vaults (DeFi Base Routing Asset)
# To act as a Liquidity Node, set ENABLED=true and define the asset and initial stake
GSTD_DLN_ENABLED=false
GSTD_DLN_ASSET=GSTD
GSTD_DLN_INITIAL_STAKE=0
GSTD_DLN_MANAGEMENT_FEE=0.15

# Ollama AI (auto-configured for GPU nodes)
OLLAMA_URL=http://gstd-ollama:11434
EOF
        info "Created $GSTD_DIR/.env"
    fi
}

# ─── Docker Compose for Node ──────────────────────────────────
generate_compose() {
    cat > "$GSTD_DIR/docker-compose.yml" << 'COMPOSE'
# ═══════════════════════════════════════════════════════════
# GSTD Compute Node — Docker Compose
# Auto-generated. Manage with: gstd-node {start|stop|status}
# ═══════════════════════════════════════════════════════════

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
      - ./logs:/app/logs
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
    deploy:
      resources:
        limits:
          memory: 2G

  gstd-redis:
    image: redis:7-alpine
    container_name: gstd_redis_node
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
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
        # Need to patch the compose file to add ollama
        cat >> "$GSTD_DIR/docker-compose.yml" << 'GPU_COMPOSE'

  # GPU-accelerated AI inference
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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - gstd

volumes:
  ollama_data:
GPU_COMPOSE
        log "🎮 GPU detected — Ollama AI engine added"
    fi
}

# ─── Register Node on Platform ─────────────────────────────────
register_node() {
    local WALLET=$(grep "GSTD_WALLET_ADDRESS=" "$GSTD_DIR/.env" 2>/dev/null | cut -d= -f2)
    
    if [ -z "$WALLET" ] || [ "$WALLET" = "" ]; then
        return  # Skip registration if no wallet set
    fi

    info "Registering node on GSTD platform..."
    curl -s -X POST "${GSTD_API}/api/v1/nodes/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"node_id\": \"${NODE_ID}\",
            \"node_type\": \"${NODE_TYPE}\",
            \"wallet_address\": \"${WALLET}\",
            \"cpu_cores\": ${CPU_CORES},
            \"ram_gb\": ${TOTAL_MEM_GB},
            \"gpu\": \"${GPU_NAME}\",
            \"gpu_vram_gb\": ${GPU_MEM_GB},
            \"os\": \"${OS}\",
            \"arch\": \"${ARCH}\",
            \"version\": \"${GSTD_VERSION}\"
        }" > /dev/null 2>&1 && log "✅ Node registered" || warn "Registration skipped (offline or API busy)"
}

# ─── Start Node ────────────────────────────────────────────────
start_node() {
    cd "$GSTD_DIR"

    log "Starting GSTD node..."
    docker compose up -d 2>/dev/null || docker-compose up -d

    # Register on platform
    register_node

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}   ${GREEN}${BOLD}🔱 GSTD Node is RUNNING${NC}                               ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}   Node ID:   ${BOLD}$NODE_ID${NC}"
    echo -e "${CYAN}║${NC}   Type:      ${BOLD}$NODE_TYPE${NC}"
    echo -e "${CYAN}║${NC}   Version:   ${BOLD}$GSTD_VERSION${NC}"
    echo -e "${CYAN}║${NC}   Earnings:  ${BOLD}~${EXPECTED_EARNINGS} GSTD/day${NC} (estimated)"
    echo -e "${CYAN}║${NC}   Dashboard: ${BOLD}http://127.0.0.1:8090${NC}"
    echo -e "${CYAN}║${NC}   Dir:       ${BOLD}$GSTD_DIR${NC}"
    echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  ${MAGENTA}🏪 NEW: App Store${NC} — Install 15+ apps on your node!     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}     ${BOLD}https://app.gstdtoken.com/appstore${NC}                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${MAGENTA}📊 Node Dashboard${NC} — Live CPU, RAM, GPU monitoring      ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}     ${BOLD}https://app.gstdtoken.com/node${NC}                       ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  ${YELLOW}💰 IMPORTANT: Set your wallet to earn GSTD rewards!${NC}     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  1. Get a TON wallet: ${BOLD}https://tonkeeper.com${NC}              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  2. Edit config:                                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}     ${MAGENTA}nano $GSTD_DIR/.env${NC}"
    echo -e "${CYAN}║${NC}  3. Set: ${MAGENTA}GSTD_WALLET_ADDRESS=EQYour...${NC}                 ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  4. Restart: ${MAGENTA}bash $0 restart${NC}                           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  ${DIM}Commands:${NC}                                               ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    bash $0 ${BOLD}status${NC}     — Check node status               ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    bash $0 ${BOLD}logs${NC}       — View logs                       ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    bash $0 ${BOLD}stop${NC}       — Stop node                       ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    bash $0 ${BOLD}restart${NC}    — Restart node                    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    bash $0 ${BOLD}earnings${NC}   — Check earnings                  ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    bash $0 ${BOLD}uninstall${NC}  — Remove node                     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${DIM}Monitor your node: ${BOLD}https://app.gstdtoken.com/node${NC}    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${DIM}App Store: ${BOLD}https://app.gstdtoken.com/appstore${NC}       ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${DIM}Support: ${BOLD}https://t.me/gstdcommunity${NC}                   ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ─── Stop Node ─────────────────────────────────────────────────
stop_node() {
    cd "$GSTD_DIR" 2>/dev/null || err "Node not installed at $GSTD_DIR"
    docker compose down 2>/dev/null || docker-compose down
    log "✅ Node stopped"
}

# ─── Status ────────────────────────────────────────────────────
status_node() {
    cd "$GSTD_DIR" 2>/dev/null || err "Node not installed at $GSTD_DIR"
    echo ""
    info "Node Status:"
    echo ""
    docker compose ps 2>/dev/null || docker-compose ps
    echo ""

    # Show wallet info
    local WALLET=$(grep "GSTD_WALLET_ADDRESS=" "$GSTD_DIR/.env" 2>/dev/null | cut -d= -f2)
    if [ -z "$WALLET" ] || [ "$WALLET" = "" ]; then
        warn "⚠️  No wallet set. You're not earning rewards!"
        echo -e "  Edit: ${MAGENTA}nano $GSTD_DIR/.env${NC}"
    else
        info "Wallet: ${BOLD}${WALLET:0:12}...${WALLET: -8}${NC}"
    fi

    # Show node type
    local NODE_ID=$(cat "$GSTD_DIR/node_id" 2>/dev/null || echo "unknown")
    info "Node ID: ${BOLD}$NODE_ID${NC}"
    echo ""
}

# ─── Logs ──────────────────────────────────────────────────────
show_logs() {
    cd "$GSTD_DIR" 2>/dev/null || err "Node not installed at $GSTD_DIR"
    docker compose logs -f --tail 50 2>/dev/null || docker-compose logs -f --tail 50
}

# ─── Earnings ──────────────────────────────────────────────────
show_earnings() {
    local WALLET=$(grep "GSTD_WALLET_ADDRESS=" "$GSTD_DIR/.env" 2>/dev/null | cut -d= -f2)
    if [ -z "$WALLET" ] || [ "$WALLET" = "" ]; then
        err "No wallet configured. Edit $GSTD_DIR/.env first."
    fi

    info "Checking earnings for wallet ${WALLET:0:12}..."
    local RESPONSE=$(curl -s "${GSTD_API}/api/v1/balance/${WALLET}" 2>/dev/null)
    if [ -n "$RESPONSE" ]; then
        echo ""
        echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    else
        warn "Could not reach GSTD API. Is the platform online?"
    fi
    echo ""
    info "Full dashboard: ${BOLD}https://app.gstdtoken.com/dashboard${NC}"
}

# ─── Update ────────────────────────────────────────────────────
update_node() {
    cd "$GSTD_DIR" 2>/dev/null || err "Node not installed"
    log "Pulling latest images..."
    docker compose pull 2>/dev/null || docker-compose pull
    docker compose up -d 2>/dev/null || docker-compose up -d
    log "✅ Node updated to latest version"
}

# ─── Help ──────────────────────────────────────────────────────
show_help() {
    banner
    echo -e "${BOLD}Usage:${NC} bash $0 <command>"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo -e "  ${GREEN}start${NC}       Install and start the GSTD node"
    echo -e "  ${GREEN}stop${NC}        Stop the node"
    echo -e "  ${GREEN}restart${NC}     Restart the node"
    echo -e "  ${GREEN}status${NC}      Show node status"
    echo -e "  ${GREEN}logs${NC}        View live logs"
    echo -e "  ${GREEN}earnings${NC}    Check your GSTD earnings"
    echo -e "  ${GREEN}update${NC}      Update to latest version"
    echo -e "  ${GREEN}uninstall${NC}   Remove the node completely"
    echo -e "  ${GREEN}help${NC}        Show this help"
    echo ""
    echo -e "${BOLD}Quick Start:${NC}"
    echo -e "  ${MAGENTA}curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash${NC}"
    echo ""
    echo -e "${BOLD}After install:${NC}"
    echo -e "  1. Set your TON wallet in ${MAGENTA}~/.gstd/.env${NC}"
    echo -e "  2. Restart: ${MAGENTA}bash $0 restart${NC}"
    echo -e "  3. Monitor: ${MAGENTA}https://app.gstdtoken.com/network${NC}"
    echo ""
    echo -e "${BOLD}Earning GSTD:${NC}"
    echo -e "  Your node automatically receives tasks from the GSTD network"
    echo -e "  and earns GSTD tokens for completing them. The more powerful"
    echo -e "  your hardware, the more you earn:"
    echo ""
    echo -e "  ${DIM}📡 Relay Node${NC}    (any device)       ~2-8 GSTD/day"
    echo -e "  ${DIM}📱 Micro Node${NC}    (4+ cores)         ~5-15 GSTD/day"
    echo -e "  ${DIM}💻 Edge Node${NC}     (8+ cores, 16GB)   ~10-40 GSTD/day"
    echo -e "  ${DIM}⚡ GPU Light${NC}     (GPU < 24GB)       ~20-80 GSTD/day"
    echo -e "  ${DIM}🚀 GPU Worker${NC}    (GPU 24GB+)        ~50-200 GSTD/day"
    echo ""
}

# ─── Main ──────────────────────────────────────────────────────
main() {
    case "${1:-start}" in
        start|run|install)
            banner
            detect_system
            determine_node_type
            check_prereqs
            setup_node
            generate_compose
            start_node
            ;;
        stop)
            banner
            stop_node
            ;;
        status)
            banner
            status_node
            ;;
        restart)
            banner
            stop_node 2>/dev/null || true
            sleep 2
            detect_system
            determine_node_type
            setup_node
            generate_compose
            start_node
            ;;
        logs)
            show_logs
            ;;
        earnings)
            banner
            show_earnings
            ;;
        update)
            banner
            update_node
            ;;
        uninstall)
            banner
            stop_node 2>/dev/null || true
            rm -rf "$GSTD_DIR"
            log "✅ Node uninstalled. All data removed from $GSTD_DIR"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            show_help
            exit 1
            ;;
    esac
}

main "$@"
