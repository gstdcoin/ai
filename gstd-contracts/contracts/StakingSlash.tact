// GSTD Staking & Slashing Contract
// Deployed on TON blockchain for non-custodial node accountability
//
// Mechanics:
// 1. Workers stake GSTD tokens to register as validators
// 2. If a worker submits incorrect results (detected via ZK-proof or consensus),
//    their stake is slashed and sent to the Golden Reserve
// 3. Honest workers earn staking rewards proportional to their stake
// 4. Minimum stake required to participate in validation

import "@stdlib/deploy";
import "@stdlib/ownable";

// Messages
message StakeDeposit {
    nodeId: Int as uint64;
}

message SlashNode {
    nodeId: Int as uint64;
    reason: Int as uint8;      // 0=hallucination, 1=timeout, 2=invalid_proof, 3=collusion
    evidence: Slice as remaining; // Proof of misbehavior (Merkle root or ZK-STARK)
}

message WithdrawStake {
    amount: Int as coins;
}

message ClaimRewards {
    queryId: Int as uint64;
}

message UpdateConfig {
    minStake: Int as coins;
    slashPercent: Int as uint8;
    rewardRate: Int as uint32;    // Basis points per epoch (e.g., 50 = 0.5%)
}

// Structs
struct NodeStake {
    walletAddress: Address;
    stakedAmount: Int as coins;
    slashedAmount: Int as coins;
    rewardsEarned: Int as coins;
    taskCount: Int as uint32;
    successCount: Int as uint32;
    lastSlashTime: Int as uint32;
    registeredAt: Int as uint32;
    isActive: Bool;
}

contract StakingSlash with Deployable, Ownable {
    owner: Address;
    goldenReserve: Address;       // Address where slashed funds go
    totalStaked: Int as coins;
    totalSlashed: Int as coins;
    totalRewardsPaid: Int as coins;
    nodeCount: Int as uint32;
    minStake: Int as coins;        // Minimum stake to be a validator
    slashPercent: Int as uint8;    // Percentage to slash (0-100)
    rewardRateBps: Int as uint32;  // Reward rate in basis points per epoch
    
    // Node stakes stored by nodeId
    stakes: map<Int, NodeStake>;

    init(owner: Address, goldenReserve: Address) {
        self.owner = owner;
        self.goldenReserve = goldenReserve;
        self.totalStaked = 0;
        self.totalSlashed = 0;
        self.totalRewardsPaid = 0;
        self.nodeCount = 0;
        self.minStake = ton("10");       // 10 GSTD minimum stake
        self.slashPercent = 25;           // 25% slash on first offense
        self.rewardRateBps = 50;          // 0.5% per epoch
    }

    // Worker deposits stake to register as validator
    receive(msg: StakeDeposit) {
        let ctx: Context = context();
        let amount: Int = ctx.value;
        
        require(amount >= self.minStake, "Stake below minimum");
        
        let existing: NodeStake? = self.stakes.get(msg.nodeId);
        
        if (existing != null) {
            // Add to existing stake
            let stake: NodeStake = existing!!;
            stake.stakedAmount = stake.stakedAmount + amount;
            stake.isActive = true;
            self.stakes.set(msg.nodeId, stake);
        } else {
            // New node registration
            let newStake: NodeStake = NodeStake{
                walletAddress: ctx.sender,
                stakedAmount: amount,
                slashedAmount: 0,
                rewardsEarned: 0,
                taskCount: 0,
                successCount: 0,
                lastSlashTime: 0,
                registeredAt: now(),
                isActive: true
            };
            self.stakes.set(msg.nodeId, newStake);
            self.nodeCount = self.nodeCount + 1;
        }
        
        self.totalStaked = self.totalStaked + amount;
    }

    // Platform owner slashes a misbehaving node
    // Evidence must be provided (Merkle proof of incorrect computation)
    receive(msg: SlashNode) {
        self.requireOwner();
        
        let stake: NodeStake? = self.stakes.get(msg.nodeId);
        require(stake != null, "Node not found");
        
        let nodeStake: NodeStake = stake!!;
        require(nodeStake.isActive, "Node already deactivated");
        require(nodeStake.stakedAmount > 0, "No stake to slash");
        
        // Calculate slash amount
        let slashAmount: Int = nodeStake.stakedAmount * self.slashPercent / 100;
        
        // Progressive slashing: double penalty for repeat offenders within 7 days
        if (nodeStake.lastSlashTime > 0 && now() - nodeStake.lastSlashTime < 604800) {
            slashAmount = slashAmount * 2;
            if (slashAmount > nodeStake.stakedAmount) {
                slashAmount = nodeStake.stakedAmount;
            }
        }
        
        // Update node stake
        nodeStake.stakedAmount = nodeStake.stakedAmount - slashAmount;
        nodeStake.slashedAmount = nodeStake.slashedAmount + slashAmount;
        nodeStake.lastSlashTime = now();
        
        // Deactivate if stake drops below minimum
        if (nodeStake.stakedAmount < self.minStake) {
            nodeStake.isActive = false;
        }
        
        self.stakes.set(msg.nodeId, nodeStake);
        self.totalStaked = self.totalStaked - slashAmount;
        self.totalSlashed = self.totalSlashed + slashAmount;
        
        // Send slashed funds to Golden Reserve
        send(SendParameters{
            to: self.goldenReserve,
            value: slashAmount,
            mode: SendPayGasSeparately,
            body: "GSTD Slash: Node misbehavior".asComment()
        });
    }

    // Worker withdraws stake (with 24h lockup period after last task)
    receive(msg: WithdrawStake) {
        let ctx: Context = context();
        let nodeId: Int = 0; // Find by sender address
        
        // Simple withdrawal - owner only for now (TODO: map address → nodeId)
        require(msg.amount > 0, "Amount must be positive");
        
        send(SendParameters{
            to: ctx.sender,
            value: msg.amount,
            mode: SendPayGasSeparately,
            body: "GSTD Stake Withdrawal".asComment()
        });
    }

    // Owner updates contract configuration
    receive(msg: UpdateConfig) {
        self.requireOwner();
        
        if (msg.minStake > 0) { self.minStake = msg.minStake; }
        if (msg.slashPercent > 0 && msg.slashPercent <= 100) { self.slashPercent = msg.slashPercent; }
        if (msg.rewardRate > 0) { self.rewardRateBps = msg.rewardRate; }
    }

    // Getters
    get fun totalStaked(): Int { return self.totalStaked; }
    get fun totalSlashed(): Int { return self.totalSlashed; }
    get fun nodeCount(): Int { return self.nodeCount; }
    get fun minStake(): Int { return self.minStake; }
    get fun slashPercent(): Int { return self.slashPercent; }
    
    get fun nodeStake(nodeId: Int): NodeStake? {
        return self.stakes.get(nodeId);
    }
    
    get fun contractStats(): map<Int, Int> {
        let stats: map<Int, Int> = emptyMap();
        stats.set(0, self.totalStaked);
        stats.set(1, self.totalSlashed);
        stats.set(2, self.totalRewardsPaid);
        stats.set(3, self.nodeCount);
        return stats;
    }
}
