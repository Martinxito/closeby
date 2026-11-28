//! Money back to the buyer. Digital: buyer_cancel, refund_after_deadline.
//! In-person: decline_meeting, refund_unaccepted, reject_at_meeting, seller_cancel,
//! and refund_after_deadline. All use the same accounts (`Refund`).
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{ORDER_SEED, REJECT_WINDOW_SECS};
use crate::errors::EscrowError;
use crate::events::OrderRefunded;
use crate::rules::{now, pay_out, require_buyer, require_digital, require_physical, require_seller, require_status};
use crate::state::{Order, OrderKind, OrderStatus};

#[derive(Accounts)]
pub struct Refund<'info> {
    /// buyer_cancel, reject_at_meeting: the buyer. decline_meeting, seller_cancel: the seller.
    /// refund_after_deadline, refund_unaccepted: anyone.
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

pub fn handle_buyer_cancel(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_digital(order)?;
    require_status(order, OrderStatus::Funded)?;
    require_buyer(order, &ctx.accounts.caller.key())?;

    refund_buyer(ctx)
}

pub fn handle_refund_after_deadline(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    match order.kind {
        // Digital: paid but never unlocked within the claim window.
        OrderKind::Digital => {
            require_status(order, OrderStatus::Funded)?;
            require!(now()? > order.claim_deadline, EscrowError::DeadlineNotReached);
        }
        // In-person: nobody confirmed by meeting time + grace. No confirmation means no
        // proven exchange, so the buyer gets the money back (the opposite of digital).
        OrderKind::Physical => {
            require_status(order, OrderStatus::Scheduled)?;
            require!(now()? > order.release_deadline, EscrowError::DeadlineNotReached);
        }
    }

    refund_buyer(ctx)
}

/// In-person: the seller does not want this meeting. Full refund.
pub fn handle_decline_meeting(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_physical(order)?;
    require_status(order, OrderStatus::Funded)?;
    require_seller(order, &ctx.accounts.caller.key())?;

    refund_buyer(ctx)
}

/// In-person: the seller never answered in time. Anyone can trigger it; the money goes
/// to the buyer.
pub fn handle_refund_unaccepted(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_physical(order)?;
    require_status(order, OrderStatus::Funded)?;
    // Inclusive: accept_meeting closes at the deadline, so the two never overlap.
    require!(now()? >= order.accept_deadline, EscrowError::DeadlineNotReached);

    refund_buyer(ctx)
}

/// In-person: at the meeting, the item is not what was offered. Full refund.
pub fn handle_reject_at_meeting(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_physical(order)?;
    require_status(order, OrderStatus::Scheduled)?;
    require_buyer(order, &ctx.accounts.caller.key())?;
    let opens_at = order.meeting_time.checked_sub(REJECT_WINDOW_SECS).ok_or(EscrowError::Overflow)?;
    require!(now()? >= opens_at, EscrowError::TooEarlyToReject);

    refund_buyer(ctx)
}

/// In-person: the seller cancels after accepting. Full refund.
pub fn handle_seller_cancel(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_physical(order)?;
    require_status(order, OrderStatus::Scheduled)?;
    require_seller(order, &ctx.accounts.caller.key())?;

    refund_buyer(ctx)
}

/// Returns the whole vault to the buyer and closes the order as Refunded.
fn refund_buyer(ctx: Context<Refund>) -> Result<()> {
    let accounts = ctx.accounts;
    pay_out(&accounts.order, &accounts.vault, &accounts.buyer_token, &accounts.mint)?;

    let order = &mut accounts.order;
    order.status = OrderStatus::Refunded;
    emit!(OrderRefunded { order: order.key(), buyer: accounts.buyer_token.owner, amount: order.amount });
    Ok(())
}
