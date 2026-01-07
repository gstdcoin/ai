# Genesis Launch Checklist
## How to Join the GSTD Platform Genesis Test

Welcome to the GSTD Platform Genesis Launch! This checklist will guide you through joining the network and contributing to the decentralized computing revolution.

## 📋 Pre-Launch Requirements

- [ ] TON wallet (Tonkeeper, MyTonWallet, or compatible)
- [ ] Some GSTD tokens for testing (if creating tasks)
- [ ] Computing device (PC, server, or cloud instance)
- [ ] Python 3.8+ or Docker installed

## 🚀 Step-by-Step Guide

### Phase 1: Account Setup

1. **Connect Your Wallet**
   - [ ] Visit [app.gstdtoken.com](https://app.gstdtoken.com)
   - [ ] Click "Connect Wallet"
   - [ ] Authorize with your TON wallet
   - [ ] Verify your account was created automatically

2. **Verify Account Creation**
   ```bash
   # Check your user record in database (optional)
   docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
     "SELECT * FROM users WHERE wallet_address='YOUR_WALLET';"
   ```

### Phase 2: Register Your Node

3. **Register Computing Node**
   - [ ] Go to Dashboard → Devices tab
   - [ ] Click "Register Device"
   - [ ] Enter device name (e.g., "Genesis-Node-1")
   - [ ] Optionally add CPU and RAM specs
   - [ ] Click "Register"
   - [ ] **IMPORTANT**: Copy your Node ID from the success message

4. **Verify Node Registration**
   ```bash
   # Check your node in database (optional)
   docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
     "SELECT * FROM nodes WHERE wallet_address='YOUR_WALLET';"
   ```

### Phase 3: Start Your Worker

5. **Install Worker Dependencies**
   ```bash
   pip install -r requirements.txt
   # OR
   pip install requests urllib3
   ```

6. **Run Worker Script**
   ```bash
   python3 worker.py --node_id YOUR_NODE_ID --api https://app.gstdtoken.com/api/v1
   ```

   **OR with Docker:**
   ```bash
   docker run -d --name gstd-worker \
     --restart unless-stopped \
     gstd/worker \
     --node_id=YOUR_NODE_ID \
     --api=https://app.gstdtoken.com/api/v1
   ```

7. **Verify Worker is Running**
   - [ ] Worker displays "🟢 ONLINE" status
   - [ ] Worker shows "Tasks Completed: 0"
   - [ ] No error messages in console

### Phase 4: Create Test Tasks (Optional)

8. **Create Your First Task**
   - [ ] Go to Dashboard
   - [ ] Click "New Task"
   - [ ] Select task type (AI_INFERENCE, DATA_PROCESSING, or COMPUTATION)
   - [ ] Set budget (e.g., 1.0 GSTD)
   - [ ] Add optional payload JSON
   - [ ] Click "Create Task"

9. **Complete Payment**
   - [ ] Follow payment instructions
   - [ ] Send GSTD to platform wallet with payment memo
   - [ ] Wait for payment confirmation (up to 30 seconds)
   - [ ] Task status should change to "queued"

10. **Monitor Task Processing**
    - [ ] Watch your worker pick up the task
    - [ ] Verify task completion in dashboard
    - [ ] Check for confetti effect on completion
    - [ ] Verify reward distribution

### Phase 5: Verification

11. **Check Task Completion**
    ```bash
    docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
      "SELECT task_id, status, budget_gstd, reward_gstd FROM tasks WHERE status='completed' ORDER BY completed_at DESC LIMIT 5;"
    ```

12. **Verify Reward Distribution**
    - [ ] Check worker stats: "Total Rewards" should show 95% of task budget
    - [ ] Verify in database: `reward_gstd` should be ~95% of `budget_gstd`
    - [ ] Check platform fee: `platform_fee_ton` should be ~5% of `budget_gstd`

13. **Check Golden Reserve**
    ```bash
    # View XAUt accumulation
    docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
      "SELECT * FROM golden_reserve_log ORDER BY timestamp DESC LIMIT 10;"
    
    # Check treasury balance
    curl -s https://tonapi.io/v2/blockchain/accounts/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp/jettons
    ```

14. **View Public Stats**
    - [ ] Visit [app.gstdtoken.com/stats](https://app.gstdtoken.com/stats)
    - [ ] Verify your completed tasks are counted
    - [ ] Check Golden Reserve XAUt balance
    - [ ] View XAUt growth chart

### Phase 6: Stress Testing (Advanced)

15. **Run Genesis Test Script**
    ```bash
    python3 scripts/genesis_test.py --api https://app.gstdtoken.com/api/v1 --nodes 5 --tasks 10
    ```

16. **Monitor System Health**
    ```bash
    # Check admin health endpoint
    curl https://app.gstdtoken.com/api/v1/admin/health
    
    # Monitor logs
    docker logs -f gstd_backend | grep -E "Retry|Reward|XAUt"
    ```

17. **Verify Concurrent Processing**
    - [ ] Multiple workers should process tasks simultaneously
    - [ ] No duplicate rewards should be paid
    - [ ] All tasks should complete successfully
    - [ ] Total rewards should equal 95% of total budget

## ✅ Success Criteria

Your Genesis test is successful when:

- [x] Worker connects and stays online
- [x] Tasks are fetched and processed correctly
- [x] Results are submitted successfully
- [x] Rewards are distributed (95% to worker)
- [x] Platform fees are converted to XAUt (5%)
- [x] No duplicate payments or double-spending
- [x] All transactions complete without errors
- [x] Public stats page shows accurate metrics

## 🐛 Troubleshooting

### Worker Issues
- **"Node not found"**: Verify Node ID is correct and node is registered
- **"No pending tasks"**: Normal - tasks are assigned as they become available
- **Network errors**: Check internet connection and API URL

### Task Issues
- **Payment not confirmed**: Wait up to 30 seconds for PaymentWatcher
- **Task stuck in "pending_payment"**: Verify payment was sent with correct memo
- **Task not completing**: Check worker logs for errors

### Reward Issues
- **No rewards received**: Check failed_payouts table for retry status
- **Incorrect reward amount**: Verify task budget and 95/5 split calculation

## 📊 Reporting Issues

If you encounter problems:

1. Check logs: `docker logs gstd_backend`
2. Check database: Verify task and node records
3. Check admin health: `GET /api/v1/admin/health`
4. Report issues with:
   - Node ID
   - Task ID (if applicable)
   - Error messages
   - Timestamp

## 🎉 Welcome to Genesis!

You're now part of the GSTD Platform Genesis Network. Thank you for helping build the future of decentralized computing!

**Let's make DePIN stable. Let's make it golden.**

---

*For support, visit [GitHub Issues](https://github.com/your-repo/issues) or contact the team.*

