# KIT Design — implementation plan

Status: **Phases 1–4 implemented and tested on fixtures, plus the history/video update (November 9, 2026). Phase 0 (the live trial on real venue photos) waits for the owner's keys and photos.** Prepared November 9, 2026. Revised November 9, 2026 (output is finished images, not an interactive 3D viewer; the "no external calls" rule is removed).
This plan **replaces** the current Design section ("Planos y 3D") and "Estudio creativo". Nothing in them is a requirement for the new one.

## 1. What we are building

Think of a construction company showing a client the finished house, furnished, before anything is built. **KIT Design does that for events.**

A user opens Diseño, drops photos or a floor plan of the venue, tells KIT Design what the event is, and gets back **realistic images of that same room, set up for the event**: stage, screens, lighting, tables, chairs, décor, all in place. They then tell KIT Design what to change in plain language and it re-renders.

There is **no moving 3D panel**. The product is the picture (and later a short walkthrough video).

### The whole experience in four steps

1. **Drop** the room images (photos of the venue, or a floor plan).
2. **Tell** KIT Design the event ("boda para 120, escenario al fondo, tonos dorados").
3. **See** realistic renders of the room as it will look, next to the original (before / after).
4. **Refine** by chat ("más luz cálida", "quita las sillas de la derecha", "pantalla más grande"). Repeat until the client says yes.

### Product rules

- **One screen, one primary action.** No tool palettes. The AI does the work; the person reviews.
- **AI only suggests.** Nothing is added to a proposal, quote or inventory reservation without an explicit **Confirmar** (same rule as KIT Act mode).
- **Everything is versioned.** Every render belongs to a version; one click returns to any earlier one.
- **Honest about accuracy.** A render is a visualization, not a measured drawing. The UI says so ("Visualización, no a escala") and the equipment list comes from the design spec, not from counting objects in the picture.
- UI text in Spanish; code and docs in English.

## 2. How it works (recommended approach)

Two AI jobs, one simple pipeline. Everything else is plain app code.

| Step              | Job                                                                                                                        | Provider                                                                                        | Output                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Understand** | Look at the room images + event brief + the company catalog. Decide what goes where.                                       | **Anthropic (Claude vision)** via the existing `server/ai-provider.ts` (already accepts images) | A validated **Design spec**: room facts, style, list of catalog items with quantities and placement notes, and one render prompt per view |
| **2. Render**     | Paint the furnished room, keeping the real room's walls, windows, floor and viewpoint                                      | **Higgsfield** image generation using the original room photo as the reference image            | Realistic images, one per view                                                                                                            |
| **3. Refine**     | Turn a chat request into a spec change plus an image edit, so the room stays the same and only the requested thing changes | Claude (edit the spec) then Higgsfield (edit the image)                                         | New version                                                                                                                               |

Why this and not a 3D engine: a 3D viewer shows prefab boxes and needs the user to navigate; clients want a finished picture. Image models do the "looks real" part directly from the venue's own photo, which is what makes it feel like their room.

### What the image model is and isn't good at (so we design around it)

- **Good:** realistic materials, lighting, atmosphere, furniture styling, keeping the room's structure from a reference photo.
- **Weak:** exact counts ("120 chairs"), exact positions, precise sizes, text on signs.
- **Our mitigation:** the **spec** is the source of truth for counts, items and placement; the image is the visual. Renders show "≈" quantities only through the equipment list, never through the picture. When a user wants exact placement, the chat says so plainly and describes placement in the prompt as best as possible.

### Input types

- **Venue photos** (best case): rendered directly from the photo's viewpoint; each photo becomes one or more views.
- **Floor plan**: no real photo to anchor on. KIT Design generates a top-down layout picture plus a few perspective views of the described space. Quality is lower than from photos; the UI suggests adding a photo when only a plan is dropped.
- Up to 6 images per project, JPG/PNG/WebP.

**Phase 0 decides** whether Higgsfield's image-to-image keeps the room faithful enough. If not, the render provider is swapped behind the same interface.

## 3. The screen

One route, `/design`. The event is chosen once at the top, or inherited when opened from an event.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Diseño  ·  [ Boda García — Salón Real ▾ ]            v3 ▾   Compartir │
├───────────────────────────────────────────────┬──────────────────────┤
│                                               │  KIT Design          │
│   ┌─────────────────────────────────────┐     │                      │
│   │                                     │     │  Suelta las fotos o  │
│   │   Suelta aquí las fotos o el plano  │     │  el plano del salón  │
│   │   del salón                         │     │  y cuéntame qué      │
│   │   (JPG, PNG, WebP · hasta 6)        │     │  evento es.          │
│   │                                     │     │                      │
│   └─────────────────────────────────────┘     │  ┌────────────────┐  │
│                                               │  │ Escribe aquí…  │  │
│   [ Vista 1 ] [ Vista 2 ] [ Vista 3 ]         │  └────────────────┘  │
│   Antes ◀────●────▶ Después                   │  [Crear diseño]      │
│                                               │                      │
│   Equipo: 24 artículos        [Generar más]   │                      │
│   [ Versión 1 ][ Versión 2 ][ Versión 3 ]     │                      │
└───────────────────────────────────────────────┴──────────────────────┘
```

States of the same screen:

1. **Empty:** drop zone and chat prompt only.
2. **Working:** progress line in chat ("Leyendo el salón… diseñando… generando vistas…"); originals visible while renders arrive.
3. **Result:** large render with a **before/after slider** against the original photo, view thumbnails, equipment list, version strip.
4. **Refining:** a new render appears as a pending version with **Aplicar / Descartar**; applying makes it the current version.

Everything a user can do: drop images, chat, slide before/after, pick a view or version, download, share. That is the whole surface.

Labels go in `src/shared/i18n.ts` ("Crear diseño", "Aplicar", "Descartar", "Antes", "Después", "Visualización, no a escala").

## 4. KIT Design's abilities (tools)

KIT Design only calls these server-side functions. All model output is validated with zod and treated as data, never authority.

| Tool              | What it does                                                                                                   | Needs confirmation?                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `read_room`       | Classifies each image (photo or plan), notes room size estimate, openings, existing furniture, style, lighting | No (analysis)                                        |
| `write_spec`      | Builds the Design spec from brief + catalog (items, quantities, placement notes, per-view render prompts)      | No (it is a draft)                                   |
| `render_views`    | Asks the render provider for each view                                                                         | Shows cost / remaining quota first                   |
| `edit_design`     | Chat request → spec change → image edit on the current view(s)                                                 | Result is a pending version: **Aplicar / Descartar** |
| `check_inventory` | Compares the spec's equipment to stock on the event dates; flags shortages                                     | No (read-only)                                       |
| `add_to_proposal` | Copies the spec's equipment list into the event's proposal draft                                               | **Yes, always**                                      |

Out of scope for v1: manual drawing or geometry editing, interactive 3D, CAD import, video walkthroughs (candidate for a later phase).

## 5. Design spec (the source of truth)

```ts
interface DesignSpec {
  room: {
    widthM?: number;
    depthM?: number;
    heightM?: number;
    measured: "estimated" | "confirmed";
    notes: string;
  };
  style: { mood: string; palette: string[]; lighting: string };
  items: {
    equipmentId?: string;
    label: string;
    quantity: number;
    placement: string;
  }[];
  views: { id: string; sourceImageId: string; prompt: string }[];
}
```

Items map to the company catalog (`equipmentId`), which is what makes the design quote-ready. Free-text items (décor the catalog doesn't have) are allowed but flagged "no está en el catálogo".

## 6. Data and storage

Needs your approval (CLAUDE.md: changes to the database format).

- **Images** (room photos, renders): private **Supabase Storage** bucket, not the workspace JSON row (current design stores base64 there, which is slow). Vercel request bodies are limited to 4.5 MB, so the browser uploads directly with a short-lived signed URL.
- **Metadata**: new tables in the `kit` schema (`design_projects`, `design_versions`, `design_images`, `design_renders`) keyed by `event_id`, same writer lock and PGlite parity as the rest of `server/db/`. Versions are append-only.
- **Old data:** existing `layouts` and `creativeAssets` stay in the workspace JSON, untouched and not migrated.

## 7. Server

New files, mirroring `server/kit.ts` and `server/design.ts`:

- `server/design-ai/service.ts`: routes under `/api/design/*` (create project, upload-url, analyze, chat, render, apply, versions).
- `server/design-ai/tools.ts`: the tool table above.
- `server/design-ai/render-provider.ts`: `RenderProvider` interface with `HiggsfieldProvider` and a `FixtureProvider` (bundled sample images, used by all tests and local development so they never spend credits).
- Renders take 10–60 seconds, so they run under `waitUntil` with a job row; the UI polls the job id.
- Authorization on every route: logged-in user, `ownsEvent`, role from `src/shared/access.ts`. Per-user rate limit and an admin-set **monthly render cap** so cost cannot run away.
- Keys (`ANTHROPIC_API_KEY`, `HIGGSFIELD_*`, Supabase service key) live only in server environment variables, are never logged and never reach the browser.

## 8. Frontend

New folder `src/modules/design-ai/` (replaces `src/modules/design/` and `Scene.tsx`):

- `DesignPage.tsx`: layout above, event picker.
- `DropZone.tsx`: multi-image drop, client-side resize (reuse the idea in `floor-plan-image.ts`, then delete that file), direct upload.
- `BeforeAfter.tsx`: the slider; `ViewStrip.tsx`, `VersionStrip.tsx`.
- `DesignChat.tsx`: reuse KIT's chat components so it feels like KIT.
- `EquipmentList.tsx`: spec items with catalog link and stock warnings.

No three.js is needed by this section. (Check whether anything else uses `three` before removing the dependency.)

## 9. Rules change: external calls are now allowed

Decision (November 9, 2026): the app will integrate with many external APIs, so the blanket **"No external calls"** rule in CLAUDE.md is removed. This plan makes that edit part of Phase 1.

What changes in CLAUDE.md:

- Remove the "No external calls" rule and its two owner-approved exceptions (portal Supabase, company database), replacing them with a short **External services** section: which services the app uses, where their keys live (server environment only), and that keys are never committed or sent to the browser.

What stays (these are safety rules, not network rules):

- Never commit credentials; never touch `.env*`.
- Tests and local development use fixtures and PGlite, not live services, so `npm test` is free, deterministic and works offline.
- AI only suggests; outgoing client messages, proposal acceptance and mutations need confirmation and a server-side authorization check.
- Never touch `data/` or `node_modules/`; no push or deploy without approval.

I will not edit CLAUDE.md until you approve this plan.

## 10. What gets removed

After your approval (CLAUDE.md: ask before deleting files):

- `src/modules/design/*`, `src/modules/Design.tsx`, `src/modules/Scene.tsx`, `src/modules/scene-shapes.ts` (+ test)
- `server/design.ts`, `server/design.test.ts`
- Estudio creativo: `/creative` route and module, `src/shared/creative.ts`, `creativeAssets` / `creativeAssetIds` types, related seed data
- Sidebar: "Planos y 3D" and "Estudio creativo" become one item, **Diseño**
- Layout helpers in `src/shared/domain.ts` (`validateLayoutGeometry`, `reconcileLayoutEquipment`, `layoutSvg`) once nothing else uses them
- Matching entries in `tests/browser/`, `docs/STATUS.md`, `docs/design.md` references

Before deleting I will grep every consumer (proposals, reporting, desktop milestone 6, KIT context) and list them for you.

## 11. Phases

Each phase ends with typecheck, `npm test` and `npm run test:browser` green, committed on main (no push without approval).

**Phase 0: Spike (no app code, ~1 day).**
With your approval and keys, run the pipeline by hand on 3–5 of your real venue photos and plans: Claude produces the spec, Higgsfield renders it from the photo. Judge: Is the room still recognisably the same room? Do the items look right? What does one render cost and how long does it take? Output: a findings note, sample images, a go/no-go on Higgsfield, and a monthly cap suggestion.

**Phase 1: Skeleton and cleanup.**
Edit CLAUDE.md (section 9), remove the old sections, add `/design` with drop zone, event picker, before/after slider, version strip, chat shell and `FixtureProvider`. No live AI. _Done when:_ a user can drop images, see fixture renders against the original, switch versions, in sample and company mode.

**Phase 2: Understand and spec.**
Storage and tables, `read_room`, `write_spec`, equipment list, estimated-measurement labels. Tests use a fixture generator, as KIT does. _Done when:_ a real photo plus "boda para 120" yields a sensible spec with catalog items.

**Phase 3: Live renders and refine.**
`HiggsfieldProvider`, job polling, quota and cap, `edit_design` with Aplicar / Descartar. _Done when:_ a render appears from a real photo, a chat change yields a new pending version, and the cap blocks the next render when reached.

**Phase 4: Business links and sharing.**
`check_inventory`, `add_to_proposal` (confirmed), download and share (PNG set, PDF one-pager with renders and equipment list), optional read-only client link.

## 12. Risks

- **Render fidelity.** The image model may change the room or invent details. Mitigation: Phase 0 gate, reference photo on every render, the "Visualización, no a escala" label, equipment list from the spec.
- **Counts and positions in images are approximate.** Mitigation: the spec is the source of truth; the UI never claims the picture is exact.
- **Floor-plan-only input is weaker.** Mitigation: nudge users to add a photo.
- **Render cost.** Mitigation: on-demand only, visible quota, monthly cap, fixtures in tests.
- **Provider lock-in or API change.** Mitigation: `RenderProvider` interface.
- **Removing the no-external-calls rule loosens a safeguard.** Mitigation: keys stay server-side, tests stay offline, AI-only-suggests rules remain.

## 13. Decisions and open items

**Decided (November 9, 2026):**

1. Output is **realistic images of the furnished room**, not an interactive 3D viewer.
2. Pipeline: Claude understands and writes the spec; **Higgsfield** renders (confirmed or replaced in Phase 0).
3. Image storage: **Supabase Storage**.
4. Old layouts and creative assets: data left in the database, UI and code removed.
5. The "no external calls" rule is **removed** from CLAUDE.md (Phase 1).

**Still open:**

- Who may use Diseño: assumed the same access as today's Design (workspace users and admins).
- Monthly render cap: set after Phase 0 shows real pricing.
- Whether clients get a read-only share link, and whether a walkthrough video is wanted after Phase 4.

## 14. Progress

### Phase 1: done (November 9, 2026)

- CLAUDE.md: the "No external calls" rule is replaced by an **External services** section (keys server-side only, provider interfaces with fixtures, tests offline, caps on paid calls).
- New `/design` (KIT Design): event picker, multi-image drop (up to 6, resized in the browser), chat, before/after slider, view thumbnails, equipment list from the spec, versions, pending change with **Aplicar / Descartar**, download. Code: `src/modules/design-ai/`, shared records in `src/shared/kit-design.ts`.
- `fixtureEngine` stands in for Claude + Higgsfield behind the `DesignEngine` interface. Its renders are the original photo with a tint and a "MUESTRA" band, so they cannot pass for real renders, and every reply says no image engine is connected yet.
- Removed screens: the floor-plan/3D editor (`src/modules/design/`, `Scene.tsx`, `scene-shapes.ts`), Estudio creativo (`operations/Creative.tsx`), the floor-plan AI route (`server/design.ts`, `/api/design/status`, `/api/design/extract`). `/creative` redirects to `/design`. The sidebar shows one item, **Diseño**. The event page lost its "Creative Assets" tab and its old plan/concept lists.
- **Kept on purpose** (the data stays in the database): the `layouts` / `creativeAssets` types, server validation and policy for them, backup, `src/shared/creative.ts` and the layout helpers in `src/shared/domain.ts` (used by those validation tests), and the proposal editor's existing "add 2D / 3D / creative image" pickers for already-stored records. `KIT_PLAN_MODEL` stays; Phase 2 reuses it as KIT Design's model. The `three` dependency is now unused but not uninstalled (that edits `node_modules`).
- Tests: new `src/modules/design-ai/design-ai.test.ts` (engine and versions); the floor-plan route test was deleted with the route; browser specs for the removed screens were replaced by one KIT Design journey. The browser suite as a whole still cannot run until it is updated to the single-login flow (pre-existing, see CLEANUP_LOG); the KIT Design journey was checked against a seeded local server with a Playwright script instead.

**Known limits of Phase 1:** projects live in the browser tab's memory (lost on reload); every role that can edit layouts can use it; on phones the chat sits below the result.

### Phases 2–4: implemented (November 9, 2026)

Everything below runs and is tested with offline fixtures. The live providers are wired and covered by tests against stubbed HTTP, **but have never been called for real** (that is Phase 0).

**Phase 2: understand and spec, stored on the server**

- Migration `supabase/migrations/20261109000013_kit_design.sql`: tables `design_projects`, `design_images`, `design_versions`, `design_renders`, `design_messages`, `design_files` in the `kit` schema, plus the private Storage bucket `kit-design`. PGlite runs migrations 12 and 13.
- Storage (`server/design-ai/storage.ts`): the private Supabase bucket when `SUPABASE_URL` + `SUPABASE_SECRET_KEY` are set, otherwise the database. **Deviation from §6:** images upload through the API one at a time (each is at most 1 MB after browser resizing), not through signed upload URLs. That stays far below Vercel's 4.5 MB limit and keeps the bucket fully private.
- Designer (`server/design-ai/designer.ts`): Claude (or the configured provider, `KIT_PLAN_MODEL`) reads the images, brief, event and catalog in one call and returns a zod-validated spec. Catalog IDs the catalog doesn't have become free-text décor. Every image gets a view; measurements are always "estimated". Without an AI key, the sample designer is used.
- API (`server/design-ai/service.ts`, all behind session + CSRF): `GET /api/design/status`; `GET /api/design/events/:id`; `POST|DELETE …/images`; image and render files (auth-checked, never public); `POST …/messages` (creates the design or proposes a change); `POST …/apply`, `…/discard`, `…/select`.
- Access: who sees **Diseño** (`canSeeModule`) and owns the event; creating needs layout-edit rights (Administrator, Event Designer, Production Manager). Uploads are checked against their real file type. Rate limits are 30 per person and 200 for the company per 15 minutes.
- Work runs in the background (`waitUntil` on Vercel). The browser polls; a cut-off job is freed after `KIT_JOB_STALE_MS`, as for KIT.

**Phase 3: live renders and refining**

- `server/design-ai/render-provider.ts`: Higgsfield with **Qwen Image 3 Edit** (`alibaba/qwen-image-3/edit`, configurable through `KIT_DESIGN_RENDER_MODEL`). The flow: upload the image to a Higgsfield signed URL, submit with an idempotency key, poll (2 s rising to 10 s), download. The aspect ratio matches the photo, and errors are translated to Spanish (no balance, rejected content, busy).
- Refining edits the **current render** with an instruction to change only what was asked, so the room stays the same. The result is a pending version with **Aplicar / Descartar**.
- Monthly cap: `KIT_DESIGN_MONTHLY_RENDER_CAP` (default 100) counts live renders company-wide and is checked before each job. The chat shows "Cada mensaje genera N renders · X de Y usados este mes". Sample renders are free and carry a "MUESTRA" label.

**Phase 4: business links and sharing**

- check_inventory: each catalog item shows **Disponible** or **Faltan N** for the event dates. Other events' reservations count; this event's own don't.
- add_to_proposal: always behind a confirmation dialog that lists each change. It updates the event's newest **Draft** proposal (lines only grow) or creates one. Décor outside the catalog is listed, not priced. The save goes through the normal workspace path, so the server re-checks permission and validity.
- Export: **Descargar** (each render) and **Exportar PDF**, a sheet with the renders, equipment and the "Visualización, no a escala" note, printed with the browser's "Guardar como PDF".

**Not done**

- **Phase 0 live trial.** No real Anthropic or Higgsfield call has been made, and render quality on real venues is unproven. Higgsfield's per-image price isn't published, so the cap default (100) is a placeholder.
- **Read-only client share link.** It needs a public, token-protected route, which is a security decision for you.
- **Assumptions to confirm in Phase 0:** that the Supabase secret key works with the Storage REST API as sent (`apikey` + `Authorization: Bearer`), and that Qwen Image 3 Edit keeps the room faithful enough. If it doesn't, try Grok Image 2.0 or Marketing Studio Flare by changing `KIT_DESIGN_RENDER_MODEL`, after checking that its request fields match.

### Phase 0: how to run it

1. Apply migration 13 to Supabase (docs/DEPLOY_VERCEL.md §1.1).
2. Put `HIGGSFIELD_API_KEY` (`KEY_ID:KEY_SECRET`) and the AI keys (`KIT_AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `KIT_PLAN_MODEL`) in `.env`, and `KIT_DESIGN_MONTHLY_RENDER_CAP=10` for the trial.
3. Run `npm run dev`, open Diseño, and try 3–5 real venue photos and one floor plan. Judge: is the room recognisably the same, do the items look right, and what did Higgsfield charge per image (Console)?
4. Set the real cap, then deploy.

### Update: history, a video instead of before/after, restart (November 9, 2026)

Owner feedback after the first version: keep the page structure, but add a chat history with "new chat" and delete (also for KIT AI), a restart option, drop the before/after slider, and return a **video of the 2D plan that looks 3D**.

- **History.** An event now keeps many designs. A left rail lists them (newest first, grouped by day) with **Nuevo diseño** and a trash button per row; the title is the start of the first request. Creating a new one reuses an empty one already waiting. Migration 14 makes this possible (see `supabase/README.md`); API routes moved under `/api/design/designs/:id/…`.
- **Reiniciar** (KIT Design): clears the versions, videos and conversation of a design and keeps its room images. Delete removes everything, including the stored files. Both are refused while KIT Design is working on that design.
- **KIT AI** (`/kit`): each conversation in the history has a trash button, and **Reiniciar** empties the open conversation (`POST /api/kit/threads/:id/restart`) while keeping it in the history.
- **Video.** The before/after slider is gone. For a floor plan the designer now asks for an isometric 3D cutaway render; the image is then turned into a short mp4 with a slow orbit and push-in (Higgsfield **Kling 3.0 Standard**, image as first frame, sound off; only the camera moves). The first design gets its video automatically; later versions have a **Crear video** button per view. A monthly cap (`KIT_DESIGN_MONTHLY_VIDEO_CAP`, default 10) and the render cap are shown under the chat.
- **Delivery.** Videos play from short-lived signed links to the private bucket (a Vercel function cannot return more than 4.5 MB); the CSP gained `media-src` for the Supabase origin. Without keys a bundled 2-second sample clip is used, marked "Muestra".
- **Not proven.** Kling's output quality and price on a real plan, and whether a 5 s video finishes inside Vercel's 300 s function limit together with the image step, are only known after the Phase 0 trial. If the video is cut off, the design is kept and **Crear video** retries.
