import { strFromU8 } from 'fflate';
import { loadPrismDeck, unzipWithLimits } from '../document/archive';
import { loadPrismDeckHtml } from '../document/html';
import type { ImportResult, SourceFormat } from '../document/types';
import { importOdp } from './odp';
import { importPptx } from './pptx';

export interface ImportPresentationOptions {
  sourceName?: string;
  format?: Extract<SourceFormat, 'pptx' | 'odp' | 'prismdeck'> | 'html';
}

function formatFromName(sourceName: string | undefined): ImportPresentationOptions['format'] | undefined {
  const extension = sourceName?.split('.').at(-1)?.toLowerCase();
  if (extension === 'pptx' || extension === 'odp') return extension;
  if (extension === 'prismdeck') return 'prismdeck';
  if (extension === 'html' || extension === 'htm') return 'html';
  return undefined;
}

function detectArchiveFormat(input: ArrayBuffer): ImportPresentationOptions['format'] {
  const files = unzipWithLimits(Uint8Array.from(new Uint8Array(input)));
  const mimeType = files.mimetype ? strFromU8(files.mimetype).trim() : undefined;
  if (mimeType === 'application/vnd.oasis.opendocument.presentation') return 'odp';
  if (files['ppt/presentation.xml']) return 'pptx';
  if (files['manifest.json'] && files['deck.json']) return 'prismdeck';
  throw new Error('Unsupported presentation archive');
}

export async function importPresentation(
  input: ArrayBuffer,
  options: ImportPresentationOptions = {},
): Promise<ImportResult> {
  const format = options.format ?? formatFromName(options.sourceName) ?? detectArchiveFormat(input);
  if (format === 'pptx') return importPptx(input, options.sourceName);
  if (format === 'odp') return importOdp(input, options.sourceName);
  const loaded = format === 'html' ? await loadPrismDeckHtml(input) : await loadPrismDeck(input);
  return {
    ...loaded,
    report: { format: 'prismdeck', sourceName: options.sourceName, warnings: [] },
  };
}

export { importOdp } from './odp';
export { importPptx } from './pptx';
