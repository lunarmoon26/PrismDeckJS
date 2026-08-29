# Element animation timelines

Status: Accepted

PrismDeck 0.6.0 stores optional per-slide element timelines. The machine-readable
shape is `DeckSlide.timeline` in `packages/prismdeck/schema/prismdeck.schema.json`
and the exported types in `packages/prismdeck/src/document/types.ts`.

## Scope

A timeline contains ordered clips that reference stable normalized element IDs on
the same slide. A clip never stores PowerPoint, ODF, browser-animation, or script
objects. The supported first-release effects are:

| Kind | Effect | Runtime behavior |
| --- | --- | --- |
| `entrance` | `fade` | Starts hidden at zero opacity and resolves to the authored element state. |
| `emphasis` | `pulse` | Scales the authored element to 1.08 and back without changing its authored state. |
| `exit` | `fade` | Resolves from the authored state to hidden at zero opacity. |
| `motion` | `path` | Moves along a linear path of normalized slide-relative offsets. |

`motion.path.from` and `motion.path.to` are `{ x, y }` offsets in slide-width and
slide-height fractions. They add to the element's authored frame without mutating
the persisted document. For example, `{ "x": 0, "y": 0 }` to `{ "x": 0.2,
"y": -0.1 }` moves an element right by one fifth of the slide and up by one tenth.

Every clip provides a stable `id`, `targetId`, `kind`, `effect`, `trigger`,
`delayMs`, `durationMs`, `easing`, `repeat`, and `fill`. Motion clips additionally
provide `path`; other kinds do not. `delayMs` and `durationMs` are bounded from 0
through 600,000 milliseconds, and path coordinates are bounded from -10 through
10. `repeat` is an integer from 1 through 100. Easing is `linear`,
`ease-in`, `ease-out`, or `ease-in-out`. Fill is `hold` or `remove`: `hold` keeps
the clip's final state, while `remove` restores the authored state after it ends.

On a slide with a timeline, element and clip IDs are unique. Timeline targets
resolve to an authored-visible, non-physics element on that slide. Validation
rejects duplicate IDs, more than one entrance per element, unresolved targets,
malformed paths, and invalid kind/effect combinations before rendering or
packaging.

## Ordering and playback

The clip array is the deterministic ordering source. At slide entry, an
`on-enter` clip starts the initial group. `with-previous` shares the preceding
clip's group start, and `after-previous` starts after the preceding clip finishes
including its delay and repetitions. An `on-click` clip starts the next explicit
advance group. Clips following it with `with-previous` or `after-previous` stay in
that group. `PresentationSession.advance()` reveals the next pending click group;
after all groups are revealed it performs normal next-slide navigation. Direct
`next()` and `previous()` always navigate and reset the destination timeline.

`PresentationSession` owns one monotonic slide timeline clock. Play, pause,
seek, slide replacement, deck replacement, and rapid navigation all use that
clock. `DeckPlayer` evaluates the active timeline once before rendering; mono and
both stereo eyes therefore observe the same state. Rebuilding a slide, loading a
deck, detaching a renderer, or disposing a player cancels timeline state and
restores only the newly active slide's authored state.

Timed slide duration remains independent from element clips. It can advance a
slide even when a later click group has not been revealed. A zero-duration slide
with one or more click groups is manual: each `advance()` reveals one group, and
the next call after the last group navigates. A zero-duration slide with no click
groups retains legacy immediate timed navigation.

## Reduced motion and capture

When `prefers-reduced-motion: reduce` matches, triggered groups resolve
immediately to their end state while retaining the same click-group boundaries.
Fill behavior still applies, so a `remove` clip restores its authored state after
its instantaneous completion. This avoids animated motion without skipping
content ordering.

`DeckRenderer.snapshotCanvas()` captures the current evaluated timeline state. It
does not tick the presentation session or advance wall-clock time; callers that
need a specific frame seek the session first and render once.

## Import mapping

PPTX `p:timing` and ODF/SMIL `anim:*` map only the table below. Importers resolve
the source target to a normalized element ID and preserve the clip's source part
in any warning. Unsupported effects, trigger structures, paths, or unresolved
targets remain visible as structured import warnings with slide, element when
known, and source-part context.

| Normalized clip | PPTX subset | ODF/SMIL subset |
| --- | --- | --- |
| `entrance` fade | `p:animEffect` fade targeting one shape | `anim:animate` opacity from `0` to `1` |
| `emphasis` pulse | `p:animScale` targeting one shape | `anim:animateTransform` scale 1 to 1.08 |
| `exit` fade | `p:animEffect` fade targeting one shape | `anim:animate` opacity from `1` to `0` |
| `motion` path | `p:animMotion` simple `M`/`L` path | `anim:animateMotion` simple `M`/`L` path |

Importers map supported `on-click`, `with-previous`, and `after-previous`
timing. Source transition filters, commands, scripts, macros, arbitrary effect
names, rotation, skew, non-linear paths, multi-target behaviors, and unresolved
targets are never executed or represented as source-specific document data.

## Persistence

Timelines are ordinary validated document data. `.prismdeck` archives and
single-file HTML embed the complete document archive, so they preserve timelines
exactly. Documents from 0.1.0 through 0.5.0 migrate with no timeline; newly saved
documents use 0.6.0.
