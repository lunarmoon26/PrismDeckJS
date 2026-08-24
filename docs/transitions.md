# Slide transitions

Status: Implemented

A slide may define an optional destination-entry transition:

```json
{
  "transition": {
    "type": "fade",
    "durationMs": 420
  }
}
```

`type` is `cut`, `fade`, or `slide`. `durationMs` is between 0 and 10,000. An
omitted transition behaves as `cut`; `cut` and a zero duration change slides
immediately. `fade` reveals the destination canvas, while `slide` brings it in
from the right. Transitions apply to manual and timed navigation in mono and SBS
output. Browsers requesting reduced motion receive an immediate cut.

The transition is persisted in `.prismdeck` and single-file HTML output. PPTX
and ODP transition and element-animation timing are not mapped in this release;
importers continue to report unsupported timing instead of silently claiming
fidelity.
