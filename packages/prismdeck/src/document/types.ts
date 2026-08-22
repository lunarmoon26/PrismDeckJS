export const PRISMDECK_SCHEMA_VERSION = '0.1.0' as const;
export const PRISMDECK_MIME_TYPE = 'application/vnd.prismdeck+zip' as const;

export type SourceFormat = 'pptx' | 'odp' | 'prismdeck' | 'native';
export type DocumentKind = 'presentation' | 'template';

export interface DeckMetadata {
  title: string;
  author?: string;
  description?: string;
  createdAt?: string;
  modifiedAt?: string;
  sourceFormat?: SourceFormat;
}

export interface DeckSize {
  width: number;
  height: number;
}

export interface ElementFrame {
  /** Normalized from the left edge of the slide. */
  x: number;
  /** Normalized from the top edge of the slide. */
  y: number;
  width: number;
  height: number;
}

export interface ElementTransform {
  /** Fraction of slide height. Positive values move toward the camera. */
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
}

export interface ElementPhysics {
  body: 'fixed' | 'dynamic' | 'kinematic' | 'sensor';
  shape: 'cuboid' | 'ball';
  density: number;
  restitution: number;
  friction: number;
}

export interface ElementSource {
  format: SourceFormat;
  part?: string;
  nativeId?: string;
  nativeType?: string;
}

export interface ElementPlaceholder {
  type: string;
  index?: number;
  prompt?: string;
}

export interface DeckElementBase {
  id: string;
  type: DeckElement['type'];
  name: string;
  frame: ElementFrame;
  transform: ElementTransform;
  opacity: number;
  visible: boolean;
  renderOrder: number;
  thickness?: number;
  physics?: ElementPhysics;
  source?: ElementSource;
  placeholder?: ElementPlaceholder;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  color: string;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
}

export interface TextElement extends DeckElementBase {
  type: 'text';
  text: string;
  style: TextStyle;
}

export interface ImageElement extends DeckElementBase {
  type: 'image';
  assetId: string;
  alt?: string;
  fit: 'contain' | 'cover' | 'fill';
}

export interface ShapeElement extends DeckElementBase {
  type: 'shape';
  shape: 'rectangle' | 'roundedRectangle' | 'ellipse' | 'line' | 'custom';
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  textStyle?: TextStyle;
}

export interface TableElement extends DeckElementBase {
  type: 'table';
  rows: string[][];
  headerRows: number;
  fill: string;
  stroke: string;
  textStyle: TextStyle;
}

export interface ChartSeries {
  name: string;
  values: Array<number | null>;
  color?: string;
}

export interface ChartElement extends DeckElementBase {
  type: 'chart';
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'area' | 'unknown';
  categories: string[];
  series: ChartSeries[];
  title?: string;
}

export interface UnsupportedElement extends DeckElementBase {
  type: 'unsupported';
  reason: string;
  fallbackText?: string;
}

export type DeckElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | TableElement
  | ChartElement
  | UnsupportedElement;

export interface DeckLayout {
  id: string;
  name: string;
  elements: DeckElement[];
}

export interface DeckSlide {
  id: string;
  name: string;
  layoutId?: string;
  durationMs: number;
  background: string;
  notes?: string;
  elements: DeckElement[];
}

export interface DeckDocument {
  schemaVersion: typeof PRISMDECK_SCHEMA_VERSION;
  id: string;
  kind: DocumentKind;
  metadata: DeckMetadata;
  size: DeckSize;
  layouts: DeckLayout[];
  slides: DeckSlide[];
}

export interface DeckAsset {
  id: string;
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}

export interface LoadedDeck {
  document: DeckDocument;
  assets: Map<string, DeckAsset>;
}

export type ImportWarningSeverity = 'info' | 'warning' | 'error';

export interface ImportWarning {
  code: string;
  severity: ImportWarningSeverity;
  message: string;
  slideIndex?: number;
  elementId?: string;
  sourcePart?: string;
}

export interface ImportReport {
  format: SourceFormat;
  warnings: ImportWarning[];
  sourceName?: string;
}

export interface ImportResult extends LoadedDeck {
  report: ImportReport;
}

export interface PackageAssetEntry {
  id: string;
  path: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  sha256: string;
}

export interface DeckPackageManifest {
  format: 'prismdeck';
  packageVersion: typeof PRISMDECK_SCHEMA_VERSION;
  document: 'deck.json';
  assets: PackageAssetEntry[];
}

export const DEFAULT_TRANSFORM: ElementTransform = Object.freeze({
  z: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
});

export const DEFAULT_TEXT_STYLE: TextStyle = Object.freeze({
  fontFamily: 'Arial, sans-serif',
  fontSize: 0.04,
  fontWeight: 400,
  fontStyle: 'normal',
  color: '#111111',
  align: 'left',
  verticalAlign: 'top',
  lineHeight: 1.2,
});
