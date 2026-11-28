//! In-person: the buyer pays and proposes when and where to meet.
//! Uses the same accounts as `fund` (the `Fund` context): only the rules differ.
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TransferChecked};

use crate::errors::EscrowError;
use crate::events::MeetingScheduled;
use crate::instructions::fund::Fund;
use crate::rules::{now, require_physical, require_status};
use crate::state::OrderStatus;

pub fn handle_fund_and_schedule(ctx: Context<Fund>, meeting_time: i64, place_hash: [u8; 32]) -> Result<()> {
    let buyer = ctx.accounts.buyer.key();
    let order = &ctx.accounts.order;

    require_physical(order)?;
    require_status(order, OrderStatus::Created)?;
    require!(buyer != order.seller, EscrowError::BuyerIsSeller);

    let now = now()?;
    require!(meeting_time > now, EscrowError::MeetingInPast);
    // The place itself stays off-chain (no personal data on-chain): only its SHA-256.
    require!(place_hash != [0u8; 32], EscrowError::InvalidPlaceHash);

    // The seller must answer before the window ends, and never after the meeting started.
    let accept_deadline = now
        .checked_add(ctx.accounts.config.accept_window_secs)
        .ok_or(EscrowError::Overflow)?
        .min(meeting_time);

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
    order.meeting_time = meeting_time;
    order.place_hash = place_hash;
    order.accept_deadline = accept_deadline;
    order.status = OrderStatus::Funded;

    emit!(MeetingScheduled {
        order: order.key(),
        buyer,
        amount: order.amount,
        meeting_time,
        place_hash,
        accept_deadline,
    });
    Ok(())
}
