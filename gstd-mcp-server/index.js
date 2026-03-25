#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const path_1 = require("path");
(0, dotenv_1.config)({ path: (0, path_1.resolve)(__dirname, '.env') });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const axios_1 = __importDefault(require("axios"));
// The MCP server exposing the GSTD Network (Nodes-as-a-Service + Sovereign Fund)
const server = new mcp_js_1.McpServer({
    name: "GSTD-Network-MCP",
    version: "1.0.0",
});
const API_KEY = process.env.GSTD_B2B_API_KEY || ''; // Must have a B2B API Key
const RPC_ENDPOINT = process.env.GSTD_RPC_URL || 'https://rpc.gstd.network/v1';
if (!API_KEY) {
    console.error("Warning: GSTD_B2B_API_KEY is not defined. RPC tools may fail with 401.");
}
// ─── Tool 1: Raw RPC Request ────────────────────────────────────────────────
server.tool("execute_rpc", "Execute a JSON-RPC request on a specified blockchain using GSTD fast nodes.", {
    chain: zod_1.z.enum(["ton", "eth", "sol", "btc", "bsc", "arb"]).describe("Blockchain to query"),
    method: zod_1.z.string().describe("The RPC method (e.g., eth_getBalance, getAddressInformation)"),
    params: zod_1.z.array(zod_1.z.any()).describe("Parameters expected by the RPC method"),
}, async ({ chain, method, params }) => {
    try {
        const response = await axios_1.default.post(`${RPC_ENDPOINT}/${chain}`, {
            jsonrpc: "2.0",
            method,
            params,
            id: 1
        }, {
            headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return {
            content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
    }
    catch (e) {
        return {
            content: [{ type: "text", text: `RPC Error: ${e.response?.data?.error?.message || e.message}` }],
            isError: true
        };
    }
});
// ─── Tool 2: Check Sovereing Fund Status ────────────────────────────────────
server.tool("get_fund_status", "Get mathematical backing and real-time floor price metrics for GSTD.", {}, async () => {
    try {
        // Internal network since this might run on the ecosystem or outside
        const url = process.env.GSTD_API_URL || 'https://api.gstdtoken.com';
        const res = await axios_1.default.get(`${url}/api/v1/fund/status`);
        return {
            content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }]
        };
    }
    catch (e) {
        return { content: [{ type: "text", text: `API Error: ${e.message}` }], isError: true };
    }
});
// ─── Tool 3: Get Active GSTD Nodes ──────────────────────────────────────────
server.tool("list_nodes", "List top performing Swarm nodes handling requests right now.", {}, async () => {
    try {
        const url = process.env.GSTD_API_URL || 'https://api.gstdtoken.com';
        const res = await axios_1.default.get(`${url}/api/v1/fund/leaderboard`);
        const nodes = res.data.leaderboard || [];
        if (nodes.length === 0)
            return { content: [{ type: "text", text: "No nodes online recently." }] };
        const summary = nodes.slice(0, 10).map((n) => `Node: ${n.node_id} | Tier: ${n.tier} | Mult: ${n.multiplier}x | Uptime: ${n.uptime_pct}%`).join('\n');
        return { content: [{ type: "text", text: summary }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `API Error: ${e.message}` }], isError: true };
    }
});
// Start the stdio transport
async function run() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    // Stdout is used for MCP messages. Log to stderr if necessary.
    console.error("GSTD Network MCP Server running on stdio");
}
run().catch(e => {
    console.error("Fatal error", e);
    process.exit(1);
});
//# sourceMappingURL=index.js.map