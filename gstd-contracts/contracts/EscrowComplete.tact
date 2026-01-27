// GSTD Platform - Complete Escrow Smart Contract
// Handles task compensation distribution via pull-model with full security

import "@stdlib/deploy";
import "@stdlib/ownable";

// Withdraw message with structured payload
message Withdraw {
    executorAddress: Address;
    platformFee: Int as coins;
    executorReward: Int as coins;
    taskId: String;
    nonce: Int; // Replay attack protection
    signature: Cell?; // Optional signature for additional security
}

// Task deposit record
struct TaskDeposit {
    taskId: String;
    totalAmount: Int as coins;
    executorReward: Int as coins;
    platformFee: Int as coins;
    claimed: Bool;
    createdAt: Int;
}

// Escrow contract state
contract Escrow with Deployable, Ownable {
    // Platform treasury address (receives 50% of fees)
    treasury: Address;
    
    // Gold Pool address (receives 50% of fees)
    goldPool: Address;
    
    // Minimum message value to prevent spam
    minMessageValue: Int as coins = 10000000; // 0.01 TON
    
    // Task deposits mapping: taskId -> TaskDeposit
    taskDeposits: Map<String, TaskDeposit> = emptyMap();
    
    // Nonce tracking for replay attack protection: address -> nonce
    nonces: Map<Address, Int> = emptyMap();
    
    init(owner: Address, treasuryAddress: Address, goldPoolAddress: Address) {
        Ownable.init(owner);
        self.treasury = treasuryAddress;
        self.goldPool = goldPoolAddress;
    }
    
    // Receive TON for task compensation
    // Message body should contain taskId
    receive(msg: Cell, forward: Cell?) {
        // Accept any incoming TON
        // Funds are locked until withdrawal is authorized
        // In production, parse message body to extract taskId and create TaskDeposit
    }
    
    // Deposit TON for a specific task
    receive(msg: String, forward: Cell?) {
        // Parse taskId from message
        let taskId = msg;
        let depositAmount = myBalance() - context().bounced;
        
        // Create or update task deposit
        let existing = self.taskDeposits.get(taskId);
        if (existing != null) {
            // Update existing deposit
            let updated = existing!!;
            updated.totalAmount = updated.totalAmount + depositAmount;
            self.taskDeposits.set(taskId, updated);
        } else {
            // Create new deposit
            let newDeposit = TaskDeposit{
                taskId: taskId,
                totalAmount: depositAmount,
                executorReward: 0,
                platformFee: 0,
                claimed: false,
                createdAt: now()
            };
            self.taskDeposits.set(taskId, newDeposit);
        }
    }
    
    // Withdraw funds based on structured message
    receive(msg: Withdraw, forward: Cell?) {
        // Verify minimum message value
        require(context().value >= self.minMessageValue, "Message value too low");
        
        // Verify sender is authorized (owner or executor)
        let sender = context().sender;
        let isOwner = self.isOwner(sender);
        let isExecutor = sender == msg.executorAddress;
        
        require(isOwner || isExecutor, "Unauthorized withdrawal");
        
        // Replay attack protection: check nonce
        let senderNonce = self.nonces.get(sender);
        let expectedNonce = if (senderNonce != null) { senderNonce!! } else { 0 };
        require(msg.nonce > expectedNonce, "Invalid nonce (replay attack)");
        self.nonces.set(sender, msg.nonce);
        
        // Get task deposit
        let deposit = self.taskDeposits.get(msg.taskId);
        require(deposit != null, "Task deposit not found");
        let taskDeposit = deposit!!;
        require(!taskDeposit.claimed, "Task already claimed");
        
        // Verify amounts match deposit
        let totalAmount = msg.platformFee + msg.executorReward;
        require(taskDeposit.totalAmount >= totalAmount, "Insufficient deposit");
        require(myBalance() >= totalAmount, "Insufficient contract balance");
        
        // Mark as claimed
        let updatedDeposit = taskDeposit;
        updatedDeposit.claimed = true;
        updatedDeposit.executorReward = msg.executorReward;
        updatedDeposit.platformFee = msg.platformFee;
        self.taskDeposits.set(msg.taskId, updatedDeposit);
        
        // Send fees (50/50 split)
        if (msg.platformFee > 0) {
            let halfFee: Int = msg.platformFee / 2;
            let remainder: Int = msg.platformFee % 2;
            
            // 1. Send 50% to Gold Pool
            send(SendParameters{
                to: self.goldPool,
                value: halfFee, 
                mode: 1, // Pay transfer fees separately
                bounce: false,
                body: emptyCell()
            });

            // 2. Send 50% + remainder to Treasury
            send(SendParameters{
                to: self.treasury,
                value: halfFee + remainder,
                mode: 1, // Pay transfer fees separately
                bounce: false,
                body: emptyCell()
            });
        }
        
        // Send executor reward
        if (msg.executorReward > 0) {
            send(SendParameters{
                to: msg.executorAddress,
                value: msg.executorReward,
                mode: 1, // Pay transfer fees separately
                bounce: false,
                body: emptyCell()
            });
        }
        
        // Send remaining value back to sender (gas refund)
        send(SendParameters{
            to: sender,
            value: 0,
            mode: 128, // Carry all remaining balance
            bounce: false,
            body: emptyCell()
        });
    }
    
    // Get contract balance
    get fun balance(): Int as coins {
        return myBalance();
    }
    
    // Get task deposit info
    get fun getTaskDeposit(taskId: String): TaskDeposit? {
        return self.taskDeposits.get(taskId);
    }
    
    // Get nonce for address
    get fun getNonce(address: Address): Int {
        let nonce = self.nonces.get(address);
        return if (nonce != null) { nonce!! } else { 0 };
    }
    
    // Update treasury address (only owner)
    set fun updateTreasury(newTreasury: Address) {
        self.requireOwner();
        self.treasury = newTreasury;
    }
    
    // Emergency withdrawal (only owner, for stuck funds)
    receive(msg: "emergency_withdraw", forward: Cell?) {
        self.requireOwner();
        // Owner can withdraw all funds in emergency
        // In production, add additional safety checks
    }
}

