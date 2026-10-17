# Desktop Milestone 6 — provider-neutral design pipeline

Implemented: October 17, 2026

This milestone is split into a complete local/provider-neutral foundation and a
tool-gated production integration. No AI, OCR, PDF, or media-rendering provider
has been selected by the implementation.

## Implemented now

- Floor-plan image validation for PNG, JPEG, and WebP, including an explicit
  rights confirmation before upload.
- Known-width calibration, ceiling height, meters, reference opacity, and
  measurement-source verification.
- A provider-neutral extraction contract at `POST /api/design/extract` and
  capability discovery at `GET /api/design/status`.
- Event authorization, strict input/output schemas, calibrated-boundary checks,
  and a no-write response: provider results cannot mutate a saved layout.
- A visible manual fallback when no extractor is configured. The application
  does not simulate an AI result or send the floor plan anywhere.
- Reviewable Wall, Door, and Window suggestions with confidence values,
  low-confidence overlay styling, accept, correct, discard, and accept-all
  controls.
- A review gate that prevents measurement verification while extracted
  suggestions remain unresolved.
- Extraction provenance on the design revision: provider, model, request,
  source file, extraction time, and review time.
- Architectural geometry in the shared 2D and Three.js scene alongside Library
  equipment, material colors, and visual labels.
- Saved camera paths with 15, 30, or 60 second duration, ordering controls, and
  in-app path preview.
- Local GLB export plus the existing revision-linked PNG, SVG plan, and JSON
  exports.
- Immutable revision snapshots now preserve camera paths and extraction
  provenance.

## Intentionally waiting for tool selection

- Production floor-plan extraction provider and model.
- OCR and PDF-to-image/rasterization implementation.
- 1080p MP4 encoder or rendering service.
- Provider-specific cost, time, quota, cancellation, retry, and durable job
  history behavior.

The UI labels the MP4 path as pending and does not show invented cost or time
estimates. Once the tools are selected, adapters can be added without changing
the stored layout, review, provenance, or camera-path contracts.

## Verification

- Unit and server coverage validates provider output, rejects malformed and
  out-of-bounds geometry, preserves provenance, and confirms that an
  unconfigured extractor leaves the layout unchanged.
- Browser coverage requires upload rights confirmation and exercises camera
  persistence, path duration, PNG export, GLB export, and dark-theme contrast.

Milestone 6 is not marked production-complete until representative clean and
imperfect plans pass the selected extractor, PDF import is available, and MP4
jobs meet the estimate/progress/cancel/retry/history requirements.
