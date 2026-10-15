# Initial technical decisions

These are implementation choices made after the user's instruction to begin development, not retroactive claims that the original planning brief selected a stack.

- **React and TypeScript:** a component-based app shell with typed shared records; avoids disconnected per-page state models.
- **Vite:** local development and production asset build. Node 22 in the workspace satisfies the selected tooling. Reference: [Vite getting started](https://vite.dev/guide/).
- **React Router:** direct URL navigation to module and record pages, browser history, and event-linked workspace entry points.
- **Three.js:** lazy-loaded geometry preview of the same dimensions and positions used by 2D. It does not create a second authoritative scene geometry model. Reference: [Three.js documentation](https://threejs.org/docs/).
- **Local sample persistence first:** enables review of structure and workflows without implying a live database or access-controlled production environment. This is an intermediate boundary; authenticated shared persistence remains required by the full plan.
- **Pure business functions:** currency math, availability, acceptance guards, and revision construction are isolated for testing and later server reuse.
- **No fake external execution:** AI and WhatsApp remain visibly disconnected until real integrations exist. There is no simulated successful send or fabricated model output.
- **Source remains in this repository:** no hosted Site was registered or deployed, and no changes were committed/pushed. The existing repository and previous no-push instruction are preserved.
- **Verification:** Vitest for critical business invariants; isolated Chrome through Playwright for workflows and responsive checks; axe for automated accessibility. The Browser plugin reported no available browser sessions, so isolated local browser verification was used.

## Authenticated company workspace and drafting

- **Express and Node SQLite:** local company service with a transactional workspace payload plus separate users, sessions, audit and rate-limit records. This fits the initial single-company workload; it is not a claim of large-scale concurrency readiness. A workspace revision prevents silent overwrite across sessions. Node 22 reports the SQLite API as experimental; production runtime qualification remains outstanding.
- **Separate sample/company modes:** sample data stays in browser storage; an empty company is initialized through owner setup and persisted on the server. Restoring a session preserves the requested record URL.
- **Server authorization:** sessions use HTTP-only cookies; mutations require an allowed origin and CSRF token. Role/event/client-sharing checks operate before returning or mutating records. Technician tasks use stable account IDs, not display names. Protected audit records do not accept client-authored activity entries.
- **AI boundary:** server-only Responses adapter with strict structured output, validated catalog references, server-selected catalog prices, request/time/output limits, and no tools for messaging or stock mutations. The model is explicitly configured with `KIT_AI_MODEL`; no account-dependent model availability is assumed. Provider secrets are loaded only by the server.
- **Review before applying:** generation returns a candidate, without updating proposals. The owner chooses replacement fields; commercial terms, tax and discount remain under manual control. Review notes are internal and excluded from client responses and print views.
- **Spanish presentation:** a small interface-label catalog keeps visible Spanish labels separate from English lifecycle identifiers and untouched business content. Broader localization is still in progress; an English language switch is not assumed.
- **Verification boundary:** API/domain tests cover authentication, scope, atomic reservations, version protection, model-output validation and failure handling. Browser tests use real isolated API/database instances and an explicit substitute only for model generation. This does not prove live model quality or delivery.

The Responses request shape follows [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Production hosting, company-authorized provider configuration, managed secrets, backup/recovery and operational support still require completion.
