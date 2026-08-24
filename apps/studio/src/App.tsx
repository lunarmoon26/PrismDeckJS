import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  DeckPlayer,
  OUTPUT_PRESETS,
  importPresentation,
  savePrismDeck,
  savePrismDeckHtml,
  type DeckElement,
  type ElementClientQuad,
  type ElementFrame,
  type ElementPhysics,
  type ElementTransform,
  type ImportReport,
  type ImageElement,
  type LoadedDeck,
  type OutputMode,
  type SessionChangeDetail,
  type TextStyle,
} from 'prismdeckjs';
import {
  Camera,
  ChartColumn,
  Eye,
  EyeOff,
  FileCode2,
  Image as ImageIcon,
  Maximize2,
  MousePointer2,
  Package,
  Plus,
  Shapes,
  Table2,
  Type,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { applyDemoTheme, createDemoDeck, detectDemoTheme } from './demo';
import { DECK_THEMES, deckTheme, isDeckThemeId, type DeckThemeId } from './themes';

const OUTPUT_LABELS: Record<OutputMode, string> = {
  mono: 'Mono',
  'full-sbs': 'Full SBS',
  'half-sbs': 'Half SBS',
};

const OUTPUT_DETAILS: Record<OutputMode, { description: string; readout: string; stageLabel: string }> = {
  mono: {
    description: 'One standard 1920 by 1080 view.',
    readout: '1920 × 1080 · single view',
    stageLabel: '01 VIEW',
  },
  'full-sbs': {
    description: 'Two full-width 1920 by 1080 eye views in a 3840 by 1080 frame.',
    readout: '3840 × 1080 · 1920 × 1080 / eye',
    stageLabel: '02 FULL EYES',
  },
  'half-sbs': {
    description: 'Two horizontally compressed 960 by 1080 eye views in a 1920 by 1080 frame.',
    readout: '1920 × 1080 · 960 × 1080 / eye',
    stageLabel: '02 HALF EYES',
  },
};

const THEME_STORAGE_KEY = 'prismdeck-demo-theme';

type DrawingTool = 'select' | 'text' | 'rectangle' | 'roundedRectangle' | 'ellipse' | 'line';
type InsertTool = Exclude<DrawingTool, 'select'>;
type InsertChoice = DrawingTool | 'image';
type ResizeHandle = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

interface DrawGesture {
  pointerId: number;
  tool: InsertTool;
  start: { x: number; y: number };
  startClient: { x: number; y: number };
}

interface DrawDraft {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ResizeGesture {
  pointerId: number;
  elementId: string;
  handle: ResizeHandle;
  frame: ElementFrame;
  previewFrame: ElementFrame;
}

interface MoveGesture {
  pointerId: number;
  elementId: string;
  start: { x: number; y: number };
  startClient: { x: number; y: number };
  frame: ElementFrame;
  previewFrame: ElementFrame;
  moved: boolean;
}

const DRAWING_TOOLS: Array<{ id: DrawingTool; label: string; icon: LucideIcon }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'text', label: 'Text box', icon: Type },
  { id: 'rectangle', label: 'Rectangle', icon: Shapes },
  { id: 'roundedRectangle', label: 'Rounded rectangle', icon: Shapes },
  { id: 'ellipse', label: 'Ellipse', icon: Shapes },
  { id: 'line', label: 'Line', icon: Shapes },
];

const RESIZE_HANDLES: ResizeHandle[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const MAX_INSERT_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_INSERT_IMAGE_DIMENSION = 8_192;
const MAX_INSERT_IMAGE_PIXELS = 40_000_000;
const INSERT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

let fallbackElementId = 0;

function newElementId(type: string): string {
  if (globalThis.crypto?.randomUUID) return `${type}-${globalThis.crypto.randomUUID()}`;
  fallbackElementId += 1;
  return `${type}-${Date.now().toString(36)}-${fallbackElementId.toString(36)}`;
}

function replaceColorPreservingAlpha(current: string, next: string): string {
  return `${next}${current.length === 9 ? current.slice(7) : ''}`.toUpperCase();
}

function drawnFrame(start: { x: number; y: number }, end: { x: number; y: number }, tool: DrawingTool): ElementFrame {
  let x = Math.min(start.x, end.x);
  let y = Math.min(start.y, end.y);
  let width = Math.abs(end.x - start.x);
  let height = Math.abs(end.y - start.y);
  if (width < 0.015 && height < 0.015) {
    width = tool === 'text' ? 0.3 : 0.2;
    height = tool === 'text' ? 0.12 : tool === 'line' ? 0.08 : 0.16;
    x = Math.min(x, 1 - width);
    y = Math.min(y, 1 - height);
  }
  width = Math.max(tool === 'line' ? 0.01 : 0.04, Math.min(width, 1 - x));
  height = Math.max(tool === 'line' ? 0.01 : 0.04, Math.min(height, 1 - y));
  return { x, y, width, height };
}

function resizeFrameFromCorner(frame: ElementFrame, handle: ResizeHandle, point: { x: number; y: number }): ElementFrame {
  const minimum = 0.01;
  const originalRight = frame.x + frame.width;
  const originalBottom = frame.y + frame.height;
  const left = handle === 'topLeft' || handle === 'bottomLeft'
    ? Math.min(point.x, originalRight - minimum)
    : frame.x;
  const right = handle === 'topRight' || handle === 'bottomRight'
    ? Math.max(point.x, frame.x + minimum)
    : originalRight;
  const top = handle === 'topLeft' || handle === 'topRight'
    ? Math.min(point.y, originalBottom - minimum)
    : frame.y;
  const bottom = handle === 'bottomLeft' || handle === 'bottomRight'
    ? Math.max(point.y, frame.y + minimum)
    : originalBottom;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function quadPoint(quad: ElementClientQuad, handle: ResizeHandle): { x: number; y: number } {
  return quad[handle];
}

function frameHandleForCorner(handle: ResizeHandle, element: DeckElement): ResizeHandle {
  let horizontal = handle.endsWith('Left') ? 'Left' : 'Right';
  let vertical = handle.startsWith('top') ? 'top' : 'bottom';
  if (element.transform.scaleX < 0) horizontal = horizontal === 'Left' ? 'Right' : 'Left';
  if (element.transform.scaleY < 0) vertical = vertical === 'top' ? 'bottom' : 'top';
  return `${vertical}${horizontal}` as ResizeHandle;
}

function canResizeFromStage(element: DeckElement): boolean {
  return (
    element.transform.z === 0 &&
    element.transform.rotationX === 0 &&
    element.transform.rotationY === 0 &&
    element.transform.rotationZ === 0 &&
    Math.abs(element.transform.scaleX) === 1 &&
    Math.abs(element.transform.scaleY) === 1 &&
    (element.thickness ?? 0) === 0 &&
    !element.physics
  );
}

function insertedImageMimeType(file: File): string | undefined {
  if (INSERT_IMAGE_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'png'
    ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'gif'
          ? 'image/gif'
          : extension === 'svg'
            ? 'image/svg+xml'
            : undefined;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function jpegDimensions(bytes: Uint8Array, view: DataView): { width: number; height: number } | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    }
    offset += length;
  }
  return undefined;
}

function webpDimensions(bytes: Uint8Array, view: DataView): { width: number; height: number } | undefined {
  if (bytes.length < 16 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return undefined;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { width, height };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed = view.getUint32(21, true);
    return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return undefined;
}

function svgDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || document.querySelector('parsererror')) return undefined;
  const width = Number.parseFloat(root.getAttribute('width') ?? '');
  const height = Number.parseFloat(root.getAttribute('height') ?? '');
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) return { width, height };
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0) {
    return { width: viewBox[2]!, height: viewBox[3]! };
  }
  return undefined;
}

function insertedImageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png' && bytes.length >= 24 && ascii(bytes, 1, 3) === 'PNG') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === 'image/gif' && bytes.length >= 10 && ascii(bytes, 0, 3) === 'GIF') {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (mimeType === 'image/jpeg') return jpegDimensions(bytes, view);
  if (mimeType === 'image/webp') return webpDimensions(bytes, view);
  if (mimeType === 'image/svg+xml') return svgDimensions(bytes);
  return undefined;
}

async function validateInsertedImage(bytes: Uint8Array, mimeType: string): Promise<void> {
  const dimensions = insertedImageDimensions(bytes, mimeType);
  if (!dimensions) throw new Error('The picture header is invalid or its dimensions could not be read.');
  const { width, height } = dimensions;
  if (
    width > MAX_INSERT_IMAGE_DIMENSION ||
    height > MAX_INSERT_IMAGE_DIMENSION ||
    width * height > MAX_INSERT_IMAGE_PIXELS
  ) {
    throw new Error('Pictures are limited to 8192 px per side and 40 megapixels.');
  }
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mimeType }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    if (image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error('The picture has no decodable dimensions.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clientQuadsEqual(first: ElementClientQuad[], second: ElementClientQuad[]): boolean {
  if (first.length !== second.length) return false;
  return first.every((quad, index) => {
    const candidate = second[index];
    return candidate && RESIZE_HANDLES.every((handle) => (
      Math.abs(quad[handle].x - candidate[handle].x) < 0.1 &&
      Math.abs(quad[handle].y - candidate[handle].y) < 0.1
    ));
  });
}

function initialTheme(): DeckThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isDeckThemeId(stored) ? stored : 'edge';
  } catch {
    return 'edge';
  }
}

function safeName(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'prismdeck';
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas capture failed'))), 'image/png');
  });
}

function snapshotSession(session: DeckPlayer['session']): LoadedDeck {
  return {
    document: structuredClone(session.document),
    assets: new Map(
      Array.from(session.assets, ([id, asset]) => [id, { ...asset, data: Uint8Array.from(asset.data) }]),
    ),
  };
}

function elementLabel(element: DeckElement): string {
  const placeholder = element.placeholder?.type;
  return placeholder ? `${element.name} · ${placeholder}` : element.name;
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const commit = (next: number) => {
    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="number-field__control">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <input
          aria-label={`${label} value`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(value.toFixed(3))}
          onChange={(event) => {
            const next = Number(event.target.value);
            commit(next);
          }}
        />
      </div>
    </label>
  );
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<DeckPlayer | undefined>(undefined);
  const importSequence = useRef(0);
  const dirtyRef = useRef(false);
  const editSequence = useRef(0);
  const drawGestureRef = useRef<DrawGesture | undefined>(undefined);
  const resizeGestureRef = useRef<ResizeGesture | undefined>(undefined);
  const moveGestureRef = useRef<MoveGesture | undefined>(undefined);
  const [player, setPlayer] = useState<DeckPlayer>();
  const [revision, redraw] = useReducer((value: number) => value + 1, 0);
  const [selectedElementId, setSelectedElementId] = useState<string>();
  const [outputMode, setOutputModeState] = useState<OutputMode>('mono');
  const [report, setReport] = useState<ImportReport>();
  const [busyMessage, setBusyMessage] = useState('Starting renderer…');
  const [error, setError] = useState<string>();
  const [layoutChoice, setLayoutChoice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [usingBuiltInDemo, setUsingBuiltInDemo] = useState(true);
  const [deckThemeId, setDeckThemeId] = useState<DeckThemeId>(initialTheme);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('select');
  const [drawDraft, setDrawDraft] = useState<DrawDraft>();
  const [stereoDepthScale, setStereoDepthScaleState] = useState(1);
  const [selectionQuads, setSelectionQuads] = useState<ElementClientQuad[]>([]);

  function updateDirty(value: boolean): void {
    dirtyRef.current = value;
    setDirty(value);
  }

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, deckThemeId);
    } catch {
      // Demo theme persistence is optional in restricted browser contexts.
    }
  }, [deckThemeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!canvas || !overlayCanvas) return;
    let active = true;
    let instance: DeckPlayer | undefined;
    let observer: ResizeObserver | undefined;
    const onSessionChange = (event: Event) => {
      redraw();
      if ((event as CustomEvent<SessionChangeDetail>).detail.reason === 'content') {
        editSequence.current += 1;
        updateDirty(true);
      }
    };

    void DeckPlayer.create(canvas, createDemoDeck(deckThemeId), {
      physics: true,
      renderer: { outputMode: 'mono', antialias: true, clearColor: '#151311', overlayCanvas },
    })
      .then((created) => {
        if (!active) {
          created.dispose();
          return;
        }
        instance = created;
        playerRef.current = created;
        created.session.addEventListener('change', onSessionChange);
        observer = new ResizeObserver(([entry]) => {
          if (!entry) return;
          created.renderer.resize(entry.contentRect.width, entry.contentRect.height, false);
          redraw();
        });
        observer.observe(canvas);
        created.start();
        setPlayer(created);
        setBusyMessage('');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setBusyMessage('');
        setError(cause instanceof Error ? cause.message : 'Unable to start the renderer');
      });

    return () => {
      active = false;
      observer?.disconnect();
      instance?.session.removeEventListener('change', onSessionChange);
      instance?.dispose();
      playerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const preventAccidentalClose = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventAccidentalClose);
    return () => window.removeEventListener('beforeunload', preventAccidentalClose);
  }, []);

  useEffect(() => {
    if (!player) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') player.session.next();
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') player.session.previous();
      else if (event.key === ' ') {
        event.preventDefault();
        if (player.session.isPlaying) player.session.pause();
        else player.session.play();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [player]);

  useEffect(() => {
    if (!player || !selectedElementId) {
      setSelectionQuads([]);
      return;
    }
    let animationFrame = 0;
    const syncSelection = () => {
      const next = player.renderer.getElementClientQuads(selectedElementId);
      setSelectionQuads((current) => clientQuadsEqual(current, next) ? current : next);
      animationFrame = requestAnimationFrame(syncSelection);
    };
    syncSelection();
    return () => cancelAnimationFrame(animationFrame);
  }, [outputMode, player, selectedElementId]);

  const session = player?.session;
  const deckDocument = session?.document;
  const currentSlide = session?.currentSlide;
  const selectedElement = useMemo(
    () => (selectedElementId ? session?.findElement(selectedElementId) : undefined),
    [session, selectedElementId, revision],
  );
  const selectedTextStyle = selectedElement?.type === 'text'
    ? selectedElement.style
    : selectedElement?.type === 'shape'
      ? selectedElement.textStyle
      : undefined;
  const selectedTextSizePoints = selectedTextStyle && deckDocument
    ? selectedTextStyle.fontSize * deckDocument.size.height * (72 / 96)
    : 0;
  const selectedElementResizable = selectedElement ? canResizeFromStage(selectedElement) : false;
  const selectedElementMovable = Boolean(selectedElement && outputMode === 'mono' && !selectedElement.physics);
  const selectedElementAcceptsPicture = Boolean(
    selectedElement && (selectedElement.type === 'image' || selectedElement.placeholder?.type === 'pic'),
  );
  const selectedLayoutId =
    (deckDocument?.layouts.some((layout) => layout.id === layoutChoice) ? layoutChoice : undefined) ??
    deckDocument?.layouts[0]?.id ??
    '';

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !player) return;
    if (dirtyRef.current && !window.confirm('Discard unsaved changes and import another deck?')) return;
    const sequence = ++importSequence.current;
    setError(undefined);
    setBusyMessage(`Importing ${file.name}…`);
    try {
      const result = await importPresentation(await file.arrayBuffer(), { sourceName: file.name });
      if (sequence !== importSequence.current) return;
      player.load(result);
      setReport(result.report);
      setSelectedElementId(undefined);
      setLayoutChoice(result.document.layouts[0]?.id ?? '');
      setUsingBuiltInDemo(false);
      updateDirty(false);
    } catch (cause) {
      if (sequence !== importSequence.current) return;
      setError(cause instanceof Error ? cause.message : `Could not import ${file.name}`);
    } finally {
      if (sequence === importSequence.current) setBusyMessage('');
    }
  }

  function removeAssetIfUnused(assetId: string): void {
    if (!session) return;
    const elements = [
      ...session.document.layouts.flatMap((layout) => layout.elements),
      ...session.document.slides.flatMap((slide) => slide.elements),
    ];
    if (!elements.some((element) => element.type === 'image' && element.assetId === assetId)) {
      session.assets.delete(assetId);
    }
  }

  async function insertPicture(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !session?.currentSlide) return;
    const mimeType = insertedImageMimeType(file);
    if (!mimeType) {
      setError('Choose a PNG, JPEG, WebP, GIF, or SVG image.');
      return;
    }
    if (file.size > MAX_INSERT_IMAGE_BYTES) {
      setError('Pictures must be 32 MB or smaller.');
      return;
    }
    setError(undefined);
    setBusyMessage(`Adding ${file.name}…`);
    let assetId: string | undefined;
    let committed = false;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      await validateInsertedImage(data, mimeType);
      assetId = newElementId('asset');
      session.assets.set(assetId, {
        id: assetId,
        fileName: file.name,
        mimeType,
        data,
      });
      const target = selectedElementAcceptsPicture ? selectedElement : undefined;
      if (target?.type === 'image') {
        const previousAssetId = target.assetId;
        target.assetId = assetId;
        target.name = file.name;
        target.alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        session.notifyContentChanged(target.id);
        removeAssetIfUnused(previousAssetId);
        committed = true;
        return;
      }
      if (target?.placeholder?.type === 'pic') {
        const index = session.currentSlide.elements.findIndex((element) => element.id === target.id);
        if (index < 0) throw new Error('Picture placeholder is no longer available');
        const image: ImageElement = {
          id: target.id,
          type: 'image',
          name: file.name,
          frame: { ...target.frame },
          transform: { ...target.transform },
          opacity: target.opacity,
          visible: target.visible,
          renderOrder: target.renderOrder,
          ...(target.thickness === undefined ? {} : { thickness: target.thickness }),
          ...(target.physics === undefined ? {} : { physics: { ...target.physics } }),
          ...(target.source === undefined ? {} : { source: { ...target.source } }),
          placeholder: { ...target.placeholder },
          assetId,
          alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
          fit: 'contain',
        };
        session.currentSlide.elements[index] = image;
        session.notifyContentChanged(image.id);
        setSelectedElementId(image.id);
        committed = true;
        return;
      }
      const image: ImageElement = {
        id: newElementId('image'),
        type: 'image',
        name: file.name,
        frame: { x: 0.2, y: 0.2, width: 0.6, height: 0.55 },
        transform: { ...DEFAULT_TRANSFORM },
        opacity: 1,
        visible: true,
        renderOrder: Math.max(0, ...session.currentSlide.elements.map((element) => element.renderOrder + 1)),
        assetId,
        alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        fit: 'contain',
      };
      if (!session.addElement(image)) throw new Error('Could not insert the picture on this slide');
      setSelectedElementId(image.id);
      committed = true;
    } catch (cause) {
      if (assetId && !committed) session.assets.delete(assetId);
      setError(cause instanceof Error ? cause.message : `Could not add ${file.name}`);
    } finally {
      setBusyMessage('');
    }
  }

  function setOutputMode(mode: OutputMode): void {
    setOutputModeState(mode);
    player?.renderer.setOutputMode(mode);
  }

  function selectSlide(index: number): void {
    cancelActiveElementPreview();
    session?.goTo(index);
    setSelectedElementId(undefined);
  }

  function setDeckTheme(themeId: DeckThemeId): void {
    if (!session || !usingBuiltInDemo || !applyDemoTheme(session.document, themeId, deckThemeId)) return;
    setDeckThemeId(themeId);
    session.notifyContentChanged();
  }

  function createSlide(): void {
    if (!session || !selectedLayoutId) return;
    const slide = session.createSlide(selectedLayoutId, {
      background: session.currentSlide?.background ?? deckTheme(deckThemeId).colors.background,
    });
    session.goTo(session.document.slides.indexOf(slide));
    setSelectedElementId(slide.elements.find((element) => element.placeholder)?.id ?? slide.elements[0]?.id);
  }

  function updateSceneBackground(background: string): void {
    if (!session?.currentSlide) return;
    const alpha = session.currentSlide.background.length === 9 ? session.currentSlide.background.slice(7) : '';
    session.currentSlide.background = `${background}${alpha}`.toUpperCase();
    session.notifyContentChanged();
  }

  function updateSlideTransition(type: 'cut' | 'fade' | 'slide'): void {
    if (!session?.currentSlide) return;
    session.currentSlide.transition = { type, durationMs: type === 'cut' ? 0 : session.currentSlide.transition?.durationMs || 420 };
    session.notifyContentChanged();
  }

  function updateSlideTransitionDuration(durationMs: number): void {
    if (!session?.currentSlide?.transition || session.currentSlide.transition.type === 'cut') return;
    session.currentSlide.transition.durationMs = Math.max(0, Math.min(10_000, durationMs));
    session.notifyContentChanged();
  }

  function updateStereoDepthScale(value: number): void {
    const next = Math.max(0, Math.min(1.5, value));
    setStereoDepthScaleState(next);
    player?.renderer.setStereoDepthScale(next);
  }

  function chooseDrawingTool(tool: DrawingTool): void {
    cancelActiveElementPreview();
    setDrawingTool(tool);
    setDrawDraft(undefined);
    drawGestureRef.current = undefined;
    if (tool !== 'select') {
      setSelectedElementId(undefined);
      if (outputMode !== 'mono') setOutputMode('mono');
    }
  }

  function chooseInsert(choice: InsertChoice): void {
    if (choice === 'image') {
      chooseDrawingTool('select');
      imageInputRef.current?.click();
      return;
    }
    chooseDrawingTool(choice);
  }

  function cancelActiveElementPreview(): void {
    const gesture = resizeGestureRef.current;
    if (gesture) player?.renderer.previewElementFrame(gesture.elementId, gesture.frame);
    resizeGestureRef.current = undefined;
    const moveGesture = moveGestureRef.current;
    if (moveGesture) player?.renderer.previewElementFrame(moveGesture.elementId, moveGesture.frame);
    moveGestureRef.current = undefined;
  }

  function beginElementResize(event: React.PointerEvent<HTMLButtonElement>, handle: ResizeHandle): void {
    if (!selectedElement || !selectedElementResizable) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeGestureRef.current = {
      pointerId: event.pointerId,
      elementId: selectedElement.id,
      handle,
      frame: { ...selectedElement.frame },
      previewFrame: { ...selectedElement.frame },
    };
  }

  function moveElementResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !player || !session) return;
    const point = player.renderer.clientPointToSlide(event.clientX, event.clientY, true);
    if (!point || !session.findElement(gesture.elementId)) return;
    gesture.previewFrame = resizeFrameFromCorner(gesture.frame, gesture.handle, point);
    player.renderer.previewElementFrame(gesture.elementId, gesture.previewFrame);
  }

  function finishElementResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !session) return;
    moveElementResize(event);
    resizeGestureRef.current = undefined;
    const element = session.findElement(gesture.elementId);
    if (!element) return;
    element.frame = gesture.previewFrame;
    session.notifyContentChanged(element.id);
  }

  function cancelElementResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    player?.renderer.previewElementFrame(gesture.elementId, gesture.frame);
    resizeGestureRef.current = undefined;
  }

  function beginElementMove(event: React.PointerEvent<SVGPolygonElement>): void {
    if (!selectedElement || !selectedElementMovable || !player) return;
    const start = player.renderer.clientPointToSlide(event.clientX, event.clientY, true);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    moveGestureRef.current = {
      pointerId: event.pointerId,
      elementId: selectedElement.id,
      start,
      startClient: { x: event.clientX, y: event.clientY },
      frame: { ...selectedElement.frame },
      previewFrame: { ...selectedElement.frame },
      moved: false,
    };
  }

  function moveElement(event: React.PointerEvent<SVGPolygonElement>): void {
    const gesture = moveGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !player || !session) return;
    const point = player.renderer.clientPointToSlide(event.clientX, event.clientY, true);
    if (!point || !session.findElement(gesture.elementId)) return;
    if (Math.hypot(event.clientX - gesture.startClient.x, event.clientY - gesture.startClient.y) > 3) {
      gesture.moved = true;
    }
    gesture.previewFrame = {
      ...gesture.frame,
      x: Math.max(0, Math.min(1 - gesture.frame.width, gesture.frame.x + point.x - gesture.start.x)),
      y: Math.max(0, Math.min(1 - gesture.frame.height, gesture.frame.y + point.y - gesture.start.y)),
    };
    player.renderer.previewElementFrame(gesture.elementId, gesture.previewFrame);
  }

  function finishElementMove(event: React.PointerEvent<SVGPolygonElement>): void {
    const gesture = moveGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !session) return;
    moveElement(event);
    moveGestureRef.current = undefined;
    if (!gesture.moved) {
      setSelectedElementId(player?.renderer.pick(event.clientX, event.clientY));
      return;
    }
    const element = session.findElement(gesture.elementId);
    if (!element) return;
    element.frame = gesture.previewFrame;
    session.notifyContentChanged(element.id);
  }

  function cancelElementMove(event: React.PointerEvent<SVGPolygonElement>): void {
    const gesture = moveGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    player?.renderer.previewElementFrame(gesture.elementId, gesture.frame);
    moveGestureRef.current = undefined;
  }

  function beginCanvasPointer(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (drawingTool === 'select') {
      const id = player?.renderer.pick(event.clientX, event.clientY);
      setSelectedElementId(id);
      return;
    }
    const start = player?.renderer.clientPointToSlide(event.clientX, event.clientY);
    const stageBounds = stageRef.current?.getBoundingClientRect();
    if (!start || !stageBounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawGestureRef.current = {
      pointerId: event.pointerId,
      tool: drawingTool,
      start,
      startClient: { x: event.clientX, y: event.clientY },
    };
    setDrawDraft({ left: event.clientX - stageBounds.left, top: event.clientY - stageBounds.top, width: 0, height: 0 });
  }

  function moveCanvasPointer(event: React.PointerEvent<HTMLCanvasElement>): void {
    const gesture = drawGestureRef.current;
    const stageBounds = stageRef.current?.getBoundingClientRect();
    if (!gesture || gesture.pointerId !== event.pointerId || !stageBounds) return;
    setDrawDraft({
      left: Math.min(gesture.startClient.x, event.clientX) - stageBounds.left,
      top: Math.min(gesture.startClient.y, event.clientY) - stageBounds.top,
      width: Math.abs(event.clientX - gesture.startClient.x),
      height: Math.abs(event.clientY - gesture.startClient.y),
    });
  }

  function finishCanvasPointer(event: React.PointerEvent<HTMLCanvasElement>): void {
    const gesture = drawGestureRef.current;
    drawGestureRef.current = undefined;
    setDrawDraft(undefined);
    if (!gesture || gesture.pointerId !== event.pointerId || !session?.currentSlide || !player) return;
    const end = player.renderer.clientPointToSlide(event.clientX, event.clientY, true);
    if (!end) return;
    const frame = drawnFrame(gesture.start, end, gesture.tool);
    const transform = {
      ...DEFAULT_TRANSFORM,
      ...(gesture.tool === 'line' && (end.x - gesture.start.x) * (end.y - gesture.start.y) >= 0 ? { scaleY: -1 } : {}),
    };
    const theme = deckTheme(detectDemoTheme(session.document) ?? deckThemeId).colors;
    const base = {
      id: newElementId(gesture.tool),
      name: gesture.tool === 'text' ? 'Text box' : DRAWING_TOOLS.find((tool) => tool.id === gesture.tool)?.label ?? 'Shape',
      frame,
      transform,
      opacity: 1,
      visible: true,
      renderOrder: Math.max(0, ...session.currentSlide.elements.map((element) => element.renderOrder + 1)),
    };
    const element: DeckElement = gesture.tool === 'text'
      ? {
          ...base,
          type: 'text',
          text: 'Text',
          style: { ...DEFAULT_TEXT_STYLE, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 0.04, color: theme.warning },
        }
      : {
          ...base,
          type: 'shape',
          shape: gesture.tool,
          fill: gesture.tool === 'line' ? '#FFFFFF00' : theme.surface,
          stroke: theme.primary,
          strokeWidth: 2,
        };
    if (session.addElement(element)) setSelectedElementId(element.id);
    chooseDrawingTool('select');
  }

  function cancelCanvasPointer(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (drawGestureRef.current?.pointerId !== event.pointerId) return;
    drawGestureRef.current = undefined;
    setDrawDraft(undefined);
  }

  function updateTransform(key: keyof ElementTransform, value: number): void {
    if (!session || !selectedElement) return;
    session.updateElementTransform(selectedElement.id, { [key]: value });
  }

  function updateFrame(key: keyof ElementFrame, value: number): void {
    if (!session || !selectedElement || !Number.isFinite(value)) return;
    const next = { ...selectedElement.frame, [key]: value };
    next.width = Math.max(0.01, Math.min(1, next.width));
    next.height = Math.max(0.01, Math.min(1, next.height));
    next.x = Math.max(0, Math.min(1 - next.width, next.x));
    next.y = Math.max(0, Math.min(1 - next.height, next.y));
    selectedElement.frame = next;
    session.notifyContentChanged(selectedElement.id);
  }

  function mutateSelected(mutation: (element: DeckElement) => void): void {
    if (!session || !selectedElement) return;
    mutation(selectedElement);
    session.notifyContentChanged(selectedElement.id);
  }

  function mutateSelectedTextStyle(mutation: (style: TextStyle) => void): void {
    mutateSelected((element) => {
      if (element.type === 'text') mutation(element.style);
      else if (element.type === 'shape') {
        element.textStyle ??= { ...DEFAULT_TEXT_STYLE, fontFamily: 'Arial, Helvetica, sans-serif' };
        mutation(element.textStyle);
      }
    });
  }

  function removeSelectedElement(): void {
    if (!session || !selectedElementId) return;
    const element = session.findElement(selectedElementId);
    const assetId = element?.type === 'image' ? element.assetId : undefined;
    if (!session.removeElement(selectedElementId)) return;
    setSelectedElementId(undefined);
    if (assetId) removeAssetIfUnused(assetId);
  }

  function updatePhysics(patch: Partial<ElementPhysics>): void {
    if (!session || !selectedElement) return;
    const current = selectedElement.physics ?? {
      body: 'fixed',
      shape: 'cuboid',
      density: 1,
      restitution: 0.2,
      friction: 0.5,
    };
    const next = { ...current, ...patch };
    next.density = Math.max(0, Number.isFinite(next.density) ? next.density : 0);
    next.restitution = Math.min(1, Math.max(0, Number.isFinite(next.restitution) ? next.restitution : 0));
    next.friction = Math.min(2, Math.max(0, Number.isFinite(next.friction) ? next.friction : 0));
    session.updateElementPhysics(selectedElement.id, next);
  }

  async function saveDeck(): Promise<void> {
    if (!session) return;
    const savedEditSequence = editSequence.current;
    setError(undefined);
    try {
      const blob = await savePrismDeck(snapshotSession(session));
      downloadBlob(blob, `${safeName(session.document.metadata.title)}.prismdeck`);
      if (savedEditSequence === editSequence.current) updateDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this deck');
    }
  }

  async function exportHtml(): Promise<void> {
    if (!session) return;
    const savedEditSequence = editSequence.current;
    setError(undefined);
    try {
      const blob = await savePrismDeckHtml(snapshotSession(session));
      downloadBlob(blob, `${safeName(session.document.metadata.title)}.html`);
      if (savedEditSequence === editSequence.current) updateDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this deck');
    }
  }

  async function captureFrame(): Promise<void> {
    if (!player || !canvasRef.current || !session) return;
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    setBusyMessage(`Rendering ${OUTPUT_PRESETS[outputMode].width} × ${OUTPUT_PRESETS[outputMode].height}…`);
    player.stop();
    try {
      player.renderer.resizeToPreset(outputMode);
      await player.renderer.whenReady();
      player.renderer.render();
      downloadBlob(await canvasBlob(player.renderer.snapshotCanvas()), `${safeName(currentSlide?.name ?? 'slide')}-${outputMode}.png`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not capture this frame');
    } finally {
      if (playerRef.current === player) {
        player.renderer.resize(bounds.width, bounds.height, false);
        player.start();
      }
      setBusyMessage('');
    }
  }

  const ActiveDrawingIcon = DRAWING_TOOLS.find((tool) => tool.id === drawingTool)?.icon ?? MousePointer2;

  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="brand" aria-label="PrismDeck Studio">
          <span className="brand__mark" aria-hidden="true"><i /><i /><i /></span>
          <span><b>PRISM</b>DECK</span>
          <small>STUDIO</small>
        </div>
        <div className="document-title">
          <span className="eyebrow">LOCAL DOCUMENT</span>
          <strong>{deckDocument?.metadata.title ?? 'No deck loaded'}{dirty && <em className="dirty-state">UNSAVED</em>}</strong>
        </div>
        <div className="topbar__actions">
          <span className="local-badge"><span /> Files stay here</span>
          <label className="button button--primary file-button">
            <input aria-label="Import deck file" type="file" accept=".pptx,.odp,.prismdeck,.html,.htm" onChange={(event) => void importFile(event)} />
            <Upload aria-hidden="true" />
            <span>Import deck</span>
          </label>
          <button
            className="button save-button"
            type="button"
            disabled={!player}
            aria-label={dirty ? 'Save package, unsaved changes' : 'Save package'}
            onClick={() => void saveDeck()}
          >
            <Package aria-hidden="true" />
            <span>Save package</span>{dirty && <i className="save-dirty-dot" aria-hidden="true" />}
          </button>
          <button className="button" type="button" disabled={!player} onClick={() => void exportHtml()}>
            <FileCode2 aria-hidden="true" />
            <span>Export HTML</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="slide-rail panel">
          <div className="panel-heading">
            <div><span className="eyebrow">SEQUENCE</span><h2>Slides</h2></div>
            <span className="counter">{deckDocument?.slides.length ?? 0}</span>
          </div>
          <div className="slide-list">
            {deckDocument?.slides.map((slide, index) => (
              <button
                type="button"
                className={`slide-card ${session?.currentSlideIndex === index ? 'is-active' : ''}`}
                key={slide.id}
                onClick={() => selectSlide(index)}
              >
                <span className="slide-card__number">{String(index + 1).padStart(2, '0')}</span>
                <span className="slide-card__preview" style={{ background: slide.background }}>
                  <span>{slide.name.slice(0, 2).toUpperCase()}</span>
                  <i style={{ width: `${Math.min(78, Math.max(26, slide.elements.length * 11))}%` }} />
                </span>
                <span className="slide-card__name">{slide.name}</span>
              </button>
            ))}
            {deckDocument?.slides.length === 0 && (
              <div className="empty-state"><b>Template ready</b><span>Choose a layout below to create the first slide.</span></div>
            )}
          </div>
          <div className="layout-create">
            <label>
              <span>Slide layout</span>
              <select value={selectedLayoutId} onChange={(event) => setLayoutChoice(event.target.value)} disabled={!deckDocument?.layouts.length}>
                {deckDocument?.layouts.map((layout) => <option value={layout.id} key={layout.id}>{layout.name}</option>)}
              </select>
            </label>
            <button className="button button--wide" type="button" disabled={!selectedLayoutId} onClick={createSlide}><Plus aria-hidden="true" /> Add slide</button>
          </div>
          {report && (
            <details className="import-report">
              <summary><span>Import report</span><b>{report.warnings.length}</b></summary>
              <div className="import-report__body">
                {report.warnings.length === 0 ? <p>No compatibility warnings.</p> : report.warnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`}><b>{warning.code}</b>{warning.message}</p>
                ))}
              </div>
            </details>
          )}
        </aside>

        <section className="stage-column">
          <div className="stage-toolbar">
            <div className="stage-toolbar__tools">
              <label className="insert-picker">
                <ActiveDrawingIcon aria-hidden="true" />
                <span>Insert</span>
                <select
                  aria-label="Insert element"
                  value={drawingTool}
                  disabled={!currentSlide}
                  onChange={(event) => chooseInsert(event.target.value as InsertChoice)}
                >
                  {DRAWING_TOOLS.map((tool) => <option key={tool.id} value={tool.id}>{tool.label}</option>)}
                  <option value="image">Picture…</option>
                </select>
              </label>
              <input
                ref={imageInputRef}
                className="visually-hidden-input"
                aria-label="Insert picture file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={(event) => void insertPicture(event)}
              />
              <div className="mode-switch" aria-label="Output mode">
                {(Object.keys(OUTPUT_LABELS) as OutputMode[]).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={outputMode === mode ? 'is-active' : ''}
                    title={OUTPUT_DETAILS[mode].description}
                    onClick={() => setOutputMode(mode)}
                  >
                    {OUTPUT_LABELS[mode]}
                  </button>
                ))}
              </div>
            </div>
            <div className="stage-toolbar__meta">
              <label className="theme-picker">
                <span>Deck theme</span>
                <select
                  aria-label="Demo deck theme"
                  value={deckThemeId}
                  disabled={!deckDocument || !usingBuiltInDemo}
                  title={deckDocument && !usingBuiltInDemo ? 'Themes apply only to the built-in demo deck' : undefined}
                  onChange={(event) => setDeckTheme(event.target.value as DeckThemeId)}
                >
                  {DECK_THEMES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <span aria-label="Output geometry">{OUTPUT_DETAILS[outputMode].readout}</span>
              <button type="button" onClick={() => void captureFrame()} disabled={!currentSlide}><Camera aria-hidden="true" /> Capture PNG</button>
              <button type="button" onClick={() => void stageRef.current?.requestFullscreen()}><Maximize2 aria-hidden="true" /> Fullscreen</button>
            </div>
          </div>
          <div
            className={`stage ${drawingTool !== 'select' ? 'is-drawing' : ''}`}
            ref={stageRef}
            style={{ '--deck-aspect': `${deckDocument?.size.width ?? 16} / ${deckDocument?.size.height ?? 9}` } as CSSProperties}
          >
            <canvas
              ref={canvasRef}
              aria-label="Interactive 3D presentation canvas"
              onPointerDown={beginCanvasPointer}
              onPointerMove={moveCanvasPointer}
              onPointerUp={finishCanvasPointer}
              onPointerCancel={cancelCanvasPointer}
            />
            <canvas className="stage__overlay" ref={overlayCanvasRef} aria-hidden="true" />
            <div className="stage__grid" aria-hidden="true" />
            <div className="stage__label"><span>LIVE SCENE</span><b>{OUTPUT_DETAILS[outputMode].stageLabel}</b></div>
            {selectedElement && selectionQuads.length > 0 && (
              <div className="stage__selection-layer" aria-label={`Selected element: ${elementLabel(selectedElement)}`}>
                <svg aria-hidden="true">
                  {selectionQuads.map((quad, index) => (
                    <polygon
                      key={`outline-${index}`}
                      points={`${quad.topLeft.x},${quad.topLeft.y} ${quad.topRight.x},${quad.topRight.y} ${quad.bottomRight.x},${quad.bottomRight.y} ${quad.bottomLeft.x},${quad.bottomLeft.y}`}
                      className={selectedElementMovable ? 'is-movable' : ''}
                      aria-label={selectedElementMovable ? 'Move selected element' : undefined}
                      onPointerDown={beginElementMove}
                      onPointerMove={moveElement}
                      onPointerUp={finishElementMove}
                      onPointerCancel={cancelElementMove}
                    />
                  ))}
                </svg>
                {selectionQuads.flatMap((quad, eyeIndex) => RESIZE_HANDLES.map((corner) => {
                  const point = quadPoint(quad, corner);
                  const handle = frameHandleForCorner(corner, selectedElement);
                  const label = handle.replace(/([A-Z])/g, ' $1').toLowerCase();
                  return (
                    <button
                      key={`${eyeIndex}-${corner}`}
                      type="button"
                      className={`stage__resize-handle stage__resize-handle--${handle}`}
                      style={{ left: point.x, top: point.y }}
                      aria-label={`Resize ${label}${selectionQuads.length > 1 ? `, view ${eyeIndex + 1}` : ''}`}
                      title={selectedElementResizable ? `Resize ${label}` : 'Reset spatial transforms before resizing on the slide'}
                      disabled={!selectedElementResizable}
                      onPointerDown={(event) => beginElementResize(event, handle)}
                      onPointerMove={moveElementResize}
                      onPointerUp={finishElementResize}
                      onPointerCancel={cancelElementResize}
                    />
                  );
                }))}
              </div>
            )}
            {drawDraft && <div className="stage__draw-draft" aria-hidden="true" style={drawDraft} />}
            {busyMessage && <div className="stage-message"><span className="spinner" />{busyMessage}</div>}
            {error && <div className="stage-error"><b>Unable to continue</b><span>{error}</span><button type="button" onClick={() => setError(undefined)}>Dismiss</button></div>}
          </div>
          <div className="transport">
            <div className="transport__slide"><span>{String(Math.max(0, (session?.currentSlideIndex ?? -1) + 1)).padStart(2, '0')}</span><b>{currentSlide?.name ?? 'No slide'}</b></div>
            <div className="transport__controls">
              <button type="button" aria-label="Previous slide" onClick={() => session?.previous()}>←</button>
              <button
                className="play-button"
                type="button"
                aria-label={session?.isPlaying ? 'Pause' : 'Play'}
                onClick={() => session?.isPlaying ? session.pause() : session?.play()}
              >{session?.isPlaying ? 'Ⅱ' : '▶'}</button>
              <button type="button" aria-label="Next slide" onClick={() => session?.next()}>→</button>
            </div>
            <div className="transport__hint">← → navigate <i /> space plays</div>
          </div>
        </section>

        <aside className="inspector panel">
          <div className="panel-heading">
            <div><span className="eyebrow">EDIT</span><h2>Inspector</h2></div>
            {selectedElement && <span className="type-badge">{selectedElement.type}</span>}
          </div>
          <div className="inspector-scroll">
            <details className="inspector-section inspector-disclosure slide-editing" open>
              <summary><span>Slide settings</span><b>SLIDE</b></summary>
              <div className="inspector-disclosure__body">
                <div className="inspector-control-grid">
                  <label className="compact-field">
                    <span>Background</span>
                    <input
                      aria-label="Scene background color"
                      type="color"
                      value={currentSlide?.background.slice(0, 7) ?? '#11151C'}
                      disabled={!currentSlide}
                      onChange={(event) => updateSceneBackground(event.target.value)}
                    />
                  </label>
                  <label className="compact-field">
                    <span>Transition</span>
                    <select
                      aria-label="Slide transition"
                      value={currentSlide?.transition?.type ?? 'cut'}
                      disabled={!currentSlide}
                      onChange={(event) => updateSlideTransition(event.target.value as 'cut' | 'fade' | 'slide')}
                    >
                      <option value="cut">Cut</option>
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                    </select>
                  </label>
                  <label className="compact-field compact-field--wide">
                    <span>Transition duration (ms)</span>
                    <input
                      aria-label="Transition duration"
                      type="number"
                      min="0"
                      max="10000"
                      step="50"
                      value={currentSlide?.transition?.durationMs ?? 0}
                      disabled={!currentSlide?.transition || currentSlide.transition.type === 'cut'}
                      onChange={(event) => updateSlideTransitionDuration(Number(event.target.value))}
                    />
                  </label>
                </div>
                <label className="compact-range">
                  <span>SBS depth <b>{stereoDepthScale.toFixed(2)}×</b></span>
                  <input aria-label="SBS depth scale" type="range" min="0" max="1.5" step="0.05" value={stereoDepthScale} onChange={(event) => updateStereoDepthScale(Number(event.target.value))} />
                </label>
              </div>
            </details>
            {!selectedElement ? (
              <div className="inspector-empty inspector-empty--compact">
                <MousePointer2 className="inspector-empty__glyph" aria-hidden="true" />
                <b>Select or insert</b>
                <p>Select an element, or choose a tool from the Insert menu above the stage.</p>
              </div>
            ) : (
              <>
              <section className="inspector-section object-summary">
                <span>{selectedElement.type.toUpperCase()}</span>
                <h3>{elementLabel(selectedElement)}</h3>
                <small>{selectedElement.id}</small>
              </section>
              {(selectedElement.type === 'text' || selectedElement.type === 'shape') && (
                <details className="inspector-section inspector-disclosure" open>
                  <summary><span>Text</span><b>CONTENT</b></summary>
                  <div className="inspector-disclosure__body">
                    <label className="stacked-field"><span>Text</span><textarea value={selectedElement.type === 'text' ? selectedElement.text : selectedElement.text ?? ''} onChange={(event) => session?.updateText(selectedElement.id, event.target.value)} /></label>
                    <div className="inspector-control-grid">
                      <label className="compact-field">
                        <span>Size (pt)</span>
                        <input
                          aria-label="Text size"
                          type="number"
                          min="6"
                          max="144"
                          step="1"
                          value={Number(selectedTextSizePoints.toFixed(1))}
                          onChange={(event) => {
                            if (!deckDocument) return;
                            const points = Math.max(6, Math.min(144, Number(event.target.value)));
                            mutateSelectedTextStyle((style) => { style.fontSize = (points * (96 / 72)) / deckDocument.size.height; });
                          }}
                        />
                      </label>
                      <label className="compact-field">
                        <span>Color</span>
                        <input aria-label="Text color" type="color" value={selectedTextStyle?.color.slice(0, 7) ?? '#000000'} onChange={(event) => mutateSelectedTextStyle((style) => { style.color = replaceColorPreservingAlpha(style.color, event.target.value); })} />
                      </label>
                      <label className="compact-field compact-field--wide">
                        <span>Alignment</span>
                        <select aria-label="Text alignment" value={selectedTextStyle?.align ?? 'left'} onChange={(event) => mutateSelectedTextStyle((style) => { style.align = event.target.value as TextStyle['align']; })}>
                          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </details>
              )}
              {selectedElement.type === 'shape' && (
                <details className="inspector-section inspector-disclosure" open>
                  <summary><span>Shape</span><b>STYLE</b></summary>
                  <div className="inspector-disclosure__body">
                    <div className="inspector-control-grid">
                      <label className="compact-field"><span>Fill</span><input aria-label="Shape fill color" type="color" value={selectedElement.fill.slice(0, 7)} onChange={(event) => mutateSelected((element) => { if (element.type === 'shape') element.fill = replaceColorPreservingAlpha(element.fill, event.target.value); })} /></label>
                      <label className="compact-field"><span>Stroke</span><input aria-label="Shape stroke color" type="color" value={selectedElement.stroke.slice(0, 7)} onChange={(event) => mutateSelected((element) => { if (element.type === 'shape') element.stroke = replaceColorPreservingAlpha(element.stroke, event.target.value); })} /></label>
                      <label className="compact-field compact-field--wide"><span>Stroke width</span><input aria-label="Shape stroke width" type="number" min="0" max="50" step="0.5" value={selectedElement.strokeWidth} onChange={(event) => mutateSelected((element) => { if (element.type === 'shape') element.strokeWidth = Math.max(0, Math.min(50, Number(event.target.value))); })} /></label>
                    </div>
                  </div>
                </details>
              )}
              {selectedElementAcceptsPicture && (
                <details className="inspector-section inspector-disclosure" open>
                  <summary><span>Picture</span><b>{selectedElement.type === 'image' ? 'IMAGE' : 'PLACEHOLDER'}</b></summary>
                  <div className="inspector-disclosure__body">
                    <button className="button button--wide inspector-picture-button" type="button" onClick={() => imageInputRef.current?.click()}>
                      {selectedElement.type === 'image' ? 'Replace picture…' : 'Choose picture…'}
                    </button>
                    {selectedElement.type === 'image' && (
                      <>
                        <label className="compact-field">
                          <span>Fit</span>
                          <select aria-label="Picture fit" value={selectedElement.fit} onChange={(event) => mutateSelected((element) => { if (element.type === 'image') element.fit = event.target.value as ImageElement['fit']; })}>
                            <option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option>
                          </select>
                        </label>
                        <label className="stacked-field"><span>Alternative text</span><textarea aria-label="Picture alternative text" value={selectedElement.alt ?? ''} onChange={(event) => mutateSelected((element) => { if (element.type === 'image') element.alt = event.target.value; })} /></label>
                      </>
                    )}
                  </div>
                </details>
              )}
              <details className="inspector-section inspector-disclosure" open>
                <summary><span>Appearance</span><b>ALPHA</b></summary>
                <div className="inspector-disclosure__body">
                  <NumberField label="Opacity / alpha" value={selectedElement.opacity} min={0} max={1} step={0.01} onChange={(value) => mutateSelected((element) => { element.opacity = value; })} />
                </div>
              </details>
              <details className="inspector-section inspector-disclosure" open>
                <summary><span>Position & size</span><b>2D</b></summary>
                <div className="inspector-disclosure__body">
                  <div className="inspector-control-grid frame-grid">
                    <label className="compact-field"><span>X (%)</span><input aria-label="Position X (%)" type="number" min="0" max="100" step="0.1" value={Number((selectedElement.frame.x * 100).toFixed(1))} onChange={(event) => updateFrame('x', Number(event.target.value) / 100)} /></label>
                    <label className="compact-field"><span>Y (%)</span><input aria-label="Position Y (%)" type="number" min="0" max="100" step="0.1" value={Number((selectedElement.frame.y * 100).toFixed(1))} onChange={(event) => updateFrame('y', Number(event.target.value) / 100)} /></label>
                    <label className="compact-field"><span>Width (%)</span><input aria-label="Width (%)" type="number" min="1" max="100" step="0.1" value={Number((selectedElement.frame.width * 100).toFixed(1))} onChange={(event) => updateFrame('width', Number(event.target.value) / 100)} /></label>
                    <label className="compact-field"><span>Height (%)</span><input aria-label="Height (%)" type="number" min="1" max="100" step="0.1" value={Number((selectedElement.frame.height * 100).toFixed(1))} onChange={(event) => updateFrame('height', Number(event.target.value) / 100)} /></label>
                  </div>
                  <NumberField label="Scale X" value={selectedElement.transform.scaleX} min={-3} max={3} step={0.05} onChange={(value) => updateTransform('scaleX', value)} />
                  <NumberField label="Scale Y" value={selectedElement.transform.scaleY} min={-3} max={3} step={0.05} onChange={(value) => updateTransform('scaleY', value)} />
                </div>
              </details>
              <details className="inspector-section inspector-disclosure">
                <summary><span>Spatial transformation</span><b>3D</b></summary>
                <div className="inspector-disclosure__body">
                  <NumberField label="Depth" value={selectedElement.transform.z} min={-0.5} max={1} step={0.01} onChange={(value) => updateTransform('z', value)} />
                  <NumberField label="Rotate X" value={selectedElement.transform.rotationX} min={-180} max={180} step={1} onChange={(value) => updateTransform('rotationX', value)} />
                  <NumberField label="Rotate Y" value={selectedElement.transform.rotationY} min={-180} max={180} step={1} onChange={(value) => updateTransform('rotationY', value)} />
                  <NumberField label="Rotate Z" value={selectedElement.transform.rotationZ} min={-180} max={180} step={1} onChange={(value) => updateTransform('rotationZ', value)} />
                  <NumberField label="Thickness" value={selectedElement.thickness ?? 0} min={0} max={1} step={0.01} onChange={(value) => mutateSelected((element) => { element.thickness = value; })} />
                </div>
              </details>
              <details className="inspector-section inspector-disclosure">
                <summary><span>Physics</span><b>{selectedElement.physics ? 'ON' : 'OFF'}</b></summary>
                <div className="inspector-disclosure__body">
                  <div className="physics-enable-row"><span>Enable simulation</span><label className="toggle"><input aria-label="Enable physics" type="checkbox" checked={Boolean(selectedElement.physics)} onChange={(event) => session?.updateElementPhysics(selectedElement.id, event.target.checked ? { body: 'fixed', shape: 'cuboid', density: 1, restitution: 0.2, friction: 0.5 } : undefined)} /><span /></label></div>
                  {selectedElement.physics && (
                    <div className="physics-grid">
                      <label><span>Body</span><select value={selectedElement.physics.body} onChange={(event) => updatePhysics({ body: event.target.value as ElementPhysics['body'] })}><option value="fixed">Fixed</option><option value="dynamic">Dynamic</option><option value="kinematic">Kinematic</option><option value="sensor">Sensor</option></select></label>
                      <label><span>Collider</span><select value={selectedElement.physics.shape} onChange={(event) => updatePhysics({ shape: event.target.value as ElementPhysics['shape'] })}><option value="cuboid">Cuboid</option><option value="ball">Ball</option></select></label>
                      <label><span>Density</span><input type="number" min="0" step="0.1" value={selectedElement.physics.density} onChange={(event) => updatePhysics({ density: Number(event.target.value) })} /></label>
                      <label><span>Bounce</span><input type="number" min="0" max="1" step="0.1" value={selectedElement.physics.restitution} onChange={(event) => updatePhysics({ restitution: Number(event.target.value) })} /></label>
                      <label><span>Friction</span><input type="number" min="0" max="2" step="0.1" value={selectedElement.physics.friction} onChange={(event) => updatePhysics({ friction: Number(event.target.value) })} /></label>
                    </div>
                  )}
                </div>
              </details>
              <section className="inspector-section inspector-actions">
                <button type="button" onClick={() => mutateSelected((element) => { element.visible = !element.visible; })}>{selectedElement.visible ? 'Hide object' : 'Show object'}</button>
                <button className="danger" type="button" onClick={removeSelectedElement}>Remove</button>
              </section>
              </>
            )}
          </div>
          <div className="layer-list">
            <div className="layer-list__heading"><span>LAYERS</span><b>{currentSlide?.elements.length ?? 0}</b></div>
            <div>
              {currentSlide?.elements.map((element) => (
                <button key={element.id} type="button" className={element.id === selectedElementId ? 'is-active' : ''} onClick={() => setSelectedElementId(element.id)}>
                  <span className={`layer-icon layer-icon--${element.type}`}>
                    {element.type === 'text' ? <Type aria-hidden="true" /> : element.type === 'image' ? <ImageIcon aria-hidden="true" /> : element.type === 'chart' ? <ChartColumn aria-hidden="true" /> : element.type === 'table' ? <Table2 aria-hidden="true" /> : <Shapes aria-hidden="true" />}
                  </span>
                  <span>{elementLabel(element)}</span><i>{element.visible ? <Eye aria-label="Visible" /> : <EyeOff aria-label="Hidden" />}</i>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
