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
      layouts: [],
      slides: [
        {
           id: 'slide-1',
           name: 'Slide 1',
           durationMs: 5_000,
           transition: { type: 'fade', durationMs: 350 },
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
});

describe('PrismDeck HTML package', () => {
  test('round-trips the document and binary assets through one HTML file', async () => {
    const source = fixture();
    const saved = await savePrismDeckHtml(source);
    const html = await saved.text();
    const loaded = await loadPrismDeckHtml(new TextEncoder().encode(html));

    expect(saved.type).toBe('text/html;charset=utf-8');
    expect(html).toContain(DEFAULT_PRISMDECK_CDN_URL);
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
