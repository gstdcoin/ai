import "@stdlib/deploy";
import "@stdlib/ownable";

message(0x4a25ce37) Deposit {}

message DepositRevenue {
    epoch: Int as uint64;
}

message DistributeYield {
    epoch: Int as uint64;
}

message UpdateAddresses {
    backingVault: Address;
    treasuryMultisig: Address;
    yieldDistributor: Address;
}

contract SovereignFund with Deployable, Ownable {
    owner: Address;
    
    backingVault: Address;
    treasuryMultisig: Address;
    yieldDistributor: Address;
    
    totalRevenue: Int as coins;
    backingBalance: Int as coins;
    treasuryBalance: Int as coins;
    yieldBalance: Int as coins;
    
    currentEpoch: Int as uint64;
    circulatingSupply: Int as coins;

    init(owner: Address) {
        self.owner = owner;
        self.backingVault = owner;
        self.treasuryMultisig = owner;
        self.yieldDistributor = owner;
        
        self.totalRevenue = 0;
        self.backingBalance = 0;
        self.treasuryBalance = 0;
        self.yieldBalance = 0;
        self.currentEpoch = 1;
        self.circulatingSupply = ton("1000000"); // Example starting supply
    }

    receive(msg: UpdateAddresses) {
        require(sender() == self.owner, "Only owner can update addresses");
        self.backingVault = msg.backingVault;
        self.treasuryMultisig = msg.treasuryMultisig;
        self.yieldDistributor = msg.yieldDistributor;
    }

    receive(msg: DepositRevenue) {
        let ctx: Context = context();
        let amount: Int = ctx.value;
        
        // Split: 50% Backing, 20% Treasury, 30% Yield Pool
        let backing: Int = amount * 50 / 100;
        let treasury: Int = amount * 20 / 100;
        let yieldPortion: Int = amount - backing - treasury; // Ensure no dust left
        
        self.totalRevenue += amount;
        self.backingBalance += backing;
        self.treasuryBalance += treasury;
        self.yieldBalance += yieldPortion;
        self.currentEpoch = msg.epoch;

        // Forward portions to respective contracts
        send(SendParameters{
            to: self.backingVault,
            value: backing,
            mode: SendIgnoreErrors,
            bounce: false,
            body: Deposit{}.toCell()
        });
        
        send(SendParameters{
            to: self.treasuryMultisig,
            value: treasury,
            mode: SendIgnoreErrors,
            bounce: false,
            body: "Treasury allocation".asComment()
        });

        // Yield is kept here until epoch_distribute
    }

    receive(msg: DistributeYield) {
        require(sender() == self.owner, "Only owner can distribute yield");
        
        let payout: Int = self.yieldBalance;
        require(payout > 0, "No yield to distribute");
        
        self.yieldBalance = 0;
        
        send(SendParameters{
            to: self.yieldDistributor,
            value: payout,
            mode: SendIgnoreErrors,
            bounce: false,
            body: "Epoch Yield Distribution".asComment()
        });
    }

    // --- Getters ---

    get fun backing_balance(): Int {
        return self.backingBalance;
    }

    get fun treasury_balance(): Int {
        return self.treasuryBalance;
    }

    get fun yield_balance(): Int {
        return self.yieldBalance;
    }

    get fun total_revenue(): Int {
        return self.totalRevenue;
    }

    get fun epoch_info(): Int {
        return self.currentEpoch;
    }

    // floor_price = backing / circulating (simplified, needs decimal handling off-chain or scaled)
    get fun floor_price_scaled(): Int {
        if (self.circulatingSupply == 0) {
            return 0;
        }
        return (self.backingBalance * 1000000000) / self.circulatingSupply;
    }
}
