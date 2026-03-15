use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("GstdBridgeRouter11111111111111111111111111111");

// ══════════════════════════════════════════════════════════
// GSTD Bridge Router for Solana (Raydium DEX Integration)
// ══════════════════════════════════════════════════════════

#[program]
pub mod gstd_bridge_router {
    use super::*;

    /// STEP 1: USER STARTS A BRIDGE SWAP (SOL -> GSTD -> DEST CHAIN)
    pub fn cross_chain_swap_out(
        ctx: Context<CrossChainSwapOut>,
        dest_chain: String,
        dest_address: String,
        amount_in: u64,
    ) -> Result<()> {
        msg!("Initiating cross-chain swap from Solana");

        // 1. Swap SOL or Native SPL to GSTD utilizing Raydium CPI
        // CPI (Cross-Program Invocation) to Raydium Swap Instruction would go here.
        // let cpi_program = ctx.accounts.raydium_program.to_account_info();
        // let cpi_accounts = SwapInstruction { ... };
        // token::swap(CpiContext::new(cpi_program, cpi_accounts), amount_in)?;

        // 2. Lock or burn the resulting GSTD
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_gstd_account.to_account_info(),
            to: ctx.accounts.vault_gstd_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        // Simulating the GSTD lock
        token::transfer(cpi_ctx, amount_in)?;

        // 3. Emit the event for the Go Backend Oracle to pick up
        emit!(CrossChainEvent {
            user: ctx.accounts.user.key(),
            dest_chain,
            dest_address,
            amount_gstd: amount_in,
        });

        Ok(())
    }

    /// STEP 2: ORACLE RELEASES FUNDS ON SOLANA (DEST CHAIN -> GSTD -> SOL)
    pub fn cross_chain_swap_in(
        ctx: Context<CrossChainSwapIn>,
        source_chain: String,
        source_tx_hash: [u8; 32],
        amount_gstd: u64,
    ) -> Result<()> {
        // Ensure only the Bridge Oracle (Backend Node) can trigger this
        require!(ctx.accounts.oracle.key() == ctx.accounts.bridge_state.oracle_key, ErrorCode::Unauthorized);

        // Check for replay attacks using the PDA seeded by tx_hash
        // ctx.accounts.processed_tx implicitly handles replay prevention 
        // because Anchor prevents creating an account that already exists.

        // 1. Release GSTD from Vault (or mint it)
        let seeds = &["vault".as_bytes(), &[*ctx.bumps.get("vault_gstd_account").unwrap()]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_gstd_account.to_account_info(),
            to: ctx.accounts.recipient_gstd_account.to_account_info(), // Assuming user wants GSTD directly for now
            authority: ctx.accounts.vault_gstd_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token::transfer(cpi_ctx, amount_gstd)?;

        // 2. In a full implementation, CPI to Raydium to swap this 
        // GSTD automatically back into SOL for the recipient.

        msg!("Cross-chain swap fulfilled on Solana for tx: {:?}", source_tx_hash);
        Ok(())
    }
}

// ─── Accounts Contexts ───

#[derive(Accounts)]
pub struct CrossChainSwapOut<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub user_gstd_account: Account<'info, TokenAccount>,
    
    #[account(
        mut, 
        seeds = [b"vault"], 
        bump
    )]
    pub vault_gstd_account: Account<'info, TokenAccount>,
    
    // Raydium program and pool accounts would be added here
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(source_chain: String, source_tx_hash: [u8; 32])]
pub struct CrossChainSwapIn<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,
    
    #[account(
        init, 
        payer = oracle, 
        space = 8 + 32, // discriminator + tx_hash
        seeds = [b"processed_tx", &source_tx_hash], 
        bump
    )]
    pub processed_tx: Account<'info, ProcessedTx>,

    #[account(has_one = oracle_key)]
    pub bridge_state: Account<'info, BridgeState>,

    #[account(
        mut, 
        seeds = [b"vault"], 
        bump
    )]
    pub vault_gstd_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_gstd_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

// ─── State Accounts & Events ───

#[account]
pub struct BridgeState {
    pub oracle_key: Pubkey,
}

#[account]
pub struct ProcessedTx {
    pub tx_hash: [u8; 32],
}

#[event]
pub struct CrossChainEvent {
    pub user: Pubkey,
    pub dest_chain: String,
    pub dest_address: String,
    pub amount_gstd: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized Oracle Signer")]
    Unauthorized,
}
