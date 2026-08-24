import { strFromU8, strToU8, unzipSync, zipSync, type UnzipFileInfo } from 'fflate';
import {
  PRISMDECK_MIME_TYPE,
  LEGACY_PRISMDECK_SCHEMA_VERSION,
  PRISMDECK_SCHEMA_VERSION,
  type DeckAsset,
  type DeckPackageManifest,
  type LoadedDeck,
} from './types';
import { migrateDeckDocument } from './validate';

export const DEFAULT_ARCHIVE_LIMITS = Object.freeze({
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntries: 4_000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
});

export interface ArchiveLimits {
  maxCompressedBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

function assertSafePath(path: string): void {
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`Unsafe archive entry path: ${path}`);
  }
}

export function unzipWithLimits(
  input: Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Record<string, Uint8Array> {
  if (input.byteLength > limits.maxCompressedBytes) {
    throw new Error(`Archive exceeds ${limits.maxCompressedBytes} compressed bytes`);
  }

  let entries = 0;
  let totalBytes = 0;
  return unzipSync(input, {
    filter(file: UnzipFileInfo) {
      assertSafePath(file.name);
      entries += 1;
      totalBytes += file.originalSize;
      if (entries > limits.maxEntries) throw new Error('Archive has too many entries');
      if (file.originalSize > limits.maxEntryBytes) throw new Error(`Archive entry is too large: ${file.name}`);
      if (totalBytes > limits.maxTotalBytes) throw new Error('Archive expands beyond the configured limit');
      return true;
    },
  });
}

async function sha256(data: Uint8Array): Promise<string> {
  const copied = new Uint8Array(data);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copied.buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function safeAssetFileName(asset: DeckAsset): string {
  const extension = asset.fileName.match(/\.[a-z0-9]{1,10}$/i)?.[0]?.toLowerCase() ?? '';
  return `${encodeURIComponent(asset.id)}${extension}`;
}

export async function savePrismDeck(deck: LoadedDeck): Promise<Blob> {
  const document = migrateDeckDocument(deck.document);

  const files: Record<string, Uint8Array> = {
    'deck.json': strToU8(JSON.stringify(document, null, 2)),
  };
  const manifest: DeckPackageManifest = {
    format: 'prismdeck',
    packageVersion: PRISMDECK_SCHEMA_VERSION,
    document: 'deck.json',
    assets: [],
  };

  for (const asset of deck.assets.values()) {
    const path = `assets/${safeAssetFileName(asset)}`;
    files[path] = asset.data;
    manifest.assets.push({
      id: asset.id,
      path,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      bytes: asset.data.byteLength,
      sha256: await sha256(asset.data),
    });
  }

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return new Blob([zipSync(files, { level: 6 })], { type: PRISMDECK_MIME_TYPE });
}

function parseJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path];
  if (!bytes) throw new Error(`Missing ${path}`);
  return JSON.parse(strFromU8(bytes)) as T;
}

export async function loadPrismDeck(
  input: ArrayBuffer | Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<LoadedDeck> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const files = unzipWithLimits(bytes, limits);
  const manifest = parseJson<Omit<DeckPackageManifest, 'packageVersion'> & { packageVersion: string }>(files, 'manifest.json');
  if (
    manifest.format !== 'prismdeck' ||
    (manifest.packageVersion !== PRISMDECK_SCHEMA_VERSION && manifest.packageVersion !== LEGACY_PRISMDECK_SCHEMA_VERSION)
  ) {
    throw new Error(`Unsupported PrismDeck package version: ${String(manifest.packageVersion)}`);
  }

  const document = migrateDeckDocument(parseJson<unknown>(files, manifest.document));
  const assets = new Map<string, DeckAsset>();

  for (const entry of manifest.assets) {
    assertSafePath(entry.path);
    const data = files[entry.path];
    if (!data) throw new Error(`Missing packaged asset: ${entry.path}`);
    if (data.byteLength !== entry.bytes) throw new Error(`Asset size mismatch: ${entry.id}`);
    if ((await sha256(data)) !== entry.sha256) throw new Error(`Asset digest mismatch: ${entry.id}`);
    assets.set(entry.id, {
      id: entry.id,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      data,
    });
  }

  return { document, assets };
}
