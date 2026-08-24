# Import compatibility

## Supported first-release path

PPTX import targets text, pictures, basic shapes, groups flattened into slide
space, semantic tables, classic OOXML charts and combinations, themes, masters,
layouts, speaker notes, and placeholder inheritance. Complex DrawingML can use a
visible rectangular custom fallback; unsupported media and chart effects use
structured warnings.

ODP import targets `draw:page`, master-page dimensions, text frames, images,
rectangles, ellipses, lines, groups, semantic tables, and packaged ODF chart
objects with local cached data. ODF animations and unsupported embedded object
types remain structured source warnings.

## Feature matrix

The canonical normalized element types are documented in
[`element-types.md`](element-types.md). “Warning” means the importer preserves a
visible fallback or the supported subset and adds a structured import warning.

| Source feature | PPTX | ODP |
| --- | --- | --- |
| Slide size and background | Supported, including 4:3 fitting and theme/master fallback | Supported from page layout and drawing-page style |
| Text and placeholders | Supported; common theme font/color and placeholder inheritance | Supported text frames and presentation placeholders |
| Packaged images | PNG/JPEG and browser-decodable media supported; EMF/WMF warn and use a fallback | Browser-decodable packaged images supported; missing data uses a fallback |
| Basic shapes | Rectangle, rounded rectangle, ellipse, and line presets supported; other presets use a rectangular `custom` fallback | Rectangle, ellipse/circle, and line supported; custom-shape content uses a rectangular `custom` fallback |
| Groups | Supported children flattened into slide coordinates; grouped tables/charts warn | Supported children flattened; partial transforms warn |
| Tables | Column/row dimensions, merged cells, headers, direct fills, borders, padding, alignment, and text styles supported; predefined table styles are partial | Repetition, dimensions, merged cells, headers, direct fills, borders, padding, alignment, and text styles supported |
| Charts | Classic bar/column, line, area, pie, doughnut, radar, scatter, bubble, stock, surface, combinations, secondary axes, cached data, labels, legend, markers, number formats, and blanks supported | Packaged bar/column, line, area, pie/ring, radar, scatter, bubble, stock, and surface charts with local table data, titles, legends, axes, and common styles supported |
| Masters/layouts | Masters, layouts, themes, and zero-slide templates supported | Master pages, page dimensions, and zero-slide templates supported |
| Speaker notes | Supported | Supported |
| Source animations/transitions | Not imported; warning emitted when timing exists | Not imported; warning emitted when timing exists |

All imported elements are planar at `z: 0` by default. Importers preserve source
stacking with `renderOrder` and do not invent spatial depth or thickness. This
keeps ordinary presentation slides eligible for the crisp Canvas2D rendering
path; adding depth, X/Y tilt, extrusion, or physics moves the slide to WebGL.
Native PrismDeck documents can use `cut`, `fade`, and `slide` destination-entry
transitions; source-format transition mapping remains unsupported.

Classic Office three-dimensional charts are represented by deterministic 2D
plots and emit approximation warnings. Modern PPTX ChartEx families such as
waterfall, histogram, Pareto, box-and-whisker, treemap, sunburst, funnel, and
region map are represented by the normalized contract and renderer but remain an
import-adapter follow-up. ODP external objects and linked chart data are never
fetched; only packaged `Object*/content.xml` chart data is read.
PPTX and ODP table/chart expansion is bounded before normalized arrays are
constructed; inputs beyond those resource limits are truncated with a structured
import warning.

Studio's top Insert menu adds local pictures or arms direct-drawing tools for text
boxes, rectangles, rounded rectangles, ellipses, and lines. Choosing a picture
while a picture placeholder or image is selected fills or replaces it; otherwise
Studio adds a new image to the current slide. Selected elements move directly on
the stage, and flat selected elements resize through projected corner handles.
Grouped inspector sections edit slide backgrounds and transitions, frame
position and size, scale, layer opacity/alpha, text size/color/alignment, image fit/alternative text,
shape fill/stroke, and optional spatial and physics settings without changing the
normalized source contract. The built-in starter deck provides the nine standard
Western PowerPoint layouts documented in [`layouts.md`](layouts.md); imported
decks continue to use their own layouts.
Local picture insertion accepts PNG, JPEG, WebP, GIF, and SVG files up to
32 MB, 8192 pixels per side, and 40 megapixels.

## Local Dickinson compatibility corpus

The original files remain outside git. Tests opt in through:

```text
PRISMDECK_COMPAT_SAMPLE_PPTX=/absolute/path/Dickinson_Sample_Slides.pptx
PRISMDECK_COMPAT_TEMPLATE_PPTX=/absolute/path/Dickinson_Template_red.pptx
```

Expected SHA-256 values:

```text
ac7f2627645042190df3244cc25929f4b006d144fc2cac520e79ab376197bbbf  Dickinson_Sample_Slides.pptx
5dbca2b0714001a76edb6e7c8096ca2ef39fb6fcb02c0c89dd2ab6355075a9ff  Dickinson_Template_red.pptx
```

The sample deck establishes coverage for 4:3 fitting, nine slides, inherited
placeholder geometry, two themes, ten layouts, EMF/JPEG/PNG media, notes, a
table, and a stacked column chart backed by an embedded workbook. The template
establishes that zero-slide files with masters and layouts import as templates
and can instantiate a new slide.
