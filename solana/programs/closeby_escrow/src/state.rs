use anchor_lang::prelude::*;

/// Program settings, set once by `init_config`.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// The only token the program accepts (our test USDC on Devnet, 6 decimals).
    pub usdc_mint: Pubkey,
    /// In-person (reserved): time the seller has to accept a meeting.
    pub accept_window_secs: i64,
    /// In-person (reserved): time after the meeting before a refund is possible.
    pub grace_secs: i64,
    /// Digital: time the buyer has to unlock the file after paying (demo: 600).
    pub digital_claim_secs: i64,
    /// Digital: time the buyer has to confirm after unlocking (demo: 300).
    pub digital_review_secs: i64,
    pub bump: u8,
}

/// One sale. Its vault is the associated USDC account of this PDA.
#[account]
#[derive(InitSpace)]
pub struct Order {
    /// The public deal ID in /deals/[dealId]. Random u64, scoped to the seller.
    pub order_id: u64,
    pub seller: Pubkey,
    /// Set when the order is funded.
    pub buyer: Option<Pubkey>,
    pub mint: Pubkey,
    /// USDC base units (6 decimals).
    pub amount: u64,
    pub kind: OrderKind,
    /// SHA-256 of the file being sold. Never all zeros for a digital order.
    pub content_hash: [u8; 32],
    pub status: OrderStatus,
    pub created_at: i64,
    /// Digital: the buyer must unlock before this (unix seconds). 0 until funded.
    pub claim_deadline: i64,
    /// Digital: after this the seller can be paid (unix seconds). 0 until delivered.
    pub release_deadline: i64,
    /// In-person (reserved, zero for digital).
    pub meeting_time: i64,
    /// In-person (reserved): SHA-256 of the meeting place. The place itself stays off-chain.
    pub place_hash: [u8; 32],
    /// In-person (reserved).
    pub accept_deadline: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum OrderKind {
    Physical,
    Digital,
}

/// `Scheduled` is reserved for in-person orders; digital orders never reach it.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum OrderStatus {
    Created,
    Funded,
    Scheduled,
    Delivered,
    Released,
    Refunded,
}
