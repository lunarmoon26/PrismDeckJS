# HTML export and DeepSeek Harness

Status: Implemented

## Contract

A PrismDeck HTML export is one `.html` file containing the complete validated
`.prismdeck` archive as inert base64 data. The document and every asset therefore
travel together and can be imported back into PrismDeck Studio for editing.

The viewer imports the version-pinned `prism-deck.min.js` ES module from
jsDelivr, creates one `DeckPlayer`, and provides previous/next controls plus
keyboard navigation. Three.js, the Canvas2D presentation layer, and the
non-physics PrismDeck runtime load from that module. Viewing requires network
access to the CDN; presentation data and assets do not leave the file.
The browser bundle replaces dependency development guards at build time and
does not require Node.js globals such as `process`.

The viewer synchronizes an off-screen semantic section with the active slide.
Text remains text, presentation tables become native HTML tables with header and
span semantics, and each chart exposes a caption plus a data table. This layer is
derived only from validated document data and uses DOM text APIs rather than
interpreting imported markup.

Importing HTML never executes scripts from the file. PrismDeck extracts only its
exact inert data marker, then applies the normal archive limits, digest checks,
and document validation. Arbitrary HTML files are rejected.

## Studio and command-line flow

- Studio imports `.html`/`.htm` alongside PPTX, ODP, and `.prismdeck` files.
- **Export HTML** downloads the current editable session as a single HTML file.
- `npm run export:html -- input.json output.html` validates a standalone
  `DeckDocument` JSON file and writes the same HTML format with no binary assets.

## DeepSeek Harness flow

DeepSeek Harness treats the repository root as a normal workspace and loads
`AGENTS.md`; no Harness-specific profile or plugin manifest is required. For a
deck-generation prompt, the agent:

1. turns the requested narrative into a concise multi-slide structure;
2. writes a `DeckDocument` matching
   `packages/prismdeck/schema/prismdeck.schema.json`;
3. runs the HTML export command; and
4. names the generated `.html` path in its final response so Harness exposes it
   as a produced file.

`examples/deepseek-harness/deck.json` is the copyable two-slide starting point;
`apps/studio/src/demo.ts` shows additional element shapes and spatial transforms.
Generated artifacts belong under `generated/`, which remains untracked.

## Non-goals

- The HTML path does not generate OOXML `.pptx` files.
- The command-line JSON path does not package external image files; image-rich
  decks should be assembled in Studio or through the public `LoadedDeck` API.
- The initial HTML format does not inline the PrismDeck runtime for offline use.

## Acceptance

- A deck with a binary asset round-trips through HTML without data loss.
- Studio exports and re-imports HTML without executing file-authored code.
- The viewer resizes and composites its WebGL and Canvas2D surfaces together.
- Screen readers receive active-slide chart and table semantics even though the visual presentation uses canvases.
- The npm package contains `dist/prism-deck.min.js` and identifies it as its
  jsDelivr/unpkg browser entry.
- Browser tests open a generated HTML export against the built browser entry and
  require the presentation canvas and first-slide navigation state to load with
  no console or page errors.
- A published GitHub release validates, tests, builds, packs, and publishes the
  `prismdeckjs` workspace package with npm provenance.
