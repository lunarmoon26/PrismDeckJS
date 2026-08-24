# PrismDeck element contract

Status: Implemented

The machine-readable contract is the `DeckElement` discriminated union in
`packages/prismdeck/src/document/types.ts`, validated at file boundaries by
`validateDeckDocument`, with the allowed type names mirrored in
`packages/prismdeck/schema/prismdeck.schema.json`.

| Type | Required content | Rendering |
| --- | --- | --- |
| `text` | Text plus font, size, weight, color, alignment, and line-height style | Aspect-correct Canvas2D surface or Three.js texture |
| `image` | Packaged asset ID plus contain/cover/fill mode | Canvas2D image surface or Three.js texture |
| `shape` | Rectangle, rounded rectangle, ellipse, line, or custom shape with fill/stroke | Canvas2D primitive surface or Three.js texture |
| `table` | Proportional columns and rows plus positioned cells, spans, header semantics, text, fill, borders, padding, and alignment | Canvas2D surface or Three.js texture; semantic HTML table in exported viewers |
| `chart` | One or more typed plots, semantic data points, axes, legend, labels, number formats, and presentation styles | Ephemeral ECharts SVG rasterized into a Canvas2D surface or Three.js texture; semantic data table in exported viewers |
| `unsupported` | Human-readable reason and optional fallback text | Visible diagnostic fallback |

Groups are not document elements. Importers flatten supported group children into
slide coordinates and emit structured warnings for unsupported grouped content.

Chart plots cover category, XY, bubble, stock, hierarchy, distribution, and
combination-chart data without storing ECharts options. Plot axis references are
local document IDs, not source OOXML or ODF objects. Runtime formatter callbacks
and renderer-specific gradients are derived from declarative styles and number
formats.

Table cells identify their starting column and optional row/column spans. Merged
continuation cells are not stored. Column widths and row heights are relative
weights, so a table remains editable and scales with its element frame.

Version `0.2.0` owns these exact chart and table shapes. Package boundaries
migrate `0.1.0` category/series charts and string-matrix tables into the semantic
model before validation; newly saved packages always use `0.2.0`.

## Planar and extruded elements

`thickness` is optional. Omitted or zero thickness renders as a flat, unlit
double-sided plane; a positive value opts into an extruded, lit box. An extruded
ellipse whose physics collider is `ball` renders as a lit sphere sized to the
same scaled minimum face dimension as its Rapier collider. Position, rotation,
scale, opacity, picking, stereo projection, and render order apply to both forms.

When the host supplies an overlay canvas, a slide uses the Canvas2D presentation
surface only when every visible element is flat at `z: 0`, has zero X/Y rotation,
and has no physics. Otherwise all elements use Three.js so spatial depth and
occlusion stay consistent. Rotation Z, scale, opacity, render order, mono/SBS
projection, picking, and capture work in the flat Canvas2D path.

PPTX and ODP importers omit thickness, so imported text, images, shapes, tables,
and charts remain 2D presentation surfaces by default. Spatial depth (`z`) is
independent from extrusion and can still separate planar layers.

## Scene background

`DeckSlide.background` is the scene clear color, not an element or a geometry
layer. It therefore cannot cover elements at negative depth. Studio can edit the
current slide's scene color, and a newly created slide inherits the current
slide's background unless the caller provides an explicit color.
