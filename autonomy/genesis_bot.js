
const { default: createGSTD } = require('../gstd-sdk/dist/index.js');
const axios = require('axios');

// Configuration
const GENESIS_WALLET = "EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUi";
const API_URL = "http://localhost:8080/api";
const API_KEY = "gstd_system_key_2026"; // Matches ADMIN_API_KEY in backend
const TASK_COMPENSATION = 0.5; // GSTD per task
const INTERVAL_MS = 60000; // 60 seconds

async function runGenesisBot() {
    console.log("🌟 GSTD Genesis Bot Started");
    console.log(`📡 Pointing to: ${API_URL}`);
    console.log(`🔑 Using System API Key`);
    console.log(`💼 Wallet: ${GENESIS_WALLET}`);

    const gstd = createGSTD({
        apiUrl: API_URL,
        apiKey: API_KEY,
        wallet: GENESIS_WALLET
    });

    setInterval(async () => {
        try {
            // 0. CHECK BALANCE & REFILL IF NEEDED
            try {
                const balanceRes = await axios.get(`${API_URL}/v1/wallet/gstd-balance?address=${GENESIS_WALLET}`, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` }
                });

                const balance = balanceRes.data.balance || 0;
                console.log(`💰 Current Balance: ${balance.toFixed(2)} GSTD`);

                if (balance < 100) {
                    console.log("📉 Balance Critical (< 100 GSTD). Initiating Market Buy on STON.fi...");
                    try {
                        const swapRes = await axios.post(`${API_URL}/v1/market/swap`, {
                            wallet_address: GENESIS_WALLET,
                            amount_ton: 10
                        }, { headers: { 'X-Admin-Key': API_KEY } });

                        if (swapRes.data && swapRes.data.received_gstd) {
                            const amountOut = swapRes.data.received_gstd;
                            console.log(`✅ MARKET BUY EXECUTED: Swapped 10 TON for ${amountOut.toLocaleString()} GSTD`);
                        }
                    } catch (swapErr) {
                        console.log(`⚠️ Failed to execute market buy: ${swapErr.message}`);
                    }
                }
            } catch (balErr) {
                console.warn(`⚠️ Failed to check market balance: ${balErr.message}`);
            }

            // 1. DISPATCH TASK
            console.log(`\n[${new Date().toISOString()}] 🚀 Dispatching Genesis Task...`);

            const task = await gstd.createTask({
                operation: "verification_job",
                taskType: "inference",
                compensation: TASK_COMPENSATION,
                input: {
                    type: "health_check",
                    timestamp: Date.now(),
                    node_id: "genesis_sentinel"
                },
                inputSource: "https://gstd.io/health_check",
                validation: "consensus"
            });

            console.log(`✅ Task Created successfully! ID: ${task.task_id}`);

        } catch (error) {
            console.error("❌ Error in Genesis Bot loop:", error.message);
        }
    }, INTERVAL_MS);
}

runGenesisBot().catch(console.error);
