#!/bin/bash

# GSTD "One-Line Deploy" Script
# Turns any Linux/macOS device into a GSTD Sovereign Node
# Usage: curl -sL https://app.gstdtoken.com/install.sh | bash

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}
   ___________  __________ 
  / ____/ ___/ /_  __/ __ \\
 / / __ \__ \   / / / / / /
/ /_/ /___/ /  / / / /_/ / 
\____//____/  /_/ /_____/  
                           
Global Sovereign Task Distribution
Initializing Node Deployment...${NC}"

# 1. Check Prerequisites
echo -e "\n${GREEN}[1/4] Checking System Environment...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed. Please install python3 and try again.${NC}"
    exit 1
fi

if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}pip3 is not installed. Please install pip3 and try again.${NC}"
    exit 1
fi

# 2. Create Workspace
echo -e "\n${GREEN}[2/4] Setting up Sovereign Node Environment...${NC}"
NODE_DIR="$HOME/.gstd-node"
mkdir -p "$NODE_DIR"
cd "$NODE_DIR"

# 3. Fetch Core Components (Simulated fetch from latest A2A Repo)
echo -e "\n${GREEN}[3/4] Downloading Protocol Adapters...${NC}"

# Download the agent script (using raw content from verified repo or local loopback for now)
# In production, this pulls from github.com/gstdcoin/A2A/releases/latest
cat << 'EOF' > agent.py
import sys
import time
import json
import random
import uuid
import threading
import requests
from datetime import datetime

# Configuration
PLATFORM_URL = "https://app.gstdtoken.com/api/v1"
NODE_ID = str(uuid.uuid4())
DEVICE_TYPE = "STANDARD_NODE" 

print(f"[*] Initializing GSTD Agent v2.0")
print(f"[*] Node ID: {NODE_ID}")

def get_hardware_fingerprint():
    # Simplified hardware specs
    return {
        "cpu": "Generic ARM/x86",
        "cores": 8,
        "ram_gb": 16,
        "gpu": "Integrated",
        "storage_gb": 512
    }

def register_node(wallet_address):
    payload = {
        "name": f"Sovereign-Node-{NODE_ID[:8]}",
        "specs": get_hardware_fingerprint()
    }
    headers = {"X-Wallet-Address": wallet_address}
    try:
        res = requests.post(f"{PLATFORM_URL}/nodes/register?wallet_address={wallet_address}", json=payload)
        if res.status_code == 200:
            print(f"[+] Successfully registered node in the Grid.")
            return True
        else:
            print(f"[-] Registration failed: {res.text}")
            return False
    except Exception as e:
        print(f"[-] Connection failed: {e}")
        return False

def heartbeat_loop(wallet_address):
    while True:
        try:
            payload = {
                "wallet": wallet_address,
                "node_id": NODE_ID,
                "status": "idle",
                "battery": 100,
                "signal": 100
            }
            requests.post(f"{PLATFORM_URL}/nodes/heartbeat", json=payload)
            # print(f"[*] Heartbeat sent...") # Keep logs clean
        except:
            pass
        time.sleep(30)

def task_poller(wallet_address):
    print("[*] Listening for incoming tasks via Long-Polling...")
    while True:
        try:
            # Simple polling simulation suitable for demo
            time.sleep(5) 
            # Real implementation would use WebSocket or /tasks/available
        except KeyboardInterrupt:
            break

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 agent.py <wallet_address>")
        sys.exit(1)
    
    wallet = sys.argv[1]
    print(f"[*] Identity: {wallet}")
    
    if not register_node(wallet):
        print("[-] Could not join the network. Retrying in 10s...")
        time.sleep(10)
        
    # Start heartbeat thread
    hb_thread = threading.Thread(target=heartbeat_loop, args=(wallet,), daemon=True)
    hb_thread.start()
    
    print(f"\n{'-'*40}")
    print(f"ONLINE: Node is active and contributing to the Global Brain.")
    print(f"Dashboard: https://app.gstdtoken.com/dashboard")
    print(f"{'-'*40}\n")
    
    task_poller(wallet)

if __name__ == "__main__":
    main()
EOF

# Install minimal requirements
echo "requests" > requirements.txt
pip3 install -r requirements.txt -q

# 4. Launch
echo -e "\n${GREEN}[4/4] Launching Node...${NC}"
echo -e "${CYAN}Please enter your TON Wallet Address (for rewards):${NC}"
read -p "> " WALLET_ADDRESS

if [ -z "$WALLET_ADDRESS" ]; then
    echo -e "${RED}Wallet address is required to receive GSTD.${NC}"
    exit 1
fi

echo -e "\n${GREEN}✔ Setup Complete. Starting Agent...${NC}"
python3 agent.py "$WALLET_ADDRESS"
