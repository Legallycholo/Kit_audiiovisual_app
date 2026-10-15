# Audiovisual Event Production Platform — Implementation Plan

Status: **Draft for business review. Development is not authorized.**

Prepared: October 15, 2026

## 1. Purpose, scope, and planning boundaries

Plan a connected audiovisual production platform covering customer acquisition, event planning, venue layouts, visualization, quotations, approval, equipment allocation, crew coordination, execution, and closeout.

This document consolidates the supplied brief's eight requested planning topics—application structure, product requirements, modules and features, user roles, business workflows, information architecture, navigation, and implementation roadmap—into the single requested deliverable, `docs/IMPLEMENTATION_PLAN.md`.

This is a product and conceptual architecture plan. It does not select a technology stack, define physical database tables, configure services, install dependencies, or authorize implementation. Proposed names, workflows, permissions, release boundaries, and folder organization remain subject to review. No commits or pushes are part of this planning task.

### Product outcomes

- Staff can follow an event from initial inquiry through production without repeatedly entering the same customer, venue, equipment, or pricing information.
- Designers can develop dimensioned layouts and inspect the corresponding spatial arrangement in 3D.
- Sales staff can produce editable, branded proposals from reviewed event information and pricing.
- Production staff can distinguish requested, reserved, dispatched, returned, and unavailable equipment.
- AI can assist with planning and creative work while keeping suggestions, confirmed business records, and externally shared material distinguishable.
- Clients can review only the versions and information deliberately shared with them.

Candidate success measures are time to prepare a proposal, time to create a reusable venue layout, repeated data entry, equipment conflicts identified before dispatch, proposal revision turnaround, and production tasks completed on time. Establish baselines and numeric targets with the business before implementation.

### Confirmed business direction

- The first release serves **one audiovisual production company**.
- The company already has an established client base. Existing-client lookup, repeat business, and onboarding current customer records take priority over sophisticated lead acquisition.
- The company owns equipment and rents it to customers. Owned rental inventory is a core requirement; supplier rentals are optional future scope.
- The owner needs a section where they can ask AI to draft a proposal and then edit it inside the application.
- Staff need to send proposals to clients and see incoming and outgoing client messages inside the application.
- WhatsApp is a requested channel, with Meta for Developers identified by the user as the intended integration direction. Configuration and technical design remain outside this planning task.
- **Structure comes first:** the first milestone is the complete application structure, into which functionality can be added later.
- **The owner reviews and confirms every outgoing client message.** AI prepares drafts; it does not send autonomously.
- **Client responses trigger an owner-review notification.** The owner inspects the response and linked offer, then confirms acceptance in the application. AI does not finalize acceptance automatically.
- Whether equipment-only rentals must be supported separately from event production is explicitly unresolved; the owner does not yet know.

These confirmations override earlier provisional alternatives. The structure-first milestone is confirmed; the scope and order of subsequent functional releases still need review.

## 2. Repository review

The workspace was inspected read-only before creating this document.

| Area | Observed state | Planning implication |
| --- | --- | --- |
| Repository | `/Users/legallycholo/Kit only repo/Kit_audiiovisual_app` | This is the intended project root. |
| Git | Initialized repository on `main`; no commits | There is no existing implementation baseline to extend. |
| Working files | Only `.git` was present before this document | No application files or documentation were available for review. |
| Application sections and navigation | None present | Navigation must be designed from the business workflow. |
| Components and business logic | None present | No reusable implementation can currently be identified. |
| Styling conventions | None present | Visual principles can be planned; specific styling tools remain undecided. |
| Dependencies and services | No manifests or configuration files present | No stack or hosting choice can be inferred. |
| Repository instructions | No applicable `AGENTS.md` found in the repository or checked ancestor directories | No additional local planning requirements were discovered. |

All requested application modules are missing because implementation has not begun. There are no existing code defects or structural conflicts to diagnose. The principal structural risk is creating independent modules without shared definitions for events, layout versions, equipment allocations, and approved proposals.

The brief references an exhibition floor-plan example, but no image or floor-plan file accompanied the supplied text or existed in the repository. The plan supports numbered booths, conference seating, entrances, exits, and common areas based on the description; it does not claim to have inspected that example.

## 3. Decisions, assumptions, and release boundaries

### Top five decisions before development

| Priority | Question | Why it changes the plan | Suggested decision owner |
| --- | --- | --- | --- |
| 1 | Confirmed: one company at launch. Who will use it, how many users/branches are involved, and which staff can see prices, costs, conversations, and client approvals? | Defines launch access without unnecessary SaaS administration. | Business owner |
| 2 | For the confirmed structure-first milestone, which representative screens and visual references should define approval, and which functional module should follow it? | Defines shell completion and the first feature to connect afterward. AI proposals and the inbox are the proposed next functional priority. | Business owner and operations lead |
| 3 | Confirmed: owned equipment rented to customers. Are equipment-only rentals included, and what rate periods, stock tracking, packages, and preparation/return buffers apply? | Defines rental operations, costing, quotation lines, and reservation behavior. | Production and sales leads |
| 4 | With owner approval of every outgoing message and every acceptance confirmed, what evidence should the owner review, and are signatures, deposits, or purchase orders also required? | Completes the review experience and distinguishes accepted scope from permission to begin fulfillment. | Business owner and sales lead |
| 5 | What must 2D/3D achieve at launch: presentation layouts, dimensionally accurate production plans, or specialist design exchange? Which sample files, units, exports, and tablet tasks matter? | Defines editor scope, geometry accuracy, file compatibility, and performance expectations. | Design and production leads |

### Provisional assumptions, not confirmed requirements

- Business records belong to the single company at launch. Multiple-company SaaS operation and a platform-level administrator are deferred unless requested later.
- An event is the primary operational record. A project is an optional grouping for several related events, not a mandatory duplicate record.
- An event can use several rooms and schedule blocks; the initial user interface may present a simple single-room case first.
- The complete application structure precedes functional modules, as confirmed by the owner. After that milestone, AI proposals and the client inbox are the proposed first functional workflow; exact sequencing remains subject to review.
- Full editing initially targets desktop and tablet. Offline operation and phone-specific workflows require a separate decision.
- One shared structured layout supplies geometry to 2D and 3D; independently maintained copies of the same layout are undesirable.
- AI output remains a draft until reviewed. No AI provider, model, or integration has been selected.
- Confirmed policy: the owner confirms every outgoing client message and reviews every proposed acceptance before it becomes accepted in the app, including responses AI considers unambiguous.
- Archived records retain business history. Permanent deletion requires a separate retention policy.

### Scope boundaries

The full product vision includes all modules in this document. **The first delivery milestone is structure only:** the complete navigation, page and tab hierarchy, shared workspace patterns, and clearly identified areas for later functionality. This document plans that milestone; it does not implement it.

After structure approval and explicit authorization to develop, the proposed first functional workflow centers on existing clients, owned rental equipment, an owner-facing AI proposal drafting workspace, in-app editing, owner-confirmed sending, an in-app WhatsApp conversation history, owner-reviewed acceptance notifications, and basic operational handoff. Its exact release boundary remains pending. Advanced spatial editing, richer automation, and generated video follow later.

Payroll, a full accounting ledger, payment processing, ticketing, attendee registration, supplier procurement automation, engineering certification, photorealistic physical simulation, and automatic CAD/BIM interoperability are not assumed launch features. Confirm any that are essential before approving the release boundary.

## 4. Application structure and navigation

### Recommended sidebar

- Dashboard
- Events
  - Event directory
  - Calendar
  - Projects, if multi-event grouping is approved
- Clients
  - Customers and companies
  - Contacts
  - Opportunities
- Venues
  - Venue directory
  - Rooms and saved templates
- Design Studio
  - 2D floor planner
  - 3D event simulator
  - Saved layouts
- AI Creative Studio
  - Concepts and media
  - Brand assets
- Proposals & Quotations
  - Proposals
  - Draft with AI
  - Review queue
  - Templates
- Client Inbox
  - All conversations
  - WhatsApp
  - Needs attention and acceptance review
- Equipment & Inventory
  - Catalog and packages
  - Availability and reservations
  - Maintenance and unavailable stock
- Team & Production
  - Crew schedule
  - Tasks and run of show
  - Preparation, transport, and returns
- Reports, introduced when underlying data is reliable
- Settings

For the structure milestone, include every planned primary destination with representative page organization and clearly labeled future functionality. Do not imply that placeholders are connected services. For operational releases, apply permissions and agreed feature visibility. The AI assistant is a persistent contextual control rather than another disconnected sidebar destination. Event tabs and global module pages will open the same underlying records.

### Shared application frame

- **Left sidebar:** stable primary navigation, collapsible to recover workspace area.
- **Top bar:** current location and breadcrumb, organization/workspace selector when relevant, permission-aware search, quick create, notifications, and account controls.
- **Main workspace:** directory, record detail, editor, calendar, or production view.
- **Right sidebar:** collapsible AI assistant showing its active event, selected records, and attached references.

An event header always identifies the customer, venue, dates, time zone, owner, and current status. Important pending decisions and missing information appear near the relevant action.

### Desktop and tablet behavior

Desktop supports directories alongside detail panels and expanded editor tools. Tablet uses a collapsed navigation drawer, a single primary work surface, and sheets for properties or assistant content. The assistant should not obscure the current selection or an approval action. Dense commercial tables need readable detail views rather than tiny controls. Design gestures need clear pan, select, zoom, undo, and precise numeric entry alternatives.

Plan for keyboard navigation, visible focus, accessible labels, sufficient contrast, non-color status indicators, and touch-friendly targets. Confirm supported screen sizes and input devices during design review.

### Reusable interaction patterns

Use consistent directories with search, filters, saved views, sorting, empty states, and permission-aware bulk actions. Record pages share headers, tabs, related records, attachments, notes, activity, and archive actions. Editors share save state, version history, undo/redo expectations, and explicit publish or approval controls. Notifications link to the specific record or revision that requires attention.

All modules need planned loading, empty, validation, permission-denied, conflict, unavailable-service, and recovery states. Unsaved work, stale versions, invalid dimensions, missing prices, and conflicting reservations must be visible at the point where a user can resolve them.

## 5. Modules and functional requirements

### A. Dashboard

Information hierarchy:

1. Immediate attention: today's production, overdue tasks, approval requests, equipment shortages, and schedule conflicts.
2. Near-term work: upcoming events, active projects, pending proposals, crew assignments, and preparation deadlines.
3. Business context: recent customers, proposal pipeline, equipment utilization, and a permission-limited financial overview.
4. Supporting activity: team updates, notifications, and AI suggestions with links to their source records.

Dashboard content is role-sensitive. A technician sees assigned work; a sales manager sees pipeline and approvals; an administrator sees organization-wide activity. Financial summaries must distinguish estimated, quoted, approved, and actual amounts. Do not label quotes as collected revenue without an approved accounting/payment source.

### B. Event management

An event contains name, type, customer, contacts, venue/rooms, event time zone, schedule, project manager, team, requirements, budget and currency, lifecycle status, internal notes, documents, layouts, scene references, equipment requirements, proposals, and production records.

Recommended event tabs:

| Tab | Contents |
| --- | --- |
| Overview | Summary, owner, status, requirements, next actions, missing information |
| Schedule | Sessions, setup, rehearsals, show time, teardown, transport windows |
| Venue & Design | Rooms, references, layouts, versions, 2D/3D entry points |
| Equipment | Requirements, mapped products, quantities, shortages, reservations |
| Commercial | Budget, quotations, approvals, changes, cost summary; permission restricted |
| Team & Production | Assignments, tasks, run of show, preparation and return checklists |
| Creative Assets | Concepts, branding, selected proposal visuals |
| Messages | Client conversations linked to the event and exact shared proposal versions |
| Documents | Files and exported deliverables with revision references |
| Activity | Status changes, approvals, comments, and audit history |

Candidate lifecycle: inquiry → planning → confirmed → preparation → in production → completed → archived, with cancellation handled separately. Proposal approval, payment, layout publication, and equipment fulfillment have their own states. Confirm transition rules before implementation.

### C. Client management

Provide company/customer profiles, individual contacts, communication history, prior events, opportunities, proposals, internal notes, and documents. A customer may have many contacts, events, opportunities, and proposals. Specify the billing contact, event contact, and approval authority separately.

Prioritize finding existing clients and reusing their contacts and reviewed prior-event information. Support manual communication notes and linked inbox conversations, while keeping internal notes distinct from client-visible messages. An opportunity is optional for repeat business. Converting an opportunity into an event should preserve the original requirements and customer links. A proposal belongs to an event and retains the customer identity and billing details used in that revision; equipment-only rentals may need the broader booking relationship described below.

### D. Venue management

Maintain reusable venues with addresses, contacts, access information, photos, technical restrictions, and rooms. Rooms carry dimensions, units, capacity references, floor-plan references, installed AV infrastructure, entrances/exits, loading information, and reusable layouts.

Store the source and verification status of dimensions and restrictions. Event-specific geometry snapshots preserve the basis of a design when the venue library later changes. Existing installed equipment must be distinguished from company-owned inventory.

Venue pages show rooms, technical information, assets, reusable layouts, and permitted event history. Add multiple rooms to an event without copying the venue record.

### E. 2D floor planner

Workspace structure:

- Top toolbar: event/room, layout name, version, save status, undo/redo, units, view controls, validation, export, and 3D preview.
- Left tools: selection, room/boundary drawing, measurement, annotation, entrances/exits, and object placement.
- Object library: tables, chairs, seating groups, numbered booths, stages, LED walls, speakers, projectors, lights, trusses, decorations, and custom placeholders.
- Main canvas: grid, rulers, snapping, zoom, pan, selection handles, dimension labels, and a scale/reference guide.
- Right properties: dimensions, position, rotation, height/elevation where applicable, equipment mapping, labels, and notes.
- Layer controls: architecture, furniture, staging, audio, lighting, video, rigging, annotations, and reference underlays; visibility and locking.
- Version/history area: named revisions, comparison context, saved checkpoints, and recovery state.

Support uploading a reference, calibrating scale against a known measurement, tracing or drawing editable geometry, and confirming dimensions. An image or PDF is initially an underlay, not automatically an accurate editable model. Automated extraction is a later capability unless explicitly prioritized.

Support drag, resize, rotate, duplicate, group, numeric dimensions, and repeatable object arrangements. Numbered booths, conference seating zones, common areas, entrances, and exits must be representable. Units and measurement precision must remain consistent across views and exports.

Publishing a revision should identify unverified dimensions and unresolved design issues. Egress, rigging, electrical capacity, and accessibility reviews require qualified human signoff where applicable; the planner must not imply certification from visual placement alone.

Export requirements must specify intended formats, paper sizes, scale behavior, legends, revision labels, and visibility rules before editor implementation.

### F. 3D event simulator

Provide the same event, room, and layout revision as the 2D workspace. Include orbit/pan/zoom, saved cameras, object selection, visibility controls, object properties, presentation views, and scene snapshots. Represent venues, stages, LED walls, lighting, speakers, projection, trusses, booths, seating, decoration, and branding.

Switching workflow:

1. Open a structured 2D layout and identify its revision and dimension verification status.
2. Supply required heights, elevations, and object mappings; identify missing information explicitly.
3. Open 3D using the same object identities, units, positions, and supported rotations.
4. Display clear placeholders for unsupported assets rather than silently dropping objects.
5. Inspect, save camera views, and export presentation snapshots tied to the layout revision.
6. Return to 2D with the active room, selected object, and revision retained.

Initial 3D geometry editing is a scope decision. If enabled, edits must update the shared layout model, with clear handling for properties the 2D view cannot show. Do not create separate geometry that silently drifts from the floor plan.

Dimensioned 3D views depict planned geometry. AI-generated promotional images are creative assets and may depart from actual dimensions or equipment. Label and store these separately. Acoustic prediction, structural calculations, photometric accuracy, and certified rigging analysis are not implied by a visual simulator.

### G. AI Creative Studio

Provide an event-aware creative brief, source/reference panel, brand asset library, prompt and revision history, generation controls, results gallery, side-by-side review, editing workspace, and selected-assets collection.

Capabilities may expand from event concepts and image editing to stage/lighting concepts, customer branding, presentation visuals, and eventually video. Each asset records its event, source references, creator, generation/edit history, review status, and sharing status. Generated media is never silently substituted for accurate layout geometry.

Workflow: select event and purpose → attach authorized references/branding → generate draft → review/edit → mark a selected version → attach it to a proposal section. Failure or cancellation should preserve the brief and already completed results. Usage limits, cost visibility, retention, and allowed source material require business decisions before integration.

### H. Proposals and quotations

Use a shared commercial record: a quotation is the priced scope; a proposal combines that scope with narrative and visuals. Avoid independent price copies that diverge.

Editor layout:

- Left panel: document sections and reusable branded templates.
- Center: editable document preview with text, images, floor plans, geometry snapshots, and explicitly labeled concepts.
- Right panel: section properties, customer/event information, line-item controls, and formatting.
- Persistent summary: validation issues, version/status, totals, internal review, client sharing, and export.

Include company logo, customer/billing details, event description, scope, schedule, selected visuals, equipment, labor, transport, additional services, discounts, taxes, totals, terms, exclusions, validity, and revision information. Rate basis, duration, quantity, cost versus sale price, taxable status, rounding, discount order, and currency handling require agreed rules.

Every field and AI draft remains editable by an authorized user before sharing. Quote prices are revision snapshots; changing catalog rates must not rewrite an issued or accepted proposal. Published visual references also remain tied to their selected revisions.

Candidate states: draft → internal review → approved for sharing → issued → accepted / declined / expired / superseded. Material edits after approval require a new reviewable revision. Acceptance binds to a specific version and customer approver. Subsequent scope changes use a revision or change order with visible effects on price, design, schedule, and inventory.

PDF export must reflect the reviewed version and exclude internal notes, margin information, hidden sections, and unshared files. WhatsApp is a requested delivery/conversation channel. A client response creates an owner-review notification; the owner confirms acceptance against the exact proposal revision. A review link may supplement the evidence if later desired, but does not bypass owner review.

**Owner's primary proposal workflow:** open Proposals → Draft with AI → select an existing client and event/booking → describe the requested rental or production → let AI identify missing dates, quantities, venue details, or rate information → generate an editable proposal using authorized catalog prices and explicit assumptions → edit text, quantities, rates, discounts, and terms → validate totals and availability → preview the exact proposal revision and client message → confirm sending under the agreed authority policy → monitor the linked conversation and acceptance status.

AI must not invent inventory, catalog prices, client commitments, or availability. Missing rates and ambiguous requests remain visible for the owner to resolve. The draft should be a normal editable proposal record, not only chat text or a flattened document.

### I. Equipment and inventory

Categories: audio, lighting, video, LED walls, projectors, screens, staging, trusses/rigging, cables, accessories, and other equipment. Records include identification, specifications, stock model, quantities or units, rates, availability, storage location, visual assets, and compatible design representations.

Prioritize company-owned rental stock. Distinguish catalog products, physical serialized assets, pooled stock, packages, and installed venue equipment. Supplier-sourced requirements are optional future scope. Confirm the stock tracking and package conventions used today.

If equipment-only rentals are in scope, support a rental booking without forcing a venue, floor plan, 3D scene, or production crew. It still needs a customer, rental dates, pickup/delivery and return arrangements, quote, availability, reservation, and return condition. Confirm deposits, extensions, late returns, damage charges, and overdue equipment policy. The conceptual choice between a shared booking with event/rental variants and separate linked records remains a Phase 0 decision.

An event equipment requirement can exist without a diagram object. A diagram object can be conceptual and not reserve stock. Several objects can map to a package, while cables, spares, and labor may be required without visible objects. Staff review the resulting equipment list before costing or reservation.

Availability uses preparation, dispatch, event, return, inspection, and maintenance windows as applicable. Differentiate tentative requests/holds from confirmed reservations, and account for holds according to an agreed policy. Detect conflicts again when confirming a reservation. Equipment counts and accepted commercial scope must not silently change during substitutions.

Provide shortages, substitutions, lost/damaged stock, maintenance, partial dispatch/returns, and supplier rental tracking as staged capabilities. Inventory lifecycle is independent of event lifecycle.

### J. Team and production

Provide employee/contractor profiles as required, skills, availability, project managers, technicians, crew assignments, shifts, event schedules, run of show, setup/teardown tasks, preparation lists, transport plans, and status updates.

The production workspace combines an event calendar, crew schedule, task board/list, equipment preparation, dispatch, onsite changes, and closeout. Assignments need time windows, location, responsibility, and conflict visibility. Each task has an owner, deadline, status, dependencies, and completion notes where needed.

Connect approved scope to a production handoff identifying the active layout, equipment list, schedule, contacts, and documents. Confirm how emergency substitutions and onsite changes are authorized. Closeout includes returns, damage/issues, outstanding work, and actual cost capture when in scope.

### K. Persistent AI assistant

The assistant shows current organization, active page/event, selected records, attached documents, and the source revisions used for its answer. Users can inspect/remove context and explicitly select additional permitted records. Navigating away must not silently mix another client's information into the conversation.

Organize conversations by event or general workspace, with a visible title, participants/access scope, and reference history. Conversation permissions must be re-evaluated when users change roles or event assignments. Search and AI retrieval must obey the same access scope as record pages.

Suggested request flows include drafting a conference proposal, recommending stage equipment, building a preliminary AV list for 300 attendees, suggesting seating, guiding design changes, and summarizing pending production tasks. The assistant should ask for missing audience, room, schedule, budget, or technical requirements when these materially affect an answer.

Proposed action flow: request → permitted context review → draft or proposed action → preview of affected records, quantities, costs, and versions → authorized confirmation → execution → visible result and activity entry. Keep read-only answers lightweight. High-impact actions such as issuing a proposal, confirming inventory, or changing an approved design require the applicable human authority. External communication is never implied by asking for a draft.

Stale records, partial failure, duplicate submissions, unsupported actions, and unavailable AI services need explicit outcomes. Treat uploaded and retrieved content as reference data, not authority to override permissions or approval rules. Do not choose models or integrate AI during this planning phase.

### L. Users, roles, and permissions

Use configurable role permissions plus organization, event-assignment, record-state, and explicit-sharing scope. Hiding a button alone is not sufficient enforcement. Separate authority to approve from authority to edit.

Permission legend: **V** view, **C** create, **E** edit, **A** approve/publish in the stated domain, **X** export, **D** archive/delete subject to retention rules. **Own** means assigned records; **Shared** means deliberately published client material. A dash denies access by default. This matrix is a proposed starting policy, not a confirmed business rule.

| Module | Super Administrator | Administrator | Sales Manager | Event Designer | Production Manager | Technician | Client / Guest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | V, aggregate scope | VX | VX commercial scope | V Own | VX Own | V Own | V Shared event summary |
| Events | Delegated organization access | VCEAXD | VCEX | VE Own design fields | VCEAX Own production fields | V Own; assigned updates | V Shared |
| Clients / opportunities | Delegated organization access | VCEXD | VCEX | V Own essential contacts | V Own essential contacts | V Own onsite contacts | V Shared own profile |
| Venues / rooms | Delegated organization access | VCEAXD | VX | VCEX | VCEAX | V Own | V Shared |
| 2D / 3D layouts | Delegated organization access | VCEAXD | VX approved revisions | VCEX | VEAX Own | V Own published revisions | VX Shared |
| Creative assets | Delegated organization access | VCEAXD | VCEX | VCEX | VX Own | V Shared | VX Shared |
| Proposals / prices | Delegated organization access | VCEAXD | VCEX; A only if delegated | V Own nonfinancial scope | V Own scope; costs if granted | — | VX Shared; A own proposal |
| Client inbox | Deferred at launch | VCEAXD, retention limited | VCE Own; send if granted | V Own if granted | VCE Own operations if granted | — by default | Own external conversation only |
| Inventory / reservations | Delegated organization access | VCEAXD | V availability; C requests | V availability; C requirements | VCEAX | VE Own custody/checklists | V Shared equipment scope |
| Team / production | Delegated organization access | VCEAXD | V Own milestones | V Own; E own tasks | VCEAX | VE Own tasks | V Shared milestones |
| AI assistant | Platform policy, no automatic content access | VCE within access scope | VCE within access scope | VCE within access scope | VCE within access scope | VCE Own permitted tasks | Disabled initially |
| Reports | V platform aggregates | VX | VX commercial scope | V Own design scope | VX operations scope | — | — |
| Settings / audit | VCEAD platform administration | VCEX organization administration | V own preferences | V own preferences | V own preferences | V own preferences | V own preferences |

Production approval does not grant commercial approval. Inbox edit permission applies to unsent drafts and internal metadata, not rewriting sent client messages. Model separate permissions to prepare messages, confirm sending, confirm acceptance, export conversations, and manage the channel connection. In the confirmed launch policy, only the owner confirms outgoing messages and acceptance; staff may prepare drafts. No role or AI process gains autonomous sending from this matrix.

For the confirmed single-company release, the owner uses Administrator with the appropriate commercial authority; do not expose a redundant platform administrator. Super Administrator is retained in this plan only to account for the original brief and possible future expansion. If SaaS is later chosen, platform operations and access to tenant business content require a separately governed, auditable support policy.

Client acceptance is not internal approval. The client approval entry in the matrix permits the client to express acceptance of their shared proposal; the owner must review and confirm it before the application finalizes accepted status. Guests may have less access than authenticated client approvers; define recipient identity and delegation rules. Technicians can update assigned execution records without changing event commercial terms. Published records, approval evidence, and audit history are not freely deletable by any role. Detailed archive, restore, permanent-delete, export, and self-approval policies remain to be decided.

### M. Settings

Group settings into company profile/branding, users and roles, event defaults, proposal templates and commercial preferences, equipment categories and rate conventions, notifications, AI policies and usage limits, integration placeholders, and audit/activity history.

Separate personal preferences from organization-wide controls. Track changes to sensitive defaults. Changing a default affects new work unless a user explicitly revises an existing draft; it must not rewrite approved records. Do not configure integrations until their business purpose and data-sharing rules are approved.

### N. Client Inbox and WhatsApp communication

This module is added from the owner's confirmed requirements. It is distinct from internal AI conversations: the assistant helps staff prepare work, while the Client Inbox contains actual external client exchanges.

Workspace structure:

- Conversation list: customer, latest message, assigned staff, unread/needs-reply state, linked proposal, and unresolved acceptance signals.
- Message thread: inbound and outbound messages, attachments, timestamps, sender identity, available delivery status, and clearly separated internal notes.
- Context panel: customer contacts, event/rental booking, exact proposal revision sent, quoted total, and relevant next action.
- Composer: manual message, AI-suggested reply, proposal attachment/review link, editable preview, and send action under the agreed authority policy.
- Attention queue: failed sends, unlinked contacts, unclear acceptance, requested changes, and owner handoff.

Incoming messages should be linked to a verified customer/contact where possible; unknown or ambiguous numbers need staff review. One customer can have several events or proposals, so neither the phone number nor a short reply is enough to identify an offer automatically. A sent proposal message must retain its exact revision reference even if a newer proposal is created later.

Acceptance workflow: receive response → associate with the relevant proposal revision → distinguish a question, requested change, decline, or acceptance signal → notify the owner with status **Awaiting owner review** → owner opens the message and exact offer → owner confirms acceptance, declines to confirm, or requests clarification → record the owner's decision → check remaining deposit, stock, and scheduling gates. Even a clear client acceptance remains pending until the owner confirms it. A message such as “yes” without clear context must not confirm a different or superseded offer. A positive reply is not evidence of payment or equipment availability.

Notifications link directly to the conversation, proposal revision, responding contact, and owner-review action. Show **Confirm acceptance**, **Request clarification**, and **Do not accept** actions with their consequences. Requesting clarification creates an outgoing draft for owner confirmation. Repeated receipt of the same message must not produce duplicate acceptance records, reservations, or notifications. Confirming acceptance does not itself send a client acknowledgment; any acknowledgment also requires owner review.

AI may suggest replies, summarize a conversation, and prepare a revised proposal. **Every outgoing message, whether written by AI or staff, requires the owner's review and confirmation.** If the content, recipient, attachment, or linked proposal revision changes after confirmation, obtain fresh owner confirmation. No automatic replies, unattended negotiation, or automatic acceptance are included. Out-of-hours messages remain visible for review; reminder timing and assignment are still to be decided.

**Integration discovery before implementation:** confirm the company's intended WhatsApp number/account, staff access, current messaging workflow, whether historical conversations can or should be imported, required message/attachment types, consent and communication preferences, and current Meta eligibility, message rules, pricing, and supported delivery events. Verify these against current official documentation during the separately authorized technical phase. This document does not assert that any existing account, number, history import, or automated messaging capability is already available.

No Meta account, API, webhook, AI integration, message sending, or client communication is configured or performed during this planning task.

## 6. Conceptual information architecture

This section describes business concepts and relationships, not physical tables or storage design.

| Entity | Information owned | Key relationships |
| --- | --- | --- |
| Organization | Business identity, branding, operating policies | Owns business records; contains memberships |
| User | Person/account identity, personal preferences | Participates through organization memberships |
| Membership and role | Organization participation, permissions, access scope | Connects user, organization, roles, and assignments |
| Customer and contact | Company/person details, billing/approval contacts | Customer has contacts, opportunities, events, proposals |
| Opportunity | Inquiry, requirements, expected value, sales stage | Belongs to customer; may convert to event |
| Venue | Location, contacts, shared restrictions | Contains rooms; reused by many events |
| Venue room | Dimensions, units, infrastructure, references | Belongs to venue; used by schedules and layouts |
| Project | Optional umbrella scope and owner | Groups related events if needed |
| Event | Operational identity, requirements, customer, dates, budget, status | Links rooms, team, layouts, proposals, requirements, and tasks |
| Schedule block | Session or operational interval, time zone, location | Belongs to event; informs crew/equipment windows |
| Floor-plan reference | Original file, source, scale calibration, verified dimensions | Referenced by a room or event layout |
| Layout | Named design belonging to an event/room or reusable template | Has layout versions |
| Layout version | Structured geometry, object identities, dimensions, annotations, revision status | References venue snapshot, objects, mappings, and validation state |
| Layout object | Position, orientation, dimensions, label, semantic type | Belongs to layout version; may map to equipment |
| 3D scene/view | Scene presentation settings, asset mappings, cameras, snapshots | References a specific layout version; does not own a competing geometry copy |
| Equipment catalog item | Product specifications, rate references, visuals, category | Maps to stock, packages, layout objects, requirements, and quote lines |
| Stock unit/pool and package | Physical identity or counted stock; package composition | Supplies reservations and fulfillment |
| Equipment requirement | Needed product/function, quantity, timing, source | Belongs to event; may originate from layout or manual planning |
| Equipment reservation | Allocation, quantity/units, occupied interval, hold/confirmation state | Connects event requirements to stock or supplier commitments |
| Proposal | Commercial document identity, customer/event linkage | Has proposal versions and review history |
| Proposal version and line item | Frozen commercial content, prices, terms, visual references | Tied to selected event/design information and approval decisions |
| Approval and change request | Actor, authority, decision, time, exact revision, requested change | References proposal, design, or production decision |
| Creative asset | Media, references, provenance, versions, review/share status | Links event, brand assets, conversations, and proposal sections |
| AI conversation | Scope, messages, context references, proposed actions | Belongs to workspace/event; restricted to permitted participants |
| Client conversation | Channel, customer/contact, assigned staff, event/booking links, attention state | Contains external messages; separate from internal AI chat |
| Client message | Direction, sender, content/attachments, channel reference, timestamp, delivery state | Belongs to conversation; may reference an exact proposal version |
| Acceptance evidence | Responding contact, source message/review action, proposal revision, review decision | Supports an approval; ambiguous replies remain unconfirmed |
| Rental booking, if approved | Equipment-only scope, dates, pickup/delivery, return conditions | Links customer, quotation, reservations, and custody without mandatory venue/design |
| Crew assignment | Person, role, location, shift, availability state | Connects event/schedule to user or approved external crew record |
| Production task | Owner, deadline, dependencies, state, completion evidence | Belongs to event and optionally an assignment or fulfillment step |
| Document/attachment | File identity, owner, version, visibility, source | Linked to records without implying universal access |
| Activity/audit entry | Actor, action, target, timestamp, revision references | Records business changes and decisions; protected from casual edits |

### Relationship and ownership rules

- Organization → customers, venues, events, catalogs, templates, and organization-scoped roles.
- Customer → opportunities → events → proposal versions and production work.
- Venue → rooms → event room usage → layout versions → 3D views and exported snapshots.
- Layout objects → reviewed equipment requirements → quotation lines and inventory reservations.
- Event → crew assignments, schedules, tasks, documents, conversations, and creative assets.
- Proposal version → selected visuals, priced lines, internal approval, and client acceptance evidence.
- Customer/contact → client conversation → messages → exact shared proposal version → acceptance evidence and staff notification.

The customer record is the current relationship record; a proposal version preserves the identity and terms used when issued. The venue library is reusable reference data; an event design preserves its reviewed geometry. The catalog is current product/rate information; accepted quote lines preserve agreed values. A reservation is the operational allocation record; a layout object alone is not a reservation.

Keep reusable templates separate from event instances. Copying an event must create new working records and must not copy client acceptance, reservations, historical activity, or external sharing automatically. Referenced business records should normally be archived rather than removed.

### State and consistency rules to validate

- Approval always identifies the exact version; a later edit cannot silently inherit prior acceptance.
- Design changes flag dependent equipment lists and visual exports as needing review.
- Accepted scope changes flag reservations and production handoff documents for reconciliation.
- Reservation confirmation rechecks current availability; simultaneous edits must not silently overallocate stock.
- Editing an old revision must produce an explicit conflict or new draft, not overwrite another person's work unnoticed.
- Cancellation releases or resolves holds and assignments according to policy and retains commercial history.
- Event dates use an explicit event time zone; date changes trigger resource and crew conflict review.

## 7. Connected business workflows

### Workflow 1 — Customer to proposal

Find/create customer → identify event and billing contacts → record opportunity/brief → create event → choose venue and rooms → confirm schedule and requirements → create or reuse layout → review equipment and pricing → assemble proposal → internal review → issue a fixed revision → record client response.

Missing steps addressed: duplicate customer checking, venue verification, pricing review, internal approval, client authority, expiration, and rejection/revision handling. Layout completion should not block an early budget estimate; label incomplete design assumptions.

### Workflow 2 — Uploaded plan to 3D

Select venue/room → upload reference → establish units and known scale → mark unverified areas → trace or draw editable boundaries/objects → confirm dimensions → add heights and equipment representations → save revision → inspect 3D → correct shared layout → publish reviewed revision and snapshots.

Dependencies: supported input formats, readable source measurements, coordinate conventions, object library, and explicit unsupported-object behavior. A flat uploaded image is not a ready-made 3D scene. Manual correction is a required fallback.

### Workflow 3 — Equipment to quotation

Capture functional AV requirements → select stock/package/supplier options → associate relevant layout objects → add nonvisual items and spares → check timing and availability → estimate equipment, labor, transport, services, discounts, and taxes → review scope and margin as permitted → generate quotation revision.

Quoted equipment is not automatically reserved. A shortage can lead to an approved substitute, supplier rental, revised schedule, or disclosed availability condition. Confirm the hold policy and quote validity window.

### Workflow 4 — Creative concept to proposal

Define event creative brief → attach brand assets and source references → generate draft → review visual suitability and branding → edit/select version → label conceptual material → insert into proposal → review the rendered proposal before sharing.

Dependencies: authorized source material, usage budget, human review, asset provenance, and the selected proposal revision. Creative output cannot silently change the operational layout or promised equipment.

### Workflow 5 — Approved scope to production

Record client acceptance of exact scope → satisfy required deposit/PO/contract gates if applicable → confirm event → reconcile layout, quotation, equipment, and schedule → confirm reservations → assign available crew → publish production pack → prepare and dispatch → execute run of show → authorize/log changes → teardown → return/inspect stock → reconcile costs/issues → close event.

Dependencies: inventory and crew availability are rechecked at confirmation. Approval alone does not guarantee stock. Conflicting dates or quantities must be resolved before a production pack is treated as ready.

### Cross-cutting exception workflows

- **Post-approval change:** capture request → assess price/resource/design effects → approve new scope → update operational allocations → republish handoff.
- **Cancellation/postponement:** record reason and authority → resolve commercial obligations → release or reschedule resources → notify responsible staff through an approved channel → preserve history.
- **Damage/short return:** record affected units/quantities → make stock unavailable → resolve replacement/repair responsibility → reconcile event charges if applicable.
- **Design or pricing revision conflict:** identify newer revision → compare changes → reconcile explicitly → request renewed approval when needed.

### Workflow 6 — Owner-directed AI proposal and WhatsApp response

Find existing client → ask AI for a proposal draft → resolve missing equipment/rates/dates → edit the draft in the app → owner reviews and confirms the outgoing message and proposal → send through the approved channel → show sent/incoming messages in the Client Inbox → identify the client's response and exact revision → notify owner for review → owner confirms acceptance → confirm availability and other booking gates → hand off to event production, or rental fulfillment if that scope is approved.

Acceptance of an older revision, multiple offers in one conversation, a changed customer phone number, unclear replies, failed sends, and duplicate incoming messages are required review scenarios. If equipment-only rentals are approved, this workflow must complete without requiring floor-plan or venue data.

## 8. Nonfunctional and cross-cutting requirements

These are requirements to refine before selecting implementation tools.

| Area | Planned expectation | Decision/evidence needed |
| --- | --- | --- |
| Access and isolation | Organization, assignment, and sharing boundaries apply to records, files, search, exports, and AI context | Approved access scenarios and tenant model |
| Collaboration | Clear revision conflicts and ownership; no silent lost changes | Whether real-time coediting is needed at launch |
| Recovery | Recover drafts and retain approved business history | Acceptable data-loss and restoration targets |
| Performance | Usable directories, editor interaction, scene navigation, and export | Typical/worst-case events, objects, files, users, devices, and measurable targets |
| Reliability | AI or export failure does not lose core event data; partial actions are visible | Failure/retry expectations and operational support model |
| Audit | Approval, sharing, permission changes, reservations, and significant edits have attributable history | Retention, export, and authorized audit readership |
| Privacy | Client sharing exposes selected materials only; AI context respects record access | Retention, data-location, and approved AI usage policies |
| Accessibility | Keyboard and touch workflows; readable states and alternatives to color-only meaning | Acceptance tasks and supported devices |
| Localization | Explicit units, event time zones, currency, date formats, and languages | Launch markets, languages, tax rules, and rounding examples |
| Data onboarding | Identify import sources, duplicates, mandatory fields, and validation | Representative customer, equipment, price, and venue files |
| Portability | Export approved documents and business data with permission checks | Required file formats and handoff destinations |

## 9. Conceptual future folder organization

The repository is empty, so there is no existing framework layout to preserve. The following are responsibility boundaries, not directories to create now or a framework recommendation. Translate them into the chosen stack's conventions only after product approval.

| Proposed area | Responsibility |
| --- | --- |
| `docs/` | Product plan, decision records, workflow specifications, later acceptance evidence |
| `application/shell/` | Navigation, workspace context, page framing, global search entry points |
| `application/modules/dashboard/` | Role-relevant overview |
| `application/modules/events/` | Events, schedules, project grouping, connected event workspace |
| `application/modules/clients/` | Customers, contacts, opportunities |
| `application/modules/venues/` | Reusable venue and room library |
| `application/modules/design/` | Shared layout concepts and separate 2D/3D workspaces |
| `application/modules/creative/` | Creative briefs, assets, reviews |
| `application/modules/proposals/` | Commercial drafts, templates, versions, approval presentation |
| `application/modules/messaging/` | Client inbox, external messages, send/review authority, acceptance evidence |
| `application/modules/inventory/` | Catalog, availability, allocations, stock lifecycle |
| `application/modules/production/` | Crew, tasks, run of show, fulfillment |
| `application/modules/assistant/` | Conversations, context visibility, proposed action presentation |
| `application/modules/settings/` | Organization settings and administrative experiences |
| `application/modules/reports/` | Permission-scoped reporting when definitions stabilize |
| `shared/experience/` | Reusable record views, selectors, status displays, forms, editor patterns |
| `shared/business/` | Shared money, time, units, lifecycle, ownership, and revision concepts |
| `shared/access/` | Common permission and sharing rules |
| `shared/documents/` | Attachment, media reference, and export responsibilities |
| `integrations/` | Future boundaries for approved external capabilities; no provider selected |
| `verification/` | Later cross-module acceptance scenarios and representative fixtures |

Keep commercial calculations and access rules consistent across modules. Separate shared spatial data from rendering views, and keep AI suggestions from becoming an alternative source of business truth. Do not physically scaffold this structure during planning.

## 10. Recommended implementation roadmap

### Why adjust the brief's sequence

The owner's structure-first direction is the controlling sequence: first plan and review the entire application structure, then build the approved shell only after authorization, then connect functional modules incrementally. The nine development phases below retain a distinct structure-only Phase 1. Later phases bring basic equipment, quotations, and production forward because a 2D editor needs equipment identities, proposals need commercial rules, and automation needs a validated workflow.

The original proposal phase is split into a basic commercial workflow in Phase 3 and an advanced visual builder in Phase 7. The original inventory/production phase is split across catalog foundations in Phase 2, basic execution in Phase 3, and advanced fulfillment in Phase 8. The AI foundation remains early in Phase 3 but follows core permissions and record definitions.

The phases below are future development work, not instructions to begin now. No duration or staffing estimate is asserted without scope, representative data, and team constraints.

### Phase 0 — Business validation and implementation readiness

- **Objective:** resolve the decisions that shape the product before choosing technology.
- **Scope:** top-five decisions, first-release boundary, commercial examples, permission review, rental-only scope, WhatsApp sending/acceptance policy, representative venue/equipment files, measurable quality targets, and planning approval.
- **Prerequisites:** business owner, sales, design, and production participation; current-process examples.
- **Deliverables:** approved product boundary, decision register, prioritized acceptance scenarios, and input samples; a later technical selection brief if authorized.
- **Acceptance criteria:** single-company scope, structure milestone, module map, owner message/acceptance controls, and shell review criteria are confirmed. Detailed rates, rental-only support, and editor accuracy may be recorded as deferred decisions that block their dependent modules, not the navigation plan.
- **Risks:** attempting the whole vision at once; unavailable sample data; conflicting stakeholder expectations.
- **Completion:** the user explicitly approves the plan and authorizes the next work. Approval of this document alone must not be inferred from silence.

### Phase 1 — Application shell and navigation

- **Objective:** deliver the complete application structure as the first milestone, ready for functionality to be connected later.
- **Scope:** every planned primary destination, workspace frame, dashboard hierarchy, event tabs, client and venue record layouts, 2D/3D workspace regions, creative library, editable-proposal screen structure, inbox/thread and owner-review notification structure, inventory/production pages, settings, assistant container, and reusable empty/error states. This phase does not require working AI, messaging, authentication, databases, commercial calculations, or editors.
- **Prerequisites:** approved Phase 0 scope and, before coding, a separately approved technical direction.
- **Deliverables:** reviewable complete shell, page inventory, shared interaction patterns, desktop/tablet layouts, and a map of which later module supplies each functional area. Representative content is explicitly marked as illustrative.
- **Acceptance criteria:** the owner can navigate all proposed modules and inspect their page/tab organization, including Draft with AI, Client Inbox, and acceptance review; event context is visible where relevant; tablet navigation and keyboard use are workable; future functions are clearly identified; the structure can be reviewed without real customer data or connected services.
- **Risks:** dashboard polish displacing workflow validation; crowded editors; placeholder actions appearing functional.
- **Completion:** the owner approves the complete structure on agreed devices. Functional modules remain separate later milestones, and structure approval is not permission to send messages or configure services.

### Phase 2 — Access, core records, and equipment identities

- **Objective:** establish trustworthy shared business records.
- **Scope:** users/memberships/roles, customers/contacts/opportunities, venues/rooms, events/schedules, documents/activity, basic equipment catalog and stock identity, units, currency, and lifecycle rules.
- **Prerequisites:** organization/access decisions, shell, representative business records, and approved conceptual relationships.
- **Deliverables:** connected record management, scoped access, record linking, archival behavior, and validated initial catalog.
- **Acceptance criteria:** an authorized user creates customer → event → venue/room → equipment requirement without duplicate records; a restricted user cannot retrieve hidden records or files; archived records retain references; event times and quantities remain consistent.
- **Risks:** organization leakage, ambiguous event/project split, poor imported data, overcomplicated catalog modeling.
- **Completion:** core workflow and access scenarios pass review with representative records; data ownership and revision foundations are stable enough for dependent modules.

### Phase 3 — First operational workflow and AI assistant foundation

- **Objective:** support a useful event-to-quotation-to-production pilot.
- **Scope:** owner-facing AI proposal drafting, editable quotations, pricing rules, versioned internal/client approval, basic availability/reservations, crew/tasks, handoff/return checklist, and a Client Inbox with requested WhatsApp sending/receiving and acceptance notifications. Establish permitted assistant retrieval and draft behavior before enabling outbound actions.
- **Prerequisites:** Phase 2, approved commercial examples, hold/confirmation policy, crew assignment rules, AI usage policy, detailed owner-confirmation interaction design, plus verified channel feasibility after separately authorized technical discovery.
- **Deliverables:** editable AI-to-proposal workflow, proposal export/review, linked inbound/outbound client conversations, acceptance evidence and notifications, confirmed allocations, production handoff, and assistant context/action previews. Integration occurs only after separate technical decisions.
- **Acceptance criteria:** the owner generates and edits a proposal using existing customer and stock records, confirms each outgoing message, sees the client's reply inside the app, and receives a correctly linked review notification. The proposal remains pending until the owner confirms acceptance. Ambiguous replies, stale offer versions, duplicate messages, and failed sends do not silently confirm a booking. A pilot event reaches accepted quotation, resource confirmation, assigned crew, execution, and closeout; pricing matches approved examples; accepted versions cannot change silently; reservations are checked for conflicts; AI cannot access hidden records or send without owner confirmation.
- **Risks:** oversizing the first release, tax/rate ambiguities, accepting scope without availability, premature AI automation, channel onboarding delays, and incorrect interpretation of client replies.
- **Completion:** the owner, sales, and production complete the agreed pilot, including the requested messaging and acceptance workflow, with traceable approvals and no unresolved critical access, pricing, communication, or allocation defects. A draft-only prototype is an intermediate milestone, not completion of the requested messaging capability.

Suggested Phase 3 checkpoints: (A) correct editable proposal drafting; (B) authorized outbound sending and an inbound/outbound inbox; (C) version-specific acceptance and notifications; (D) confirmed operational handoff. These checkpoints make the phase reviewable without pretending that AI drafting alone meets the owner's full request.

### Phase 4 — Structured 2D floor-plan editor

- **Objective:** produce reusable, dimensioned event layouts.
- **Scope:** reference upload/calibration, room geometry, object placement/manipulation, layers, labels, dimensions, versioning, equipment mapping, and agreed exports.
- **Prerequisites:** venues/rooms, units and coordinates, catalog identities, verified example plans, editor scope, and maximum layout-size targets.
- **Deliverables:** reviewed layout workflow and reusable templates; structured layout revisions ready for 3D use.
- **Acceptance criteria:** a user recreates a representative exhibition with numbered booths, conference seating, exits, and common areas; verifies scale; saves/reopens a revision; exports the agreed output; reconciles equipment mappings without automatic unintended reservations.
- **Risks:** poor source plans, unverified measurements, complex selection/undo behavior, oversized layouts, scope creep into specialist CAD.
- **Completion:** representative plans meet agreed dimensional, recovery, tablet, and performance criteria; design/production reviewers accept the workflow.

### Phase 5 — Connected 3D event simulator

- **Objective:** inspect the shared layout in 3D and produce presentation snapshots.
- **Scope:** geometry projection, model/placeholder mapping, height/elevation properties, scene navigation, saved cameras, branding surfaces, and revision-linked exports.
- **Prerequisites:** stable 2D object identities/coordinates, geometry rules, asset approach, agreed device/object budgets, and a decision on 3D editing.
- **Deliverables:** connected 2D/3D workspace and snapshot workflow.
- **Acceptance criteria:** supported objects retain position, size, orientation, and identity across views; missing assets are explicit; switching views preserves context; exports identify their source revision; visual concepts remain separate from dimensioned scenes.
- **Risks:** geometry drift, poor performance, incomplete assets, unrealistic expectations of simulation accuracy.
- **Completion:** representative event scenes pass cross-view consistency and usability review within agreed performance limits.

### Phase 6 — AI Creative Studio

- **Objective:** create reviewable event concepts and branded visual assets.
- **Scope:** briefs, reference/brand inputs, image generation/editing, versioned gallery, review and selection, event/proposal association; video is a separately gated expansion.
- **Prerequisites:** assistant access controls, asset permissions, event links, approved usage/cost policy, and chosen capabilities after technical review.
- **Deliverables:** creative workflow with provenance, review states, usage visibility, and failure recovery.
- **Acceptance criteria:** users generate/edit/select an event asset, track references and revisions, and attach a selected asset to a draft proposal; generated concepts are labeled; failed jobs preserve the brief; limits are visible.
- **Risks:** uncontrolled usage cost, inaccurate branding, unsuitable source rights, clients mistaking concepts for deliverable geometry.
- **Completion:** approved representative creative tasks succeed with review and cost controls; video remains deferred unless explicitly accepted into scope.

### Phase 7 — Advanced visual proposal builder

- **Objective:** combine commercial accuracy with premium branded presentation.
- **Scope:** visual section editing, reusable templates, layout/3D/creative media selection, AI-assisted narratives, richer revision comparison, client review experience, and polished PDF output.
- **Prerequisites:** Phase 3 commercial/version logic; Phases 4–6 for their respective media types. Basic proposal improvements need not wait for every media capability.
- **Deliverables:** integrated visual editor, branded templates, reviewable exports, and revision-aware client presentation.
- **Acceptance criteria:** a proposal combines selected media and reviewed prices; all draft content remains editable; exports match the approved revision and exclude internal material; edits after acceptance create a new approval path; catalog changes do not rewrite issued prices.
- **Risks:** attractive output hiding inconsistent totals, template fragility, stale imagery, accidental disclosure.
- **Completion:** sales and finance approve representative proposals and exports, including multi-page, revised, discounted, and missing-media cases.

### Phase 8 — Advanced inventory and production management

- **Objective:** extend the pilot workflow to complex operational fulfillment.
- **Scope:** richer pooled/serialized stock handling as needed, packages, supplier rentals, maintenance, substitutions, prep/dispatch/partial returns, transport, crew conflicts, run of show, onsite changes, and actual costs.
- **Prerequisites:** proven Phase 3 allocations/production, confirmed operational exceptions, and representative stock and crew data.
- **Deliverables:** detailed fulfillment workspace, resource conflict resolution, reconciliation, and production reporting inputs.
- **Acceptance criteria:** overlapping events, buffered reservation windows, damaged stock, substitute items, partial returns, and crew conflicts follow agreed policies; affected scope changes are visible; final stock and event records reconcile.
- **Risks:** inaccurate stock counts, ambiguous custody, supplier uncertainty, real-world workflows bypassing the system.
- **Completion:** production staff validate representative concurrent events and exception cases from preparation through return and closeout.

### Phase 9 — Advanced automation and reporting

- **Objective:** automate proven workflows and report on reliable business data.
- **Scope:** permission-scoped pipeline, profitability, utilization, workload, and event-performance reporting; approved reminders/actions; selected integrations; advanced AI suggestions.
- **Prerequisites:** stable lifecycle definitions, trustworthy event/cost/stock data, approved automation authority, and explicit integration needs.
- **Deliverables:** documented metrics, dashboards/reports, observable automation, and approved integration workflows.
- **Acceptance criteria:** reported values reconcile with source records; estimated versus actual figures are distinct; restricted data stays restricted; repeated triggers do not duplicate business actions; failures and human overrides are visible.
- **Risks:** misleading metrics, unattended incorrect actions, integration side effects, unreliable source data.
- **Completion:** metric owners sign off on calculations and automation owners demonstrate controlled execution, failure handling, and auditability.

### Dependency summary and completion gate

Core records and permissions precede commercial workflows and AI context. Equipment identities precede design-to-equipment mapping. Structured 2D precedes geometry-based 3D. Versioned commercial rules precede the visual proposal builder. Stable operational data precedes reporting and automation.

Each development phase finishes with evidence appropriate to its scope, documented limitations, and a usable handoff. Phase 1 completes through approval of the full structure and navigation; later functional phases also require relevant business, permission, and error-path checks. Functional phases are not complete solely because their screens exist. Launch scope and production rollout require explicit agreement at the appropriate later stage.

## 11. Important missing features and architectural risks

### Additions to the original brief

- Opportunities and conversion history before event creation.
- Multi-room, multi-day, setup/return time windows, and explicit event time zones.
- Approval authority, quote expiration, change orders, cancellation, and postponement.
- Tentative holds versus reservations; supplier rental options; stock maintenance and return reconciliation.
- Crew availability, contractor participation, skills, and overlapping assignments.
- Client-sharing boundaries, internal versus external notes, and version-specific acceptance evidence.
- Template reuse, safe event duplication, initial data import, and archival/retention policy.
- Autosave/recovery expectations, concurrent-edit conflicts, and unsupported design asset behavior.
- Commercial distinctions between estimated cost, sale price, accepted value, actual cost, invoiced value, and payment received.
- Definition of operational safety review responsibilities for venue restrictions, rigging, power, access, and egress.

### Principal architectural risks

| Risk | Consequence | Planned mitigation |
| --- | --- | --- |
| Disconnected module records | Different prices, quantities, dates, or client details across views | Shared ownership rules and version references |
| Independent 2D/3D geometry | Visual plans disagree with production dimensions | Shared structured layout; explicit derived views |
| Full product attempted before a pilot | Long development with no validated operational value | Approve a narrow complete workflow first |
| Mutable approved proposals | Disputes over scope and pricing | Immutable issued/accepted revisions and traceable changes |
| Naive availability counts | Double booking or unavailable gear at dispatch | Time-window allocations and confirmation-time conflict checks |
| Unreviewed AI actions or context | Incorrect scope, disclosure, or unauthorized changes | Permission-aware context, previews, human authority, activity history |
| Unverified imported geometry | Misleading drawings and scenes | Calibration, source provenance, verification state, manual correction |
| Weak organization/client boundaries | Exposure of another company's or client's information | Explicit tenant, assignment, and sharing rules across every access path |
| Expensive media and large scenes | Unpredictable cost and unusable workspaces | Agreed usage limits, object/device targets, staged media capabilities |
| Unclear financial definitions | Misleading dashboards and proposals | Approved rate, tax, rounding, and reporting examples before implementation |
| Ambiguous or mislinked WhatsApp acceptance | Wrong offer or superseded revision treated as accepted | Exact revision links, explicit acceptance policy, and review for uncertainty |
| Uncontrolled outgoing AI messages | Unapproved prices, commitments, or duplicate messages | Separate sending authority, editable previews, staff takeover, and duplicate handling |

## 12. Questions for business review

The top five decisions in Section 3 are the first review priorities. The following questions refine the plan without forcing premature tool choices.

### Business and release

1. Who owns the product, who approves scope, and who represents sales, design, production, and finance?
2. Which event types are most common, and which single real event should the first pilot reproduce?
3. How many staff, clients, concurrent events, rooms per event, and inventory items should the initial release support?
4. Is there a target launch date, team capacity, or budget constraint that should shape the first release?
5. Which current spreadsheets or tools must be migrated, and which should remain authoritative?

### Commercial workflow

6. Are quotations priced per event, day, hour, usage period, package, or a combination? How are labor overtime, discounts, taxes, deposits, and rounding handled?
7. Who can see cost and margin, approve discounts, approve a proposal internally, and authorize post-approval changes?
8. With owner-reviewed acceptance confirmed, what information must appear in the review notification? Are signatures or purchase orders also needed?
9. Is invoicing/payment collection inside launch scope, or does accepted scope hand off to an accounting process?

### Design and venues

10. What source floor-plan formats and sample files are used today, and who verifies their measurements?
11. Are metric units, imperial units, or both required? What dimensional tolerance is acceptable?
12. Must 3D support editing, realistic lighting/acoustics, walkthroughs, or only spatial preview and presentation snapshots?
13. Which export formats and printed sheet sizes do clients, venues, and crews require?
14. Which parts of venue restrictions, power planning, rigging, and egress need documented specialist review?

### Inventory and operations

15. For the confirmed owned stock, are items serialized, pooled, or packaged? Are equipment-only rentals, multiple warehouses, or company branches involved?
16. When should a quote hold stock, how long should holds last, and how much preparation/return time blocks availability?
17. How are substitutes, shortages, damaged items, supplier rentals, and partial returns approved and recorded?
18. Do crews include contractors, and are skills, shifts, overtime, travel time, or offline access essential at launch?

### AI, access, and quality

19. Which AI tasks would save the most time first: summaries, equipment suggestions, proposal drafting, layout assistance, or creative images?
20. What client information may AI use, what media usage budget is acceptable, and who approves externally shared output?
21. Which languages, tablets, browsers, keyboard/touch workflows, and accessibility needs must be supported?
22. What retention, restoration, audit, and organization/client access expectations must become measurable acceptance requirements?
23. With owner confirmation required for every outgoing message, should staff prepare drafts for the owner's queue, or should only the owner use the composer initially?
24. Which WhatsApp number is used today, who manages it, and should existing conversations appear in the app if technically supported?
25. Where should the owner's acceptance notifications appear—in the app only or through an additional approved channel—and should reminders flag pending reviews?

## 13. Planning handoff

Review the complete page/navigation structure and the remaining top-five decisions. Confirm the structure milestone's review criteria, then refine the first functional workflow and permission details using representative business examples. Equipment-only rentals remain explicitly open. Revise this document into an approved baseline before technology evaluation or development is authorized.

Only this planning document was created for this task. No application functionality, dependencies, database configuration, authentication, APIs, infrastructure, integrations, commits, or pushes are part of the deliverable.
