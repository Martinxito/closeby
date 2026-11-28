//! Money back to the buyer: buyer_cancel and refund_after_deadline.
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::ORDER_SEED;
use crate::errors::EscrowError;
use crate::events::OrderRefunded;
use crate::rules::{now, pay_out, require_buyer, require_digital, require_status};
use crate::state::{Order, OrderStatus};

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

pub fn handle_buyer_cancel(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_digital(order)?;
    require_status(order, OrderStatus::Funded)?;
    require_buyer(order, &ctx.accounts.caller.key())?;

    refund_buyer(ctx)
}

pub fn handle_refund_after_deadline(ctx: Context<Refund>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_digital(order)?;
    require_status(order, OrderStatus::Funded)?;
    require!(now()? > order.claim_deadline, EscrowError::DeadlineNotReached);

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
