# Escrow program: changes for digital goods

**For:** program owners (Alex, Aaron). **From:** web team. **Date:** 27 Nov 2026, 20:00.
**Status:** ✅ **Accepted by Aaron, Sat 28 Nov 2026, 00:45.** Names, accounts and PDA seeds stay exactly as written below. Two clarifications from the program side:

1. **First deploy covers digital orders only:** `init_config`, `create_order`, `fund`, `open_delivery`, `buyer_cancel`, `confirm_handover`, `refund_after_deadline`, `release_after_deadline`. Physical-only instructions are decided at the Saturday 13:00 sync. `create_order` still takes `kind`, so adding them later does not break the web.
2. **The web creates the buyer's and seller's USDC token accounts** (associated token accounts) in the same transaction, with the idempotent ATA instruction, before the program instruction. The program only validates them (owner and mint); it does not create them.

Plan and owners: [program-plan.md](program-plan.md).

The original spec (in-person sales) is in the old `CLAUDE.md`, commit `7437880`. Everything there stays valid for in-person orders. This document lists what changes so the same program also handles **digital goods, which are now the primary demo flow** ([decisions/0002](decisions/0002-digital-goods-primary.md)).

## Unchanged principles

- The vault is a USDC token account whose authority is the order PDA. Only the program moves it.
- Money always goes to the buyer or the seller according to the rules, never to whoever calls the instruction.
- `require!` with custom errors for every rule, `emit!` on every state change.
- Order PDA seeds: `["order", seller, order_id (u64 LE)]`. Please confirm, the web derives it.

## Account changes

`Config` adds:

| Field | Meaning | Demo value |
| --- | --- | --- |
| `digital_claim_secs: i64` | Time the buyer has to unlock the file after funding; after it, refund | 10 min |
| `digital_review_secs: i64` | Time the buyer has to confirm after unlocking; after it, the seller is paid | 5 min |

`Order` adds:

| Field | Meaning |
| --- | --- |
| `kind: OrderKind` | `Physical` or `Digital` |
| `content_hash: [u8; 32]` | SHA-256 of the file (zeros for physical) |
| `claim_deadline: i64` | Digital: `funded_at + digital_claim_secs` |
| `release_deadline: i64` | Already exists. Digital: `delivered_at + digital_review_secs` |

`status` adds **`Delivered`** (digital only: the buyer unlocked the file).

## Instructions for digital orders

| Instruction | Signer | Requires | Effect |
| --- | --- | --- | --- |
| `create_order(order_id, amount, kind, content_hash, …)` | seller | amount > 0; if `Digital`, hash ≠ zeros | `Created`. Physical args unchanged. |
| `fund(…)` | buyer | `Created`; buyer ≠ seller | Transfer USDC to vault, set `buyer`. Digital: `claim_deadline = now + digital_claim_secs`, status `Funded`. No seller acceptance for digital. (Physical keeps `fund_and_schedule` with meeting time and place.) |
| `open_delivery` | buyer | Digital; `Funded`; now ≤ `claim_deadline` | `release_deadline = now + digital_review_secs`; `Delivered`. Point of no return. |
| `buyer_cancel` | buyer | Digital: `Funded` (not yet delivered) | Full refund; `Refunded`. |
| `confirm_handover` | buyer | Digital: `Delivered`. Physical: `Scheduled` (unchanged) | Pay seller; `Released`. |
| `refund_after_deadline` | anyone | Digital: `Funded` and now > `claim_deadline`. Physical: unchanged | Full refund to buyer; `Refunded`. |
| **`release_after_deadline`** (new) | anyone | Digital: `Delivered` and now > `release_deadline` | **Pay seller**; `Released`. |

`accept_meeting`, `decline_meeting`, `reject_at_meeting`, `seller_cancel`, `propose_reschedule`, `accept_reschedule` and `refund_unaccepted` are physical only: they must fail with a clear error on digital orders.

## Required failing tests (in addition to the original list)

- `open_delivery` by anyone other than the buyer, or after `claim_deadline`.
- `buyer_cancel` after `Delivered`.
- `release_after_deadline` before `release_deadline`, or on a `Funded` order.
- `refund_after_deadline` on a `Delivered` order.
- Any physical-only instruction on a digital order.
- `create_order` digital with an all-zero `content_hash`.

## Signing and fees (affects every instruction)

Users have an invisible wallet and no SOL ([decisions/0003](decisions/0003-invisible-wallet.md)). **Every instruction must work with a separate fee payer** (our server's key pays fees and rent; the user only signs as buyer or seller). In Anchor terms: keep `payer` for account creation as its own `Signer` account, distinct from `seller`/`buyer`, so the web can pass our fee payer there.

## What the web needs from you, in order

1. ✅ on this document (or changes) — tonight.
2. Program ID on Devnet, IDL (even partial), and the test USDC mint — Saturday morning, 13:00 at the latest.
3. `init_config` called by us right after deploy, with the demo windows above.
