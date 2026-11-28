//! Closeby escrow: the buyer pays into a vault that only this program can move, and the
//! money goes to the seller or back to the buyer according to fixed rules. Nobody, not
//! even our server, can send it anywhere else.
//!
//! Contract with the web: docs/escrow-changes.md (accepted 28 Nov 2026). This first
//! version handles digital orders only (docs/flows/digital-sale.md):
//!
//!   create_order ─► Created ─fund─► Funded ─open_delivery─► Delivered ─confirm_handover─► Released
//!                                     │                        │
//!                                     ├─buyer_cancel──────────►│ Refunded      (before unlocking)
//!                                     └─refund_after_deadline─► Refunded      (claim window over)
//!                                                              └─release_after_deadline─► Released
//!                                                                              (review window over)
//!
//! Unlocking the file (open_delivery) is the point of no return: after it there is no
//! refund, because a downloaded file cannot be returned.
//!
//! Fees: users hold no SOL. Our server's fee payer pays every transaction fee (set at the
//! transaction level by the web) and the rent of new accounts (the `payer` signer in
//! create_order). The buyer and seller sign only as themselves.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

// Replaced by `anchor keys sync` after the first `anchor build`.
declare_id!("4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT");

pub const CONFIG_SEED: &[u8] = b"config";
pub const ORDER_SEED: &[u8] = b"order";

#[program]
pub mod closeby_escrow {
    use super::*;

    /// One-time setup right after deploy. Only the program's upgrade authority (the
    /// account that deployed it) can call it, so nobody can front-run us and become admin.
    /// The physical windows are stored now so in-person orders can be added later
    /// without migrating this account.
    pub fn init_config(
        ctx: Context<InitConfig>,
        accept_window_secs: i64,
        grace_secs: i64,
        digital_claim_secs: i64,
        digital_review_secs: i64,
    ) -> Result<()> {
        require!(
            accept_window_secs > 0 && grace_secs > 0 && digital_claim_secs > 0 && digital_review_secs > 0,
            EscrowError::InvalidConfig
        );

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.accept_window_secs = accept_window_secs;
        config.grace_secs = grace_secs;
        config.digital_claim_secs = digital_claim_secs;
        config.digital_review_secs = digital_review_secs;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// The seller puts a file up for sale. Creates the order and its empty vault.
    /// `content_hash` is the SHA-256 of the file: public proof of what was sold.
    pub fn create_order(
        ctx: Context<CreateOrder>,
        order_id: u64,
        amount: u64,
        kind: OrderKind,
        content_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        // In-person orders need meeting fields and their own instructions: not in this version.
        require!(kind == OrderKind::Digital, EscrowError::PhysicalNotSupported);
        require!(content_hash != [0u8; 32], EscrowError::InvalidContentHash);

        let now = Clock::get()?.unix_timestamp;
        let order = &mut ctx.accounts.order;
        order.order_id = order_id;
        order.seller = ctx.accounts.seller.key();
        order.buyer = None;
        order.mint = ctx.accounts.mint.key();
        order.amount = amount;
        order.kind = kind;
        order.content_hash = content_hash;
        order.status = OrderStatus::Created;
        order.created_at = now;
        order.claim_deadline = 0;
        order.release_deadline = 0;
        // Reserved for in-person orders; always zero for digital ones.
        order.meeting_time = 0;
        order.place_hash = [0u8; 32];
        order.accept_deadline = 0;
        order.bump = ctx.bumps.order;

        emit!(OrderCreated { order: order.key(), seller: order.seller, amount, content_hash });
        Ok(())
    }

    /// The buyer pays. The exact order amount moves from the buyer's USDC account into
    /// the vault, and the claim window starts.
    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        let config = &ctx.accounts.config;
        let buyer = ctx.accounts.buyer.key();
        let order = &ctx.accounts.order;

        require_digital(order)?;
        require_status(order, OrderStatus::Created)?;
        require!(buyer != order.seller, EscrowError::BuyerIsSeller);

        let now = Clock::get()?.unix_timestamp;
        let claim_deadline = now.checked_add(config.digital_claim_secs).ok_or(EscrowError::Overflow)?;

        // The buyer signs this transfer as the owner of their token account.
        token::transfer_checked(
            CpiContext::new(
                Token::id(),
                TransferChecked {
                    from: ctx.accounts.buyer_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            order.amount,
            ctx.accounts.mint.decimals,
        )?;

        let order = &mut ctx.accounts.order;
        order.buyer = Some(buyer);
        order.claim_deadline = claim_deadline;
        order.status = OrderStatus::Funded;

        emit!(OrderFunded { order: order.key(), buyer, amount: order.amount, claim_deadline });
        Ok(())
    }

    /// The buyer unlocks the file. Point of no return: from here the buyer can only
    /// confirm, and if they stay silent the seller is paid when the review window ends.
    /// Our server hands out the download link only after it sees this on-chain.
    pub fn open_delivery(ctx: Context<OpenDelivery>) -> Result<()> {
        let config = &ctx.accounts.config;
        let order = &mut ctx.accounts.order;

        require_digital(order)?;
        require_status(order, OrderStatus::Funded)?;
        require_buyer(order, &ctx.accounts.buyer.key())?;

        let now = Clock::get()?.unix_timestamp;
        require!(now <= order.claim_deadline, EscrowError::ClaimWindowClosed);

        order.release_deadline = now.checked_add(config.digital_review_secs).ok_or(EscrowError::Overflow)?;
        order.status = OrderStatus::Delivered;

        emit!(OrderDelivered { order: order.key(), release_deadline: order.release_deadline });
        Ok(())
    }

    /// The buyer changes their mind before unlocking the file: full refund.
    pub fn buyer_cancel(ctx: Context<Refund>) -> Result<()> {
        let order = &ctx.accounts.order;
        require_digital(order)?;
        require_status(order, OrderStatus::Funded)?;
        require_buyer(order, &ctx.accounts.caller.key())?;

        pay_out(&ctx.accounts.order, &ctx.accounts.vault, &ctx.accounts.buyer_token, &ctx.accounts.mint)?;
        finish(&mut ctx.accounts.order, OrderStatus::Refunded)
    }

    /// The buyer got the file and presses "Recibí el archivo": the seller is paid.
    pub fn confirm_handover(ctx: Context<Release>) -> Result<()> {
        let order = &ctx.accounts.order;
        require_digital(order)?;
        require_status(order, OrderStatus::Delivered)?;
        require_buyer(order, &ctx.accounts.caller.key())?;

        pay_out(&ctx.accounts.order, &ctx.accounts.vault, &ctx.accounts.seller_token, &ctx.accounts.mint)?;
        finish(&mut ctx.accounts.order, OrderStatus::Released)
    }

    /// The buyer paid but never unlocked the file in time: full refund.
    /// Anyone can trigger it, but the money only ever goes to the buyer.
    pub fn refund_after_deadline(ctx: Context<Refund>) -> Result<()> {
        let order = &ctx.accounts.order;
        require_digital(order)?;
        require_status(order, OrderStatus::Funded)?;
        let now = Clock::get()?.unix_timestamp;
        require!(now > order.claim_deadline, EscrowError::DeadlineNotReached);

        pay_out(&ctx.accounts.order, &ctx.accounts.vault, &ctx.accounts.buyer_token, &ctx.accounts.mint)?;
        finish(&mut ctx.accounts.order, OrderStatus::Refunded)
    }

    /// The buyer unlocked the file and stayed silent past the review window: the seller
    /// is paid. Anyone can trigger it, but the money only ever goes to the seller.
    pub fn release_after_deadline(ctx: Context<Release>) -> Result<()> {
        let order = &ctx.accounts.order;
        require_digital(order)?;
        require_status(order, OrderStatus::Delivered)?;
        let now = Clock::get()?.unix_timestamp;
        require!(now > order.release_deadline, EscrowError::DeadlineNotReached);

        pay_out(&ctx.accounts.order, &ctx.accounts.vault, &ctx.accounts.seller_token, &ctx.accounts.mint)?;
        finish(&mut ctx.accounts.order, OrderStatus::Released)
    }
}

// ---------------------------------------------------------------------------
// Rule helpers. Order of checks matches apps/web/lib/escrow/rules.ts, so the mock and
// the program return the same error for the same mistake.
// ---------------------------------------------------------------------------

fn require_digital(order: &Order) -> Result<()> {
    require!(order.kind == OrderKind::Digital, EscrowError::PhysicalNotSupported);
    Ok(())
}

fn require_status(order: &Order, expected: OrderStatus) -> Result<()> {
    require!(order.status == expected, EscrowError::InvalidStatus);
    Ok(())
}

fn require_buyer(order: &Order, signer: &Pubkey) -> Result<()> {
    require!(order.buyer == Some(*signer), EscrowError::NotBuyer);
    Ok(())
}

/// Moves the whole order amount out of the vault. The order PDA signs, which only this
/// program can do. The destination was already checked by the account constraints.
fn pay_out<'info>(
    order: &Account<'info, Order>,
    vault: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
) -> Result<()> {
    let order_id = order.order_id.to_le_bytes();
    let bump = [order.bump];
    let seeds: &[&[u8]] = &[ORDER_SEED, order.seller.as_ref(), &order_id, &bump];

    token::transfer_checked(
        CpiContext::new_with_signer(
            Token::id(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: order.to_account_info(),
            },
            &[seeds],
        ),
        order.amount,
        mint.decimals,
    )
}

fn finish(order: &mut Account<Order>, status: OrderStatus) -> Result<()> {
    order.status = status;
    match status {
        OrderStatus::Released => emit!(OrderReleased { order: order.key(), seller: order.seller, amount: order.amount }),
        _ => emit!(OrderRefunded { order: order.key(), buyer: order.buyer.unwrap_or_default(), amount: order.amount }),
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// The only token the program accepts (our test USDC on Devnet, 6 decimals).
    pub usdc_mint: Pubkey,
    /// In-person (reserved): time the seller has to accept a meeting.
    pub accept_window_secs: i64,
    /// In-person (reserved): time after the meeting before a refund is possible.
    pub grace_secs: i64,
    /// Digital: time the buyer has to unlock the file after paying (demo: 600).
    pub digital_claim_secs: i64,
    /// Digital: time the buyer has to confirm after unlocking (demo: 300).
    pub digital_review_secs: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Order {
    /// The public deal ID in /deals/[dealId]. Random u64, scoped to the seller.
    pub order_id: u64,
    pub seller: Pubkey,
    /// Set when the order is funded.
    pub buyer: Option<Pubkey>,
    pub mint: Pubkey,
    /// USDC base units (6 decimals).
    pub amount: u64,
    pub kind: OrderKind,
    /// SHA-256 of the file being sold. Never all zeros for a digital order.
    pub content_hash: [u8; 32],
    pub status: OrderStatus,
    pub created_at: i64,
    /// Digital: the buyer must unlock before this (unix seconds). 0 until funded.
    pub claim_deadline: i64,
    /// Digital: after this the seller can be paid (unix seconds). 0 until delivered.
    pub release_deadline: i64,
    /// In-person (reserved, zero for digital).
    pub meeting_time: i64,
    /// In-person (reserved): SHA-256 of the meeting place. The place itself stays off-chain.
    pub place_hash: [u8; 32],
    /// In-person (reserved).
    pub accept_deadline: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum OrderKind {
    Physical,
    Digital,
}

/// `Scheduled` is reserved for in-person orders; digital orders never reach it.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum OrderStatus {
    Created,
    Funded,
    Scheduled,
    Delivered,
    Released,
    Refunded,
}

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    pub usdc_mint: Account<'info, Mint>,

    /// Proves `admin` is the program's upgrade authority (whoever deployed it).
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ EscrowError::Unauthorized)]
    pub program: Program<'info, crate::program::ClosebyEscrow>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ EscrowError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct CreateOrder<'info> {
    /// Our server's fee payer: pays the rent of the order and the vault.
    #[account(mut)]
    pub payer: Signer<'info>,
    pub seller: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(address = config.usdc_mint @ EscrowError::WrongMint)]
    pub mint: Account<'info, Mint>,

    /// `init` fails if this seller already used this order_id, so an order can never be overwritten.
    #[account(
        init,
        payer = payer,
        space = 8 + Order::INIT_SPACE,
        seeds = [ORDER_SEED, seller.key().as_ref(), &order_id.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,

    /// The vault: a USDC account owned by the order PDA. Nobody holds its key.
    #[account(init, payer = payer, associated_token::mint = mint, associated_token::authority = order)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    pub buyer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,

    #[account(address = order.mint @ EscrowError::WrongMint)]
    pub mint: Account<'info, Mint>,

    /// The buyer's USDC: must be theirs and of the right token.
    #[account(
        mut,
        constraint = buyer_token.owner == buyer.key() @ EscrowError::WrongTokenAccount,
        constraint = buyer_token.mint == mint.key() @ EscrowError::WrongTokenAccount
    )]
    pub buyer_token: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = order)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct OpenDelivery<'info> {
    pub buyer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
}

/// Money back to the buyer: buyer_cancel and refund_after_deadline.
#[derive(Accounts)]
pub struct Refund<'info> {
    /// buyer_cancel: must be the buyer. refund_after_deadline: anyone.
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,

    #[account(address = order.mint @ EscrowError::WrongMint)]
    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = order)]
    pub vault: Account<'info, TokenAccount>,

    /// Must belong to the recorded buyer: the caller cannot redirect the refund.
    #[account(
        mut,
        constraint = order.buyer == Some(buyer_token.owner) @ EscrowError::WrongTokenAccount,
        constraint = buyer_token.mint == mint.key() @ EscrowError::WrongTokenAccount
    )]
    pub buyer_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Money to the seller: confirm_handover and release_after_deadline.
#[derive(Accounts)]
pub struct Release<'info> {
    /// confirm_handover: must be the buyer. release_after_deadline: anyone.
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,

    #[account(address = order.mint @ EscrowError::WrongMint)]
    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = order)]
    pub vault: Account<'info, TokenAccount>,

    /// Must belong to the recorded seller: the caller cannot redirect the payment.
    #[account(
        mut,
        constraint = seller_token.owner == order.seller @ EscrowError::WrongTokenAccount,
        constraint = seller_token.mint == mint.key() @ EscrowError::WrongTokenAccount
    )]
    pub seller_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------
// Events: one per state change, so anyone can follow an order from the explorer.
// ---------------------------------------------------------------------------

#[event]
pub struct OrderCreated {
    pub order: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub content_hash: [u8; 32],
}

#[event]
pub struct OrderFunded {
    pub order: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub claim_deadline: i64,
}

#[event]
pub struct OrderDelivered {
    pub order: Pubkey,
    pub release_deadline: i64,
}

#[event]
pub struct OrderReleased {
    pub order: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OrderRefunded {
    pub order: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
}

// ---------------------------------------------------------------------------
// Errors. Names shared with the web mock match apps/web/lib/escrow/types.ts.
// ---------------------------------------------------------------------------

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("A digital order needs the SHA-256 of its file.")]
    InvalidContentHash,
    #[msg("The seller cannot buy their own deal.")]
    BuyerIsSeller,
    #[msg("The order is not in the right status for this action.")]
    InvalidStatus,
    #[msg("Only the buyer can do this.")]
    NotBuyer,
    #[msg("The time to unlock the file has passed.")]
    ClaimWindowClosed,
    #[msg("The deadline for this action has not been reached yet.")]
    DeadlineNotReached,
    #[msg("In-person orders are not supported yet.")]
    PhysicalNotSupported,
    #[msg("All config windows must be greater than zero.")]
    InvalidConfig,
    #[msg("Only the program's upgrade authority can do this.")]
    Unauthorized,
    #[msg("Wrong token mint.")]
    WrongMint,
    #[msg("The token account does not belong to the right person or token.")]
    WrongTokenAccount,
    #[msg("Arithmetic overflow.")]
    Overflow,
}
