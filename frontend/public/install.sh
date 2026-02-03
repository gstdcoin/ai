#!/bin/bash
set -e

# GSTD Compute Node Installer
# This script installs the necessary components to turn your machine into a GSTD Compute Node.

echo "=================================================="
echo "   GSTD Compute Node Installer v1.0"
echo "   Connecting to https://app.gstdtoken.com"
echo "=================================================="

# Check for root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    echo "Unsupported OS. This script supports Debian/Ubuntu based systems."
    exit 1
fi

echo "Detected OS: $OS $VER"

# Install Dependencies
echo "Installing dependencies..."
apt-get update
# Install BOINC client and TUI for monitoring
apt-get install -y boinc-client boinctui curl jq

# Configuration
PROJECT_URL="https://app.gstdtoken.com"
# Use a weak account key for initial attachment or let user input
# For this script to be autonomous, we use the public project key if available or prompt user.
# However, the user instruction implies a "one-liner" that "just works".
# We will use the weak account key or a generic registration key if implemented.
# Assuming the user needs to register on the site effectively.
# But for now, we attach to the project.

echo "Configuring BOINC client..."

# allow remote gui rpc
# echo "gui_rpc_auth" > /var/lib/boinc-client/gui_rpc_auth.cfg
# chmod 640 /var/lib/boinc-client/gui_rpc_auth.cfg
# chown boinc:boinc /var/lib/boinc-client/gui_rpc_auth.cfg

service boinc-client restart
sleep 5

echo "Attaching to GSTD Network..."
# Try to lookup account or create one?
# BOINC usually requires an account key.
# If we want "anonymous" contribution (pool mode), we might strip this.
# But GSTD is account based.
# A true "curl | bash" script usually either asks for a token or generates a new identity.

# We will generate a random machine ID and register it via API first to get a token?
# Or simply output instructions.
# But user said "check valid addresses".

# Let's try to fetch the project configuration
CODE=$(curl -s -o /dev/null -w "%{http_code}" $PROJECT_URL/boinc/master_scheduler)
if [ "$CODE" != "200" ] && [ "$CODE" != "404" ]; then # 404 might be expected if not fully set up yet but we check connectivity
    echo "Warning: Could not connect to project scheduler at $PROJECT_URL"
    echo "Status Code: $CODE"
fi

# Determine if we have an account key from arguments (curl ... | bash -s -- <key>)
KEY=""
if [ ! -z "$1" ]; then
    KEY=$1
fi

if [ -z "$KEY" ]; then
    echo ""
    echo "IMPORTANT: You need your Account Key from the Dashboard."
    echo "Please visit https://app.gstdtoken.com/dashboard to get your key."
    read -p "Enter your Account Key: " KEY < /dev/tty
fi

if [ ! -z "$KEY" ]; then
    boinccmd --project_attach $PROJECT_URL $KEY
    echo "Attached to project!"
else
    echo "No key provided. Skipping attachment."
    echo "Run 'boinccmd --project_attach $PROJECT_URL <YOUR_KEY>' manually."
fi

# Install GSTD Agent (Proprietary Worker for specialized tasks)
# This would be where we download the Go binary if we had one built.
# For now, we assume BOINC is the primary compute layer.

echo ""
echo "=================================================="
echo "   Installation Complete!"
echo "   Monitor tasks with: boinctui"
echo "=================================================="
