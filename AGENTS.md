# AGENTS.md

## Commands

```bash
npm run check        # full gate: typecheck -> unit tests -> build (matches CI)
npm test             # unit tests only (vitest, runs only in packages/prismdeck)
npx vitest run test/import-pptx.test.ts   # single test file (from packages/prismdeck)
npm run test:e2e     # Playwright from root; boots its own studio server
npm run dev          # builds core, then studio Vite dev server
npm run export:html -- input.json output.html  # validate DeckDocument JSON and create editable viewer
```

CI (Node 24) runs `npm run check` plus e2e with chromium. There is **no lint/formatter config** — `check` is the only gate.

## Workspace layout

- `packages/prismdeck` (directory) is the npm package **`prismdeckjs`** — the names differ. `apps/studio` is private `@prismdeck/studio`. npm workspaces with a root lockfile.
- Studio consumes core from **source**, not dist: Vite alias and studio `tsconfig.json` paths both map `prismdeckjs` -> `packages/prismdeck/src/index.ts`. Core edits are picked up by studio dev/e2e/typecheck without rebuilding. `dist/` matters for publishing and the JSON-to-HTML command, which rebuilds core first.
- Studio has no unit tests; all vitest tests live in `packages/prismdeck/test`.
- Public API is re-exported through `packages/prismdeck/src/index.ts`; schema at `packages/prismdeck/schema/prismdeck.schema.json`.
- Core build emits both ESM/type declarations and CDN entry `dist/prism-deck.min.js`; optional Rapier stays in a separate lazy chunk.

## Agent adapters and deck generation

- Load `.agents/skills/develop-prismdeckjs/` before changing shared skills, harness manifests, package exports, or runtime adapters.
- `packages/prismdeck/skills/prismdeckjs/` owns the portable deck-generation workflow and its Node/Python script contract. OpenCode and Cordis code in `packages/prismdeck/src/opencode.ts` and `src/deepseek.ts` stays thin and delegates to those scripts.
- The repository is a Harness Alchemist monorepo adaptation: root marketplace manifests point at `packages/prismdeck`, while the published `prismdeckjs` package keeps the SDK at `.` and exposes host adapters at `./server`, `./opencode`, and `./deepseek`.
- For deck-generation prompts, turn the narrative into a multi-slide `DeckDocument`, starting from `examples/deepseek-harness/deck.json` and checking exact shapes against the schema. Write source JSON and HTML under ignored `generated/`.
- Run `npm run export:html -- generated/<name>.json generated/<name>.html`; do not hand-author the HTML wrapper. The command validates the document and embeds it for Studio re-import.
- Mention the exact generated `.html` path in the final response so the harness exposes it as a produced file.

## Testing gotchas

- No shared vitest config: jsdom is enabled per file with a `// @vitest-environment jsdom` pragma (DOM tests only); other tests run in node env.
- PPTX compatibility tests are opt-in and skip silently unless these env vars point at local files (SHA-256s are asserted, see `docs/import-compatibility.md`):
  ```text
  PRISMDECK_COMPAT_SAMPLE_PPTX=/absolute/path/Dickinson_Sample_Slides.pptx
  PRISMDECK_COMPAT_TEMPLATE_PPTX=/absolute/path/Dickinson_Template_red.pptx
  ```
- Playwright serves the studio itself on `127.0.0.1:4173` (reuses an existing local server); two chromium projects (desktop 1440×900 + Pixel 7). The spec asserts **zero console errors** — new warnings will fail e2e.

## Repo constraints

- All parsing/rendering happens browser-local; never execute macros, OLE objects, embedded scripts, or imported code (see `SECURITY.md`).
- HTML import reads only the exact inert PrismDeck data marker; never render or execute imported HTML markup.
- Source-format types must never leak into the public document contract; unsupported input features become structured import-report warnings, never silent drops.
- Loading a new deck/slide must deterministically dispose GPU, media, worker, and physics resources.
- Architecture details: `docs/architecture.md`; decisions in `docs/adr/`.

## Deploy quirk

GitHub Pages deploys `apps/studio/dist`; Vite base path becomes `/PrismDeckJS/` when `GITHUB_ACTIONS` is set (`apps/studio/vite.config.ts`). Don't hardcode absolute asset paths that break under the subpath.

GitHub release publication uses `.github/workflows/npm-publish.yml` and repository secret `NPM_TOKEN`; it versions and publishes only workspace package `prismdeckjs`.
