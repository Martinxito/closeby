//! Money to the seller: confirm_handover and release_after_deadline.
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::ORDER_SEED;
use crate::errors::EscrowError;
use crate::events::OrderReleased;
use crate::rules::{now, pay_out, require_buyer, require_digital, require_status};
use crate::state::{Order, OrderStatus};

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

pub fn handle_confirm_handover(ctx: Context<Release>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_digital(order)?;
    require_status(order, OrderStatus::Delivered)?;
    require_buyer(order, &ctx.accounts.caller.key())?;

    pay_seller(ctx)
}

pub fn handle_release_after_deadline(ctx: Context<Release>) -> Result<()> {
    let order = &ctx.accounts.order;
    require_digital(order)?;
    require_status(order, OrderStatus::Delivered)?;
    require!(now()? > order.release_deadline, EscrowError::DeadlineNotReached);

    pay_seller(ctx)
}

/// Pays the whole vault to the seller and closes the order as Released.
fn pay_seller(ctx: Context<Release>) -> Result<()> {
    let accounts = ctx.accounts;
    pay_out(&accounts.order, &accounts.vault, &accounts.seller_token, &accounts.mint)?;

    let order = &mut accounts.order;
    order.status = OrderStatus::Released;
    emit!(OrderReleased { order: order.key(), seller: order.seller, amount: order.amount });
    Ok(())
}
