# Closeby Devnet escrow

> **Scope (27 Nov):** this covers in-person orders. Digital goods are now the primary flow; their additions (`kind`, `content_hash`, `Delivered`, `open_delivery`, `release_after_deadline`, separate fee payer) are in [docs/escrow-changes.md](../docs/escrow-changes.md). The public deal ID (order PDA vs `order_id`) is still to be agreed.

This is the proposed integration contract for the first Devnet deal. Review the
rules with the API and program owners before publishing an IDL. The generated
IDL and deployed program are the integration contract for the web client.

## Accounts and amounts

- Derive each order PDA from `["order", seller_pubkey_bytes, order_id_u64_le]`.
  `order_id` is scoped to the seller. Store the seller, order ID, buyer, mint,
  amount in base units, proposed meeting time, both deadlines, status and bump.
- Use the original SPL Token Program and one team-approved Devnet test mint.
  Record the mint and its decimals in deployment documentation. Match the mint
  on every token movement and hold funds in a vault owned by the order PDA.
  Validate the vault address, mint, and authority before transferring.
- Debit the signing buyer's token account. For payout or refund, use the
  associated token account of the recorded seller or buyer respectively.
  Allow the transaction to create that account if missing. A refund caller
  may pay network fees and account rent. All escrowed funds go to the buyer.
- Keep the order as the settlement record. Transfer exactly the recorded amount
  once using checked token transfers. Update the order and move tokens in one
  transaction. Keep vault rent recovery and unsolicited token deposits out of
  the first slice.

## State transitions

Read the Solana Clock in each instruction. Store timestamps as Unix seconds
and calculate them with checked arithmetic. The first slice uses configurable
acceptance and handover windows. Bound the acceptance deadline by the proposed
meeting time so the seller cannot accept after the meeting has started.

| Instruction | Signer | Program checks and result |
| --- | --- | --- |
| `create_order` | Seller | Positive amount and configured mint. Create the order as `Created`. |
| `fund_and_schedule` | Buyer | `Created`, buyer differs from seller, meeting is in the future. Transfer into the vault, record buyer and deadlines, transition to `Funded`. |
| `accept_meeting` | Recorded seller | `Funded` and clock is strictly before the acceptance deadline. Transition to `Scheduled`. |
| `confirm_handover` | Recorded buyer | `Scheduled` and meeting time is at or before the clock, which is strictly before the release deadline. Pay the seller and transition to `Released`. |
| `refund_unaccepted` | Any signer | `Funded` and clock is at or after the acceptance deadline. Return funds to the buyer and transition to `Refunded`. |
| `refund_after_deadline` | Any signer | `Scheduled` and clock is at or after the release deadline. Return funds to the buyer and transition to `Refunded`. |

The release deadline is the meeting time plus the handover window. These
exclusive deadlines make the two eligible actions disjoint at the boundary.
A deadline makes a refund callable. An explicit transaction executes it.
Declines, early refunds and cancellations require separate product rules before
the UI offers them.

## Metadata and web integration

Use the base58 order PDA as the proposed public `dealId`. Encode the same
`/deals/[dealId]` URL in shared links and QR codes. Look up metadata by PDA and
derive it again from the returned seller and canonical decimal order ID. The
Supabase branch currently uses `order_id` as a global primary key. Migrate it
to support a unique order PDA and a unique `(vendedor, order_id)` pair before
integrating this mapping. Validate the range as unsigned 64 bits and encode as
eight little-endian bytes without a JavaScript number conversion.

Keep titles, photos, exact venues and personal data off-chain. Keep precise
venue details behind participant authorization if stored. Leave venue
commitments out of this slice until the team agrees on encoding and privacy.
Use the on-chain amount and mint when presenting a wallet approval. Treat
any CLP display alongside the test token as contextual.

After each wallet approval, verify the transaction on Devnet at `confirmed`
or stronger commitment. Check that it succeeded, invoked the expected escrow
instruction on the expected order, and was signed by the expected participant
for that action. Read the order at the same commitment and at or after the
transaction slot before displaying settlement. Recheck on reload and on wallet
resume. Preserve pending state on ambiguous RPC results and reread the order
before retrying. Make the signature available in Devnet Explorer.

## Release to Devnet

1. Build with a pinned Anchor and Solana toolchain. Generate program credentials
   under the team's deployment account and keep private keys outside the repo.
2. Test using two participants and an unrelated signer. Assert order status and
   actual token balance changes after funding, release, and both expiry refunds.
   Cover seller or third-party release, self-funding, wrong mint or payout
   account, early release or refund, exact deadline, duplicate funding and
   duplicate settlement. Assert that failed operations leave balances unchanged.
3. Deploy to Devnet and publish the program ID, generated IDL, test mint,
   decimals, deadline configuration and test-token setup. The browser uses
   funded test wallets. The API holds no wallet keys.
4. Run one real release and one expiry refund in Devnet. Verify both signatures,
   both receipt balances and both devices' deal pages. Include the iPhone and
   Android Phantom signing results.

References for implementing account checks and token movements:
[Anchor account constraints](https://www.anchor-lang.com/docs/references/account-constraints)
and [checked token transfers](https://www.anchor-lang.com/docs/tokens/basics/transfer-tokens).
