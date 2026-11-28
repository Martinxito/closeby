//! In-person: the seller accepts the meeting the buyer proposed.
use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, ORDER_SEED};
use crate::errors::EscrowError;
use crate::events::MeetingAccepted;
use crate::rules::{now, require_physical, require_seller, require_status};
use crate::state::{Config, Order, OrderStatus};

#[derive(Accounts)]
pub struct AcceptMeeting<'info> {
    pub seller: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
}

pub fn handle_accept_meeting(ctx: Context<AcceptMeeting>) -> Result<()> {
    let grace_secs = ctx.accounts.config.grace_secs;
    let seller = ctx.accounts.seller.key();
    let order = &mut ctx.accounts.order;

    require_physical(order)?;
    require_status(order, OrderStatus::Funded)?;
    require_seller(order, &seller)?;
    // Exclusive: refund_unaccepted opens at the deadline, so the two never overlap.
    require!(now()? < order.accept_deadline, EscrowError::AcceptWindowClosed);

    // If nobody confirms by meeting time + grace, anyone can refund the buyer.
    order.release_deadline = order.meeting_time.checked_add(grace_secs).ok_or(EscrowError::Overflow)?;
    order.status = OrderStatus::Scheduled;

    emit!(MeetingAccepted {
        order: order.key(),
        meeting_time: order.meeting_time,
        release_deadline: order.release_deadline,
    });
    Ok(())
}
