# KIT chat

Updated 2026-11-13 (owner decision that day). KIT is the name of the AI sidebar in the workspace; the AI behind it is the provider configured on the server (Claude from Anthropic in production, through `ANTHROPIC_API_KEY` and `KIT_CHAT_MODEL`). KIT is not a built agent: the person sends a message and gets the model's answer, like a plain chat.

## What it does

- One conversation thread per chat, stored in `kit_threads` as before (list, create, rename, restart, delete, stop; the owner-only scoping is unchanged).
- Each turn sends the system prompt, the last 20 completed messages and the new question to the provider (`server/kit.ts` → `aiKitGenerator` → `chatResponse` in `server/ai-provider.ts`). The answer is plain text; there is no output schema.
- **Attachments are explicit.** The person may attach a project (`+ Proyecto`), text files (TXT/MD/CSV) or an indexed file from Search. Only those reach the model, rendered as data before the question. With nothing attached, nothing about the workspace is sent and the prompt tells the model not to mention it.
- Attached records are still scoped (`scopeWorkspace`) and redacted (`redactSecrets`); the message shows them as "Adjuntos: …" with a link to the current record.

## What was removed (2026-11-13)

The copilot layer implemented on 2026-11-12 — tool registry and action engine (`server/ai/`), the Consultar / Actuar modes and approval setting, confirmation dialogs, `POST /api/kit/threads/:id/confirm|reject|branch`, the citation requirement and the "Contexto y citas" panel, the automatic "Resumen del espacio" source, the page-context chip, the consent checkbox and the JSON answer format. The owner wants Claude plugged into the workspace, not an in-app agent; if an agent is ever needed it will be built on the Anthropic side.

Unchanged: the proposal assistant inside KIT Classic (`POST /api/ai/proposal-draft`) and KIT Design.
