# GSTD SDK

TypeScript SDK for GSTD Protocol - Decentralized Physical Infrastructure Network for Verifiable Computing on TON.

## Installation

```bash
npm install gstd-sdk
```

## Quick Start

```typescript
import { GSTD } from 'gstd-sdk';

const client = new GSTD({
  wallet: '0:...', // Your TON wallet address
  apiUrl: 'https://api.gstd.io/api', // GSTD API endpoint
  escrowAddress: '0:...', // Escrow contract address
  gstdJettonAddress: '0:...', // GSTD Jetton address
});

// Create a task
// Note: Upload your input data to IPFS or provide a URL
const task = await client.createTask({
  operation: 'ai-inference',
  inputSource: 'ipfs://Qm...', // IPFS hash of your input data
  compensation: 0.5, // TON
  timeLimitSec: 30,
  minTrust: 0.7,
});

console.log('Task ID:', task.task_id);

// Wait for the decentralized network to finish
const result = await task.waitForResult();
console.log('Decentralized Proof:', result);
```

## Input Data Handling

The SDK requires input data to be accessible via a URL (IPFS, HTTP, etc.). Here's the recommended workflow:

1. **Prepare your input data**:
   ```typescript
   const inputData = { image: 'base64...', model: 'resnet50' };
   ```

2. **Upload to IPFS** (using your preferred IPFS client):
   ```typescript
   // Example with ipfs-http-client
   const ipfs = create({ url: 'https://ipfs.infura.io:5001/api/v0' });
   const { path } = await ipfs.add(JSON.stringify(inputData));
   const inputSource = `ipfs://${path}`;
   ```

3. **Create task with inputSource**:
   ```typescript
   const task = await client.createTask({
     operation: 'ai-inference',
     inputSource: inputSource,
     compensation: 0.5,
   });
   ```

## API Reference

### Constructor

```typescript
const client = new GSTD({
  wallet: string, // Required: TON wallet address
  apiKey?: string, // Optional: API key for authentication
  apiUrl?: string, // Optional: API base URL (default: http://localhost:8080/api)
  escrowAddress?: string, // Optional: Escrow contract address
  gstdJettonAddress?: string, // Optional: GSTD Jetton address
});
```

### Methods

#### `createTask(params)`

Create a new task with automatic input encryption.

```typescript
const task = await client.createTask({
  operation: 'image_classification',
  input: { /* your data */ },
  inputSource: 'ipfs://...', // Required if input is provided
  compensation: 0.5,
  timeLimitSec: 30,
  minTrust: 0.7,
});
```

#### `waitForResult(taskId, pollInterval?, timeout?)`

Wait for task completion and return decrypted result.

```typescript
const result = await client.waitForResult('task-id', 2000, 300000);
```

#### `getResult(taskId)`

Get and decrypt task result.

```typescript
const result = await client.getResult('task-id');
```

#### `checkBalance(address?)`

Check GSTD Jetton balance.

```typescript
const balance = await client.checkBalance('0:...');
```

#### `generateEscrowLink(taskId, compensation)`

Generate escrow transaction for locking funds.

```typescript
const tx = client.generateEscrowLink('task-id', 0.5);
// Use with TonConnect or send directly
```

## License

MIT

