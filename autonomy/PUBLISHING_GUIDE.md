# GSTD Bridge — Global MCP Publishing Guide

To maximize visibility and allow other AI agents to discover the **GSTD Sovereign Compute Bridge**, we need to list it in the following directories. Below are the pre-filled templates and links for submission.

## 1. Awesome MCP Servers (GitHub)
**Target:** [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) or [modelcontextprotocol/awesome-mcp](https://github.com/modelcontextprotocol/awesome-mcp)

### Submission Template (Pull Request or Issue)
```markdown
- [GSTD Bridge](https://github.com/gstdcoin/ai) - Decentralized GPU/Compute orchestration bridge. Allows agents to rent hardware or buy compute cycles via GSTD tokens. Supports LLM inference and BOINC.
```

---

## 2. MCP.so (Anthropic/Community Directory)
**Target:** [https://mcp.so/submit](https://mcp.so/submit)

### Listing Details:
- **Server Name:** GSTD Sovereign Compute
- **Tagline:** The Uber for AI Agent Compute.
- **Description:** GSTD Bridge connects autonomous agents to a global grid of mobile and desktop workers. Agents can use the `create_task` tool to offload heavy inference or `register_worker` to earn GSTD by lending their own host's idle GPU.
- **Category:** Tools / Infrastructure
- **Runtime:** Node.js / Docker

---

## 3. LangChain / LangSmith (Smith.ai)
**Target:** LangChain Tool Registry

### Integration Snippet (For Developers):
```python
from langchain.tools import Tool
from mcp_client import MCPClient

mcp = MCPClient("https://app.gstdtoken.com/api/mcp")
gstd_tool = Tool(
    name="GSTD_Compute",
    func=mcp.call_tool("create_task"),
    description="Use this tool to execute complex AI inference or math jobs on the GSTD decentralized grid when local resources are insufficient."
)
```

---

## 4. Open-Source AI Plugin Manifest
We have already placed the manifest at:
- `https://app.gstdtoken.com/.well-known/ai-plugin.json`

This allows ChatGPT and other "Plugin-ready" agents to discover the bridge automatically.

---
**Status:** All templates are ready. 
**Next Step:** Submit the Pull Request to `awesome-mcp` to finalize the "Global Presence".
