# KIT PROPOSAL WORKSPACE

Upgrade the existing KIT proposal functionality into a first-class, document-driven proposal workspace.

Do NOT create a second proposal system.

Extend and simplify the existing implementation located primarily in:

- `src/modules/proposals/`
- `src/modules/ProposalAI.tsx`
- `src/shared/types.ts`
- `src/shared/proposal-visuals.ts`
- related proposal API/server code

The existing application already has:

- proposal records
- proposal versions
- proposal statuses
- equipment line items
- pricing
- discounts
- taxes
- AI proposal drafting
- proposal visuals
- event relationships
- client relationships
- review/send workflow

Preserve these capabilities while significantly improving the user experience.

---

# 1. PRODUCT GOAL

The Proposal workspace should feel like a combination of:

- a beautifully designed proposal document
- a simple document editor
- KIT AI

A user should be able to:

1. Open Proposals.
2. Click "Nueva propuesta".
3. Immediately see a professionally designed KIT proposal.
4. Start typing directly into it.
5. Optionally ask KIT AI to generate or modify the proposal.
6. Review pricing.
7. Export it as PDF.
8. Send it through KIT's approved messaging workflow.

The user must NOT need to understand document sections, database schemas, templates, or AI configuration to create a proposal.

---

# 2. REFERENCE IMAGE

Use the image supplied by the product owner as **Image 1 — Classic Proposal Reference**.

The image shows an existing KIT AUDIOVISUAL invoice/quotation layout containing:

- KIT AUDIOVISUAL branding
- slogan
- company contact information
- document title in the top-right
- date and document number
- "Para" / client information
- salesperson
- job
- payment terms
- completion date
- equipment/services table
- quantity
- description
- unit price
- line total
- subtotal
- discount
- total
- footer statement

Do NOT simply reproduce the screenshot pixel-for-pixel.

Use it as the structural reference for a significantly improved, modern, professional proposal template.

Name the new template:

`KIT Classic`

The template should feel recognizable to someone familiar with the original document while being much more polished.

---

# 3. DEFAULT PROPOSAL TEMPLATE

When a user creates a proposal, immediately show the KIT Classic document.

Do not require the user to select a template first.

The default proposal should contain editable placeholders such as:

```text
KIT AUDIOVISUAL
La gente de los eventos

PROPUESTA

Fecha:
Propuesta #:

PARA
Cliente
Contacto
Teléfono
Email

VENDEDOR
TRABAJO
TÉRMINOS DE PAGO
FECHA DEL EVENTO / FINALIZACIÓN

EQUIPOS Y SERVICIOS

Cantidad
Descripción
Precio por unidad
Total

Subtotal
Descuento
Impuestos
TOTAL

Notas / alcance

Términos y condiciones
```

Use KIT's actual logo/wordmark and slogan.

Do not duplicate branding as static bitmap text when the application already has reusable KIT branding components.

---

# 4. DOCUMENT-FIRST EDITING

The user should edit the proposal itself.

Avoid presenting the proposal primarily as a conventional form with dozens of fields.

For example:

Instead of:

```text
Proposal title:
[________________]

Introduction:
[________________]
```

the proposal visually displays:

```text
PROPUESTA

Corporate audiovisual production for Annual Summit
```

and clicking the title allows the user to edit it in place.

Use controlled React fields styled as document content.

Do NOT rely heavily on `contenteditable`.

Use normal controlled inputs/textareas styled so they visually disappear into the document.

Benefits:

- predictable state
- accessibility
- validation
- easier testing
- reliable PDF output

---

# 5. PROPOSAL SCREEN LAYOUT

Desktop layout:

### Main area
The actual proposal document.

### Right side
Collapsible KIT AI assistant.

The proposal should occupy most of the screen.

The current multi-section editor should be reviewed critically.

The existing section navigation:

- Introduction
- Equipment & services
- Visuals
- Terms & details

may be useful internally, but it currently makes the proposal feel more like a software form than a document.

Prefer a continuous document where the user can scroll naturally.

Sections can still exist internally.

Possible structure:

```text
[Proposal Document]                 [KIT AI]

Header
Client
Event
Scope
Equipment / Services
Visuals
Pricing
Terms
Footer
```

The right AI panel can be collapsed completely.

---

# 6. SIMPLE PROPOSAL CREATION

Change the current proposal creation experience.

Instead of requiring multiple decisions before seeing the proposal, use:

**Nueva propuesta**

Then immediately create/open a draft.

If an event is already known:

pre-populate:

- client
- event
- dates
- venue
- attendees
- relevant notes

If the user starts from Proposals without an event:

show a small optional selector:

`Vincular evento`

but do not block creation.

The user must be able to begin typing immediately.

---

# 7. KIT AI FOR PROPOSALS

KIT AI should work similarly to the normal KIT assistant.

Avoid creating an entirely different AI UX.

Reuse the same visual language and eventual KIT AI icon.

The proposal AI panel should have a simple composer:

```text
¿Qué quieres preparar?

[ Describe la propuesta...                         ]

                                           [ ↑ ]
```

Example prompts:

- "Create a proposal for a projection event."
- "Add two technicians and delivery."
- "Rewrite this proposal to sound more premium."
- "Reduce the introduction to two paragraphs."
- "Add our normal payment terms."
- "Add the equipment required for a 300-person conference."
- "Change the discount to 10%."
- "Make this easier for the client to understand."
- "Summarize what is included."
- "What information is still missing?"

---

# 8. AI MUST GENERATE STRUCTURED DATA

CRITICAL:

Do NOT let the AI generate arbitrary executable HTML.

The AI should generate structured data validated on the server.

Example conceptual response:

```ts
{
  title,
  introduction,
  scope,
  lines: [
    {
      equipmentId?,
      description,
      quantity,
      rate,
      days
    }
  ],
  terms,
  discount,
  tax,
  notes,
  assumptions,
  questions
}
```

The application then renders this data through KIT's controlled proposal templates.

This provides:

- consistent branding
- secure rendering
- predictable PDFs
- easier editing
- easier versioning
- easier testing
- less hallucinated formatting

The AI creates the CONTENT.

KIT creates the DOCUMENT.

---

# 9. AI CHANGE REVIEW

Do not silently allow AI to rewrite an existing proposal.

If KIT modifies an existing proposal, show a lightweight change review.

Example:

```text
KIT propone:

+ Añadir 2 técnicos de montaje
+ Añadir servicio de entrega
~ Actualizar introducción
~ Cambiar descuento de 0% → 10%

[Aplicar cambios]   [Descartar]
```

For simple text rewrites, inline preview is acceptable.

For financial changes, always require confirmation.

Especially:

- prices
- quantities
- discount
- tax
- totals

Never let AI invent catalog prices.

Preserve the current principle that pricing should come from KIT's catalog or explicit manual input.

---

# 10. KIT CLASSIC DESIGN

Build a new proposal renderer specifically for the classic document.

Suggested component architecture:

```text
src/modules/proposals/templates/
    KitClassicProposal.tsx
    ProposalDocument.tsx
    proposal-document.css
```

Do not hardcode proposal data inside the template.

The component receives structured proposal data.

Visual direction:

- white paper
- clean black/charcoal text
- subtle KIT brand accent
- strong KIT logo
- slogan below logo
- thin table borders
- strong typography hierarchy
- generous spacing
- professional financial totals
- minimal unnecessary decoration

It should work both:

- inside the app
- printed/exported

---

# 11. BRAND HEADER

Top-left:

KIT logo / wordmark

Below:

`La gente de los eventos`

Then company information.

Company information should eventually come from company settings rather than hardcoded React code.

Suggested fields:

- company name
- slogan
- address
- phone
- email
- website
- logo

If these fields do not currently exist in settings, introduce them carefully or create a follow-up migration plan.

Do not hardcode the screenshot's contact details throughout the component.

---

# 12. DOCUMENT TYPE

Although Image 1 says FACTURA, this section is primarily for proposals.

Default document type:

`PROPUESTA`

Potential future types:

- PROPUESTA
- COTIZACIÓN
- FACTURA

Do not build a complete invoicing/accounting system as part of this feature.

For this implementation focus on proposals.

---

# 13. CLIENT INFORMATION

If a proposal is linked to an existing KIT client, populate:

- name
- contact
- email
- phone
- company
- address if available

Allow editing proposal-specific display data without unexpectedly changing the master client record.

When an issued proposal must preserve historical information, ensure later changes to the master client do not modify the already-issued version.

Use a snapshot/revision approach where necessary.

---

# 14. EVENT INFORMATION

If linked to an event, populate:

- event title
- event type
- venue
- start date
- end date
- attendees
- notes

Relevant event information should be available to KIT AI as context.

The proposal should not need to display every field.

Keep the client-facing document concise.

---

# 15. EQUIPMENT AND SERVICES TABLE

The table is one of the central parts of the proposal.

Columns:

```text
CANT.
DESCRIPCIÓN
PRECIO UNITARIO
TOTAL
```

Optional:

`DÍAS`

depending on the billing model.

The user must be able to:

- add from equipment catalog
- add custom service
- reorder lines
- edit descriptions
- edit quantity
- edit days
- edit permitted pricing
- delete rows

Add rows naturally.

Avoid modal dialogs for routine row editing.

---

# 16. FINANCIAL SUMMARY

Clearly display:

```text
SUBTOTAL
DESCUENTO
IMPUESTOS
TOTAL
```

The existing `quoteTotals()` logic should remain the source of truth.

Do not recreate money calculations inside visual components.

Formatting should respect the workspace currency.

Current screenshots use USD.

---

# 17. AI INSTANT GENERATION

Add a fast creation workflow.

Example:

User clicks:

`Nueva propuesta`

The blank KIT Classic proposal appears immediately.

The KIT panel displays:

`Describe lo que necesita el cliente`

User writes:

> Proyección para una actividad de 200 personas. Necesitamos un proyector BARCO, computadora, técnicos, entrega y cableado. El evento es el 1 de noviembre.

KIT:

1. Reads available event/client context.
2. Searches only approved KIT catalog data for equipment/prices.
3. Creates a structured proposal suggestion.
4. Shows it immediately in the proposal preview.
5. Highlights assumptions.
6. Asks questions only when necessary.
7. Allows user confirmation.

Target feeling:

**Prompt → professional proposal in seconds.**

---

# 18. AI SHOULD ALSO EDIT

KIT AI is not only for initial generation.

Once a proposal exists, the user can say:

> Add another projector.

> Remove delivery.

> Make the copy shorter.

> Add a section explaining what the technicians will do.

> Change the discount to 5%.

> Make this sound more premium.

> Translate this proposal to English.

> Write a two-sentence summary for WhatsApp.

Apply the same confirmation rules to consequential changes.

---

# 19. PREVIEW MODES

Provide two states:

### Edit
Fields are editable.

### Preview
The exact client-facing document.

Preview should hide:

- editing controls
- AI controls
- internal warnings
- helper text
- technical metadata

Optional keyboard shortcut later:

`⌘ + Shift + P`

Do not conflict with browser print behavior.

---

# 20. PDF / PRINT

The KIT Classic proposal must be printable.

Start with a robust print stylesheet.

Support US Letter because KIT operates in Puerto Rico / United States.

Also ensure graceful A4 compatibility where practical.

Use:

```css
@media print
```

Requirements:

- no sidebar
- no top navigation
- no AI panel
- no edit controls
- no unnecessary page breaks
- tables should not split badly
- header should remain visually correct
- totals should remain together

Add:

`Exportar PDF`

If the initial implementation relies on browser Print → Save as PDF, make the UX clear.

A server-side PDF renderer can be considered later if it provides meaningful value.

Do not introduce a heavy PDF dependency without first determining whether print CSS meets the requirement.

---

# 21. VISUALS

KIT already supports proposal visuals.

Do not remove that capability.

However, visuals should be optional.

A simple audiovisual quotation should be possible without adding any render.

For larger proposals, allow sections containing:

- KIT Design renders
- event design images
- approved concepts
- floor plan/visual references

The classic document should remain clean even with no visuals.

---

# 22. PROPOSAL LIST

The `/proposals` list should remain simple.

Recommended columns:

- Proposal
- Client
- Event
- Total
- Status
- Updated

Primary action:

`Nueva propuesta`

Secondary filters:

- Todos
- Borradores
- Revisión
- Enviadas
- Aceptadas

Avoid excessive controls.

---

# 23. PROPOSAL STATUS

Continue using the existing proposal lifecycle where appropriate:

- Draft
- In review
- Ready to send
- Issued
- Accepted
- Declined
- Superseded

Translate the visible UI consistently into Spanish.

Do not change stored enum values unnecessarily if doing so creates migration risk.

---

# 24. REVISION HISTORY

Preserve proposal versions.

A professional proposal system needs historical accuracy.

When a proposal has been sent/issued and subsequently edited, create or clearly track another revision.

The user should eventually be able to understand:

```text
v1 — enviada Nov 10
v2 — descuento actualizado Nov 11
v3 — aceptada Nov 12
```

Do not accidentally mutate historical issued versions.

---

# 25. SEND WORKFLOW

Reuse KIT's existing guarded outbound messaging architecture.

From the proposal:

`Revisar y enviar`

Possible send options eventually:

- WhatsApp
- Email
- Copy secure link
- Download PDF

Do not automatically send anything after AI generation.

AI generates.

User approves.

User sends.

---

# 26. RESPONSIVE BEHAVIOR

Desktop:

```text
Document + AI side panel
```

Smaller screen:

```text
Document
```

with floating or drawer action:

`KIT AI`

On mobile, AI should open as a sheet/drawer rather than compressing the proposal into an unusable width.

---

# 27. EXISTING PRESENTATION TEMPLATES

The current Proposal type includes:

```ts
"Minimal" | "Editorial" | "Spotlight"
```

Audit how these are currently used.

Do not delete them blindly.

Introduce:

`Classic`

or equivalent.

For new proposals, KIT Classic should be the default unless product requirements explicitly say otherwise.

Existing proposals must continue rendering correctly.

If Minimal / Editorial / Spotlight are redundant after the new renderer is implemented, propose a later consolidation rather than silently removing compatibility.

---

# 28. SIMPLICITY RULE

The proposal experience should NOT become a miniature Microsoft Word.

Do not build:

- arbitrary fonts
- arbitrary colors
- arbitrary positioning
- drag-and-drop text boxes
- unrestricted HTML
- complicated page builders

KIT controls the design.

The user controls the content.

This is what keeps proposals looking professional.

---

# 29. DEFINITION OF DONE

A new user should be able to:

1. Open Propuestas.
2. Click Nueva propuesta.
3. See a complete KIT-branded proposal immediately.
4. Click and type directly into it.
5. Add equipment/services.
6. Ask KIT to generate the content.
7. Ask KIT to modify the proposal.
8. Review all financial changes.
9. Preview the client-facing version.
10. Export it cleanly as PDF.
11. Save it.
12. Send it using the existing guarded workflow.

The entire flow should feel simpler than the existing proposal editor, not more complex.

---

# 30. TESTS

Add tests covering at minimum:

- creation of empty Classic proposal
- proposal populated from event
- proposal populated from client
- line creation/removal
- correct totals
- discount calculation
- AI suggestion validation
- AI cannot invent catalog pricing
- financial AI changes require confirmation
- proposal editing
- preview mode
- print layout smoke check
- existing proposal compatibility
- proposal revision preservation
- role/access restrictions
- responsive AI drawer
- accessibility

Run:

```bash
npm run typecheck
npm run build
npm test
npm run test:browser
```

All previous tests must remain green.

---

# PRODUCT PRINCIPLE

A KIT proposal should look like it took a professional sales team time to prepare even when the first draft was produced in seconds.

The product experience should be:

**Describe → Generate → Edit → Approve → Send**

not:

**Configure → Configure → Configure → Generate.**
