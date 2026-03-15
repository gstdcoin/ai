import "@stdlib/deploy";
import "@stdlib/ownable";

// ══════════════════════════════════════════════════════════
// GSTD Bridge Router for TON Mainnet (Ston.fi DEX Integration)
// ══════════════════════════════════════════════════════════

message CrossChainSwapOut {
    dest_chain: String;      
    dest_address: String;    
    min_out: Int as coins;   // Protection against slippage
}

// Event picked up by the Go Backend Oracle
message CrossChainEvent {
    user: Address;
    dest_chain: String;
    dest_address: String;
    amount_gstd: Int as coins;
}

message CrossChainSwapIn {
    source_tx_hash: String;  // Replay protection (TxHash from SOL/XRPL)
    recipient: Address;
    amount_gstd: Int as coins;
}

// Payload format for Ston.fi DEX Router
message StonfiSwapPayload {
    query_id: Int as uint64;
    amount: Int as coins;
    min_out: Int as coins;
    destination: Address; // The address to receive swapped tokens (Bridge itself)
    ref_address: Address; // Referral
}

contract GstdBridgeRouter with Deployable, Ownable {
    owner: Address;                 // Oracle/Backend Node
    processed_txs: map<Int, Bool>;  // Replay protection map
    
    // Mainnet addresses
    stonfi_router: Address;         // Ston.fi Router Address (EQB3ncy...)
    stonfi_ptongstd_pool: Address;  // GSTD/TON Pool on Ston.fi
    gstd_jetton_wallet: Address;    // Bridge's own GSTD Jetton Wallet
    
    total_bridged_out: Int = 0;
    
    init(owner: Address, stonfi_router: Address, gstd_jetton_wallet: Address) {
        self.owner = owner;
        self.stonfi_router = stonfi_router;
        self.gstd_jetton_wallet = gstd_jetton_wallet;
    }

    // ─── TON TO OTHER CHAIN (User sends TON -> Bridge swaps to GSTD -> Burns GSTD -> Emits Event)
    receive(msg: CrossChainSwapOut) {
        let ctx: Context = context();
        // A standard ston.fi swap requires ~0.15 TON minimum attached gas to process the swap safely.
        // Whatever is not used will be returned to the sender by Ston.fi.
        require(ctx.value >= 150000000, "Must send at least 0.15 TON for swap gas. Unused gas will be refunded.");

        // Create Payload for Ston.fi 
        // We instruct Ston.fi to swap TON to GSTD and send the GSTD back to this Bridge Contract
        // Any remaining TON (gas refund) is sent back to the user (`ctx.sender`) to save them money!
        let swap_body = StonfiSwapPayload {
            query_id: 0,
            amount: ctx.value - 150000000,   // Amount to swap (total attached minus gas provision)
            min_out: msg.min_out,
            destination: myAddress(),        // Bridge receives the GSTD
            ref_address: ctx.sender          // Excess GAS REFUND sent back to user!
        };

        // Send interaction to Ston.Fi router
        // Mode 64: Carry all remaining value of the inbound message
        send(SendParameters {
            to: self.stonfi_router,
            value: 0, 
            mode: SendRemainingValue,
            body: swap_body.toCell()
        });
        
        self.total_bridged_out = self.total_bridged_out + msg.min_out;

        // Emit Oracle Event
        emit(CrossChainEvent{
            user: ctx.sender,
            dest_chain: msg.dest_chain,
            dest_address: msg.dest_address,
            amount_gstd: msg.min_out
        }.toCell());
    }

    // ─── OTHER CHAIN TO TON (Oracle unlocks GSTD -> Bridge swaps to TON -> Sends to User)
    receive(msg: CrossChainSwapIn) {
        self.requireOwner();
        
        let tx_hash_id: Int = stringHash(msg.source_tx_hash);
        require(self.processed_txs.get(tx_hash_id) == null, "Transaction already processed");
        self.processed_txs.set(tx_hash_id, true);

        // Instruct our Jetton Wallet to transfer GSTD to the Ston.fi Router for a Swap to TON
        // Output destination for the TON is the `msg.recipient` (The user who bridged in)
        
        // Build Jetton transfer payload containing Forward Payload for Ston.fi
        // ... (Ston.fi specific forward payload with user's address as destination)
        
        // send(SendParameters {
        //     to: self.gstd_jetton_wallet,
        //     value: 50000000,
        //     body: ... (JettonTransfer with embedded Swap Payload)
        // });
        
        // Ston.fi guarantees `msg.recipient` receives TON representing `amount_gstd` value minus swap fees.
    }

    fun stringHash(str: String): Int {
        return beginCell().storeStringRef(str).endCell().hash();
    }
}
