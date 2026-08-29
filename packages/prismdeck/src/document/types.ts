export const PRISMDECK_SCHEMA_VERSION = '0.6.0' as const;
export const LEGACY_PRISMDECK_SCHEMA_VERSION = '0.1.0' as const;
export const PREVIOUS_PRISMDECK_SCHEMA_VERSION = '0.5.0' as const;
export const LEGACY_PRISMDECK_SCHEMA_VERSIONS = [
  LEGACY_PRISMDECK_SCHEMA_VERSION,
  '0.2.0',
  '0.3.0',
  '0.4.0',
  PREVIOUS_PRISMDECK_SCHEMA_VERSION,
] as const;
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

export type SolarBodyKey = 'sol' | 'mercury' | 'venus' | 'earth' | 'luna' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export type GalaxySolarTextureKey = SolarBodyKey | 'earthClouds' | 'earthSpecular' | 'saturnRing' | 'stars';

export interface GalaxySolarSystem {
  textureAssetIds?: Partial<Record<GalaxySolarTextureKey, string>>;
}

export interface GalaxyBackgroundScene {
  type: 'galaxy';
  seed: number;
  starCount: number;
  rotationDegreesPerSecond: number;
  coreColor: string;
  armColor: string;
  solColor: string;
  backdropAssetId?: string;
  solarSystem?: GalaxySolarSystem;
}

export type DeckBackgroundScene = GalaxyBackgroundScene;

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
  /** Scene-unit extrusion depth. Omitted or zero renders as a flat UI plane. */
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

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface BorderStyle {
  color: string;
  width: number;
  style: LineStyle;
}

export interface TableCellBorders {
  top?: BorderStyle;
  right?: BorderStyle;
  bottom?: BorderStyle;
  left?: BorderStyle;
}

export interface TableCellPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TableCellStyle {
  fill?: string;
  textStyle?: TextStyle;
  verticalAlign?: TextStyle['verticalAlign'];
  padding?: TableCellPadding;
  borders?: TableCellBorders;
}

export interface TableCell {
  column: number;
  text: string;
  columnSpan?: number;
  rowSpan?: number;
  header?: boolean;
  style?: TableCellStyle;
}

export interface TableRow {
  /** Relative row-height weight. */
  height: number;
  cells: TableCell[];
}

export interface TableElement extends DeckElementBase {
  type: 'table';
  /** Relative column-width weights. */
  columns: number[];
  rows: TableRow[];
  style: TableCellStyle;
}

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'radar'
  | 'scatter'
  | 'bubble'
  | 'stock'
  | 'surface'
  | 'histogram'
  | 'pareto'
  | 'boxWhisker'
  | 'waterfall'
  | 'treemap'
  | 'sunburst'
  | 'funnel'
  | 'regionMap'
  | 'unknown';

export interface ChartPointStyle {
  color?: string;
  border?: BorderStyle;
}

export interface ChartPoint {
  id?: string;
  parentId?: string;
  label?: string;
  value?: number | null;
  x?: number | null;
  y?: number | null;
  size?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  /** Multi-value data such as [minimum, first quartile, median, third quartile, maximum]. */
  values?: Array<number | null>;
  style?: ChartPointStyle;
}

export interface ChartMarker {
  visible: boolean;
  shape: 'circle' | 'square' | 'diamond' | 'triangle';
  size: number;
}

export interface ChartDataLabels {
  visible: boolean;
  showValue?: boolean;
  showCategory?: boolean;
  showSeries?: boolean;
  showPercent?: boolean;
  position?: string;
  style?: TextStyle;
}

export interface ChartSeries {
  name: string;
  points: ChartPoint[];
  color?: string;
  numberFormat?: string;
  marker?: ChartMarker;
  smooth?: boolean;
  line?: BorderStyle;
  dataLabels?: ChartDataLabels;
}

export interface ChartPlot {
  type: ChartType;
  series: ChartSeries[];
  grouping?: 'standard' | 'clustered' | 'stacked' | 'percentStacked';
  direction?: 'bar' | 'column';
  axisIds?: string[];
  holeSize?: number;
  firstSliceAngle?: number;
}

export interface ChartAxis {
  id: string;
  kind: 'category' | 'date' | 'value';
  position: 'top' | 'right' | 'bottom' | 'left';
  visible: boolean;
  reversed?: boolean;
  title?: string;
  titleStyle?: TextStyle;
  labelStyle?: TextStyle;
  numberFormat?: string;
  minimum?: number;
  maximum?: number;
  majorGridlines?: BorderStyle;
  line?: BorderStyle;
}

export interface ChartLegend {
  visible: boolean;
  position: 'top' | 'right' | 'bottom' | 'left' | 'topRight';
  overlay?: boolean;
  style?: TextStyle;
}

export interface ChartElement extends DeckElementBase {
  type: 'chart';
  plots: ChartPlot[];
  axes: ChartAxis[];
  title?: string;
  titleStyle?: TextStyle;
  legend?: ChartLegend;
  displayBlanksAs?: 'gap' | 'zero' | 'span';
  background?: string;
  plotBackground?: string;
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

export type SlideTransitionType = 'cut' | 'fade' | 'slide';

export interface SlideTransition {
  type: SlideTransitionType;
  durationMs: number;
}

export type ElementAnimationKind = 'entrance' | 'emphasis' | 'exit' | 'motion';
export type ElementAnimationTrigger = 'on-enter' | 'with-previous' | 'after-previous' | 'on-click';
export type ElementAnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type ElementAnimationFill = 'hold' | 'remove';

export interface MotionPathPoint {
  /** Slide-width and slide-height fractions relative to the authored frame. */
  x: number;
  y: number;
}

export interface MotionPath {
  from: MotionPathPoint;
  to: MotionPathPoint;
}

interface ElementAnimationClipBase {
  id: string;
  targetId: string;
  kind: ElementAnimationKind;
  trigger: ElementAnimationTrigger;
  delayMs: number;
  durationMs: number;
  easing: ElementAnimationEasing;
  repeat: number;
  fill: ElementAnimationFill;
}

export interface EntranceAnimationClip extends ElementAnimationClipBase {
  kind: 'entrance';
  effect: 'fade';
}

export interface EmphasisAnimationClip extends ElementAnimationClipBase {
  kind: 'emphasis';
  effect: 'pulse';
}

export interface ExitAnimationClip extends ElementAnimationClipBase {
  kind: 'exit';
  effect: 'fade';
}

export interface MotionAnimationClip extends ElementAnimationClipBase {
  kind: 'motion';
  effect: 'path';
  path: MotionPath;
}

export type ElementAnimationClip =
  | EntranceAnimationClip
  | EmphasisAnimationClip
  | ExitAnimationClip
  | MotionAnimationClip;

export interface SlideTimeline {
  clips: ElementAnimationClip[];
}

export interface BackgroundCamera {
  x: number;
  y: number;
  z: number;
  distance?: number;
  view?: 'top' | 'tilt' | 'horizon';
  focusBody?: SolarBodyKey;
  orbitAzimuthDegrees?: number;
  orbitElevationDegrees?: number;
  transitionDurationMs?: number;
}

export interface DeckSlide {
  id: string;
  name: string;
  layoutId?: string;
  durationMs: number;
  transition?: SlideTransition;
  timeline?: SlideTimeline;
  backgroundCamera?: BackgroundCamera;
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
  backgroundScene?: DeckBackgroundScene;
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
