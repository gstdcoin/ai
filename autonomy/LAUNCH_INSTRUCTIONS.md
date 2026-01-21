# 🚀 GSTD Autonomy Layer: Launch Instructions

Congratulations! You have successfully added the Autonomy Layer to the GSTD Platform.
Follow these steps to activate "God Mode" and managing your platform via Telegram.

## 1. Prerequisites
*   **Telegram Bot Token:** Create a new bot via @BotFather and get the token.
*   **VPS for Autonomy:** You can run this on the current server or a dedicated one.
*   **SSH Access:** Ensure the server has SSH keys generated (`id_rsa`).

## 2. Launch the Autonomy Stack
Navigate to the autonomy directory and start the services (n8n & Ollama):

```bash
cd /home/ubuntu/autonomy
docker-compose -f docker-compose.autonomy.yml up -d
```

*   **n8n Interface:** https://n8n.gstdtoken.com (or `http://YOUR_IP:5678`)
*   **Ollama API:** `http://localhost:11434`

## 3. Activate the Control Bot
Build and run the Telegram control bot:

```bash
cd /home/ubuntu/autonomy/bot
export TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN"
# Option A: Run locally (if Go is installed)
# go mod tidy
# nohup go run main.go > bot.log 2>&1 &

# Option B: Run with Docker (Recommended)
docker run -d --name gstd_bot \
  -v $(pwd):/app -w /app \
  -e TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN" \
  golang:1.24 sh -c "go mod tidy && go run main.go"
```

## 4. How to Use "God Mode"
Open your Telegram bot and use these commands:

*   `/start` - Initialize the dual-mode interface.
    *   **Admin Mode (Your ID):** Shows system status, provisioning tools, and AI architect.
    *   **User Mode (Others):** Shows platform launch link, stats, and support.

**Admin Commands:**
*   `/add_node <IP>` - Provision a new server.
*   `/ask <query>` - Consult AI.

## 5. Configure n8n (One-Time Setup)
1.  Open n8n in your browser.
2.  Import `orchestrator_config.yaml` definitions (or manually create workflows to read this config).
3.  Connect the **Telegram** node with your Bot Token.
4.  Connect the **Ollama** node (Host: `http://ollama:11434`, Model: `qwen2.5-coder:7b`).

## 6. Smart Backlog
The AI instructions are located in `autonomy/SMART_BACKLOG.md`.
Feed this file to your Ollama instance context so it knows its boundaries.

---
**System is now Autonomous.** 
You can now scale the cluster and monitor health directly from your pocket.
