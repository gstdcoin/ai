# GSTD Network MCP Server

Officially supported [Model Context Protocol](https://modelcontextprotocol.io) server for the GSTD NaaS Network. Connects any MCP-compatible AI agent to the GSTD ecosystem.

## Features

- **Multi-Chain RPC** — execute JSON-RPC commands across TON, ETH, SOL, BTC, BSC, ARB via the GSTD router
- **Network Stats** — live GSTD price, active nodes, requests served
- **Node Discovery** — query top-performing nodes dynamically

## Installation

```bash
cd gstd-mcp-server
npm install
npm run build
```

Create `.env`:
```
GSTD_B2B_API_KEY=gstd_b2b_sk_YOUR_KEY
GSTD_API_URL=https://app.gstdtoken.com
```

## Adding to any MCP-compatible agent

Add to your agent's MCP configuration file (e.g. `mcp.json`):

```json
{
  "mcpServers": {
    "gstd-network": {
      "command": "node",
      "args": ["./gstd-mcp-server/dist/index.js"],
      "env": {
        "GSTD_B2B_API_KEY": "gstd_b2b_sk_YOUR_KEY"
      }
    }
  }
}
```

Then ask your AI agent: *"Query the ETH balance of 0x... using the GSTD MCP server."*
