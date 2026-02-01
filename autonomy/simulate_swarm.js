
const { default: createGSTD, generateKeyPair } = require('../gstd-sdk/dist/index.js');

// Simulation Configuration
const WALLET_A = "EQ_Agent_A_Wallet_Address";
const WALLET_B = "EQ_Agent_B_Worker_Address";
const DEVICE_ID = "agent_worker_001";

async function runSwarmSimulation() {
    console.log("🚀 Starting GSTD Agent Swarm Simulation...");
    console.log("-------------------------------------------");

    // 1. Initialize Agents
    const agentA = createGSTD({ wallet: WALLET_A }); // Requester
    const agentB = createGSTD({ wallet: WALLET_B }); // Worker

    // 2. Agent B: Generate Identity & Register
    console.log("\n🤖 Agent B (Worker): Generating Identity...");
    const identityB = await generateKeyPair();
    console.log(`   - Public Key: ${identityB.publicKey.substring(0, 10)}...`);

    console.log("🤖 Agent B: Registering as Worker...");
    try {
        await agentB.registerDevice({
            deviceId: DEVICE_ID,
            walletAddress: WALLET_B,
            deviceType: "ai_swarm_node",
            deviceInfo: "High-Performance Agent Node"
        });
        console.log("   ✅ Registered successfully.");
    } catch (e) {
        console.log("   ⚠️  Already registered or error: " + e.message);
    }

    // 3. Agent A: Create a Task
    console.log("\n👤 Agent A (Requester): I need help with a calculation.");
    console.log("   Creating task: 'Calculate Optimality of 42'");

    const task = await agentA.createTask({
        operation: "math_op_42",
        timeLimitSec: 60,
        compensation: 0.1,
        input: { question: "What is the answer?" },
        inputSource: "ipfs://simulated_hash"
    });
    console.log(`   ✅ Task Created! ID: ${task.task_id}`);

    // Allow time for propagation
    await new Promise(r => setTimeout(r, 1000));

    // 4. Agent B: Find Work
    console.log("\n🤖 Agent B: Scanning for work...");
    const tasks = await agentB.getAvailableTasks(DEVICE_ID);
    console.log(`   Found ${tasks.length} tasks.`);

    const targetTask = tasks.find(t => t.task_id === task.task_id);

    if (targetTask) {
        console.log(`   🎯 Found target task: ${targetTask.task_id}`);

        // 5. Agent B: Claim Task
        console.log("   Claiming task...");
        await agentB.claimTask(targetTask.task_id, DEVICE_ID);
        console.log("   ✅ Claimed.");

        // 6. Agent B: Execute Work (Simulation)
        console.log("   Computing result... (Simulating 100ms work)");
        await new Promise(r => setTimeout(r, 100));
        const result = { answer: 42, explanation: "Universal Constant" };

        // 7. Agent B: Submit Result (Signed)
        console.log("   Submitting signed result...");
        try {
            await agentB.submitResult({
                taskId: targetTask.task_id,
                deviceId: DEVICE_ID,
                result: result,
                executionTimeMs: 100,
                privateKey: identityB.privateKey
            });
            console.log("   ✅ Work Submitted! Payment Pending.");
        } catch (e) {
            console.error("   ❌ Submission Failed: " + e.message);
        }

    } else {
        console.log("   ⚠️  Task not found in queue (indexing delay?)");
    }

    // 8. Agent A: Verify
    console.log("\n👤 Agent A: Checking result...");
    try {
        const result = await agentA.waitForResult(task.task_id, 1000, 5000);
        console.log("   ✅ Result Received:", JSON.stringify(result));
        console.log("\n🎉 SWARM TRANSACTION COMPLETE. Economy is Live.");
    } catch (e) {
        // console.log("   e:", e);
        console.log("   ⏳ Waiting for verification/payment... (Simulation Ended)");
    }
}

// Run
runSwarmSimulation().catch(console.error);
