# Changelog

## Unreleased

- Added editable single-file HTML import/export and a version-pinned CDN viewer.
- Added a minified browser bundle, DeepSeek Harness generation flow, and npm
  release publishing with provenance.
- Added the CyberHUD Edge palette, six Office-compatible demo palettes, and a
  six-slide feature tour while keeping Studio chrome neutral.
- Made omitted/zero thickness a planar rendering contract and documented the
  supported element types plus PPTX/ODP feature matrix.
- Added native cut, fade, and slide transitions with reduced-motion fallback.
- Made slide backgrounds editable scene clear colors instead of occluding
  geometry, with color inheritance for newly created slides.
- Added crisp aspect-correct Canvas2D rendering for flat slides, coherent
  Three.js fallback for spatial slides, and composited HTML/PNG output.
- Added drag-to-draw text/basic shapes, practical slide/text/shape controls, a
  collapsed spatial inspector, and convergence-relative SBS depth calibration.
- Replaced the two HUD-specific starter layouts with the nine standard Western
  PowerPoint layouts and added projected selection outlines with corner resizing.
- Added schema `0.2.0` semantic charts and tables, automatic `0.1.0` package
  migration, classic PPTX combination charts, packaged ODF charts, merged and
  styled tables, deterministic ECharts SVG surfaces, and accessible HTML data
  tables.

## 0.1.0 - 2026-08-22

- Added browser-local PPTX, zero-slide PowerPoint template, focused ODP, and
  `.prismdeck` import.
- Added the versioned normalized document schema and digest-checked asset bundle.
- Added Three.js spatial rendering with mono, full SBS, and half SBS output.
- Added one fixed-step optional Rapier world shared by both stereo eyes.
- Added layout-based slide creation and depth, rotation, thickness, text, and
  physics editing.
- Added PrismDeck Studio, exact-size PNG capture, compatibility reports, tests,
  CI, and GitHub Pages deployment.
