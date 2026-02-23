# Sovereign Organism — Unified Autonomous Financial System

## Overview

The GSTD platform operates as a **single autonomous organism** that unifies financial monitoring, task orchestration, monetization, and economic stabilization.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SOVEREIGN ORGANISM (Brain)                                │
│  - Health Score (activity + alpha + task throughput)                         │
│  - Decisions: STIMULATE | ACCELERATE | BUYBACK | STABLE | LEARN               │
│  - Observability: LastDecision, LastDecisionAt, TasksPending, TasksCompleted │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ reads
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FINANCIAL MONITOR (Sensors)                              │
│  - Global TPS, TVL, AI Alpha Score                                           │
│  - Revenue24h, GoldReserve, ProtocolFund (from MonetizationMetrics)          │
│  - Real events: transaction_history (tx_id), token_burns                      │
│  - When Alpha>0.98: creates swarm analysis task via TaskOrchestrator         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ enqueues tasks
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TASK ORCHESTRATOR (Execution)                            │
│  - Redis priority queue (task_queue:pending)                                 │
│  - Load balancing, worker capacity, PoW                                      │
│  - Receives: stimulus tasks (Organism), swarm analysis (Monitor)             │
│  - Stats: pending, assigned, completed → fed to Organism Health              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ revenue
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MONETIZATION METRICS (Revenue)                           │
│  - platform_funds: protocol_fund, dev_fund, gold_reserve                    │
│  - revenue: escrow fees, skill purchases, settlement, inference              │
│  - Single source for Organism + Monitor + API                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/monitor/unified` | **Unified** — organism + flows + monetization + neural in one response |
| `GET /api/v1/monitor/flows` | Financial flows (events, TPS, TVL, alpha) |
| `GET /api/v1/monitor/neural` | Neural analysis + **real** alpha_score |
| `GET /api/v1/monitor/organism-state` | Organism state (health, decisions, revenue) |
| `GET /api/v1/monitor/revenue` | Monetization metrics (full breakdown) |

## Organism Decisions

| Condition | Decision | Action |
|-----------|----------|--------|
| Health < 0.5 | STIMULATE | DynamicEquilibrium.RunAntiPriceBarrier + EnqueueTask(swarm_optimization) |
| Health > 0.8 | ACCELERATE | Treasury.ProcessGoldReserves |
| GSTD Price < $0.01 | BUYBACK | BurnService.RecordBurn (emergency) |
| Every 5 min | LEARN | agent_knowledge insert (homeostasis report) |
| Else | STABLE | No action |

## Health Score Formula

```
activity = min(1, TPS/1000) + task_throughput_boost
alpha = AIAlphaScore (from monitor)
HealthScore = activity * 0.4 + alpha * 0.6
```

## Database Schema

- **transaction_history**: `tx_id` (not transaction_id) — per v26
- **token_burns**: `transaction_id`, `burn_amount` — per 002
- **global_organism_state**: id=1, health_score, omni_tvl, global_tflops
- **agent_knowledge**: tags as TEXT[] — use pq.Array for inserts

## Fixes Applied

1. **transaction_history**: FinancialMonitor queries `tx_id` (was transaction_id)
2. **getNeuralFinancialAnalysis**: Returns real `alpha_score` from monitor data
3. **agent_knowledge**: tags insert uses `pq.Array()`
4. **GlobalFinancialFlows**: GetMonitorData returns `GlobalFinancialFlowsSnapshot` (no mutex copy)
5. **Organism observability**: LastDecision, LastDecisionAt, TasksPending, TasksCompleted
6. **Task feedback**: Organism reads GetQueueStats for Health Score
7. **Unified API**: Single `/monitor/unified` endpoint for frontend

## Frontend

Monitor page uses `/monitor/unified` as primary; falls back to individual endpoints if unified fails.
Polling interval: 3 seconds.
