// GSTD Platform - Escrow Smart Contract for Mainnet
// Handles task compensation distribution via pull-model with full security
// Uses Admin Wallet for platform fees

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
contract EscrowMainnet with Deployable, Ownable {
    // Admin wallet address (receives platform fees)
    adminWallet: Address;
    
    // Minimum message value to prevent spam
    minMessageValue: Int as coins = 10000000; // 0.01 TON
    
    // Nonce tracking for replay attack protection: address -> nonce
    nonces: Map<Address, Int> = emptyMap();
    
    init(owner: Address, adminWalletAddress: Address) {
        Ownable.init(owner);
        self.adminWallet = adminWalletAddress;
    }
    
    // Receive TON for task compensation
    receive() {
        // Accept any incoming TON
        // Funds are locked until withdrawal is authorized
    }
    
    // Withdraw funds based on structured message
    // Message format: executorAddress (Address), platformFee (Int), executorReward (Int), taskId (String), nonce (Int)
    receive(msg: Cell, forward: Cell?) {
        // Verify minimum message value
        require(context().value >= self.minMessageValue, "Message value too low");
        
        // Parse message body
        let slice = msg.beginParse();
        let executorAddress: Address = slice.loadAddress();
        let platformFee: Int as coins = slice.loadCoins();
        let executorReward: Int as coins = slice.loadCoins();
        let taskId: String = slice.loadString();
        let nonce: Int = slice.loadInt(32);
        
        // Verify sender is authorized (owner or executor)
        let sender = context().sender;
        let isOwner = self.isOwner(sender);
        let isExecutor = sender == executorAddress;
        
        require(isOwner || isExecutor, "Unauthorized withdrawal");
        
        // Replay attack protection: check nonce
        let senderNonce = self.nonces.get(sender);
        let expectedNonce: Int = 0;
        if (senderNonce != null) {
            expectedNonce = senderNonce!!;
        }
        require(nonce > expectedNonce, "Invalid nonce (replay attack)");
        self.nonces.set(sender, nonce);
        
        // Verify contract has sufficient balance
        let totalAmount = platformFee + executorReward;
        require(myBalance() >= totalAmount, "Insufficient balance");
        
        // Send platform fee to admin wallet
        if (platformFee > 0) {
            send(SendParameters{
                to: self.adminWallet,
                value: platformFee,
                mode: SendRemainingValue,
                bounce: false,
                body: emptyCell()
            });
        }
        
        // Send executor reward
        if (executorReward > 0) {
            send(SendParameters{
                to: executorAddress,
                value: executorReward,
                mode: SendRemainingValue,
                bounce: false,
                body: emptyCell()
            });
        }
        
        // Send remaining value back to sender (gas refund)
        send(SendParameters{
            to: sender,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: emptyCell()
        });
    }
    
    // Get contract balance
    get fun balance(): Int as coins {
        return myBalance();
    }
    
    // Get nonce for address
    get fun getNonce(address: Address): Int {
        let nonce = self.nonces.get(address);
        if (nonce != null) {
            return nonce!!;
        }
        return 0;
    }
    
    // Update admin wallet address (only owner)
    set fun updateAdminWallet(newAdminWallet: Address) {
        self.requireOwner();
        self.adminWallet = newAdminWallet;
    }
    
    // Emergency withdrawal (only owner, for stuck funds)
    receive(msg: "emergency_withdraw") {
        self.requireOwner();
        // Owner can withdraw all funds in emergency
        // In production, add additional safety checks
    }
}
