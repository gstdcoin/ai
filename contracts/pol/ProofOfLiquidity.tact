import "@stdlib/deploy";
import "@stdlib/ownable";

message LockLP {
    amount: Int as coins;
    wallet: Address;
}

message UnlockLP {
    amount: Int as coins;
}

contract ProofOfLiquidity with Deployable, Ownable {
    owner: Address;
    
    // mapping wallet -> string of LP locked (pseudo mapping using contract state or off-chain for now)
    // Tact has map<Address, Int> support:
    lpBalances: map<Address, Int as coins>;
    minLPAmount: Int as coins;

    init(owner: Address) {
        self.owner = owner;
        self.minLPAmount = ton("100"); // Example 100 TON equivalent LP threshold
    }

    receive(msg: LockLP) {
        let senderAddr: Address = sender();
        
        let current: Int? = self.lpBalances.get(senderAddr);
        let curBalance: Int = current != null ? current!! : 0;
        
        self.lpBalances.set(senderAddr, curBalance + msg.amount);
    }

    receive(msg: UnlockLP) {
        let senderAddr: Address = sender();
        let current: Int? = self.lpBalances.get(senderAddr);
        require(current != null, "No LP locked");
        let curBalance: Int = current!!;
        require(curBalance >= msg.amount, "Insufficient LP locked");
        
        self.lpBalances.set(senderAddr, curBalance - msg.amount);
        
        // Cooldown logic handled off-chain or via a complex time lock
    }

    get fun is_verified(wallet: Address): Bool {
        let val: Int? = self.lpBalances.get(wallet);
        if (val == null) {
            return false;
        }
        return val!! >= self.minLPAmount;
    }

    get fun min_lp_amount(): Int {
        return self.minLPAmount;
    }
}
