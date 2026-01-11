# GSTD Protocol Specification v1.0
## Decentralized Physical Infrastructure Network (DePIN) for Verifiable Computing on TON

**Version:** 1.0  
**Status:** Production Alpha  
**Last Updated:** 2024

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Architecture Overview](#technical-architecture-overview)
3. [The Lifecycle of a Task](#the-lifecycle-of-a-task)
4. [Security & Economic Hardening](#security--economic-hardening)
5. [Regulatory Compliance Framework](#regulatory-compliance-framework)
6. [API Reference](#api-reference)
7. [Appendices](#appendices)

---

## 1. Executive Summary

### 1.1 What is GSTD?

**GSTD (Global System for Trusted Distributed Computing)** is a Decentralized Physical Infrastructure Network (DePIN) that enables verifiable, distributed computation on the TON blockchain. Unlike traditional cloud computing platforms, GSTD operates as a **Proof-of-Computation** network where economic incentives align with computational reliability.

### 1.2 Core Value Proposition

GSTD provides three fundamental innovations:

1. **Multi-Dimensional Trust Model**: Devices are evaluated across three dimensions—Accuracy (A), Latency (L), and Stability (S)—creating a comprehensive trust vector that resists gaming and adapts to real-world performance.

2. **Economic Gravity System (EGS)**: The GSTD Jetton token functions as a "unit of computational certainty." Higher GSTD balances increase a task's "gravity," attracting more reliable devices and enabling deeper verification layers.

3. **Error-as-a-Resource Model**: Computational errors and result collisions are not discarded but recorded as "entropy," which informs network-wide reliability metrics and prevents collusion attacks.

### 1.3 Key Differentiators

- **No Financial Speculation**: GSTD is a utility token, not an investment vehicle. It regulates computational certainty, not financial returns.
- **Client-Side Execution**: Tasks execute in WebAssembly (Wasm) within the user's browser, ensuring privacy and reducing server load.
- **Pull-Model Payments**: Executors claim compensation via smart contract, eliminating custodial risk.
- **Regulatory Compliance**: Designed to meet MiCA (EU) and SEC (US) utility token definitions.

---

## 2. Technical Architecture Overview

### 2.1 Network Layers

The GSTD Protocol operates across three interconnected layers:

#### 2.1.1 Physics Layer (v5.0)

The Physics Layer models the network as a thermodynamic system, where computational reliability follows physical laws.

**Network Temperature (T)**
$$
T = \text{avg}(\text{entropy\_score}) \text{ across all operations}
$$

Network Temperature represents global noise and error rate. Higher temperature indicates lower network reliability.

**Computational Pressure (P)**
$$
P = \frac{\text{Number of Pending Tasks}}{\text{Number of Active Nodes}}
$$

Pressure reflects the load on individual nodes. High pressure may indicate network congestion.

**Entropy Gradient (∇E)**
$$
\nabla E = \frac{\partial \text{entropy}}{\partial \text{time}}
$$

The entropy gradient measures how quickly network reliability is changing, enabling predictive adjustments.

#### 2.1.2 Economic Layer

The Economic Layer governs task distribution and compensation through the Economic Gravity Score (EGS).

**Economic Gravity Score (EGS v3)**
$$
\text{EGS} = \frac{\text{Labor\_Compensation} \times (1 + \text{GSTD\_Utility})}{T}
$$

Where:
- **Labor_Compensation**: TON amount paid to executors
- **GSTD_Utility**: Logarithmic function of GSTD balance
  $$
  \text{GSTD\_Utility} = \log_{10}\left(1 + \frac{\text{GSTD\_Balance}}{10000}\right)
  $$
- **T**: Network Temperature (from Physics Layer)

**GSTD Gravity Capping**: To prevent unlimited influence, GSTD utility is capped at 1,000,000 GSTD:
$$
\text{GSTD\_Capped} = \min(\text{GSTD\_Balance}, 1000000)
$$

**Confidence Depth ($C_d$)**
$$
C_d = \lfloor 1 + \log_{10}(1 + \text{GSTD}/10000) \rfloor
$$

Confidence Depth determines the number of independent verifications required for a task. Higher GSTD balances enable deeper verification.

**Dynamic Redundancy Factor ($R_d$)**
$$
R_d = \lceil 1 + \text{entropy} \times (1 - \text{avg\_trust}) \rceil
$$

Redundancy Factor determines how many devices must execute the same task. It increases with:
- Higher operation entropy (more errors historically)
- Lower average device trust scores

#### 2.1.3 Trust Layer (v3)

The Trust Layer maintains a multi-dimensional trust vector for each device.

**Trust Vector $\{A, L, S\}$**
- **A (Accuracy)**: Fraction of correct results (0.0 to 1.0)
- **L (Latency)**: Normalized execution time score (0.0 to 1.0)
- **S (Stability)**: Consistency of performance over time (0.0 to 1.0)

**Trust Score Calculation**
$$
\text{Trust\_Score} = 0.6 \times A + 0.2 \times L + 0.2 \times S
$$

**Trust Decay**
$$
\text{Trust}(t) = \text{Trust}(t_0) \times e^{-\lambda \Delta t}
$$

Where:
- $\lambda = 0.00001$ (decay constant)
- $\Delta t$ = time since last update

**Trust Update Formula**
$$
\text{New\_A} = \text{Old\_A} \times \text{decay} \times (1 - \alpha) + \text{Observed\_A} \times \alpha
$$

Where $\alpha = 0.1$ (learning rate).

### 2.2 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Go 1.21+ | API server, task coordination, validation |
| **Frontend** | Next.js 14, React 18 | User interface, task execution UI |
| **Database** | PostgreSQL 14+ | Task state, device trust, entropy records |
| **Cache/Queue** | Redis 7+ | Task distribution streams, real-time metrics |
| **Blockchain** | TON (The Open Network) | Payments, GSTD Jetton, smart contracts |
| **Smart Contracts** | Tact Language | Escrow contract for pull-model payouts |
| **Execution** | WebAssembly (Wasm) | Client-side task computation |
| **Encryption** | AES-256-GCM | End-to-end task data encryption |
| **Signatures** | Ed25519 | Result proof and verification |
| **Real-time** | WebSocket (Gorilla) | Task notifications to devices |

### 2.3 System Components

#### 2.3.1 Backend Services

- **TaskService**: Task creation, EGS calculation, Redis Streams publishing
- **ValidationService**: Result comparison, consensus detection, signature verification
- **TrustV3Service**: Multi-dimensional trust vector updates
- **EntropyService**: Error-as-a-Resource model, collision tracking
- **HardenedGravityService**: EGS calculation, redundancy factor, spot checks
- **PhysicsService**: Network temperature, computational pressure
- **PaymentService**: Payout intent generation for pull-model transactions
- **EncryptionService**: AES-256-GCM encryption/decryption
- **TONService**: TON API integration, GSTD balance checks, public key resolution
- **AssignmentService**: Task assignment, device filtering
- **ResultService**: Result submission, encryption, retrieval
- **WSHub**: WebSocket hub for real-time task delivery

#### 2.3.2 Frontend Components

- **TaskWorker**: WebSocket client, Wasm execution, result signing
- **Dashboard**: Task management, statistics, device monitoring
- **TasksPanel**: Task list, payout claims
- **CreateTaskModal**: Task creation interface

#### 2.3.3 Smart Contracts

- **Escrow Contract** (`escrow.tact`): Handles pull-model payouts with structured `Withdraw` messages

---

## 3. The Lifecycle of a Task

### 3.1 Task Creation (API Ingestion)

**Endpoint**: `POST /api/v1/tasks`

**Request Flow**:
1. Requester submits task descriptor via API
2. Backend calculates:
   - GSTD balance of requester
   - Operation entropy (from historical data)
   - Economic Gravity Score (EGS)
   - Dynamic Redundancy Factor ($R_d$)
   - Confidence Depth ($C_d$)
3. Task stored in PostgreSQL with status `awaiting_escrow`
4. Requester locks TON in escrow contract
5. Status changes to `pending`

**Task Descriptor Structure**:
```json
{
  "requester_address": "0:...",
  "task_type": "inference",
  "operation": "image_classification",
  "model": "https://.../model.wasm",
  "input_source": "ipfs://...",
  "input_hash": "sha256:...",
  "time_limit_sec": 30,
  "max_energy_mwh": 10,
  "labor_compensation_ton": 0.5,
  "validation_method": "majority",
  "min_trust": 0.7,
  "is_private": false
}
```

### 3.2 Task Distribution (EGS Sharding)

**Distribution Channels**:
1. **Redis Streams**: Primary distribution channel for horizontal scaling
   - Stream: `tasks:stream`
   - Consumer Group: `task_workers`
   - Tasks published with EGS as priority score

2. **WebSocket Broadcast**: Real-time delivery to connected devices
   - Hub filters devices by `min_trust_score`
   - Broadcasts task notification when status becomes `pending`

**Priority Bucketing**:
Tasks are categorized by EGS:
- **Flash** ($\text{EGS} > 100$): High-priority, immediate execution
- **Standard** ($10 < \text{EGS} \leq 100$): Normal priority
- **Economy** ($\text{EGS} \leq 10$): Lower priority, batch processing

### 3.3 Task Execution (Wasm in Browser)

**Client-Side Execution Flow**:
1. Device receives task notification via WebSocket
2. Device claims task: `POST /api/v1/device/tasks/:id/claim`
3. Task status changes to `assigned`
4. Device fetches input data from `input_source`
5. Device verifies input hash matches `input_hash`
6. Device loads Wasm module from `model` URL (cached if available)
7. Device executes Wasm with input data:
   - Memory limit: 256-512 pages (16-32 MB)
   - Timeout: `time_limit_sec` seconds
   - Energy limit: `max_energy_mwh` mWh
8. Device signs result: `SHA-256(taskID + resultData)`
9. Device encrypts result using AES-256-GCM
10. Device submits result: `POST /api/v1/device/tasks/:id/result`

**Result Submission Payload**:
```json
{
  "device_id": "...",
  "result": "<encrypted_base64>",
  "proof": "<ed25519_signature_hex>",
  "execution_time_ms": 1234
}
```

### 3.4 Validation (Consensus/Arbitration)

**Validation Flow**:

1. **Signature Verification**:
   - Resolve device's wallet address from `device_id`
   - Get public key via TON API
   - Reconstruct message: `SHA-256(taskID + resultData)`
   - Verify Ed25519 signature: `ed25519.Verify(pubKey, hash, signature)`
   - If invalid: Reject result, decrease trust to 0.0

2. **Redundancy Check**:
   - If $R_d = 1$: Validate immediately
   - If $R_d > 1$: Wait for $R_d$ submissions

3. **Result Comparison**:
   - Decrypt all results using task key
   - Compare results (JSON comparison)
   - If consensus: Mark as `validated`
   - If collision: Trigger arbitration

4. **Consensus Detection**:
   - Majority vote: Result with >50% agreement
   - If consensus: Update trust for all devices (A=1.0, L=latency_score, S=1.0)
   - Record execution in EntropyService (collision=false)

5. **Arbitration (Collision)**:
   - Record collision in EntropyService (collision=true)
   - Increase operation entropy
   - Assign task to additional worker
   - Decrease trust for minority devices:
     - Technical failure (valid signature): A=0.3, L=0.5, S=0.5
     - Malicious intent (invalid signature): A=0.0, L=0.0, S=0.0

### 3.5 Payout (Pull-Model via Tact Escrow)

**Payout Flow**:

1. **Payout Intent Generation**:
   - Executor calls: `POST /api/v1/payments/payout-intent`
   - Backend calculates:
     - Platform fee: `labor_compensation × platform_fee_percent / 100`
     - Executor reward: `labor_compensation - platform_fee`
   - Backend returns `PayoutIntent`:
     ```json
     {
       "to_address": "<escrow_contract_address>",
       "amount_nano": 0,
       "payload_comment": "WITHDRAW|task:...|exec:...|fee:...|reward:...",
       "executor_reward_ton": 0.45,
       "platform_fee_ton": 0.05,
       "task_id": "...",
       "executor_address": "0:..."
     }
     ```

2. **Cell Payload Construction** (Frontend):
   ```typescript
   const payloadCell = beginCell()
     .storeUint(0, 32) // op_code for Withdraw
     .storeAddress(executorAddress)
     .storeCoins(platformFeeNano)
     .storeCoins(executorRewardNano)
     .storeRef(
       beginCell()
         .storeStringTail(taskId)
         .endCell()
     )
     .endCell();
   ```

3. **Smart Contract Execution**:
   - Executor sends transaction to escrow contract with Cell payload
   - Contract verifies sender (owner or executor)
   - Contract distributes funds:
     - Platform fee → Treasury address
     - Executor reward → Executor address
   - Contract uses `SendRemainingValue` to refund gas

**Escrow Contract Message Structure**:
```tact
message Withdraw {
    executorAddress: Address;
    platformFee: Int as coins;
    executorReward: Int as coins;
    taskId: String;
}
```

---

## 4. Security & Economic Hardening

### 4.1 Ed25519 Signature Verification

**Purpose**: Prevent result spoofing and ensure result authenticity.

**Process**:
1. **Message Construction**:
   $$
   \text{message} = \text{taskID} + \text{JSON.stringify(resultData)}
   $$

2. **Hash Generation**:
   $$
   \text{hash} = \text{SHA-256}(\text{message})
   $$

3. **Public Key Resolution**:
   - Device ID → Wallet Address (from database)
   - Wallet Address → Public Key (via TON API)

4. **Signature Verification**:
   $$
   \text{valid} = \text{Ed25519.Verify}(\text{pubKey}, \text{hash}, \text{signature})
   $$

**Failure Handling**:
- Invalid signature → Result rejected
- Task status reverted to `assigned`
- Device trust vector set to $\{0.0, 0.0, 0.0\}$ (malicious intent)

### 4.2 GSTD Jetton Utility

**GSTD as "Unit of Computational Certainty"**:

GSTD balance directly influences:

1. **Certainty Gravity**:
   $$
   \text{Gravity} = \frac{\text{Certainty}}{1 + \ln(1 + \text{GSTD}/10000)}
   $$
   Higher GSTD balances reduce the "gravity" required to achieve a given certainty level.

2. **Confidence Depth**:
   $$
   C_d = \lfloor 1 + \log_{10}(1 + \text{GSTD}/10000) \rfloor
   $$
   More GSTD enables deeper verification (more independent checks).

3. **Economic Gravity Score**:
   $$
   \text{EGS} = \frac{\text{Labor\_Compensation} \times (1 + \log_{10}(1 + \text{GSTD}/10000))}{T}
   $$
   Higher GSTD increases task attractiveness to devices.

**GSTD Does NOT Provide**:
- ❌ Profit rights
- ❌ Revenue sharing
- ❌ Dividends or interest
- ❌ Staking rewards
- ❌ Appreciation guarantees
- ❌ Governance voting

**GSTD Provides**:
- ✅ Computational certainty regulation
- ✅ Verification depth control
- ✅ Task priority influence
- ✅ Network reliability signaling

### 4.3 Error-as-a-Resource (Entropy Model)

**Purpose**: Transform computational errors into valuable network intelligence.

**Entropy Calculation**:
$$
\text{entropy\_score} = \frac{\text{collision\_count}}{\text{total\_executions}}
$$

**Entropy Updates**:
- **Consensus** (no collision): `collision_count` unchanged, `total_executions++`
- **Collision** (result mismatch): `collision_count++`, `total_executions++`

**Network Protection**:
1. **Collusion Resistance**: High entropy for an operation triggers increased redundancy, making collusion expensive.
2. **Adaptive Redundancy**: $R_d$ increases with entropy, ensuring unreliable operations get more verification.
3. **Spot Checks**: 5% of low-redundancy tasks are randomly selected for additional verification, preventing "AQL Over-optimization Death Spiral."

**Spot Check Formula**:
$$
\text{is\_spot\_check} = \begin{cases}
\text{true} & \text{if } R_d = 1 \text{ and } \text{random()} < 0.05 \\
\text{false} & \text{otherwise}
\end{cases}
$$

### 4.4 Economic Safety Mechanisms

**Min Reward Floor**:
Tasks must meet minimum labor compensation to prevent "Energy Drain" attacks (micro-tasks that cost more to execute than reward).

**GSTD Gravity Capping**:
$$
\text{GSTD\_Capped} = \min(\text{GSTD\_Balance}, 1000000)
$$
Prevents unlimited influence from whale accounts.

**Trust Decay**:
$$
\text{Trust}(t) = \text{Trust}(t_0) \times e^{-\lambda \Delta t}
$$
Prevents devices from "resting on laurels" and encourages consistent participation.

**Cold-Start Protection**:
For operations with < 1000 executions:
$$
R_d = 3
$$
Ensures new operation types get sufficient verification.

### 4.5 Encryption (AES-256-GCM)

**Purpose**: End-to-end encryption of task data and results.

**Key Derivation**:
$$
\text{key} = \text{SHA-256}(\text{taskID} + \text{requesterAddress})
$$

**Encryption Process**:
1. Generate random 12-byte nonce
2. Encrypt plaintext using AES-256-GCM
3. Store: `encrypted_data` (base64), `nonce` (base64)

**Decryption Process**:
1. Decode `encrypted_data` and `nonce` from base64
2. Derive key from taskID + requesterAddress
3. Decrypt using AES-256-GCM

**Security Properties**:
- ✅ Authenticated encryption (GCM mode)
- ✅ Nonce reuse protection
- ✅ Task-specific keys (no cross-task leakage)

---

## 5. Regulatory Compliance Framework

### 5.1 Terminology Transition

**From Financial Terms → Technical Terms**:

| Old Term | New Term | Rationale |
|----------|----------|-----------|
| Reward | Labor Compensation | Reflects payment for computational work |
| Investment | Utility Token | GSTD is a technical parameter, not an investment |
| Staking | GSTD Balance | No staking mechanism, only balance-based utility |
| ROI | Efficiency | Measures computational efficiency, not financial return |
| Yield | Certainty Gravity | Describes computational certainty, not financial yield |

### 5.2 MiCA Classification (EU)

**GSTD qualifies as a Utility Token under EU MiCA**:

- **Article 3(1)(5)**: Digital access to a service (distributed computing)
- **No investment expectation**: GSTD does not provide profit rights
- **No linkage to issuer performance**: GSTD utility is network-driven, not issuer-driven

**GSTD does NOT meet criteria for**:
- ❌ Asset-Referenced Token (ART)
- ❌ E-Money Token (EMT)

### 5.3 SEC / Howey Test Analysis (US)

| Howey Element | GSTD Status | Justification |
|---------------|-------------|---------------|
| **Investment of money** | ❌ Not required | GSTD is optional; network can function without it |
| **Common enterprise** | ❌ No pooling | No pooling of returns; each task is independent |
| **Expectation of profit** | ❌ Explicitly excluded | GSTD regulates certainty, not financial returns |
| **Efforts of others** | ❌ Utility-based | GSTD utility is self-use (task creation), not passive |

**Conclusion**: GSTD does **not** constitute a security under US law.

### 5.4 Regulatory Statement

**GSTD Protocol Regulatory Position**:

1. **GSTD is a Utility Token**: It provides access to computational certainty regulation, not financial returns.

2. **No Financial Services**: GSTD Protocol does not provide:
   - Investment services
   - Payment services (beyond labor compensation)
   - Custodial services (pull-model payments)

3. **Labor Compensation Model**: Payments to executors are compensation for computational work, not investment returns.

4. **Transparency**: All network parameters (entropy, temperature, trust scores) are publicly queryable.

5. **Compliance**: The protocol is designed to meet MiCA (EU) and SEC (US) utility token definitions.

---

## 6. API Reference

### 6.1 Requester Endpoints

#### 6.1.1 Create Task
**Endpoint**: `POST /api/v1/tasks`

**Request**:
```json
{
  "requester_address": "0:...",
  "task_type": "inference",
  "operation": "image_classification",
  "model": "https://.../model.wasm",
  "input_source": "ipfs://...",
  "input_hash": "sha256:...",
  "time_limit_sec": 30,
  "max_energy_mwh": 10,
  "labor_compensation_ton": 0.5,
  "validation_method": "majority",
  "min_trust": 0.7,
  "is_private": false
}
```

**Response**:
```json
{
  "task_id": "...",
  "status": "awaiting_escrow",
  "certainty_gravity_score": 45.2,
  "redundancy_factor": 2,
  "confidence_depth": 3
}
```

#### 6.1.2 Get Tasks
**Endpoint**: `GET /api/v1/tasks?requester=<address>`

**Response**:
```json
{
  "tasks": [
    {
      "task_id": "...",
      "status": "validated",
      "labor_compensation_ton": 0.5,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### 6.1.3 Get Task Result
**Endpoint**: `GET /api/v1/tasks/:id/result?requester_address=<address>`

**Response**:
```json
{
  "result": {
    "output": "...",
    "confidence": 0.95
  }
}
```

### 6.2 Executor Endpoints

#### 6.2.1 Register Device
**Endpoint**: `POST /api/v1/devices/register`

**Request**:
```json
{
  "device_id": "...",
  "wallet_address": "0:...",
  "device_type": "browser"
}
```

#### 6.2.2 Get Available Tasks
**Endpoint**: `GET /api/v1/device/tasks/available?device_id=<id>`

**Response**:
```json
{
  "tasks": [
    {
      "task_id": "...",
      "operation": "image_classification",
      "labor_compensation_ton": 0.5,
      "min_trust_score": 0.7
    }
  ]
}
```

#### 6.2.3 Claim Task
**Endpoint**: `POST /api/v1/device/tasks/:id/claim`

**Request**:
```json
{
  "device_id": "..."
}
```

**Response**:
```json
{
  "message": "Task claimed successfully"
}
```

#### 6.2.4 Submit Result
**Endpoint**: `POST /api/v1/device/tasks/:id/result`

**Request**:
```json
{
  "device_id": "...",
  "result": "<encrypted_base64>",
  "proof": "<ed25519_signature_hex>",
  "execution_time_ms": 1234
}
```

**Response**:
```json
{
  "message": "Result submitted successfully"
}
```

#### 6.2.5 Get Payout Intent
**Endpoint**: `POST /api/v1/payments/payout-intent`

**Request**:
```json
{
  "task_id": "...",
  "executor_address": "0:..."
}
```

**Response**:
```json
{
  "to_address": "<escrow_contract_address>",
  "amount_nano": 0,
  "payload_comment": "WITHDRAW|task:...|exec:...|fee:...|reward:...",
  "executor_reward_ton": 0.45,
  "platform_fee_ton": 0.05,
  "task_id": "...",
  "executor_address": "0:..."
}
```

### 6.3 Network Endpoints

#### 6.3.1 Get Network Entropy
**Endpoint**: `GET /api/v1/network/entropy`

**Response**:
```json
{
  "message": "Entropy monitoring active"
}
```

#### 6.3.2 Get Global Stats
**Endpoint**: `GET /api/v1/stats`

**Response**:
```json
{
  "total_tasks": 1000,
  "completed_tasks": 950,
  "pending_tasks": 50,
  "active_devices": 100,
  "network_temperature": 0.15,
  "computational_pressure": 0.5
}
```

#### 6.3.3 Get GSTD Balance
**Endpoint**: `GET /api/v1/wallet/gstd-balance?address=<address>`

**Response**:
```json
{
  "balance": 1000.5,
  "has_gstd": true
}
```

### 6.4 WebSocket Endpoint

#### 6.4.1 WebSocket Connection
**Endpoint**: `GET /ws?device_id=<id>`

**Message Types**:
- **Task Notification**:
  ```json
  {
    "type": "task_notification",
    "task": {
      "task_id": "...",
      "operation": "...",
      "labor_compensation_ton": 0.5
    },
    "timestamp": "2024-01-01T00:00:00Z"
  }
  ```

- **Claim Task** (Client → Server):
  ```json
  {
    "type": "claim_task",
    "task_id": "..."
  }
  ```

- **Task Claimed** (Server → Client):
  ```json
  {
    "type": "task_claimed",
    "task_id": "..."
  }
  ```

- **Heartbeat** (Client ↔ Server):
  ```json
  {
    "type": "heartbeat"
  }
  ```

---

## 7. Appendices

### 7.1 Formula Reference

**Economic Gravity Score (EGS v3)**:
$$
\text{EGS} = \frac{V_{\text{TON}} \times (1 + \log_{10}(1 + G/K))}{T}
$$

Where:
- $V_{\text{TON}}$ = Labor compensation in TON
- $G$ = GSTD balance (capped at 1,000,000)
- $K$ = 10,000 (normalization constant)
- $T$ = Network Temperature

**Trust Score**:
$$
\text{Trust} = 0.6 \times A + 0.2 \times L + 0.2 \times S
$$

**Trust Decay**:
$$
\text{Trust}(t) = \text{Trust}(t_0) \times e^{-\lambda \Delta t}
$$

Where $\lambda = 0.00001$.

**Dynamic Redundancy**:
$$
R_d = \lceil 1 + E \times (1 - \bar{T}) \rceil
$$

Where:
- $E$ = Operation entropy
- $\bar{T}$ = Average device trust score

**Confidence Depth**:
$$
C_d = \lfloor 1 + \log_{10}(1 + G/10000) \rfloor
$$

### 7.2 Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DecayLambda` | 0.00001 | Trust decay coefficient |
| `AlphaTrust` | 0.1 | Trust learning rate |
| `GSTD_K` | 10,000 | GSTD normalization constant |
| `GSTD_CAP` | 1,000,000 | Maximum GSTD influence |
| `MinRewardFloor` | 0.01 TON | Minimum labor compensation |
| `SpotCheckProbability` | 0.05 | Probability of spot check for $R_d=1$ |
| `ColdStartThreshold` | 1000 | Executions before normal redundancy |

### 7.3 Status Codes

| Status | Description |
|--------|-------------|
| `awaiting_escrow` | Task created, waiting for TON escrow |
| `pending` | Task available for execution |
| `assigned` | Task assigned to device |
| `validating` | Result submitted, validation in progress |
| `validated` | Result validated, payout available |
| `completed` | Payout executed, task finalized |
| `failed` | Task failed (timeout, validation failure) |
| `expired` | Task expired (timeout) |

### 7.4 Error Codes

| Code | Description |
|------|-------------|
| `TASK_NOT_FOUND` | Task ID does not exist |
| `TASK_NOT_ASSIGNED` | Task not assigned to this device |
| `INVALID_SIGNATURE` | Ed25519 signature verification failed |
| `INSUFFICIENT_TRUST` | Device trust score below minimum |
| `TASK_ALREADY_CLAIMED` | Task already assigned to another device |
| `VALIDATION_FAILED` | Result validation failed |
| `INSUFFICIENT_BALANCE` | Escrow contract has insufficient balance |

---

## Document Information

**Version**: 1.0  
**Status**: Production Alpha  
**Last Updated**: 2024  
**Maintainer**: GSTD Protocol Team

**License**: This specification is provided for informational purposes. Implementation details may vary.

**Contact**: For technical questions, refer to the codebase at `/home/ubuntu/backend` and `/home/ubuntu/frontend`.

---

**End of Specification**

