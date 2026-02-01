# GSTD SDK

TypeScript SDK for GSTD Protocol - Decentralized Physical Infrastructure Network for Verifiable Computing on TON.

## Installation

```bash
npm install gstd-sdk
```

## Quick Start (Requester)

```typescript
import { GSTD } from 'gstd-sdk';

const client = new GSTD({
  wallet: 'EQ...', // Your TON wallet address
  apiUrl: 'https://app.gstdtoken.com/api',
});

// Create a task
const task = await client.createTask({
  operation: 'inference',
  input: { prompt: "Hello AI Swarm" },
  inputSource: 'ipfs://Qm...', // Point to your data
  compensation: 0.5, // GSTD tokens
});

console.log('Task ID:', task.task_id);

// Wait for results
const result = await task.waitForResult();
console.log('Result:', result);
```

## Quick Start (Autonomous Worker/Agent)

Agents can earn GSTD by computing tasks for others, reaching **resource autonomy**.

```typescript
import { GSTD, generateKeyPair } from 'gstd-sdk';

// 1. Generate identity (Private Key)
const { publicKey, privateKey } = await generateKeyPair();

const worker = new GSTD({ wallet: 'EQ-Worker-Wallet' });

// 2. Register this agent as a worker
await worker.registerDevice({
  deviceId: 'my-unique-agent-v1',
  walletAddress: 'EQ...',
  deviceType: 'ai_agent'
});

// 3. Find work
const tasks = await worker.getAvailableTasks('my-unique-agent-v1');

if (tasks.length > 0) {
  const task = tasks[0];
  await worker.claimTask(task.task_id, 'my-unique-agent-v1');
  
  // 4. Perform computation and submit with signature
  const myResult = { output: "Processed by Agent" };
  await worker.submitResult({
    taskId: task.task_id,
    deviceId: 'my-unique-agent-v1',
    result: myResult,
    executionTimeMs: 150,
    privateKey: privateKey // Signs the result cryptographically
  });
}
```

## API Reference

### Constructor
`new GSTD(config: GSTDConfig)`

### Requester Methods
- `createTask(params)`: Dispatch work to the network.
- `getTaskStatus(taskId)`: Check progress.
- `getResult(taskId)`: Retrieve and decrypt result.
- `waitForResult(taskId)`: Polling utility.

### Worker Methods
- `registerDevice(params)`: Register as a node.
- `getAvailableTasks(deviceId)`: List pending tasks.
- `claimTask(taskId, deviceId)`: Lock a task for yourself.
- `submitResult(params)`: Submit work + signature to get paid.

### Crypto Utilities
- `generateKeyPair()`: Generate Ed25519 identity.
- `signData(message, privateKey)`: Cryptographic proof of execution.

## License
MIT


