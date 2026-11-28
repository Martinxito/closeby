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
    // In-person orders (appended: existing codes must not move).
    #[msg("This action is for the other kind of order (digital vs in-person).")]
    WrongOrderKind,
    #[msg("Only the seller can do this.")]
    NotSeller,
    #[msg("The meeting must be in the future.")]
    MeetingInPast,
    #[msg("An in-person order needs the SHA-256 of the meeting place.")]
    InvalidPlaceHash,
    #[msg("The time to accept the meeting has passed.")]
    AcceptWindowClosed,
    #[msg("The item can only be rejected from 30 minutes before the meeting.")]
    TooEarlyToReject,
}
