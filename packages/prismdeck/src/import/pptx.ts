import {
  RECOMMENDED_ZIP_LIMITS,
  buildPresentation,
  materializeAllSlideNodes,
  parseZip,
  type ChartNodeData,
  type GroupNodeData,
  type PicNodeData,
  type PresentationData,
  type ShapeNodeData,
  type SlideNode,
  type TableNodeData,
  type TextBody,
} from '@aiden0z/pptx-renderer';
import { strFromU8 } from 'fflate';
import { unzipWithLimits } from '../document/archive';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  PRISMDECK_SCHEMA_VERSION,
  type BorderStyle,
  type ChartAxis,
  type ChartElement,
  type ChartPlot,
  type ChartPoint,
  type ChartSeries,
  type ChartType,
  type DeckAsset,
  type DeckDocument,
  type DeckElement,
  type DeckLayout,
  type DeckSlide,
  type ElementAnimationClip,
  type ElementFrame,
  type ImportResult,
  type ImportWarning,
  type ShapeElement,
  type TableCellStyle,
  type TableElement,
  type TextElement,
  type TextStyle,
  type UnsupportedElement,
} from '../document/types';
import {
  attributeByLocalName,
  childElements,
  descendants,
  firstDescendant,
  localName,
  parseRelationships,
  parseXmlDocument,
  relationshipsPath,
  resolvePackagePath,
} from './xml';

interface XmlNodeLike {
  attr(name: string): string | undefined;
  child(name: string): XmlNodeLike;
  children(name?: string): XmlNodeLike[];
  allChildren(): XmlNodeLike[];
  text(): string;
  exists(): boolean;
  readonly localName: string;
  readonly element: Element | null;
}

interface RelationshipLike {
  target: string;
  type: string;
}

interface PptxContext {
  presentation: PresentationData;
  files: Record<string, Uint8Array>;
  assets: Map<string, DeckAsset>;
  warnings: ImportWarning[];
  sourceName?: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  emf: 'image/emf',
  wmf: 'image/wmf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
};
const MAX_PPTX_CHART_POINTS = 100_000;
const MAX_PPTX_CHART_SERIES = 100;
const MAX_PPTX_CHART_PLOTS = 25;
const MAX_PPTX_TABLE_COLUMNS = 1_000;
const MAX_PPTX_TABLE_ROWS = 10_000;
const MAX_PPTX_TABLE_CELLS = 100_000;

function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function decodeXml(files: Record<string, Uint8Array>, path: string): string | undefined {
  const bytes = files[path];
  return bytes ? strFromU8(bytes) : undefined;
}

function mimeForPath(path: string): string {
  return MIME_BY_EXTENSION[path.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function normalizeFrame(
  x: number,
  y: number,
  width: number,
  height: number,
  presentation: PresentationData,
): ElementFrame {
  const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
  const presentationWidth = finite(presentation.width, 1) || 1;
  const presentationHeight = finite(presentation.height, 1) || 1;
  return {
    x: finite(x) / presentationWidth,
    y: finite(y) / presentationHeight,
    width: Math.max(0, finite(width)) / presentationWidth,
    height: Math.max(0, finite(height)) / presentationHeight,
  };
}

function normalizeXmlFrame(node: Element, presentation: PresentationData): ElementFrame {
  const xfrm = firstDescendant(node, 'xfrm');
  const off = xfrm ? childElements(xfrm, 'off')[0] : undefined;
  const ext = xfrm ? childElements(xfrm, 'ext')[0] : undefined;
  const x = Number(off?.getAttribute('x') ?? 0) / 9_525;
  const y = Number(off?.getAttribute('y') ?? 0) / 9_525;
  const width = Number(ext?.getAttribute('cx') ?? 0) / 9_525;
  const height = Number(ext?.getAttribute('cy') ?? 0) / 9_525;
  return normalizeFrame(x, y, width, height, presentation);
}

function elementTransform(rotationZ = 0, flipH = false, flipV = false) {
  return {
    ...DEFAULT_TRANSFORM,
    z: 0,
    rotationZ,
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
  };
}

function textFromBody(body: TextBody | undefined): string {
  if (!body) return '';
  return body.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
}

function textFromXml(element: Element): string {
  return descendants(element, 't')
    .map((node) => node.textContent ?? '')
    .join('');
}

function boolAttribute(node: XmlNodeLike | undefined, name: string): boolean {
  const value = node?.attr(name);
  return value === '1' || value === 'true';
}

function colorFromNode(node: XmlNodeLike | undefined, theme?: PresentationData['themes'] extends Map<string, infer T> ? T : never): string | undefined {
  if (!node?.exists()) return undefined;
  const element = node.element;
  if (!element) return undefined;
  const srgb = firstDescendant(element, 'srgbClr');
  if (srgb?.getAttribute('val')) return `#${srgb.getAttribute('val')}`;
  const system = firstDescendant(element, 'sysClr');
  if (system?.getAttribute('lastClr')) return `#${system.getAttribute('lastClr')}`;
  const scheme = firstDescendant(element, 'schemeClr')?.getAttribute('val');
  return scheme ? `#${theme?.colorScheme.get(scheme) ?? '111111'}` : undefined;
}

function themeForLayout(presentation: PresentationData, layoutPath: string | undefined) {
  const masterPath = layoutPath ? presentation.layoutToMaster.get(layoutPath) : undefined;
  const themePath = masterPath ? presentation.masterToTheme.get(masterPath) : undefined;
  return themePath ? presentation.themes.get(themePath) : undefined;
}

function textStyle(
  body: TextBody | undefined,
  presentation: PresentationData,
  theme = presentation.themes.values().next().value,
): TextStyle {
  const paragraph = body?.paragraphs[0];
  const run = paragraph?.runs[0];
  const properties = run?.properties as XmlNodeLike | undefined;
  const paragraphProperties = paragraph?.properties as XmlNodeLike | undefined;
  const sizeHundredths = Number(properties?.attr('sz') ?? 0);
  const pointSize = sizeHundredths > 0 ? sizeHundredths / 100 : 24;
  const fontElement = properties?.element ? firstDescendant(properties.element, 'latin') : undefined;
  const alignment = paragraphProperties?.attr('algn');
  return {
    fontFamily: fontElement?.getAttribute('typeface') || theme?.minorFont.latin || 'Arial, sans-serif',
    fontSize: Math.max(0.012, (pointSize * (96 / 72)) / presentation.height),
    fontWeight: boolAttribute(properties, 'b') ? 700 : 400,
    fontStyle: boolAttribute(properties, 'i') ? 'italic' : 'normal',
    color: colorFromNode(properties, theme) ?? '#111111',
    align: alignment === 'ctr' ? 'center' : alignment === 'r' ? 'right' : 'left',
    verticalAlign: 'top',
    lineHeight: 1.2,
  };
}

function shapeKind(preset: string | undefined): ShapeElement['shape'] {
  if (!preset || preset === 'rect') return 'rectangle';
  if (preset === 'roundRect') return 'roundedRectangle';
  if (preset === 'ellipse') return 'ellipse';
  if (preset.includes('line') || preset.includes('Connector')) return 'line';
  return 'custom';
}

function sourceBase(
  id: string,
  name: string,
  type: DeckElement['type'],
  frame: ElementFrame,
  renderOrder: number,
  sourcePart: string,
  nativeType: string,
  nativeId = id,
  rotation = 0,
  flipH = false,
  flipV = false,
) {
  return {
    id,
    type,
    name,
    frame,
    transform: elementTransform(rotation, flipH, flipV),
    opacity: 1,
    visible: true,
    renderOrder,
    source: { format: 'pptx' as const, part: sourcePart, nativeId, nativeType },
  };
}

function addMediaAssets(context: PptxContext): Map<string, string> {
  const pathToAsset = new Map<string, string>();
  for (const [path, data] of context.presentation.media) {
    const id = stableId('asset', path);
    pathToAsset.set(path, id);
    context.assets.set(id, { id, fileName: fileName(path), mimeType: mimeForPath(path), data });
  }
  return pathToAsset;
}

function relationTarget(
  sourcePart: string,
  relationships: Map<string, RelationshipLike>,
  relationId: string | undefined,
): string | undefined {
  const relation = relationId ? relationships.get(relationId) : undefined;
  return relation ? resolvePackagePath(sourcePart, relation.target) : undefined;
}

function parseCache(cache: Element | undefined, limit = MAX_PPTX_CHART_POINTS): Array<string | number | null> {
  if (!cache) return [];
  const boundedLimit = Math.max(0, Math.min(MAX_PPTX_CHART_POINTS, Math.floor(limit)));
  const declaredCount = Number(firstDescendant(cache, 'ptCount')?.getAttribute('val') ?? 0);
  const count = Number.isFinite(declaredCount)
    ? Math.min(boundedLimit, Math.max(0, Math.floor(declaredCount)))
    : 0;
  const points = new Map<number, string>();
  let maximumIndex = -1;
  for (const point of descendants(cache, 'pt')) {
    const index = Number(point.getAttribute('idx') ?? points.size);
    if (!Number.isInteger(index) || index < 0 || index >= boundedLimit) continue;
    const value = firstDescendant(point, 'v')?.textContent ?? '';
    points.set(index, value);
    maximumIndex = Math.max(maximumIndex, index);
  }
  const length = Math.min(boundedLimit, Math.max(count, maximumIndex + 1, 0));
  return Array.from({ length }, (_, index) => points.get(index) ?? null);
}

function childCache(node: Element | undefined): Element | undefined {
  if (!node) return undefined;
  return firstDescendant(node, 'strCache') ?? firstDescendant(node, 'numCache') ?? firstDescendant(node, 'strLit') ?? firstDescendant(node, 'numLit');
}

type PptxTheme = PresentationData['themes'] extends Map<string, infer Theme> ? Theme : never;

function themeForSourcePart(context: PptxContext, sourcePart: string): PptxTheme | undefined {
  const slideIndex = context.presentation.slides.findIndex((slide) => slide.slidePath === sourcePart);
  const layoutPath = slideIndex >= 0 ? context.presentation.slideToLayout.get(slideIndex) : undefined;
  return themeForLayout(context.presentation, layoutPath) ?? context.presentation.themes.values().next().value;
}

function colorFromElement(element: Element | undefined, theme?: PptxTheme): string | undefined {
  if (!element) return undefined;
  const srgb = firstDescendant(element, 'srgbClr');
  if (srgb?.getAttribute('val')) return `#${srgb.getAttribute('val')}`;
  const system = firstDescendant(element, 'sysClr');
  if (system?.getAttribute('lastClr')) return `#${system.getAttribute('lastClr')}`;
  const scheme = firstDescendant(element, 'schemeClr')?.getAttribute('val');
  return scheme ? `#${theme?.colorScheme.get(scheme) ?? '111111'}` : undefined;
}

function fillColor(element: Element | undefined, theme?: PptxTheme): string | undefined {
  if (!element) return undefined;
  if (childElements(element, 'noFill').length > 0) return '#FFFFFF00';
  return colorFromElement(childElements(element, 'solidFill')[0], theme);
}

function booleanValue(element: Element | undefined, fallback = true): boolean {
  const value = element?.getAttribute('val');
  if (value === undefined || value === null || value === '') return fallback;
  return value === '1' || value === 'true';
}

function numericAttribute(element: Element | undefined, name = 'val'): number | undefined {
  const value = element?.getAttribute(name);
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function lineStyle(element: Element | undefined, theme?: PptxTheme, fallbackColor = '#78716C'): BorderStyle | undefined {
  if (!element) return undefined;
  if (childElements(element, 'noFill').length > 0) return { color: '#00000000', width: 0, style: 'solid' };
  const width = numericAttribute(element, 'w');
  const dash = firstDescendant(element, 'prstDash')?.getAttribute('val') ?? 'solid';
  return {
    color: colorFromElement(childElements(element, 'solidFill')[0], theme) ?? fallbackColor,
    width: width !== undefined && width >= 0 ? width / 12_700 : 1,
    style: dash === 'dot' || dash === 'sysDot' ? 'dotted' : dash === 'solid' ? 'solid' : 'dashed',
  };
}

function directLineStyle(container: Element | undefined, theme?: PptxTheme, fallbackColor?: string): BorderStyle | undefined {
  const properties = container ? childElements(container, 'spPr')[0] : undefined;
  return lineStyle(properties ? childElements(properties, 'ln')[0] : undefined, theme, fallbackColor);
}

function normalizedTextStyleFromXml(
  element: Element | undefined,
  presentation: PresentationData,
  theme?: PptxTheme,
): TextStyle | undefined {
  if (!element) return undefined;
  const properties =
    firstDescendant(element, 'rPr') ?? firstDescendant(element, 'defRPr') ?? firstDescendant(element, 'endParaRPr');
  const paragraphProperties = firstDescendant(element, 'pPr');
  const sizeHundredths = Number(properties?.getAttribute('sz') ?? 0);
  const pointSize = sizeHundredths > 0 ? sizeHundredths / 100 : 14;
  const alignment = paragraphProperties?.getAttribute('algn');
  const latin = properties ? firstDescendant(properties, 'latin')?.getAttribute('typeface') : undefined;
  return {
    fontFamily: latin || theme?.minorFont.latin || DEFAULT_TEXT_STYLE.fontFamily,
    fontSize: Math.max(0.012, (pointSize * (96 / 72)) / presentation.height),
    fontWeight: properties?.getAttribute('b') === '1' || properties?.getAttribute('b') === 'true' ? 700 : 400,
    fontStyle: properties?.getAttribute('i') === '1' || properties?.getAttribute('i') === 'true' ? 'italic' : 'normal',
    color: colorFromElement(properties, theme) ?? DEFAULT_TEXT_STYLE.color,
    align: alignment === 'ctr' ? 'center' : alignment === 'r' ? 'right' : 'left',
    verticalAlign: 'top',
    lineHeight: 1.2,
  };
}

function chartText(element: Element | undefined): string | undefined {
  if (!element) return undefined;
  const rich = firstDescendant(element, 'rich');
  if (rich) {
    const paragraphs = descendants(rich, 'p').map((paragraph) =>
      descendants(paragraph, 't')
        .map((text) => text.textContent ?? '')
        .join(''),
    );
    if (paragraphs.length > 0) return paragraphs.join('\n');
  }
  const cached = parseCache(childCache(element), 1).find((value) => value !== null);
  if (cached !== undefined) return String(cached);
  const value = firstDescendant(element, 'v');
  return value ? value.textContent ?? '' : undefined;
}

function numericCache(node: Element | undefined, limit: number): Array<number | null> {
  return parseCache(childCache(node), limit).map((value) => {
    if (value === null || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  });
}

function categoryCache(node: Element | undefined, limit: number): Array<string | null> {
  const multiLevel = node ? firstDescendant(node, 'multiLvlStrCache') : undefined;
  if (multiLevel) {
    const levels = childElements(multiLevel, 'lvl').slice(0, 32).map((level) => parseCache(level, limit));
    const length = Math.max(0, ...levels.map((level) => level.length));
    return Array.from({ length }, (_, index) => {
      const parts = levels
        .map((level) => level[index])
        .filter((value): value is string | number => value !== null && value !== undefined && String(value) !== '')
        .map(String);
      return parts.length > 0 ? parts.reverse().join(' / ') : null;
    });
  }
  return parseCache(childCache(node), limit).map((value) => (value === null ? null : String(value)));
}

function cacheExceedsLimit(element: Element, limit: number): boolean {
  return (
    descendants(element, 'ptCount').some((pointCount) => Number(pointCount.getAttribute('val')) > limit) ||
    descendants(element, 'pt').some((point) => Number(point.getAttribute('idx')) >= limit)
  );
}

function chartSeriesName(series: Element, index: number): string {
  const text = childElements(series, 'tx')[0];
  if (!text) return `Series ${index + 1}`;
  return chartText(text) ?? '';
}

function chartPointStyles(series: Element, theme?: PptxTheme): Map<number, ChartPoint['style']> {
  const styles = new Map<number, ChartPoint['style']>();
  for (const point of childElements(series, 'dPt')) {
    const index = numericAttribute(childElements(point, 'idx')[0]);
    if (index === undefined || !Number.isInteger(index) || index < 0) continue;
    const properties = childElements(point, 'spPr')[0];
    const color = fillColor(properties, theme);
    const border = lineStyle(properties ? childElements(properties, 'ln')[0] : undefined, theme);
    if (color || border) styles.set(index, { color, border });
  }
  return styles;
}

function chartDataLabels(
  series: Element,
  presentation: PresentationData,
  theme?: PptxTheme,
): ChartSeries['dataLabels'] {
  const labels = childElements(series, 'dLbls')[0];
  if (!labels) return undefined;
  return {
    visible: !booleanValue(childElements(labels, 'delete')[0], false),
    showValue: booleanValue(childElements(labels, 'showVal')[0], false),
    showCategory: booleanValue(childElements(labels, 'showCatName')[0], false),
    showSeries: booleanValue(childElements(labels, 'showSerName')[0], false),
    showPercent: booleanValue(childElements(labels, 'showPercent')[0], false),
    position: childElements(labels, 'dLblPos')[0]?.getAttribute('val') ?? undefined,
    style: normalizedTextStyleFromXml(childElements(labels, 'txPr')[0], presentation, theme),
  };
}

function parseChartSeries(
  seriesNode: Element,
  seriesIndex: number,
  plotType: ChartType,
  presentation: PresentationData,
  theme?: PptxTheme,
  pointLimit = MAX_PPTX_CHART_POINTS,
): ChartSeries {
  const categoriesNode = childElements(seriesNode, 'cat')[0];
  const xNode = childElements(seriesNode, 'xVal')[0];
  const yNode = childElements(seriesNode, 'yVal')[0];
  const valueNode = childElements(seriesNode, 'val')[0] ?? yNode;
  const bubbleNode = childElements(seriesNode, 'bubbleSize')[0];
  const categories = categoryCache(categoriesNode, pointLimit);
  const values = numericCache(valueNode, pointLimit);
  const xValues = numericCache(xNode, pointLimit);
  const yValues = numericCache(yNode, pointLimit);
  const bubbleValues = numericCache(bubbleNode, pointLimit);
  const pointCount = Math.max(categories.length, values.length, xValues.length, yValues.length, bubbleValues.length);
  const pointStyles = chartPointStyles(seriesNode, theme);
  const points: ChartPoint[] = Array.from({ length: pointCount }, (_, index) => {
    const point: ChartPoint = {};
    if (categoriesNode && index < categories.length) point.label = categories[index] ?? '';
    if (xNode || plotType === 'scatter' || plotType === 'bubble') point.x = xValues[index] ?? null;
    if (yNode || plotType === 'scatter' || plotType === 'bubble') point.y = yValues[index] ?? null;
    else point.value = values[index] ?? null;
    if (bubbleNode || plotType === 'bubble') point.size = bubbleValues[index] ?? null;
    const style = pointStyles.get(index);
    if (style) point.style = style;
    return point;
  });
  const properties = childElements(seriesNode, 'spPr')[0];
  const line = lineStyle(properties ? childElements(properties, 'ln')[0] : undefined, theme);
  const markerNode = childElements(seriesNode, 'marker')[0];
  const markerSymbol = markerNode ? childElements(markerNode, 'symbol')[0]?.getAttribute('val') ?? 'circle' : undefined;
  const markerSize = numericAttribute(markerNode ? childElements(markerNode, 'size')[0] : undefined);
  const markerShape =
    markerSymbol === 'square' || markerSymbol === 'diamond' || markerSymbol === 'triangle' ? markerSymbol : 'circle';
  const smooth = childElements(seriesNode, 'smooth')[0];
  const formatContainer = valueNode ?? yNode ?? bubbleNode;
  const numberFormat =
    firstDescendant(formatContainer ?? seriesNode, 'formatCode')?.textContent ??
    firstDescendant(childElements(seriesNode, 'dLbls')[0] ?? seriesNode, 'numFmt')?.getAttribute('formatCode') ??
    undefined;
  return {
    name: chartSeriesName(seriesNode, seriesIndex),
    points,
    color: fillColor(properties, theme) ?? line?.color,
    numberFormat: numberFormat || undefined,
    marker: markerNode
      ? {
          visible: markerSymbol !== 'none',
          shape: markerShape,
          size: markerSize !== undefined && markerSize >= 0 ? markerSize : 5,
        }
      : undefined,
    smooth: smooth ? booleanValue(smooth) : undefined,
    line,
    dataLabels: chartDataLabels(seriesNode, presentation, theme),
  };
}

function chartType(nativeType: string): ChartType {
  switch (nativeType) {
    case 'barChart':
    case 'bar3DChart':
      return 'bar';
    case 'lineChart':
    case 'line3DChart':
      return 'line';
    case 'areaChart':
    case 'area3DChart':
      return 'area';
    case 'pieChart':
    case 'pie3DChart':
      return 'pie';
    case 'doughnutChart':
      return 'doughnut';
    case 'radarChart':
      return 'radar';
    case 'scatterChart':
      return 'scatter';
    case 'bubbleChart':
      return 'bubble';
    case 'stockChart':
      return 'stock';
    case 'surfaceChart':
    case 'surface3DChart':
      return 'surface';
    default:
      return 'unknown';
  }
}

function applyStockPointFields(series: ChartSeries[]): ChartSeries[] {
  const fields = series.length >= 4 ? (['open', 'high', 'low', 'close'] as const) : (['high', 'low', 'close'] as const);
  return series.map((item, index) => {
    const field = fields[index];
    if (!field) return item;
    return {
      ...item,
      points: item.points.map((point) => ({ ...point, [field]: point.value ?? null })),
    };
  });
}

function parseChartPlot(
  element: Element,
  context: PptxContext,
  base: ReturnType<typeof sourceBase>,
  chartPath: string,
  theme?: PptxTheme,
  pointBudget = { remaining: MAX_PPTX_CHART_POINTS, truncated: false },
): ChartPlot {
  const nativeType = localName(element);
  const type = chartType(nativeType);
  if (type === 'unknown') {
    context.warnings.push({
      code: 'PPTX_CHART_UNSUPPORTED',
      severity: 'warning',
      message: `Chart type ${nativeType || 'unknown'} was imported as an unknown plot`,
      elementId: base.id,
      sourcePart: chartPath,
    });
  }
  if (nativeType.includes('3D')) {
    context.warnings.push({
      code: 'PPTX_CHART_3D_APPROXIMATION',
      severity: 'warning',
      message: `${nativeType} was imported as a two-dimensional ${type} plot`,
      elementId: base.id,
      sourcePart: chartPath,
    });
  }
  const seriesElements = childElements(element, 'ser');
  if (seriesElements.length > MAX_PPTX_CHART_SERIES) {
    context.warnings.push({
      code: 'PPTX_CHART_SERIES_TRUNCATED',
      severity: 'warning',
      message: `Chart plot series were limited to ${MAX_PPTX_CHART_SERIES}`,
      elementId: base.id,
      sourcePart: chartPath,
    });
  }
  const series: ChartSeries[] = [];
  for (const [index, seriesNode] of seriesElements.slice(0, MAX_PPTX_CHART_SERIES).entries()) {
    if (pointBudget.remaining <= 0) {
      pointBudget.truncated = true;
      break;
    }
    if (cacheExceedsLimit(seriesNode, pointBudget.remaining)) pointBudget.truncated = true;
    const parsed = parseChartSeries(seriesNode, index, type, context.presentation, theme, pointBudget.remaining);
    pointBudget.remaining -= parsed.points.length;
    series.push(parsed);
  }
  let normalizedSeries = series;
  if (type === 'stock') normalizedSeries = applyStockPointFields(series);
  const groupingValue = childElements(element, 'grouping')[0]?.getAttribute('val');
  const grouping =
    groupingValue === 'standard' || groupingValue === 'clustered' || groupingValue === 'stacked' || groupingValue === 'percentStacked'
      ? groupingValue
      : undefined;
  const barDirection = childElements(element, 'barDir')[0]?.getAttribute('val');
  const axisIds = Array.from(
    new Set(childElements(element, 'axId').map((axis) => axis.getAttribute('val')).filter((id): id is string => Boolean(id))),
  ).slice(0, 4);
  const holeSize = numericAttribute(childElements(element, 'holeSize')[0]);
  const firstSliceAngle = numericAttribute(childElements(element, 'firstSliceAng')[0]);
  return {
    type,
    series: normalizedSeries,
    grouping,
    direction: type === 'bar' ? (barDirection === 'col' ? 'column' : 'bar') : undefined,
    axisIds: axisIds.length > 0 ? axisIds : undefined,
    holeSize: type === 'doughnut' && holeSize !== undefined ? Math.max(0, Math.min(90, holeSize)) : undefined,
    firstSliceAngle:
      (type === 'pie' || type === 'doughnut') && firstSliceAngle !== undefined ? firstSliceAngle : undefined,
  };
}

function parseChartAxis(
  element: Element,
  index: number,
  presentation: PresentationData,
  theme?: PptxTheme,
): ChartAxis {
  const nativeType = localName(element);
  const kind: ChartAxis['kind'] = nativeType === 'valAx' ? 'value' : nativeType === 'dateAx' ? 'date' : 'category';
  const positionValue = childElements(element, 'axPos')[0]?.getAttribute('val');
  const position: ChartAxis['position'] =
    positionValue === 't'
      ? 'top'
      : positionValue === 'r'
        ? 'right'
        : positionValue === 'l'
          ? 'left'
          : positionValue === 'b'
            ? 'bottom'
            : kind === 'value'
              ? 'left'
              : 'bottom';
  const scaling = childElements(element, 'scaling')[0];
  const minimum = numericAttribute(scaling ? childElements(scaling, 'min')[0] : undefined);
  const maximum = numericAttribute(scaling ? childElements(scaling, 'max')[0] : undefined);
  const title = childElements(element, 'title')[0];
  const gridlines = childElements(element, 'majorGridlines')[0];
  const gridlineStyle =
    directLineStyle(gridlines, theme, '#D6D3D1') ??
    (gridlines ? { color: '#D6D3D1', width: 1, style: 'solid' as const } : undefined);
  return {
    id: childElements(element, 'axId')[0]?.getAttribute('val') || `axis-${index + 1}`,
    kind,
    position,
    visible: !booleanValue(childElements(element, 'delete')[0], false),
    reversed: childElements(scaling ?? element, 'orientation')[0]?.getAttribute('val') === 'maxMin' || undefined,
    title: chartText(title),
    titleStyle: normalizedTextStyleFromXml(title, presentation, theme),
    labelStyle: normalizedTextStyleFromXml(childElements(element, 'txPr')[0], presentation, theme),
    numberFormat: childElements(element, 'numFmt')[0]?.getAttribute('formatCode') ?? undefined,
    minimum,
    maximum,
    majorGridlines: gridlineStyle,
    line: directLineStyle(element, theme),
  };
}

function parseChart(
  node: ChartNodeData,
  context: PptxContext,
  base: ReturnType<typeof sourceBase>,
): ChartElement | UnsupportedElement {
  const chart = context.presentation.charts.get(node.chartPath)?.element;
  if (!chart) {
    context.warnings.push({
      code: 'PPTX_CHART_MISSING',
      severity: 'warning',
      message: `Chart data was not found for ${node.name}`,
      elementId: base.id,
      sourcePart: node.chartPath,
    });
    return { ...base, type: 'unsupported', reason: 'Chart data is missing', fallbackText: node.name };
  }

  const chartRoot = localName(chart) === 'chart' ? chart : firstDescendant(chart, 'chart') ?? chart;
  const plotArea = childElements(chartRoot, 'plotArea')[0] ?? firstDescendant(chartRoot, 'plotArea');
  const theme = context.presentation.chartThemes?.get(node.chartPath) ?? themeForSourcePart(context, base.source.part);
  const allPlotElements = plotArea
    ? childElements(plotArea).filter((element) => localName(element).toLowerCase().endsWith('chart'))
    : [];
  const cacheTruncated =
    descendants(chartRoot, 'ptCount').some((element) => Number(element.getAttribute('val')) > MAX_PPTX_CHART_POINTS) ||
    descendants(chartRoot, 'pt').some((element) => Number(element.getAttribute('idx')) >= MAX_PPTX_CHART_POINTS);
  if (allPlotElements.length > MAX_PPTX_CHART_PLOTS) {
    context.warnings.push({
      code: 'PPTX_CHART_PLOTS_TRUNCATED',
      severity: 'warning',
      message: `Chart plots were limited to ${MAX_PPTX_CHART_PLOTS}`,
      elementId: base.id,
      sourcePart: node.chartPath,
    });
  }
  const plotElements = allPlotElements.slice(0, MAX_PPTX_CHART_PLOTS);
  if (plotElements.length === 0) {
    context.warnings.push({
      code: 'PPTX_CHART_UNSUPPORTED',
      severity: 'warning',
      message: 'Chart plot data was imported as an unknown plot',
      elementId: base.id,
      sourcePart: node.chartPath,
    });
  }
  const pointBudget = { remaining: MAX_PPTX_CHART_POINTS, truncated: cacheTruncated };
  const plots =
    plotElements.length > 0
      ? plotElements.map((element) => parseChartPlot(element, context, base, node.chartPath, theme, pointBudget))
      : [{ type: 'unknown' as const, series: [] }];
  if (pointBudget.truncated) {
    context.warnings.push({
      code: 'PPTX_CHART_DATA_TRUNCATED',
      severity: 'warning',
      message: `Chart data was limited to ${MAX_PPTX_CHART_POINTS} points`,
      elementId: base.id,
      sourcePart: node.chartPath,
    });
  }
  const axesById = new Map<string, ChartAxis>();
  if (plotArea) {
    childElements(plotArea)
      .filter((element) => ['catAx', 'dateAx', 'valAx', 'serAx'].includes(localName(element)))
      .forEach((element, index) => {
        const axis = parseChartAxis(element, index, context.presentation, theme);
        if (!axesById.has(axis.id)) axesById.set(axis.id, axis);
      });
  }
  for (const plot of plots) {
    plot.axisIds?.forEach((id, index) => {
      if (axesById.has(id)) return;
      axesById.set(id, {
        id,
        kind: index === 0 ? 'category' : 'value',
        position: index === 0 ? 'bottom' : 'left',
        visible: true,
      });
    });
  }
  const title = childElements(chartRoot, 'title')[0];
  const legendElement = childElements(chartRoot, 'legend')[0];
  const legendPosition = legendElement ? childElements(legendElement, 'legendPos')[0]?.getAttribute('val') : undefined;
  const displayBlanksValue = childElements(chartRoot, 'dispBlanksAs')[0]?.getAttribute('val');
  const chartProperties = childElements(chart, 'spPr')[0];
  const plotProperties = plotArea ? childElements(plotArea, 'spPr')[0] : undefined;
  return {
    ...base,
    type: 'chart',
    plots,
    axes: Array.from(axesById.values()),
    title: chartText(title),
    titleStyle: normalizedTextStyleFromXml(title, context.presentation, theme),
    legend: legendElement
      ? {
          visible: !booleanValue(childElements(legendElement, 'delete')[0], false),
          position:
            legendPosition === 't'
              ? 'top'
              : legendPosition === 'b'
                ? 'bottom'
                : legendPosition === 'l'
                  ? 'left'
                  : legendPosition === 'tr'
                    ? 'topRight'
                    : 'right',
          overlay: booleanValue(childElements(legendElement, 'overlay')[0], false),
          style: normalizedTextStyleFromXml(childElements(legendElement, 'txPr')[0], context.presentation, theme),
        }
      : undefined,
    displayBlanksAs:
      displayBlanksValue === 'gap' || displayBlanksValue === 'zero' || displayBlanksValue === 'span'
        ? displayBlanksValue
        : undefined,
    background: fillColor(chartProperties, theme),
    plotBackground: fillColor(plotProperties, theme),
  };
}

function cellStyle(
  cell: TableNodeData['rows'][number]['cells'][number],
  context: PptxContext,
  theme?: PptxTheme,
): TableCellStyle | undefined {
  const properties = cell.properties as XmlNodeLike | undefined;
  const element = properties?.element ?? undefined;
  const border = (name: string) => lineStyle(element ? childElements(element, name)[0] : undefined, theme);
  const borders = {
    top: border('lnT'),
    right: border('lnR'),
    bottom: border('lnB'),
    left: border('lnL'),
  };
  const hasBorders = Object.values(borders).some(Boolean);
  const marginNames = ['marT', 'marR', 'marB', 'marL'] as const;
  const margins = marginNames.map((name) => Number(properties?.attr(name)));
  const hasPadding = margins.some(Number.isFinite);
  const anchor = properties?.attr('anchor');
  const verticalAlign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : anchor === 't' ? 'top' : undefined;
  const style: TableCellStyle = {
    fill: element ? fillColor(element, theme) : undefined,
    textStyle: cell.textBody ? textStyle(cell.textBody, context.presentation, theme) : undefined,
    verticalAlign,
    padding: hasPadding
      ? {
          top: Number.isFinite(margins[0]) ? Math.max(0, margins[0]! / 9_525) : 4.8,
          right: Number.isFinite(margins[1]) ? Math.max(0, margins[1]! / 9_525) : 9.6,
          bottom: Number.isFinite(margins[2]) ? Math.max(0, margins[2]! / 9_525) : 4.8,
          left: Number.isFinite(margins[3]) ? Math.max(0, margins[3]! / 9_525) : 9.6,
        }
      : undefined,
    borders: hasBorders ? borders : undefined,
  };
  return Object.values(style).some((value) => value !== undefined) ? style : undefined;
}

function inferredTableColumnCount(table: TableNodeData): { count: number; truncated: boolean } {
  let maximum = Math.min(table.columns.length, MAX_PPTX_TABLE_COLUMNS);
  let inspectedCells = 0;
  let truncated = table.columns.length > MAX_PPTX_TABLE_COLUMNS || table.rows.length > MAX_PPTX_TABLE_ROWS;
  rowLoop: for (const row of table.rows.slice(0, MAX_PPTX_TABLE_ROWS)) {
    let column = 0;
    for (const cell of row.cells) {
      if (inspectedCells >= MAX_PPTX_TABLE_CELLS) {
        truncated = true;
        break rowLoop;
      }
      inspectedCells += 1;
      const requestedSpan = Number(cell.gridSpan);
      const span = Number.isFinite(requestedSpan)
        ? Math.min(MAX_PPTX_TABLE_COLUMNS, Math.max(1, Math.floor(requestedSpan)))
        : 1;
      if (requestedSpan > MAX_PPTX_TABLE_COLUMNS) truncated = true;
      if (cell.hMerge || cell.vMerge) {
        if (cell.vMerge && !cell.hMerge) column += span;
        continue;
      }
      column += span;
      maximum = Math.max(maximum, column);
      if (maximum >= MAX_PPTX_TABLE_COLUMNS) {
        maximum = MAX_PPTX_TABLE_COLUMNS;
        if (column > MAX_PPTX_TABLE_COLUMNS) truncated = true;
      }
    }
  }
  return { count: Math.max(1, maximum), truncated };
}

function parseTable(
  table: TableNodeData,
  context: PptxContext,
  base: ReturnType<typeof sourceBase>,
  sourcePart: string,
): TableElement {
  const theme = themeForSourcePart(context, sourcePart);
  const inferredColumns = inferredTableColumnCount(table);
  const columnCount = inferredColumns.count;
  let truncated = inferredColumns.truncated;
  const properties = table.properties as XmlNodeLike | undefined;
  const firstRowValue = properties?.attr('firstRow');
  const firstRowHeader = firstRowValue !== '0' && firstRowValue !== 'false';
  if (table.tableStyleId) {
    context.warnings.push({
      code: 'PPTX_TABLE_STYLE_PARTIAL',
      severity: 'warning',
      message: `Table style ${table.tableStyleId} could not be fully normalized; direct cell formatting was preserved`,
      elementId: base.id,
      sourcePart,
    });
  }
  const defaultBorder = { color: '#78716C', width: 1, style: 'solid' as const };
  const sourceRows = table.rows.slice(0, MAX_PPTX_TABLE_ROWS);
  const rows: TableElement['rows'] = [];
  let inspectedCells = 0;
  for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
    if (inspectedCells >= MAX_PPTX_TABLE_CELLS) {
      truncated = true;
      break;
    }
    const row = sourceRows[rowIndex]!;
    let column = 0;
    const cells: TableElement['rows'][number]['cells'] = [];
    for (const cell of row.cells) {
      if (inspectedCells >= MAX_PPTX_TABLE_CELLS) {
        truncated = true;
        break;
      }
      inspectedCells += 1;
      const requestedColumnSpan = Number(cell.gridSpan);
      const sourceColumnSpan = Number.isFinite(requestedColumnSpan)
        ? Math.min(MAX_PPTX_TABLE_COLUMNS, Math.max(1, Math.floor(requestedColumnSpan)))
        : 1;
      if (requestedColumnSpan > MAX_PPTX_TABLE_COLUMNS) truncated = true;
      if (cell.hMerge || cell.vMerge) {
        if (cell.vMerge && !cell.hMerge) column += sourceColumnSpan;
        continue;
      }
      if (column >= columnCount) continue;
      const columnSpan = Math.min(sourceColumnSpan, columnCount - column);
      const requestedRowSpan = Number(cell.rowSpan);
      const sourceRowSpan = Number.isFinite(requestedRowSpan)
        ? Math.max(1, Math.floor(requestedRowSpan))
        : 1;
      if (sourceRowSpan > MAX_PPTX_TABLE_ROWS) truncated = true;
      const rowSpan = Math.min(sourceRowSpan, sourceRows.length - rowIndex);
      cells.push({
        column,
        text: textFromBody(cell.textBody),
        columnSpan: columnSpan > 1 ? columnSpan : undefined,
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        header: rowIndex === 0 && firstRowHeader ? true : undefined,
        style: cellStyle(cell, context, theme),
      });
      column += sourceColumnSpan;
    }
    rows.push({
      height: Number.isFinite(row.height) && row.height > 0 ? row.height : 1,
      cells,
    });
  }
  rows.forEach((row, rowIndex) => {
    for (const cell of row.cells) {
      const rowSpan = Math.min(cell.rowSpan ?? 1, rows.length - rowIndex);
      cell.rowSpan = rowSpan > 1 ? rowSpan : undefined;
    }
  });
  if (truncated) {
    context.warnings.push({
      code: 'PPTX_TABLE_TRUNCATED',
      severity: 'warning',
      message: `Table import was bounded to ${MAX_PPTX_TABLE_ROWS} rows, ${MAX_PPTX_TABLE_COLUMNS} columns, and ${MAX_PPTX_TABLE_CELLS} cells`,
      elementId: base.id,
      sourcePart,
    });
  }
  return {
    ...base,
    type: 'table',
    columns: Array.from({ length: columnCount }, (_, index) => {
      const width = table.columns[index];
      return Number.isFinite(width) && width! > 0 ? width! : 1;
    }),
    rows,
    style: {
      fill: '#FFFFFF',
      textStyle: {
        ...DEFAULT_TEXT_STYLE,
        fontFamily: theme?.minorFont.latin || DEFAULT_TEXT_STYLE.fontFamily,
        fontSize: 0.026,
      },
      verticalAlign: 'middle',
      padding: { top: 4.8, right: 9.6, bottom: 4.8, left: 9.6 },
      borders: { top: defaultBorder, right: defaultBorder, bottom: defaultBorder, left: defaultBorder },
    },
  };
}

function mapSlideNode(
  node: SlideNode,
  sourcePart: string,
  renderOrder: number,
  context: PptxContext,
  pathToAsset: Map<string, string>,
): DeckElement {
  const id = stableId('element', `${sourcePart}:${node.id}:${renderOrder}`);
  const frame = normalizeFrame(node.position.x, node.position.y, node.size.w, node.size.h, context.presentation);
  const common = sourceBase(
    id,
    node.name || `Element ${renderOrder + 1}`,
    'unsupported',
    frame,
    renderOrder,
    sourcePart,
    node.nodeType,
    String(node.id),
    node.rotation,
    node.flipH,
    node.flipV,
  );
  const placeholder = node.placeholder
    ? { type: node.placeholder.type ?? 'body', index: node.placeholder.idx }
    : undefined;

  if (node.nodeType === 'shape') {
    const shape = node as ShapeNodeData;
    const text = textFromBody(shape.textBody);
    const style = textStyle(shape.textBody, context.presentation);
    if (!shape.presetGeometry && text) {
      return { ...common, type: 'text', text, style, placeholder } satisfies TextElement;
    }
    return {
      ...common,
      type: 'shape',
      shape: shapeKind(shape.presetGeometry),
      fill: colorFromNode(shape.fill as XmlNodeLike | undefined) ?? (text ? '#FFFFFF00' : '#E7E5E4'),
      stroke: colorFromNode(shape.line as XmlNodeLike | undefined) ?? '#44403C',
      strokeWidth: 1,
      text: text || undefined,
      textStyle: text ? style : undefined,
      placeholder,
    } satisfies ShapeElement;
  }

  if (node.nodeType === 'picture') {
    const picture = node as PicNodeData;
    const mediaPath = relationTarget(sourcePart, context.presentation.slides.find((slide) => slide.slidePath === sourcePart)?.rels ?? new Map(), picture.blipEmbed ?? picture.blipLink);
    const assetId = mediaPath ? pathToAsset.get(mediaPath) : undefined;
    if (!assetId) {
      context.warnings.push({
        code: 'PPTX_IMAGE_MISSING',
        severity: 'warning',
        message: `Image data was not found for ${node.name}`,
        elementId: id,
        sourcePart,
      });
      return { ...common, type: 'unsupported', reason: 'Missing image data', fallbackText: node.name, placeholder };
    }
    if (mediaPath?.toLowerCase().endsWith('.emf') || mediaPath?.toLowerCase().endsWith('.wmf')) {
      context.warnings.push({
        code: 'PPTX_VECTOR_IMAGE_FALLBACK',
        severity: 'warning',
        message: `${fileName(mediaPath)} requires EMF/WMF rasterization support`,
        elementId: id,
        sourcePart: mediaPath,
      });
    }
    return { ...common, type: 'image', assetId, alt: node.name, fit: 'contain', placeholder };
  }

  if (node.nodeType === 'table') {
    const table = node as TableNodeData;
    return { ...parseTable(table, context, common, sourcePart), placeholder };
  }

  if (node.nodeType === 'chart') {
    return { ...parseChart(node as ChartNodeData, context, common), placeholder };
  }

  if (node.nodeType === 'group') {
    const group = node as GroupNodeData;
    context.warnings.push({
      code: 'PPTX_GROUP_FLATTENED',
      severity: 'warning',
      message: `Group ${node.name} is represented by a fallback in this release`,
      elementId: id,
      sourcePart,
    });
    return {
      ...common,
      type: 'unsupported',
      reason: `Grouped content with ${group.children.length} children is not yet flattened`,
      fallbackText: node.name,
      placeholder,
    };
  }

  return { ...common, type: 'unsupported', reason: 'Unsupported PPTX node type', placeholder };
}

function xmlNodeFrame(node: XmlNodeLike, presentation: PresentationData): ElementFrame {
  return node.element ? normalizeXmlFrame(node.element, presentation) : { x: 0, y: 0, width: 0, height: 0 };
}

function mapTemplateNode(
  node: XmlNodeLike,
  sourcePart: string,
  renderOrder: number,
  relationships: Map<string, RelationshipLike>,
  context: PptxContext,
  pathToAsset: Map<string, string>,
): DeckElement | undefined {
  const element = node.element;
  if (!element || ['nvGrpSpPr', 'grpSpPr'].includes(node.localName)) return undefined;
  const cNvPr = firstDescendant(element, 'cNvPr');
  const nativeId = cNvPr?.getAttribute('id') ?? String(renderOrder + 1);
  const name = cNvPr?.getAttribute('name') ?? `Layout element ${renderOrder + 1}`;
  const id = stableId('layout-element', `${sourcePart}:${nativeId}:${renderOrder}`);
  const frame = xmlNodeFrame(node, context.presentation);
  const placeholderElement = firstDescendant(element, 'ph');
  const placeholder = placeholderElement
    ? {
        type: placeholderElement.getAttribute('type') ?? 'body',
        index: Number(placeholderElement.getAttribute('idx') ?? 0) || undefined,
        prompt: textFromXml(element) || undefined,
      }
    : undefined;
  const common = sourceBase(id, name, 'unsupported', frame, renderOrder, sourcePart, node.localName, nativeId);

  if (node.localName === 'pic') {
    const blip = firstDescendant(element, 'blip');
    const relationId = blip ? attributeByLocalName(blip, 'embed') ?? attributeByLocalName(blip, 'link') : undefined;
    const mediaPath = relationTarget(sourcePart, relationships, relationId);
    const assetId = mediaPath ? pathToAsset.get(mediaPath) : undefined;
    if (assetId) return { ...common, type: 'image', assetId, alt: name, fit: 'contain', placeholder };
    return { ...common, type: 'unsupported', reason: 'Layout picture has no resolved media', fallbackText: name, placeholder };
  }

  if (node.localName === 'sp' || node.localName === 'cxnSp') {
    const text = textFromXml(element);
    const preset = firstDescendant(element, 'prstGeom')?.getAttribute('prst') ?? undefined;
    if (!preset && text) {
      return {
        ...common,
        type: 'text',
        text,
        style: { ...DEFAULT_TEXT_STYLE, fontSize: placeholder?.type === 'title' || placeholder?.type === 'ctrTitle' ? 0.065 : 0.035 },
        placeholder,
      };
    }
    return {
      ...common,
      type: 'shape',
      shape: shapeKind(preset),
      fill: text ? '#FFFFFF00' : '#E7E5E4',
      stroke: '#44403C',
      strokeWidth: 1,
      text: text || undefined,
      textStyle: text ? DEFAULT_TEXT_STYLE : undefined,
      placeholder,
    };
  }

  return undefined;
}

interface CoordinateMap {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
  rotationZ: number;
}

const IDENTITY_COORDINATE_MAP: CoordinateMap = {
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
  rotationZ: 0,
};

function normalizedEmu(value: string | undefined, dimension: number): number {
  const emu = Number(value);
  return Number.isFinite(emu) && dimension > 0 ? emu / 9_525 / dimension : 0;
}

function groupCoordinateMap(node: XmlNodeLike, context: PptxContext, sourcePart: string): CoordinateMap {
  const xfrm = node.child('grpSpPr').child('xfrm');
  const off = xfrm.child('off');
  const extent = xfrm.child('ext');
  const childOffset = xfrm.child('chOff');
  const childExtent = xfrm.child('chExt');
  const width = normalizedEmu(extent.attr('cx'), context.presentation.width);
  const height = normalizedEmu(extent.attr('cy'), context.presentation.height);
  const childWidth = normalizedEmu(childExtent.attr('cx'), context.presentation.width);
  const childHeight = normalizedEmu(childExtent.attr('cy'), context.presentation.height);
  const scaleX = childWidth > 0 ? width / childWidth : 1;
  const scaleY = childHeight > 0 ? height / childHeight : 1;
  const rotationZ = Number(xfrm.attr('rot') ?? 0) / 60_000;
  const flipH = boolAttribute(xfrm, 'flipH');
  const flipV = boolAttribute(xfrm, 'flipV');
  if (rotationZ !== 0 || flipH || flipV) {
    context.warnings.push({
      code: 'PPTX_GROUP_TRANSFORM_PARTIAL',
      severity: 'warning',
      message: 'Rotated or flipped PowerPoint groups are flattened without rotating child positions',
      sourcePart,
    });
  }
  return {
    scaleX,
    scaleY,
    translateX:
      normalizedEmu(off.attr('x'), context.presentation.width) -
      normalizedEmu(childOffset.attr('x'), context.presentation.width) * scaleX,
    translateY:
      normalizedEmu(off.attr('y'), context.presentation.height) -
      normalizedEmu(childOffset.attr('y'), context.presentation.height) * scaleY,
    rotationZ,
  };
}

function composeCoordinateMaps(parent: CoordinateMap, child: CoordinateMap): CoordinateMap {
  return {
    scaleX: parent.scaleX * child.scaleX,
    scaleY: parent.scaleY * child.scaleY,
    translateX: parent.translateX + child.translateX * parent.scaleX,
    translateY: parent.translateY + child.translateY * parent.scaleY,
    rotationZ: parent.rotationZ + child.rotationZ,
  };
}

function applyCoordinateMap(frame: ElementFrame, map: CoordinateMap): ElementFrame {
  return {
    x: map.translateX + frame.x * map.scaleX,
    y: map.translateY + frame.y * map.scaleY,
    width: Math.max(0, frame.width * Math.abs(map.scaleX)),
    height: Math.max(0, frame.height * Math.abs(map.scaleY)),
  };
}

function flattenTemplateTreeNode(
  node: XmlNodeLike,
  sourcePart: string,
  renderOrder: number,
  relationships: Map<string, RelationshipLike>,
  context: PptxContext,
  pathToAsset: Map<string, string>,
  parentMap: CoordinateMap = IDENTITY_COORDINATE_MAP,
): DeckElement[] {
  if (node.localName === 'grpSp') {
    const coordinateMap = composeCoordinateMaps(parentMap, groupCoordinateMap(node, context, sourcePart));
    const flattened: DeckElement[] = [];
    for (const child of node.allChildren()) {
      flattened.push(
        ...flattenTemplateTreeNode(
          child,
          sourcePart,
          renderOrder + flattened.length,
          relationships,
          context,
          pathToAsset,
          coordinateMap,
        ),
      );
    }
    return flattened;
  }

  const mapped = mapTemplateNode(node, sourcePart, renderOrder, relationships, context, pathToAsset);
  if (mapped) {
    mapped.frame = applyCoordinateMap(mapped.frame, parentMap);
    mapped.transform.rotationZ += parentMap.rotationZ;
    return [mapped];
  }
  if (node.localName === 'graphicFrame' && node.element) {
    const cNvPr = firstDescendant(node.element, 'cNvPr');
    const name = cNvPr?.getAttribute('name') ?? `Grouped object ${renderOrder + 1}`;
    const id = stableId('group-element', `${sourcePart}:${cNvPr?.getAttribute('id') ?? renderOrder}`);
    context.warnings.push({
      code: 'PPTX_GROUP_CONTENT_UNSUPPORTED',
      severity: 'warning',
      message: `${name} is nested in a group and uses unsupported graphic-frame content`,
      elementId: id,
      sourcePart,
    });
    return [
      {
        ...sourceBase(
          id,
          name,
          'unsupported',
          applyCoordinateMap(normalizeXmlFrame(node.element, context.presentation), parentMap),
          renderOrder,
          sourcePart,
          'graphicFrame',
          cNvPr?.getAttribute('id') ?? String(renderOrder),
          parentMap.rotationZ,
        ),
        type: 'unsupported',
        reason: 'Grouped table or chart content is unsupported',
        fallbackText: name,
      },
    ];
  }
  return [];
}

function layoutName(context: PptxContext, path: string): string {
  const xml = decodeXml(context.files, path);
  if (!xml) return fileName(path).replace(/\.xml$/i, '');
  const document = parseXmlDocument(xml, path);
  return firstDescendant(document, 'cSld')?.getAttribute('name') || fileName(path).replace(/\.xml$/i, '');
}

function mapLayouts(context: PptxContext, pathToAsset: Map<string, string>): DeckLayout[] {
  const layouts: DeckLayout[] = [];
  for (const [layoutPath, layout] of context.presentation.layouts) {
    const nodes: DeckElement[] = [];
    const masterPath = context.presentation.layoutToMaster.get(layoutPath);
    const master = masterPath ? context.presentation.masters.get(masterPath) : undefined;
    if (layout.showMasterSp && master && masterPath) {
      master.spTree.allChildren().forEach((node, index) => {
        const mapped = flattenTemplateTreeNode(
          node as XmlNodeLike,
          masterPath,
          nodes.length + index,
          master.rels as Map<string, RelationshipLike>,
          context,
          pathToAsset,
        );
        nodes.push(...mapped.filter((element) => !element.placeholder));
      });
    }
    layout.spTree.allChildren().forEach((node, index) => {
      const mapped = flattenTemplateTreeNode(
        node as XmlNodeLike,
        layoutPath,
        nodes.length + index,
        layout.rels as Map<string, RelationshipLike>,
        context,
        pathToAsset,
      );
      nodes.push(...mapped);
    });
    layouts.push({ id: stableId('layout', layoutPath), name: layoutName(context, layoutPath), elements: nodes });
  }
  return layouts;
}

function directColor(background: XmlNodeLike | undefined, theme: ReturnType<typeof themeForLayout>): string {
  return colorFromNode(background, theme) ?? '#FFFFFF';
}

function notesForSlide(context: PptxContext, slidePath: string): string | undefined {
  const relsXml = decodeXml(context.files, relationshipsPath(slidePath));
  if (!relsXml) return undefined;
  const notesRelation = Array.from(parseRelationships(relsXml, slidePath).values()).find((relation) => relation.type === 'notesSlide');
  if (!notesRelation || notesRelation.external) return undefined;
  const notesXml = decodeXml(context.files, notesRelation.resolvedTarget);
  if (!notesXml) return undefined;
  const document = parseXmlDocument(notesXml, notesRelation.resolvedTarget);
  const values = descendants(document, 't').map((element) => element.textContent?.trim()).filter(Boolean);
  return values.length > 0 ? values.join('\n') : undefined;
}

interface PptxAnimationTiming {
  trigger: ElementAnimationClip['trigger'];
  delayMs: number;
  durationMs: number;
  easing: 'linear';
  repeat: number;
  fill: 'hold' | 'remove';
}

function pptxAnimationWarning(
  context: PptxContext,
  slideIndex: number,
  sourcePart: string,
  code: string,
  message: string,
  elementId?: string,
): void {
  context.warnings.push({ code, severity: 'warning', message, slideIndex, elementId, sourcePart });
}

function parsePptxAnimationMs(value: string | null | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return 0;
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return undefined;
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 600_000 ? milliseconds : undefined;
}

function pptxAnimationTrigger(behavior: Element): ElementAnimationClip['trigger'] | undefined {
  for (let node: Element | null = behavior; node; node = node.parentElement) {
    const nodeType = node.getAttribute('nodeType');
    if (nodeType === 'clickEffect') return 'on-click';
    if (nodeType === 'withEffect') return 'with-previous';
    if (nodeType === 'afterEffect') return 'after-previous';
  }
  const event = descendants(behavior, 'cond').map((condition) => condition.getAttribute('evt')).find(Boolean);
  if (!event) return 'on-enter';
  return event === 'onClick' ? 'on-click' : undefined;
}

function pptxAnimationTiming(behavior: Element): PptxAnimationTiming | undefined {
  const timing = firstDescendant(behavior, 'cTn');
  if (!timing) return undefined;
  const trigger = pptxAnimationTrigger(behavior);
  const durationMs = parsePptxAnimationMs(timing.getAttribute('dur') ?? '500');
  const delayValue = descendants(timing, 'cond').map((condition) => condition.getAttribute('delay')).find((value) => value !== null);
  const delayMs = parsePptxAnimationMs(delayValue);
  const repeatValue = timing.getAttribute('repeatCount');
  const repeat = repeatValue === null ? 1 : Number(repeatValue);
  if (!trigger || durationMs === undefined || delayMs === undefined || !Number.isInteger(repeat) || repeat < 1 || repeat > 100) {
    return undefined;
  }
  return {
    trigger,
    delayMs,
    durationMs,
    easing: 'linear',
    repeat,
    fill: timing.getAttribute('fill') === 'remove' ? 'remove' : 'hold',
  };
}

function pptxMotionPath(path: string | null): { from: { x: number; y: number }; to: { x: number; y: number } } | undefined {
  if (!path) return undefined;
  const number = '(-?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+))';
  const match = new RegExp(`^\\s*M\\s*${number}[,\\s]+${number}\\s*L\\s*${number}[,\\s]+${number}\\s*(?:E\\s*)?$`, 'i').exec(path);
  if (!match) return undefined;
  const values = match.slice(1).map(Number);
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 10)) return undefined;
  return { from: { x: values[0]!, y: values[1]! }, to: { x: values[2]!, y: values[3]! } };
}

function pptxScalePair(node: Element | undefined, expected: number): boolean {
  if (!node) return false;
  const values = [node.getAttribute('x'), node.getAttribute('y')].map((value) => Number(value));
  return values.every((value) => {
    const normalized = Math.abs(value) > 10 ? value / 100_000 : value;
    return Number.isFinite(normalized) && Math.abs(normalized - expected) < 0.0001;
  });
}

function isPptxPulseScale(behavior: Element): boolean {
  const by = firstDescendant(behavior, 'by');
  if (by) return pptxScalePair(by, 1.08);
  const from = firstDescendant(behavior, 'from');
  const to = firstDescendant(behavior, 'to');
  if (from || to) return pptxScalePair(from, 1) && pptxScalePair(to, 1.08);
  return true;
}

function mapPptxTimeline(
  context: PptxContext,
  slidePath: string,
  slideIndex: number,
  elements: DeckElement[],
): DeckSlide['timeline'] | undefined {
  const xml = decodeXml(context.files, slidePath);
  if (!xml) return undefined;
  const document = parseXmlDocument(xml, slidePath);
  const timing = firstDescendant(document, 'timing');
  if (!timing) return undefined;
  const elementsByNativeId = new Map(
    elements.flatMap((element) => element.source?.nativeId ? [[element.source.nativeId, element.id] as const] : []),
  );
  const behaviors = Array.from(timing.getElementsByTagName('*')).filter((element) =>
    ['animEffect', 'animScale', 'animMotion', 'anim', 'animRot', 'set', 'cmd'].includes(localName(element)),
  );
  const clips: ElementAnimationClip[] = [];
  for (let index = 0; index < behaviors.length; index += 1) {
    const behavior = behaviors[index]!;
    const type = localName(behavior);
    const targetNativeId = firstDescendant(behavior, 'spTgt')?.getAttribute('spid') ?? undefined;
    const targetId = targetNativeId ? elementsByNativeId.get(targetNativeId) : undefined;
    if (!targetId) {
      pptxAnimationWarning(
        context,
        slideIndex,
        slidePath,
        'PPTX_ANIMATION_TARGET_UNRESOLVED',
        `PowerPoint ${type} animation does not resolve to an imported shape target`,
      );
      continue;
    }
    const fields = pptxAnimationTiming(behavior);
    if (!fields) {
      pptxAnimationWarning(
        context,
        slideIndex,
        slidePath,
        'PPTX_ANIMATION_TIMING_UNSUPPORTED',
        `PowerPoint ${type} animation uses unsupported timing, repeat, or trigger values`,
        targetId,
      );
      continue;
    }
    const id = stableId('animation', `${slidePath}:${targetNativeId}:${index}`);
    if (type === 'animEffect') {
      const filter = behavior.getAttribute('filter')?.trim().toLowerCase();
      if (filter !== 'fade') {
        pptxAnimationWarning(context, slideIndex, slidePath, 'PPTX_ANIMATION_EFFECT_UNSUPPORTED', 'Only PowerPoint fade effects are imported', targetId);
        continue;
      }
      clips.push({
        id,
        targetId,
        kind: behavior.getAttribute('transition') === 'out' ? 'exit' : 'entrance',
        effect: 'fade',
        ...fields,
      });
    } else if (type === 'animScale') {
      if (!isPptxPulseScale(behavior)) {
        pptxAnimationWarning(context, slideIndex, slidePath, 'PPTX_ANIMATION_EFFECT_UNSUPPORTED', 'Only PowerPoint scale effects from 1 to 1.08 are imported as pulses', targetId);
        continue;
      }
      clips.push({ id, targetId, kind: 'emphasis', effect: 'pulse', ...fields });
    } else if (type === 'animMotion') {
      const path = pptxMotionPath(behavior.getAttribute('path'));
      if (!path) {
        pptxAnimationWarning(context, slideIndex, slidePath, 'PPTX_ANIMATION_PATH_UNSUPPORTED', 'Only simple normalized PowerPoint M/L motion paths are imported', targetId);
        continue;
      }
      clips.push({ id, targetId, kind: 'motion', effect: 'path', path, ...fields });
    } else {
      pptxAnimationWarning(context, slideIndex, slidePath, 'PPTX_ANIMATION_EFFECT_UNSUPPORTED', `PowerPoint ${type} animation is not in the supported subset`, targetId);
    }
  }
  if (behaviors.length === 0) {
    pptxAnimationWarning(context, slideIndex, slidePath, 'PPTX_ANIMATION_UNSUPPORTED', 'PowerPoint timing contains no supported element animations');
  }
  return clips.length > 0 ? { clips } : undefined;
}

function backgroundForSlide(context: PptxContext, slideIndex: number): string {
  const slide = context.presentation.slides[slideIndex];
  const layoutPath = context.presentation.slideToLayout.get(slideIndex);
  const layout = layoutPath ? context.presentation.layouts.get(layoutPath) : undefined;
  const masterPath = layoutPath ? context.presentation.layoutToMaster.get(layoutPath) : undefined;
  const master = masterPath ? context.presentation.masters.get(masterPath) : undefined;
  const theme = themeForLayout(context.presentation, layoutPath);
  return directColor((slide?.background ?? layout?.background ?? master?.background) as XmlNodeLike | undefined, theme);
}

function metadata(context: PptxContext): DeckDocument['metadata'] {
  const coreXml = decodeXml(context.files, 'docProps/core.xml');
  if (!coreXml) return { title: context.sourceName?.replace(/\.pptx$/i, '') ?? 'Imported presentation', sourceFormat: 'pptx' };
  const document = parseXmlDocument(coreXml, 'docProps/core.xml');
  const value = (name: string) => firstDescendant(document, name)?.textContent?.trim() || undefined;
  return {
    title: value('title') ?? context.sourceName?.replace(/\.pptx$/i, '') ?? 'Imported presentation',
    author: value('creator'),
    createdAt: value('created'),
    modifiedAt: value('modified'),
    sourceFormat: 'pptx',
  };
}

function mapSlides(context: PptxContext, pathToAsset: Map<string, string>, layouts: DeckLayout[]): DeckSlide[] {
  return context.presentation.slides.map((slide, slideIndex) => {
    const layoutPath = context.presentation.slideToLayout.get(slideIndex);
    const layoutId = layoutPath ? stableId('layout', layoutPath) : undefined;
    const elements: DeckElement[] = [];
    for (const node of slide.nodes) {
      if (node.nodeType === 'group') {
        const relationships = slide.rels as Map<string, RelationshipLike>;
        elements.push(
          ...flattenTemplateTreeNode(
            (node as GroupNodeData).source as XmlNodeLike,
            slide.slidePath,
            elements.length + 1,
            relationships,
            context,
            pathToAsset,
          ),
        );
      } else {
        elements.push(mapSlideNode(node, slide.slidePath, elements.length + 1, context, pathToAsset));
      }
    }
    const timeline = mapPptxTimeline(context, slide.slidePath, slideIndex, elements);
    const title = elements.find((element) => element.placeholder?.type === 'title' || element.placeholder?.type === 'ctrTitle');
    const titleText = title?.type === 'text' ? title.text : title?.type === 'shape' ? title.text : undefined;
    return {
      id: stableId('slide', slide.slidePath),
      name: titleText?.trim() || `Slide ${slideIndex + 1}`,
      layoutId: layoutId && layouts.some((layout) => layout.id === layoutId) ? layoutId : undefined,
      durationMs: 5_000,
      ...(timeline ? { timeline } : {}),
      background: backgroundForSlide(context, slideIndex),
      notes: notesForSlide(context, slide.slidePath),
      elements,
    };
  });
}

export async function importPptx(input: ArrayBuffer, sourceName?: string): Promise<ImportResult> {
  const normalizedInput = Uint8Array.from(new Uint8Array(input)).buffer as ArrayBuffer;
  const [pptxFiles, rawFiles] = await Promise.all([
    parseZip(normalizedInput, RECOMMENDED_ZIP_LIMITS),
    Promise.resolve(unzipWithLimits(new Uint8Array(normalizedInput))),
  ]);
  const presentation = buildPresentation(pptxFiles);
  materializeAllSlideNodes(presentation);
  const context: PptxContext = {
    presentation,
    files: rawFiles,
    assets: new Map(),
    warnings: [],
    sourceName,
  };
  const pathToAsset = addMediaAssets(context);
  const layouts = mapLayouts(context, pathToAsset);
  const slides = mapSlides(context, pathToAsset, layouts);
  const document: DeckDocument = {
    schemaVersion: PRISMDECK_SCHEMA_VERSION,
    id: stableId('deck', `${sourceName ?? 'presentation'}:${presentation.width}x${presentation.height}`),
    kind: slides.length === 0 && layouts.length > 0 ? 'template' : 'presentation',
    metadata: metadata(context),
    size: { width: presentation.width, height: presentation.height },
    layouts,
    slides,
  };

  if (document.kind === 'template') {
    context.warnings.push({
      code: 'PPTX_TEMPLATE_IMPORTED',
      severity: 'info',
      message: `Imported ${layouts.length} layouts from a zero-slide PowerPoint file`,
    });
  }

  return {
    document,
    assets: context.assets,
    report: { format: 'pptx', sourceName, warnings: context.warnings },
  };
}
