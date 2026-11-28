//! One module per instruction: its accounts (`#[derive(Accounts)]`) and its handler.
//! `refund` and `release` each hold two instructions that move the vault the same way.
pub mod accept_meeting;
pub mod create_order;
pub mod fund;
pub mod fund_and_schedule;
pub mod init_config;
pub mod open_delivery;
pub mod refund;
pub mod release;

pub use accept_meeting::*;
pub use create_order::*;
pub use fund::*;
pub use fund_and_schedule::*;
pub use init_config::*;
pub use open_delivery::*;
pub use refund::*;
pub use release::*;
