import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  PRISMDECK_SCHEMA_VERSION,
  loadPrismDeck,
  savePrismDeck,
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
});
