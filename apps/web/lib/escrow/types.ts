// Shared escrow types. Safe to import from server and client code.
// Names mirror the Solana program contract in docs/escrow-changes.md: when the real
// program lands, only the implementation behind these types changes.

export type OrderKind = 'digital' | 'physical';

export type OrderStatus = 'Created' | 'Funded' | 'Delivered' | 'Scheduled' | 'Released' | 'Refunded';

/** Off-chain mirror of the on-chain Order account. */
export type Order = {
  dealId: string; // u64 order_id as a digit string
  kind: OrderKind;
  seller: string; // base58 public key
  buyer: string | null;
  amount: number; // USDC base units (6 decimals); fits safely in a JS number
  contentHash: string | null; // SHA-256 of the file, lowercase hex
  status: OrderStatus;
  claimDeadline: number | null; // unix seconds: buyer must unlock before this
  releaseDeadline: number | null; // unix seconds: after this the seller can be paid
  lastSignature: string | null; // signature of the last transaction (fake in mock mode)
};

/** Program config. Demo values: windows in minutes so the whole flow fits in a demo. */
export type EscrowConfig = {
  digitalClaimSecs: number;
  digitalReviewSecs: number;
};

export const DEMO_CONFIG: EscrowConfig = {
  digitalClaimSecs: 10 * 60,
  digitalReviewSecs: 5 * 60,
};

/** One instruction of the program. `signer` is who signs it (seller, buyer or anyone). */
export type EscrowAction =
  | { type: 'create_order'; dealId: string; signer: string; amount: number; kind: OrderKind; contentHash: string | null }
  | { type: 'fund'; dealId: string; signer: string }
  | { type: 'open_delivery'; dealId: string; signer: string }
  | { type: 'buyer_cancel'; dealId: string; signer: string }
  | { type: 'confirm_handover'; dealId: string; signer: string }
  | { type: 'refund_after_deadline'; dealId: string; signer: string }
  | { type: 'release_after_deadline'; dealId: string; signer: string };

export type EscrowActionType = EscrowAction['type'];

/** Where the vault's money went, if the action moved it. Always buyer or seller, never the caller. */
export type Payout = { to: 'buyer' | 'seller'; address: string; amount: number };

export type ActionResult = { order: Order; payout: Payout | null };

/** Error codes mirror the program's #[error_code] names (docs/escrow-changes.md). */
export type EscrowErrorCode =
  | 'OrderNotFound'
  | 'OrderAlreadyExists'
  | 'InvalidAmount'
  | 'InvalidContentHash'
  | 'BuyerIsSeller'
  | 'InvalidStatus'
  | 'NotBuyer'
  | 'ClaimWindowClosed'
  | 'DeadlineNotReached'
  | 'PhysicalNotSupported'
  // Not a program error: the buyer's test USDC balance is below the price (chain mode).
  | 'InsufficientFunds'
  // Missing or expired session (our routes), or not the upgrade authority (program).
  | 'Unauthorized';

export class EscrowError extends Error {
  constructor(
    readonly code: EscrowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EscrowError';
  }
}
