#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GSTD, generateKeyPair } from "gstd-sdk";

// Configuration from environment variables
const GSTD_WALLET = process.env.GSTD_WALLET || "EQC-Test-Wallet-Address";
const GSTD_API_URL = process.env.GSTD_API_URL || "https://app.gstdtoken.com/api";
const GSTD_API_KEY = process.env.GSTD_API_KEY;

// Agent Identity (in-memory for demo, should be persistent)
let AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || "";

// Initialize GSTD SDK
const gstd = new GSTD({
    wallet: GSTD_WALLET,
    apiUrl: GSTD_API_URL,
    apiKey: GSTD_API_KEY,
});

const server = new Server(
    {
        name: "gstd-compute-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_network_stats",
                description: "Get current GSTD network statistics (active workers, total tasks, etc).",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "check_balance",
                description: "Check GSTD and TON balance for a wallet.",
                inputSchema: {
                    type: "object",
                    properties: {
                        wallet_address: {
                            type: "string",
                            description: "Wallet address to check. Defaults to configured agent wallet.",
                        },
                    },
                },
            },
            {
                name: "create_task",
                description: "Create and dispatch a computational task to the GSTD network.",
                inputSchema: {
                    type: "object",
                    properties: {
                        operation: {
                            type: "string",
                            description: "Operation type (e.g., 'inference', 'math_job').",
                        },
                        model: {
                            type: "string",
                            description: "Model identifier (e.g., 'llama3').",
                        },
                        input_data: {
                            type: "string",
                            description: "Input data payload (JSON string or raw text).",
                        },
                        compensation: {
                            type: "number",
                            description: "Result compensation in TON (e.g. 0.1).",
                        },
                    },
                    required: ["operation", "input_data", "compensation"],
                },
            },
            {
                name: "get_task_status",
                description: "Check the status of a submitted task.",
                inputSchema: {
                    type: "object",
                    properties: {
                        task_id: {
                            type: "string",
                            description: "ID of the task to check.",
                        },
                    },
                    required: ["task_id"],
                },
            },
            {
                name: "get_task_result",
                description: "Retrieve the result of a completed task.",
                inputSchema: {
                    type: "object",
                    properties: {
                        task_id: {
                            type: "string",
                            description: "ID of the task.",
                        },
                    },
                    required: ["task_id"],
                },
            },
            {
                name: "register_worker",
                description: "Register this agent as a worker node to earn GSTD by computing tasks.",
                inputSchema: {
                    type: "object",
                    properties: {
                        device_id: { type: "string", description: "Unique ID for this AI agent worker." },
                        device_type: { type: "string", description: "Type of device (e.g. 'ai_agent_v1')." }
                    },
                    required: ["device_id"]
                }
            },
            {
                name: "find_work",
                description: "Find available tasks to perform and earn GSTD.",
                inputSchema: {
                    type: "object",
                    properties: {
                        device_id: { type: "string", description: "Your registered worker ID." },
                        limit: { type: "number", description: "Max tasks to retrieve." }
                    },
                    required: ["device_id"]
                }
            },
            {
                name: "claim_work",
                description: "Claim a specific task to start working on it.",
                inputSchema: {
                    type: "object",
                    properties: {
                        task_id: { type: "string", description: "ID of the task to claim." },
                        device_id: { type: "string", description: "Your registered worker ID." }
                    },
                    required: ["task_id", "device_id"]
                }
            },
            {
                name: "submit_work",
                description: "Submit the result of a completed task to get paid. Requires Identity.",
                inputSchema: {
                    type: "object",
                    properties: {
                        task_id: { type: "string", description: "ID of the completed task." },
                        device_id: { type: "string", description: "Your registered worker ID." },
                        result: { type: "string", description: "JSON result or raw string." },
                        execution_time_ms: { type: "number", description: "Time taken to execute in ms." }
                    },
                    required: ["task_id", "device_id", "result", "execution_time_ms"]
                }
            },
            {
                name: "generate_identity",
                description: "Generate a new persistent identity (Wallet + Private Key) for this agent.",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "get_exchange_info",
                description: "Get instructions on how to buy GSTD (fuel) or sell earned GSTD.",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        switch (request.params.name) {
            case "get_network_stats": {
                const stats = await gstd.getStats();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(stats, null, 2),
                        },
                    ],
                };
            }

            case "check_balance": {
                const wallet = String(request.params.arguments?.wallet_address || GSTD_WALLET);
                const balance = await gstd.checkBalance(wallet);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(balance, null, 2),
                        },
                    ],
                };
            }

            case "create_task": {
                const args = request.params.arguments as any;

                let input = args.input_data;
                try {
                    input = JSON.parse(args.input_data);
                } catch (e) {
                    // ignore
                }

                const task = await gstd.createTask({
                    operation: args.operation,
                    model: args.model,
                    input: input,
                    inputSource: "ipfs://agent_submission", // Placeholder
                    compensation: Number(args.compensation),
                    minTrust: 0.1,
                    taskType: "inference"
                });

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                task_id: task.task_id,
                                status: task.status,
                                message: "Task dispatched successfully. Use get_task_status to monitor."
                            }, null, 2),
                        },
                    ],
                };
            }

            case "get_task_status": {
                const taskId = String(request.params.arguments?.task_id);
                const status = await gstd.getTaskStatus(taskId);
                return {
                    content: [{ type: "text", text: JSON.stringify(status, null, 2) }]
                };
            }

            case "get_task_result": {
                const taskId = String(request.params.arguments?.task_id);
                const result = await gstd.getResult(taskId);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };
            }

            case "register_worker": {
                const args = request.params.arguments as any;
                const result = await gstd.registerDevice({
                    deviceId: args.device_id,
                    walletAddress: GSTD_WALLET,
                    deviceType: args.device_type || 'ai_agent_automata',
                    deviceInfo: "Autonomous AI Agent Worker"
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };
            }

            case "find_work": {
                const args = request.params.arguments as any;
                const tasks = await gstd.getAvailableTasks(args.device_id, args.limit || 5);
                return {
                    content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }]
                };
            }

            case "claim_work": {
                const args = request.params.arguments as any;
                const result = await gstd.claimTask(args.task_id, args.device_id);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };
            }

            case "submit_work": {
                const args = request.params.arguments as any;

                if (!AGENT_PRIVATE_KEY) {
                    // Try to generate one if missing? No, user must generate explicitly to save it.
                    throw new Error("No identity configured. Run 'generate_identity' first to get a key, then set AGENT_PRIVATE_KEY.");
                }

                const result = await gstd.submitResult({
                    taskId: args.task_id,
                    deviceId: args.device_id,
                    result: args.result,
                    executionTimeMs: args.execution_time_ms,
                    privateKey: AGENT_PRIVATE_KEY
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };
            }

            case "generate_identity": {
                const identity = await generateKeyPair();
                AGENT_PRIVATE_KEY = identity.privateKey; // Set for current session
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            message: "Identity generated successfully. SAVE THESE CREDENTIALS.",
                            public_key: identity.publicKey,
                            private_key: identity.privateKey,
                            note: "The private_key has been temporarily set for this session. For permanent use, add it to your environment variables."
                        }, null, 2)
                    }]
                };
            }

            case "get_exchange_info": {
                return {
                    content: [{
                        type: "text",
                        text: `
GSTD Token Exchange Information:
--------------------------------
Contract Address (CA): EQ... (Check official docs)
DEX: https://app.ston.fi/swap?chartVisible=false&ft=TON&tt=GSTD

Buying Fuel:
1. Connect Wallet to Ston.fi.
2. Swap TON for GSTD.
3. Your agent wallet (${GSTD_WALLET}) will be credited.

Selling Fuel:
1. Earn GSTD by completing 'find_work' tasks.
2. Swap GSTD for TON on Ston.fi.
                        `
                    }]
                };
            }

            default:
                throw new Error("Unknown tool");
        }
    } catch (error: any) {
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${error.message}` }]
        };
    }
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("GSTD MCP Server running on stdio");
}

run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
