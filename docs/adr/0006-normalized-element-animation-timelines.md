# ADR 0006: Evaluate normalized element timelines from the presentation clock

Status: accepted

Related: [issue #1](https://github.com/lunarmoon26/PrismDeckJS/issues/1),
[element animation timelines](../animations.md)

## Context

Element effects arrive from source formats with incompatible timing graphs,
target identifiers, and effect vocabularies. PrismDeck persists one source-free
document model and renders one Three.js scene for mono and stereo output. A
timeline must remain deterministic through seeking, navigation, capture, reduced
motion, and renderer disposal without executing imported behavior.

## Decision

Persist a bounded normalized timeline on each slide and evaluate it from the
single `PresentationSession` clock immediately before `DeckRenderer` renders. The
renderer applies evaluated state to its active objects and Canvas2D overlay once;
both stereo eyes render that same state. Import adapters translate only the
documented source subsets and report all unsupported source timing as structured
warnings.

## Alternatives considered

### Browser or Web Animations API state

- Helps declarative DOM animation.
- Duplicates timing state outside the session, is difficult to seek and capture
  deterministically, and does not provide one stereo scene state.

### Persist source timing trees

- Preserves more source detail.
- Leaks OOXML and ODF types into the public contract and requires source-specific
  runtime behavior.

### Normalized clip evaluator

- Keeps the persisted model bounded and source-free.
- Supports a single deterministic renderer state with explicit resource
  lifecycle.
- Intentionally limits first-release source fidelity.

## Consequences

- Positive: archive and HTML preservation are automatic after schema validation,
  and source import behavior stays locally inspectable through reports.
- Positive: reduced motion, capture, seeking, mono, and stereo use the same
  evaluated state.
- Negative: rich source animation graphs and non-linear paths remain warnings.
- Follow-up: add effects only by extending the normalized contract and mapping
  them in both import adapters with deterministic tests.

## Confirmation

- Schema/type validation rejects malformed clips and unresolved targets.
- Session, renderer, archive/HTML, PPTX, and ODP tests cover the documented
  contract and lifecycle paths.
