#!/usr/bin/env bash
# ============================================================================
# GSTD SOVEREIGN LAUNCHER
# One-command setup to join the decentralized AI revolution
#
# Usage: curl -fsSL https://get.gstdtoken.com | bash
#    or: bash sovereign_launcher.sh [--wallet EQ...]
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; PURPLE='\033[0;35m'; NC='\033[0m'; BOLD='\033[1m'

# Config
GSTD_API="https://api.gstdtoken.com"
GSTD_APP="https://app.gstdtoken.com"
GSTD_VERSION="2.0.0"
OLLAMA_MODELS=("qwen2.5-coder:7b" "llama3.1:8b")

banner() {
  echo -e "${PURPLE}"
  echo "  ╔═══════════════════════════════════════════╗"
  echo "  ║      GSTD SOVEREIGN AI PLATFORM           ║"
  echo "  ║      Decentralized • Gold-Backed • Free    ║"
  echo "  ║      v${GSTD_VERSION}                              ║"
  echo "  ╚═══════════════════════════════════════════╝"
  echo -e "${NC}"
}

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}[$1/5]${NC} ${BOLD}$2${NC}"; }

# ============================================================================
# STEP 1: Detect OS/Architecture
# ============================================================================
detect_system() {
  step 1 "Detecting system..."
  
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  
  case "$OS" in
    linux*)  OS_NAME="Linux" ;;
    darwin*) OS_NAME="macOS" ;;
    mingw*|msys*|cygwin*) OS_NAME="Windows (WSL recommended)"; OS="windows" ;;
    *) err "Unsupported OS: $OS"; exit 1 ;;
  esac
  
  case "$ARCH" in
    x86_64|amd64) ARCH_NAME="x86_64" ;;
    aarch64|arm64) ARCH_NAME="ARM64" ;;
    *) warn "Architecture $ARCH may have limited support" ; ARCH_NAME="$ARCH" ;;
  esac

  # Detect GPU
  GPU="none"
  if command -v nvidia-smi &>/dev/null; then
    GPU="nvidia"
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU")
    GPU_VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
    log "GPU: ${GPU_NAME} (${GPU_VRAM}MB VRAM)"
  elif [ -d "/sys/class/drm" ] && ls /sys/class/drm/card*/device/vendor 2>/dev/null | head -1 | xargs cat 2>/dev/null | grep -q "0x1002"; then
    GPU="amd"
    log "GPU: AMD (ROCm support available)"
  elif [ "$OS" = "darwin" ] && sysctl -n machdep.cpu.brand_string 2>/dev/null | grep -qi "apple"; then
    GPU="apple"
    log "GPU: Apple Silicon (Metal acceleration)"
  fi
  
  log "System: ${OS_NAME} ${ARCH_NAME} | GPU: ${GPU}"
}

# ============================================================================
# STEP 2: Install Dependencies
# ============================================================================
install_deps() {
  step 2 "Installing dependencies..."
  
  # Docker
  if ! command -v docker &>/dev/null; then
    warn "Docker not found. Installing..."
    if [ "$OS" = "linux" ]; then
      curl -fsSL https://get.docker.com | sh
      sudo usermod -aG docker "$USER" 2>/dev/null || true
    elif [ "$OS" = "darwin" ]; then
      warn "Please install Docker Desktop from https://docker.com/products/docker-desktop"
    fi
  else
    log "Docker: $(docker --version | head -c 30)"
  fi
  
  # Ollama (Sovereign AI Engine)
  if ! command -v ollama &>/dev/null; then
    warn "Ollama not found. Installing..."
    curl -fsSL https://ollama.com/install.sh | sh
    log "Ollama installed"
  else
    log "Ollama: $(ollama --version 2>/dev/null || echo 'installed')"
  fi
  
  # Pull models
  log "Pulling AI models (this may take a few minutes)..."
  for model in "${OLLAMA_MODELS[@]}"; do
    if ollama list 2>/dev/null | grep -q "$model"; then
      log "Model $model: already available"
    else
      warn "Pulling $model..."
      ollama pull "$model" || warn "Failed to pull $model (will retry later)"
    fi
  done
}

# ============================================================================
# STEP 3: Configure Wallet
# ============================================================================
configure_wallet() {
  step 3 "Configuring wallet..."
  
  WALLET="${WALLET:-}"
  
  # Check CLI argument
  while [[ $# -gt 0 ]]; do
    case $1 in
      --wallet) WALLET="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  
  if [ -z "$WALLET" ]; then
    echo -e "\n${BOLD}Enter your TON wallet address (EQ... or UQ...):${NC}"
    read -r WALLET
  fi
  
  if [[ ! "$WALLET" =~ ^(EQ|UQ|0:) ]]; then
    err "Invalid TON wallet address. Must start with EQ, UQ, or 0:"
    exit 1
  fi
  
  log "Wallet configured: ${WALLET:0:8}...${WALLET: -4}"
  
  # Save config
  mkdir -p "$HOME/.gstd"
  cat > "$HOME/.gstd/config.json" << EOF
{
  "wallet_address": "$WALLET",
  "api_url": "$GSTD_API",
  "app_url": "$GSTD_APP",
  "gpu": "$GPU",
  "os": "$OS_NAME",
  "arch": "$ARCH_NAME",
  "version": "$GSTD_VERSION",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  log "Config saved to ~/.gstd/config.json"
}

# ============================================================================
# STEP 4: Register as Worker Node
# ============================================================================
register_node() {
  step 4 "Registering as Worker node..."
  
  NODE_ID="node-$(hostname)-$(date +%s | tail -c 6)"
  
  # Register with GSTD network
  REGISTER_RESULT=$(curl -s -X POST "${GSTD_APP}/api/v1/nodes/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"wallet_address\": \"$WALLET\",
      \"name\": \"$NODE_ID\",
      \"device_type\": \"server\",
      \"gpu_model\": \"${GPU_NAME:-$GPU}\",
      \"vram_mb\": ${GPU_VRAM:-0},
      \"os\": \"$OS_NAME\",
      \"arch\": \"$ARCH_NAME\"
    }" 2>/dev/null || echo '{"error":"network"}')
  
  if echo "$REGISTER_RESULT" | grep -q "error"; then
    warn "Node registration will complete when you connect your wallet on the dashboard"
  else
    log "Node registered: $NODE_ID"
  fi
  
  # Register for Pipeline Parallelism (if GPU available)
  if [ "$GPU" != "none" ] && [ "${GPU_VRAM:-0}" -gt 4000 ]; then
    curl -s -X POST "${GSTD_APP}/api/v1/pipeline/register" \
      -H "Content-Type: application/json" \
      -d "{
        \"node_id\": \"$NODE_ID\",
        \"vram_mb\": ${GPU_VRAM:-0},
        \"gpu_model\": \"${GPU_NAME:-unknown}\",
        \"region\": \"auto\"
      }" >/dev/null 2>&1 || true
    log "Pipeline node registered (${GPU_VRAM}MB VRAM available for distributed inference)"
  fi
}

# ============================================================================
# STEP 5: Start Services
# ============================================================================
start_services() {
  step 5 "Starting GSTD services..."
  
  # Ensure Ollama is running
  if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    ollama serve &>/dev/null &
    sleep 3
    log "Ollama started"
  else
    log "Ollama already running"
  fi
  
  # Create systemd service for auto-start (Linux only)
  if [ "$OS" = "linux" ] && command -v systemctl &>/dev/null; then
    sudo tee /etc/systemd/system/gstd-worker.service >/dev/null << EOF
[Unit]
Description=GSTD Sovereign Worker Node
After=network.target ollama.service

[Service]
Type=simple
User=$USER
Environment=GSTD_WALLET=$WALLET
Environment=GSTD_API=$GSTD_API
ExecStart=/usr/bin/ollama serve
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable gstd-worker.service 2>/dev/null || true
    log "Auto-start service configured"
  fi
  
  log "Services started!"
}

# ============================================================================
# MAIN
# ============================================================================
main() {
  banner
  detect_system
  install_deps
  configure_wallet "$@"
  register_node
  start_services
  
  echo ""
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  GSTD SOVEREIGN NODE — ONLINE!           ${NC}"
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${BOLD}Dashboard:${NC}  ${CYAN}${GSTD_APP}${NC}"
  echo -e "  ${BOLD}API:${NC}        ${CYAN}${GSTD_API}/v1${NC}"
  echo -e "  ${BOLD}Wallet:${NC}     ${WALLET:0:12}...${WALLET: -4}"
  echo -e "  ${BOLD}GPU:${NC}        ${GPU_NAME:-$GPU}"
  echo -e "  ${BOLD}Config:${NC}     ~/.gstd/config.json"
  echo ""
  echo -e "  ${YELLOW}Next steps:${NC}"
  echo -e "  1. Open ${CYAN}${GSTD_APP}${NC} and connect your TON wallet"
  echo -e "  2. Your node will appear in the Dashboard"
  echo -e "  3. Earn GSTD by processing AI tasks automatically"
  echo ""
  echo -e "  ${PURPLE}Sovereign AI for humanity. No corporations. No censorship.${NC}"
  echo ""
}

main "$@"
