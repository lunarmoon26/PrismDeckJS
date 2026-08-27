import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  DEFAULT_PRISMDECK_CDN_URL,
  PRISMDECK_SCHEMA_VERSION,
  importPresentation,
  loadPrismDeck,
  loadPrismDeckHtml,
  savePrismDeck,
  savePrismDeckHtml,
  validateDeckDocument,
  type LoadedDeck,
} from '../src/index';

function fixture(): LoadedDeck {
  return {
    document: {
      schemaVersion: PRISMDECK_SCHEMA_VERSION,
      id: 'archive-deck',
      kind: 'presentation',
      metadata: { title: 'Archive test', sourceFormat: 'native' },
      size: { width: 1600, height: 900 },
      backgroundScene: {
        type: 'galaxy',
        seed: 815,
        starCount: 1_000,
        rotationDegreesPerSecond: -0.55,
        coreColor: '#FFE0B8',
        armColor: '#6CCBFF',
         solColor: '#FFF2A8',
         backdropAssetId: 'pixel',
         solarSystem: { textureAssetIds: { earth: 'pixel' } },
      },
      layouts: [],
      slides: [
        {
           id: 'slide-1',
           name: 'Slide 1',
           durationMs: 5_000,
           transition: { type: 'fade', durationMs: 350 },
           backgroundCamera: {
             x: 2,
             y: -1,
             z: 0,
             distance: 0.8,
             view: 'horizon',
             focusBody: 'earth',
             orbitAzimuthDegrees: 32,
             orbitElevationDegrees: 0,
             transitionDurationMs: 900,
           },
           background: '#FFFFFF',
          elements: [
            {
              id: 'title',
              type: 'text',
              name: 'Title',
              frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
              transform: { ...DEFAULT_TRANSFORM },
              opacity: 1,
              visible: true,
              renderOrder: 0,
              text: 'Round trip',
              style: { ...DEFAULT_TEXT_STYLE },
            },
            {
              id: 'table',
              type: 'table',
              name: 'Results table',
              frame: { x: 0.1, y: 0.35, width: 0.38, height: 0.3 },
              transform: { ...DEFAULT_TRANSFORM },
              opacity: 1,
              visible: true,
              renderOrder: 1,
              columns: [2, 1],
              rows: [
                { height: 1, cells: [{ column: 0, columnSpan: 2, text: 'Results', header: true }] },
                { height: 1, cells: [{ column: 0, text: 'Revenue' }, { column: 1, text: '42' }] },
              ],
              style: {
                fill: '#FFFFFF',
                textStyle: { ...DEFAULT_TEXT_STYLE },
                borders: {
                  top: { color: '#78716C', width: 1, style: 'solid' },
                  right: { color: '#78716C', width: 1, style: 'solid' },
                  bottom: { color: '#78716C', width: 1, style: 'solid' },
                  left: { color: '#78716C', width: 1, style: 'solid' },
                },
              },
            },
            {
              id: 'chart',
              type: 'chart',
              name: 'Revenue chart',
              frame: { x: 0.52, y: 0.35, width: 0.38, height: 0.3 },
              transform: { ...DEFAULT_TRANSFORM },
              opacity: 1,
              visible: true,
              renderOrder: 2,
              title: 'Revenue',
              axes: [
                { id: 'category', kind: 'category', position: 'bottom', visible: true },
                { id: 'value', kind: 'value', position: 'left', visible: true },
              ],
              plots: [
                {
                  type: 'bar',
                  direction: 'column',
                  grouping: 'clustered',
                  axisIds: ['category', 'value'],
                  series: [{ name: 'Sales', color: '#2563EB', points: [{ label: 'Q1', value: 42 }] }],
                },
              ],
            },
          ],
        },
      ],
    },
    assets: new Map([
      [
        'pixel',
        { id: 'pixel', fileName: 'pixel.png', mimeType: 'image/png', data: new Uint8Array([137, 80, 78, 71]) },
      ],
    ]),
  };
}

describe('.prismdeck archive', () => {
  test('round-trips the normalized document and assets', async () => {
    const source = fixture();
    const saved = await savePrismDeck(source);
    const loaded = await loadPrismDeck(await saved.arrayBuffer());

    expect(loaded.document).toEqual(source.document);
    expect(loaded.assets.get('pixel')).toEqual(source.assets.get('pixel'));
  });

  test('rejects asset bytes that do not match the manifest digest', async () => {
    const saved = await savePrismDeck(fixture());
    const files = unzipSync(new Uint8Array(await saved.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as { assets: Array<{ path: string }> };
    files[manifest.assets[0]!.path] = strToU8('tampered');

    await expect(loadPrismDeck(zipSync(files))).rejects.toThrow(/Asset (size|digest) mismatch/);
  });

  test('migrates persisted 0.1.0 chart and table payloads', async () => {
    const legacyDocument = {
      schemaVersion: '0.1.0',
      id: 'legacy-deck',
      kind: 'presentation',
      metadata: { title: 'Legacy' },
      size: { width: 1600, height: 900 },
      layouts: [],
      slides: [{
        id: 'slide',
        name: 'Slide',
        durationMs: 5000,
        background: '#FFFFFF',
        elements: [
          {
            id: 'legacy-table', type: 'table', name: 'Table', frame: { x: 0, y: 0, width: 0.5, height: 0.5 },
            transform: { ...DEFAULT_TRANSFORM }, opacity: 1, visible: true, renderOrder: 0,
            rows: [['Header', 'Value'], ['A', '1']], headerRows: 1, fill: '#FFFFFF', stroke: '#111111',
            textStyle: { ...DEFAULT_TEXT_STYLE },
          },
          {
            id: 'legacy-chart', type: 'chart', name: 'Chart', frame: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
            transform: { ...DEFAULT_TRANSFORM }, opacity: 1, visible: true, renderOrder: 1,
            chartType: 'column', categories: ['A'], series: [{ name: 'Series', values: [3], color: '#2563EB' }],
          },
        ],
      }],
    };
    const manifest = { format: 'prismdeck', packageVersion: '0.1.0', document: 'deck.json', assets: [] };
    const loaded = await loadPrismDeck(zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'deck.json': strToU8(JSON.stringify(legacyDocument)),
    }));

    expect(loaded.document.schemaVersion).toBe(PRISMDECK_SCHEMA_VERSION);
    const migratedTable = loaded.document.slides[0]?.elements[0];
    expect(migratedTable).toMatchObject({ type: 'table', columns: [1, 1] });
    expect(migratedTable?.type === 'table' && migratedTable.rows[0]?.cells.map((cell) => cell.header)).toEqual([true, true]);
    expect(loaded.document.slides[0]?.elements[1]).toMatchObject({
      type: 'chart',
      plots: [{ type: 'bar', direction: 'column', series: [{ points: [{ label: 'A', value: 3 }] }] }],
    });
  });

  test('advances persisted 0.2.0 documents without changing slide content', async () => {
    const previousDocument = JSON.parse(JSON.stringify(fixture().document)) as Record<string, unknown>;
    previousDocument.schemaVersion = '0.2.0';
    delete previousDocument.backgroundScene;
    const slides = previousDocument.slides as Array<Record<string, unknown>>;
    delete slides[0]!.backgroundCamera;
    const manifest = { format: 'prismdeck', packageVersion: '0.2.0', document: 'deck.json', assets: [] };
    const loaded = await loadPrismDeck(zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'deck.json': strToU8(JSON.stringify(previousDocument)),
    }));

    expect(loaded.document.schemaVersion).toBe(PRISMDECK_SCHEMA_VERSION);
    expect(loaded.document.backgroundScene).toBeUndefined();
    expect(loaded.document.slides).toEqual(previousDocument.slides);
  });

  test('advances persisted 0.3.0 galaxy documents without changing slide content', async () => {
    const previousDocument = JSON.parse(JSON.stringify(fixture().document)) as Record<string, unknown>;
    previousDocument.schemaVersion = '0.3.0';
    const backgroundScene = previousDocument.backgroundScene as Record<string, unknown>;
    delete backgroundScene.solarSystem;
    const slides = previousDocument.slides as Array<{ backgroundCamera?: Record<string, unknown> }>;
    delete slides[0]!.backgroundCamera!.distance;
    delete slides[0]!.backgroundCamera!.view;
    delete slides[0]!.backgroundCamera!.focusBody;
    delete slides[0]!.backgroundCamera!.orbitAzimuthDegrees;
    delete slides[0]!.backgroundCamera!.orbitElevationDegrees;
    const manifest = { format: 'prismdeck', packageVersion: '0.3.0', document: 'deck.json', assets: [] };
    const loaded = await loadPrismDeck(zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'deck.json': strToU8(JSON.stringify(previousDocument)),
    }));

    expect(loaded.document.schemaVersion).toBe(PRISMDECK_SCHEMA_VERSION);
    expect(loaded.document.backgroundScene?.solarSystem).toBeUndefined();
    expect(loaded.document.slides).toEqual(previousDocument.slides);
  });

  test('rejects table cells that exceed the normalized grid', () => {
    const invalid = fixture().document;
    const table = invalid.slides[0]?.elements.find((element) => element.type === 'table');
    if (table?.type === 'table') table.rows[0]!.cells[0]!.columnSpan = 3;
    expect(() => validateDeckDocument(invalid)).toThrow(/invalid cell span/);
  });

  test('rejects overlapping normalized table cells', () => {
    const invalid = fixture().document;
    const table = invalid.slides[0]?.elements.find((element) => element.type === 'table');
    if (table?.type === 'table') table.rows[1]!.cells[1]!.column = 0;
    expect(() => validateDeckDocument(invalid)).toThrow(/overlapping cells/);
  });

  test('rejects executable fields in a declarative background scene', () => {
    const invalid = fixture().document as unknown as { backgroundScene: Record<string, unknown> };
    invalid.backgroundScene.fragmentShader = 'void main() {}';
    expect(() => validateDeckDocument(invalid)).toThrow('Invalid PrismDeck document');
  });

  test('rejects unsupported galaxy color syntax before rendering', () => {
    const invalid = fixture().document;
    invalid.backgroundScene!.armColor = 'not-a-color';
    expect(() => validateDeckDocument(invalid)).toThrow('Invalid PrismDeck document');
  });

  test('rejects background cameras outside the bounded scene range', () => {
    const invalid = fixture().document;
    invalid.slides[0]!.backgroundCamera!.x = 21;
    expect(() => validateDeckDocument(invalid)).toThrow('Invalid PrismDeck document');

    const invalidOrbit = fixture().document;
    invalidOrbit.slides[0]!.backgroundCamera!.orbitElevationDegrees = 79;
    expect(() => validateDeckDocument(invalidOrbit)).toThrow('Invalid PrismDeck document');
  });

  test('rejects unknown solar focus and texture keys', () => {
    const invalidFocus = fixture().document as unknown as { slides: Array<{ backgroundCamera: Record<string, unknown> }> };
    invalidFocus.slides[0]!.backgroundCamera.focusBody = 'pluto';
    expect(() => validateDeckDocument(invalidFocus)).toThrow('Invalid PrismDeck document');

    const invalidTexture = fixture().document as unknown as { backgroundScene: { solarSystem: { textureAssetIds: Record<string, unknown> } } };
    invalidTexture.backgroundScene.solarSystem.textureAssetIds.pluto = 'pixel';
    expect(() => validateDeckDocument(invalidTexture)).toThrow('Invalid PrismDeck document');
  });

  test('requires a solar system when a slide focuses a solar body', () => {
    const invalid = fixture().document;
    delete invalid.backgroundScene!.solarSystem;

    expect(() => validateDeckDocument(invalid)).toThrow('Invalid PrismDeck document');
  });

  test('requires a background scene when a slide declares a background camera', () => {
    const invalid = fixture().document;
    invalid.slides[0]!.backgroundCamera = { x: 0, y: 0, z: 0, view: 'top' };
    delete invalid.backgroundScene;

    expect(() => validateDeckDocument(invalid)).toThrow('Invalid PrismDeck document');
  });

  test('requires a focused body for an ecliptic-horizon camera', () => {
    const invalid = fixture().document;
    delete invalid.slides[0]!.backgroundCamera!.focusBody;

    expect(() => validateDeckDocument(invalid)).toThrow('Invalid PrismDeck document');
  });

  test('rejects focus-orbit angles outside an ecliptic-horizon camera', () => {
    const invalid = fixture().document;
    invalid.slides[0]!.backgroundCamera!.view = 'tilt';

    expect(() => validateDeckDocument(invalid)).toThrow('Invalid PrismDeck document');
  });
});

describe('PrismDeck HTML package', () => {
  test('round-trips the document and binary assets through one HTML file', async () => {
    const source = fixture();
    const saved = await savePrismDeckHtml(source);
    const html = await saved.text();
    const loaded = await loadPrismDeckHtml(new TextEncoder().encode(html));

    expect(saved.type).toBe('text/html;charset=utf-8');
    expect(html).toContain(DEFAULT_PRISMDECK_CDN_URL);
    expect(DEFAULT_PRISMDECK_CDN_URL).toBe('https://cdn.jsdelivr.net/npm/prismdeckjs@0.4.0/dist/prism-deck.min.js');
    expect(html).toContain('type="application/vnd.prismdeck+zip;base64"');
    expect(html).toContain('id="slide-semantics"');
    expect(html).toContain("document.createElement(cell.header ? 'th' : 'td')");
    expect(html).toContain('MAX_SEMANTIC_CELLS = 5000');
    expect(html).toContain('Additional chart or table data is omitted');
    expect(loaded.document).toEqual(source.document);
    expect(loaded.assets.get('pixel')).toEqual(source.assets.get('pixel'));
  });

  test('imports exported HTML through the presentation boundary', async () => {
    const saved = await savePrismDeckHtml(fixture());
    const imported = await importPresentation(await saved.arrayBuffer(), { sourceName: 'archive.html' });

    expect(imported.document.metadata.title).toBe('Archive test');
    expect(imported.report).toEqual({ format: 'prismdeck', sourceName: 'archive.html', warnings: [] });
  });

  test('rejects arbitrary HTML and insecure runtime URLs', async () => {
    await expect(loadPrismDeckHtml(strToU8('<script>globalThis.compromised = true</script>'))).rejects.toThrow(
      'Missing PrismDeck HTML data',
    );
    await expect(savePrismDeckHtml(fixture(), { runtimeUrl: 'http://example.com/prism-deck.min.js' })).rejects.toThrow(
      'must use HTTPS',
    );
  });
});
