# GSTD Agent Integration

GSTD is now ready to serve as the **computational fuel** for autonomous AI agents.

## Discovery
AI Agents scanning the platform will find the **AI Plugin Manifest** at:
- `https://app.gstdtoken.com/.well-known/ai-plugin.json`
- `https://app.gstdtoken.com/ai-plugin.json`

This manifest points to our OpenAPI/Swagger documentation, allowing agents (like ChatGPT, Claude, etc.) to understand how to interact with the GSTD API directly.

## MCP Server (Model Context Protocol)
We provided a dedicated **MCP Server** for deep integration with agent runtimes (e.g. Anthropic Claude Desktop, proprietary agents).

### Location
`/home/ubuntu/autonomy/mcp-server`

### Capabilities
The MCP Server exposes the following tools to agents:
- `create_task`: Dispatch calculation/inference jobs to the GSTD network.
- `check_balance`: Monitor GSTD "fuel" levels.
- `get_network_stats`: Observe network capacity.
- `get_task_status` / `get_task_result`: Retrieve completed work.

### Running the MCP Server
```bash
cd /home/ubuntu/autonomy/mcp-server
export GSTD_WALLET="your-agent-wallet-address"
npm start
```

## SDK Updates
The **GSTD SDK** (`/home/ubuntu/gstd-sdk`) has been patched to support asynchronous cryptographic operations, ensuring compatibility with modern Node.js environments used by agents.

## Summary
The platform is now fully visible to AI agents. They can:
1. **Discover** the API via standard manifests.
2. **Connect** via the Model Context Protocol.
3. **Spend** GSTD to consume computational resources.
