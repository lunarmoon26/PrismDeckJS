import { strFromU8 } from 'fflate';
import { unzipWithLimits } from '../document/archive';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  PRISMDECK_SCHEMA_VERSION,
  type DeckAsset,
  type DeckDocument,
  type DeckElement,
  type DeckLayout,
  type DeckSlide,
  type ElementFrame,
  type ElementPlaceholder,
  type ImportResult,
  type ImportWarning,
  type TextStyle,
} from '../document/types';
import {
  attributeByLocalName,
  childElements,
  descendants,
  firstDescendant,
  localName,
  normalizeColor,
  parseLength,
  parseXmlDocument,
} from './xml';

const ODP_MIME_TYPE = 'application/vnd.oasis.opendocument.presentation';

interface OdfStyle {
  name: string;
  family: string;
  parent?: string;
  properties: Record<string, string>;
}

interface OdpContext {
  files: Record<string, Uint8Array>;
  content: Document;
  stylesDocument?: Document;
  styles: Map<string, OdfStyle>;
  assets: Map<string, DeckAsset>;
  manifestTypes: Map<string, string>;
  warnings: ImportWarning[];
  size: { width: number; height: number };
  sourceName?: string;
}

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

function normalizeAssetPath(path: string): string {
  const decoded = decodeURIComponent(path.replace(/^\.\//, ''));
  return decoded
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

function attributes(element: Element): Record<string, string> {
  return Object.fromEntries(Array.from(element.attributes, (attribute) => [localName(attribute), attribute.value]));
}

function collectStyles(documents: Array<Document | undefined>): Map<string, OdfStyle> {
  const result = new Map<string, OdfStyle>();
  for (const document of documents) {
    if (!document) continue;
    for (const element of descendants(document, 'style')) {
      const name = attributeByLocalName(element, 'name');
      const family = attributeByLocalName(element, 'family');
      if (!name || !family) continue;
      const properties: Record<string, string> = {};
      for (const child of childElements(element)) {
        if (localName(child).endsWith('properties')) Object.assign(properties, attributes(child));
      }
      result.set(name, {
        name,
        family,
        parent: attributeByLocalName(element, 'parent-style-name'),
        properties,
      });
    }
  }
  return result;
}

function resolveStyle(context: OdpContext, name: string | undefined): Record<string, string> {
  if (!name) return {};
  const chain: OdfStyle[] = [];
  const visited = new Set<string>();
  let current = context.styles.get(name);
  while (current && !visited.has(current.name)) {
    visited.add(current.name);
    chain.unshift(current);
    current = current.parent ? context.styles.get(current.parent) : undefined;
  }
  return Object.assign({}, ...chain.map((style) => style.properties));
}

function manifestTypes(files: Record<string, Uint8Array>): Map<string, string> {
  const xml = decodeXml(files, 'META-INF/manifest.xml');
  const result = new Map<string, string>();
  if (!xml) return result;
  const document = parseXmlDocument(xml, 'META-INF/manifest.xml');
  for (const entry of descendants(document, 'file-entry')) {
    const path = attributeByLocalName(entry, 'full-path');
    const mimeType = attributeByLocalName(entry, 'media-type');
    if (path && mimeType) result.set(normalizeAssetPath(path), mimeType);
  }
  return result;
}

function mimeForPath(context: OdpContext, path: string): string {
  const manifestType = context.manifestTypes.get(path);
  if (manifestType) return manifestType;
  const extension = path.split('.').at(-1)?.toLowerCase();
  return (
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
    }[extension ?? ''] ?? 'application/octet-stream'
  );
}

function pageSize(styles: Document | undefined, content: Document): { width: number; height: number } {
  const pageLayout = styles ? descendants(styles, 'page-layout-properties')[0] : undefined;
  const fallbackLayout = descendants(content, 'page-layout-properties')[0];
  const properties = pageLayout ?? fallbackLayout;
  return {
    width: parseLength(attributeByLocalName(properties ?? content.documentElement, 'page-width')) ?? 960,
    height: parseLength(attributeByLocalName(properties ?? content.documentElement, 'page-height')) ?? 720,
  };
}

function lengthAttribute(element: Element, name: string): number {
  return parseLength(attributeByLocalName(element, name)) ?? 0;
}

function frameFor(element: Element, context: OdpContext, fallback?: ElementFrame): ElementFrame {
  if (localName(element) === 'line') {
    const x1 = lengthAttribute(element, 'x1');
    const y1 = lengthAttribute(element, 'y1');
    const x2 = lengthAttribute(element, 'x2');
    const y2 = lengthAttribute(element, 'y2');
    return {
      x: Math.min(x1, x2) / context.size.width,
      y: Math.min(y1, y2) / context.size.height,
      width: Math.abs(x2 - x1) / context.size.width,
      height: Math.abs(y2 - y1) / context.size.height,
    };
  }
  const x = parseLength(attributeByLocalName(element, 'x'));
  const y = parseLength(attributeByLocalName(element, 'y'));
  const width = parseLength(attributeByLocalName(element, 'width'));
  const height = parseLength(attributeByLocalName(element, 'height'));
  if (x === undefined && y === undefined && width === undefined && height === undefined && fallback) return fallback;
  return {
    x: (x ?? 0) / context.size.width,
    y: (y ?? 0) / context.size.height,
    width: (width ?? 0) / context.size.width,
    height: (height ?? 0) / context.size.height,
  };
}

function textContent(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as Element;
  if (localName(element) === 's') {
    const count = Math.min(1000, Math.max(1, Number(attributeByLocalName(element, 'c') ?? 1)));
    return ' '.repeat(count);
  }
  if (localName(element) === 'tab') return '\t';
  if (localName(element) === 'line-break') return '\n';
  return Array.from(element.childNodes, textContent).join('');
}

function textFromElement(element: Element): string {
  const paragraphs = descendants(element, 'p');
  return paragraphs.map(textContent).join('\n');
}

function textStyleFor(element: Element, context: OdpContext): TextStyle {
  const paragraph = descendants(element, 'p')[0];
  const span = descendants(element, 'span')[0];
  const frameProperties = resolveStyle(context, attributeByLocalName(element, 'style-name'));
  const paragraphProperties = resolveStyle(context, attributeByLocalName(paragraph ?? element, 'style-name'));
  const spanProperties = resolveStyle(context, attributeByLocalName(span ?? paragraph ?? element, 'style-name'));
  const properties = { ...frameProperties, ...paragraphProperties, ...spanProperties };
  const fontPixels = parseLength(properties['font-size']) ?? context.size.height * DEFAULT_TEXT_STYLE.fontSize;
  const align = properties['text-align'];
  const verticalAlign = properties['textarea-vertical-align'] ?? properties['vertical-align'];
  return {
    fontFamily: properties['font-name'] || properties['font-family'] || DEFAULT_TEXT_STYLE.fontFamily,
    fontSize: Math.max(0.012, fontPixels / context.size.height),
    fontWeight: properties['font-weight'] === 'bold' ? 700 : 400,
    fontStyle: properties['font-style'] === 'italic' ? 'italic' : 'normal',
    color: normalizeColor(properties.color, DEFAULT_TEXT_STYLE.color),
    align: align === 'center' ? 'center' : align === 'end' || align === 'right' ? 'right' : 'left',
    verticalAlign: verticalAlign === 'middle' ? 'middle' : verticalAlign === 'bottom' ? 'bottom' : 'top',
    lineHeight: 1.2,
  };
}

function placeholderFor(element: Element): ElementPlaceholder | undefined {
  const presentationClass = attributeByLocalName(element, 'class');
  const placeholder = attributeByLocalName(element, 'placeholder');
  if (!presentationClass && placeholder !== 'true') return undefined;
  return { type: presentationClass ?? 'body', prompt: textFromElement(element) || undefined };
}

function rotationFor(element: Element, context: OdpContext, sourcePart: string): number {
  const transform = attributeByLocalName(element, 'transform');
  if (!transform) return 0;
  const rotate = /rotate\s*\(\s*(-?[0-9.]+)/i.exec(transform);
  if (rotate?.[1]) return (Number(rotate[1]) * 180) / Math.PI;
  context.warnings.push({
    code: 'ODP_TRANSFORM_PARTIAL',
    severity: 'warning',
    message: `ODF transform is not fully supported: ${transform}`,
    sourcePart,
  });
  return 0;
}

function baseElement(
  context: OdpContext,
  sourcePart: string,
  element: Element,
  type: DeckElement['type'],
  renderOrder: number,
  fallbackFrame?: ElementFrame,
) {
  const nativeId =
    attributeByLocalName(element, 'id') ??
    attributeByLocalName(element, 'name') ??
    `${localName(element)}-${renderOrder + 1}`;
  return {
    id: stableId('element', `${sourcePart}:${nativeId}:${renderOrder}`),
    type,
    name: attributeByLocalName(element, 'name') ?? `${localName(element)} ${renderOrder + 1}`,
    frame: frameFor(element, context, fallbackFrame),
    transform: {
      ...DEFAULT_TRANSFORM,
      z: renderOrder * 0.002,
      rotationZ: rotationFor(element, context, sourcePart),
    },
    opacity: 1,
    visible: attributeByLocalName(element, 'display') !== 'none',
    renderOrder,
    source: { format: 'odp' as const, part: sourcePart, nativeId, nativeType: localName(element) },
    placeholder: placeholderFor(element),
  };
}

function styleColors(element: Element, context: OdpContext): { fill: string; stroke: string; strokeWidth: number } {
  const properties = resolveStyle(context, attributeByLocalName(element, 'style-name'));
  const fillMode = properties.fill ?? attributeByLocalName(element, 'fill');
  const strokeMode = properties.stroke ?? attributeByLocalName(element, 'stroke');
  return {
    fill: fillMode === 'none' ? '#FFFFFF00' : normalizeColor(properties['fill-color'], '#E7E5E4'),
    stroke: strokeMode === 'none' ? '#00000000' : normalizeColor(properties['stroke-color'], '#44403C'),
    strokeWidth: parseLength(properties['stroke-width']) ?? 1,
  };
}

function imageElement(
  frame: Element,
  image: Element,
  context: OdpContext,
  sourcePart: string,
  renderOrder: number,
): DeckElement {
  const base = baseElement(context, sourcePart, frame, 'image', renderOrder);
  const href = attributeByLocalName(image, 'href');
  const path = href ? normalizeAssetPath(href) : '';
  const data = path ? context.files[path] : undefined;
  if (!data) {
    context.warnings.push({
      code: 'ODP_IMAGE_MISSING',
      severity: 'warning',
      message: `Image data was not found for ${href ?? base.name}`,
      elementId: base.id,
      sourcePart,
    });
    return { ...base, type: 'unsupported', reason: 'Missing image data', fallbackText: base.name };
  }
  const assetId = stableId('asset', path);
  if (!context.assets.has(assetId)) {
    context.assets.set(assetId, {
      id: assetId,
      fileName: path.split('/').at(-1) ?? path,
      mimeType: mimeForPath(context, path),
      data,
    });
  }
  return { ...base, type: 'image', assetId, alt: base.name, fit: 'contain' };
}

function tableRows(table: Element): { rows: string[][]; headerRows: number } {
  const rows: string[][] = [];
  let headerRows = 0;
  for (const row of descendants(table, 'table-row')) {
    const values: string[] = [];
    for (const cell of childElements(row).filter((element) => ['table-cell', 'covered-table-cell'].includes(localName(element)))) {
      const repeat = Math.min(1000, Math.max(1, Number(attributeByLocalName(cell, 'number-columns-repeated') ?? 1)));
      const value = localName(cell) === 'covered-table-cell' ? '' : textFromElement(cell);
      for (let index = 0; index < repeat; index += 1) values.push(value);
    }
    const repeat = Math.min(1000, Math.max(1, Number(attributeByLocalName(row, 'number-rows-repeated') ?? 1)));
    for (let index = 0; index < repeat; index += 1) rows.push([...values]);
    if (row.parentElement && localName(row.parentElement) === 'table-header-rows') headerRows += repeat;
  }
  return { rows, headerRows };
}

function mapElement(
  element: Element,
  context: OdpContext,
  sourcePart: string,
  renderOrder: number,
  fallbackFrame?: ElementFrame,
): DeckElement | undefined {
  const name = localName(element);
  if (name === 'frame') {
    const image = childElements(element, 'image')[0];
    if (image) return imageElement(element, image, context, sourcePart, renderOrder);
    const table = descendants(element, 'table')[0];
    if (table) {
      const data = tableRows(table);
      return {
        ...baseElement(context, sourcePart, element, 'table', renderOrder),
        type: 'table',
        ...data,
        fill: '#FFFFFF',
        stroke: '#78716C',
        textStyle: textStyleFor(element, context),
      };
    }
    const textBox = childElements(element, 'text-box')[0];
    if (textBox) {
      return {
        ...baseElement(context, sourcePart, element, 'text', renderOrder),
        type: 'text',
        text: textFromElement(textBox),
        style: textStyleFor(element, context),
      };
    }
    const object = childElements(element).find((child) => ['object', 'object-ole', 'plugin'].includes(localName(child)));
    if (object) {
      context.warnings.push({
        code: 'ODP_EMBEDDED_OBJECT_UNSUPPORTED',
        severity: 'warning',
        message: 'Embedded ODF objects and charts are not imported in this release',
        sourcePart,
      });
      const base = baseElement(context, sourcePart, element, 'unsupported', renderOrder);
      return { ...base, type: 'unsupported', reason: 'Embedded ODF object is unsupported', fallbackText: base.name };
    }
    return undefined;
  }

  if (['rect', 'ellipse', 'circle', 'line', 'custom-shape'].includes(name)) {
    const text = textFromElement(element);
    return {
      ...baseElement(context, sourcePart, element, 'shape', renderOrder, fallbackFrame),
      type: 'shape',
      shape: name === 'rect' ? 'rectangle' : name === 'ellipse' || name === 'circle' ? 'ellipse' : name === 'line' ? 'line' : 'custom',
      ...styleColors(element, context),
      text: text || undefined,
      textStyle: text ? textStyleFor(element, context) : undefined,
    };
  }

  return undefined;
}

interface OdfCoordinateMap {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
  rotationZ: number;
}

const IDENTITY_ODF_COORDINATE_MAP: OdfCoordinateMap = {
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
  rotationZ: 0,
};

function composeOdfCoordinateMaps(parent: OdfCoordinateMap, child: OdfCoordinateMap): OdfCoordinateMap {
  return {
    scaleX: parent.scaleX * child.scaleX,
    scaleY: parent.scaleY * child.scaleY,
    translateX: parent.translateX + child.translateX * parent.scaleX,
    translateY: parent.translateY + child.translateY * parent.scaleY,
    rotationZ: parent.rotationZ + child.rotationZ,
  };
}

function applyOdfCoordinateMap(frame: ElementFrame, map: OdfCoordinateMap): ElementFrame {
  return {
    x: map.translateX + frame.x * map.scaleX,
    y: map.translateY + frame.y * map.scaleY,
    width: Math.max(0, frame.width * Math.abs(map.scaleX)),
    height: Math.max(0, frame.height * Math.abs(map.scaleY)),
  };
}

function groupCoordinateMap(group: Element, context: OdpContext, sourcePart: string): OdfCoordinateMap {
  let translateX = (parseLength(attributeByLocalName(group, 'x')) ?? 0) / context.size.width;
  let translateY = (parseLength(attributeByLocalName(group, 'y')) ?? 0) / context.size.height;
  let scaleX = 1;
  let scaleY = 1;
  let rotationZ = 0;
  const transform = attributeByLocalName(group, 'transform');
  if (!transform) return { scaleX, scaleY, translateX, translateY, rotationZ };
  let unsupported = false;
  for (const match of transform.matchAll(/([a-z]+)\s*\(([^)]*)\)/gi)) {
    const operation = match[1]?.toLowerCase();
    const values = (match[2] ?? '').trim().split(/[\s,]+/).filter(Boolean);
    if (operation === 'translate') {
      translateX += (parseLength(values[0]) ?? 0) / context.size.width;
      translateY += (parseLength(values[1]) ?? 0) / context.size.height;
    } else if (operation === 'scale') {
      const x = Number(values[0] ?? 1);
      const y = Number(values[1] ?? values[0] ?? 1);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        scaleX *= x;
        scaleY *= y;
      } else unsupported = true;
    } else if (operation === 'rotate') {
      const radians = Number(values[0] ?? 0);
      if (Number.isFinite(radians)) rotationZ += (radians * 180) / Math.PI;
      else unsupported = true;
    } else {
      unsupported = true;
    }
  }
  if (unsupported || rotationZ !== 0) {
    context.warnings.push({
      code: 'ODP_GROUP_TRANSFORM_PARTIAL',
      severity: 'warning',
      message: 'Group matrix, skew, or rotation was flattened without transforming child positions',
      sourcePart,
    });
  }
  return { scaleX, scaleY, translateX, translateY, rotationZ };
}

function mapContainer(container: Element, context: OdpContext, sourcePart: string): DeckElement[] {
  const elements: DeckElement[] = [];
  const visit = (parent: Element, coordinateMap: OdfCoordinateMap) => {
    for (const child of childElements(parent)) {
      if (localName(child) === 'g') {
        visit(child, composeOdfCoordinateMaps(coordinateMap, groupCoordinateMap(child, context, sourcePart)));
        continue;
      }
      const mapped = mapElement(child, context, sourcePart, elements.length);
      if (mapped) {
        mapped.frame = applyOdfCoordinateMap(mapped.frame, coordinateMap);
        mapped.transform.rotationZ += coordinateMap.rotationZ;
        elements.push(mapped);
      }
    }
  };
  visit(container, IDENTITY_ODF_COORDINATE_MAP);
  return elements;
}

function masterPages(context: OdpContext): Element[] {
  return context.stylesDocument ? descendants(context.stylesDocument, 'master-page') : [];
}

function mapLayouts(context: OdpContext): DeckLayout[] {
  return masterPages(context).map((master, index) => {
    const nativeName = attributeByLocalName(master, 'name') ?? `Master ${index + 1}`;
    return {
      id: stableId('layout', nativeName),
      name: attributeByLocalName(master, 'display-name') ?? nativeName,
      elements: mapContainer(master, context, 'styles.xml'),
    };
  });
}

function backgroundFor(page: Element, context: OdpContext): string {
  const properties = resolveStyle(context, attributeByLocalName(page, 'style-name'));
  return properties.fill === 'none' ? '#FFFFFF' : normalizeColor(properties['fill-color'], '#FFFFFF');
}

function notesFor(page: Element): string | undefined {
  const notes = childElements(page, 'notes')[0];
  if (!notes) return undefined;
  const value = textFromElement(notes).trim();
  return value || undefined;
}

function hasAnimations(page: Element): boolean {
  return Array.from(page.getElementsByTagName('*')).some((element) => {
    const name = localName(element);
    return ['par', 'seq', 'animate', 'animateMotion', 'animateTransform', 'transitionFilter'].includes(name);
  });
}

function mapSlides(context: OdpContext, layouts: DeckLayout[]): DeckSlide[] {
  const pages = descendants(context.content, 'page').filter((page) => page.namespaceURI?.includes('drawing'));
  return pages.map((page, index) => {
    const masterName = attributeByLocalName(page, 'master-page-name');
    const layoutId = masterName ? stableId('layout', masterName) : undefined;
    if (hasAnimations(page)) {
      context.warnings.push({
        code: 'ODP_ANIMATION_UNSUPPORTED',
        severity: 'warning',
        message: 'ODF animation timing is not imported in this release',
        slideIndex: index,
        sourcePart: 'content.xml',
      });
    }
    const elements = mapContainer(page, context, 'content.xml');
    return {
      id: stableId('slide', attributeByLocalName(page, 'name') ?? String(index + 1)),
      name: attributeByLocalName(page, 'name') ?? `Slide ${index + 1}`,
      layoutId: layoutId && layouts.some((layout) => layout.id === layoutId) ? layoutId : undefined,
      durationMs: 5_000,
      background: backgroundFor(page, context),
      notes: notesFor(page),
      elements,
    };
  });
}

function metadata(context: OdpContext): DeckDocument['metadata'] {
  const xml = decodeXml(context.files, 'meta.xml');
  if (!xml) return { title: context.sourceName?.replace(/\.odp$/i, '') ?? 'Imported presentation', sourceFormat: 'odp' };
  const document = parseXmlDocument(xml, 'meta.xml');
  const value = (name: string) => firstDescendant(document, name)?.textContent?.trim() || undefined;
  return {
    title: value('title') ?? context.sourceName?.replace(/\.odp$/i, '') ?? 'Imported presentation',
    author: value('creator') ?? value('initial-creator'),
    description: value('description'),
    createdAt: value('creation-date'),
    modifiedAt: value('date'),
    sourceFormat: 'odp',
  };
}

export function importOdp(input: ArrayBuffer, sourceName?: string): ImportResult {
  const normalizedInput = Uint8Array.from(new Uint8Array(input));
  const files = unzipWithLimits(normalizedInput);
  const mimeType = files.mimetype ? strFromU8(files.mimetype).trim() : undefined;
  if (mimeType && mimeType !== ODP_MIME_TYPE) throw new Error(`Unsupported ODF media type: ${mimeType}`);
  const contentXml = decodeXml(files, 'content.xml');
  if (!contentXml) throw new Error('ODP archive is missing content.xml');
  const stylesXml = decodeXml(files, 'styles.xml');
  const content = parseXmlDocument(contentXml, 'content.xml');
  const stylesDocument = stylesXml ? parseXmlDocument(stylesXml, 'styles.xml') : undefined;
  const context: OdpContext = {
    files,
    content,
    stylesDocument,
    styles: collectStyles([stylesDocument, content]),
    assets: new Map(),
    manifestTypes: manifestTypes(files),
    warnings: [],
    size: pageSize(stylesDocument, content),
    sourceName,
  };
  const layouts = mapLayouts(context);
  const slides = mapSlides(context, layouts);
  const document: DeckDocument = {
    schemaVersion: PRISMDECK_SCHEMA_VERSION,
    id: stableId('deck', `${sourceName ?? 'presentation'}:${context.size.width}x${context.size.height}`),
    kind: slides.length === 0 && layouts.length > 0 ? 'template' : 'presentation',
    metadata: metadata(context),
    size: context.size,
    layouts,
    slides,
  };
  if (document.kind === 'template') {
    context.warnings.push({
      code: 'ODP_TEMPLATE_IMPORTED',
      severity: 'info',
      message: `Imported ${layouts.length} master pages from a zero-slide ODP file`,
    });
  }
  return { document, assets: context.assets, report: { format: 'odp', sourceName, warnings: context.warnings } };
}
