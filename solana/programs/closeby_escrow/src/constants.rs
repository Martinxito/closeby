/// PDA seed of the single `Config` account: `["config"]`.
pub const CONFIG_SEED: &[u8] = b"config";

/// PDA seed prefix of each `Order`: `["order", seller, order_id as u64 little-endian]`.
pub const ORDER_SEED: &[u8] = b"order";
