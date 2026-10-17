# Desktop phases 3 and 4

Scope: milestones 3 and 4 in [design.md](design.md). These features are implemented
for development testing. Production acceptance still requires the release gates
below. No personal home directory was scanned and no real document was uploaded
during implementation.

## Phase 3: local files

- Library has a dedicated permission and indexing page. Read-only home access is
  opt-in, with editable relative-path exclusions, permanent sensitive/cache
  exclusions, pause/resume, rescan/retry, rebuild and revocation.
- Only the local Tauri main window can invoke native file commands. The company
  window has no native file capability. Commands resolve indexed IDs, not arbitrary
  renderer-provided paths. Directory traversal uses non-following capability handles.
- SQLCipher encrypts metadata, extracted content and FTS5. The random encryption
  key lives in macOS Keychain or Windows Credential Manager, with no plaintext
  fallback. Missing keys fail closed. Back up the key and encrypted database together.
- Background discovery validates supported types and hashes bytes. Watcher events
  schedule reconciliation. Excluded events do not trigger index self-loops. Content
  hash checks catch same-size edits and avoid reparsing unchanged files.
- PDF, DOCX, PPTX, XLSX, UTF-8 TXT/Markdown/CSV and PNG/JPEG/WebP names are indexed.
  Rich extraction runs in a child process with bounded input/output and a 15-second
  timeout. Archive expansion is limited to 8 MB; DTDs are rejected. Text is limited
  to one million characters. Images are limited to 40 megapixels.
- Safe previews render plain text or validated raster images. They recheck permission
  and content hash. External opening requires explicit confirmation and uses the OS
  default application. Originals are never modified or deleted by the indexer.
- Optional image OCR uses a trusted, absolute `KIT_TESSERACT_PATH` inherited by the
  native process. Install Tesseract plus `eng` and `spa` traineddata separately, then
  enable OCR in file settings. The engine receives bytes through stdin and returns
  text through stdout. No shell command string or renderer-supplied executable runs.
  See the [Tesseract command-line documentation](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html).

### Coverage and limits

- Maximum 20 MB per file, 100,000 discovered files and 30 directory levels per scan.
  Local queries consider 100 matches and verify up to 50 MB of live source bytes.
  Narrow the query or exclusions if coverage is incomplete.
- No symlink traversal, network shares outside home, legacy DOC/XLS/PPT parsing,
  visual image recognition, or OCR of scanned PDF pages. An image named for Rolando
  can match without OCR; a photo of him is not automatically identified.
- Document previews show up to 100,000 characters. Parsing preserves searchable
  text, not original Office layout or spreadsheet formulas as rendered values.
- Pause stops discovery and uploads, not authorized previews or search. Revocation
  stops later reads and clears indexed content. Changing exclusions or OCR rebuilds
  the local index and requires renewed cloud consent. Local revocation does not erase
  tab/history metadata or saved query names; clear those through their own controls.
- Errors are visible locally. Permission failures can omit sources. Native consent
  does not override macOS privacy controls or Windows ACLs. On reopening, previously
  approved indexing resumes when file management/search initializes the native service.

## Phase 4: universal search

- Unified typed results include projects, clients, proposals, creative images,
  venues, equipment and local files. Client/contact matches expand to related
  projects, proposals and creative assets. Results carry source labels, excerpts,
  match reasons and deterministic relevance ordering. Grouping and type filters
  are optional. Saved searches are per workspace mode/user, capped at 30.
- App-record scope is enforced before relationship matching. Cloud results are
  personal to the current company user, not shared with every employee. Provider
  results are intersected with authorized, ready source records before display.
- A company device connection enables server-scoped record search from the local
  desktop window without cloud uploads. Connected company results replace sample
  records in that search. Opening a company result focuses its isolated company
  window and uses normal tabs and unsaved-draft confirmation. The service must be
  running; company records are not cached for offline access in this phase.
- The company window searches its app records and optional cloud file index. It
  never gains home-folder access. Local originals open only from the local window.
- Cloud text is secret-redacted, chunked at 2,000 characters with 200-character
  overlap, encrypted at rest with AES-256-GCM in the service queue, and sent through
  a server-only provider boundary. Redaction is a heuristic, not a guarantee.
- Vector namespaces include a persistent company ID and user ID. Native source IDs
  also include a persistent device namespace. Same hashes skip repeated uploads.
- Uploads are explicit batches of up to 20. Local changes queue stale remote copies
  for deletion. Native deletion reconciliation retries every 30 seconds after the
  file service initializes; server reconciliation retries every 30 seconds while
  running. Server deletion requests hide sources immediately and retry until the
  provider confirms. Offline clients cannot notify an unreachable server immediately.
- Tombstones are persisted before uploads, including ambiguous network failures.
  Upload/revoke operations are serialized. Account revocation is checked on queries
  and uploads; the server worker queues disabled/guest accounts for deletion.
- Common secrets are removed before embedding. Audit records contain source IDs,
  counts and operation metadata, not raw file text or search queries. Administrators
  can inspect `/api/search/admin`. Device tokens are hashed server-side, expire in
  30 days, and live in the OS vault on the desktop, never browser local storage.

## Configure and use

1. Start the existing company service on `127.0.0.1:3001` when company search is needed.
2. In the company window, open Library file settings and create a device token.
3. Paste it into the local desktop file settings. This grants scoped company record
   search; it does not authorize uploading computer files.
   When the token expires, create a fresh token for the same account and reconnect.
   Disconnect and confirm deletion before switching to a different account.
4. Authorize local read-only indexing and review exclusions. Search works without
   any embedding provider.
5. To enable semantic cloud search, an administrator must configure every search
   setting in `.env.example`. `KIT_SEARCH_ENCRYPTION_KEY` is exactly 32 random bytes,
   hex encoded. Keep it server-only and securely backed up. Never use `VITE_` secrets.
6. Review provider name, region, retention and budget in the UI. Separately authorize
   cloud text transfer, then synchronize batches. Failures remain visible and retryable.
7. Revoke from desktop settings, or revoke all device tokens in the company window.
   The latter also requests deletion of all personal sources for that account.
8. Confirm deletion before changing provider endpoint, name, region or retention.
   The server refuses policy changes while old-policy sources remain. Never replace
   the encryption key while queued data still needs decryption.

### Provider adapter contract

`KIT_SEARCH_PROVIDER_URL` must be an HTTPS adapter implementing these JSON POST
endpoints. It is not a raw OpenAI or vector-database base URL. Authentication uses
the server-only provider bearer token; redirects are rejected and requests time out.

| Endpoint          | Request                                                 | Required response                                            |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `embeddings`      | `{ input: string[] }`                                   | `{ vectors: number[][] }`, ordered and finite                |
| `vectors/replace` | `{ namespace, source, chunks: [{ id, text, vector }] }` | Successful JSON response after atomic per-source replacement |
| `vectors/query`   | `{ namespace, vector, limit }`                          | `{ matches: [{ source, score }] }`                           |
| `vectors/delete`  | `{ namespace, source }`                                 | `{ confirmed: true }` only after deletion completes          |

The adapter must enforce namespace isolation, idempotent replacement/deletion,
approved regional storage and retention, and must never follow document instructions.
Provider keys remain outside the renderer. No commercial adapter or paid account
has been selected or deployed by this change.

Budget reservations use the configured cents-per-1,000-characters rate, rounded up
per operation, before embedding work. Failed operations retain their reservation.
This is a conservative application ledger, not a reconciliation of provider invoices.
Configure provider-side spending limits for vector storage, query charges and other
fees not represented by this character rate. Deletion is never blocked by the budget.

## Verification

Verified on this macOS development machine: production frontend build, 76 unit/API
tests, 42 browser scenarios, 9 Rust core tests, the child-parser fixture, and a
native macOS debug binary build. Browser IPC tests are not native WebView tests.
Build output still reports the existing large JavaScript chunk warning.

Commands:

```sh
npm run build
npm test
npm run test:browser
cargo test --manifest-path native/file-index/Cargo.toml --locked
cargo run --manifest-path native/file-index/Cargo.toml --example fixture --locked
cargo build --manifest-path src-tauri/Cargo.toml --locked
```

Tests cover relationship matching, tenant/user isolation, encrypted queued payloads,
secret redaction, budget exhaustion, device authorization, policy changes, deletion
retries, source revocation, encrypted local storage, same-size edits, symlinks,
Office parsing, invalid signatures, saved searches and tabs. A browser IPC fixture
checks consent, pause and revoke UI without reading real folders. The Rust example
exercises the actual child parser using only a temporary home and DOCX/text fixtures.
Desktop CI runs native tests and that fixture on macOS and Windows.

## Release gates, not claimed complete

- Manually launch signed Windows and macOS builds. Exercise OS-vault prompts, native
  permissions, privacy denials, external file opening, company-window handoff and
  restart/revocation races. macOS compilation is not proof of Windows behavior.
- Rich parsers have crash/time/output isolation, not a full OS-level filesystem,
  network and memory sandbox. Add and independently test platform sandboxing and
  resource controls before processing untrusted company collections at production scale.
- Install and verify real OCR engines/models on both platforms. The current machine
  has no configured OCR engine, so real OCR accuracy has not been tested.
- Approve and validate a real embedding/vector adapter, privacy contract, budget,
  backup behavior and deletion SLA. No real-provider upload, billing or deletion
  guarantee is asserted by fixture tests.
- Benchmark representative large collections against the roadmap targets. Live
  hash validation and full watcher-triggered reconciliation prioritize correctness
  over incremental per-path performance. The scan limits are visible, not hidden.
- Review SQLCipher/OpenSSL, parser and OCR dependency licenses and security updates
  before distribution. Protect database/key backups and account for retained copies
  in the company deletion policy. Encrypted local deletion is not a promise to erase
  independent OS snapshots or backups.

Recommended next step for phases 3 and 4: run the native acceptance checklist
with a small approved fixture folder, then approve a provider if cloud semantic
search is wanted. Phase 5 now builds KIT conversations and citations on these
explicit permission boundaries; its separate acceptance notes are in
[DESKTOP_PHASE_5.md](DESKTOP_PHASE_5.md).
