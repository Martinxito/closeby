/// PDA seed of the single `Config` account: `["config"]`.
pub const CONFIG_SEED: &[u8] = b"config";

/// PDA seed prefix of each `Order`: `["order", seller, order_id as u64 little-endian]`.
pub const ORDER_SEED: &[u8] = b"order";

/// In-person: the buyer can reject the item from this long before the meeting (30 min),
/// so a buyer cannot "reject" days in advance instead of cancelling with the seller.
pub const REJECT_WINDOW_SECS: i64 = 30 * 60;
