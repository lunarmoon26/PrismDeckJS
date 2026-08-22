# ADR 0001: Use a versioned JSON and asset package

Status: accepted

## Decision

PrismDeckJS persists normalized presentations as `.prismdeck` ZIP archives with
`manifest.json`, `deck.json`, and content-addressable files under `assets/`.
Coordinates are normalized to the slide rectangle; depth is expressed as a
fraction of slide height.

## Rationale

JSON has direct TypeScript and JSON Schema support, while a ZIP container keeps
large binary media out of the document tree. A source-independent contract lets
PPTX and ODP adapters evolve without invalidating saved presentations.

## Consequences

Import is not a lossless OOXML/ODF round trip. Source provenance and warnings are
retained, but unsupported source constructs may be flattened or omitted. Schema
version changes require explicit migration.
