# GSTD Network - MCP Server 🔌

This is the officially supported **Model Context Protocol (MCP)** server for the GSTD NaaS Network.
By running this server, you connect your IDE's Artificial Intelligence Agents (Cursor, Windsurf, Antigravity) directly to the GSTD Ecosystem!

## Features 🚀
- **Universal Multi-Chain RPC:** Agents can execute raw JSON-RPC commands across TON, ETH, SOL, BTC, BSC, and ARB through the GSTD B2B router.
- **Real-Time Ecosystem Stats:** Request Live Floor Price, Backing USD, and active Sovereign Fund data.
- **Node Swarm Interrogation:** Discover Top-Performing nodes dynamically.

## Installation 💻
First, compile the server from source (requires Node.js):
```bash
cd gstd-mcp-server
npm install
npm run build
```

Then, set your B2B API Key in `.env`:
```
GSTD_B2B_API_KEY=gstd_b2b_sk_YOUR_KEY
GSTD_RPC_URL=https://rpc.gstdtoken.com/v1
GSTD_API_URL=https://api.gstdtoken.com
```

## Adding to Cursor / Windsurf 🧠
Add this JSON snippet to your Agent's MCP configuration (`.cursor/mcp.json` or equivalent interface):

```json
{
  "mcpServers": {
    "gstd-network": {
      "command": "node",
      "args": ["/home/ubuntu/gstd-mcp-server/dist/index.js"],
      "env": {
        "GSTD_B2B_API_KEY": "gstd_b2b_sk_YOUR_KEY"
      }
    }
  }
}
```

Now, ask your AI: "Query the ETH blockchain balance of 0x... using my GSTD MCP server."
