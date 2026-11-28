# Closeby docs

Start here. This folder is the shared memory of the project: product rules, decisions and plans. Every teammate works with an AI agent (Claude Code or Codex), so keep these files short, current and explicit enough that an agent can act on them without asking.

## Read in this order

1. [product.md](product.md): what Closeby is, who it is for, and the UX rules.
2. [flows/digital-sale.md](flows/digital-sale.md): the primary demo flow (digital goods), step by step, with every rule.
3. [escrow-changes.md](escrow-changes.md): what the Solana program must support. Shared contract between web and program.
4. [plan.md](plan.md): blocks, owners and checkpoints until submission. The program's own step-by-step plan is [program-plan.md](program-plan.md).
5. [decisions/](decisions/): why things are the way they are. One file per decision.

## Decisions

| # | Decision | Status |
| --- | --- | --- |
| [0001](decisions/0001-supabase-server-only.md) | Supabase is accessed only from the Next.js server | Accepted |
| [0002](decisions/0002-digital-goods-primary.md) | Digital goods are the primary flow; in-person sales are secondary | Accepted |
| [0003](decisions/0003-invisible-wallet.md) | Users never see a wallet: Privy embedded wallet, sponsored fees, one-button confirmation | Accepted |

## How to keep this folder useful

- **A decision changes the product, the program or the architecture?** Add `decisions/NNNN-short-title.md` (copy the structure of an existing one) and a row in the table above. Never rewrite an accepted decision: add a new one that supersedes it and mark the old one `Superseded by NNNN`.
- **A rule or flow changes?** Update the flow file in the same pull request as the code.
- **A plan block finishes or moves?** Update [plan.md](plan.md).
- Write in English (code, docs and commits). The UI is in Chilean Spanish.
- If something here contradicts the code, the code is the truth for what exists and this folder is the truth for what we agreed. Flag the mismatch instead of silently picking one.
