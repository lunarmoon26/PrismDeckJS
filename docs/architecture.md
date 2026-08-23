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
| Three renderer | Own view-local meshes, textures, cameras, picking, resize, context loss, and disposal. |
| Stereo output | Project the same scene through calibrated left and right off-axis cameras. |
| Rapier session | Optionally step one fixed-timestep world and synchronize active-slide meshes. |
| Studio | Edit normalized content and presentation metadata without mutating source OOXML or ODF. |

## Critical runtime flow

```text
source bytes
  -> bounded format adapter
  -> DeckDocument + AssetStore + ImportReport
  -> PresentationSession
  -> active slide scene
  -> mono camera OR left/right SBS cameras
```

HTML import is a wrapper around the same archive boundary: only the exact inert
PrismDeck data marker is decoded. Scripts and markup from imported HTML are never
executed.

Physics advances once per accepted frame before either eye is rendered. Stereo
never duplicates document state or simulation.

## Quality constraints

- Imported files remain on the device.
- Parsing and decompression have explicit resource limits and cancellation seams.
- Source-format types never appear in the public PrismDeck document contract.
- Unsupported content produces structured warnings with source locations.
- Full and half SBS preserve a logical 16:9 projection for each eye.
- Loading a new deck or slide deterministically disposes owned GPU, media, worker,
  and physics resources.
