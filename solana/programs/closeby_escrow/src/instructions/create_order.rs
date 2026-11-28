use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{CONFIG_SEED, ORDER_SEED};
use crate::errors::EscrowError;
use crate::events::OrderCreated;
use crate::rules::now;
use crate::state::{Config, Order, OrderKind, OrderStatus};

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

pub fn handle_create_order(
    ctx: Context<CreateOrder>,
    order_id: u64,
    amount: u64,
    kind: OrderKind,
    content_hash: [u8; 32],
) -> Result<()> {
    require!(amount > 0, EscrowError::InvalidAmount);
    match kind {
        // A digital order commits to its file: the hash can never be empty.
        OrderKind::Digital => require!(content_hash != [0u8; 32], EscrowError::InvalidContentHash),
        // An in-person order has no file: the meeting place is committed later, by the buyer.
        OrderKind::Physical => require!(content_hash == [0u8; 32], EscrowError::InvalidContentHash),
    }

    let order = &mut ctx.accounts.order;
    order.set_inner(Order {
        order_id,
        seller: ctx.accounts.seller.key(),
        buyer: None,
        mint: ctx.accounts.mint.key(),
        amount,
        kind,
        content_hash,
        status: OrderStatus::Created,
        created_at: now()?,
        claim_deadline: 0,
        release_deadline: 0,
        // In-person fields are set by fund_and_schedule; always zero for digital orders.
        meeting_time: 0,
        place_hash: [0u8; 32],
        accept_deadline: 0,
        bump: ctx.bumps.order,
    });

    emit!(OrderCreated { order: order.key(), seller: order.seller, amount, content_hash });
    Ok(())
}
