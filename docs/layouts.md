# Default slide layouts

Status: Implemented

PrismDeck Studio's built-in starter deck provides the nine layouts in the
Western PowerPoint Office layout gallery:

| Layout | Placeholder roles |
| --- | --- |
| Title Slide | Center title, subtitle |
| Title and Content | Title, multipurpose content |
| Section Header | Section title, subtitle |
| Two Content | Title, two multipurpose content areas |
| Comparison | Title, two headings, two multipurpose content areas |
| Title Only | Title |
| Blank | None |
| Content with Caption | Caption title and text on the left, content on the right |
| Picture with Caption | Caption title and text on the left, picture on the right |

The catalog follows PowerPoint's familiar order and placeholder roles. Geometry
is normalized to the slide and uses the classic 5% outer margin, full-width title
band, and evenly divided content columns. Layout elements remain at `z: 0`, so a
new ordinary slide stays on the crisp Canvas2D path until the author explicitly
adds a spatial transform.

Microsoft documents layouts as theme-owned arrangements of placeholders and
identifies Title Slide, Title and Content, Comparison, and Picture with Caption
as predefined examples. The Office default gallery's complete Western set is
the nine layouts above. OOXML's `ST_SlideLayoutType` enumeration is broader: it
also describes historical object/chart/media combinations, custom layouts, and
two vertical-text layouts intended for Asian-language configurations. PrismDeck
does not advertise those vertical layouts because its current `TextStyle`
contract has no vertical writing mode.

Sources:

- [Microsoft: Apply a slide layout](https://support.microsoft.com/en-us/office/apply-a-slide-layout-158e6dba-e53e-479b-a6fc-caab72609689)
- [Office default layout gallery](https://www.indezine.com/products/powerpoint/learn/themes/2016/slide-layouts-slide-master.html)
- [OOXML `ST_SlideLayoutType`](https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_ST_SlideLayoutType_topic_ID0EKTIIB.html)

Imported PPTX and ODP documents retain their own normalized layouts instead of
having the starter catalog injected into them.

## Selection and resizing

Selecting an element projects its actual scene quad into the Studio stage and
draws an editor-only outline with four corner handles. Flat, zero-depth elements
with no X/Y/Z rotation, extrusion, or physics can be resized directly by dragging
a corner; the opposite corner stays fixed and the resulting frame remains inside
the normalized slide bounds. Reflected lines retain their drag direction.

Spatially transformed elements still receive the projected selection outline,
but their handles are disabled. Their size and orientation remain under the
Spatial Transformation inspector so a 2D corner drag cannot silently corrupt a
3D transform. Selection chrome is not part of Canvas2D/WebGL snapshots, package
data, or generated HTML output.
