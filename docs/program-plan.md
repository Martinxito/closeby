# Program plan: Aaron, then Alex

**Owners:** Aaron (first), Alex (after Aaron hands off). **Written:** Saturday 28 Nov 2026, 00:30 (Chile).
**Contract:** [escrow-changes.md](escrow-changes.md). The web already codes against those names, so do not rename anything without telling Martín and Diego.

## Why 13:00 matters

13:00 Saturday is a **team** checkpoint, not a Dev3pack deadline ([plan.md](plan.md)):

| Time (Sat 28) | What happens | Needs the program? |
| --- | --- | --- |
| 10:00–12:00 | Dev3pack feedback session: we show the mocked flow | No |
| **13:00** | **Sync: program ID, IDL and test mint handed to the web** | **Yes** |
| 13:00–18:00 | Web swaps the mock for the real program; end to end on Devnet with two accounts and two phones | Yes |
| 20:00 | Feature freeze: only README, video and the form after this | — |
| 23:00 | Team submission target | — |
| Sun 29, 04:00 | Dev3pack hard close | — |

If the program is late, block 4 shrinks and the real flow may not be ready for the video. Without a deployed program address, the Dev3pack form cannot be submitted at all.

## Scope

Digital orders only. In this order:

`init_config`, `create_order`, `fund`, `open_delivery`, `buyer_cancel`, `confirm_handover`, `refund_after_deadline`, `release_after_deadline`.

Physical-only instructions (`fund_and_schedule`, `accept_meeting`, `decline_meeting`, `reject_at_meeting`, `seller_cancel`, reschedule, `refund_unaccepted`) are out until the 13:00 sync decides otherwise. `create_order` still takes `kind` so they can be added later without breaking the web.

Design rules agreed:

- Every instruction has a `payer: Signer` separate from `seller`/`buyer`: our server's fee payer pays fees and rent ([decisions/0003](decisions/0003-invisible-wallet.md)).
- The web creates the buyer's and seller's USDC token accounts (idempotent ATA instructions) before calling the program, so the program only validates them and needs no `init_if_needed`.
- Vault: USDC token account whose authority is the order PDA. Money goes only to the recorded buyer or seller, never to the caller.
- `require!` with custom errors for every rule. Error names match `apps/web/lib/escrow/types.ts` (`EscrowErrorCode`) where they overlap.

## Toolchain (as installed Sat 28 Nov, 01:00)

Anchor CLI **1.2.2**, Solana CLI **3.1.10** (chosen by `avm` for Anchor 1.2.2), Rust stable. From `solana/`:

```sh
pnpm install                 # from the repo root, once
pnpm --filter @closeby/solana build    # anchor build --arch v0
pnpm --filter @closeby/solana test     # 27 tests on solana-test-validator
```

Two things that bite:

- **Always build with `--arch v0`.** Anchor 1.2.2 defaults to SBPF v3, which the 3.1.10 validator rejects ("Program is not deployed"). v0 runs on every cluster.
- **Tests use `--validator legacy`** (solana-test-validator). Surfpool, Anchor's new default, failed with "Blockhash not found" against web3.js v1.

The program keypair (`solana/target/deploy/closeby_escrow-keypair.json`, gitignored) fixes the program ID `4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT`. Whoever redeploys needs that file and the upgrade authority keypair: share them privately, never in the repo.

## Aaron

Progress: 1 to 6 done on Sat 01:20 (27 tests passing, program on Devnet). Next: 7.

| # | Task | Done when |
| --- | --- | --- |
| 1 | `git pull` on `main`; reply ✅ to [escrow-changes.md](escrow-changes.md) in the team chat | Team knows the contract is accepted |
| 2 | Install Rust, Solana CLI and Anchor (official installer) | `anchor --version` and `solana --version` work |
| 3 | Create the Anchor workspace in `solana/` and write the program (scope above) | `anchor build` passes |
| 4 | Tests (`anchor test`): happy path, both deadline outcomes, and every failing case in escrow-changes.md | All tests pass |
| 5 | Create the deploy keypair (outside the repo), send it ~3 Devnet SOL from Phantom, `solana config set --url devnet` | Balance shows in `solana balance` |
| 6 | Deploy to Devnet; check the program in the explorer (Devnet): "Executable: Yes" | Program ID recorded below |
| 7 | Call `init_config` ourselves right away (first caller becomes admin): mint = `USDC_MINT` from `setup-devnet`, claim 600 s, review 300 s | Config account exists |
| 8 | Commit on a branch (`feat(escrow): ...`), open a PR, send Martín and Diego the program ID, IDL path and mint | Web team has what it needs |
| 9 | Hand off to Alex with this file updated | Alex starts his part |

Never commit keypairs (`*.json` wallets, `.env*`), and never share Phantom's recovery phrase with anyone or any AI.

## Alex (after Aaron's hand-off)

| # | Task | Done when |
| --- | --- | --- |
| 1 | Pull the branch, run `anchor build` and `anchor test` on his machine | Tests pass for him too |
| 2 | Read the program end to end and be able to explain every instruction and check (judges inspect the code) | He can explain it without notes |
| 3 | Add any missing failing test he finds while reading | Tests pass |
| 4 | Help the web integrate: build the instructions from the IDL for `lib/escrow` chain mode, together with Martín | One real `create_order` + `fund` on Devnet from the web |
| 5 | Fix what integration finds (redeploy to the same program ID if needed) | End-to-end flow works on Devnet |
| 6 | README program section: program ID, mint, config values, instructions and rules, how to run the tests; flow diagram (Excalidraw screenshot) | Section merged before 20:00 |
| 7 | Only if the 13:00 sync approves and time allows: physical instructions | Decided at 13:00 |

## Deployment record

Fill in after step 6 and 7:

| Item | Value |
| --- | --- |
| Program ID (Devnet) | `4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT` (deployed Sat 28 Nov, slot 527104436) |
| Config PDA | |
| Test USDC mint | |
| `digital_claim_secs` / `digital_review_secs` | 600 / 300 |
| Deploy transaction | `TWcRsxwuWaLiXqcMMuSej1ZpejzpHSndLL8CddNfmWhJPTgewwpDKg9qgqFGv3LYBVvCP4rEQc2mDiBvCi1qtVi` |
| Upgrade authority | `J2m4KAUHetgikUpGYgGVtDw7tuhKVXzgcouTycjJavix` |
| ProgramData | `9xesLoZxwRJJfw8LnDc5Yd46acrnPZwad555prvnTjKB` |
| `init_config` transaction | |
