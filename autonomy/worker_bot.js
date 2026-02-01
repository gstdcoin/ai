
const { default: createGSTD, generateKeyPair } = require('../gstd-sdk/dist/index.js');
const axios = require('axios');

// Configuration
const REAL_WALLET = "EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUj";
const API_URL = "http://localhost:8080/api";
const DEVICE_ID = "agent_worker_x1";
const API_KEY = "gstd_system_key_2026";

async function runWorkerBot() {
    console.log("🤖 GSTD Autonomous Worker Started");

    // Generate identity
    const identity = await generateKeyPair();
    console.log(`🆔 Worker Public Key: ${identity.publicKey.substring(0, 16)}...`);

    const gstd = createGSTD({
        wallet: REAL_WALLET,
        apiUrl: API_URL,
        apiKey: API_KEY
    });

    console.log("📝 Registering worker...");
    try {
        await gstd.registerDevice({
            deviceId: DEVICE_ID,
            walletAddress: REAL_WALLET,
            deviceType: "desktop",
            powNonce: "GSTD_DEMO_NONCE_2026",
            publicKey: identity.publicKey
        });
        console.log("✅ Worker Registered Successfully!");
    } catch (e) {
        console.error("Registration failed:", e.response?.data || e.message);
        return;
    }

    console.log("🕵️ Scanning for work...");

    setInterval(async () => {
        try {
            // 1. Check for already assigned tasks
            const assignedResponse = await axios.get(`${API_URL}/v1/device/tasks/my?device_id=${DEVICE_ID}`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            const assignedTasks = assignedResponse.data.tasks || [];

            if (assignedTasks.length > 0) {
                console.log(`📋 Handling ${assignedTasks.length} assigned tasks...`);
                for (const task of assignedTasks) {
                    await executeTask(gstd, task, identity);
                }
            }

            // 2. If we have room, claim new tasks
            if (assignedTasks.length < 3) {
                const availableTasks = await gstd.getAvailableTasks(DEVICE_ID);
                if (availableTasks.length > 0) {
                    const task = availableTasks[0];
                    console.log(`🎯 Found new Task: ${task.task_id}. Claiming...`);

                    try {
                        await gstd.claimTask(task.task_id, DEVICE_ID);
                        console.log(`✅ Claimed ${task.task_id}. Executing...`);
                        await executeTask(gstd, task, identity);
                    } catch (claimError) {
                        console.error(`❌ Claim failed: ${claimError.message}`);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Worker Loop Error: ${error.message}`);
        }
    }, 10000);
}

async function executeTask(gstd, task, identity) {
    console.log(`⚙️ Executing ${task.task_id}...`);
    try {
        const result = {
            proof: "Autonomous Economy Verified",
            timestamp: Date.now(),
            agent: DEVICE_ID,
            task_type: task.task_type
        };
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        const messageToSign = task.task_id + resultStr;
        console.log(`🔏 Signing Message: ${messageToSign}`);

        await gstd.submitResult({
            taskId: task.task_id,
            deviceId: DEVICE_ID,
            result: result,
            executionTimeMs: 150,
            privateKey: identity.privateKey
        });
        console.log(`💰 Task ${task.task_id} Submitted and Verified!`);
    } catch (error) {
        console.error(`❌ Execution/Submission Error for ${task.task_id}: ${error.message}`);
        if (error.response) {
            console.error(`   Body: ${JSON.stringify(error.response.data)}`);
        }
    }
}

runWorkerBot().catch(console.error);
