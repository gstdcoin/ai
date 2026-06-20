#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '.env') });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from 'axios';

// The MCP server exposing the GSTD Network (Nodes-as-a-Service + Sovereign Fund)
const server = new McpServer({
  name: "GSTD-Network-MCP",
  version: "1.0.0",
});

const API_KEY = process.env.GSTD_B2B_API_KEY || ''; // Must have a B2B API Key
const RPC_ENDPOINT = process.env.GSTD_RPC_URL || 'https://rpc.gstdtoken.com/v1';

if (!API_KEY) {
    console.error("Warning: GSTD_B2B_API_KEY is not defined. RPC tools may fail with 401.");
}

// ─── Tool 1: Raw RPC Request ────────────────────────────────────────────────
server.tool(
  "execute_rpc",
  "Execute a JSON-RPC request on a specified blockchain using GSTD fast nodes.",
  {
    chain: z.enum(["ton", "eth", "sol", "btc", "bsc", "arb"]).describe("Blockchain to query"),
    method: z.string().describe("The RPC method (e.g., eth_getBalance, getAddressInformation)"),
    params: z.array(z.any()).describe("Parameters expected by the RPC method"),
  },
  async ({ chain, method, params }) => {
    try {
      const response = await axios.post(`${RPC_ENDPOINT}/${chain}`, {
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
    } catch (e: any) {
        return {
            content: [{ type: "text", text: `RPC Error: ${e.response?.data?.error?.message || e.message}` }],
            isError: true
        };
    }
  }
);

// ─── Tool 2: Check Sovereing Fund Status ────────────────────────────────────
server.tool(
    "get_fund_status",
    "Get live network stats for GSTD: active nodes, GSTD price, requests served, treasury balance.",
    {},
    async () => {
        try {
            // Internal network since this might run on the ecosystem or outside
            const url = process.env.GSTD_API_URL || 'https://app.gstdtoken.com';
            const res = await axios.get(`${url}/api/v1/fund/status`);
            return {
                content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }]
            };
        } catch (e: any) {
            return { content: [{ type: "text", text: `API Error: ${e.message}` }], isError: true };
        }
    }
);

// ─── Tool 3: Get Active GSTD Nodes ──────────────────────────────────────────
server.tool(
    "list_nodes",
    "List top performing Swarm nodes handling requests right now.",
    {},
    async () => {
        try {
            const url = process.env.GSTD_API_URL || 'https://app.gstdtoken.com';
            const res = await axios.get(`${url}/api/v1/fund/leaderboard`);
            const nodes = res.data.leaderboard || [];
            if (nodes.length === 0) return { content: [{ type: "text", text: "No nodes online recently." }] };
            
            const summary = nodes.slice(0, 10).map((n: any) => 
                `Node: ${n.node_id} | Tier: ${n.tier} | Mult: ${n.multiplier}x | Uptime: ${n.uptime_pct}%`
            ).join('\n');

            return { content: [{ type: "text", text: summary }] };
        } catch (e: any) {
            return { content: [{ type: "text", text: `API Error: ${e.message}` }], isError: true };
        }
    }
);

// Start the stdio transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stdout is used for MCP messages. Log to stderr if necessary.
  console.error("GSTD Network MCP Server running on stdio");
}

run().catch(e => {
    console.error("Fatal error", e);
    process.exit(1);
});
