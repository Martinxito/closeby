//! Closeby escrow: the buyer pays into a vault that only this program can move, and the
//! money goes to the seller or back to the buyer according to fixed rules. Nobody, not
//! even our server, can send it anywhere else.
//!
//! Contract with the web: docs/escrow-changes.md. This version handles digital orders
//! (docs/flows/digital-sale.md):
//!
//!   create_order ─► Created ─fund─► Funded ─open_delivery─► Delivered ─confirm_handover─► Released
//!                                     ├─buyer_cancel─────────► Refunded   (before unlocking)
//!                                     └─refund_after_deadline► Refunded   (claim window over)
//!                                                   Delivered ─release_after_deadline─► Released
//!                                                                         (review window over)
//!
//! Unlocking the file (open_delivery) is the point of no return: a downloaded file cannot
//! be returned, so there is no refund after it.
//!
//! Fees: users hold no SOL. Our server's fee payer pays every transaction fee and the rent
//! of new accounts (`payer` in create_order). Buyer and seller only sign as themselves.
//!
//! Layout: `state` (accounts), `instructions` (one module per instruction, with its
//! accounts and rules), `rules` (checks and the vault payout shared by several
//! instructions), `events`, `errors`, `constants`.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod rules;
pub mod state;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT");

#[program]
pub mod closeby_escrow {
    use super::*;

    /// One-time setup right after deploy. Only the program's upgrade authority (the
    /// account that deployed it) can call it, so nobody can front-run us and become admin.
    /// The physical windows are stored now so in-person orders can be added later
    /// without migrating this account.
    pub fn init_config(
        ctx: Context<InitConfig>,
        accept_window_secs: i64,
        grace_secs: i64,
        digital_claim_secs: i64,
        digital_review_secs: i64,
    ) -> Result<()> {
        instructions::init_config::handle_init_config(ctx, accept_window_secs, grace_secs, digital_claim_secs, digital_review_secs)
    }

    /// The seller puts a file up for sale. Creates the order and its empty vault.
    /// `content_hash` is the SHA-256 of the file: public proof of what was sold.
    pub fn create_order(
        ctx: Context<CreateOrder>,
        order_id: u64,
        amount: u64,
        kind: OrderKind,
        content_hash: [u8; 32],
    ) -> Result<()> {
        instructions::create_order::handle_create_order(ctx, order_id, amount, kind, content_hash)
    }

    /// The buyer pays. The exact order amount moves from the buyer's USDC account into
    /// the vault, and the claim window starts.
    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        instructions::fund::handle_fund(ctx)
    }

    /// The buyer unlocks the file. Point of no return: from here the buyer can only
    /// confirm, and if they stay silent the seller is paid when the review window ends.
    /// Our server hands out the download link only after it sees this on-chain.
    pub fn open_delivery(ctx: Context<OpenDelivery>) -> Result<()> {
        instructions::open_delivery::handle_open_delivery(ctx)
    }

    /// The buyer changes their mind before unlocking the file: full refund.
    pub fn buyer_cancel(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_buyer_cancel(ctx)
    }

    /// The buyer got the file and presses "Recibí el archivo": the seller is paid.
    pub fn confirm_handover(ctx: Context<Release>) -> Result<()> {
        instructions::release::handle_confirm_handover(ctx)
    }

    /// The buyer paid but never unlocked the file in time: full refund.
    /// Anyone can trigger it, but the money only ever goes to the buyer.
    pub fn refund_after_deadline(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_refund_after_deadline(ctx)
    }

    /// The buyer unlocked the file and stayed silent past the review window: the seller
    /// is paid. Anyone can trigger it, but the money only ever goes to the seller.
    pub fn release_after_deadline(ctx: Context<Release>) -> Result<()> {
        instructions::release::handle_release_after_deadline(ctx)
    }
}
