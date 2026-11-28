use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::{CONFIG_SEED, ORDER_SEED};
use crate::errors::EscrowError;
use crate::events::OrderFunded;
use crate::rules::{now, require_digital, require_status};
use crate::state::{Config, Order, OrderStatus};

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

pub fn handle_fund(ctx: Context<Fund>) -> Result<()> {
    let buyer = ctx.accounts.buyer.key();
    let order = &ctx.accounts.order;

    require_digital(order)?;
    require_status(order, OrderStatus::Created)?;
    require!(buyer != order.seller, EscrowError::BuyerIsSeller);

    let claim_deadline = now()?
        .checked_add(ctx.accounts.config.digital_claim_secs)
        .ok_or(EscrowError::Overflow)?;

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
