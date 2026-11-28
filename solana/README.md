# closeby_escrow

Anchor program that holds the buyer's payment in a vault only the program can move, and pays the seller or refunds the buyer according to fixed rules. Deployed on Devnet as [`4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT`](https://explorer.solana.com/address/4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT?cluster=devnet).

This version handles **digital orders** (the product's primary flow). The flow, the rules and the deployment are described in the [root README](../README.md#solana-integration); the contract agreed with the web is [docs/escrow-changes.md](../docs/escrow-changes.md).

```
create_order ─► Created ─fund─► Funded ─open_delivery─► Delivered ─confirm_handover─► Released
                                  ├─buyer_cancel──────────► Refunded   (before unlocking)
                                  └─refund_after_deadline─► Refunded   (claim window over, anyone)
                                                Delivered ─release_after_deadline─► Released
                                                                       (review window over, anyone)
```

## Layout

| Path | What |
| --- | --- |
| [`programs/closeby_escrow/src/lib.rs`](programs/closeby_escrow/src/lib.rs) | Entry points, one per instruction, with what each one does |
| [`src/instructions/`](programs/closeby_escrow/src/instructions) | One module per instruction: its accounts (constraints) and rules |
| [`src/rules.rs`](programs/closeby_escrow/src/rules.rs) | Checks and the vault payout shared by several instructions |
| [`src/state.rs`](programs/closeby_escrow/src/state.rs) | `Config` and `Order` accounts, `OrderKind`, `OrderStatus` |
| [`src/errors.rs`](programs/closeby_escrow/src/errors.rs), [`src/events.rs`](programs/closeby_escrow/src/events.rs) | Custom errors (same names the web uses) and one event per state change |
| [`tests/`](tests) | 27 program tests and the client tests, on a local validator |
| [`client/`](client) | TypeScript client the web uses: addresses, instruction builders, order reads, error names |
| [`idl/`](idl) | Generated IDL (`closeby_escrow.json`, `.ts`) |
| [`scripts/`](scripts) | `init-config.mjs` (one-time setup) and `smoke-devnet.ts` (full flow on Devnet) |

## Key design points

- **Vault**: the associated USDC account of the order PDA `["order", seller, order_id (u64 LE)]`. No private key exists for it.
- **Money never goes to the caller**: payouts go to the recorded seller's or buyer's token account, validated in the account constraints. Deadline actions can be triggered by anyone for that reason.
- **Users hold no SOL**: `create_order` takes a separate `payer` (our server's fee payer) for rent; every transaction's fee is paid by that same key, and buyers and sellers only sign as themselves.
- **One mint**: `Config` locks the accepted mint at `init_config`, which only the program's upgrade authority can call.
- **In-person orders** are reserved in the account layout (`kind`, meeting fields, `Scheduled`) but rejected by this version; see [docs/in-person-proposal.md](../docs/in-person-proposal.md).

## Commands

Toolchain: Anchor CLI 1.2.2, Solana CLI 3.1.10, Rust stable. From the repo root:

```sh
pnpm --filter @closeby/solana build         # anchor build --arch v0 (v0 runs on every cluster)
pnpm --filter @closeby/solana test          # program + client tests on solana-test-validator
pnpm --filter @closeby/solana smoke:devnet  # create → fund → unlock → confirm on Devnet; reads apps/web/.env.local
```

Deployment record, upgrade notes and how the web connects: [docs/program-plan.md](../docs/program-plan.md).
