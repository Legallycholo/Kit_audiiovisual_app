# Desktop design phases 1 and 2

Implementation scope: milestones 1 and 2 in [design.md](design.md). The user's
move of the plan from the project root to `docs/design.md` is preserved.

## Delivered

- Tauri 2 entrypoint, restricted main-window capability, native icons, window
  geometry persistence, packaged routing, and desktop development/build commands.
- Five primary hubs with role-filtered links to all existing modules.
- Light, dark, and system appearance; bundled DM Sans and Manrope fonts; module
  surface adaptation; responsive workspace and KIT sidebar.
- Automatic resource tabs with canonical route identity, preview replacement,
  pinning, duplication, movement, link copying, close/close others/close right,
  recently closed recovery, keyboard shortcuts, and tab navigation history.
- Per-user/mode session snapshots and searchable activity history in local storage.
  History supports type/date filters, individual removal, filtered deletion, and
  clearing all entries. Storage errors are reported instead of silently ignored.
- Normal restart restoration and an explicit recovery choice after an unclean exit.
  A deliberate browser navigation to Home within an existing session stays on Home.
- Save, Discard, and Cancel for the existing proposal and layout editors when
  switching or closing tabs. Save failures keep the editor open. Native main-window
  close requests also pass through the guard.
- Company service entry opens the existing loopback service in a separate window
  without native capabilities. It requires the built server to be running on port
  3001. No remote synchronization or new authentication protocol is introduced.

## Verification and limits

- TypeScript and Vite production build passed.
- All 63 unit/API tests passed, including new session identity and recovery-data tests.
- All 39 browser scenarios passed in the final full run. Existing business,
  accessibility, responsive, and 3D browser scenarios passed
  after updating the navigation assertion from Events to Projects.
- New browser scenarios cover restore, history deletion, previews, unsaved editor
  saves, crash recovery, and dark-mode accessibility across representative screens.
- Native compilation was attempted and stopped because `cargo` is not installed
  in the current environment. Windows and macOS application launches, native
  close handling, company-window isolation, installers, and signing still require
  execution on machines with the Tauri prerequisites. Browser tests are not proof
  of native WebView behavior.
- Session metadata uses local storage in this phase. It contains titles and routes,
  not file contents. The encrypted indexing store belongs to phase 3.
- Unsaved drafts are not serialized into tab snapshots. The existing layout draft
  recovery remains available; proposal changes require an explicit save.
- Files, generated artifacts, and chat resources have registry types for later
  integration; the app does not pretend those later services already exist.

## CI and signing

`.github/workflows/desktop.yml` runs browser and unit tests and compiles native
development binaries on Windows and macOS. It uploads artifacts without publishing
a release. Signed installer builds are an explicit workflow-dispatch option.

Required macOS secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`.
Required Windows secrets: `WINDOWS_CERTIFICATE` (base64 PFX) and
`WINDOWS_CERTIFICATE_PASSWORD`. Certificates are imported only on the temporary CI
runner. Missing signing credentials fail the signed build rather than implying
that an unsigned installer is signed.

No certificates were supplied or signed installers produced during this change.
Native and signing verification remain release acceptance requirements for phase 1.

## Next verification

On a machine with Rust and the native platform tools, run `npm run desktop:dev`,
exercise sample and company modes, then run `npm run desktop:build`. Verify
window close confirmation, reopen restoration, permissions, and both native
webviews before accepting the desktop release.
