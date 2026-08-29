# Changelog

## Unreleased

- Added editable single-file HTML import/export and a version-pinned CDN viewer.
- Added a minified browser bundle, DeepSeek Harness generation flow, and npm
  release publishing with provenance.
- Added the aerospace-glass Edge palette, six Office-compatible demo palettes,
  and a ten-slide Milky Way walkthrough while keeping Studio chrome neutral.
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
- Added schema `0.3.0` deck-scoped declarative backgrounds, automatic `0.2.0`
  package migration, and a deterministic CyberHUD-derived Milky Way scene that
  remains continuous behind slide transitions.
- Added per-slide galaxy camera translations, CyberHUD-default particle raster
  sizing, and an attributed packaged NASA/JPL Milky Way backdrop for the Studio
  universe demo.
- Added schema `0.4.0` solar-system backgrounds with packaged planet and sky
  textures, isolated solar lighting, a J2000 ecliptic frame, body-focus zooms,
  and CyberHUD-style top/tilt/horizon camera transitions.
- Added a CyberHUD-calibrated distance-aware stereo rig for persistent
  backgrounds so close planet focus remains comfortable and independently
  converged from authored slide UI in full and half SBS.
- Added schema `0.5.0` Earth cloud-opacity and ocean-specular texture slots,
  CyberHUD-derived demo maps, and transition-synchronized planet focus scaling.
- Rescaled the solar-detail group to CyberHUD's Galactic proportion and
  recalibrated close focus cameras so Sol is only revealed by a true magnitude
  shift from the Milky Way overview.
- Matched CyberHUD's translucent Sol shell with a luminous core and corona, and
  made the opening demo slide animate when selected from another slide.

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
