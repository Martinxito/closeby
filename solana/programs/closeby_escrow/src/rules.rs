//! Checks and the vault payout shared by several instructions. The order of checks in
//! each instruction matches apps/web/lib/escrow/rules.ts, so the mock and the program
//! return the same error for the same mistake.
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::ORDER_SEED;
use crate::errors::EscrowError;
use crate::state::{Order, OrderKind, OrderStatus};

pub fn require_digital(order: &Order) -> Result<()> {
    require!(order.kind == OrderKind::Digital, EscrowError::PhysicalNotSupported);
    Ok(())
}

/// For in-person-only instructions: a digital order is the wrong kind.
pub fn require_physical(order: &Order) -> Result<()> {
    require!(order.kind == OrderKind::Physical, EscrowError::WrongOrderKind);
    Ok(())
}

pub fn require_seller(order: &Order, signer: &Pubkey) -> Result<()> {
    require!(order.seller == *signer, EscrowError::NotSeller);
    Ok(())
}

pub fn require_status(order: &Order, expected: OrderStatus) -> Result<()> {
    require!(order.status == expected, EscrowError::InvalidStatus);
    Ok(())
}

pub fn require_buyer(order: &Order, signer: &Pubkey) -> Result<()> {
    require!(order.buyer == Some(*signer), EscrowError::NotBuyer);
    Ok(())
}

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}

/// Moves the whole order amount out of the vault. The order PDA signs, which only this
/// program can do. The destination was already checked by the instruction's accounts.
pub fn pay_out<'info>(
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
