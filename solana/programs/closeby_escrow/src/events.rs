//! One event per state change, so anyone can follow an order from the explorer.
use anchor_lang::prelude::*;

#[event]
pub struct OrderCreated {
    pub order: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub content_hash: [u8; 32],
}

#[event]
pub struct OrderFunded {
    pub order: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub claim_deadline: i64,
}

#[event]
pub struct OrderDelivered {
    pub order: Pubkey,
    pub release_deadline: i64,
}

#[event]
pub struct OrderReleased {
    pub order: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OrderRefunded {
    pub order: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
}
