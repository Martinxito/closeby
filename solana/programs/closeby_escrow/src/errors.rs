//! Names shared with the web mock match apps/web/lib/escrow/types.ts (`EscrowErrorCode`).
//! Append new errors at the end: their numeric codes are part of the IDL.
use anchor_lang::prelude::*;

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
