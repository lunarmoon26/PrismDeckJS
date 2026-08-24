# ADR 0003: Keep charts and tables semantic

Status: accepted

## Decision

PrismDeckJS stores charts and tables as source-independent semantic document
data. Chart plots, axes, series points, labels, and presentation styles are
translated into ephemeral Apache ECharts options only while rendering. ECharts
options, callbacks, and renderer objects never enter the persisted contract.

Tables retain an engine-owned grid with proportional dimensions, spans, header
semantics, cell styles, and text. The visual renderer consumes that grid for
Canvas2D and WebGL surfaces; exported HTML also exposes equivalent native table
semantics to assistive technology.

The chart renderer uses Apache ECharts under its Apache-2.0 license. It produces
a fixed-size, non-animated SVG surface that is rasterized into the renderer's
owned canvas texture and disposed immediately. PrismDeck owns the accessible
chart description and data table because canvas and texture output do not retain
renderer-provided ARIA metadata.

## Rationale

PPTX and ODP describe chart and table semantics rather than a JavaScript chart
library configuration. A normalized contract keeps saved documents editable,
serializable, deterministic, and independent from source formats and ECharts
versions. SVG rendering avoids persistent chart instances, resize observers, and
additional scene state while serving both flat and spatial rendering paths.

Native presentation tables are layout content, not interactive data grids. An
owned grid can preserve merged cells and Office dimensions without introducing a
second application-state system.

## Consequences

Chart and table fidelity depends on importer mapping and the PrismDeck renderer,
not on storing source XML or vendor options. Unsupported source effects produce
structured import warnings. Three-dimensional Office effects and region maps
without packaged geography use deterministic two-dimensional approximations.

Schema version `0.2.0` introduces the semantic shapes. Package loading and saving
migrate persisted `0.1.0` chart and table elements before validation.
