# Desktop phase 5: shared KIT conversations

Scope: milestone 5 in [design.md](design.md). The development implementation is
complete. Production acceptance still requires the provider, privacy, native,
and representative-data gates below. Automated tests use explicit provider
fixtures and do not send company data to a live model.

## Delivered

- The full KIT workspace and right sidebar use one shared store and active
  thread. Moving between them preserves messages, draft context, and thread ID.
- Company threads persist in SQLite per account. Sample-mode threads remain
  visibly local browser examples and never simulate a successful AI response.
- Conversations support naming, project assignment, search/filtering, deletion,
  export, branching, stop, retry preparation, and edit-and-resend preparation.
- Messages preserve status, model, source revisions, citations, artifacts, and
  explicit error states. Changed sources are marked stale and revoked sources
  become unavailable instead of exposing cached content.
- Context is opt-in. Project, proposal, small explicit text attachment, and
  approved indexed-file references appear as removable chips before submission.
- Ask mode rejects provider-proposed actions. Act mode allows only task creation
  and proposal-draft generation for an attached authorized project. The server
  validates roles, source freshness, and workspace revision again at confirmation
  time, then records an audit event.
- Existing proposal generation is available through the shared provider boundary
  and returns a review artifact. It does not save or send a proposal automatically.

## Indexed-file security boundary

An indexed file is eligible for KIT only after local read consent, separate cloud
consent, successful synchronization, and a valid personal company-device
connection. The UI sends an opaque 64-character indexed source ID. The server
resolves that ID inside the authenticated user's encrypted search namespace and
ignores any renderer-supplied title or content.

The server rechecks source state and hash before generation and before confirmed
actions. Cloud revocation makes the source unavailable immediately even while
provider deletion is retrying. A changed source hash leaves the historical answer
and revision intact but labels it stale. Common secrets are redacted during search
ingestion and again before KIT context assembly. Context is limited to 16,000
characters per source and eight sources per request.

Company citations open an inert approved-source excerpt. The company webview has
no native filesystem capability. A synchronized local preview can open the
company KIT thread through the narrow Tauri window command, while the original
file remains accessible only through native indexed-ID commands in the local
window.

## Verification

Verified on this development machine: the production frontend build, all 80
unit/API tests, and all 44 browser scenarios pass. The browser suite includes
the real Express/session/SQLite boundary with fixture model responses. Rust was
not rerun in this pass because the current shell does not have `cargo` installed;
the native change only extends the already validated company-window route
allowlist to the `kit` and `search` modules and still requires native acceptance.

The automated suite covers:

- Account-scoped indexed source resolution and encrypted storage.
- Secret redaction before model context.
- Source hash changes, revocation, and unavailable citations.
- Ask-mode action rejection and confirmation-only task creation.
- A real company API/database browser journey with a cited project source.
- Full-workspace/sidebar continuity and accessibility in sample mode.

Run:

```sh
npm run build
npm test
npm run test:browser
cargo test --manifest-path native/file-index/Cargo.toml --locked
cargo build --manifest-path src-tauri/Cargo.toml --locked
```

## Release gates, not claimed complete

- Approve the production chat provider, model, region, retention terms, budget,
  and deletion behavior. Exercise it with representative approved documents and
  adversarial prompt-injection fixtures.
- Run the signed native application on Windows and macOS. Verify the local-to-
  company-window handoff, vault prompts, session expiry, source revocation, and
  stale-hash behavior using a small approved fixture directory.
- Complete an independent privacy and security review of full-home indexing,
  parser isolation, source citations, provider logging, and action audit records.
- Validate response quality, citation usefulness, rate limits, cost controls,
  long-thread behavior, cancellation, and recovery during provider outages.
- Confirm which roles may use KIT and each Act-mode operation with business
  owners before production rollout.

Milestone 6 can now build the measured floor-plan workflow on the shared context,
provider, provenance, confirmation, and background-state patterns established
here.
