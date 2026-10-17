# KIT Desktop App Design Implementation Plan

Status: Planning only  
Prepared: October 16, 2026  
Target platforms: Windows and macOS

## 1. Overview and goals

KIT will become a local-first desktop workspace for audiovisual production. It will preserve the existing app's business capabilities while reorganizing them into fewer, clearer hubs. The desktop app will combine projects, files, search, design work, and an AI agent named KIT in one consistent workspace.

The current repository already provides a React and TypeScript interface, an Express and SQLite company service, role-based access, a Three.js design workspace, business modules, basic search, and an unfinished KIT sidebar. This plan evolves that foundation rather than replacing it.

### Product goals

1. Make any important item reachable in one or two actions.
2. Let users move between projects, files, searches, designs, and chats without losing their place.
3. Make KIT available as both a full workspace and a quick sidebar.
4. Search the user's computer and company records from one search box.
5. Turn a floor plan into a reviewed, editable 3D room and exportable video.
6. Keep AI access, file access, and cloud processing understandable and reversible.
7. Deliver a premium, uncluttered interface using the company's red, blue, and green colors.

### Success criteria

- A new user can locate a project, client, file, design, or KIT chat without training.
- Global search returns useful results within 1 second for local keyword search and within 3 seconds for cloud semantic results under normal network conditions.
- Opening an existing resource focuses its current tab instead of creating duplicates.
- Open and pinned tabs, chats, searches, and file history survive an app restart.
- Every KIT response based on files identifies its sources and access scope.
- A first-time user can move from floor-plan upload to a navigable 3D draft without leaving the Design workspace.
- All primary workflows are usable by keyboard and meet WCAG 2.2 AA contrast and focus requirements.

> **Suggested improvement:** Treat events as projects in the interface while retaining the existing event data model. "Projects" is easier to understand as the main work container, but the terminology change requires careful Spanish translation and migration copy.

## 2. Assumptions and open questions

### Confirmed direction

- Preserve current functionality and reorganize it into fewer hubs.
- Ship native Windows and macOS applications.
- Use a local-first model with optional company-server synchronization.
- Support the full internal team with role-based access.
- Keep Spanish as the default interface language and add optional English.
- Restore open and pinned tabs and searchable history after restart.
- Use one conversation system for full-page KIT and the sidebar.
- After explicit consent, allow read access across the user's home directory.
- Allow approved files to be indexed and processed by a cloud AI service after initial consent.
- Prioritize floor plans and measured, editable 3D rooms before room-photo reconstruction.
- Export 3D work as MP4 video and GLB model files.

### Assumptions requiring confirmation

- **Supported operating systems:** Windows 11 and the three most recent major macOS versions at release time. Windows 10 is excluded unless the business requires it.
- **Connectivity:** Core project work, local file browsing, keyword search, and tab history work offline. Cloud semantic search, KIT generation, and cloud-assisted floor-plan extraction require a connection.
- **AI provider:** The architecture remains provider-neutral. The current OpenAI adapter can be used for an initial integration, but it is not a final provider commitment.
- **Cloud budget:** No monthly processing budget was provided. The plan therefore includes admin limits, per-job estimates, and usage reporting before cloud work begins.
- **Search scale:** The first production target is up to 100,000 indexed files per device and 25 GB of extracted text and image metadata.
- **3D accuracy:** Generated rooms support planning and visualization. They are not architectural, structural, rigging, lighting, or safety certifications.
- **Video output:** The first export is H.264 MP4 at 1080p, with a selectable 15, 30, or 60 second camera path.
- **Brand palette:** The color values in this document are proposed tokens and require a final brand and accessibility review.
- **File writes:** Home-directory permission is read-only. Exporting or changing a file requires a separate save location chosen by the user.

### Open decisions

1. Select the production AI, embedding, OCR, and cloud vector providers.
2. Approve monthly and per-user AI budgets.
3. Confirm Windows 10 support or exclusion.
4. Decide whether company sync is required for the first public release or follows the local desktop release.
5. Approve data retention, regional hosting, and contractual requirements for cloud-indexed files.

> **Suggested improvement:** Run a two-week provider and cost spike before committing to cloud indexing or 3D extraction. This delays provider selection slightly but prevents locking the product to an expensive or weak-quality service.

## 3. User flows

### 3.1 First launch and desktop permission

1. The user selects Spanish or English and signs in or opens a local workspace.
2. KIT explains that it can search files in the home directory and that approved content may be indexed in the cloud.
3. The consent screen shows:
   - The exact home-directory path.
   - File types that will be indexed.
   - Default excluded locations and file patterns.
   - Whether file text, thumbnails, and embeddings leave the device.
   - The selected cloud provider, retention policy, and deletion behavior.
   - An estimated file count, upload size, and initial indexing time.
4. The user can review exclusions, accept broad read-only access, or continue without file access.
5. The app requests required operating-system permission and begins indexing in the background.
6. A persistent status center shows scanned, indexed, skipped, failed, and cloud-uploaded counts.
7. The user can pause, change exclusions, or revoke access from Settings at any time.

> **Suggested improvement:** Although broad home access is the selected model, onboarding should recommend starting with Documents, Desktop, and Pictures. Full-home indexing is more complete, but a smaller initial scope is faster and less likely to include secrets or irrelevant files.

### 3.2 Search for "Rolando"

1. The user presses `Cmd/Ctrl + K` or selects Search.
2. The user enters `Rolando`.
3. KIT searches local filenames, extracted text, OCR text, app records, and cloud semantic matches.
4. A new persistent tab named `Search: Rolando` opens automatically.
5. Results are grouped into People and clients, Projects, Proposals, Documents, Images, Conversations, and Other files.
6. Each result shows why it matched, its location, modified date, access status, and a short highlighted excerpt.
7. Selecting a result opens or focuses its resource tab. Files open in an internal preview when supported, with `Open in default app` as a secondary action.
8. The search remains in History and can be rerun or pinned.

### 3.3 Use KIT from the sidebar

1. The user opens the right sidebar from any screen.
2. KIT displays the active conversation and visible context chips for the current project, file, search, or design.
3. The user removes unwanted context chips or adds files.
4. The user asks a question.
5. Before processing, KIT shows the scope it will search. Sensitive or excluded content is never silently added.
6. KIT responds with citations that open their source in a tab.
7. Selecting `Open full chat` moves the same conversation to the KIT workspace without losing context.

### 3.4 Use full-page KIT

1. The user opens KIT from the left navigation.
2. The page shows conversation history, the selected thread, and generated artifacts.
3. The user can start a new chat, continue a sidebar chat, search chats, attach files, or choose a project context.
4. KIT requests confirmation before any action that changes app records, writes files, exports content, or sends information externally.
5. Outputs such as a proposal draft, search collection, report, or design brief open automatically in a new tab and remain linked to the source chat.

### 3.5 Convert a floor plan to a 3D room video

1. The user opens Design and selects `New room from floor plan`.
2. The user uploads PNG, JPEG, WebP, or PDF and confirms that they have permission to use it.
3. The app checks image resolution, legibility, orientation, and whether a scale can be detected.
4. The user confirms one known measurement, ceiling height, units, and room name.
5. Cloud vision extracts walls, doors, windows, and labeled areas into structured geometry.
6. The app overlays the detected geometry on the original image and highlights low-confidence items.
7. The user corrects the 2D draft before 3D generation.
8. The validated geometry becomes an editable Three.js room using the existing shared scene model.
9. The user adds equipment, materials, lighting placeholders, and camera positions.
10. The app previews a camera path, estimates export time and cloud cost, and renders the output.
11. The user exports an MP4 video, GLB model, 2D plan, or a saved design revision.

> **Suggested improvement:** Require a human geometry review before video rendering. One extra review step reduces impressive-looking but dimensionally incorrect outputs and avoids spending money on unusable renders.

## 4. Information architecture and navigation

### 4.1 Primary navigation

Use five primary destinations. Settings, Help, notifications, Search, and History remain utilities rather than primary sections.

| Destination | Purpose                                       | Existing capabilities grouped here                      |
| ----------- | --------------------------------------------- | ------------------------------------------------------- |
| Home        | Priorities, recent work, reports, alerts      | Dashboard, report summaries, recent activity            |
| Projects    | Work organized around each event or job       | Events, proposals, inbox, production, project inventory |
| Design      | Floor plans, 3D rooms, creative concepts      | Design Studio, AI Creative Studio                       |
| Library     | Reusable people, places, equipment, and files | Clients, venues, contacts, equipment, indexed files     |
| KIT         | Full AI conversation workspace                | New dedicated chat, AI proposal help, agent outputs     |

Settings appears at the bottom of the left rail. Global Search, History, notifications, and the KIT sidebar appear in the top bar.

### 4.2 Navigation rules

- Left navigation never exceeds five primary destinations.
- Each destination has a landing page with a small set of local tabs or filters.
- Project detail is the main operational container. It exposes Overview, Files, Proposal, Design, Messages, Production, and Activity as horizontal local tabs.
- Global Search searches all app records and authorized computer files.
- Breadcrumbs describe hierarchy but are not required for routine navigation.
- Back and forward actions follow tab history, not only URL history.
- User role controls visibility and actions, but hidden items must never be the only explanation for a missing capability. Show an access explanation where appropriate.

> **Suggested improvement:** Move Reports into Home and project summaries instead of keeping a separate top-level destination. This reduces navigation clutter, but advanced reporting users need a saved link or Home shortcut.

## 5. Layout wireframes

### 5.1 Standard workspace

```text
+--------------------------------------------------------------------------------------+
| Window controls | Back Forward | Search anything... Cmd/Ctrl+K | History | Ask KIT   |
+------------------+-------------------------------------------------------------------+
|                  | Tab: Project Alpha  | Tab: Rolando Search | Tab: Floor Plan  | +   |
|  KIT logo        +---------------------------------------------------+---------------+
|                  |                                                   | KIT           |
|  Home            |  Page title                       Primary action | Context chips |
|  Projects        |  Supporting description                          | [Project] [x] |
|  Design          |                                                   | [File]    [x] |
|  Library         |  Main content                                     |---------------|
|  KIT             |                                                   | Conversation  |
|                  |  Lists, canvas, preview, editor, or dashboard      | and citations |
|                  |                                                   |               |
|                  |                                                   |               |
| ---------------  |                                                   |---------------|
| Settings         |                                                   | Ask KIT...  > |
| Profile and sync |                                                   |               |
+------------------+---------------------------------------------------+---------------+
   248 px             flexible workspace                                 360 px
```

The right sidebar is collapsible. When closed, the workspace uses the full width. On smaller desktop windows, it overlays the workspace instead of shrinking critical content.

### 5.2 Full-page KIT

```text
+--------------------------------------------------------------------------------------+
| Left navigation | Tabs                                                              |
+-----------------+----------------------+---------------------------------------------+
|                 | Conversations        | KIT                                         |
| KIT selected    | + New chat           | Thread title                  Context (3)   |
|                 | Search chats         |---------------------------------------------|
|                 | Today                | User and KIT messages                       |
|                 |  Project estimate    | Source cards open in tabs                   |
|                 |  Rolando summary     | Generated artifact cards                    |
|                 | Earlier              |                                             |
|                 |  Venue comparison    |---------------------------------------------|
|                 |                      | Attach | Ask KIT...                       Send |
+-----------------+----------------------+---------------------------------------------+
```

### 5.3 Design workspace

```text
+--------------------------------------------------------------------------------------+
| Tabs | Room name | 2D | 3D | Split | Revision | Export                               |
+------------------+---------------------------------------------------+---------------+
| Layers and       |                                                   | Properties    |
| room objects     |      2D plan or interactive 3D viewport           | Dimensions    |
|                  |                                                   | Materials     |
| + Add object     |      Confidence and measurement overlays          | Camera path   |
|                  |                                                   | KIT help      |
+------------------+---------------------------------------------------+---------------+
| Status: geometry reviewed | Rendering estimate | Background jobs                     |
+--------------------------------------------------------------------------------------+
```

## 6. Feature specifications

### 6.1 Automatic tabs and history

#### Tab behavior

- Opening a project, record, file, saved search, KIT output, or design opens a workspace tab automatically.
- A canonical resource key prevents duplicate tabs. Opening the same item focuses its existing tab.
- New search results use one preview tab until the user pins, edits, or explicitly opens the item in a permanent tab.
- Modified tabs show an unsaved indicator. Closing one requires Save, Discard, or Cancel.
- Tabs support close, close others, close to the right, pin, duplicate view, copy link, and reopen closed tab.
- Pinned tabs appear first and restore on every launch.
- Unpinned open tabs restore after a normal restart. After a crash, the user sees `Restore previous session`.
- The tab strip shows up to the available width, then uses a searchable overflow menu. Do not add a hard tab limit.
- Keyboard support includes `Cmd/Ctrl + T`, `Cmd/Ctrl + W`, `Cmd/Ctrl + Shift + T`, and `Cmd/Ctrl + 1...9`.

#### History behavior

- History records opened tabs, chats, searches, files, and generated outputs.
- The History panel supports All, Tabs, Chats, Searches, Files, and Designs filters.
- History metadata is stored locally per user and remains until cleared.
- Users can remove one item, clear a date range, or clear all history.
- History stores resource identifiers, titles, timestamps, and locations. It does not duplicate entire file contents.
- If access is revoked, the history entry remains but is marked unavailable and cannot reopen the content.

#### Core records

- `WorkspaceTab`: stable ID, resource type, resource ID, title, route, preview or pinned state, dirty state, and last active time.
- `HistoryItem`: action type, resource reference, title, timestamp, source location, and availability state.
- `SessionSnapshot`: ordered open tabs, active tab, navigation stack, sidebar state, and window layout.

> **Suggested improvement:** Use a single replaceable preview tab for casual browsing. This prevents tab overload, but the preview state must be visually obvious so users understand why it changes.

### 6.2 KIT full chat and sidebar

#### Shared conversation model

- Full-page KIT and the sidebar read and write the same conversation records.
- A conversation has a stable thread ID, title, participants, messages, context references, source citations, artifacts, model information, and timestamps.
- The active thread follows the user between sidebar and full-page chat.
- `New quick chat` creates a normal conversation marked as unfiled. It can later be assigned to a project.
- Page context is suggested, not silently attached. The sidebar presents removable context chips before submission.
- Context references store stable IDs and revision information so an answer can identify exactly what KIT read.
- File citations open the exact file or relevant page where supported.
- When a source changes, old answers keep their original source revision and show that a newer version exists.

#### Full-page KIT capabilities

- Searchable conversation list and project filters.
- Large composer with drag-and-drop attachments.
- Source and context inspector.
- Artifact area for proposals, summaries, search collections, checklists, and design briefs.
- Stop, retry, edit-and-resend, copy, export, and branch conversation actions.
- Clear pending, streaming, completed, stopped, blocked, rate-limited, and failed states.

#### Sidebar capabilities

- Quick questions about the active screen.
- Visible context chips and file attachments.
- Compact citations and artifact cards.
- `Open full chat` transition with no message loss.
- Collapsed width saved per user.

#### Action safety

- Reading authorized content can occur after the user's initial consent.
- Any write, delete, message send, proposal acceptance, export overwrite, or permission change requires a specific confirmation.
- KIT must present a short action preview showing affected items before confirmation.
- Every executed action records the requesting user, action, inputs, result, and timestamp in the audit log.

> **Suggested improvement:** Separate `Ask` mode from `Act` mode in the composer. The extra control adds one concept, but it makes the agent's authority much clearer and reduces accidental changes.

### 6.3 Local file access and universal search

#### Permission model

- Broad home-directory access is opt-in and read-only.
- The app must work without file permission, with file features shown as unavailable rather than broken.
- Permission Settings show the exact granted path, OS status, cloud-indexing status, last scan, and included and excluded patterns.
- Default exclusions include operating-system folders, application data, trash, caches, package dependencies, virtual machines, password stores, browser profiles, `.ssh`, `.gnupg`, `.aws`, `.env` files, private keys, credential files, and hidden folders unless explicitly included.
- Symbolic links cannot escape the authorized scope.
- Users can add exclusions, pause indexing, rebuild the index, revoke cloud indexing, revoke filesystem access, and request cloud deletion.
- Revocation immediately stops watchers and new reads. Cloud deletion enters a visible pending state until the provider confirms completion.
- Write permission is never inferred from read permission.

#### What the user sees before KIT reads

1. Initial consent describes the filesystem and cloud scope before scanning begins.
2. Settings always show what is currently accessible and indexed.
3. The composer shows context scope before each KIT request.
4. The response shows the files actually used, not only the folders searched.
5. A file marked sensitive or manually excluded requires an explicit one-time inclusion confirmation.

#### Indexing pipeline

1. Discover files inside the allowed scope using a low-priority background worker.
2. Reject excluded paths, unsupported types, oversized files, and duplicate content hashes.
3. Extract metadata locally: path, type, size, dates, owner, app associations, and content hash.
4. Extract searchable text locally from PDF, DOCX, PPTX, XLSX, CSV, TXT, Markdown, and supported image formats.
5. Run OCR and image tagging only for approved image types.
6. Store local metadata and keyword text in encrypted SQLite with FTS5.
7. Chunk approved content, remove known secrets where possible, encrypt in transit, and upload it to a tenant-isolated cloud vector index.
8. Store the remote object ID, source hash, and retention status locally.
9. Watch for changes and update only affected files.
10. Delete stale cloud chunks when a file is removed, excluded, changed, or access is revoked.

#### Search ranking and result presentation

- Blend exact filename, exact text, app-record relationship, recent activity, and semantic relevance.
- Exact names such as `Rolando` receive a strong ranking boost.
- Join file matches with structured app relationships. A proposal linked to Rolando's client record should appear even if the file uses a company name instead.
- Group results by type and provide an optional unified relevance list.
- Show match reason, highlighted excerpt, file path, project relationship, date, and source status.
- Mark cloud-only, local-only, stale, unavailable, and permission-blocked results.
- Never claim that search is complete while indexing is still running. Show coverage and last-indexed time.

#### Privacy and security requirements

- Encrypt the local index and store keys in Windows Credential Manager or macOS Keychain.
- Use one cloud tenant or namespace per company and access controls per role.
- Keep API keys and provider credentials out of the desktop renderer.
- Send provider requests through a controlled gateway with quotas, auditing, and tenant checks.
- Use TLS in transit and provider-supported encryption at rest.
- Select a provider contract with explicit retention, deletion, region, and model-training terms.
- Sandbox parsers and previewers. Treat every indexed file as untrusted input.
- Never execute macros, scripts, embedded binaries, or active document content.
- Redact common secrets before cloud upload and log redaction counts without storing the secrets.
- Provide an administrator report for indexed locations, failed deletions, cloud usage, and access events.

> **Suggested improvement:** Maintain a local keyword index even with cloud semantic indexing. It adds storage and synchronization work, but it keeps exact-name search fast, supports offline use, and reduces unnecessary cloud queries.

### 6.4 2D to 3D Design section

#### First-release inputs

- PNG, JPEG, WebP, or single-page PDF floor plan.
- One known measurement or a visible drawing scale.
- Unit system, ceiling height, room name, and optional project link.
- Optional notes for doors, windows, stage, seating, and fixed obstacles.
- A rights confirmation for uploaded references.

#### First-release outputs

- Versioned 2D geometry overlay.
- Editable 3D room with walls, doors, windows, floors, and basic materials.
- Existing audiovisual equipment placeholders from the Library.
- Saved cameras and an editable camera path.
- 1080p H.264 MP4 walkthrough.
- GLB 3D model.
- PNG preview and existing dimensioned 2D export.
- Provenance record with source file, model or extractor, time, revisions, and user corrections.

#### Processing states

- Uploading
- Validating image
- Waiting for scale
- Extracting geometry
- Needs review
- Building 3D scene
- Ready to edit
- Queued for render
- Rendering with percentage and estimated time
- Exporting
- Complete
- Paused, cancelled, failed, or quota blocked

Long-running jobs continue in the background. Closing the tab does not cancel a job. Completion and failure appear in the notification center and job history.

#### Error and recovery states

| Problem                             | User experience and recovery                                            |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Unsupported or damaged file         | Preserve project draft and ask for a supported replacement              |
| Low resolution or unreadable labels | Show problem areas and allow upload, crop, rotate, or manual tracing    |
| No reliable scale                   | Require one manual measurement before measured 3D generation            |
| Low-confidence wall or opening      | Highlight in amber and require review                                   |
| Invalid geometry                    | Explain overlaps or gaps and offer automatic repair plus manual editing |
| Provider unavailable                | Keep the upload and settings, then allow retry or manual tracing        |
| Budget or quota exceeded            | Show estimated cost and allow admin approval or local manual mode       |
| Render failure                      | Preserve the scene and camera path, then retry at a lower quality       |
| Export location unavailable         | Ask for a new save location without rerendering                         |

#### Technical options

| Option                         | Approach                                                                                                                     | Benefits                                                                            | Drawbacks                                                                          | Relative cost and complexity                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Local deterministic extraction | Local computer vision, OCR, line detection, and manual correction produce geometry                                           | Strong privacy, predictable geometry, offline capability, no per-job AI fee         | Weak with messy plans, highest internal algorithm effort, more manual correction   | High engineering cost, low operating cost                         |
| Cloud image-to-3D generation   | Send the image to a specialized service and receive a mesh or video                                                          | Fastest visual result, useful for room photos and concepts                          | Measurements can be unreliable, vendor lock-in, limited editability, variable fees | Low to medium engineering cost, medium to high operating cost     |
| Hybrid structured extraction   | Cloud vision returns walls, openings, labels, and confidence; local validation creates authoritative geometry and renders it | Best balance of speed, editability, measurement review, and existing Three.js reuse | Requires provider integration plus local geometry validation                       | Medium to high engineering cost, controlled medium operating cost |

**Recommendation:** Use the hybrid structured extraction option. Cloud AI should return structured candidate geometry, never the final authoritative scene. The user-reviewed local geometry becomes the single source for 2D, 3D, GLB, and video outputs.

Three.js already supports the shared scene model in this repo, and its official `GLTFExporter` can produce binary GLB with scenes, cameras, materials, lights, and animations. Video should render deterministic frames from the reviewed scene and encode them with a packaged, license-reviewed media encoder.

> **Suggested improvement:** Add a `Conceptual` or `Measured` badge to every design and export. This creates a small extra review choice, but it prevents visual drafts from being mistaken for verified plans.

## 7. Permissions and security model

### 7.1 Permission layers

1. **Operating-system permission:** Grants the desktop process access to the chosen filesystem scope.
2. **App capability:** Restricts which native commands and paths the UI can request.
3. **Workspace role:** Controls which user can search, attach, upload, export, or administer indexed content.
4. **Cloud consent:** Controls which content may leave the device and the provider or region used.
5. **Action confirmation:** Protects mutations and external effects even when the user has general access.

### 7.2 Roles

- **Administrator:** Manages users, filesystem scope, cloud providers, exclusions, budgets, retention, and audit reports.
- **Sales Manager:** Searches approved project and client content, uses KIT, manages proposals and messages.
- **Event Designer:** Uses file search and KIT for assigned projects, creates 2D and 3D designs, exports approved assets.
- **Production Manager:** Searches assigned operational content, manages production records, and reviews design outputs.
- **Technician:** Sees assigned projects, tasks, and explicitly shared files only.
- **Client:** Never receives desktop filesystem access. Client access remains limited to deliberately shared records.

Role policy must apply both locally and at the cloud gateway. Local possession of a cached record must not bypass workspace access rules after sign-out or role removal.

### 7.3 Security boundaries

- The React renderer has no unrestricted filesystem, shell, process, or credential access.
- Native commands use a narrow typed bridge with validation on both sides.
- File preview uses inert renderers. Remote HTML and active document content are not loaded with native privileges.
- External URLs open only after allowlist validation.
- AI output is treated as untrusted text and data. It cannot call arbitrary native commands.
- Local databases, session snapshots, and index content are encrypted at rest.
- Secrets remain in platform credential storage or on the company server.
- The app is code-signed on both platforms. macOS builds are notarized.
- Updates are signed, verified, staged, and recoverable.
- Security logs exclude raw confidential content and retain only the evidence needed for auditing.

Tauri 2 is recommended because its capability and filesystem scope model can explicitly allow and deny paths, including home-directory rules. Its official documentation notes that dangerous filesystem commands are blocked by default and require both permission and path scope. Distribution still requires platform signing and macOS notarization. See [Tauri filesystem permissions](https://v2.tauri.app/plugin/file-system/), [Tauri capabilities](https://v2.tauri.app/security/capabilities/), and [Tauri distribution](https://v2.tauri.app/distribute/).

> **Suggested improvement:** Commission a threat-model review before enabling full-home indexing. It adds security work before launch, but broad filesystem access makes this review essential rather than optional.

## 8. Visual design system

### 8.1 Design direction

The interface should feel calm, precise, and premium. Take inspiration from n8n's clean node-based rhythm without copying its branding or component shapes. Use restrained color, clear hierarchy, fine borders, generous canvas space, and small relationship cues between connected records.

Red, blue, and green should communicate meaning rather than compete on every screen. Blue leads interaction, green confirms healthy or completed states, and red highlights creative accents and urgent attention. Neutral surfaces should occupy most of the interface.

### 8.2 Color tokens

#### Light mode

| Role             | Token       | Hex       | Usage                                            |
| ---------------- | ----------- | --------- | ------------------------------------------------ |
| Primary          | Blue 600    | `#2563EB` | Primary buttons, selected tabs, links, focus     |
| Primary hover    | Blue 700    | `#1D4ED8` | Hover and pressed states                         |
| Brand accent     | Red 500     | `#E5484D` | Brand detail, active node, selected creative cue |
| Success          | Green 600   | `#168B5B` | Complete, connected, approved                    |
| Error            | Red 700     | `#B42318` | Destructive and failed states                    |
| Warning          | Amber 600   | `#D97706` | Review and low-confidence states                 |
| Background       | Neutral 25  | `#F7F8FA` | App background                                   |
| Surface          | White       | `#FFFFFF` | Panels, cards, menus                             |
| Surface elevated | Neutral 50  | `#F1F4F8` | Hovered or nested surfaces                       |
| Border           | Neutral 200 | `#DDE2EA` | Dividers and controls                            |
| Text             | Navy 950    | `#172033` | Primary text                                     |
| Muted text       | Slate 600   | `#667085` | Secondary text                                   |

#### Dark mode

| Role             | Token      | Hex       | Usage                            |
| ---------------- | ---------- | --------- | -------------------------------- |
| Primary          | Blue 400   | `#6EA8FE` | Primary actions, links, focus    |
| Primary hover    | Blue 300   | `#8DB9FF` | Hover and pressed states         |
| Brand accent     | Red 400    | `#FF6B72` | Brand detail and creative cue    |
| Success          | Green 400  | `#3DDC97` | Complete, connected, approved    |
| Error            | Red 400    | `#FF5C5C` | Destructive and failed states    |
| Warning          | Amber 400  | `#F5B942` | Review and low-confidence states |
| Background       | Navy 1000  | `#0E1117` | App background                   |
| Surface          | Navy 900   | `#151A23` | Panels, cards, menus             |
| Surface elevated | Navy 800   | `#1D2430` | Hovered or nested surfaces       |
| Border           | Slate 750  | `#2A3442` | Dividers and controls            |
| Text             | Neutral 50 | `#F3F6FA` | Primary text                     |
| Muted text       | Slate 350  | `#A6B0C3` | Secondary text                   |

Do not rely on color alone. Every status also needs text, an icon, or a shape change.

### 8.3 Typography

- Use Manrope for headings and DM Sans for body and controls to preserve the current visual foundation.
- Bundle font files with the desktop app instead of loading Google Fonts at runtime.
- Page title: 28 px, 700 weight, 34 px line height.
- Section title: 18 px, 650 weight, 26 px line height.
- Body: 14 px, 400 weight, 21 px line height.
- Control label: 13 px, 550 weight, 18 px line height.
- Metadata: 12 px, 450 weight, 17 px line height.
- Code, paths, and IDs: a bundled monospace font at 12 to 13 px.
- Keep line length between 55 and 80 characters for reading-heavy content.

### 8.4 Spacing and shape

- Use a 4 px base grid with common steps of 4, 8, 12, 16, 24, 32, and 48 px.
- Left navigation width: 248 px expanded and 72 px collapsed.
- KIT sidebar width: 360 px default and 320 to 480 px resizable.
- Top bar height: 52 px. Tab strip height: 40 px.
- Main page padding: 24 px, increasing to 32 px on wide screens.
- Control height: 36 px compact and 40 px standard.
- Corner radius: 8 px controls, 12 px cards, 16 px dialogs.
- Shadows remain subtle. Prefer borders and surface contrast for structure.

### 8.5 Component guidance

- **Buttons:** One blue primary action per region. Secondary buttons use neutral surfaces. Destructive actions use red only at the final confirmation step.
- **Cards:** Flat surfaces with a 1 px border. Use cards only to group related information, not for every row.
- **Tabs:** Compact, closeable, and reorderable. Active tabs use stronger text plus a 2 px blue indicator. Preview tabs use italic title text and a hollow icon.
- **Left sidebar:** Quiet neutral surface, clear icons, no more than five primary items, labels visible by default.
- **KIT sidebar:** Slightly elevated surface with visible context chips and cited source cards.
- **Chat bubbles:** Avoid large speech balloons. Use aligned message blocks with author, time, sources, and actions.
- **Search results:** Dense list rows with type icon, title, excerpt, location, date, and match reason. Group headers remain sticky.
- **Inputs:** Persistent labels for forms. Placeholder text never replaces a label.
- **Status:** Use a dot or icon, short label, and optional detail. Animated status is reserved for active work.
- **Node motif:** Use thin connector lines and small colored nodes only where relationships matter, such as file to project or source to answer.
- **Iconography:** Continue with Lucide icons at 16, 18, or 20 px using consistent 1.75 px strokes. Icons always have accessible names when text is absent.
- **Motion:** 120 to 180 ms for menus and tab changes, 180 to 240 ms for panels, and reduced-motion support.

> **Suggested improvement:** Keep the three brand colors out of large background areas. A neutral base feels more premium and readable, but the brand will appear through interaction states, nodes, illustrations, and the KIT identity rather than constant saturation.

## 9. Recommended technical stack

### 9.1 Desktop and interface

| Layer           | Recommendation                                                     | Reasoning                                                                                                          |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Desktop shell   | Tauri 2                                                            | Small native package, Windows and macOS support, scoped native capabilities, and good fit for the existing Vite UI |
| UI              | Existing React, TypeScript, Vite, and React Router                 | Preserves current work and minimizes interface migration                                                           |
| Native core     | Rust commands and background workers                               | Safe boundary for file discovery, hashing, watching, encryption, and long-running jobs                             |
| 3D              | Existing Three.js scene model                                      | Keeps one geometry source for 2D and 3D and supports GLB export through official tooling                           |
| Local database  | SQLite with FTS5 and application-level encryption                  | Supports local-first records, keyword search, tabs, history, jobs, and an offline queue                            |
| Company service | Evolve the existing Express API behind a versioned sync interface  | Preserves existing authorization and business workflows while allowing optional synchronization                    |
| Testing         | Existing Vitest, Playwright, and axe plus native integration tests | Extends current verification rather than introducing a parallel test system                                        |

Tauri's use of the operating-system webview means Windows and macOS rendering can differ. The design system must be tested on both platforms throughout development, not only before release.

**Fallback:** Electron is the fallback if a time-boxed spike finds that required document parsers, media encoding, or enterprise deployment cannot be delivered reliably with Tauri. Electron would reuse more Node.js code, but it brings a larger runtime and demands strict renderer sandboxing, context isolation, and a narrow IPC bridge. Electron's own security guide recommends sandboxing, context isolation, current versions, restricted navigation, and validated IPC senders. See [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) and [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model).

### 9.2 AI, search, and file processing

- Use a provider adapter for chat, embeddings, vision extraction, and optional OCR so providers can be replaced independently.
- Keep provider credentials at the company gateway, not in the desktop bundle.
- Use local FTS5 for exact and offline search plus a cloud vector store for semantic retrieval.
- Attach tenant, company, role, source hash, path category, and retention metadata to every cloud chunk.
- Use a MIME-specific parser worker with strict size and time limits.
- Process image thumbnails and OCR separately from document text so expensive features can be disabled.
- Add a local job queue for scanning, extraction, upload, deletion, 3D conversion, and rendering.
- Capture provider usage and estimated cost by company, user, project, and job.
- If OpenAI is selected, use the API rather than a consumer account. OpenAI states that API data is not used to train models by default unless the organization opts in, while default abuse-monitoring retention can be up to 30 days unless different controls apply. Contractual and retention review is still required. See [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data).

### 9.3 Data and sync boundaries

- The local database is authoritative for device-only state such as tabs, window layout, local grants, index status, and pending jobs.
- The company service is authoritative for shared users, roles, projects, clients, proposals, production records, and audit policy.
- Chats and designs declare whether they are local-only or company-shared.
- Sync uses versioned records, tombstones for deletions, an outbound queue, and explicit conflict review for user-edited business content.
- Large files remain referenced by content hash and storage object ID rather than copied into the main workspace payload.
- Local indexed content is never synchronized to another device unless cloud indexing and company policy explicitly permit it.

> **Suggested improvement:** Keep file indexing outside the current monolithic workspace payload. This adds a separate storage boundary, but it avoids performance, privacy, and synchronization problems as the file index grows.

## 10. Phased implementation roadmap

### Milestone 0: Product and technical validation

Deliverables:

- Approve desktop OS versions, final navigation labels, Spanish and English terminology, and design tokens.
- Build non-production interaction prototypes for tab overflow, full KIT chat, sidebar context, search results, and 2D review.
- Complete Tauri versus Electron, cloud provider, OCR, media encoder, and 3D extraction spikes.
- Approve cloud data contract, retention, deletion, region, and budget.
- Produce a threat model for full-home access and cloud indexing.

Exit criteria:

- No unresolved blocker remains for desktop packaging, file access, cloud privacy, or the floor-plan pipeline.

### Milestone 1: Desktop shell and simplified navigation

Deliverables:

- Package the existing React app in the selected desktop shell.
- Replace the current 11-item navigation with Home, Projects, Design, Library, and KIT.
- Preserve access to every existing module through the new hubs.
- Apply the light and dark design tokens, bundled fonts, responsive desktop layout, and accessibility baseline.
- Add signed development builds for Windows and macOS CI.

Exit criteria:

- Existing primary workflows remain reachable and pass regression tests in both operating systems.

### Milestone 2: Workspace tabs, session restore, and history

Deliverables:

- Add the typed tab registry, canonical resource keys, preview and pinned tabs, dirty-state guards, and keyboard shortcuts.
- Persist session snapshots and searchable history locally.
- Add crash recovery, recently closed tabs, and history deletion controls.
- Update routes so direct links open or focus the correct tab.

Exit criteria:

- Projects, records, files, searches, and outputs restore correctly after restart with no duplicate tabs or lost unsaved warnings.

### Milestone 3: Native file permission and local index

Deliverables:

- Add first-run consent, read-only home access, safe exclusions, revocation, and permission diagnostics.
- Add background discovery, MIME validation, hashing, parsing, OCR option, watchers, encrypted SQLite, and FTS5.
- Add indexing status, pause, retry, rebuild, and failure details.
- Add secure internal previews and `Open in default app`.

Exit criteria:

- Exact filename and document text search work offline, exclusions are enforced, and revocation prevents all later reads.

### Milestone 4: Universal search and cloud semantic index

Deliverables:

- Create unified result contracts for app records and computer files.
- Add tenant-isolated cloud chunking, embeddings, deletion reconciliation, budgets, and audit logs.
- Add grouped results, relationship ranking, excerpts, match reasons, coverage status, and saved searches.
- Validate the `Rolando` scenario across files, images, proposals, clients, and projects.

Exit criteria:

- Search meets performance targets, returns explainable matches, and deletes cloud content after revocation within the approved service-level target.

### Milestone 5: Shared KIT conversation system

Development status: implemented October 17, 2026. Production acceptance still
requires an approved provider, representative source validation, and the release
gates in [DESKTOP_PHASE_5.md](DESKTOP_PHASE_5.md).

Deliverables:

- Add persisted conversations, messages, context references, citations, artifacts, model metadata, and error states.
- Replace the placeholder sidebar with a grounded assistant using visible context chips.
- Add the full KIT workspace and seamless sidebar handoff.
- Add Ask and Act modes, action previews, confirmations, and auditing.
- Connect existing AI proposal work through the shared conversation and provider boundary.

Exit criteria:

- The same thread works in both surfaces, answers cite sources, and KIT cannot perform a mutation without confirmation and authorization.

### Milestone 6: Floor plan to measured 3D

Development status: provider-neutral foundation implemented October 17, 2026.
Production extraction, PDF rasterization, and MP4 rendering remain intentionally
gated until the AI/OCR/rendering tools are selected. See
[DESKTOP_PHASE_6.md](DESKTOP_PHASE_6.md).

Deliverables:

- Add upload validation, scale calibration, structured geometry extraction, confidence overlay, and correction tools.
- Convert reviewed geometry into the existing 2D and Three.js scene model.
- Add room materials, Library equipment, saved cameras, camera-path editing, version history, and provenance.
- Add GLB, PNG, 2D, and 1080p MP4 exports with estimates, progress, cancel, retry, and job history.

Exit criteria:

- Representative clean and imperfect floor plans can produce reviewed editable rooms, reproducible exports, and clearly labeled measurement status.

### Milestone 7: Sync, hardening, and release

Development status: sync and conflict-recovery foundation started October 17, 2026. See [DESKTOP_PHASE_7.md](DESKTOP_PHASE_7.md).

Deliverables:

- Add optional company sync, offline queue, conflict review, and remote role revocation.
- Complete performance, accessibility, recovery, security, and cross-platform test passes.
- Add signed updates, backup and recovery, telemetry consent, support diagnostics, and administrator documentation.
- Pilot with representative staff and real company file sets before broad rollout.

Exit criteria:

- Production readiness review approves security, privacy, provider cost, business workflows, recovery, and signed distribution.

## 11. Risks and mitigations

| Risk                                                    | Impact                                 | Mitigation                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Broad home access exposes sensitive or irrelevant files | High privacy and trust risk            | Explicit consent, strong default exclusions, read-only access, secret redaction, visible scope, immediate revocation, audit report |
| Cloud indexing creates retention or residency concerns  | Legal and customer risk                | Provider contract review, tenant isolation, configurable region, deletion reconciliation, retention controls, admin policy         |
| File parsers process malicious documents                | Device compromise or denial of service | Sandboxed workers, time and memory limits, no macros or active content, updated dependencies, security testing                     |
| Search claims completeness before indexing finishes     | Users miss important files             | Coverage indicators, last-indexed time, failure counts, and clear local versus cloud states                                        |
| Automatic tabs create clutter                           | Navigation becomes harder              | Canonical deduplication, one preview tab, pinning, overflow search, and session controls                                           |
| Sidebar context leaks unrelated data                    | Incorrect or unsafe KIT answers        | Visible removable context, scope preview, role checks, exact citations, and no invisible workspace-wide attachment                 |
| AI produces incorrect geometry                          | Bad planning and misleading visuals    | Scale requirement, confidence overlay, human review gate, measured versus conceptual label, provenance                             |
| Video rendering is slow or costly                       | Poor experience and uncontrolled spend | Preview quality, cost and time estimate, background queue, cancellation, quotas, and lower-quality retry                           |
| Tauri webview differences cause UI defects              | Platform inconsistency                 | Windows and macOS CI, visual regression tests, early device testing, Electron fallback spike                                       |
| Local-first and shared server data conflict             | Lost or overwritten business work      | Versioned records, offline queue, immutable audit evidence, and explicit conflict review                                           |
| Current modules regress during navigation redesign      | Business workflow disruption           | Capability mapping, route compatibility, regression tests, and phased release flags                                                |

## 12. Suggested improvements summary

1. Use Projects as the user-facing name for event-centered work while preserving the existing event model.
2. Recommend a limited initial scan even though full-home permission remains available.
3. Keep a local keyword index alongside the cloud semantic index.
4. Use a replaceable preview tab to limit tab overload.
5. Separate KIT's Ask mode from Act mode.
6. Require geometry review before 3D video rendering.
7. Label every design as Conceptual or Measured.
8. Fold Reports into Home and project views.
9. Keep brand colors as accents on neutral surfaces.
10. Store file indexing outside the monolithic workspace payload.
11. Complete provider, cost, and threat-model spikes before production integration.

## 13. Out of scope for now

- Automatic autonomous actions without user confirmation.
- Write access across the home directory.
- Linux, mobile, tablet, or browser-only public releases.
- Guaranteed offline generative AI or semantic search.
- Full room reconstruction from arbitrary photos in the first release.
- Photorealistic digital twins, physics simulation, certified lighting analysis, acoustic prediction, structural engineering, or rigging certification.
- Real-time multiuser editing of the same 3D scene.
- CAD or BIM authoring parity and native DWG or Revit editing.
- Automatic sending of proposals or client messages.
- Indexing email, browser history, private cloud drives, or third-party services without separate integrations and consent.
- A final commitment to any AI, OCR, vector, 3D, storage, or messaging provider before the validation milestone.
