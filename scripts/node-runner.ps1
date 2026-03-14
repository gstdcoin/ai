# ═══════════════════════════════════════════════════════════════
# GSTD Node — Windows Installer & Runner (PowerShell)
# Requires: Docker Desktop for Windows
# ═══════════════════════════════════════════════════════════════

param(
    [Parameter(Position=0)]
    [ValidateSet('start','stop','status','restart','uninstall')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$GSTDVersion = "3.2.0"
$GSTDDir = Join-Path $env:USERPROFILE ".gstd"
$GSTDAPI = if ($env:GSTD_API) { $env:GSTD_API } else { "https://app.gstdtoken.com" }

function Write-Banner {
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║   🔱 GSTD Global Super Computer Node v$GSTDVersion   ║" -ForegroundColor Cyan
    Write-Host "  ╚═══════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Log   { param($msg) Write-Host "[GSTD] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERR]  $msg" -ForegroundColor Red; exit 1 }

# ─── System Detection ─────────────────────────────────────────
function Get-SystemInfo {
    $cpu = (Get-CimInstance Win32_Processor).NumberOfLogicalProcessors
    $memGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    $hasGPU = $false
    $gpuMemGB = 0

    try {
        $gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' }
        if ($gpu) {
            $hasGPU = $true
            $gpuMemGB = [math]::Round($gpu.AdapterRAM / 1GB)
            if ($gpuMemGB -eq 0) { $gpuMemGB = 8 }  # Fallback
        }
    } catch {}

    Write-Log "System: Windows/amd64, $cpu cores, ${memGB}GB RAM, GPU=$hasGPU (${gpuMemGB}GB VRAM)"

    return @{
        CPU = $cpu
        MemGB = $memGB
        HasGPU = $hasGPU
        GPUMemGB = $gpuMemGB
    }
}

function Get-NodeType {
    param($sys)

    if ($sys.HasGPU -and $sys.GPUMemGB -ge 24) {
        Write-Log "Mode: 🚀 GPU Worker ($($sys.GPUMemGB)GB VRAM)"
        return "gpu"
    }
    elseif ($sys.HasGPU) {
        Write-Log "Mode: ⚡ GPU Worker Light ($($sys.GPUMemGB)GB VRAM)"
        return "gpu-light"
    }
    elseif ($sys.CPU -ge 8 -and $sys.MemGB -ge 16) {
        Write-Log "Mode: 💻 Edge Node ($($sys.CPU) cores, $($sys.MemGB)GB)"
        return "edge"
    }
    elseif ($sys.CPU -ge 4) {
        Write-Log "Mode: 📱 Micro Node (lightweight tasks)"
        return "micro"
    }
    else {
        Write-Log "Mode: 📡 Relay Node"
        return "relay"
    }
}

# ─── Prerequisites ─────────────────────────────────────────────
function Test-Prerequisites {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    }
    try {
        docker info | Out-Null
        Write-Log "✅ Docker Desktop is running"
    } catch {
        Write-Err "Docker Desktop is not running. Start it first."
    }
}

# ─── Setup ─────────────────────────────────────────────────────
function Initialize-Node {
    param($nodeType)

    if (-not (Test-Path $GSTDDir)) {
        New-Item -ItemType Directory -Path $GSTDDir -Force | Out-Null
    }

    $nodeIdFile = Join-Path $GSTDDir "node_id"
    if (Test-Path $nodeIdFile) {
        $nodeID = Get-Content $nodeIdFile
        Write-Log "Existing node ID: $nodeID"
    } else {
        $nodeID = "$nodeType-$((New-Guid).ToString().Substring(0,8))"
        $nodeID | Out-File -FilePath $nodeIdFile -NoNewline
        Write-Log "Generated node ID: $nodeID"
    }

    $envFile = Join-Path $GSTDDir ".env"
    if (-not (Test-Path $envFile)) {
        @"
# GSTD Node Configuration (Windows)
GSTD_NODE_ID=$nodeID
GSTD_NODE_TYPE=$nodeType
GSTD_API_URL=$GSTDAPI
GSTD_WALLET_ADDRESS=
# Set your TON wallet to receive GSTD rewards:
# GSTD_WALLET_ADDRESS=EQYour_TON_Wallet_Address_Here
OLLAMA_URL=http://localhost:11434
"@ | Out-File -FilePath $envFile -Encoding utf8
        Write-Log "Created $envFile — edit to set your wallet address"
    }

    return $nodeID
}

function New-ComposeFile {
    param($hasGPU)

    $compose = @"
# GSTD Node — Auto-generated for Windows
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
"@

    if ($hasGPU) {
        $compose += @"

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
"@
        Write-Log "GPU detected — Ollama service added"
    }

    $composeFile = Join-Path $GSTDDir "docker-compose.yml"
    $compose | Out-File -FilePath $composeFile -Encoding utf8
}

# ─── Actions ──────────────────────────────────────────────────
function Start-GSTDNode {
    Write-Banner
    $sys = Get-SystemInfo
    $nodeType = Get-NodeType $sys
    Test-Prerequisites
    $nodeID = Initialize-Node $nodeType
    New-ComposeFile $sys.HasGPU

    Set-Location $GSTDDir
    docker compose up -d

    Write-Host ""
    Write-Log "═══════════════════════════════════════════════"
    Write-Log "🔱 GSTD Node is RUNNING"
    Write-Log "   ID:   $nodeID"
    Write-Log "   Type: $nodeType"
    Write-Log "   Dir:  $GSTDDir"
    Write-Log "   API:  http://127.0.0.1:8090"
    Write-Log ""
    Write-Log "   💰 Set your wallet to earn GSTD:"
    Write-Log "   Edit $GSTDDir\.env → GSTD_WALLET_ADDRESS=..."
    Write-Log "═══════════════════════════════════════════════"
}

function Stop-GSTDNode {
    if (-not (Test-Path $GSTDDir)) { Write-Err "Node not installed" }
    Set-Location $GSTDDir
    docker compose down
    Write-Log "Node stopped"
}

function Get-GSTDStatus {
    if (-not (Test-Path $GSTDDir)) { Write-Err "Node not installed" }
    Set-Location $GSTDDir
    docker compose ps
}

# ─── Main ──────────────────────────────────────────────────────
switch ($Action) {
    'start'     { Start-GSTDNode }
    'stop'      { Stop-GSTDNode }
    'status'    { Get-GSTDStatus }
    'restart'   { Stop-GSTDNode; Start-Sleep -Seconds 2; Start-GSTDNode }
    'uninstall' { Stop-GSTDNode; Remove-Item -Recurse -Force $GSTDDir; Write-Log "Node uninstalled" }
}
