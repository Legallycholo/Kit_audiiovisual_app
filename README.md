# KIT — Production workspace

An audiovisual event production app built around connected events, clients, venues, proposals, equipment, layouts, and production tasks.

Implementation is in progress. The complete product scope is preserved in [the implementation plan](docs/IMPLEMENTATION_PLAN.md); actual delivery status and remaining work are tracked in [implementation progress](docs/IMPLEMENTATION_PROGRESS.md).

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The dev server binds to the local machine only.

```sh
npm run build
npm run preview
npm test
npm run test:browser
```

The browser suite uses an isolated headless installation of Google Chrome through Playwright. Install Chrome if it is not available. It does not use an existing browser profile, account, or customer session. Browser tests start or reuse the local Vite server and write ignored screenshots/traces to `artifacts/`.

## Current implementation

- Responsive app shell with 12 primary destinations, global search, notifications, and a collapsible contextual assistant panel.
- Connected sample events, client profiles, venue rooms, and event detail tabs.
- Editable proposal records, catalog pricing, totals, preserved revisions, internal review, and a print/PDF review view.
- Client inbox with sample threads, message drafts, exact proposal revision context, and an explicit owner acceptance review flow.
- Owned equipment catalog, dated availability, conflict-checked reservations, and fulfillment statuses.
- Production task board, crew assignment summaries, event timelines, and handoff views.
- Structured 2D layout editing, object properties, layers, undo/redo, geometry revisions, JSON export, and a lazy-loaded 3D preview of the same geometry.
- Creative brief workspace, report summaries, company preferences, and integration/readiness screens.

## Data and service boundaries

This implementation currently runs as a **local sample workspace**. Records are illustrative and changes are saved in browser local storage on the current device. It does not yet provide a shared database, real accounts, server authorization, protected audit records, or a production backup service. Do not enter sensitive business data in this preview.

The AI and WhatsApp experiences clearly indicate that they are not connected. Assistant requests do not invoke a model. Outgoing messages cannot be sent. Sample inbound messages are seeded examples, not real client responses. Owner review changes only local sample records.

The owner must confirm every outgoing client message and every client acceptance. A recorded acceptance does not automatically send an acknowledgment, collect payment, reserve equipment, or confirm production readiness.

Tax and discount conventions are provisional: USD, daily catalog rates, line totals rounded to cents, discount before tax. They require business validation before live use. The availability preview counts holds and confirmed/dispatch allocations across inclusive preparation/return dates; returned and cancelled allocations are released.

2D and 3D use meters and shared object dimensions. 3D objects are geometric representations, not calibrated equipment models, lighting simulation, acoustic prediction, or engineering certification. Venue dimensions in the seed are unverified examples.

## Source organization

- `src/application/` — navigation, workspace frame, assistant, search, and notifications.
- `src/modules/` — dashboard, records, proposals, inbox, inventory, production, settings, and design workspaces.
- `src/shared/` — typed domain records, business calculations, local persistence, common UI, and sample data.
- `tests/browser/` — isolated end-to-end workflow, responsive, print, and automated accessibility checks.
- `docs/` — the original plan, current progress, and technical decision notes.

The current stack is React, TypeScript, Vite, React Router, Lucide icons, and Three.js. Three.js loads only when opening the 3D view. The business model and calculations are separated from screen components to support a future authenticated server boundary.

No external accounts have been configured and no app deployment, commits, or pushes have been performed in this implementation pass.
