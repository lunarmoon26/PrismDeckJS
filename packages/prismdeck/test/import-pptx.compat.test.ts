// @vitest-environment jsdom

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { describe, expect, test } from 'vitest';
import { importPptx, validateDeckDocument } from '../src/index';

const samplePath = process.env.PRISMDECK_COMPAT_SAMPLE_PPTX;
const templatePath = process.env.PRISMDECK_COMPAT_TEMPLATE_PPTX;

async function readInput(path: string): Promise<{ bytes: Uint8Array; buffer: ArrayBuffer }> {
  const bytes = await readFile(path);
  return {
    bytes,
    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}

describe.runIf(Boolean(samplePath))('Dickinson PPTX sample', () => {
  test('imports slides, layouts, assets, notes, tables, and charts', async () => {
    const { bytes, buffer } = await readInput(samplePath!);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'ac7f2627645042190df3244cc25929f4b006d144fc2cac520e79ab376197bbbf',
    );

    const result = await importPptx(buffer, basename(samplePath!));
    validateDeckDocument(result.document);

    expect(result.document.kind).toBe('presentation');
    expect(result.document.slides).toHaveLength(9);
    expect(result.document.layouts).toHaveLength(10);
    expect(result.assets.size).toBeGreaterThan(0);
    expect(result.document.slides.some((slide) => Boolean(slide.notes))).toBe(true);
    expect(result.document.slides.some((slide) => slide.elements.some((element) => element.type === 'table'))).toBe(true);
    expect(result.document.slides.some((slide) => slide.elements.some((element) => element.type === 'chart'))).toBe(true);
  });
});

describe.runIf(Boolean(templatePath))('Dickinson PPTX template', () => {
  test('imports a zero-slide file as a reusable template', async () => {
    const { bytes, buffer } = await readInput(templatePath!);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '5dbca2b0714001a76edb6e7c8096ca2ef39fb6fcb02c0c89dd2ab6355075a9ff',
    );

    const result = await importPptx(buffer, basename(templatePath!));
    validateDeckDocument(result.document);

    expect(result.document.kind).toBe('template');
    expect(result.document.slides).toHaveLength(0);
    expect(result.document.layouts).toHaveLength(9);
  });
});
