# KIT — Design, stage 2

Status: plan only. Prepared 2026-10-17. Nothing in this file has been implemented.
Owner/Admin: **Honasis Dotel**.

## 1. Summary, assumptions and open questions

### Summary
KIT already has a working React 19 + Vite 7 frontend, an Express 5 + SQLite company server, and a Tauri 2 shell. The product problem is not missing features. The problem is that the features are hard to find: 15 routes, two navigation layers (sidebar hubs plus a hub tab bar), a permanent sample banner, and visible "future" cards. Stage 2:

1. Cuts the app to **6 top-level destinations** with submenus, a rebuilt ⌘K command palette, and one consistent place for actions.
2. Replaces three overlapping CSS token sets with **one token file**: RGB brand palette, rounded geometry, 150–250 ms motion, and user toggles.
3. Removes every placeholder (list in §2.4). The app opens on real company data and keeps sample mode as an explicit demo.
4. Adds **Settings › Integraciones**. Keys stay server-side. Each key has a status and a "Probar" (test) action, and a missing key always produces a clear message.
5. Recommends integrations in this order: **Claude (vision + structured output) for floor plans and quotes**, **Cal.com** for client meetings and site visits, **WhatsApp Cloud API** (boundary already built), **SerpApi** for lookups, and an **ICS calendar feed** with no API key.

### Where the brief and the repo disagree (the repo wins)
- **AI provider.** The repo calls **OpenAI** today (`server/ai-provider.ts`, `OPENAI_API_KEY`, `KIT_AI_MODEL`, `KIT_CHAT_MODEL`). It does not call Gemini or Claude. Stage 2 plans a provider-neutral adapter with Claude and Gemini implementations and keeps OpenAI working.
- **Floor plan → 3D.** The editor, the 3D scene (Three.js, procedural equipment shapes) and the extraction endpoint (`POST /api/design/extract`) exist. **No extractor is implemented**, so the endpoint returns a 503 with a Spanish message (`server/design.ts:128-133`).
- **SerpApi and scheduling.** Neither exists in the repo. There is no calendar, booking or meeting model.
- **Screenshot.** No sidebar screenshot was attached. §4 specs the sidebar from your written description: compact rows, thin dividers, rounded popovers, submenu chevrons, external-link icons and a bottom user chip. It must be checked against the screenshot (Q1).
- **"Remove fake data" vs. CLAUDE.md.** CLAUDE.md requires sample mode to keep working, and the browser tests use the seed data. Resolution: the app opens in company mode, and sample mode becomes an opt-in "Espacio de demostración", clearly labeled and never the default.
- **Lint.** The repo has no lint script, only Prettier. The final pass uses `npx prettier --check` plus typecheck. Adding ESLint is Q9.

### Assumptions
- Spanish UI, labels in `src/shared/i18n.ts`. English code and docs. Stored business content is never translated.
- One company and one owner. Honasis Dotel is the owner record in company mode (created through the existing owner setup in `SessionAccess.tsx` / `server/routes/auth.ts`). The name is never hardcoded in render code. Sample mode uses "Honasis Dotel" as its demo owner instead of "Alex Morgan".
- The CLAUDE.md rules hold. No live external calls during development or tests. "Probar conexión" makes a live call only when an owner clicks it on a running company server, and tests replace it with fixtures.
- AI only suggests. Messages, acceptance and KIT Act mutations keep owner confirmation and server-side checks.
- Lucide icons stay. DM Sans (body) and Manrope (headings) stay; both are already installed.
- The per-record data model (cleanup Stage 5) is **not** part of this stage. Any new storage is listed as gated.

### Open questions for the owner (recommended default in bold)
1. **Sidebar screenshot.** Please attach it. Default: **build to the §4 spec and adjust after review.**
2. **Role set.** Use 5 roles: Propietario/Admin, Ventas, Producción (absorbs today's "Event Designer"), Técnico, Cliente? Default: **yes, but keep the server role keys unchanged until you confirm the merge**. Merging changes authorization and stored user roles.
3. **Palette.** Default: **Option A "Señal"** (blue primary; red and green as semantic and brand accents).
4. **Primary AI model.** Default: **Claude Opus 5.5 (`claude-opus-5-5`, $4/$20 per 1M tokens) for plan reading and quote drafting. Claude Haiku 5.5 or Gemini Flash only as a cheaper option you choose. OpenAI stays supported until removed.**
5. **Where keys live.** Default: **phase 1 reads keys from the server environment (`.env`), and the Integrations page shows status and tests the connection. Phase 2 adds an encrypted key store in SQLite, which changes the database format and needs your approval.**
6. **Scheduling provider.** Default: **Cal.com Cloud, Free plan for one user** (Teams at $12/user/month if staff need their own calendars). Booking webhooks create a lead draft for review.
7. **Sample data.** Default: **open in company mode. Keep the demo behind Configuración › Datos › "Abrir espacio de demostración", with a persistent "Demostración" chip.**
8. **Public website link.** Should the sidebar link to KIT's public site? Default: **only if you give the URL. Otherwise there is no external row except the Cal.com booking page once it is connected.**
9. **ESLint.** Default: **no for now. Prettier plus typecheck count as the lint gate.**
10. **SerpApi plan.** Default: **Free (250 searches/month) during setup, then Starter ($25 for 1,000), with a monthly cap enforced on the server.**

## 2. Current state findings

### 2.1 Stack
- Frontend: React 19, react-router-dom 7, Vite 7, TypeScript 5.9, lucide-react, three 0.180, zod 4. Fonts: `@fontsource-variable/dm-sans`, `@fontsource-variable/manrope`.
- Server: Express 5 run through tsx, SQLite. The whole workspace is one JSON row with a global revision (`server/database.ts`). Auth uses HTTP-only sessions and CSRF (`server/security.ts`). Role and event scope live in `server/permissions.ts` and `server/policy/*`.
- Desktop: Tauri 2 (`src-tauri/`) and a native encrypted file index (`native/file-index/`, SQLCipher).
- Tests: Vitest (`src`, `server`) and Playwright (`tests/browser/*.spec.ts`, axe checks). The baseline lives in `docs/CLEANUP_LOG.md`.
- Styles: `src/styles.css` (5,048 lines), `src/desktop.css` (331), `src/desktop-modules.css` (821), `src/file-search.css`. There are **three overlapping token sets**: `styles.css:1-21` (green `--green #345a42`, `--radius 12px`), `desktop.css:1-47` (blue `--primary #2563eb`, light and dark), and ad-hoc hex values throughout. Only two `prefers-reduced-motion` blocks exist (`styles.css:4754`, `desktop.css:317`).

### 2.2 Screens and routes (`src/application/App.tsx:519-560`)
`/` Dashboard · `/events`, `/events/:id` · `/clients` · `/venues` · `/design` (2D/3D) · `/creative` · `/proposals`, `/proposals/:id` · `/inbox` · `/inventory` · `/production` · `/reports` · `/settings` (tabs: Company profile, Users & roles, Proposal/Event preferences, Notifications, AI preferences, Integrations, Activity history, Workspace data) · `/library` (hub card page) · `/library/files`, `/files/:id` · `/kit` (KIT chat; also a sidebar panel) · `/search`.

Today's navigation has two layers. The sidebar shows 5 hubs (`src/application/Hubs.tsx`: Inicio, Proyectos, Diseño, Biblioteca, KIT) and a hub tab bar (`HubNavigation`) under the top bar. `App.tsx:61-90` still declares an older 3-group `navigation` array that is used only for labels and search. The access policy is `canSeeModule` / `canEditCollection` in `src/shared/access.ts`, with roles Administrator, Sales Manager, Event Designer, Production Manager, Technician and Client / Guest, plus an `isOwner` flag.

### 2.3 Data model (summary, `src/shared/types.ts`)
Collections: clients, venues (with rooms), events, equipment, proposals (revisions, line items), conversations (messages, review state), tasks, reservations, packages, maintenanceRecords, operations, automations, layouts, brandAssets, creativeAssets. Settings: company, currency, timezone, email, notifications. There is no booking, meeting or calendar collection, and no integration settings.

### 2.4 Placeholders found (each must be wired, given an empty state, or removed)
| # | Where | What | Stage-2 action |
|---|---|---|---|
| P1 | `src/shared/store.tsx:100` | App **starts in sample mode**, so the first launch shows fake data | Start in company mode; sample mode is opt-in (Q7) |
| P2 | `src/shared/seed.ts` (660 lines) | Fake clients (Condado Collection, Northstar Group…), events, venues, and manager/assignee "Alex Morgan" (`:141,187,430,460`) | Keep only as demo data; rename the demo owner to Honasis Dotel; never shown in company mode |
| P3 | `src/application/App.tsx:301,307` | Profile fallback "Alex Morgan" / "Propietario · perfil de ejemplo" | User chip shows the real user; sample shows Honasis Dotel with a "Demostración" tag |
| P4 | `src/modules/Events.tsx:218`, `operations/Reports.tsx:150`, `operations/Production.tsx:31` | Fallback assignee "Alex Morgan" | Use the current user, or leave unassigned with an "Asignar" action |
| P5 | `src/application/App.tsx:240-247` | Workspace switcher with a chevron that does nothing (dead dropdown) | Remove; one company |
| P6 | `src/application/App.tsx:230-238` | Brand caption "PRODUCTION WORKSPACE" (English) and "kıt." text mark | Replace with the RGB "kit" wordmark component and the slogan |
| P7 | `src/shared/ui.tsx:276-292` `Placeholder` | Looks clickable (plus icon, chevron) but does nothing | Delete the component |
| P8 | `src/modules/Events.tsx:585` | "Setup, rehearsal, and teardown windows… will be connected" | Remove; link to the existing production shifts and cues |
| P9 | `src/modules/operations/Settings.tsx:333` | Owner acceptance "Placeholder" | Replace with a static policy row (it is enforced, not a future item) |
| P10 | `Settings.tsx:354` | "Model, usage limits… when an AI service is connected" | Replaced by Integraciones › IA (real status, model, limits) |
| P11 | `Settings.tsx:374` | "Branded templates… will follow" | Remove until built |
| P12 | `Settings.tsx:398` | "Custom event types… will follow" | Remove until built |
| P13 | `Settings.tsx:231-279` | Integrations tab: static list, same box icon for every row, "Sin conectar" hardcoded except AI | Rebuild as Settings › Integraciones (§5) |
| P14 | `src/modules/operations/Creative.tsx:232`, `src/shared/creative.ts:55,75` | "Local showcase · no API cost" badge; SVG stamped "LOCAL SHOWCASE · CONCEPT" | Keep the local generator only as "Boceto local" (honest label); a real provider behind an integration |
| P15 | `src/modules/Inbox.tsx:48-49,156,233` | "Canal de demostración local", "Conversación ilustrativa" | Company mode: proper "Conecta WhatsApp" empty state linking to Integraciones |
| P16 | `server/routes/messaging.ts:22`, `src/shared/store.tsx:466` | Showcase inbound endpoint and `showcase-` IDs | Keep test-only; disabled unless the demo or test environment is active (confirm behavior; no route change without approval) |
| P17 | `src/application/App.tsx:368-433` | Permanent sample/company banner with sync text and sign-out | Replace with a small status dot in the user chip, plus an inline banner **only** when offline or in conflict |
| P18 | `src/application/App.tsx:684-686` | Help modal says messaging and files are "not yet connected" | Rewrite the help as a real quick guide and shortcuts list |
| P19 | `src/application/Hubs.tsx:72-93` `LibraryHub` | Card page that only links elsewhere ("Abrir colección →") | Remove; `/library` redirects to `/inventory` |
| P20 | `src/modules/Dashboard.tsx:28-33` | Date formatted `en-US` on a Spanish UI | Use `es-PR` |
| P21 | `src/application/App.tsx:280-292` | Theme `<select>` in the sidebar footer | Move to the account menu and Settings › Apariencia |
| P22 | `src/modules/Scene.tsx:317,331`, `scene-shapes.ts:7` | 3D equipment uses geometric/procedural "placeholder" shapes | **Keep.** These are honest stand-ins, not fake data. Label "Forma aproximada" in the properties panel |
| P23 | `src/modules/KitChat.tsx:176-178`, `src/shared/kit-store.tsx:267` | Sample-mode chat says no AI | Keep in demo mode only; company mode with no key shows the "Conecta un proveedor de IA" empty state |

No lorem ipsum, `href="#"` links, or mock charts were found. The Dashboard and Reports compute from workspace data.

## 3. Design system spec

All tokens live in **one file: `src/shared/tokens.css`**, imported first in `src/main.tsx`. `styles.css` and `desktop.css` lose their `:root` blocks and may only reference tokens. The theme and toggles use attributes on `<html>`: `data-theme` (already used), `data-accent`, `data-motion`, `data-density`.

### 3.1 Palette options (WCAG 2.2 ratios computed against the listed surface)

**Brand wordmark colors** (logo only, ≥3:1 as large graphics): k `--brand-red #E5484D` (3.91:1 on white), i `--brand-green #1FA971` (3.01:1), t `--brand-blue #2F6BFF` (4.50:1). Never used for body text.

**Option A — "Señal" (recommended).** Blue is the working color, red means danger or important, green means success. This matches the semantic meaning people already expect in a tool that handles money and dates. All three brand colors appear without competing.

| Role | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| `--color-primary` | `#1F5BD8` | 5.92 on `#FFF` | `#7AA2FF` | 7.02 on `#151A22` |
| `--color-primary-hover` | `#1A4CB5` (white text 7.65) | | `#9BB9FF` | |
| `--color-on-primary` | `#FFFFFF` | 5.92 | `#0D1016` | 7.65 |
| `--color-success` | `#0F7A55` | 5.34 | `#3FD08E` | 8.83 |
| `--color-danger` | `#C62828` | 5.62 | `#FF7A73` | 6.89 |
| `--color-warning` | `#9A5B00` | 5.43 | `#F2B544` | 9.54 |
| `--color-info` | `#1F5BD8` | 5.92 | `#7AA2FF` | 7.02 |
| `--color-bg` | `#F6F7F9` | | `#0D1016` | |
| `--color-surface` | `#FFFFFF` | | `#151A22` | |
| `--color-elevated` | `#F0F2F5` | | `#1C222C` | |
| `--color-text` | `#141A26` | 17.42 | `#F2F4F8` | 17.29 on bg |
| `--color-text-muted` | `#586375` | 6.08 (5.67 on bg) | `#A3ADBD` | 7.71 |
| `--color-border` (decorative) | `#DEE2E8` | 1.30 (dividers only) | `#2A313C` | |
| `--color-border-strong` (inputs, 3:1 non-text) | `#8A94A6` | 3.06 | `#687385` | 3.64 |
| `--color-focus` | `#1F5BD8` | 5.92 | `#7AA2FF` | 7.02 |

Each semantic color also gets a `-subtle` background (about 10% tint) for badges and banners; text on a subtle background uses the full-strength color.

**Option B — "Escenario".** Red primary (`#C21F2A`, 5.96 on white; dark `#FF6F6A`, 6.43). Danger shifts to crimson `#9F1239` (8.02; dark `#FF8FA8`, 8.10), with blue info and green success. Strongest brand presence, but primary buttons and errors look alike, so danger must always carry an icon. Higher risk of confusing users.

**Option C — "Tinta tricolor".** Ink primary (`#1B2230`, 15.93; dark `#EEF1F6`, 15.42). Red, green and blue are used only as semantic colors and accents (a three-color stripe on active nav, charts). The quietest option, with the least brand color.

**Accent toggle (applies to Option A).** `data-accent="blue" | "red" | "green"` swaps only `--color-primary*` and `--color-focus`. Red accent `#C62828`, white text 5.62, dark `#FF7A73` / on-primary 7.51. Green accent `#0F7A55`, white text 5.34, dark `#3FD08E` / on-primary 9.63. Danger stays red with a mandatory icon when the accent is red.

### 3.2 Typography
Body is DM Sans Variable and headings are Manrope Variable. The base size moves from 13 px to **14 px** (13 px in compact density). Scale: 12 caption · 13 small · 14 body · 16 h3 · 20 h2 · 24 h1 · 30 display (dashboard only). Line height is 1.5 for body and 1.25 for headings. Numbers in tables and money use `font-variant-numeric: tabular-nums`.

### 3.3 Radius, spacing, shadow, z-index
- Radius: `--radius-xs 6px` (badges, kbd) · `--radius-sm 8px` (inputs, small buttons) · `--radius-md 12px` (buttons, rows, menus items) · `--radius-lg 16px` (panels, cards, popovers) · `--radius-xl 20px` (modals, drawers, palette) · `--radius-pill 999px` (chips, avatar, toggles). **No square corners anywhere**, tables included: the wrapper is rounded and only interior cell borders are square.
- Spacing (4-pt): `--space-1 4` · `2 8` · `3 12` · `4 16` · `5 20` · `6 24` · `8 32` · `10 40` · `12 48`.
- Shadow: `--shadow-1` (rest card) `0 1px 2px rgb(16 24 40 / .06)` · `--shadow-2` (hover/popover) `0 6px 16px rgb(16 24 40 / .10)` · `--shadow-3` (modal/palette) `0 20px 48px rgb(16 24 40 / .18)`. Dark mode uses a 1 px `--color-border` ring plus a darker shadow at 40% opacity.
- z-index: `--z-sticky 10` · `--z-sidebar 20` · `--z-popover 40` · `--z-drawer 50` · `--z-modal 60` · `--z-toast 70`.

### 3.4 Density
- Comfortable (default): control height 36, nav row 34, table row 44, panel padding 20.
- Compact: control height 30, nav row 28, table row 34, panel padding 14.

### 3.5 Motion
- Tokens: `--dur-fast 150ms` (hover, press, toggles) · `--dur-base 200ms` (menus, popovers, tabs) · `--dur-slow 250ms` (drawers, modals, palette). Easing: `--ease-standard cubic-bezier(.2,0,0,1)`, `--ease-exit cubic-bezier(.4,0,1,1)`.
- Only opacity and transform are animated (no layout properties). Exit animations are 20% shorter than entry.
- **Signature motion, "Mezcla de luz".** A red, a green and a blue dot drift together and overlap with additive blending (`mix-blend-mode: screen` in dark mode, `multiply` with tints in light mode) into one glowing white or ink dot: the dot of the i in "kit". It is used in exactly three places:
  1. **KIT is thinking.** A loop of the three dots orbiting at 1.2 s per cycle, shown only while an AI request is pending.
  2. **Saved or confirmed.** A single 250 ms glow pulse on the status dot after a successful save or send.
  3. **First load.** One-time wordmark merge of 600 ms or less, skipped if data is ready sooner.
- Animation levels (`data-motion`): **full** as above; **reduced** (the default when `prefers-reduced-motion: reduce`) uses opacity fades only, with no orbiting or movement and a static three-dot indicator; **off** removes all transitions (`0ms`), and the thinking indicator becomes the text "KIT está pensando…".

### 3.6 Settings › Apariencia toggles (per user, stored in `localStorage` keyed by mode + user id, like the existing `kit.shell:*` keys)
| Toggle | Values | Default |
|---|---|---|
| Tema | Claro · Oscuro · Sistema | Sistema |
| Color de acento | Azul · Rojo · Verde | Azul |
| Animaciones | Completas · Reducidas · Desactivadas | Sistema (`prefers-reduced-motion`) |
| Densidad | Cómoda · Compacta | Cómoda |
| Barra lateral | Expandida · Contraída | Expandida |

No other toggles are added in this stage. Language is out of scope until English labels exist. The toggles use segmented controls, not dropdowns, because each has 3 or fewer options.

### 3.7 Dropdown rule
Use a dropdown (rounded listbox popover) only when there are more than 5 options or the choice is secondary. Use a segmented control for 2–4 options, a switch for on/off, and inline buttons for 1–3 actions. Use a "⋯" menu for secondary row actions.

### 3.8 Components to rebuild on the tokens (`src/shared/ui.tsx` plus new files under `src/shared/ui/`)
Existing exports to rebuild with the same names and props: `Button`, `PageHeader`, `Badge`, `Avatar`, `Panel`, `TextLink`, `Empty` (becomes the single empty-state component with icon, title, text and one action), `SearchField`, `Tabs`, `Field`, `Modal`, `ErrorNote`, `Stat`. Delete: `Placeholder`.
New: `Menu`/`Popover`, `Select` (listbox), `SegmentedControl`, `Switch`, `Tooltip`, `Toast`, `Drawer`, `Skeleton`, `StatusDot`, `Kbd`, `CommandPalette`, `Sidebar`/`SidebarGroup`/`SidebarItem`/`SidebarSubmenu`, `UserChip`/`AccountMenu`, `Wordmark`, `LightMix` (signature motion), `IntegrationCard`.

### 3.9 Consistent action placement
- Page header: title on the left, **one primary action** on the right, secondary actions in a "⋯" menu next to it.
- Record detail: the header holds status and primary action, tabs below. Destructive actions appear only in "⋯" with a confirm modal.
- AI suggestions always open in the right-hand review drawer with Aplicar / Descartar. Nothing applies without a click.
- Lists: filters in one row above the list, bulk actions in a sticky bar that appears on selection.

## 4. Navigation and sidebar spec

### 4.1 Six destinations (submenus open as rounded popovers when collapsed and as inline accordions when expanded)
| # | Row (icon) | Goes to | Submenu (real routes only) |
|---|---|---|---|
| 1 | Inicio (`LayoutDashboard`) | `/` | Resumen `/` · Informes `/reports` |
| 2 | Eventos (`CalendarDays`) | `/events` | Eventos `/events` · Producción `/production` |
| 3 | Ventas (`FileText`) | `/proposals` | Propuestas `/proposals` · Mensajes `/inbox` (unread badge) · Clientes `/clients` |
| 4 | Diseño (`Layers3`) | `/design` | Planos y 3D `/design` · Estudio creativo `/creative` |
| 5 | Recursos (`Box`) | `/inventory` | Equipos `/inventory` · Lugares `/venues` · Archivos `/library/files` |
| 6 | KIT (`Sparkles`) | `/kit` | — (the top-bar "Preguntar a KIT" opens the side panel) |

Utility group (after a thin divider): **Buscar** (`Search`, shows `⌘K`, opens the palette) · **Configuración** (`Settings`, `/settings`, submenu chevron: General, Usuarios y roles, Integraciones, Apariencia, Datos). Footer group: **Ayuda** (opens the in-app guide and shortcuts) · **Página de reservas** (`ExternalLink` icon, opens the Cal.com page in a new tab, **shown only when Cal.com is connected**).
Then the **user chip**: initials avatar ("HD"), name "Honasis Dotel", role tag "Propietario", and a chevron. It opens the account menu: Mi cuenta (password change, already built) · Apariencia (quick theme segmented control) · Configuración · Espacio de demostración (enter or exit) · Cerrar sesión. A status dot on the avatar shows sync state (green saved, blue syncing, red conflict or offline, with a tooltip and a link to the review).

Rules: a row is hidden when `canSeeModule` denies every route under it. A parent with a single visible child links straight to that child with no chevron. No row appears without a destination. `/library` redirects to `/inventory`, and `/search` stays as the full results page (Enter in the palette).

### 4.2 Row anatomy
Height 34 (28 compact), padding 0 10, radius `--radius-md`, 18 px icon, 13–14 px label, 8 px gap. Active row: `--color-primary-subtle` background with primary-colored text and icon, plus `aria-current="page"`. Hover: `--color-elevated` over 150 ms. Dividers are 1 px `--color-border` with 8 px vertical margins. Submenu chevrons rotate 90° in 150 ms. External links show a 14 px `ExternalLink` icon at the right edge and carry `rel="noopener"`.

### 4.3 Collapsed state (64 px wide)
Icons only, centered, with a tooltip (label + shortcut) on hover and focus after 300 ms. A row with a submenu opens a rounded popover (`--radius-lg`, `--shadow-2`) to the right with the submenu items. The user chip collapses to the avatar and opens the same account menu. The collapse button sits at the bottom of the top group. `⌘\` toggles collapse. The state persists per user, and Settings › Apariencia sets the default.

### 4.4 Mobile (< 900 px)
The sidebar becomes an off-canvas drawer (280 px, slides in over 250 ms, backdrop, focus trapped, Esc and backdrop close it, closes on navigation). This builds on the existing `mobileNav` and `nav-backdrop` in `App.tsx`. Submenus are inline accordions. The top bar keeps the menu, the current page title, a search icon (palette) and the KIT button. Under 600 px, KIT opens as a full-screen sheet. Touch targets are at least 44 × 44.

### 4.5 Top bar and removal of the hub tab bar
`HubNavigation` (second nav layer) is removed. Submenus replace it, so sections are reachable from the sidebar and the palette. The top bar holds breadcrumb, search, notifications (existing pending review list) and "Preguntar a KIT". `WorkspaceTabs` (desktop tabs) stays, shown only in Tauri.

### 4.6 Command palette (⌘K / Ctrl+K)
Rebuild of the modal in `App.tsx:597-662`. A rounded `--radius-xl` dialog, 640 px wide, `role="dialog"` + combobox/listbox ARIA.
Groups in order:
1. **Acciones**: Nuevo evento, Nueva propuesta, Redactar propuesta con IA, Nuevo cliente, Subir plano, Ir a Integraciones.
2. **Ir a**: the 6 destinations, submenu items and settings sections.
3. **Registros**: events, clients, proposals, venues and equipment from `src/shared/search.ts`.
4. **Preguntar a KIT**: "Preguntar a KIT: «…»" sends the query to the KIT panel.

Arrow keys move, Enter runs, Esc closes, `⌘Enter` opens full search. Results respect `canSeeModule`. The last 5 commands are remembered per user. Each row shows its shortcut where one exists.

## 5. Integrations and AI plan

### 5.1 Every key and service
| Service | Env vars (server only) | Used by | Missing-key behavior |
|---|---|---|---|
| AI provider (Claude recommended; OpenAI today; Gemini optional) | `KIT_AI_PROVIDER` (`anthropic`/`openai`/`gemini`), `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` or `GEMINI_API_KEY`, `KIT_AI_MODEL`, `KIT_CHAT_MODEL`, `KIT_PLAN_MODEL` | Proposal drafting (`server/proposal-ai.ts`, `routes/ai.ts`), KIT chat (`server/kit.ts`), floor-plan extraction (`server/design.ts` `FloorPlanExtractor`) | Manual drafting and tracing stay fully usable. A banner reads "La IA no está conectada. Puedes trabajar manualmente. [Conectar en Integraciones]" (owner only). The KIT panel shows an empty state. No error screens |
| SerpApi | `SERPAPI_API_KEY`, `KIT_SERPAPI_MONTHLY_CAP` | Equipment lookup (Google Shopping: specs and reference prices as **suggestions**, never catalog prices), venue lookup (Google Maps: address, phone, photos link), local event lookup (Google Events) | The lookup button is hidden for non-owners. Owners see "Búsqueda externa no conectada". At the cap: "Límite mensual alcanzado" |
| Scheduling (Cal.com) | `CALCOM_API_KEY`, `CALCOM_WEBHOOK_SECRET`, `CALCOM_BOOKING_URL` | Site visits and client consultations; webhook `BOOKING_CREATED/RESCHEDULED/CANCELLED` → lead or visit draft on a client/event; booking-page link | No "Página de reservas" row; the event "Programar visita" action is hidden. Events and production schedules work as before |
| WhatsApp Cloud API (Meta) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` (webhook signature), `WHATSAPP_VERIFY_TOKEN` | Owner-confirmed outbound, signed inbound (`server/messaging.ts`, `routes/messaging.ts`) | Inbox shows "Conecta WhatsApp para enviar y recibir"; drafts are kept (existing 503 message in `routes/messaging.ts:89`) |
| Semantic search (existing) | `KIT_SEARCH_PROVIDER_URL/TOKEN/NAME/REGION/RETENTION`, budget vars, `KIT_SEARCH_ENCRYPTION_KEY` | Cloud semantic file search (`CloudSearchSettings.tsx`) | Local keyword search only (current behavior) |
| Email (account recovery, optional) | `KIT_EMAIL_PROVIDER`, `KIT_EMAIL_API_KEY`, `KIT_EMAIL_FROM` | Password recovery, invitations | Admin issues temporary passwords (already built) |
| OCR (desktop, optional) | `KIT_TESSERACT_PATH` (native env) | Scanned plan and PDF text | Skip OCR; manual tracing |
| ICS calendar feed (no key) | — (per-user signed URL secret stored on the server) | Read-only feed of events and shifts for Google/Apple/Outlook calendars | n/a; off until the user creates a feed |

**Key rules.** Keys never use `VITE_` variables, never reach client code or responses (status endpoints return only `configured`, provider, model and a last-4 hint at most), are never logged (`server/logger.ts` gets a redaction list), and are never committed (`.env*` is git-ignored; `.env.example` lists names only).

### 5.2 Settings › Integraciones page
- Cards grouped as IA · Mensajería · Agenda · Búsqueda · Correo. Each card shows icon, name, purpose in one sentence, a status chip (Conectado · Sin configurar · Error · Probando…), last successful test time, and the model or account where relevant.
- Actions (owner/admin only; others see read-only status): **Probar conexión** makes one minimal live request (for example a 1-token model call or a SerpApi account call), which the server rate-limits and audits. **Agregar / Reemplazar clave** is phase 2 (encrypted store, Q5); phase 1 shows the env var name to set and a copy button. **Quitar** is phase 2, with a confirm. Usage this month shows AI requests, SerpApi searches against the cap, and WhatsApp templates sent.
- Server routes (new, additive; ask before finalizing shape): `GET /api/integrations` (status list) · `POST /api/integrations/:id/test` · phase 2 `PUT/DELETE /api/integrations/:id/key`. Owner-only, CSRF-protected, audited.
- Phase 2 storage: `integration_secrets` table, AES-256-GCM with `KIT_SECRETS_KEY` from env. **This changes the on-disk database format and needs explicit approval.**

### 5.3 Industry research and recommendations

| Integration | Why | Impact | Effort | Cost | How it simplifies the layout |
|---|---|---|---|---|---|
| **Claude vision + structured output for floor plans** | Today's 503 extractor is the biggest missing piece of the AI layout tool. Event diagram leaders (Prismm/AllSeated, Cvent/Social Tables) sell 2D→3D walkthroughs but advertise **no** image-to-3D import, so this is a real differentiator | High | M (implement `FloorPlanExtractor` adapter, review UI already exists) | Opus 5.5 $4 / $20 per 1M tokens; Haiku 5.5 $0.10 / $0.50 | "Subir plano" becomes one action in Diseño and the palette; the AI result opens in the existing review drawer |
| **Claude for quote drafting** (replace or alongside OpenAI) | Same structured, catalog-validated flow (`proposal-ai.ts`). AV rental suites (Current RMS, Rentman, Flex) focus on fast quoting and real-time availability; AI quoting there comes mostly from third-party add-ons | High | S–M (adapter swap behind `structuredResponse`) | As above | "Redactar con IA" lives only inside Propuestas and the palette, with no separate AI page |
| **Cal.com** (recommended over Calendly) | Open API v2, signed webhooks (`x-cal-signature-256`, HMAC-SHA256), embeds, self-host option. Calendly needs a paid plan for webhooks and Scheduling API endpoints | Medium–high | M | Free (1 user); Teams $12/user/month; self-host free (license changed in 2026; verify) | Replaces ad-hoc "call me" threads: one "Programar visita" button on client/event and one external-link row |
| **WhatsApp Cloud API** | Boundary, owner confirmation and duplicate-safe ingestion are already built | High (PR clients live on WhatsApp) | M (transport + signed webhook) | Per delivered template message since 2025-07-01; replies in the 24 h service window are free | Inbox becomes the single client conversation place; the demo copy goes away |
| **SerpApi** | Lookup of equipment specs, venue details and local events to prefill records | Medium | S | Free 250/month; Starter $25 for 1,000; Developer $75 for 5,000 | One "Buscar en la web" field inside the new equipment, venue and event forms instead of a separate research screen |
| **ICS feed** | Calendars without an API key or vendor | Medium | S | $0 | No in-app calendar page needed yet; staff see events in their own calendar |
| Gemini (optional alt) | Cheaper Flash models for bulk work; free-tier content is used to improve Google products, so **paid tier only** for client data | Low–medium | S once the adapter exists | 2.5 Flash $0.30 / $2.50; 3.1 Pro preview $2 / $12 per 1M | Same as Claude; selected in Integraciones › IA |

Sources: [Cal.com pricing](https://cal.com/pricing) · [Cal.com webhooks](https://cal.com/docs/developing/guides/automation/webhooks) · [Cal.com vs Calendly API](https://cal.com/blog/calendly-api-vs-cal-com-api) · [Cal.com AGPLv3 history](https://cal.com/blog/changing-to-agplv3-and-introducing-enterprise-edition) · [Calendly API overview (paid plan for webhooks)](https://calendly.com/help/calendly-api-overview) · [Hookdeck: Calendly webhooks](https://hookdeck.com/webhooks/platforms/guide-to-calendly-webhooks-features-and-best-practices) · [SerpApi pricing](https://serpapi.com/pricing) · [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing) · [Prismm event floor plans](https://prismm.com/events/event-floor-plan-software) · [Prismm via PerfectVenue](https://www.perfectvenue.com/integrations-and-partnerships/prismm-formerly-allseated) · [EventDiagram](https://www.softwaresuggest.com/eventdiagram) · [Current RMS](https://www.current-rms.com/ppc-currentrms-lp-feb2026) · [Rentman vs Flex](https://rentman.io/de/rentman-vs-flex-rental-solutions) · [Swiftask Current RMS AI connector](https://swiftask.ai/ai-integration/current-rms). Claude prices come from Anthropic's model table (cached 2026-10-06); verify at signup. The Cal.com license change to "Cal.diy"/MIT in 2026 is reported only by third parties; verify before self-hosting.

## 6. Implementation checklist (single source of truth)

Before every phase: run `npm run typecheck`, `npm test` and `npm run test:browser`, and compare against `docs/CLEANUP_LOG.md`. If a browser test must change because UI text or navigation changed, stop and explain before editing it (CLAUDE.md). Commit on `main`; no push without approval.

### Phase 0 — Decisions
- [ ] Record the owner's answers to Q1–Q10 in §7. *Files:* `design_stage2.md`. *Accept:* every question has a decision or "default accepted".
- [ ] Get the sidebar screenshot and compare it with §4. *Files:* `design_stage2.md` §4. *Accept:* differences are listed and resolved.

### Phase 1 — Tokens and theming foundation
- [x] Create `src/shared/tokens.css` with §3.1–3.5 tokens for light/dark, accents, density and motion. Import it first in `src/main.tsx`. *Accept:* one `:root` token block in the codebase.
- [x] Remove the `:root` token blocks from `src/styles.css` and `src/desktop.css`; replace hard-coded hex values with tokens. *Files:* `src/styles.css`, `src/desktop.css`, `src/desktop-modules.css`, `src/file-search.css`. *Accept:* `grep -E "#[0-9a-fA-F]{3,6}"` in those files returns only `tokens.css`-approved exceptions (SVG exports and print).
- [x] Add an appearance preference hook that applies `data-theme/accent/motion/density` and the sidebar default, replacing the theme logic in `App.tsx:139-152`. *Files:* `src/shared/appearance.ts` (new), `src/application/App.tsx`. *Accept:* toggles persist per user, survive reload, and `system` follows OS changes.
- [x] Add global reduced/off motion rules and remove the two scattered blocks. *Accept:* with `data-motion="off"`, computed `transition-duration` is 0 on all components.

### Phase 2 — Component rebuild
- [ ] Rebuild the §3.8 existing exports on tokens, keeping names and props. *Files:* `src/shared/ui.tsx` (split into `src/shared/ui/*` re-exported from `ui.tsx`). *Accept:* no import changes needed elsewhere; typecheck passes.
- [ ] Add new components: Menu/Popover, Select, SegmentedControl, Switch, Tooltip, Toast, Drawer, Skeleton, StatusDot, Kbd, Wordmark, LightMix. *Accept:* keyboard operable, visible focus ring (3:1), radius tokens only.
- [ ] Delete `Placeholder` and its usages (P7–P12). *Files:* `ui.tsx`, `Events.tsx`, `operations/Settings.tsx`. *Accept:* `grep -rn "Placeholder" src` finds nothing.

### Phase 3 — Navigation, sidebar, palette
- [ ] Build `Sidebar` per §4.1–4.4 from one nav config (replacing `hubs` and the old `navigation` array). *Files:* `src/application/navigation.ts` (new), `src/application/Sidebar.tsx` (new), `App.tsx`, `Hubs.tsx`. *Accept:* 6 destinations; every row resolves to a route; role-filtered via `canSeeModule`; collapsed/mobile behavior as specified.
- [ ] Remove `HubNavigation` and `LibraryHub`; redirect `/library` to `/inventory`. *Accept:* no second nav bar; old `/library` tabs restore without a 404.
- [ ] Build `UserChip` + `AccountMenu`; move theme, sign-out and demo switch out of the banner and footer (P3, P5, P17, P21). *Accept:* shows the real user name/role; sample shows "Honasis Dotel · Propietario · Demostración".
- [ ] Rebuild the command palette per §4.6. *Files:* `src/shared/ui/CommandPalette.tsx` (new), `App.tsx`, `src/shared/search.ts`. *Accept:* ⌘K/Ctrl+K opens it; actions, destinations and records groups work; axe passes.
- [ ] Replace the brand block with the `Wordmark` (k red, i green, t blue) and the "la gente de los eventos" slogan; update `public/favicon.svg` to the RGB mark. *Accept:* wordmark legible in both themes.
- [ ] Apply §3.9 action placement on every page header. *Files:* `src/modules/**`. *Accept:* each page has at most one primary button.

### Phase 4 — Integrations and AI plumbing
- [ ] Provider-neutral AI adapter with `anthropic`, `openai` and `gemini` implementations behind `structuredResponse`. *Files:* `server/ai-provider.ts`, `server/index.ts`, `.env.example`. *Accept:* existing AI tests pass with fixtures; no live call in tests.
- [ ] Implement `FloorPlanExtractor` on the adapter (vision + strict schema), feeding the existing review flow. *Files:* `server/design.ts`, `server/design.test.ts`. *Accept:* fixture image → reviewed layout; missing key → existing 503 message.
- [ ] `GET /api/integrations` and `POST /api/integrations/:id/test` (owner-only, audited, rate-limited). Ask before finalizing the route shape. *Files:* `server/routes/integrations.ts` (new), `server/app.ts`, tests. *Accept:* responses never contain secrets; non-owner gets 403.
- [ ] Logger redaction for key-like values and auth headers. *Files:* `server/logger.ts`, `server/logging.test.ts`. *Accept:* a test proves keys are not printed.
- [ ] Settings › Integraciones UI per §5.2 (P10, P13). *Files:* `src/modules/operations/Settings.tsx`, `src/modules/settings/Integrations.tsx` (new). *Accept:* real status per service; clear empty states.
- [ ] Missing-key empty states in Propuestas, KIT, Inbox and Diseño (P15, P23). *Accept:* with no keys set, every screen renders and offers manual work.
- [ ] (Gated, Q5) Encrypted key store and add/remove-key routes. *Accept:* approval recorded in §7 before starting.
- [ ] (Gated, Q6) Cal.com webhook receiver (HMAC verify) and booking-page row. *Accept:* signed fixture creates a draft for review; unsigned is rejected.
- [ ] SerpApi lookup inside the new equipment, venue and event forms, with a monthly cap. *Accept:* results labeled "sugerencia"; never overwrite catalog prices.
- [ ] ICS feed per user (signed URL, revocable). Ask before adding the route. *Accept:* valid ICS that imports into Google/Apple calendars.

### Phase 5 — Signature motion and polish
- [ ] `LightMix` thinking indicator in KIT chat and AI drafting; save pulse on the status dot; first-load wordmark merge. *Files:* `src/shared/ui/LightMix.tsx`, `KitChat.tsx`, `ProposalAI.tsx`. *Accept:* 150–250 ms for UI transitions; reduced/off behave per §3.5.

### Phase 6 — Placeholder removal, accessibility, performance, responsive, build
- [ ] Start in company mode; demo opt-in with a persistent chip (P1, Q7). *Files:* `src/shared/store.tsx`, `SessionAccess.tsx`. *Accept:* fresh install shows company sign-in or setup; demo only after an explicit choice.
- [ ] Demo seed owner becomes Honasis Dotel; remove "Alex Morgan" fallbacks (P2–P4). *Files:* `src/shared/seed.ts`, `App.tsx`, `Events.tsx`, `operations/Reports.tsx`, `operations/Production.tsx`. *Accept:* `grep -rn "Alex Morgan" src server` returns nothing.
- [ ] Fix the remaining items in §2.4 (P5, P6, P8, P9, P11, P12, P14, P16, P18, P19, P20, P22). *Accept:* each row in the table is marked done in §7.
- [ ] Sweep: `grep -rniE "lorem|próximamente|coming soon|showcase|ilustrativ|href=\"#\""` across `src server`. *Accept:* only test or demo-gated hits remain, each listed in §7.
- [ ] Accessibility: axe on all routes in both themes and both densities, keyboard-only pass on sidebar, palette, menus and drawers, contrast spot checks against §3.1. *Files:* `tests/browser/accessibility.spec.ts` (additive). *Accept:* zero serious or critical axe violations.
- [ ] Responsive: 360, 768, 1024 and 1440 px for every top-level route, with no horizontal scroll and drawer navigation under 900 px. *Accept:* Playwright screenshots reviewed.
- [ ] Performance: `npm run perf` and Vite bundle report; lazy-load Three.js routes (`/design`) and the palette's record index. *Accept:* no regression against the baseline; first load of `/` does not load `three`.
- [ ] Final gate: `npm run typecheck`, `npx prettier --check src tests *.ts *.json index.html README.md`, `npm test`, `npm run test:browser`, `npm run build`. *Accept:* all pass against the `docs/CLEANUP_LOG.md` baseline, with results recorded in §7.

## 7. Decisions log

_(empty — to be filled as decisions are made)_
- 2026-10-17 · Work started on the recommended defaults for Q1 (build to §4), Q2 (server role keys unchanged), Q3 (Option A "Señal"), Q4 (Claude Opus 5.5), Q5 (phase 1: keys in server env), Q7 (company mode first, demo opt-in) and Q9 (Prettier + typecheck as the lint gate). These are working assumptions, not owner decisions; Phase 0 stays open until the owner confirms.
- 2026-10-17 · Phase 1: `desktop-modules.css` lost its ~270 dark overrides (tokens now flip with the theme); proposal previews and print keep a scoped light palette. Text below 12 px moved up to the 12 px caption size. The legacy `kit.theme` key is still read and written so saved themes survive the upgrade.
