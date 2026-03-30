// ============================================================================
// LendingMaster — Gold-Backed Credit Line Protocol on TON
// ============================================================================
// Protocol holds GSTD as collateral. Users borrow USDT (or stable equivalent)
// 
// Architecture: LendingMaster (singleton) → LendingUserVault (per-user child)
// Collateral: GSTD Jetton tokens. Master manages the Jettons.
// ============================================================================

import "@stdlib/deploy";
import "@stdlib/ownable";

// ═══════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════

// Jetton messaging standard
message(0x7362d09c) JettonTransferNotification {
    query_id: Int as uint64;
    amount: Int as coins;
    sender: Address;
    forward_payload: Slice as remaining;
}

message(0xf8a7ea5) JettonTransfer {
    query_id: Int as uint64;
    amount: Int as coins;
    destination: Address;
    response_destination: Address;
    custom_payload: Cell?;
    forward_ton_amount: Int as coins;
    forward_payload: Slice as remaining;
}

// Oracle: Keeper pushes price updates
message UpdateOraclePrice {
    gstdPriceUsd: Int as coins;     // GSTD price in USD × 1e9 (nanotons precision)
    goldPriceUsd: Int as coins;     // Gold oz price in USD × 1e9
    timestamp: Int as uint64;
}

// User actions routed through master
message RequestBorrow {
    amount: Int as coins;           // Desired borrow amount in stablecoin units
}

message RequestRepay {
    amount: Int as coins;
}

message RequestWithdraw {
    amount: Int as coins;           // Collateral amount to withdraw
}

// Keeper/admin actions
message LiquidateVault {
    user: Address;
}

message UpdateLTV {
    maxLtv: Int as uint16;          // basis points (e.g. 7000 = 70%)
    liquidationLtv: Int as uint16;  // basis points (e.g. 8500 = 85%)
}

message UpdateInterestRate {
    annualRateBps: Int as uint16;   // basis points per year (e.g. 800 = 8%)
}

message SetGstdWallet {
    gstdWallet: Address;
}

message UpdateKeeper {
    newKeeper: Address;
}

// Internal messages: Master ↔ UserVault
message InternalBorrow {
    amount: Int as coins;
    gstdPrice: Int as coins;
    maxLtv: Int as uint16;
}

message InternalRepay {
    amount: Int as coins;
}

message InternalWithdraw {
    amount: Int as coins;
    gstdPrice: Int as coins;
    maxLtv: Int as uint16;
}

message InternalLiquidate {
    gstdPrice: Int as coins;
    liquidationLtv: Int as uint16;
    liquidator: Address;
}

message InternalDepositCollateral {
    amount: Int as coins;
}

// UserVault → Master (reports)
message VaultLiquidated {
    user: Address;
    collateralSeized: Int as coins;
    debtCleared: Int as coins;
}

message VaultWithdrawRequested {
    user: Address;
    amount: Int as coins;
}

// ═══════════════════════════════════════════════════════════════
// LENDING MASTER CONTRACT
// ═══════════════════════════════════════════════════════════════

contract LendingMaster with Deployable, Ownable {
    owner: Address;                     // DAO / multisig
    keeper: Address;                    // Backend operator hot wallet
    gstdWallet: Address?;               // Protocol's GSTD Jetton Wallet

    // Oracle state
    gstdPriceUsd: Int as coins;         // last known GSTD price (USD × 1e9)
    goldPriceUsd: Int as coins;         // last known gold price (USD × 1e9)
    oracleTimestamp: Int as uint64;      // when oracle was last updated

    // Protocol parameters
    maxLtvBps: Int as uint16;           // max Loan-to-Value (basis points)
    liquidationLtvBps: Int as uint16;   // liquidation threshold (basis points)
    annualInterestBps: Int as uint16;   // annual interest rate (basis points)

    // Statistics
    totalCollateralLocked: Int as coins;
    totalBorrowed: Int as coins;
    totalVaultsCreated: Int as uint64;
    totalLiquidations: Int as uint64;

    init(owner: Address, keeper: Address) {
        self.owner = owner;
        self.keeper = keeper;
        self.gstdWallet = null;

        // Defaults: GSTD ≈ $0.003 → 3_000_000 nanotons precision
        self.gstdPriceUsd = 3_000_000;
        self.goldPriceUsd = 3_000_000_000_000;  // ~$3000/oz
        self.oracleTimestamp = 0;

        self.maxLtvBps = 7000;           // 70%
        self.liquidationLtvBps = 8500;   // 85%
        self.annualInterestBps = 800;    // 8%

        self.totalCollateralLocked = 0;
        self.totalBorrowed = 0;
        self.totalVaultsCreated = 0;
        self.totalLiquidations = 0;
    }

    // ─── Set GSTD Wallet Address ─────────────────────────────────────────

    receive(msg: SetGstdWallet) {
        require(sender() == self.owner, "Only owner");
        self.gstdWallet = msg.gstdWallet;
    }

    // ─── Collateral Deposit via Jetton Transfer ─────────────────────────

    // When users send GSTD to LendingMaster, we receive this notification
    receive(msg: JettonTransferNotification) {
        let ctx: Context = context();
        require(self.gstdWallet != null, "Not initialized");
        require(ctx.sender == self.gstdWallet!!, "Not GSTD wallet");

        // The original sender of the tokens is the vault owner
        let user: Address = msg.sender;
        let amount: Int = msg.amount;

        self.totalCollateralLocked = self.totalCollateralLocked + amount;

        let init: StateInit = initOf LendingUserVault(myAddress(), user);
        let vault: Address = contractAddress(init);
        
        // Notify the user's specific vault about the deposit
        send(SendParameters{
            to: vault,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: InternalDepositCollateral{
                amount: amount
            }.toCell()
        });
    }

    // ─── Oracle Price Updates (Keeper only) ─────────────────────────────

    receive(msg: UpdateOraclePrice) {
        require(sender() == self.keeper || sender() == self.owner, "Only keeper/owner");
        require(msg.gstdPriceUsd > 0, "Invalid GSTD price");
        require(msg.goldPriceUsd > 0, "Invalid gold price");
        require(msg.timestamp > self.oracleTimestamp, "Stale price update");

        self.gstdPriceUsd = msg.gstdPriceUsd;
        self.goldPriceUsd = msg.goldPriceUsd;
        self.oracleTimestamp = msg.timestamp;
    }

    // ─── User Actions (Routed to User Vault) ────────────────────────────

    receive(msg: RequestBorrow) {
        require(msg.amount > 0, "Amount must be positive");
        let init: StateInit = initOf LendingUserVault(myAddress(), sender());
        let vault: Address = contractAddress(init);
        send(SendParameters{
            to: vault,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: InternalBorrow{
                amount: msg.amount,
                gstdPrice: self.gstdPriceUsd,
                maxLtv: self.maxLtvBps
            }.toCell()
        });
    }

    receive(msg: RequestRepay) {
        require(msg.amount > 0, "Amount must be positive");
        let init: StateInit = initOf LendingUserVault(myAddress(), sender());
        let vault: Address = contractAddress(init);
        send(SendParameters{
            to: vault,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: InternalRepay{ amount: msg.amount }.toCell()
        });
    }

    receive(msg: RequestWithdraw) {
        require(msg.amount > 0, "Amount must be positive");
        let init: StateInit = initOf LendingUserVault(myAddress(), sender());
        let vault: Address = contractAddress(init);
        send(SendParameters{
            to: vault,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: InternalWithdraw{
                amount: msg.amount,
                gstdPrice: self.gstdPriceUsd,
                maxLtv: self.maxLtvBps
            }.toCell()
        });
    }

    // ─── Keeper Actions ─────────────────────────────────────────────────

    receive(msg: LiquidateVault) {
        require(sender() == self.keeper || sender() == self.owner, "Only keeper/owner");
        let init: StateInit = initOf LendingUserVault(myAddress(), msg.user);
        let vault: Address = contractAddress(init);
        send(SendParameters{
            to: vault,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: InternalLiquidate{
                gstdPrice: self.gstdPriceUsd,
                liquidationLtv: self.liquidationLtvBps,
                liquidator: sender()
            }.toCell()
        });
    }

    // ─── Receive reports from UserVaults ─────────────────────────────────

    receive(msg: VaultLiquidated) {
        require(sender() == contractAddress(initOf LendingUserVault(myAddress(), msg.user)), "Only vault");
        self.totalLiquidations = self.totalLiquidations + 1;
        self.totalCollateralLocked = self.totalCollateralLocked - msg.collateralSeized;
        self.totalBorrowed = self.totalBorrowed - msg.debtCleared;
    }

    receive(msg: VaultWithdrawRequested) {
        // The user's vault has approved the withdrawal
        require(sender() == contractAddress(initOf LendingUserVault(myAddress(), msg.user)), "Only vault");
        self.totalCollateralLocked = self.totalCollateralLocked - msg.amount;

        // Send GSTD jettons back to user (empty payload for cheaper gas)
        let payload: Slice = emptySlice();
        send(SendParameters{
            to: self.gstdWallet!!,
            value: ton("0.05"),
            mode: SendIgnoreErrors,
            bounce: false,
            body: JettonTransfer{
                query_id: 0,
                amount: msg.amount,
                destination: msg.user,
                response_destination: msg.user,
                custom_payload: null,
                forward_ton_amount: ton("0.01"),
                forward_payload: payload
            }.toCell()
        });
    }

    // ─── Configuration Updates (Owner/DAO only) ─────────────────────────

    receive(msg: UpdateLTV) {
        require(sender() == self.owner, "Only owner");
        require(msg.maxLtv >= 5000 && msg.maxLtv <= 9000, "LTV 50-90%");
        require(msg.liquidationLtv > msg.maxLtv, "Liq > Max");
        self.maxLtvBps = msg.maxLtv;
        self.liquidationLtvBps = msg.liquidationLtv;
    }

    receive(msg: UpdateKeeper) {
        require(sender() == self.owner, "Only owner");
        self.keeper = msg.newKeeper;
    }

    receive(msg: UpdateInterestRate) {
        require(sender() == self.owner, "Only owner");
        require(msg.annualRateBps >= 100 && msg.annualRateBps <= 5000, "Rate 1-50%");
        self.annualInterestBps = msg.annualRateBps;
    }

    // ─── Helper: Compute User Vault Address ─────────────────────────────

    get fun get_protocol_state(): ProtocolState {
        return ProtocolState{
            gstdPriceUsd: self.gstdPriceUsd,
            goldPriceUsd: self.goldPriceUsd,
            oracleTimestamp: self.oracleTimestamp,
            maxLtvBps: self.maxLtvBps,
            liquidationLtvBps: self.liquidationLtvBps,
            annualInterestBps: self.annualInterestBps,
            totalCollateralLocked: self.totalCollateralLocked,
            totalBorrowed: self.totalBorrowed,
            totalVaultsCreated: self.totalVaultsCreated,
            totalLiquidations: self.totalLiquidations
        };
    }

    get fun get_user_vault(user: Address): Address {
        return contractAddress(initOf LendingUserVault(myAddress(), user));
    }
}

// ═══════════════════════════════════════════════════════════════
// LENDING USER VAULT — Per-User Child Contract
// ═══════════════════════════════════════════════════════════════

contract LendingUserVault {
    master: Address;
    user: Address;

    collateral: Int as coins;       // GSTD deposited
    debt: Int as coins;             // outstanding loan (USDT/stable)
    lastAccrual: Int as uint64;     // timestamp of last interest accrual

    init(master: Address, user: Address) {
        self.master = master;
        self.user = user;
        self.collateral = 0;
        self.debt = 0;
        self.lastAccrual = now();
    }

    // ─── Internal message from Master: Update balance from deposit ──────

    receive(msg: InternalDepositCollateral) {
        require(sender() == self.master, "Only master");
        self.collateral = self.collateral + msg.amount;
    }

    // ─── Internal message from Master: Borrow ───────────────────────────

    receive(msg: InternalBorrow) {
        require(sender() == self.master, "Only master");
        require(self.collateral > 0, "No collateral");

        // Calculate collateral value in USD
        let collateralUsd: Int = self.collateral * msg.gstdPrice / ton("1");
        let maxBorrow: Int = collateralUsd * msg.maxLtv / 10000;
        let newDebt: Int = self.debt + msg.amount;

        require(newDebt <= maxBorrow, "Exceeds max LTV");
        self.debt = newDebt;
    }

    // ─── Internal message from Master: Repay ────────────────────────────

    receive(msg: InternalRepay) {
        require(sender() == self.master, "Only master");
        require(self.debt >= msg.amount, "Overpay");
        self.debt = self.debt - msg.amount;
    }

    // ─── Internal message from Master: Withdraw Collateral ──────────────

    receive(msg: InternalWithdraw) {
        require(sender() == self.master, "Only master");
        require(self.collateral >= msg.amount, "Insufficient collateral");

        let remainingCollateral: Int = self.collateral - msg.amount;

        // If there's debt, check LTV after withdrawal
        if (self.debt > 0) {
            let remainingUsd: Int = remainingCollateral * msg.gstdPrice / ton("1");
            let maxBorrow: Int = remainingUsd * msg.maxLtv / 10000;
            require(self.debt <= maxBorrow, "Would breach LTV");
        }

        self.collateral = remainingCollateral;

        // Request Master to send the GSTD back
        send(SendParameters{
            to: self.master,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: VaultWithdrawRequested{
                user: self.user,
                amount: msg.amount
            }.toCell()
        });
    }

    // ─── Internal message from Master: Liquidate ────────────────────────

    receive(msg: InternalLiquidate) {
        require(sender() == self.master, "Only master");
        require(self.debt > 0, "No debt to liquidate");

        let collateralUsd: Int = self.collateral * msg.gstdPrice / ton("1");
        let currentLtv: Int = self.debt * 10000 / collateralUsd;
        require(currentLtv >= msg.liquidationLtv, "Position is healthy");

        // Seize all collateral, clear debt
        let seized: Int = self.collateral;
        let cleared: Int = self.debt;
        self.collateral = 0;
        self.debt = 0;

        // Report to master
        send(SendParameters{
            to: self.master,
            value: 0,
            mode: SendRemainingValue,
            bounce: false,
            body: VaultLiquidated{
                user: self.user,
                collateralSeized: seized,
                debtCleared: cleared
            }.toCell()
        });
    }

    get fun get_vault_data(): UserVaultData {
        return UserVaultData{
            user: self.user,
            collateral: self.collateral,
            debt: self.debt,
            lastAccrual: self.lastAccrual
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════

struct ProtocolState {
    gstdPriceUsd: Int as coins;
    goldPriceUsd: Int as coins;
    oracleTimestamp: Int as uint64;
    maxLtvBps: Int as uint16;
    liquidationLtvBps: Int as uint16;
    annualInterestBps: Int as uint16;
    totalCollateralLocked: Int as coins;
    totalBorrowed: Int as coins;
    totalVaultsCreated: Int as uint64;
    totalLiquidations: Int as uint64;
}

struct UserVaultData {
    user: Address;
    collateral: Int as coins;
    debt: Int as coins;
    lastAccrual: Int as uint64;
}
