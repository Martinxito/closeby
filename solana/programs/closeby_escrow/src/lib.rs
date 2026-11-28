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

    /// The buyer presses "Recibí el archivo" (digital) or "Recibí el producto"
    /// (in-person, after the seller accepted the meeting): the seller is paid.
    pub fn confirm_handover(ctx: Context<Release>) -> Result<()> {
        instructions::release::handle_confirm_handover(ctx)
    }

    /// Digital: the buyer paid but never unlocked the file in time. In-person: nobody
    /// confirmed by meeting time + grace. Full refund either way.
    /// Anyone can trigger it, but the money only ever goes to the buyer.
    pub fn refund_after_deadline(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_refund_after_deadline(ctx)
    }

    /// The buyer unlocked the file and stayed silent past the review window: the seller
    /// is paid. Anyone can trigger it, but the money only ever goes to the seller.
    pub fn release_after_deadline(ctx: Context<Release>) -> Result<()> {
        instructions::release::handle_release_after_deadline(ctx)
    }

    // --- In-person orders (docs/in-person-proposal.md) -------------------------------

    /// The buyer pays and proposes a meeting: when (`meeting_time`, unix seconds) and
    /// where (`place_hash`, SHA-256 of the place; the place itself stays off-chain).
    /// The seller must answer before `accept_deadline`.
    pub fn fund_and_schedule(ctx: Context<Fund>, meeting_time: i64, place_hash: [u8; 32]) -> Result<()> {
        instructions::fund_and_schedule::handle_fund_and_schedule(ctx, meeting_time, place_hash)
    }

    /// The seller accepts the meeting. If nobody confirms by meeting time + grace, the
    /// buyer can be refunded.
    pub fn accept_meeting(ctx: Context<AcceptMeeting>) -> Result<()> {
        instructions::accept_meeting::handle_accept_meeting(ctx)
    }

    /// The seller declines the meeting: full refund.
    pub fn decline_meeting(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_decline_meeting(ctx)
    }

    /// The seller did not answer in time: full refund. Anyone can trigger it.
    pub fn refund_unaccepted(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_refund_unaccepted(ctx)
    }

    /// At the meeting (from 30 minutes before), the item is not what was offered: full refund.
    pub fn reject_at_meeting(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_reject_at_meeting(ctx)
    }

    /// The seller cancels after accepting: full refund.
    pub fn seller_cancel(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_seller_cancel(ctx)
    }
}
