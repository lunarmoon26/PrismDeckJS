import { DEFAULT_ARCHIVE_LIMITS, loadPrismDeck, savePrismDeck, type ArchiveLimits } from './archive';
import type { LoadedDeck } from './types';
import { PRISMDECK_PACKAGE_VERSION } from '../version';

export const PRISMDECK_HTML_MIME_TYPE = 'text/html;charset=utf-8' as const;
export const DEFAULT_PRISMDECK_CDN_URL =
  `https://cdn.jsdelivr.net/npm/prismdeckjs@${PRISMDECK_PACKAGE_VERSION}/dist/prism-deck.min.js` as const;

const DATA_OPEN = '<script id="prismdeck-data" type="application/vnd.prismdeck+zip;base64">';
const DATA_CLOSE = '</script>';
const BASE64_ENCODE_CHUNK_BYTES = 3 * 8192;
const BASE64_DECODE_CHARS = 4 * 8192;

export interface SavePrismDeckHtmlOptions {
  runtimeUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function moduleString(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += BASE64_ENCODE_CHUNK_BYTES) {
    const chunk = bytes.subarray(index, index + BASE64_ENCODE_CHUNK_BYTES);
    output += btoa(String.fromCharCode(...chunk));
  }
  return output;
}

function base64ToBytes(value: string, maxBytes: number): Uint8Array {
  const encoded = value.replace(/\s/g, '');
  if (encoded.length === 0 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Invalid PrismDeck HTML data');
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const byteLength = (encoded.length / 4) * 3 - padding;
  if (byteLength > maxBytes) throw new Error(`Archive exceeds ${maxBytes} compressed bytes`);

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (let index = 0; index < encoded.length; index += BASE64_DECODE_CHARS) {
    const binary = atob(encoded.slice(index, index + BASE64_DECODE_CHARS));
    for (let binaryIndex = 0; binaryIndex < binary.length; binaryIndex += 1) {
      bytes[offset++] = binary.charCodeAt(binaryIndex);
    }
  }
  return bytes;
}

function extractArchive(html: string, limits: ArchiveLimits): Uint8Array {
  const start = html.indexOf(DATA_OPEN);
  if (start < 0) throw new Error('Missing PrismDeck HTML data');
  const contentStart = start + DATA_OPEN.length;
  const end = html.indexOf(DATA_CLOSE, contentStart);
  if (end < 0) throw new Error('Invalid PrismDeck HTML data');
  if (html.indexOf(DATA_OPEN, end + DATA_CLOSE.length) >= 0) throw new Error('Ambiguous PrismDeck HTML data');
  return base64ToBytes(html.slice(contentStart, end), limits.maxCompressedBytes);
}

function viewerHtml(deck: LoadedDeck, archiveBase64: string, runtimeUrl: string): string {
  const title = escapeHtml(deck.document.metadata.title || 'PrismDeck presentation');
  const moduleUrl = moduleString(runtimeUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#151311;color:#f7f2ec}
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{display:grid;grid-template-rows:1fr auto}
    main{position:relative;min-height:0;background:radial-gradient(circle at 50% 40%,#36312c,#161412 72%)}
    canvas{display:block;width:100%;height:100%}.status{position:absolute;inset:0;display:grid;place-items:center;padding:2rem;text-align:center;background:#151311}
    nav{height:58px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 18px;border-top:1px solid #39342f;background:#211e1b}
    .title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.controls{display:flex;align-items:center;gap:10px}
    button{width:34px;height:34px;border:1px solid #514a44;border-radius:50%;background:#2b2723;color:#f7f2ec;font:700 16px inherit;cursor:pointer}
    button:disabled{opacity:.35;cursor:not-allowed}.count{justify-self:end;color:#aaa29c;font:12px ui-monospace,SFMono-Regular,monospace}
  </style>
</head>
<body>
  <main><canvas aria-label="Interactive 3D presentation canvas"></canvas><div class="status">Loading presentation…</div></main>
  <nav aria-label="Presentation controls"><div class="title"></div><div class="controls"><button type="button" data-action="previous" aria-label="Previous slide">←</button><button type="button" data-action="next" aria-label="Next slide">→</button></div><div class="count"></div></nav>
  ${DATA_OPEN}${archiveBase64}${DATA_CLOSE}
  <script type="module">
    const status = document.querySelector('.status');
    try {
      const PrismDeck = await import(${moduleUrl});
      const encoded = document.getElementById('prismdeck-data').textContent.trim();
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const deck = await PrismDeck.loadPrismDeck(bytes);
      const canvas = document.querySelector('canvas');
      const player = await PrismDeck.DeckPlayer.create(canvas, deck, { autoStart: true });
      const previous = document.querySelector('[data-action="previous"]');
      const next = document.querySelector('[data-action="next"]');
      const title = document.querySelector('.title');
      const count = document.querySelector('.count');
      const sync = () => {
        const index = player.session.currentSlideIndex;
        const total = player.session.document.slides.length;
        title.textContent = player.session.currentSlide?.name ?? player.session.document.metadata.title;
        count.textContent = total === 0 ? '0 / 0' : (index + 1) + ' / ' + total;
        previous.disabled = index <= 0;
        next.disabled = index < 0 || index >= total - 1;
      };
      previous.addEventListener('click', () => player.session.previous());
      next.addEventListener('click', () => player.session.next());
      player.session.addEventListener('change', sync);
      window.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') player.session.previous();
        else if (event.key === 'ArrowRight' || event.key === 'PageDown') player.session.next();
      });
      const resize = () => player.renderer.resize(canvas.clientWidth, canvas.clientHeight, false);
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      resize();
      sync();
      status.hidden = true;
      window.addEventListener('beforeunload', () => { observer.disconnect(); player.dispose(); }, { once: true });
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Unable to load this presentation';
    }
  </script>
</body>
</html>`;
}

export async function savePrismDeckHtml(
  deck: LoadedDeck,
  options: SavePrismDeckHtmlOptions = {},
): Promise<Blob> {
  const runtimeUrl = options.runtimeUrl ?? DEFAULT_PRISMDECK_CDN_URL;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(runtimeUrl);
  } catch {
    throw new Error('PrismDeck HTML runtime URL must be an absolute HTTPS URL');
  }
  if (parsedUrl.protocol !== 'https:') throw new Error('PrismDeck HTML runtime URL must use HTTPS');

  const archive = new Uint8Array(await (await savePrismDeck(deck)).arrayBuffer());
  return new Blob([viewerHtml(deck, bytesToBase64(archive), parsedUrl.href)], { type: PRISMDECK_HTML_MIME_TYPE });
}

export async function loadPrismDeckHtml(
  input: ArrayBuffer | Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<LoadedDeck> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const maxHtmlBytes = Math.ceil(limits.maxCompressedBytes / 3) * 4 + 1024 * 1024;
  if (bytes.byteLength > maxHtmlBytes) throw new Error(`HTML package exceeds ${maxHtmlBytes} bytes`);
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return loadPrismDeck(extractArchive(html, limits), limits);
}
