import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Plane,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import {
  DEFAULT_TEXT_STYLE,
  type BorderStyle,
  type ChartElement,
  type DeckBackgroundScene,
  type DeckElement,
  type DeckSize,
  type ElementFrame,
  type ImageElement,
  type GalaxySolarTextureKey,
  type ShapeElement,
  type SlideTransition,
  type TableCellStyle,
  type TableElement,
  type TextStyle,
} from '../document/types';
import { PresentationSession, type SessionChangeDetail } from '../runtime/session';
import {
  backgroundSceneSignature,
  createBackgroundScene,
  type BackgroundSceneRuntime,
} from './background';
import { renderChartSvg } from './chart';
import {
  configureStereoCameraRig,
  DEFAULT_STEREO_EYE_SEPARATION_RATIO,
  logarithmicStereoEyeSeparationRatio,
  OUTPUT_PRESETS,
  scaledStereoEyeSeparationRatio,
  type OutputMode,
} from './stereo';

export interface DeckRendererOptions {
  outputMode?: OutputMode;
  antialias?: boolean;
  fovDegrees?: number;
  /** Absolute scene-unit separation. Prefer eyeSeparationRatio for convergence-relative calibration. */
  eyeSeparation?: number;
  eyeSeparationRatio?: number;
  stereoDepthScale?: number;
  overlayCanvas?: HTMLCanvasElement;
  clearColor?: string;
  pixelRatio?: number;
}

export interface PhysicsTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

export interface ClientPoint {
  x: number;
  y: number;
}

export interface ElementClientQuad {
  topLeft: ClientPoint;
  topRight: ClientPoint;
  bottomRight: ClientPoint;
  bottomLeft: ClientPoint;
}

export interface OutputViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasOverlayEntry {
  object: Object3D;
  source: HTMLCanvasElement;
  width: number;
  height: number;
  opacity: number;
  renderOrder: number;
}

interface WebGLSlideTransition {
  type: 'fade' | 'slide';
  startTimeMs: number;
  durationMs: number;
  startPositionX: number;
  materials: Map<Material, { opacity: number; transparent: boolean }>;
}

export interface SlideTransitionFrame {
  opacity: number;
  offsetX: number;
  done: boolean;
}

const SLIDE_HEIGHT = 10;
const MIN_THICKNESS = 0.025;
const MAX_BACKGROUND_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_BACKGROUND_IMAGE_DIMENSION = 8_192;
const MAX_BACKGROUND_IMAGE_PIXELS = 32_000_000;
const MAX_BACKGROUND_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_BACKGROUND_TOTAL_IMAGE_PIXELS = 64_000_000;
const MAX_CONCURRENT_BACKGROUND_IMAGE_DECODES = 3;
const MIN_BACKGROUND_STEREO_SCENE_DISTANCE = 0.16;
const MAX_BACKGROUND_STEREO_SCENE_DISTANCE = 100;
const MIN_BACKGROUND_STEREO_EYE_SEPARATION_RATIO = 0.024;
const MAX_BACKGROUND_STEREO_EYE_SEPARATION_RATIO = 0.04;

export function slideTransitionFrame(
  type: 'fade' | 'slide',
  elapsedMs: number,
  durationMs: number,
  slideWidth: number,
): SlideTransitionFrame {
  const progress = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, elapsedMs / durationMs));
  const eased = progress * progress * (3 - 2 * progress);
  return {
    opacity: type === 'fade' ? eased : 0.35 + eased * 0.65,
    offsetX: type === 'slide' ? (1 - eased) * slideWidth * 0.06 : 0,
    done: progress >= 1,
  };
}

function bytesMatch(data: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => data[offset + index] === value);
}

function jpegDimensions(data: Uint8Array): { width: number; height: number } | undefined {
  if (!bytesMatch(data, 0, [0xff, 0xd8])) return undefined;
  let offset = 2;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) return undefined;
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++]!;
    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda || offset + 2 > data.length) return undefined;
    const length = (data[offset]! << 8) | data[offset + 1]!;
    if (length < 2 || offset + length > data.length) return undefined;
    if (startOfFrameMarkers.has(marker) && length >= 7) {
      return {
        height: (data[offset + 3]! << 8) | data[offset + 4]!,
        width: (data[offset + 5]! << 8) | data[offset + 6]!,
      };
    }
    offset += length;
  }
  return undefined;
}

function backgroundImageDimensions(data: Uint8Array, mimeType: string): { width: number; height: number } | undefined {
  if (data.byteLength === 0 || data.byteLength > MAX_BACKGROUND_IMAGE_BYTES) return undefined;
  if (mimeType === 'image/png' && data.length >= 24 && bytesMatch(data, 0, [137, 80, 78, 71, 13, 10, 26, 10])) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === 'image/jpeg') return jpegDimensions(data);
  if (mimeType !== 'image/webp' || data.length < 30 || !bytesMatch(data, 0, [82, 73, 70, 70]) || !bytesMatch(data, 8, [87, 69, 66, 80])) {
    return undefined;
  }
  const chunk = String.fromCharCode(data[12]!, data[13]!, data[14]!, data[15]!);
  if (chunk === 'VP8X') {
    return {
      width: 1 + data[24]! + (data[25]! << 8) + (data[26]! << 16),
      height: 1 + data[27]! + (data[28]! << 8) + (data[29]! << 16),
    };
  }
  if (chunk === 'VP8 ' && bytesMatch(data, 23, [0x9d, 0x01, 0x2a])) {
    return {
      width: (data[26]! | (data[27]! << 8)) & 0x3fff,
      height: (data[28]! | (data[29]! << 8)) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && data[20] === 0x2f) {
    return {
      width: 1 + data[21]! + ((data[22]! & 0x3f) << 8),
      height: 1 + (data[22]! >> 6) + (data[23]! << 2) + ((data[24]! & 0x0f) << 10),
    };
  }
  return undefined;
}

function isSafeBackgroundImage(data: Uint8Array, mimeType: string): boolean {
  const dimensions = backgroundImageDimensions(data, mimeType);
  return Boolean(
    dimensions &&
    dimensions.width > 0 &&
    dimensions.height > 0 &&
    dimensions.width <= MAX_BACKGROUND_IMAGE_DIMENSION &&
    dimensions.height <= MAX_BACKGROUND_IMAGE_DIMENSION &&
    dimensions.width * dimensions.height <= MAX_BACKGROUND_IMAGE_PIXELS,
  );
}

export function outputViewport(mode: OutputMode, width: number, height: number): OutputViewport {
  const canvasWidth = Math.max(1, width);
  const canvasHeight = Math.max(1, height);
  if (mode !== 'full-sbs') return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

  const outputAspect = OUTPUT_PRESETS[mode].width / OUTPUT_PRESETS[mode].height;
  const viewportWidth = Math.min(canvasWidth, canvasHeight * outputAspect);
  const viewportHeight = viewportWidth / outputAspect;
  return {
    x: (canvasWidth - viewportWidth) / 2,
    y: (canvasHeight - viewportHeight) / 2,
    width: viewportWidth,
    height: viewportHeight,
  };
}

function degrees(value: number): number {
  return (value * Math.PI) / 180;
}

function elementWorldSize(element: DeckElement, size: DeckSize): { width: number; height: number; depth: number } {
  const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
  const thickness = element.thickness ?? 0;
  return {
    width: Math.max(0.01, element.frame.width * slideWidth),
    height: Math.max(0.01, element.frame.height * SLIDE_HEIGHT),
    depth: thickness <= 0 ? 0 : Math.max(MIN_THICKNESS, thickness),
  };
}

export function elementWorldBallRadius(element: DeckElement, size: DeckSize): number {
  const worldSize = elementWorldSize(element, size);
  return Math.max(
    0.01,
    Math.min(
      worldSize.width * Math.abs(element.transform.scaleX),
      worldSize.height * Math.abs(element.transform.scaleY),
    ) / 2,
  );
}

export function elementWorldTransform(element: DeckElement, size: DeckSize): PhysicsTransform & { size: { width: number; height: number; depth: number } } {
  const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
  const worldSize = elementWorldSize(element, size);
  const object = new Object3D();
  object.position.set(
    (element.frame.x + element.frame.width / 2 - 0.5) * slideWidth,
    (0.5 - element.frame.y - element.frame.height / 2) * SLIDE_HEIGHT,
    element.transform.z * SLIDE_HEIGHT,
  );
  object.rotation.set(degrees(element.transform.rotationX), degrees(element.transform.rotationY), degrees(element.transform.rotationZ));
  return {
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
    size: worldSize,
  };
}

export function elementTextureSize(element: DeckElement, deckSize: DeckSize): { width: number; height: number } {
  const deckAspect = deckSize.width / Math.max(1, deckSize.height);
  let width = Math.max(1, element.frame.width * deckAspect * 2048);
  let height = Math.max(1, element.frame.height * 2048);
  const longest = Math.max(width, height);
  const scale = longest > 2048 ? 2048 / longest : longest < 384 ? 384 / longest : 1;
  width *= scale;
  height *= scale;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

function textureCanvas(element: DeckElement, deckSize: DeckSize): HTMLCanvasElement {
  const { width, height } = elementTextureSize(element, deckSize);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function applyFont(context: CanvasRenderingContext2D, style: TextStyle, element: DeckElement): number {
  const fontSize = Math.max(10, (style.fontSize / Math.max(0.001, element.frame.height)) * context.canvas.height);
  context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textAlign = style.align;
  context.textBaseline = 'top';
  return fontSize;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0] ?? '';
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawText(
  context: CanvasRenderingContext2D,
  element: DeckElement,
  text: string,
  style: TextStyle,
): void {
  const fontSize = applyFont(context, style, element);
  const padding = Math.max(8, context.canvas.width * 0.025);
  const lineHeight = fontSize * style.lineHeight;
  const lines = wrapLines(context, text, context.canvas.width - padding * 2);
  const blockHeight = lines.length * lineHeight;
  const startY =
    style.verticalAlign === 'middle'
      ? (context.canvas.height - blockHeight) / 2
      : style.verticalAlign === 'bottom'
        ? context.canvas.height - blockHeight - padding
        : padding;
  const x = style.align === 'center' ? context.canvas.width / 2 : style.align === 'right' ? context.canvas.width - padding : padding;
  lines.forEach((line, index) => context.fillText(line, x, startY + index * lineHeight));
}

function drawShape(context: CanvasRenderingContext2D, element: ShapeElement): void {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.fillStyle = element.fill;
  context.strokeStyle = element.stroke;
  context.lineWidth = Math.max(1, element.strokeWidth * (context.canvas.width / 600));
  const inset = context.lineWidth / 2;
  context.beginPath();
  if (element.shape === 'ellipse') {
    context.ellipse(
      context.canvas.width / 2,
      context.canvas.height / 2,
      context.canvas.width / 2 - inset,
      context.canvas.height / 2 - inset,
      0,
      0,
      Math.PI * 2,
    );
  } else if (element.shape === 'line') {
    context.moveTo(inset, context.canvas.height - inset);
    context.lineTo(context.canvas.width - inset, inset);
  } else if (element.shape === 'roundedRectangle') {
    context.roundRect(inset, inset, context.canvas.width - context.lineWidth, context.canvas.height - context.lineWidth, 28);
  } else {
    context.rect(inset, inset, context.canvas.width - context.lineWidth, context.canvas.height - context.lineWidth);
  }
  if (element.shape !== 'line') context.fill();
  context.stroke();
  if (element.text && element.textStyle) drawText(context, element, element.text, element.textStyle);
}

function mergeTableCellStyle(base: TableCellStyle, override: TableCellStyle | undefined): TableCellStyle {
  return {
    fill: override?.fill ?? base.fill,
    textStyle: { ...DEFAULT_TEXT_STYLE, ...base.textStyle, ...override?.textStyle },
    verticalAlign: override?.verticalAlign ?? override?.textStyle?.verticalAlign ?? base.verticalAlign ?? base.textStyle?.verticalAlign,
    padding: { top: 6, right: 8, bottom: 6, left: 8, ...base.padding, ...override?.padding },
    borders: { ...base.borders, ...override?.borders },
  };
}

function cumulativeWeights(weights: number[], size: number): number[] {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  const offsets = [0];
  let current = 0;
  for (const weight of weights) {
    current += (Math.max(0, weight) / total) * size;
    offsets.push(current);
  }
  return offsets;
}

function scaledBorderWidth(context: CanvasRenderingContext2D, border: BorderStyle): number {
  return Math.max(0.5, border.width * Math.max(0.5, context.canvas.width / 960));
}

function strokeTableBorder(
  context: CanvasRenderingContext2D,
  border: BorderStyle | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  if (!border || border.width <= 0) return;
  context.strokeStyle = border.color;
  context.lineWidth = scaledBorderWidth(context, border);
  context.setLineDash(border.style === 'dotted' ? [context.lineWidth, context.lineWidth * 1.5] : border.style === 'dashed' ? [context.lineWidth * 4, context.lineWidth * 2] : []);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.setLineDash([]);
}

function drawTableCellText(
  context: CanvasRenderingContext2D,
  element: TableElement,
  text: string,
  style: TableCellStyle,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const textStyle = style.textStyle ?? DEFAULT_TEXT_STYLE;
  const scale = Math.max(0.5, context.canvas.width / 960);
  const padding = style.padding ?? { top: 6, right: 8, bottom: 6, left: 8 };
  const left = padding.left * scale;
  const right = padding.right * scale;
  const top = padding.top * scale;
  const bottom = padding.bottom * scale;
  const availableWidth = Math.max(1, width - left - right);
  const availableHeight = Math.max(1, height - top - bottom);
  const fontSize = applyFont(context, textStyle, element);
  const lines = wrapLines(context, text, availableWidth);
  const lineHeight = fontSize * textStyle.lineHeight;
  const blockHeight = lines.length * lineHeight;
  const verticalAlign = style.verticalAlign ?? textStyle.verticalAlign;
  const startY = verticalAlign === 'middle'
    ? y + top + Math.max(0, (availableHeight - blockHeight) / 2)
    : verticalAlign === 'bottom'
      ? y + height - bottom - blockHeight
      : y + top;
  const textX = textStyle.align === 'center' ? x + width / 2 : textStyle.align === 'right' ? x + width - right : x + left;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = textStyle.color;
  context.textAlign = textStyle.align;
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, textX, startY + index * lineHeight, availableWidth));
  context.restore();
}

function drawTable(context: CanvasRenderingContext2D, element: TableElement): void {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  const defaultStyle = mergeTableCellStyle(element.style, undefined);
  context.fillStyle = defaultStyle.fill ?? '#FFFFFF';
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  if (element.rows.length === 0) return;
  const columns = cumulativeWeights(element.columns, context.canvas.width);
  const rows = cumulativeWeights(element.rows.map((row) => row.height), context.canvas.height);
  element.rows.forEach((row, rowIndex) => {
    for (const cell of row.cells) {
      const columnSpan = Math.max(1, cell.columnSpan ?? 1);
      const rowSpan = Math.max(1, cell.rowSpan ?? 1);
      const x = columns[cell.column] ?? 0;
      const right = columns[Math.min(element.columns.length, cell.column + columnSpan)] ?? context.canvas.width;
      const y = rows[rowIndex] ?? 0;
      const bottom = rows[Math.min(element.rows.length, rowIndex + rowSpan)] ?? context.canvas.height;
      const width = Math.max(0, right - x);
      const height = Math.max(0, bottom - y);
      const style = mergeTableCellStyle(defaultStyle, cell.style);
      context.fillStyle = cell.header && !cell.style?.fill ? '#E7E5E4' : style.fill ?? '#FFFFFF';
      context.fillRect(x, y, width, height);
      drawTableCellText(context, element, cell.text, style, x, y, width, height);
      strokeTableBorder(context, style.borders?.top, x, y, right, y);
      strokeTableBorder(context, style.borders?.right, right, y, right, bottom);
      strokeTableBorder(context, style.borders?.bottom, x, bottom, right, bottom);
      strokeTableBorder(context, style.borders?.left, x, y, x, bottom);
    }
  });
}

function drawChart(context: CanvasRenderingContext2D, element: ChartElement): void {
  context.fillStyle = element.background ?? '#FFFFFF';
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  drawText(context, element, element.title || element.name || 'Chart', {
    ...DEFAULT_TEXT_STYLE,
    color: '#57534E',
    align: 'center',
    verticalAlign: 'middle',
  });
}

function imageCanvas(element: ImageElement, deckSize: DeckSize, image: HTMLImageElement): HTMLCanvasElement {
  const canvas = textureCanvas(element, deckSize);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D rendering is unavailable');
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) return canvas;
  if (element.fit === 'fill') {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  const scale = element.fit === 'cover'
    ? Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
    : Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas;
}

function canRenderSlideWithCanvasOverlay(element: DeckElement): boolean {
  return (
    (element.thickness ?? 0) === 0 &&
    element.transform.z === 0 &&
    element.transform.rotationX === 0 &&
    element.transform.rotationY === 0 &&
    !element.physics
  );
}

function canvasTextureFor(element: DeckElement, deckSize: DeckSize): CanvasTexture {
  const canvas = textureCanvas(element, deckSize);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D rendering is unavailable');
  if (element.type === 'text') drawText(context, element, element.text, element.style);
  else if (element.type === 'shape') drawShape(context, element);
  else if (element.type === 'table') drawTable(context, element);
  else if (element.type === 'chart') drawChart(context, element);
  else {
    context.fillStyle = '#FEF2F2';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawText(context, element, element.type === 'unsupported' ? element.fallbackText ?? element.reason : element.name, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 0.04,
      fontWeight: 600,
      fontStyle: 'normal',
      color: '#991B1B',
      align: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.2,
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class DeckRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera();
  readonly leftCamera = new PerspectiveCamera();
  readonly rightCamera = new PerspectiveCamera();
  readonly renderer: WebGLRenderer;
  readonly overlayCanvas?: HTMLCanvasElement;
  private readonly backgroundRenderScene = new Scene();
  private readonly backgroundCamera = new PerspectiveCamera();
  private readonly backgroundLeftCamera = new PerspectiveCamera();
  private readonly backgroundRightCamera = new PerspectiveCamera();
  private readonly slideGroup = new Group();
  private backgroundScene?: BackgroundSceneRuntime;
  private backgroundSceneSignature = '';
  private backgroundCameraSignature = '';
  private backgroundGeneration = 0;
  private readonly cancelBackgroundAssetLoads = new Set<() => void>();
  private readonly elementObjects = new Map<string, Object3D>();
  private readonly textures = new Set<Texture>();
  private readonly materials = new Set<Material>();
  private readonly pendingSurfaceLoads = new Set<Promise<void>>();
  private activeBackgroundImageDecodes = 0;
  private readonly backgroundImageDecodeWaiters: Array<() => void> = [];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly slidePlane = new Plane(new Vector3(0, 0, 1), 0);
  private readonly overlayEntries: CanvasOverlayEntry[] = [];
  private readonly overlayContext?: CanvasRenderingContext2D;
  private session?: PresentationSession;
  private outputMode: OutputMode;
  private width = 1;
  private height = 1;
  private disposed = false;
  private generation = 0;
  private readonly fovDegrees: number;
  private readonly eyeSeparation?: number;
  private readonly eyeSeparationRatio: number;
  private stereoDepthScale: number;
  private cameraDistance = 15;
  private activeDeckSize?: DeckSize;
  private slideUsesCanvasOverlay = false;
  private activeTransitions: Animation[] = [];
  private activeWebGLTransition?: WebGLSlideTransition;
  private sessionChangeListener = (event: Event) => {
    const detail = (event as CustomEvent<SessionChangeDetail>).detail;
    if (detail.reason === 'slide' || detail.reason === 'deck' || detail.reason === 'content') {
      this.rebuild(detail.reason === 'deck', detail.reason === 'slide');
      if (detail.reason === 'slide') this.playSlideTransition(this.session?.currentSlide?.transition);
    }
  };

  constructor(readonly canvas: HTMLCanvasElement, options: DeckRendererOptions = {}) {
    this.outputMode = options.outputMode ?? 'mono';
    this.fovDegrees = options.fovDegrees ?? 40;
    this.eyeSeparation = options.eyeSeparation;
    this.eyeSeparationRatio = options.eyeSeparationRatio ?? DEFAULT_STEREO_EYE_SEPARATION_RATIO;
    this.stereoDepthScale = options.stereoDepthScale ?? 1;
    this.overlayCanvas = options.overlayCanvas;
    this.overlayContext = options.overlayCanvas?.getContext('2d') ?? undefined;
    this.renderer = new WebGLRenderer({ canvas, antialias: options.antialias ?? true, alpha: false });
    this.renderer.setPixelRatio(options.pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(new Color(options.clearColor ?? '#0C0A09'), 1);
    this.renderer.autoClear = false;
    this.scene.add(this.slideGroup);
    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(-4, 8, 12);
    this.scene.add(key);
    this.resize(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1, false);
  }

  attach(session: PresentationSession): void {
    if (this.session === session) return;
    this.detach();
    this.session = session;
    session.addEventListener('change', this.sessionChangeListener);
    this.rebuild(true, false);
  }

  detach(): void {
    this.cancelSlideTransition();
    this.session?.removeEventListener('change', this.sessionChangeListener);
    this.session = undefined;
    this.clearSlide();
    this.clearBackgroundScene();
  }

  setOutputMode(mode: OutputMode): void {
    if (this.outputMode === mode) return;
    this.outputMode = mode;
    if (this.activeDeckSize) this.fitCamera(this.activeDeckSize);
    else this.configureCameras();
  }

  getOutputMode(): OutputMode {
    return this.outputMode;
  }

  setStereoDepthScale(scale: number): void {
    this.stereoDepthScale = Math.max(0, Math.min(1.5, Number.isFinite(scale) ? scale : 1));
    this.configureCameras();
  }

  resize(width: number, height: number, updateStyle = false): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, updateStyle);
    if (this.overlayCanvas) {
      this.overlayCanvas.width = this.canvas.width;
      this.overlayCanvas.height = this.canvas.height;
      if (updateStyle) {
        this.overlayCanvas.style.width = `${this.width}px`;
        this.overlayCanvas.style.height = `${this.height}px`;
      }
    }
    if (this.activeDeckSize) this.fitCamera(this.activeDeckSize);
    else this.configureCameras();
  }

  resizeToPreset(mode = this.outputMode): void {
    this.setOutputMode(mode);
    const preset = OUTPUT_PRESETS[mode];
    this.renderer.setPixelRatio(1);
    this.resize(preset.width, preset.height, false);
  }

  render(timestamp = performance.now()): void {
    if (this.disposed) return;
    this.updateWebGLSlideTransition(timestamp);
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.backgroundScene?.update(reducedMotion ? 0 : timestamp / 1_000);
    this.configureBackgroundCameras();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.clear(true, true, true);
    if (this.outputMode === 'mono') {
      this.renderEye(this.backgroundCamera, this.camera);
    } else {
      const viewport = outputViewport(this.outputMode, this.width, this.height);
      const eyeWidth = Math.floor(viewport.width / 2);
      this.renderer.setScissorTest(true);
      this.renderer.setViewport(viewport.x, viewport.y, eyeWidth, viewport.height);
      this.renderer.setScissor(viewport.x, viewport.y, eyeWidth, viewport.height);
      this.renderEye(this.backgroundLeftCamera, this.leftCamera);
      this.renderer.setViewport(viewport.x + eyeWidth, viewport.y, viewport.width - eyeWidth, viewport.height);
      this.renderer.setScissor(viewport.x + eyeWidth, viewport.y, viewport.width - eyeWidth, viewport.height);
      this.renderEye(this.backgroundRightCamera, this.rightCamera);
      this.renderer.setScissorTest(false);
    }
    this.backgroundScene?.setRenderEyeOffset(0);
    this.renderCanvasOverlay();
  }

  private renderEye(backgroundCamera: PerspectiveCamera, slideCamera: PerspectiveCamera): void {
    if (this.backgroundScene) {
      this.backgroundScene.setRenderEyeOffset(backgroundCamera.position.x);
      this.renderer.render(this.backgroundRenderScene, backgroundCamera);
      this.renderer.clearDepth();
    }
    this.renderer.render(this.scene, slideCamera);
  }

  pick(clientX: number, clientY: number): string | undefined {
    const bounds = this.canvas.getBoundingClientRect();
    const viewport = outputViewport(this.outputMode, bounds.width, bounds.height);
    const viewportX = clientX - bounds.left - viewport.x;
    const viewportY = clientY - bounds.top - viewport.y;
    if (viewportX < 0 || viewportX > viewport.width || viewportY < 0 || viewportY > viewport.height) return undefined;
    const normalizedX = viewportX / viewport.width;
    const normalizedY = viewportY / viewport.height;
    let camera: PerspectiveCamera = this.camera;
    let eyeX = normalizedX;
    if (this.outputMode !== 'mono') {
      const leftEyeWidth = Math.floor(viewport.width / 2);
      const rightEye = viewportX >= leftEyeWidth;
      const eyeWidth = rightEye ? viewport.width - leftEyeWidth : leftEyeWidth;
      camera = rightEye ? this.rightCamera : this.leftCamera;
      eyeX = (viewportX - (rightEye ? leftEyeWidth : 0)) / eyeWidth;
    }
    this.pointer.set(eyeX * 2 - 1, -(normalizedY * 2 - 1));
    this.raycaster.setFromCamera(this.pointer, camera);
    let selected: { object: Object3D; distance: number } | undefined;
    for (const hit of this.raycaster.intersectObjects(Array.from(this.elementObjects.values()), true)) {
      let object: Object3D | null = hit.object;
      while (object && typeof object.userData.elementId !== 'string') object = object.parent;
      if (!object) continue;
      if (
        !selected ||
        hit.distance < selected.distance - 0.00001 ||
        (Math.abs(hit.distance - selected.distance) <= 0.00001 && object.renderOrder > selected.object.renderOrder)
      ) {
        selected = { object, distance: hit.distance };
      }
    }
    return selected?.object.userData.elementId as string | undefined;
  }

  clientPointToSlide(clientX: number, clientY: number, clampToBounds = false): { x: number; y: number } | undefined {
    const size = this.activeDeckSize;
    if (!size) return undefined;
    const bounds = this.canvas.getBoundingClientRect();
    const viewport = outputViewport(this.outputMode, bounds.width, bounds.height);
    const viewportX = clientX - bounds.left - viewport.x;
    const viewportY = clientY - bounds.top - viewport.y;
    if (!clampToBounds && (viewportX < 0 || viewportX > viewport.width || viewportY < 0 || viewportY > viewport.height)) {
      return undefined;
    }
    const constrainedViewportX = Math.max(0, Math.min(viewport.width, viewportX));
    const normalizedX = constrainedViewportX / viewport.width;
    const normalizedY = Math.max(0, Math.min(1, viewportY / viewport.height));
    let camera = this.camera;
    let eyeX = normalizedX;
    if (this.outputMode !== 'mono') {
      const leftEyeWidth = Math.floor(viewport.width / 2);
      const rightEye = constrainedViewportX >= leftEyeWidth;
      const eyeWidth = rightEye ? viewport.width - leftEyeWidth : leftEyeWidth;
      camera = rightEye ? this.rightCamera : this.leftCamera;
      eyeX = (constrainedViewportX - (rightEye ? leftEyeWidth : 0)) / eyeWidth;
    }
    this.pointer.set(eyeX * 2 - 1, -(normalizedY * 2 - 1));
    this.raycaster.setFromCamera(this.pointer, camera);
    const point = this.raycaster.ray.intersectPlane(this.slidePlane, new Vector3());
    if (!point) return undefined;
    const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
    const x = point.x / slideWidth + 0.5;
    const y = 0.5 - point.y / SLIDE_HEIGHT;
    if (!clampToBounds && (x < 0 || x > 1 || y < 0 || y > 1)) return undefined;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  getElementClientQuads(elementId: string): ElementClientQuad[] {
    const object = this.elementObjects.get(elementId);
    const size = this.activeDeckSize;
    const element = object?.userData.element as DeckElement | undefined;
    if (!object || !size || !element) return [];
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return [];
    const viewport = outputViewport(this.outputMode, bounds.width, bounds.height);
    const worldSize = elementWorldSize(element, size);
    this.slideGroup.updateMatrixWorld(true);
    const project = (camera: PerspectiveCamera, viewportX: number, viewportWidth: number): ElementClientQuad => {
      const point = (x: number, y: number): ClientPoint => {
        const projected = new Vector3(x, y, 0).applyMatrix4(object.matrixWorld).project(camera);
        return {
          x: viewportX + (projected.x + 1) * viewportWidth / 2,
          y: viewport.y + (1 - projected.y) * viewport.height / 2,
        };
      };
      return {
        topLeft: point(-worldSize.width / 2, worldSize.height / 2),
        topRight: point(worldSize.width / 2, worldSize.height / 2),
        bottomRight: point(worldSize.width / 2, -worldSize.height / 2),
        bottomLeft: point(-worldSize.width / 2, -worldSize.height / 2),
      };
    };
    if (this.outputMode === 'mono') return [project(this.camera, viewport.x, viewport.width)];
    const eyeWidth = Math.floor(viewport.width / 2);
    return [
      project(this.leftCamera, viewport.x, eyeWidth),
      project(this.rightCamera, viewport.x + eyeWidth, viewport.width - eyeWidth),
    ];
  }

  snapshotCanvas(): HTMLCanvasElement {
    const snapshot = document.createElement('canvas');
    snapshot.width = this.canvas.width;
    snapshot.height = this.canvas.height;
    const context = snapshot.getContext('2d');
    if (!context) throw new Error('Canvas 2D rendering is unavailable');
    context.drawImage(this.canvas, 0, 0);
    if (this.overlayCanvas) context.drawImage(this.overlayCanvas, 0, 0);
    return snapshot;
  }

  getElementObject(elementId: string): Object3D | undefined {
    return this.elementObjects.get(elementId);
  }

  previewElementFrame(elementId: string, frame: ElementFrame): boolean {
    const object = this.elementObjects.get(elementId);
    const size = this.activeDeckSize;
    const element = object?.userData.element as DeckElement | undefined;
    if (!object || !size || !element) return false;
    const current = elementWorldTransform(element, size);
    const next = elementWorldTransform({ ...element, frame }, size);
    object.position.set(next.position.x, next.position.y, next.position.z);
    object.quaternion.set(next.rotation.x, next.rotation.y, next.rotation.z, next.rotation.w);
    object.scale.set(
      element.transform.scaleX * (next.size.width / current.size.width),
      element.transform.scaleY * (next.size.height / current.size.height),
      1,
    );
    object.updateMatrixWorld(true);
    return true;
  }

  applyPhysicsTransforms(transforms: ReadonlyMap<string, PhysicsTransform>): void {
    for (const [elementId, transform] of transforms) {
      const object = this.elementObjects.get(elementId);
      if (!object) continue;
      object.position.set(transform.position.x, transform.position.y, transform.position.z);
      object.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
    }
  }

  async whenReady(): Promise<void> {
    while (this.pendingSurfaceLoads.size > 0) {
      await Promise.allSettled(Array.from(this.pendingSurfaceLoads));
    }
  }

  rebuild(replaceBackground = false, animateBackgroundCamera = false): void {
    if (this.disposed) return;
    this.cancelSlideTransition();
    this.clearSlide();
    const slide = this.session?.currentSlide;
    const document = this.session?.document;
    if (!document) return;
    const backgroundReplaced = this.syncBackgroundScene(document.backgroundScene, document.size, replaceBackground);
    if (!slide) return;
    const cameraSignature = JSON.stringify(slide.backgroundCamera ?? null);
    const cameraChanged = cameraSignature !== this.backgroundCameraSignature;
    if (this.backgroundScene && (backgroundReplaced || animateBackgroundCamera || cameraChanged)) {
      const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const animatesCamera = animateBackgroundCamera || (!backgroundReplaced && cameraChanged);
      const durationMs = animatesCamera && !reducedMotion
        ? slide.backgroundCamera?.transitionDurationMs ?? slide.transition?.durationMs ?? 0
        : 0;
      this.backgroundScene.setCamera(slide.backgroundCamera, durationMs / 1_000);
    }
    this.backgroundCameraSignature = cameraSignature;
    this.activeDeckSize = document.size;
    this.renderer.setClearColor(new Color(slide.background.slice(0, 7)), 1);
    const generation = this.generation;
    const useCanvasOverlay = Boolean(
      this.overlayContext && slide.elements.filter((element) => element.visible).every(canRenderSlideWithCanvasOverlay),
    );
    this.slideUsesCanvasOverlay = useCanvasOverlay;

    for (const element of slide.elements) {
      if (!element.visible) continue;
      const object = this.createElementObject(element, document.size, useCanvasOverlay);
      this.elementObjects.set(element.id, object);
      this.slideGroup.add(object);
      const source = object.userData.overlaySource;
      if (source instanceof HTMLCanvasElement) {
        const world = elementWorldTransform(element, document.size);
        this.overlayEntries.push({
          object,
          source,
          width: world.size.width,
          height: world.size.height,
          opacity: element.opacity,
          renderOrder: element.renderOrder,
        });
      }
      if (element.type === 'image') {
        const pending = this.loadImage(element.id, element.assetId, generation);
        this.pendingSurfaceLoads.add(pending);
        void pending.finally(() => this.pendingSurfaceLoads.delete(pending));
      } else if (element.type === 'chart') {
        const pending = this.loadChart(element.id, element, generation);
        this.pendingSurfaceLoads.add(pending);
        void pending.finally(() => this.pendingSurfaceLoads.delete(pending));
      }
    }
    this.fitCamera(document.size);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.clearSlide();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private createElementObject(element: DeckElement, deckSize: DeckSize, useCanvasOverlay: boolean): Object3D {
    const world = elementWorldTransform(element, deckSize);
    const planar = world.size.depth === 0;
    const spherical = Boolean(
      !planar &&
      element.type === 'shape' &&
      element.shape === 'ellipse' &&
      element.physics?.shape === 'ball',
    );
    const geometry = planar
      ? new PlaneGeometry(world.size.width, world.size.height)
      : spherical
        ? new SphereGeometry(elementWorldBallRadius(element, deckSize), 32, 20)
        : new BoxGeometry(world.size.width, world.size.height, world.size.depth);
    let material: MeshStandardMaterial | MeshBasicMaterial;
    if (element.type === 'image') {
      const placeholder = canvasTextureFor({ ...element, type: 'unsupported', reason: 'Loading image', fallbackText: element.alt ?? element.name }, deckSize);
      this.textures.add(placeholder);
      material = planar
        ? new MeshBasicMaterial({ map: placeholder, transparent: true, opacity: element.opacity, side: DoubleSide })
        : new MeshStandardMaterial({
            map: placeholder,
            transparent: true,
            opacity: element.opacity,
            roughness: 0.72,
            metalness: 0.02,
          });
    } else if (spherical && element.type === 'shape') {
      material = new MeshStandardMaterial({
        color: element.fill,
        transparent: element.opacity < 1,
        opacity: element.opacity,
        roughness: 0.58,
        metalness: 0.08,
      });
    } else if (planar) {
      const texture = canvasTextureFor(element, deckSize);
      this.textures.add(texture);
      material = new MeshBasicMaterial({
        map: texture,
        transparent: element.opacity < 1 || element.type === 'text',
        opacity: element.opacity,
        side: DoubleSide,
      });
    } else {
      const texture = canvasTextureFor(element, deckSize);
      this.textures.add(texture);
      material = new MeshStandardMaterial({
        map: texture,
        transparent: element.opacity < 1 || element.type === 'text',
        opacity: element.opacity,
        roughness: 0.72,
        metalness: 0.02,
      });
    }
    this.materials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(world.position.x, world.position.y, world.position.z);
    mesh.quaternion.set(world.rotation.x, world.rotation.y, world.rotation.z, world.rotation.w);
    if (spherical) {
      mesh.scale.setScalar(1);
    } else {
      mesh.scale.set(element.transform.scaleX, element.transform.scaleY, 1);
    }
    mesh.renderOrder = element.renderOrder;
    mesh.userData.elementId = element.id;
    mesh.userData.element = element;
    const source = material.map?.image;
    const canvasOverlay = Boolean(
      useCanvasOverlay &&
      planar &&
      source instanceof HTMLCanvasElement,
    );
    if (canvasOverlay) {
      material.colorWrite = false;
      material.depthWrite = false;
      mesh.userData.overlaySource = source;
      mesh.userData.canvasOverlay = true;
    }
    return mesh;
  }

  private async loadImage(elementId: string, assetId: string, generation: number): Promise<void> {
    const asset = this.session?.assets.get(assetId);
    if (!asset) return;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(asset.data)], { type: asset.mimeType }));
    try {
      const texture = await new TextureLoader().loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      if (this.disposed || generation !== this.generation) {
        texture.dispose();
        return;
      }
      const object = this.elementObjects.get(elementId);
      if (!(object instanceof Mesh)) {
        texture.dispose();
        return;
      }
      const oldMaterial = object.material as Material;
      const element = object.userData.element as DeckElement | undefined;
      const opacity = element?.opacity ?? oldMaterial.opacity;
      const canvasOverlay = object.userData.canvasOverlay === true;
      const material = object.geometry instanceof PlaneGeometry
        ? new MeshBasicMaterial({ map: texture, transparent: true, opacity, side: DoubleSide })
        : new MeshStandardMaterial({ map: texture, transparent: true, opacity, roughness: 0.72, metalness: 0.02 });
      if (canvasOverlay) {
        material.colorWrite = false;
        material.depthWrite = false;
        if (element?.type === 'image' && texture.image instanceof HTMLImageElement && this.activeDeckSize) {
          const entry = this.overlayEntries.find((candidate) => candidate.object === object);
          if (entry) entry.source = imageCanvas(element, this.activeDeckSize, texture.image);
        }
      }
      object.material = material;
      this.textures.add(texture);
      this.materials.add(material);
      oldMaterial.dispose();
      this.materials.delete(oldMaterial);
    } catch {
      // Keep the visible fallback generated while the image was loading.
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async loadChart(elementId: string, element: ChartElement, generation: number): Promise<void> {
    const object = this.elementObjects.get(elementId);
    if (!(object instanceof Mesh)) return;
    const material = object.material as MeshBasicMaterial | MeshStandardMaterial;
    const texture = material.map;
    const canvas = texture?.image;
    if (!(texture instanceof CanvasTexture) || !(canvas instanceof HTMLCanvasElement)) return;

    let url: string | undefined;
    try {
      const svg = renderChartSvg(element, canvas.width, canvas.height);
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const image = new Image();
      image.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Unable to render chart ${element.id}`));
        image.src = url!;
      });
      if (this.disposed || generation !== this.generation) return;
      const currentObject = this.elementObjects.get(elementId);
      if (currentObject !== object || object.material !== material) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      texture.needsUpdate = true;
    } catch {
      // The synchronous placeholder remains visible when the browser cannot decode SVG.
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  private fitCamera(size: DeckSize): void {
    const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
    const logicalAspect =
      this.outputMode === 'mono' ? this.width / this.height : OUTPUT_PRESETS[this.outputMode].logicalEyeAspect;
    const verticalFov = degrees(this.fovDegrees);
    const distanceForHeight = SLIDE_HEIGHT / 2 / Math.tan(verticalFov / 2);
    const distanceForWidth = slideWidth / 2 / (Math.tan(verticalFov / 2) * logicalAspect);
    this.cameraDistance = Math.max(distanceForHeight, distanceForWidth) * 1.02 + 1;
    this.configureCameras();
    const viewportHeight = this.outputMode === 'mono'
      ? this.height
      : outputViewport(this.outputMode, this.width, this.height).height;
    this.backgroundScene?.setRenderCamera(
      viewportHeight * this.renderer.getPixelRatio() * this.camera.projectionMatrix.elements[5]! * 0.5,
      this.cameraDistance,
    );
  }

  private playSlideTransition(transition: SlideTransition | undefined): void {
    this.cancelSlideTransition();
    if (!transition || transition.type === 'cut' || transition.durationMs === 0) return;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !this.canvas.animate) return;
    const keyframes: Keyframe[] = transition.type === 'fade'
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0.35, transform: 'translate3d(6%, 0, 0)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ];
    if (this.backgroundScene && !this.slideUsesCanvasOverlay) {
      this.activeWebGLTransition = {
        type: transition.type,
        startTimeMs: performance.now(),
        durationMs: transition.durationMs,
        startPositionX: this.slideGroup.position.x,
        materials: new Map(),
      };
      this.updateWebGLSlideTransition(this.activeWebGLTransition.startTimeMs);
      return;
    }
    const targets = this.backgroundScene
      ? this.overlayCanvas ? [this.overlayCanvas] : []
      : this.overlayCanvas ? [this.canvas, this.overlayCanvas] : [this.canvas];
    if (targets.length === 0) return;
    this.activeTransitions = targets.map((target) => target.animate(keyframes, {
      duration: transition.durationMs,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    }));
    for (const animation of this.activeTransitions) {
      const clear = () => {
        this.activeTransitions = this.activeTransitions.filter((candidate) => candidate !== animation);
      };
      animation.addEventListener('finish', clear, { once: true });
      animation.addEventListener('cancel', clear, { once: true });
    }
  }

  private cancelSlideTransition(): void {
    for (const animation of this.activeTransitions) animation.cancel();
    this.activeTransitions = [];
    this.finishWebGLSlideTransition();
  }

  private updateWebGLSlideTransition(timestamp: number): void {
    const transition = this.activeWebGLTransition;
    const size = this.activeDeckSize;
    if (!transition || !size) return;
    const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
    const frame = slideTransitionFrame(transition.type, timestamp - transition.startTimeMs, transition.durationMs, slideWidth);
    this.slideGroup.position.x = transition.startPositionX + frame.offsetX;
    for (const object of this.elementObjects.values()) {
      const element = object.userData.element as DeckElement | undefined;
      object.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of childMaterials) {
          let original = transition.materials.get(material);
          if (!original) {
            original = { opacity: element?.opacity ?? material.opacity, transparent: material.transparent };
            transition.materials.set(material, original);
          }
          const transparent = original.transparent || frame.opacity < 1;
          if (material.transparent !== transparent) {
            material.transparent = transparent;
            material.needsUpdate = true;
          }
          material.opacity = original.opacity * frame.opacity;
        }
      });
    }
    if (frame.done) this.finishWebGLSlideTransition();
  }

  private finishWebGLSlideTransition(): void {
    const transition = this.activeWebGLTransition;
    if (!transition) return;
    this.slideGroup.position.x = transition.startPositionX;
    for (const [material, original] of transition.materials) {
      if (material.transparent !== original.transparent) {
        material.transparent = original.transparent;
        material.needsUpdate = true;
      }
      material.opacity = original.opacity;
    }
    this.activeWebGLTransition = undefined;
  }

  private syncBackgroundScene(scene: DeckBackgroundScene | undefined, size: DeckSize, replace: boolean): boolean {
    const signature = backgroundSceneSignature(scene, size);
    if (!replace && signature === this.backgroundSceneSignature) return false;
    this.clearBackgroundScene();
    if (!scene) return true;
    this.backgroundScene = createBackgroundScene(scene, size);
    this.backgroundSceneSignature = signature;
    this.backgroundRenderScene.add(this.backgroundScene.object);
    let totalImageBytes = 0;
    let totalImagePixels = 0;
    const runtime = this.backgroundScene;
    const scheduleAsset = (assetId: string, apply: (image: HTMLImageElement) => void): void => {
      const asset = this.session?.assets.get(assetId);
      if (!asset || !isSafeBackgroundImage(asset.data, asset.mimeType)) return;
      const dimensions = backgroundImageDimensions(asset.data, asset.mimeType)!;
      const nextBytes = totalImageBytes + asset.data.byteLength;
      const nextPixels = totalImagePixels + dimensions.width * dimensions.height;
      if (nextBytes > MAX_BACKGROUND_TOTAL_IMAGE_BYTES || nextPixels > MAX_BACKGROUND_TOTAL_IMAGE_PIXELS) return;
      totalImageBytes = nextBytes;
      totalImagePixels = nextPixels;
      const pending = this.loadBackgroundAsset(assetId, this.backgroundGeneration, runtime, apply);
      this.pendingSurfaceLoads.add(pending);
      void pending.finally(() => this.pendingSurfaceLoads.delete(pending));
    };
    if (scene.backdropAssetId) {
      scheduleAsset(
        scene.backdropAssetId,
        (image) => runtime.setBackdrop(image),
      );
    }
    for (const [key, assetId] of Object.entries(scene.solarSystem?.textureAssetIds ?? {})) {
      if (!assetId) continue;
      scheduleAsset(
        assetId,
        (image) => runtime.setSolarTexture(key as GalaxySolarTextureKey, image),
      );
    }
    return true;
  }

  private clearBackgroundScene(): void {
    this.backgroundGeneration += 1;
    for (const cancel of this.cancelBackgroundAssetLoads) cancel();
    this.cancelBackgroundAssetLoads.clear();
    if (this.backgroundScene) {
      this.backgroundRenderScene.remove(this.backgroundScene.object);
      this.backgroundScene.dispose();
    }
    this.backgroundScene = undefined;
    this.backgroundSceneSignature = '';
    this.backgroundCameraSignature = '';
  }

  private async loadBackgroundAsset(
    assetId: string,
    generation: number,
    runtime: BackgroundSceneRuntime,
    apply: (image: HTMLImageElement) => void,
  ): Promise<void> {
    const asset = this.session?.assets.get(assetId);
    if (!asset || !isSafeBackgroundImage(asset.data, asset.mimeType)) return;
    await this.acquireBackgroundImageDecode();
    let url: string | undefined;
    let cancelLoad: (() => void) | undefined;
    try {
      if (this.disposed || generation !== this.backgroundGeneration || runtime !== this.backgroundScene) return;
      const objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(asset.data)], { type: asset.mimeType }));
      url = objectUrl;
      const image = new Image();
      image.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        image.onload = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        image.onerror = () => {
          if (settled) return;
          settled = true;
          reject(new Error(`Unable to render background asset ${assetId}`));
        };
        cancelLoad = () => {
          if (settled) return;
          settled = true;
          image.onload = null;
          image.onerror = null;
          image.src = '';
          resolve();
        };
        this.cancelBackgroundAssetLoads.add(cancelLoad);
        image.src = objectUrl;
      });
      if (this.disposed || generation !== this.backgroundGeneration || runtime !== this.backgroundScene) return;
      apply(image);
    } catch {
      // Keep the procedural galaxy visible when its optional backdrop cannot decode.
    } finally {
      if (cancelLoad) this.cancelBackgroundAssetLoads.delete(cancelLoad);
      if (url) URL.revokeObjectURL(url);
      this.releaseBackgroundImageDecode();
    }
  }

  private acquireBackgroundImageDecode(): Promise<void> {
    if (this.activeBackgroundImageDecodes < MAX_CONCURRENT_BACKGROUND_IMAGE_DECODES) {
      this.activeBackgroundImageDecodes += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.backgroundImageDecodeWaiters.push(() => {
        this.activeBackgroundImageDecodes += 1;
        resolve();
      });
    });
  }

  private releaseBackgroundImageDecode(): void {
    this.activeBackgroundImageDecodes = Math.max(0, this.activeBackgroundImageDecodes - 1);
    this.backgroundImageDecodeWaiters.shift()?.();
  }

  private renderCanvasOverlay(): void {
    const context = this.overlayContext;
    const overlay = this.overlayCanvas;
    if (!context || !overlay) return;
    const scaleX = overlay.width / this.width;
    const scaleY = overlay.height / this.height;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    this.slideGroup.updateMatrixWorld(true);
    const entries = [...this.overlayEntries].sort((first, second) => first.renderOrder - second.renderOrder);
    if (this.outputMode === 'mono') {
      for (const entry of entries) this.drawCanvasOverlayEntry(context, entry, this.camera, 0, 0, this.width, this.height);
      return;
    }
    const viewport = outputViewport(this.outputMode, this.width, this.height);
    const eyeWidth = Math.floor(viewport.width / 2);
    for (const entry of entries) {
      this.drawCanvasOverlayEntry(context, entry, this.leftCamera, viewport.x, viewport.y, eyeWidth, viewport.height);
    }
    for (const entry of entries) {
      this.drawCanvasOverlayEntry(
        context,
        entry,
        this.rightCamera,
        viewport.x + eyeWidth,
        viewport.y,
        viewport.width - eyeWidth,
        viewport.height,
      );
    }
  }

  private drawCanvasOverlayEntry(
    context: CanvasRenderingContext2D,
    entry: CanvasOverlayEntry,
    camera: PerspectiveCamera,
    viewportX: number,
    viewportY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const project = (x: number, y: number) => {
      const point = new Vector3(x, y, 0).applyMatrix4(entry.object.matrixWorld).project(camera);
      return {
        x: viewportX + (point.x + 1) * viewportWidth / 2,
        y: viewportY + (1 - point.y) * viewportHeight / 2,
      };
    };
    const topLeft = project(-entry.width / 2, entry.height / 2);
    const topRight = project(entry.width / 2, entry.height / 2);
    const bottomLeft = project(-entry.width / 2, -entry.height / 2);
    context.save();
    context.beginPath();
    context.rect(viewportX, viewportY, viewportWidth, viewportHeight);
    context.clip();
    context.globalAlpha = entry.opacity;
    context.transform(
      (topRight.x - topLeft.x) / entry.source.width,
      (topRight.y - topLeft.y) / entry.source.width,
      (bottomLeft.x - topLeft.x) / entry.source.height,
      (bottomLeft.y - topLeft.y) / entry.source.height,
      topLeft.x,
      topLeft.y,
    );
    context.drawImage(entry.source, 0, 0);
    context.restore();
  }

  private configureCameras(): void {
    const actualAspect = this.width / this.height;
    this.camera.fov = this.fovDegrees;
    this.camera.aspect = this.outputMode === 'mono' ? actualAspect : OUTPUT_PRESETS[this.outputMode].logicalEyeAspect;
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.position.set(0, 0, this.cameraDistance);
    this.camera.quaternion.identity();
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    configureStereoCameraRig(this.leftCamera, this.rightCamera, {
      fovDegrees: this.fovDegrees,
      near: 0.1,
      far: 200,
      distance: this.cameraDistance,
      convergenceDistance: this.cameraDistance,
      eyeSeparation: this.eyeSeparation ?? this.cameraDistance * scaledStereoEyeSeparationRatio(
        this.eyeSeparationRatio,
        this.stereoDepthScale,
      ),
      aspect: OUTPUT_PRESETS[this.outputMode].logicalEyeAspect,
    });
    this.configureBackgroundCameras();
  }

  private configureBackgroundCameras(): void {
    const actualAspect = this.width / this.height;
    this.backgroundCamera.fov = this.fovDegrees;
    this.backgroundCamera.aspect = this.outputMode === 'mono' ? actualAspect : OUTPUT_PRESETS[this.outputMode].logicalEyeAspect;
    this.backgroundCamera.far = 200;
    this.backgroundCamera.position.set(0, 0, this.cameraDistance);
    this.backgroundCamera.quaternion.identity();
    const sceneDistance = this.backgroundScene?.stereoSceneDistance() ?? this.cameraDistance;
    const backgroundNear = Math.max(0.001, Math.min(0.1, sceneDistance * 0.1));
    this.backgroundCamera.near = backgroundNear;
    this.backgroundCamera.updateProjectionMatrix();
    this.backgroundCamera.updateMatrixWorld(true);
    const ratio = logarithmicStereoEyeSeparationRatio(
      sceneDistance,
      MIN_BACKGROUND_STEREO_SCENE_DISTANCE,
      MAX_BACKGROUND_STEREO_SCENE_DISTANCE,
      MIN_BACKGROUND_STEREO_EYE_SEPARATION_RATIO,
      MAX_BACKGROUND_STEREO_EYE_SEPARATION_RATIO,
      this.stereoDepthScale,
    );
    configureStereoCameraRig(this.backgroundLeftCamera, this.backgroundRightCamera, {
      fovDegrees: this.fovDegrees,
      near: backgroundNear,
      far: 200,
      distance: this.cameraDistance,
      convergenceDistance: sceneDistance,
      eyeSeparation: sceneDistance * ratio,
      aspect: OUTPUT_PRESETS[this.outputMode].logicalEyeAspect,
    });
  }

  private clearSlide(): void {
    this.generation += 1;
    this.activeDeckSize = undefined;
    this.slideUsesCanvasOverlay = false;
    for (const child of [...this.slideGroup.children]) {
      this.slideGroup.remove(child);
      child.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
    }
    for (const texture of this.textures) texture.dispose();
    for (const material of this.materials) material.dispose();
    this.textures.clear();
    this.materials.clear();
    this.elementObjects.clear();
    this.overlayEntries.length = 0;
    if (this.overlayContext && this.overlayCanvas) {
      this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }
}
