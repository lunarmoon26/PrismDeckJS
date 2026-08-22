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
  type ChartElement,
  type ChartSeries,
  type DeckAsset,
  type DeckDocument,
  type DeckElement,
  type DeckLayout,
  type DeckSlide,
  type ElementFrame,
  type ImportResult,
  type ImportWarning,
  type ShapeElement,
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

function elementTransform(renderOrder: number, rotationZ = 0, flipH = false, flipV = false) {
  return {
    ...DEFAULT_TRANSFORM,
    z: renderOrder * 0.002,
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
  rotation = 0,
  flipH = false,
  flipV = false,
) {
  return {
    id,
    type,
    name,
    frame,
    transform: elementTransform(renderOrder, rotation, flipH, flipV),
    opacity: 1,
    visible: true,
    renderOrder,
    source: { format: 'pptx' as const, part: sourcePart, nativeId: id, nativeType },
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

function parseCache(cache: Element | undefined): Array<string | number | null> {
  if (!cache) return [];
  const count = Number(firstDescendant(cache, 'ptCount')?.getAttribute('val') ?? 0);
  const points = new Map<number, string>();
  for (const point of descendants(cache, 'pt')) {
    const index = Number(point.getAttribute('idx') ?? points.size);
    const value = firstDescendant(point, 'v')?.textContent ?? '';
    points.set(index, value);
  }
  const length = Math.max(count, ...Array.from(points.keys(), (index) => index + 1), 0);
  return Array.from({ length }, (_, index) => points.get(index) ?? null);
}

function childCache(node: Element | undefined): Element | undefined {
  if (!node) return undefined;
  return firstDescendant(node, 'strCache') ?? firstDescendant(node, 'numCache') ?? firstDescendant(node, 'strLit') ?? firstDescendant(node, 'numLit');
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

  const chartTypeElement = Array.from(chart.getElementsByTagName('*')).find((element) => localName(element).endsWith('Chart'));
  const nativeType = chartTypeElement ? localName(chartTypeElement) : '';
  const barDirection = firstDescendant(chart, 'barDir')?.getAttribute('val');
  const chartType: ChartElement['chartType'] = nativeType.includes('bar')
    ? barDirection === 'col'
      ? 'column'
      : 'bar'
    : nativeType.includes('line')
      ? 'line'
      : nativeType.includes('pie') || nativeType.includes('doughnut')
        ? 'pie'
        : nativeType.includes('area')
          ? 'area'
          : 'unknown';
  if (chartType === 'unknown') {
    context.warnings.push({
      code: 'PPTX_CHART_UNSUPPORTED',
      severity: 'warning',
      message: `Chart type ${nativeType || 'unknown'} is not supported in this release`,
      elementId: base.id,
      sourcePart: node.chartPath,
    });
    return {
      ...base,
      type: 'unsupported',
      reason: `Unsupported PPTX chart type: ${nativeType || 'unknown'}`,
      fallbackText: node.name,
    };
  }
  const series: ChartSeries[] = [];
  let categories: string[] = [];

  for (const seriesNode of descendants(chartTypeElement ?? chart, 'ser')) {
    const txNode = childElements(seriesNode, 'tx')[0];
    const catNode = childElements(seriesNode, 'cat')[0];
    const valNode = childElements(seriesNode, 'val')[0] ?? childElements(seriesNode, 'yVal')[0];
    const rawCategories = parseCache(childCache(catNode));
    const values = parseCache(childCache(valNode)).map((value) => {
      if (value === null || value === '') return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    });
    if (rawCategories.length > categories.length) categories = rawCategories.map((value) => String(value ?? ''));
    series.push({
      name: String(parseCache(childCache(txNode)).find((value) => value !== null) ?? `Series ${series.length + 1}`),
      values,
    });
  }

  const title = firstDescendant(firstDescendant(chart, 'title') ?? chart, 't')?.textContent ?? undefined;
  return { ...base, type: 'chart', chartType, categories, series, title };
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
    return {
      ...common,
      type: 'table',
      rows: table.rows.map((row) => row.cells.map((cell) => textFromBody(cell.textBody))),
      headerRows: table.rows.length > 0 ? 1 : 0,
      fill: '#FFFFFF',
      stroke: '#78716C',
      textStyle: { ...DEFAULT_TEXT_STYLE, fontSize: 0.026 },
      placeholder,
    };
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
  const common = sourceBase(id, name, 'unsupported', frame, renderOrder, sourcePart, node.localName);

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

function hasRealTiming(context: PptxContext, slidePath: string): boolean {
  const xml = decodeXml(context.files, slidePath);
  if (!xml) return false;
  const document = parseXmlDocument(xml, slidePath);
  const timing = firstDescendant(document, 'timing');
  return Boolean(
    timing &&
      Array.from(timing.getElementsByTagName('*')).some((element) =>
        ['anim', 'animEffect', 'animMotion', 'animRot', 'animScale', 'set', 'cmd'].includes(localName(element)),
      ),
  );
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
    if (hasRealTiming(context, slide.slidePath)) {
      context.warnings.push({
        code: 'PPTX_ANIMATION_UNSUPPORTED',
        severity: 'warning',
        message: 'PowerPoint animation timing is not imported in this release',
        slideIndex,
        sourcePart: slide.slidePath,
      });
    }
    const title = elements.find((element) => element.placeholder?.type === 'title' || element.placeholder?.type === 'ctrTitle');
    const titleText = title?.type === 'text' ? title.text : title?.type === 'shape' ? title.text : undefined;
    return {
      id: stableId('slide', slide.slidePath),
      name: titleText?.trim() || `Slide ${slideIndex + 1}`,
      layoutId: layoutId && layouts.some((layout) => layout.id === layoutId) ? layoutId : undefined,
      durationMs: 5_000,
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
