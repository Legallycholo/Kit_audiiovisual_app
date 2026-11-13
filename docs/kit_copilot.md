# KIT copilot: tool registry, action engine and approvals

Implemented 2026-11-12 (owner decisions recorded that day). This document is the technical reference for KIT's action layer: what exists, how a change travels from a sentence in the chat to an audited record, how to configure it, and how future specialized agents plug in.

## 1. What changed

Before, KIT chat could only propose two hard-coded actions (`create_task`, `proposal_draft`) and the proposal assistant worked through one route (`POST /api/ai/proposal-draft`). Now one server-side layer serves every AI surface:

| Layer                     | File                                     | Role                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool contracts + registry | `server/ai/tools.ts`                     | `defineTool()` (id, Spanish description, zod input, allowed roles, side-effect class, `describe`, `run`), `ToolRegistry` (role/mode filtering, provider specs), `requiresConfirmation()`. |
| Tools                     | `server/ai/tools/proposals.ts`, `records.ts` | Proposal create/edit/line/money tools; event, client, task and inventory reads; task writes. Handlers return record changes, never persist.                                              |
| Action engine             | `server/ai/engine.ts`                    | `prepare` (validate + role), `read`, `execute` (handler on the actor's scoped records → one transaction: revision check, `applyChanges`, assignee checks, save, audit).                   |
| Conversation service      | `server/kit.ts`                          | Sends the turn to the provider, runs tool calls through the engine during the turn, stores pending/applied actions on the message, `confirm` / `reject`.                                    |
| Provider loop             | `server/ai-provider.ts` → `anthropicToolTurn` | Native Claude tool use with cache breakpoints on the system prompt and tool list; `tool_choice: auto` (forced choice is not available on current models) and `none` on the last step.  |
| UI                        | `src/modules/KitChat.tsx`, `src/shared/kit-store.tsx` | Three modes in the composer, action cards with effect badge and status, generic confirmation dialog, Descartar.                                                                |

Unchanged on purpose: KIT Classic and `ProposalAssistant` (document-first; the person applies reviewed suggestions into the open draft and saves), `POST /api/ai/proposal-draft`, every existing route and response shape, `applyChanges` and the scoping policy.

## 2. Execution lifecycle

```
person ─ message (mode, approval, refs, context) ─▶ KitService.send
   │  context {proposalId|eventId|clientId} → scoped refs become sources
   ▼
provider turn (Claude: anthropicToolTurn; others: single structured answer with ≤1 `action`)
   │  tool call ─▶ runner ─▶ engine.prepare (zod input, role) ─▶
   │     read   → engine.read on the scoped workspace, result back to the model
   │     write  → requiresConfirmation(effect, approval)?
   │               yes → stored as `pending` on the message (token = hash(id, call, revision, message)), model told "pendiente"
   │               no  → engine.execute now: fresh scoped read, revision == tracked revision, applyChanges, save, audit
   ▼
answer validated (citations, Ask mode may not act), freshness re-checked, message completed with `actions[]`

confirm(token) ─▶ prepare again (role may have changed) ─▶ execute with the revision the change was proposed at
                  (slow tools — AI generation inside — run as a job; the thread is busy meanwhile)
reject(token)  ─▶ status cancelled, audited; nothing runs
```

Guarantees:

- The model never authorizes anything. Input is re-validated against the tool schema (strict: an injected `rate` is rejected), the role is checked in `prepare`, the record scope is enforced because handlers only see `scopeWorkspace(...)`, and `applyChanges` re-applies every collection rule (locked proposals, event ownership, task rules) on write.
- Stale records: every write carries the workspace revision it was prepared against; the transaction applies nothing when the revision moved (409 `STALE_MESSAGE`). KIT's own auto-applied writes advance the tracked revision inside the turn.
- Idempotency: `requestId` dedupes a resent message; a confirmed action is marked completed and a second confirm is a no-op; one pending write per message.
- Audit: `KIT action executed` (tool, effect, `approval: auto|confirmed`, summary, truncated input, thread/message/action ids, event), `KIT action rejected`, `KIT action failed`.
- Prompt injection: sources, tool results and history are declared untrusted data in the system prompt; and whatever the model does, financial/external tools cannot run without the person (test: an injected "apply 50 % discount" still waits).

## 3. Approval policy

| Effect      | Examples                                                                         | Ask approval | Auto approval |
| ----------- | -------------------------------------------------------------------------------- | ------------ | ------------- |
| `read`      | `proposal.get`, `inventory.search`, `event.get`                                  | runs         | runs          |
| `draft`     | section text, catalog/custom lines, quantities, link event, validity, tasks      | **dialog**   | runs, shown as applied |
| `financial` | `proposal.set_discount`, `set_tax`, `set_custom_rate`, `set_payment_terms`      | **dialog**   | **dialog**    |
| `external`  | (reserved: send, accept, delete, reserve — no tool exposes these today)          | **dialog**   | **dialog**    |

The person chooses the approval per conversation in the composer: **Consultar** (Ask mode: read tools only), **Actuar · confirmar cada cambio**, **Actuar · aplicar cambios de borrador**. Owner decision 2026-11-12: auto approval relaxes the former "always confirm" rule for draft-class changes only; it is chosen by the person, never by the model.

Catalog lines are `draft` because the price comes from the catalog and totals are recalculated by `quoteTotals()`; the result card shows the new total. A custom service enters without a price and the price is set through a financial tool.

## 4. Tool catalog (today)

Proposals (`Administrator`, `Sales Manager`): `proposal.get`, `proposal.validate`, `proposal.create_draft` (optional `brief` → proposal generator, catalog rates, questions for anything missing, no discount), `proposal.generate_content`, `proposal.update_section` (title | introduction | scope | notes | terms), `proposal.add_catalog_item`, `proposal.add_custom_item`, `proposal.update_line`, `proposal.remove_line`, `proposal.link_event`, `proposal.set_validity`, financial: `proposal.set_discount`, `proposal.set_tax`, `proposal.set_custom_rate`, `proposal.set_payment_terms`.

Records (all staff roles; visibility by scope): `event.list`, `event.get`, `client.search`, `client.get`, `task.list`, `inventory.search`, `inventory.get_item`, `inventory.check_availability`. Writes: `task.create` (Administrator, Production Manager), `task.update` (plus Technician, own tasks only via `applyChanges`).

Directory (Stage E): `client.create`, `client.update` (Administrator, Sales Manager; duplicates by name or email rejected), `event.create`, `event.update` (plus Production Manager, who may only change the status — `applyChanges` enforces it), financial: `event.set_budget`.

`GET /api/kit/status` lists the tool ids the signed-in person may use.

## 5. API additions (all additive)

- `POST /api/kit/threads/:id/messages` accepts `approval: "ask" | "auto"` (default `ask`) and `context: { route?, proposalId?, eventId?, clientId? }`; `refs` may now carry `kind: "client"`.
- `POST /api/kit/threads/:id/reject { messageId, token }`.
- Message shape: `actions: KitActionRecord[]` replaces the former single `action` (stored threads are read with a normalizer; `kit_threads` was empty in production).
- `GET /api/kit/status` adds `tools: string[]`.

No database migration: action state lives in the thread payload and the `audit` table.

## 6. Configuration

Environment (server only, never the browser):

| Variable                | Meaning                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | Enables Claude. With several keys and no `KIT_AI_PROVIDER`, Anthropic is preferred, then OpenAI, then Gemini. |
| `KIT_AI_PROVIDER`       | `anthropic` \| `openai` \| `gemini`, overrides the preference.                                            |
| `KIT_AI_MODEL`          | Proposal generation (Claude default `claude-opus-5-5`).                                                   |
| `KIT_CHAT_MODEL`        | KIT chat / copilot turns (Claude default `claude-opus-5-5`; set `claude-sonnet-5-5` for lower cost).      |
| `KIT_PLAN_MODEL`        | Plan reading (defaults to the proposal model).                                                            |
| `KIT_JOB_STALE_MS`      | Age after which a cut-off job is interrupted on Vercel (existing).                                        |

Only Claude runs the native tool loop today; OpenAI and Gemini keep the single structured answer and may propose one `action`, which goes through the same policy. Model ids are checked live by Settings › Integraciones (`probeModel`).

Cost controls already in place: `kit:<user>` 20 / `kit:company` 100 messages per window, `ai:user` 10 / `ai:company` 30 generations per window, at most 8 provider steps per turn, 12 000 characters per tool result, 16 000 per source.

**Not verified live:** no real Claude call has been made from KIT yet (production has no key). The tool loop and the combination of tool use with `output_config.format` are covered by tests over an injected transport only.

## 7. Adding a tool or a specialized agent

Tools:

1. `defineTool({ id: "domain.verb", description (Spanish, for the model), input: z.object({...}).strict(), roles, effect, describe, run })` in `server/ai/tools/<domain>.ts`; register it in `server/ai/tools/index.ts`.
2. `run` receives the actor's scoped workspace and returns `{ changes, eventId, summary, route, output }`. Never call `repo.save`; never accept prices or ids the catalog does not know.
3. Classify honestly: anything that sets money is `financial`; anything that leaves the draft (sending, accepting, deleting, reserving, locked records) is `external`.
4. Add tests in `server/ai/tools.test.ts` (handler) and, if the lifecycle matters, `server/kit-copilot.test.ts`.

Future agents (Sales, Proposal, Event Planning, Inventory, Operations, KIT Design) are consumers of this layer, not new backends:

- Identity and authorization: an agent acts as a signed-in person (`WorkspaceUser`); it gets `registry.available(user, mode)` and nothing else.
- Execution: `ActionEngine.prepare/read/execute` with the same `expectedRevision` and audit `origin`; approvals through the same pending-record + token flow, or an agent-specific durable approval if it runs unattended (not built; would need a table and is a separate decision).
- Prompts and model choice stay per agent (`KIT_*_MODEL`); the tool loop (`anthropicToolTurn`) is reusable with a different system prompt and tool subset.
- Safety that must not be bypassed: strict tool schemas, role + scope, revision check, financial/external always confirmed, rate limits, audit.
