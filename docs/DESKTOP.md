# KIT desktop app — phase summaries

Moved from the README during cleanup. Text is preserved unchanged; only link paths were adjusted. The full desktop plan is [design.md](design.md); per-phase evidence is in the linked phase documents.

## Desktop design phases 1 and 2

The interface now has five hubs (Inicio, Proyectos, Diseño, Biblioteca, KIT),
light/dark/system appearance, bundled fonts, persistent workspace tabs, preview
and pinned tabs, searchable history, recovery, and unsaved-editor confirmation.
Existing business routes remain available inside their hubs. KIT's full chat
and sidebar now share persisted conversations. File indexing and search are
described below.

With the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) installed:

```sh
npm run desktop:dev
npm run desktop:build
```

The bundled window runs the local sample workspace. To use the existing company
service, run `npm run build` and `NODE_ENV=production npm start`, then choose
**Abrir espacio de empresa**. The desktop shell opens the service at
`http://127.0.0.1:3001` in a separate window without native privileges, preserving
its existing cookie and authorization boundary. On Windows PowerShell, set
`$env:NODE_ENV="production"` before `npm start`. Automatic company synchronization
is still a later phase.

See [desktop implementation notes](DESKTOP_PHASES_1_2.md) for the phase 1/2
verification record and signing prerequisites.

## Desktop design phases 3 and 4

Open **Biblioteca → Archivos del equipo y permisos** in the local desktop
window to review exclusions and explicitly authorize read-only indexing.
Nothing is scanned before consent. The index uses SQLCipher and an OS-vault key.
Search combines app records, local files and optional personal cloud matches,
with explanations, grouped results, saved searches and safe file-preview tabs.
Connecting a company device enables role-scoped company record search without
uploading files. Those records open in the isolated company window.

Cloud uploads require separate consent and an approved provider adapter, region,
retention policy, encryption key and budget. They are disabled by default.
See [phase 3 and 4 setup, verification and release gates](DESKTOP_PHASES_3_4.md).
The macOS native binary now builds; Windows launch, signing and real-provider
acceptance checks remain required before release.

## Desktop design phase 5

The KIT workspace and right sidebar now use the same conversation records.
Company conversations persist in SQLite and support explicit context,
revisioned citations, draft artifacts, stopping, retry preparation, branching,
and Ask/Act modes. Act mode can only propose the small server allowlist of
actions, and every mutation requires a fresh authorization check and a specific
confirmation.

Files enter KIT only after the user separately approves and synchronizes them
to their personal encrypted company search namespace. KIT resolves the indexed
ID on the server and ignores renderer-supplied titles or contents. Revoked
sources are hidden immediately and changed hashes are marked stale. Local
originals stay behind the Tauri boundary.

Configure `KIT_CHAT_MODEL` together with `OPENAI_API_KEY` only after approving
a provider and data policy. Without them, conversations remain usable but
clearly report that generation is unavailable. See [phase 5 implementation and
security notes](DESKTOP_PHASE_5.md).

## Desktop phases 6 and 7

Not previously summarized in the README. See [DESKTOP_PHASE_6.md](DESKTOP_PHASE_6.md) (provider-neutral design pipeline) and [DESKTOP_PHASE_7.md](DESKTOP_PHASE_7.md) (sync and recovery foundation).
