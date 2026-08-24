# Demo deck themes

Status: Implemented

PrismDeck Studio uses one neutral, high-contrast interface palette. The theme
selector changes presentation content in the built-in six-slide feature tour;
it does not theme Studio chrome and is disabled for imported decks. Imported
presentation colors are never rewritten.

## Catalog

| Theme | Base | Primary | Accent |
| --- | --- | --- | --- |
| Edge | CyberHUD Edge | Cyan | Yellow |
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
presentation colors changed. Edge remains the original CyberHUD palette.

The selected demo theme persists locally in the browser. Edge is the default.
Changing the theme recolors semantic demo content and each slide's scene
background. A subsequent manual scene-background edit applies to the current
slide and is preserved as document content.
