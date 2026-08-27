# Demo deck themes

Status: Implemented

PrismDeck Studio uses one neutral, high-contrast interface palette. The theme
selector changes presentation content in the built-in ten-slide Milky Way walkthrough;
it does not theme Studio chrome and is disabled for imported decks. Imported
presentation colors are never rewritten.

## Catalog

| Theme | Base | Primary | Accent |
| --- | --- | --- | --- |
| Edge | Orbital glass | Ice white | Orbital blue |
| Office | Standard Office accents | Blue | Orange |
| Organic | Presentation neutral | Green | Blue |
| Ion | Presentation neutral | Dark blue | Cyan |
| Executive | Presentation neutral | Navy | Orange |
| Pastel | Soft presentation neutral | Slate | Rose |
| Grayscale | Presentation neutral | Dark gray | Gray |

Each theme supplies `background`, `surface`, `primary`, `accent`, `success`,
`warning`, and `danger` colors. The six neutral families use familiar
PowerPoint-safe light backgrounds and Office-style accent colors. Their internal
IDs remain stable for locally persisted theme preferences; only their labels and
presentation colors changed. Edge uses a dark aerospace palette with slate glass
surfaces, Orbitron display type, ice-white body copy, and a restrained orbital-blue
accent. Orbitron is bundled under the SIL Open Font License 1.1.

The selected demo theme persists locally in the browser. Edge is the default.
Changing the theme recolors semantic demo content and each slide's scene
background. A subsequent manual scene-background edit applies to the current
slide and is preserved as document content. The Milky Way scene keeps its own
warm-core and desaturated-arm colors so it remains legible behind every theme.
