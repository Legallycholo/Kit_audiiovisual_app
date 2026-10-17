# Desktop Milestone 7 — sync and recovery foundation

Started: October 17, 2026

This increment begins Milestone 7 without selecting any external service. It
extends the existing optional company workspace and server revision contract.

## Implemented now

- A failed company PATCH caused by network loss is retained as one pending
  change batch instead of being discarded.
- The pending batch is encrypted at rest with AES-GCM. Its key is derived from
  the current random company session token material, so stored browser data does
  not contain readable record values.
- The pending local view survives reload while the same server session remains
  valid.
- Additional shared edits are blocked until the pending batch is synchronized
  or resolved. This avoids ambiguous local merge chains in the initial version.
- Retry first fetches the latest authorized server workspace and compares its
  revision with the pending batch's base revision.
- If the server revision advanced, KIT shows an explicit conflict review with
  the affected collection and record identifiers.
- Conflict resolution requires the user to choose either the current server
  records or to apply the reviewed local values on top of the latest revision.
  The normal server schema, role, event-scope, and business validation still run
  before local values can be accepted.
- Signing out is disabled while a batch is pending. A revoked or expired server
  session clears the inaccessible device queue and requires authentication
  again.
- The global workspace status visibly distinguishes synced, queued, syncing,
  and conflict states.
- Company HTTP responses now include a restrictive Content Security Policy,
  clickjacking protection, MIME sniffing protection, and a Permissions Policy
  that disables unused camera, microphone, location, payment, and USB access.

## Security boundary

This protects queued content at rest from casual local-storage inspection. It
does not claim to protect against malicious script running inside an already
authenticated application session. Content remains subject to the application's
XSS prevention, Content Security Policy, dependency review, and operating-system
account security.

## Current intentional limits

- One pending batch per authenticated company session.
- No background sync after the application is closed.
- No automatic field-level merge. A record value is only reapplied after an
  explicit conflict decision.
- No portable offline company cache; server records remain authoritative.
- Native encrypted queue storage, multi-batch compaction, sync tombstones,
  attachment transfer, and cross-device conflict history remain future work.
- Signed installers/updates, telemetry consent, support diagnostics, formal
  backup restore, cross-platform certification, and staff pilot acceptance are
  not complete.

## Verification

- Unit tests confirm ciphertext does not contain record values, is tied to the
  correct user/session, and reconstructs the pending view without mutating the
  server copy.
- Browser coverage simulates a failed PATCH, verifies encrypted reload recovery,
  advances the server from another session, requires conflict review, applies
  the reviewed local value, and confirms queue deletion after success.

Milestone 7 remains in progress. This increment supplies the safe conflict
contract needed before broader offline synchronization and release hardening.
