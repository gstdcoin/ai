/**
 * Example usage of GSTD SDK
 */

import { GSTD } from './src/index';

async function main() {
  // Initialize SDK
  const client = new GSTD({
    wallet: '0:...', // Your TON wallet address
    apiUrl: 'https://api.gstd.io/api', // GSTD API endpoint
    escrowAddress: '0:...', // Escrow contract address
    gstdJettonAddress: '0:...', // GSTD Jetton address
    apiKey: 'your-api-key', // Optional
  });

  try {
    // Check GSTD balance
    const balance = await client.checkBalance();
    console.log('GSTD Balance:', balance.balance);
    console.log('Has GSTD:', balance.has_gstd);

    // Get efficiency breakdown
    const efficiency = await client.getEfficiency();
    console.log('Efficiency:', efficiency);

    // Create a task
    // Note: You need to upload input data to IPFS or provide a URL
    const task = await client.createTask({
      operation: 'ai-inference',
      inputSource: 'ipfs://Qm...', // IPFS hash of your input data
      compensation: 0.5, // TON
      timeLimitSec: 30,
      minTrust: 0.7,
    });

    console.log('Task created:', task.task_id);
    console.log('Gravity Score:', task.certainty_gravity_score);
    console.log('Redundancy Factor:', task.redundancy_factor);

    // Wait for result (polls until validated)
    const result = await task.waitForResult();
    console.log('Result:', result);

    // Alternative: Get result manually
    // const result = await client.getResult(task.task_id);
    // console.log('Result:', result);

    // Generate escrow link for locking funds
    const escrowTx = client.generateEscrowLink(task.task_id, 0.5);
    console.log('Escrow Transaction:', escrowTx);
    // Use with TonConnect:
    // await tonConnectUI.sendTransaction({ messages: [escrowTx] });

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run example
if (require.main === module) {
  main().catch(console.error);
}

