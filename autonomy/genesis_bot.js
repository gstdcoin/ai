
const { default: createGSTD } = require('../gstd-sdk/dist/index.js');

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
        wallet: GENESIS_WALLET,
        apiUrl: API_URL,
        apiKey: API_KEY
    });

    let taskCount = 0;

    const dispatch = async () => {
        taskCount++;
        console.log(`\n[${new Date().toISOString()}] 🚀 Dispatching Genesis Task #${taskCount}...`);

        try {
            // 0. CHECK BALANCE & REFILL IF NEEDED (The "Buying Logic")
            // We use axios directly for the simulation endpoint as it's not in standard SDK yet
            const axios = require('axios');
            try {
                const balanceRes = await axios.get(`${API_URL}/v1/wallet/gstd-balance?address=${GENESIS_WALLET}`, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` }
                });

                const balance = balanceRes.data.balance || 0;
                console.log(`💰 Current Balance: ${balance.toFixed(2)} GSTD`);

                if (balance < 100) {
                    console.log("📉 Balance Critical (< 100 GSTD). Initiating Market Buy on STON.fi (Simulated)...");
                    const swapRes = await axios.post(`${API_URL}/v1/market/swap`, {
                        wallet_address: GENESIS_WALLET,
                        amount_ton: 10 // Swap 10 TON for 500 GSTD
                    }, {
                        headers: { 'Authorization': `Bearer ${API_KEY}` }
                    });
                    console.log(`✅ MARKET BUY EXECUTED: Swapped 10 TON for ${swapRes.data.received_gstd} GSTD`);
                }
            } catch (balErr) {
                console.warn(`⚠️ Failed to check market balance: ${balErr.message}`);
            }

            const task = await gstd.createTask({
                operation: "verification_job",
                taskType: "inference",
                compensation: TASK_COMPENSATION,
                input: {
                    type: "health_check",
                    timestamp: Date.now(),
                    node_id: "genesis_sentinel"
                },
                inputSource: "ipfs://genesis_data_placeholder"
            });

            console.log(`✅ Task Created successfully! ID: ${task.task_id}`);
        } catch (error) {
            console.error(`❌ Failed to create task: ${error.message}`);
            if (error.response) {
                console.error(`   Status Code: ${error.response.status}`);
                console.error(`   Body: ${JSON.stringify(error.response.data)}`);
            }
        }
    };

    // Initial run
    await dispatch();

    // Repeat 
    setInterval(dispatch, INTERVAL_MS);
}

runGenesisBot().catch(console.error);
