use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, ORDER_SEED};
use crate::errors::EscrowError;
use crate::events::OrderDelivered;
use crate::rules::{now, require_buyer, require_digital, require_status};
use crate::state::{Config, Order, OrderStatus};

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

pub fn handle_open_delivery(ctx: Context<OpenDelivery>) -> Result<()> {
    let review_secs = ctx.accounts.config.digital_review_secs;
    let buyer = ctx.accounts.buyer.key();
    let order = &mut ctx.accounts.order;

    require_digital(order)?;
    require_status(order, OrderStatus::Funded)?;
    require_buyer(order, &buyer)?;

    let now = now()?;
    // Inclusive: refund_after_deadline only opens strictly after the claim deadline.
    require!(now <= order.claim_deadline, EscrowError::ClaimWindowClosed);

    order.release_deadline = now.checked_add(review_secs).ok_or(EscrowError::Overflow)?;
    order.status = OrderStatus::Delivered;

    emit!(OrderDelivered { order: order.key(), release_deadline: order.release_deadline });
    Ok(())
}
