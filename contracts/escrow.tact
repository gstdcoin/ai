// GSTD Platform - Escrow Smart Contract
// Handles task compensation distribution via pull-model

import "@stdlib/deploy";
import "@stdlib/ownable";

// Withdraw message with structured payload
message Withdraw {
    executorAddress: Address;
    platformFee: Int as coins;
    executorReward: Int as coins;
    taskId: String;
}

// Escrow contract state
contract Escrow with Deployable, Ownable {
    // Platform treasury address (receives fees)
    treasury: Address;
    
    // Minimum message value to prevent spam
    minMessageValue: Int as coins = 10000000; // 0.01 TON
    
    init(owner: Address, treasuryAddress: Address) {
        Ownable.init(owner);
        self.treasury = treasuryAddress;
    }
    
    // Receive TON for task compensation
    receive(msg: Cell, forward: Cell?) {
        // Accept any incoming TON
        // Funds are locked until withdrawal is authorized
    }
    
    // Withdraw funds based on structured message
    receive(msg: Withdraw, forward: Cell?) {
        // Verify sender is authorized (owner or executor)
        let sender = context().sender;
        let isOwner = self.isOwner(sender);
        let isExecutor = sender == msg.executorAddress;
        
        require(isOwner || isExecutor, "Unauthorized withdrawal");
        
        // Verify contract has sufficient balance
        let totalAmount = msg.platformFee + msg.executorReward;
        require(myBalance() >= totalAmount, "Insufficient balance");
        
        // Send platform fee to treasury
        if (msg.platformFee > 0) {
            send(SendParameters{
                to: self.treasury,
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
    
    // Update treasury address (only owner)
    set fun updateTreasury(newTreasury: Address) {
        self.requireOwner();
        self.treasury = newTreasury;
    }
}

