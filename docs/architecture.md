# PrismDeckJS architecture

## Purpose and boundaries

PrismDeckJS converts supported presentation files into an engine-owned document,
then renders and edits that document without retaining a runtime dependency on
the source format. All conversion runs locally in the browser.

The system does not execute macros, OLE objects, embedded scripts, or imported
application code. The `.prismdeck` package contains declarative data and assets
only.

## Building blocks

| Block | Responsibility |
| --- | --- |
| Import adapters | Parse PPTX, PowerPoint layouts, ODP, or `.prismdeck` into one normalized model and an import report. |
| Document package | Own the versioned JSON contract, validation, ZIP limits, and binary asset lifecycle. |
| HTML package | Embeds one validated document archive and loads the version-matched browser runtime from a CDN. |
| Presentation session | Own slide order, navigation, timing, and the single authoritative state. |
| Deck renderer | Own the Canvas2D presentation surface, persistent declarative background, active-slide Three.js group, clear color, transitions, textures, cameras, picking, resize, capture, context loss, and disposal. |
| Chart adapter | Converts normalized chart semantics into a fixed-size, non-animated ECharts SVG, then disposes the transient chart instance. |
| Semantic viewer layer | Mirrors active-slide chart data and presentation tables as inert screen-reader HTML without affecting visual layout. |
| Stereo output | Project the same scene through calibrated left and right off-axis cameras. |
| Rapier session | Optionally step one fixed-timestep world and synchronize active-slide meshes. |
| Studio | Edit normalized content and presentation metadata without mutating source OOXML or ODF. |
| Agent adapters | Expose one shared deck-authoring skill through harness manifests, an OpenCode server module, and a DeepSeek/Cordis service without duplicating document or export logic. |

## Critical runtime flow

```text
source bytes
  -> bounded format adapter
  -> DeckDocument + AssetStore + ImportReport
  -> PresentationSession
  -> optional deck-scoped background + active flat Canvas2D slide OR active Three.js slide group
  -> mono camera OR left/right SBS cameras
```

HTML import is a wrapper around the same archive boundary: only the exact inert
PrismDeck data marker is decoded. Scripts and markup from imported HTML are never
executed.

Agent-generated decks follow the same boundary. A shared skill writes a
`DeckDocument`; its script bridge invokes the packaged HTML exporter; OpenCode
and Cordis adapters only translate host arguments to that script contract. The
SDK remains the package root export, while agent hosts use explicit subpaths.

Physics advances once per accepted frame before either eye is rendered. Stereo
never duplicates document state or simulation.

An optional declarative background scene is owned at deck scope in a separate
Three.js scene beside the active-slide group. The player advances it from the
same frame timestamp, so navigation replaces slide content without resetting
background animation. A slide camera declaration inversely transforms only that
background group; the slide group and Canvas2D overlay retain their authored
framing. Each eye renders the background first, clears depth, and then renders
slide content. A galaxy camera can additionally select a bounded top/tilt
orientation, focus a fixed solar body, and set its viewing distance. The nested
solar system remains part of that same owned runtime. Optional backdrop and body
textures resolve only through the package asset store. Deck replacement, detach,
or renderer disposal releases geometry, textures, materials, and pending image
decodes.

When the host supplies an overlay canvas, flat slides whose visible elements all
have zero depth, zero X/Y rotation, no extrusion, and no physics render through a
high-resolution Canvas2D overlay.
Their invisible Three.js planes retain camera projection and picking. If any
visible element participates in spatial depth, tilt, extrusion, or physics, the
entire slide renders through Three.js so depth testing and occlusion remain
coherent. PNG capture and the generated HTML viewer composite the same owned
canvases.

Charts follow the same surface boundary. The renderer derives an ECharts option
from normalized document data, renders SVG at the element texture size, draws it
into the owned element canvas, and immediately releases the chart and temporary
URL. Tables are laid out directly from their normalized grid. Neither path adds
persistent DOM or library state to the scene.

Stereo cameras use off-axis projection around the slide plane. Default eye
separation is `0.04 * convergenceDistance`; the Studio depth control scales that
ratio from 0 through 1.5 and caps the effective ratio at 0.06. The public pinhole
helpers use `focalDistance / (focalDistance + depthBehindPlane)` for
center-relative perspective scaling. Persistent backgrounds use a second
CyberHUD-derived rig whose convergence is the active background-camera distance.
Its eye-separation ratio interpolates logarithmically from 0.024 at close focus
to 0.04 at Galactic distance, preventing planet close-ups from inheriting the
slide plane's much larger scene-unit eye separation.

## Quality constraints

- Imported files remain on the device.
- Parsing and decompression have explicit resource limits and cancellation seams.
- Source-format types never appear in the public PrismDeck document contract.
- ECharts options, callbacks, instances, and source chart XML never appear in the public document contract.
- Unsupported content produces structured warnings with source locations.
- Imported content remains planar unless the normalized element explicitly requests thickness.
- Import draw order is represented by `renderOrder`; importers do not invent spatial `z` offsets.
- Slide backgrounds remain clear colors; an optional document background scene is a separately owned, bounded declarative layer.
- Slide background cameras are bounded data and never transform authored slide content.
- Slide transitions honor reduced-motion preferences, cancel on scene replacement, and never transform a persistent background.
- Full and half SBS preserve a logical 16:9 projection for each eye.
- Canvas2D texture dimensions preserve the physical slide-frame aspect ratio and cap their longest side at 2048 pixels.
- Loading a new deck or slide deterministically disposes owned GPU, media, worker,
  and physics resources.
- Exported viewers provide active-slide text, chart data, and table structure to assistive technology independently from visual canvases.
- Harness adapters contain no document generation, validation, rendering, or archive logic; they delegate to the shared skill and SDK export boundary.

Significant chart and table rendering decisions are recorded in
[`adr/0003-semantic-chart-table-rendering.md`](adr/0003-semantic-chart-table-rendering.md).
The monorepo agent-adapter boundary is recorded in
[`adr/0004-agent-adapter-boundary.md`](adr/0004-agent-adapter-boundary.md).
Persistent background ownership is recorded in
[`adr/0005-persistent-background-scenes.md`](adr/0005-persistent-background-scenes.md).
