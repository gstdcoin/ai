#!/bin/bash
# GSTD Cluster Growth Script
# Automates the provisioning of a new worker node from a fresh VPS
# Usage: ./grow_cluster.sh <NEW_VPS_IP> <SSH_USER> <SSH_KEY_PATH>

set -e

NEW_VPS_IP=$1
SSH_USER=${2:-root}
SSH_KEY=${3:-~/.ssh/id_rsa}

if [ -z "$NEW_VPS_IP" ]; then
  echo "Usage: ./grow_cluster.sh <NEW_VPS_IP> [SSH_USER] [SSH_KEY_PATH]"
  exit 1
fi

echo "🚀 Starting provisioning sequence for $NEW_VPS_IP..."

# 1. Update and Install Docker
echo "📦 Installing Docker on remote host..."
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$NEW_VPS_IP << 'EOF'
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
EOF

# 2. Deploy Worker Container
# Assuming we have a dedicated worker image or use the backend image in worker mode
echo "⚙️  Deploying GSTD Worker..."
ssh -i $SSH_KEY $SSH_USER@$NEW_VPS_IP << 'EOF'
  docker run -d \
    --name gstd_worker \
    --restart unless-stopped \
    -e ROLE=worker \
    -e API_URL=https://app.gstdtoken.com/api/v1 \
    -e WORKER_NAME="vps-$(hostname)" \
    gstdcoin/gstd-backend:latest
EOF

# 3. Verify Deployment
echo "✅ Checking worker status..."
ssh -i $SSH_KEY $SSH_USER@$NEW_VPS_IP "docker ps | grep gstd_worker"

if [ $? -eq 0 ]; then
  echo "🎉 New node $NEW_VPS_IP successfully added to the cluster!"
else
  echo "❌ Failed to verify worker container on $NEW_VPS_IP"
  exit 1
fi
