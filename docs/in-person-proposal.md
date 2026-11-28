# Proposal: in-person sales (and services) on the same program

**Status:** approved Sat 28 Nov, 10:50 (option B, minimal: no reschedule, no late-cancel fee), and **implemented**: program in #21 (48 tests, Devnet upgraded, see the deployment record in [program-plan.md](program-plan.md#deployment-record)), web in #22. Run `supabase/migrations/0004_in_person.sql` for mock mode. **Program owner:** Alex/Aaron.
**Based on:** the original in-person spec (old `CLAUDE.md`, commit `7437880`) and [solana/README.md](../solana/README.md), adapted to the program as deployed ([program-plan.md](program-plan.md)).

## What it adds

The seller shares the same `/deals/[dealId]` link. The buyer picks a time and a meeting place and pays; the money waits in the order's vault. The seller accepts the meeting. At the meeting the buyer checks the item and presses one button to pay the seller, or rejects it and gets the money back. If anything does not happen in time, a rule returns the money. **Money is never stuck.**

What the program can and cannot guarantee: it cannot see the physical world. The buyer's confirmation button is the proof that the exchange happened. The program guarantees that the money is reserved before the meeting, that only the buyer can release it, and that deadlines return it if the meeting does not happen. Disputes (a buyer who lies) stay out of scope, as for digital goods.

## Why it fits without migrating anything

The deployed program already reserves what this needs:

- `Order.kind = Physical`, `Order.meeting_time`, `Order.place_hash`, `Order.accept_deadline`, and status `Scheduled`.
- `Config.accept_window_secs` and `Config.grace_secs` (both set to 3600 on Devnet).
- `Refund` and `Release` account contexts are shared, so `confirm_handover` and `refund_after_deadline` only need a branch on `kind`.

It is a program **upgrade** on the same program ID: accounts, config and mint stay. Digital behaviour must not change.

## Rules

| Situation | Outcome | Instruction |
| --- | --- | --- |
| Seller does not accept before the accept deadline | Full refund (anyone triggers) | `refund_unaccepted` |
| Seller declines the meeting | Full refund | `decline_meeting` |
| Seller cancels after accepting | Full refund | `seller_cancel` |
| Buyer checks the item and confirms | Seller is paid | `confirm_handover` |
| Buyer rejects the item at the meeting | Full refund | `reject_at_meeting` |
| Nobody confirms by `meeting_time + grace_secs` | Full refund (anyone triggers) | `refund_after_deadline` |

Note the difference with digital: for a digital order, silence after unlocking pays the seller (the buyer already has the file). For an in-person order, silence after the meeting refunds the buyer (no confirmation means no proven exchange).

## Instructions

| Instruction | Signer | Requires | Effect |
| --- | --- | --- | --- |
| `create_order(order_id, amount, kind = Physical, content_hash = zeros)` | seller (+ `payer`) | amount > 0; for physical, `content_hash` must be all zeros | `Created` (today it fails with `PhysicalNotSupported`: lift that for physical) |
| `fund_and_schedule(meeting_time, place_hash)` | buyer | Physical; `Created`; buyer ≠ seller; `meeting_time > now`; `place_hash` ≠ zeros | USDC to the vault; `accept_deadline = min(now + accept_window_secs, meeting_time)`; `Funded` |
| `accept_meeting` | seller | Physical; `Funded`; `now < accept_deadline` | `release_deadline = meeting_time + grace_secs`; `Scheduled` |
| `decline_meeting` | seller | Physical; `Funded` | Refund; `Refunded` |
| `refund_unaccepted` | anyone | Physical; `Funded`; `now >= accept_deadline` | Refund; `Refunded` |
| `confirm_handover` | buyer | Physical: `Scheduled` (digital unchanged: `Delivered`) | Pay seller; `Released` |
| `reject_at_meeting` | buyer | Physical; `Scheduled`; `now >= meeting_time - 1800` | Refund; `Refunded` |
| `seller_cancel` | seller | Physical; `Scheduled` | Refund; `Refunded` |
| `refund_after_deadline` | anyone | Physical: `Scheduled` and `now > release_deadline` (digital unchanged) | Refund; `Refunded` |

Digital-only instructions (`fund`, `open_delivery`, `buyer_cancel`, `release_after_deadline`) keep failing on physical orders with `PhysicalNotSupported`. Physical-only instructions fail on digital orders with a new `WrongOrderKind`.

Implementation notes for the current layout (`solana/programs/closeby_escrow/src/`):

- New modules in `instructions/`: `fund_and_schedule.rs`, `meeting.rs` (`accept_meeting`), and the refunds `decline_meeting`, `refund_unaccepted`, `reject_at_meeting`, `seller_cancel` can reuse the `Refund` context (`refund.rs`) with a `require_seller` / time check each.
- `rules.rs`: add `require_physical` and `require_seller`.
- `errors.rs`: **append** at the end (codes are in the IDL): `WrongOrderKind`, `NotSeller`, `MeetingInPast`, `InvalidPlaceHash`, `AcceptWindowClosed`, `TooEarlyToReject`.
- `events.rs`: `MeetingScheduled { order, buyer, meeting_time }`, `MeetingAccepted { order, release_deadline }`. Refunds and releases reuse the existing events.
- The place itself stays off-chain (Supabase `deals.venue`); on-chain only its SHA-256. The web shows the venue only if its hash matches `place_hash`.

## Required failing tests

From the original spec, plus the kind checks:

- A stranger or the seller calls `confirm_handover`.
- The seller accepts after `accept_deadline`.
- `fund_and_schedule` with a meeting in the past, or buyer = seller.
- `refund_unaccepted` before `accept_deadline`; `refund_after_deadline` before `release_deadline`.
- `reject_at_meeting` a day before the meeting.
- Double confirmation or double refund.
- Any physical-only instruction on a digital order, and any digital-only instruction on a physical order.
- Every digital test still passes unchanged.

## Services (variant, no extra program code)

A service (a class, a repair, a session) is the same flow: the "meeting" is when the service happens, `place_hash` is the hash of where or how (an address, or "online" plus a link). The buyer confirms when the service is done. Only the UI copy changes. Not designed in detail: decide at 13:00 if it is worth mentioning in the demo.

## What it costs in the web

The larger part. Supabase already has `communes`, `time_slots` and `venue` on `deals` (migration 0001). Screens needed:

1. `/vender`: in-person option with communes and time slots.
2. Buyer: pick slot and meeting point → "Reservar con mi pago" (`fund_and_schedule`).
3. Seller: "Ana reservó $X para el sáb 16:00 en Metro Los Leones" → Aceptar / Rechazar.
4. Meeting mode (buyer, from 30 min before): "Recibí el producto: cerrar trato" / "No es lo que me ofrecieron".
5. `lib/escrow/rules.ts` (mock and `availableActions`) must mirror the new rules.

## Options for 13:00

| Option | Program (Alex) | Web | Recommendation |
| --- | --- | --- | --- |
| A. Digital only; in-person and services as "next" in the README and video, showing the program already reserves the fields | None | None | **Yes, unless block 4 is done early** |
| B. In-person, minimal | ~2–3 h with tests and upgrade | ~4–6 h (screens 1–5) | Only if the digital flow works end to end on Devnet before 15:00 |
| C. Services | As B | As B, plus copy | No for this hackathon |

Deadline reminder: feature freeze Saturday 20:00.
