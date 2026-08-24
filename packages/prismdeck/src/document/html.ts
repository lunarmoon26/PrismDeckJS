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
    canvas{display:block;position:absolute;inset:0;width:100%;height:100%}canvas.overlay{pointer-events:none}.status{position:absolute;inset:0;display:grid;place-items:center;padding:2rem;text-align:center;background:#151311}.status[hidden]{display:none}
    .sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    nav{min-height:58px;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(52px,1fr);align-items:center;padding:8px 18px;border-top:1px solid #39342f;background:#211e1b}
    .title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.controls{display:flex;align-items:center;gap:10px}
    button{width:34px;height:34px;border:1px solid #514a44;border-radius:50%;background:#2b2723;color:#f7f2ec;font:700 16px inherit;cursor:pointer}
    button:disabled{opacity:.35;cursor:not-allowed}.output-mode{height:34px;border:1px solid #514a44;border-radius:4px;background:#2b2723;color:#f7f2ec;padding:0 8px;font:600 11px ui-sans-serif,system-ui,sans-serif}.count{justify-self:end;color:#aaa29c;font:12px ui-monospace,SFMono-Regular,monospace}
    @media(max-width:640px){nav{grid-template-columns:1fr auto;padding-inline:10px}.title{display:none}.controls{justify-self:start;gap:6px}.output-mode{max-width:112px}.count{padding-left:8px}}
  </style>
</head>
<body>
  <main><canvas class="webgl" aria-label="Interactive 3D presentation canvas" aria-describedby="slide-semantics"></canvas><canvas class="overlay" aria-hidden="true"></canvas><section class="sr-only" id="slide-semantics" aria-live="polite" aria-label="Current slide content"></section><div class="status">Loading presentation…</div></main>
  <nav aria-label="Presentation controls"><div class="title"></div><div class="controls"><button type="button" data-action="previous" aria-label="Previous slide">←</button><button type="button" data-action="next" aria-label="Next slide">→</button><select class="output-mode" aria-label="Output mode" aria-keyshortcuts="1 2 3" title="Shortcuts: 1 Mono, 2 Full SBS, 3 Half SBS"><option value="mono">Mono · 1</option><option value="full-sbs">Full SBS · 2</option><option value="half-sbs">Half SBS · 3</option></select></div><div class="count"></div></nav>
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
      const canvas = document.querySelector('canvas.webgl');
      const overlayCanvas = document.querySelector('canvas.overlay');
      const usesPhysics = deck.document.slides.some((slide) => slide.elements.some((element) => element.physics));
      const player = await PrismDeck.DeckPlayer.create(canvas, deck, { autoStart: true, physics: usesPhysics, renderer: { overlayCanvas } });
      const previous = document.querySelector('[data-action="previous"]');
      const next = document.querySelector('[data-action="next"]');
      const outputMode = document.querySelector('.output-mode');
      const title = document.querySelector('.title');
      const count = document.querySelector('.count');
      const semantics = document.getElementById('slide-semantics');
      const MAX_SEMANTIC_ROWS = 500;
      const MAX_SEMANTIC_CELLS = 5000;
      const addText = (parent, tag, value) => {
        if (value === undefined || value === null) return;
        const node = document.createElement(tag);
        node.textContent = String(value);
        parent.appendChild(node);
      };
      const pointValue = (point) => {
        if (point.value !== undefined && point.value !== null) return point.value;
        if (point.x !== undefined || point.y !== undefined) {
          const values = [];
          if (point.x !== undefined && point.x !== null) values.push('x ' + point.x);
          if (point.y !== undefined && point.y !== null) values.push('y ' + point.y);
          if (point.size !== undefined && point.size !== null) values.push('size ' + point.size);
          return values.join(', ');
        }
        if (point.open !== undefined || point.high !== undefined || point.low !== undefined || point.close !== undefined) {
          return ['open', 'high', 'low', 'close']
            .filter((key) => point[key] !== undefined && point[key] !== null)
            .map((key) => key + ' ' + point[key])
            .join(', ');
        }
        return Array.isArray(point.values) ? point.values.filter((value) => value !== null).join(', ') : '';
      };
      const appendTable = (parent, element, budget) => {
        const table = document.createElement('table');
        table.setAttribute('aria-label', element.name || 'Table');
        for (let rowIndex = 0; rowIndex < element.rows.length; rowIndex += 1) {
          if (budget.rows <= 0 || budget.cells <= 0) {
            budget.truncated = true;
            break;
          }
          const row = element.rows[rowIndex];
          const tr = document.createElement('tr');
          const cells = [...row.cells].sort((first, second) => first.column - second.column);
          for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
            if (budget.cells <= 0) {
              budget.truncated = true;
              break;
            }
            const cell = cells[cellIndex];
            const td = document.createElement(cell.header ? 'th' : 'td');
            if (cell.header) td.scope = 'col';
            if (cell.columnSpan > 1) td.colSpan = cell.columnSpan;
            if (cell.rowSpan > 1) td.rowSpan = cell.rowSpan;
            td.textContent = cell.text;
            tr.appendChild(td);
            budget.cells -= 1;
          }
          table.appendChild(tr);
          budget.rows -= 1;
        }
        parent.appendChild(table);
      };
      const appendChart = (parent, element, budget) => {
        const figure = document.createElement('figure');
        addText(figure, 'figcaption', element.title || element.name || 'Chart');
        for (let plotIndex = 0; plotIndex < element.plots.length; plotIndex += 1) {
          if (budget.rows <= 0 || budget.cells <= 0) {
            budget.truncated = true;
            break;
          }
          const plot = element.plots[plotIndex];
          const table = document.createElement('table');
          table.setAttribute('aria-label', plot.type + ' chart data');
          const header = document.createElement('tr');
          addText(header, 'th', 'Category');
          budget.cells -= 1;
          for (let seriesIndex = 0; seriesIndex < plot.series.length; seriesIndex += 1) {
            if (budget.cells <= 0) {
              budget.truncated = true;
              break;
            }
            const series = plot.series[seriesIndex];
            addText(header, 'th', series.name || 'Series');
            budget.cells -= 1;
          }
          table.appendChild(header);
          budget.rows -= 1;
          const availablePointCount = Math.max(0, ...plot.series.map((series) => series.points.length));
          const pointCount = Math.min(budget.rows, availablePointCount);
          if (pointCount < availablePointCount) budget.truncated = true;
          for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
            if (budget.cells <= 0) {
              budget.truncated = true;
              break;
            }
            const row = document.createElement('tr');
            const labelPoint = plot.series.find((series) => series.points[pointIndex]?.label)?.points[pointIndex];
            addText(row, 'th', labelPoint?.label || String(pointIndex + 1));
            budget.cells -= 1;
            for (let seriesIndex = 0; seriesIndex < plot.series.length; seriesIndex += 1) {
              if (budget.cells <= 0) {
                budget.truncated = true;
                break;
              }
              const series = plot.series[seriesIndex];
              addText(row, 'td', pointValue(series.points[pointIndex] || {}));
              budget.cells -= 1;
            }
            table.appendChild(row);
            budget.rows -= 1;
          }
          figure.appendChild(table);
        }
        parent.appendChild(figure);
      };
      const syncSemantics = () => {
        semantics.replaceChildren();
        const slide = player.session.currentSlide;
        if (!slide) return;
        const budget = { rows: MAX_SEMANTIC_ROWS, cells: MAX_SEMANTIC_CELLS, truncated: false };
        addText(semantics, 'h1', slide.name || player.session.document.metadata.title);
        for (const element of [...slide.elements].filter((element) => element.visible).sort((first, second) => first.renderOrder - second.renderOrder)) {
          if (element.type === 'text') addText(semantics, 'p', element.text);
          else if (element.type === 'shape') addText(semantics, 'p', element.text);
          else if (element.type === 'image') addText(semantics, 'p', element.alt || element.name);
          else if (element.type === 'table') appendTable(semantics, element, budget);
          else if (element.type === 'chart') appendChart(semantics, element, budget);
          else if (element.type === 'unsupported') addText(semantics, 'p', element.fallbackText || element.reason);
        }
        if (budget.truncated) addText(semantics, 'p', 'Additional chart or table data is omitted from the accessibility summary.');
      };
      const sync = () => {
        const index = player.session.currentSlideIndex;
        const total = player.session.document.slides.length;
        title.textContent = player.session.currentSlide?.name ?? player.session.document.metadata.title;
        count.textContent = total === 0 ? '0 / 0' : (index + 1) + ' / ' + total;
        previous.disabled = index <= 0;
        next.disabled = index < 0 || index >= total - 1;
        syncSemantics();
      };
      previous.addEventListener('click', () => player.session.previous());
      next.addEventListener('click', () => player.session.next());
      const setOutputMode = (mode) => {
        player.renderer.setOutputMode(mode);
        outputMode.value = mode;
      };
      outputMode.addEventListener('change', () => setOutputMode(outputMode.value));
      player.session.addEventListener('change', sync);
      window.addEventListener('keydown', (event) => {
        const mode = { '1': 'mono', '2': 'full-sbs', '3': 'half-sbs' }[event.key];
        if (mode) {
          event.preventDefault();
          setOutputMode(mode);
        } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') player.session.previous();
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
