# PrismDeckJS

Browser-native spatial presentations with PPTX/ODP import, editable depth,
Three.js rendering, side-by-side stereo, and optional Rapier physics.

**[Open PrismDeck Studio](https://lunarmoon26.github.io/PrismDeckJS/)**

PrismDeckJS is independent from UnityPresentationFramework and CyberHUD. It
borrows lifecycle and resource-ownership lessons, but shares no runtime,
protocol, package format, or application code with either project.

## First release scope

- Import `.pptx`, zero-slide PowerPoint templates, and a focused `.odp` subset locally in the browser.
- Normalize imported content into a versioned `.prismdeck` JSON and asset bundle.
- Render one authoritative scene in mono, full SBS, or half SBS.
- Edit per-element depth, rotation, thickness, text placeholders, and physics settings.
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
});
```

`DeckPlayer` advances physics once before rendering either stereo eye. Call
`player.dispose()` to release WebGL, textures, animation frames, and Rapier WASM
resources.

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
```

The Dickinson College sample files are optional local compatibility inputs and
are not redistributed by this repository. See
[`docs/import-compatibility.md`](docs/import-compatibility.md).

## Repository map

- `packages/prismdeck`: document contract, importers, runtime, renderer, stereo,
  and optional physics.
- `apps/studio`: responsive React/Vite editor and presenter.
- `docs`: architecture, compatibility policy, and decisions.

## License

MIT. Third-party parser and renderer notices remain subject to their respective
licenses.
