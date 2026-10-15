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

Server technology, production hosting, identity provider, AI provider, and secrets management still need implementation decisions. The current UI is deliberately independent of a provider-specific client SDK.
