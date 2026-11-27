# 0002: Digital goods are the primary flow

- **Status:** Accepted, 27 Nov 2026.
- **Decided by:** web team (Martín, Diego). Program changes pending agreement with Alex and Aaron ([escrow-changes.md](../escrow-changes.md)).

## Context

Closeby started as escrow for in-person sales. The team added digital goods (audio, video, images, reports, files). With about 27 hours left, we need one flow that works end to end and demos well in a video of 2–3 minutes.

## Decision

1. **Digital goods are the primary demo flow.** In-person sales use the same program and are built only if time allows.
2. **Unlocking the file is the point of no return.** Before unlocking, the buyer can cancel for a full refund. After unlocking, the buyer confirms with one button, or the seller is paid automatically when the review window ends. There is no refund after unlocking (no disputes in this version).
3. Before paying, the buyer sees a **preview** (audio clip, watermarked image, first page). The full file is private until unlocked.
4. The file's SHA-256 is stored on-chain (`content_hash`) as proof of what was sold.

## Why

- A digital sale can be demoed from one laptop, with no meeting to coordinate.
- Without rule 2, a buyer could download and then get a refund, keeping both the file and the money.
- Without rule 2's timeout, a buyer who downloads and disappears would block the seller's money forever.

## Consequences

- The program needs `kind`, `content_hash`, a `Delivered` status, `open_delivery` and `release_after_deadline` ([escrow-changes.md](../escrow-changes.md)).
- The UI must warn clearly before unlocking: "Al desbloquear el archivo ya no podrás cancelar."
- Downloads are served only by our server after checking the on-chain status and buyer.
