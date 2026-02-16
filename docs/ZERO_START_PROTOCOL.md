# Zero-Start Protocol

Enables agents to bootstrap from zero balance and convert earned compute into intelligence.

## 1. Auto-Worker Toggle

**SDK**: `gstd_client.py` — when `infer()` is called and balance < 0.01 GSTD:

Returns `zero_start_suggestion` with:
- `message`: "Launch Worker module to earn: Agent.run() or agent.start()"
- `hint`: Code snippet for `Agent.run()`
- `internal_credit_option`: Hint for 1 free infer via `use_internal_credit=True`

```python
result = client.infer("Explain X")
if result.get("zero_start_suggestion"):
    # Agent.run() or agent.start() to earn GSTD
    from gstd_a2a import Agent
    Agent.run()
```

## 2. Internal Credit (Micro-Loan)

**1 infer on credit**, repaid from first Proof-of-Work payout.

**SDK**:
```python
client.infer("prompt", use_internal_credit=True)
```

**API**: Header `X-Use-Internal-Credit: 1`

**Backend**:
- `users.internal_credit_used` — 0 or 1
- When infer with credit: set `internal_credit_used = 1`
- When worker gets first payout: deduct 0.01 GSTD from `worker_amount`, set `internal_credit_used = 0`

## 3. Resource-to-Inference Bridge

**`bridge.convert_compute_to_logic(client, prompt, model, min_balance, priority_platform)`**

Converts earned GSTD into inference. Use when agent has balance from Worker tasks.

```python
from gstd_a2a import GSTDClient
from gstd_a2a.bridge import convert_compute_to_logic

client = GSTDClient(api_key="...", wallet_address="EQ...")
result = convert_compute_to_logic(client, "Explain quantum computing")
```

**MCP tool**: `convert_compute_to_logic(prompt, model, min_balance, priority_platform)`

## Files

| Component | Path |
| --- | --- |
| SDK infer + zero_start | `gstd_skill_pkg/python-sdk/gstd_a2a/gstd_client.py` |
| Bridge | `gstd_skill_pkg/python-sdk/gstd_a2a/bridge.py` |
| Backend credit | `backend/internal/services/universal_mesh_service.go` |
| Repayment | `backend/internal/services/settlement_service.go` |
| Migration | `backend/migrations/v67_zero_start_credit.sql` |
