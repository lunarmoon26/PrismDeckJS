# PrismDeckJS

Browser-native spatial presentations with PPTX/ODP import, crisp Canvas2D slide
surfaces, Three.js depth, side-by-side stereo, and optional Rapier physics.

**[Open PrismDeck Studio](https://lunarmoon26.github.io/PrismDeckJS/)**

PrismDeckJS is independent from UnityPresentationFramework and CyberHUD. It
borrows lifecycle and resource-ownership lessons, but shares no runtime,
protocol, package format, or application code with either project.

## First release scope

- Import `.pptx`, zero-slide PowerPoint templates, and a focused `.odp` subset locally in the browser.
- Normalize imported content into a versioned `.prismdeck` JSON and asset bundle.
- Export one HTML file containing the editable deck and assets with Three.js playback.
- Render one authoritative scene in mono, full SBS, or half SBS.
- Render ordinary zero-depth slides with Canvas2D and spatial slides with Three.js.
- Insert pictures or draw text boxes, rectangles, rounded rectangles, ellipses, and lines from Studio's top Insert menu.
- Fill picture placeholders from local image files, move selected elements on the stage, and resize selected flat elements with corner handles.
- Edit per-element position, size, scale, opacity/alpha, depth, rotation, thickness, text placeholders, image fit/alt text, and physics settings through grouped inspector sections.
- Keep imported presentation surfaces planar by default; opt individual elements into extrusion.
- Play native `cut`, `fade`, and `slide` transitions with reduced-motion fallback.
- Treat each slide background as a scene clear color rather than occluding geometry.
- Create a slide from an imported PowerPoint layout.
- Report unsupported source features instead of silently dropping them.

Full PowerPoint authoring, legacy binary `.ppt`, cloud conversion, WebXR, and
CyberHUD integration are not first-release goals.

## Browser quick start

```ts
import { DeckPlayer, importPresentation } from 'prismdeckjs';

const deck = await importPresentation(await file.arrayBuffer(), {
  sourceName: file.name,
});
const player = await DeckPlayer.create(canvas, deck, {
  physics: true,
  autoStart: true,
  renderer: { overlayCanvas },
});
```

`DeckPlayer` advances physics once before rendering either stereo eye. Call
`player.dispose()` to release WebGL, textures, animation frames, and Rapier WASM
resources. `overlayCanvas` is an optional same-size canvas positioned above the
WebGL canvas; Studio and generated HTML provide it for crisp flat-slide output.

## Single-file HTML

```ts
import { savePrismDeckHtml } from 'prismdeckjs';

const html = await savePrismDeckHtml(deck);
```

The HTML embeds the complete validated `.prismdeck` archive and imports the
version-matched `prism-deck.min.js` browser module from jsDelivr. Studio can
re-import the HTML for editing. Presentation data stays in the file; viewing
requires network access to the CDN. See [`docs/html-export.md`](docs/html-export.md).

## Coding-agent adapters

PrismDeckJS packages one shared deck-authoring skill for Claude Code,
Codex/ChatGPT, OpenCode, Google Antigravity, and DeepSeek Harness. The adapters
delegate to the same validated HTML export path as the SDK and command line;
they do not maintain a second presentation model. See
[`docs/agent-adapters.md`](docs/agent-adapters.md) for installation and the tool
contract.

The browser module is also available directly:

```js
import * as PrismDeck from 'https://cdn.jsdelivr.net/npm/prismdeckjs@latest/dist/prism-deck.min.js';
```

| Output | Canvas | Per-eye logical projection |
| --- | ---: | ---: |
| Mono | 1920 × 1080 | 16:9 |
| Full SBS | 3840 × 1080 | 16:9 at 1920 × 1080 |
| Half SBS | 1920 × 1080 | 16:9 encoded at 960 × 1080 |

## Privacy and trust boundary

Import and package conversion happen on-device. PrismDeckJS does not upload
presentation bytes and never executes macros, OLE objects, embedded scripts, or
source application code. ZIP expansion limits, safe paths, schema validation,
and packaged-asset digests are enforced at file boundaries. See
[`SECURITY.md`](SECURITY.md).

## Development

```bash
npm install
npm run dev
npm run check
npm run test:e2e
npm run export:html -- examples/deepseek-harness/deck.json generated/deck.html
```

Studio opens with a fifteen-slide PrismDeck feature tour that exercises all nine
layouts, the original CyberHUD Edge palette, and six Office-compatible presentation palettes. Studio chrome remains
neutral, and theme selection never changes imported deck colors. See
[`docs/themes.md`](docs/themes.md), [`docs/transitions.md`](docs/transitions.md), the
[`default layouts`](docs/layouts.md), [`element contract`](docs/element-types.md), and the
[`PPTX/ODP feature matrix`](docs/import-compatibility.md#feature-matrix).

Run DeepSeek Harness from the repository root with either `dsh web` or
`dsh --profile headless "Create a presentation about …"`. Harness loads
`AGENTS.md`; its deck-generation path writes validated JSON and the produced HTML
under `generated/`.

Publishing a GitHub release runs `.github/workflows/npm-publish.yml`. The
repository requires an Actions secret named `NPM_TOKEN` with publish access to
`prismdeckjs`.

## Repository map

- `packages/prismdeck`: document contract, importers, runtime, renderer, stereo,
  optional physics, and thin coding-agent adapters.
- `apps/studio`: responsive React/Vite editor and presenter.
- `docs`: architecture, compatibility policy, and decisions.

## License

MIT. Third-party parser and renderer notices remain subject to their respective
licenses.
