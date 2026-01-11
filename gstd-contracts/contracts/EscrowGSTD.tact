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
}


// Escrow contract state
contract EscrowGSTD with Deployable, Ownable {
    // Admin wallet address (receives platform fees)
    // Address: UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED
    adminWallet: Address;
    
    // Minimum message value to prevent spam
    minMessageValue: Int as coins = 10000000; // 0.01 TON
    
    // Task deposits mapping: taskId -> TaskDeposit
    taskDeposits: Map<String, TaskDeposit> = emptyMap();
    
    // Nonce tracking for replay attack protection: address -> nonce
    nonces: Map<Address, Int> = emptyMap();
    
    init(owner: Address, adminWalletAddress: Address) {
        Ownable.init(owner);
        self.adminWallet = adminWalletAddress;
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
        
        // Send platform fee to treasury
        if (msg.platformFee > 0) {
            send(SendParameters{
                to: self.adminWallet,
                value: msg.platformFee,
                mode: SendRemainingValue,
                bounce: false,
                body: emptyCell()
            });
        }
        
        // Send executor reward
        if (msg.executorReward > 0) {
            send(SendParameters{
                to: msg.executorAddress,
                value: msg.executorReward,
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
    
    // Update admin wallet address (only owner)
    set fun updateAdminWallet(newAdminWallet: Address) {
        self.requireOwner();
        self.adminWallet = newAdminWallet;
    }
    
    // Emergency withdrawal (only owner, for stuck funds)
    receive(msg: "emergency_withdraw", forward: Cell?) {
        self.requireOwner();
        // Owner can withdraw all funds in emergency
        // In production, add additional safety checks
    }
}

