import { strFromU8 } from 'fflate';
import { unzipWithLimits } from '../document/archive';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  PRISMDECK_SCHEMA_VERSION,
  type BorderStyle,
  type ChartAxis,
  type ChartElement,
  type ChartLegend,
  type ChartPlot,
  type ChartPoint,
  type ChartSeries,
  type ChartType,
  type DeckAsset,
  type DeckDocument,
  type DeckElement,
  type DeckLayout,
  type DeckSlide,
  type ElementFrame,
  type ElementPlaceholder,
  type ImportResult,
  type ImportWarning,
  type TableCell,
  type TableCellBorders,
  type TableCellStyle,
  type TableElement,
  type TableRow,
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
  return resolveStyleFrom(context.styles, name);
}

function resolveStyleFrom(styles: Map<string, OdfStyle>, name: string | undefined): Record<string, string> {
  if (!name) return {};
  const chain: OdfStyle[] = [];
  const visited = new Set<string>();
  let current = styles.get(name);
  while (current && !visited.has(current.name)) {
    visited.add(current.name);
    chain.unshift(current);
    current = current.parent ? styles.get(current.parent) : undefined;
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

function textStyleFromProperties(properties: Record<string, string>, context: OdpContext): TextStyle {
  const fontPixels = parseLength(properties['font-size']) ?? context.size.height * DEFAULT_TEXT_STYLE.fontSize;
  const align = properties['text-align'];
  const verticalAlign = properties['textarea-vertical-align'] ?? properties['vertical-align'];
  const numericWeight = Number(properties['font-weight']);
  return {
    fontFamily: properties['font-name'] || properties['font-family'] || DEFAULT_TEXT_STYLE.fontFamily,
    fontSize: Math.max(0.012, fontPixels / context.size.height),
    fontWeight:
      properties['font-weight'] === 'bold' || properties['font-weight'] === 'bolder'
        ? 700
        : Number.isFinite(numericWeight)
          ? Math.min(1000, Math.max(1, numericWeight))
          : 400,
    fontStyle: properties['font-style'] === 'italic' || properties['font-style'] === 'oblique' ? 'italic' : 'normal',
    color: normalizeColor(properties.color, DEFAULT_TEXT_STYLE.color),
    align: align === 'center' ? 'center' : align === 'end' || align === 'right' ? 'right' : 'left',
    verticalAlign:
      verticalAlign === 'middle' || verticalAlign === 'center'
        ? 'middle'
        : verticalAlign === 'bottom'
          ? 'bottom'
          : 'top',
    lineHeight: 1.2,
  };
}

function textStyleFor(
  element: Element,
  context: OdpContext,
  inheritedProperties: Record<string, string> = {},
  styles: Map<string, OdfStyle> = context.styles,
): TextStyle {
  const paragraph = descendants(element, 'p')[0];
  const span = descendants(element, 'span')[0];
  const frameProperties = {
    ...resolveStyleFrom(styles, attributeByLocalName(element, 'text-style-name')),
    ...resolveStyleFrom(styles, attributeByLocalName(element, 'style-name')),
    ...attributes(element),
  };
  const paragraphProperties = paragraph
    ? { ...resolveStyleFrom(styles, attributeByLocalName(paragraph, 'style-name')), ...attributes(paragraph) }
    : {};
  const spanProperties = span
    ? { ...resolveStyleFrom(styles, attributeByLocalName(span, 'style-name')), ...attributes(span) }
    : {};
  return textStyleFromProperties(
    { ...inheritedProperties, ...frameProperties, ...paragraphProperties, ...spanProperties },
    context,
  );
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
      z: 0,
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

const MAX_TABLE_COLUMNS = 1_000;
const MAX_TABLE_ROWS = 10_000;
const MAX_TABLE_CELLS = 100_000;
const MAX_CHART_POINTS = 100_000;
const MAX_CHART_TABLE_COLUMNS = 16_384;
const MAX_CHART_TABLE_ROWS = 100_000;
const MAX_CHART_TABLE_CELLS = 200_000;

function boundedRepeat(element: Element, name: string, maximum: number): number {
  const value = Number(attributeByLocalName(element, name) ?? 1);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(1, Math.floor(value))) : 1;
}

function nearestAncestor(element: Element, name: string): Element | undefined {
  let current = element.parentElement;
  while (current) {
    if (localName(current) === name) return current;
    current = current.parentElement;
  }
  return undefined;
}

function hasAncestorBefore(element: Element, name: string, boundary: Element): boolean {
  let current = element.parentElement;
  while (current && current !== boundary) {
    if (localName(current) === name) return true;
    current = current.parentElement;
  }
  return false;
}

function styleProperties(element: Element, styles: Map<string, OdfStyle>): Record<string, string> {
  return { ...resolveStyleFrom(styles, attributeByLocalName(element, 'style-name')), ...attributes(element) };
}

function fillFromProperties(properties: Record<string, string>, fallback?: string): string | undefined {
  const fillMode = properties.fill;
  const color = properties['background-color'] ?? properties['fill-color'];
  if (fillMode === 'none' || color === 'none' || color === 'transparent') return '#FFFFFF00';
  if (color) return normalizeColor(color, fallback ?? '#FFFFFF');
  return fallback;
}

function borderFromValue(value: string | undefined): BorderStyle | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (/\b(none|hidden)\b/.test(normalized)) return { color: '#00000000', width: 0, style: 'solid' };
  const widthToken = /-?[0-9]*\.?[0-9]+(?:cm|mm|in|pt|pc|px)?/i.exec(value)?.[0];
  const color = /#[0-9a-f]{3,8}\b/i.exec(value)?.[0];
  return {
    color: normalizeColor(color, '#78716C'),
    width: Math.max(0, parseLength(widthToken) ?? 1),
    style: /\bdott?ed\b/i.test(value) ? 'dotted' : /\b(dash|dashed|long-dash|dot-dash)\b/i.test(value) ? 'dashed' : 'solid',
  };
}

function bordersFromProperties(properties: Record<string, string>): TableCellBorders | undefined {
  const all = borderFromValue(properties.border);
  const borders: TableCellBorders = {
    top: borderFromValue(properties['border-top']) ?? all,
    right: borderFromValue(properties['border-right']) ?? all,
    bottom: borderFromValue(properties['border-bottom']) ?? all,
    left: borderFromValue(properties['border-left']) ?? all,
  };
  return Object.values(borders).some(Boolean) ? borders : undefined;
}

function lineFromProperties(properties: Record<string, string>): BorderStyle | undefined {
  if (properties.stroke === 'none') return { color: '#00000000', width: 0, style: 'solid' };
  if (!properties.stroke && !properties['stroke-color'] && !properties['stroke-width']) return undefined;
  const dashName = properties['stroke-dash'] ?? properties['stroke-linejoin'] ?? '';
  return {
    color: normalizeColor(properties['stroke-color'], '#44403C'),
    width: Math.max(0, parseLength(properties['stroke-width']) ?? 1),
    style: /dot/i.test(dashName) ? 'dotted' : /dash/i.test(dashName) ? 'dashed' : 'solid',
  };
}

function paddingFromProperties(properties: Record<string, string>): TableCellStyle['padding'] | undefined {
  const all = parseLength(properties.padding);
  const values = {
    top: parseLength(properties['padding-top']) ?? all,
    right: parseLength(properties['padding-right']) ?? all,
    bottom: parseLength(properties['padding-bottom']) ?? all,
    left: parseLength(properties['padding-left']) ?? all,
  };
  if (Object.values(values).every((value) => value === undefined)) return undefined;
  return {
    top: Math.max(0, values.top ?? 0),
    right: Math.max(0, values.right ?? 0),
    bottom: Math.max(0, values.bottom ?? 0),
    left: Math.max(0, values.left ?? 0),
  };
}

function verticalAlignFromProperties(properties: Record<string, string>): TextStyle['verticalAlign'] | undefined {
  const value = properties['textarea-vertical-align'] ?? properties['vertical-align'];
  return value === 'middle' || value === 'center' ? 'middle' : value === 'bottom' ? 'bottom' : value === 'top' ? 'top' : undefined;
}

function tableCellStyleFromProperties(
  properties: Record<string, string>,
  context: OdpContext,
  element?: Element,
  defaults = false,
  styles: Map<string, OdfStyle> = context.styles,
): TableCellStyle {
  const fallbackBorder: BorderStyle = { color: '#78716C', width: 1, style: 'solid' };
  const verticalAlign = verticalAlignFromProperties(properties);
  const style: TableCellStyle = {
    fill: fillFromProperties(properties, defaults ? '#FFFFFF' : undefined),
    textStyle: element ? textStyleFor(element, context, properties, styles) : textStyleFromProperties(properties, context),
    verticalAlign,
    padding: paddingFromProperties(properties),
    borders: bordersFromProperties(properties),
  };
  if (defaults && !style.borders) {
    style.borders = { top: fallbackBorder, right: fallbackBorder, bottom: fallbackBorder, left: fallbackBorder };
  }
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)) as TableCellStyle;
}

interface OdfTableColumn {
  width?: number;
  defaultCellStyle?: string;
  header: boolean;
}

function tableColumns(table: Element, context: OdpContext): OdfTableColumn[] {
  const columns: OdfTableColumn[] = [];
  for (const column of descendants(table, 'table-column')) {
    if (nearestAncestor(column, 'table') !== table) continue;
    const properties = styleProperties(column, context.styles);
    const relative = /^\s*([0-9]*\.?[0-9]+)\s*\*/.exec(properties['rel-column-width'] ?? '');
    const relativeWidth = relative ? Number(relative[1]) : undefined;
    const absoluteWidth = parseLength(properties['column-width']);
    const width = relativeWidth && relativeWidth > 0 ? relativeWidth : absoluteWidth && absoluteWidth > 0 ? absoluteWidth : undefined;
    const repeat = boundedRepeat(column, 'number-columns-repeated', MAX_TABLE_COLUMNS - columns.length);
    for (let index = 0; index < repeat && columns.length < MAX_TABLE_COLUMNS; index += 1) {
      columns.push({
        width,
        defaultCellStyle: attributeByLocalName(column, 'default-cell-style-name'),
        header: hasAncestorBefore(column, 'table-header-columns', table),
      });
    }
  }
  return columns;
}

function rowHeight(row: Element, context: OdpContext): number | undefined {
  const properties = styleProperties(row, context.styles);
  const height = parseLength(properties['row-height']) ?? parseLength(properties['min-row-height']);
  return height && height > 0 ? height : undefined;
}

function tableData(
  table: Element,
  context: OdpContext,
  sourcePart: string,
  elementId: string,
): Pick<TableElement, 'columns' | 'rows' | 'style'> {
  const definitions = tableColumns(table, context);
  const tableProperties = styleProperties(table, context.styles);
  const tableDefaultStyle = attributeByLocalName(table, 'default-cell-style-name');
  const defaultProperties = {
    ...tableProperties,
    ...resolveStyleFrom(context.styles, tableDefaultStyle),
  };
  const rows: TableRow[] = [];
  const knownHeights: number[] = [];
  const occupiedUntil: number[] = [];
  let cellCount = 0;
  let maximumColumn = definitions.length;
  let truncated = false;

  const sourceRows = descendants(table, 'table-row').filter((row) => nearestAncestor(row, 'table') === table);
  for (const sourceRow of sourceRows) {
    const repeat = boundedRepeat(sourceRow, 'number-rows-repeated', MAX_TABLE_ROWS);
    const height = rowHeight(sourceRow, context);
    const rowProperties = styleProperties(sourceRow, context.styles);
    const rowDefaultStyle = attributeByLocalName(sourceRow, 'default-cell-style-name');
    const headerRow = hasAncestorBefore(sourceRow, 'table-header-rows', table);
    const sourceCells = childElements(sourceRow).filter((cell) => ['table-cell', 'covered-table-cell'].includes(localName(cell)));

    for (let repetition = 0; repetition < repeat; repetition += 1) {
      if (rows.length >= MAX_TABLE_ROWS) {
        truncated = true;
        break;
      }
      const rowIndex = rows.length;
      const cells: TableCell[] = [];
      let column = 0;
      for (const sourceCell of sourceCells) {
        const cellRepeat = boundedRepeat(sourceCell, 'number-columns-repeated', MAX_TABLE_COLUMNS);
        for (let cellRepetition = 0; cellRepetition < cellRepeat; cellRepetition += 1) {
          if (column >= MAX_TABLE_COLUMNS) {
            truncated = true;
            break;
          }
          if (localName(sourceCell) === 'covered-table-cell') {
            column += 1;
            maximumColumn = Math.max(maximumColumn, column);
            continue;
          }
          while (column < MAX_TABLE_COLUMNS && (occupiedUntil[column] ?? 0) > rowIndex) column += 1;
          if (column >= MAX_TABLE_COLUMNS) {
            truncated = true;
            break;
          }
          const requestedColumnSpan = boundedRepeat(sourceCell, 'number-columns-spanned', MAX_TABLE_COLUMNS);
          const requestedRowSpan = boundedRepeat(sourceCell, 'number-rows-spanned', MAX_TABLE_ROWS);
          const columnSpan = Math.min(requestedColumnSpan, MAX_TABLE_COLUMNS - column);
          const rowSpan = Math.min(requestedRowSpan, MAX_TABLE_ROWS - rowIndex);
          if (columnSpan !== requestedColumnSpan || rowSpan !== requestedRowSpan) truncated = true;
          maximumColumn = Math.max(maximumColumn, column + columnSpan);

          if (cellCount < MAX_TABLE_CELLS) {
            const columnDefinition = definitions[column];
            const cellProperties = {
              ...defaultProperties,
              ...resolveStyleFrom(context.styles, columnDefinition?.defaultCellStyle),
              ...rowProperties,
              ...resolveStyleFrom(context.styles, rowDefaultStyle),
              ...styleProperties(sourceCell, context.styles),
            };
            const header = headerRow || Array.from({ length: columnSpan }, (_, offset) => definitions[column + offset]?.header).some(Boolean);
            cells.push({
              column,
              text: textFromElement(sourceCell),
              ...(columnSpan > 1 ? { columnSpan } : {}),
              ...(rowSpan > 1 ? { rowSpan } : {}),
              ...(header ? { header: true } : {}),
              style: tableCellStyleFromProperties(cellProperties, context, sourceCell),
            });
            cellCount += 1;
          } else truncated = true;

          for (let coveredColumn = column; coveredColumn < column + columnSpan; coveredColumn += 1) {
            occupiedUntil[coveredColumn] = Math.max(occupiedUntil[coveredColumn] ?? 0, rowIndex + rowSpan);
          }
          column += 1;
        }
      }
      rows.push({ height: height ?? 0, cells });
      if (height) knownHeights.push(height);
    }
    if (rows.length >= MAX_TABLE_ROWS) break;
  }

  const fallbackHeight = knownHeights.length > 0
    ? knownHeights.reduce((sum, value) => sum + value, 0) / knownHeights.length
    : 1;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    if (row.height <= 0) row.height = fallbackHeight;
    for (const cell of row.cells) {
      if (!cell.rowSpan) continue;
      const rowSpan = Math.max(1, Math.min(cell.rowSpan, rows.length - rowIndex));
      if (rowSpan > 1) cell.rowSpan = rowSpan;
      else delete cell.rowSpan;
    }
  }

  maximumColumn = Math.max(1, Math.min(MAX_TABLE_COLUMNS, maximumColumn));
  const knownWidths = definitions.map((column) => column.width).filter((width): width is number => Boolean(width && width > 0));
  const fallbackWidth = knownWidths.length > 0
    ? knownWidths.reduce((sum, value) => sum + value, 0) / knownWidths.length
    : 1;
  const columns = Array.from({ length: maximumColumn }, (_, index) => definitions[index]?.width ?? fallbackWidth);

  if (truncated) {
    context.warnings.push({
      code: 'ODP_TABLE_TRUNCATED',
      severity: 'warning',
      message: `Table expansion was bounded to ${MAX_TABLE_ROWS} rows, ${MAX_TABLE_COLUMNS} columns, and ${MAX_TABLE_CELLS} cells`,
      elementId,
      sourcePart,
    });
  }
  return { columns, rows, style: tableCellStyleFromProperties(defaultProperties, context, undefined, true) };
}

interface OdfDataCell {
  label: string;
  number: number | null;
}

interface OdfDataTable {
  name: string;
  cells: Map<string, OdfDataCell>;
  rowCount: number;
  columnCount: number;
}

interface OdfCellCoordinate {
  row: number;
  column: number;
}

interface OdfCellRange {
  cells: OdfDataCell[];
  valid: boolean;
}

function odfDataCell(element: Element): OdfDataCell {
  const valueType = attributeByLocalName(element, 'value-type');
  const rawNumber = attributeByLocalName(element, 'value');
  const rawDate = attributeByLocalName(element, 'date-value');
  const text = textFromElement(element);
  let number: number | null = null;
  if (rawNumber !== undefined) {
    const parsed = Number(rawNumber);
    if (Number.isFinite(parsed)) number = parsed;
  } else if (valueType === 'date' && rawDate) {
    const parsed = Date.parse(rawDate);
    if (Number.isFinite(parsed)) number = parsed;
  } else if (text.trim() !== '') {
    const parsed = Number(text.trim());
    if (Number.isFinite(parsed)) number = parsed;
  }
  const label =
    text ||
    attributeByLocalName(element, 'string-value') ||
    rawDate ||
    attributeByLocalName(element, 'time-value') ||
    attributeByLocalName(element, 'boolean-value') ||
    rawNumber ||
    '';
  return { label, number };
}

function chartDataTables(
  chart: Element,
  context: OdpContext,
  sourcePart: string,
  elementId: string,
): OdfDataTable[] {
  const tables: OdfDataTable[] = [];
  let truncated = false;
  for (const table of descendants(chart, 'table')) {
    if (nearestAncestor(table, 'chart') !== chart) continue;
    const cells = new Map<string, OdfDataCell>();
    let rowCount = 0;
    let columnCount = 0;
    const sourceRows = descendants(table, 'table-row').filter((row) => nearestAncestor(row, 'table') === table);
    for (const row of sourceRows) {
      const requestedRowRepeat = boundedRepeat(row, 'number-rows-repeated', MAX_CHART_TABLE_ROWS);
      const rowRepeat = Math.min(requestedRowRepeat, MAX_CHART_TABLE_ROWS - rowCount);
      if (rowRepeat !== requestedRowRepeat) truncated = true;
      const pattern: Array<{ column: number; repeat: number; value?: OdfDataCell }> = [];
      let patternColumns = 0;
      for (const cell of childElements(row).filter((candidate) => ['table-cell', 'covered-table-cell'].includes(localName(candidate)))) {
        const requestedCellRepeat = boundedRepeat(cell, 'number-columns-repeated', MAX_CHART_TABLE_COLUMNS);
        const cellRepeat = Math.min(requestedCellRepeat, MAX_CHART_TABLE_COLUMNS - patternColumns);
        if (cellRepeat !== requestedCellRepeat) truncated = true;
        pattern.push({
          column: patternColumns,
          repeat: cellRepeat,
          value: localName(cell) === 'covered-table-cell' ? undefined : odfDataCell(cell),
        });
        patternColumns += cellRepeat;
        if (patternColumns >= MAX_CHART_TABLE_COLUMNS) break;
      }
      columnCount = Math.max(columnCount, patternColumns);
      const startRow = rowCount;
      rowCount += rowRepeat;
      for (let rowOffset = 0; rowOffset < rowRepeat && cells.size < MAX_CHART_TABLE_CELLS; rowOffset += 1) {
        for (const entry of pattern) {
          if (!entry.value || (entry.value.label === '' && entry.value.number === null)) continue;
          for (let columnOffset = 0; columnOffset < entry.repeat; columnOffset += 1) {
            if (cells.size >= MAX_CHART_TABLE_CELLS) {
              truncated = true;
              break;
            }
            cells.set(`${startRow + rowOffset}:${entry.column + columnOffset}`, entry.value);
          }
        }
      }
      if (cells.size >= MAX_CHART_TABLE_CELLS) truncated = true;
      if (rowCount >= MAX_CHART_TABLE_ROWS) break;
    }
    tables.push({
      name: attributeByLocalName(table, 'name') ?? `local-table-${tables.length + 1}`,
      cells,
      rowCount,
      columnCount,
    });
  }
  if (truncated) {
    context.warnings.push({
      code: 'ODP_CHART_DATA_TRUNCATED',
      severity: 'warning',
      message: `Embedded chart data was bounded to ${MAX_CHART_POINTS} addressable points`,
      elementId,
      sourcePart,
    });
  }
  return tables;
}

function columnIndex(name: string): number | undefined {
  let value = 0;
  for (const character of name.toUpperCase()) {
    const digit = character.charCodeAt(0) - 64;
    if (digit < 1 || digit > 26) return undefined;
    value = value * 26 + digit;
  }
  return value > 0 ? value - 1 : undefined;
}

function coordinateFromAddress(value: string): { coordinate: OdfCellCoordinate; matchIndex: number } | undefined {
  const match = /(?:^|\.)\$?([A-Za-z]+)\$?([1-9][0-9]*)$/.exec(value.trim());
  if (!match?.[1] || !match[2]) return undefined;
  const column = columnIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (column === undefined || !Number.isSafeInteger(row) || row < 0) return undefined;
  return { coordinate: { row, column }, matchIndex: match.index };
}

function tableNameFromAddress(value: string): string | undefined {
  const first = value.trim().split(':')[0] ?? '';
  const parsed = coordinateFromAddress(first);
  if (!parsed || parsed.matchIndex === 0) return undefined;
  let name = first.slice(0, parsed.matchIndex).trim().replace(/^\$/, '');
  if (name.startsWith("'") && name.endsWith("'")) name = name.slice(1, -1).replace(/''/g, "'");
  return name || undefined;
}

function cellsForAddress(reference: string | undefined, tables: OdfDataTable[]): OdfCellRange {
  if (!reference) return { cells: [], valid: true };
  const parts = reference.trim().split(':');
  const start = coordinateFromAddress(parts[0] ?? '');
  const end = coordinateFromAddress(parts.at(-1) ?? '');
  if (!start || !end) return { cells: [], valid: false };
  const tableName = tableNameFromAddress(reference);
  const table = tableName
    ? tables.find((candidate) => candidate.name === tableName)
    : tables[0];
  if (!table) return { cells: [], valid: false };
  const top = Math.min(start.coordinate.row, end.coordinate.row);
  const bottom = Math.max(start.coordinate.row, end.coordinate.row);
  const left = Math.min(start.coordinate.column, end.coordinate.column);
  const right = Math.max(start.coordinate.column, end.coordinate.column);
  if (top >= MAX_CHART_TABLE_ROWS || left >= MAX_CHART_TABLE_COLUMNS) return { cells: [], valid: false };
  const cells: OdfDataCell[] = [];
  for (let row = top; row <= bottom && cells.length < MAX_CHART_POINTS; row += 1) {
    for (let column = left; column <= right && cells.length < MAX_CHART_POINTS; column += 1) {
      cells.push(table.cells.get(`${row}:${column}`) ?? { label: '', number: null });
    }
  }
  return { cells, valid: true };
}

function chartTypeFor(value: string | undefined): ChartType | undefined {
  const nativeType = (value ?? '').split(':').at(-1)?.toLowerCase();
  return (
    {
      bar: 'bar',
      column: 'bar',
      line: 'line',
      area: 'area',
      circle: 'pie',
      pie: 'pie',
      ring: 'doughnut',
      radar: 'radar',
      'filled-radar': 'radar',
      scatter: 'scatter',
      bubble: 'bubble',
      stock: 'stock',
      surface: 'surface',
    } as Record<string, ChartType>
  )[nativeType ?? ''];
}

function odfBoolean(value: string | undefined): boolean | undefined {
  return value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : undefined;
}

function finiteNumber(value: string | undefined): number | undefined {
  const number = Number(value);
  return value !== undefined && Number.isFinite(number) ? number : undefined;
}

function chartPointStyle(properties: Record<string, string>): ChartPoint['style'] | undefined {
  const color = fillFromProperties(properties);
  const border = lineFromProperties(properties);
  return color || border ? { color, border } : undefined;
}

function applyChartPointStyles(
  points: ChartPoint[],
  seriesElement: Element,
  styles: Map<string, OdfStyle>,
): void {
  let pointIndex = 0;
  for (const pointElement of childElements(seriesElement, 'data-point')) {
    const repeat = boundedRepeat(pointElement, 'repeated', MAX_CHART_POINTS);
    const style = chartPointStyle(styleProperties(pointElement, styles));
    for (let index = 0; index < repeat && pointIndex < points.length; index += 1, pointIndex += 1) {
      if (style) points[pointIndex]!.style = style;
    }
  }
}

function markerFromProperties(properties: Record<string, string>): ChartSeries['marker'] | undefined {
  const symbolType = properties['symbol-type'];
  const symbolName = properties['symbol-name'] ?? '';
  if (!symbolType && !symbolName) return undefined;
  const shape = /square/i.test(symbolName)
    ? 'square'
    : /diamond/i.test(symbolName)
      ? 'diamond'
      : /triangle|arrow/i.test(symbolName)
        ? 'triangle'
        : 'circle';
  return {
    visible: symbolType !== 'none',
    shape,
    size: Math.max(0, parseLength(properties['symbol-width']) ?? parseLength(properties['symbol-height']) ?? 6),
  };
}

function dataLabelsFromProperties(properties: Record<string, string>): ChartSeries['dataLabels'] | undefined {
  const numberLabel = properties['data-label-number'];
  const textLabel = odfBoolean(properties['data-label-text']);
  const symbolLabel = odfBoolean(properties['data-label-symbol']);
  if (!numberLabel && textLabel === undefined && symbolLabel === undefined) return undefined;
  return {
    visible: numberLabel !== 'none' || textLabel === true || symbolLabel === true,
    showValue: numberLabel === 'value' || numberLabel === 'value-and-percentage',
    showPercent: numberLabel === 'percentage' || numberLabel === 'value-and-percentage',
    showCategory: textLabel,
  };
}

interface ParsedOdfSeries {
  element: Element;
  type: ChartType;
  name: string;
  values: OdfDataCell[];
  domains: OdfDataCell[][];
  categories: OdfDataCell[];
  properties: Record<string, string>;
}

function labelForPoint(cell: OdfDataCell | undefined): string | undefined {
  return cell && cell.label !== '' ? cell.label : undefined;
}

function pointsForSeries(series: ParsedOdfSeries): ChartPoint[] {
  const length = Math.min(
    MAX_CHART_POINTS,
    Math.max(series.values.length, series.categories.length, ...series.domains.map((domain) => domain.length), 0),
  );
  const points: ChartPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    const label = labelForPoint(series.categories[index]);
    if (series.type === 'scatter') {
      points.push({ ...(label ? { label } : {}), x: series.domains[0]?.[index]?.number ?? null, y: series.values[index]?.number ?? null });
    } else if (series.type === 'bubble') {
      points.push({
        ...(label ? { label } : {}),
        x: series.domains[1]?.[index]?.number ?? null,
        y: series.domains[0]?.[index]?.number ?? null,
        size: series.values[index]?.number ?? null,
      });
    } else if (series.type === 'surface') {
      const xDomain = series.domains[1] ?? [];
      const yDomain = series.domains[0] ?? [];
      const xIndex = xDomain.length > 0 ? index % xDomain.length : index;
      const yIndex = xDomain.length > 0 ? Math.floor(index / xDomain.length) : index;
      points.push({
        ...(label ? { label } : {}),
        x: xDomain[xIndex]?.number ?? null,
        y: yDomain[yIndex]?.number ?? null,
        value: series.values[index]?.number ?? null,
      });
    } else {
      points.push({ ...(label ? { label } : {}), value: series.values[index]?.number ?? null });
    }
  }
  return points;
}

function chartSeriesFromParsed(series: ParsedOdfSeries, styles: Map<string, OdfStyle>): ChartSeries {
  const points = pointsForSeries(series);
  applyChartPointStyles(points, series.element, styles);
  const color = fillFromProperties(series.properties);
  const interpolation = series.properties.interpolation;
  return {
    name: series.name,
    points,
    ...(color ? { color } : {}),
    ...(attributeByLocalName(series.element, 'data-style-name')
      ? { numberFormat: attributeByLocalName(series.element, 'data-style-name') }
      : {}),
    ...(markerFromProperties(series.properties) ? { marker: markerFromProperties(series.properties) } : {}),
    ...(interpolation && interpolation !== 'none' && interpolation !== 'linear' ? { smooth: true } : {}),
    ...(lineFromProperties(series.properties) ? { line: lineFromProperties(series.properties) } : {}),
    ...(dataLabelsFromProperties(series.properties) ? { dataLabels: dataLabelsFromProperties(series.properties) } : {}),
  };
}

function stockSeriesFromParsed(series: ParsedOdfSeries[], categories: OdfDataCell[], name: string): ChartSeries {
  const selected = series.slice(0, 4);
  const fields: Array<'open' | 'low' | 'high' | 'close'> =
    selected.length >= 4
      ? ['open', 'low', 'high', 'close']
      : selected.length === 3
        ? ['low', 'high', 'close']
        : selected.length === 2
          ? ['low', 'high']
          : ['close'];
  const length = Math.min(MAX_CHART_POINTS, Math.max(categories.length, ...selected.map((item) => item.values.length), 0));
  const points = Array.from({ length }, (_, index) => {
    const point: ChartPoint = {};
    const label = labelForPoint(categories[index]);
    if (label) point.label = label;
    fields.forEach((field, fieldIndex) => {
      point[field] = selected[fieldIndex]?.values[index]?.number ?? null;
    });
    return point;
  });
  return { name, points };
}

function chartNeedsAxes(type: ChartType): boolean {
  return type !== 'pie' && type !== 'doughnut';
}

function chartAxes(
  chart: Element,
  plotArea: Element,
  chartTypes: ChartType[],
  context: OdpContext,
  styles: Map<string, OdfStyle>,
  sourcePart: string,
): ChartAxis[] {
  if (!chartTypes.some(chartNeedsAxes)) return [];
  const axes: ChartAxis[] = [];
  const numericX = chartTypes.some((type) => ['scatter', 'bubble', 'surface'].includes(type));
  for (const [index, axis] of descendants(plotArea, 'axis').entries()) {
    if (nearestAncestor(axis, 'chart') !== chart) continue;
    const properties = styleProperties(axis, styles);
    const dimension = attributeByLocalName(axis, 'dimension') ?? 'x';
    const nativeName = attributeByLocalName(axis, 'name') ?? `${dimension}-${index + 1}`;
    const secondary = /secondary/i.test(nativeName) || properties['axis-position'] === 'end';
    const titleElement = childElements(axis, 'title')[0];
    const title = titleElement ? textFromElement(titleElement).trim() || undefined : undefined;
    const minimum = finiteNumber(properties.minimum);
    const maximum = finiteNumber(properties.maximum);
    const grid = childElements(axis, 'grid').find((candidate) => (attributeByLocalName(candidate, 'class') ?? 'major') === 'major');
    axes.push({
      id: stableId('axis', `${sourcePart}:${nativeName}:${index}`),
      kind:
        properties['axis-type'] === 'date'
          ? 'date'
          : dimension === 'x' && !numericX && descendants(axis, 'categories').length > 0
            ? 'category'
            : dimension === 'x' && !numericX
              ? 'category'
              : 'value',
      position: dimension === 'x' ? (secondary ? 'top' : 'bottom') : secondary || dimension === 'z' ? 'right' : 'left',
      visible: odfBoolean(properties['display-axis']) !== false && odfBoolean(properties.visible) !== false,
      ...(odfBoolean(properties['reverse-direction']) !== undefined
        ? { reversed: odfBoolean(properties['reverse-direction']) }
        : {}),
      ...(title ? { title, titleStyle: textStyleFor(titleElement!, context, {}, styles) } : {}),
      ...(attributeByLocalName(axis, 'style-name') ? { labelStyle: textStyleFromProperties(properties, context) } : {}),
      ...(attributeByLocalName(axis, 'data-style-name')
        ? { numberFormat: attributeByLocalName(axis, 'data-style-name') }
        : {}),
      ...(minimum !== undefined ? { minimum } : {}),
      ...(maximum !== undefined ? { maximum } : {}),
      ...(grid && lineFromProperties(styleProperties(grid, styles))
        ? { majorGridlines: lineFromProperties(styleProperties(grid, styles)) }
        : {}),
      ...(lineFromProperties(properties) ? { line: lineFromProperties(properties) } : {}),
    });
  }
  if (axes.length === 0) {
    axes.push(
      { id: stableId('axis', `${sourcePart}:x`), kind: numericX ? 'value' : 'category', position: 'bottom', visible: true },
      { id: stableId('axis', `${sourcePart}:y`), kind: 'value', position: 'left', visible: true },
    );
  }
  return axes;
}

function legendForChart(
  legend: Element | undefined,
  context: OdpContext,
  styles: Map<string, OdfStyle>,
  approximations: Set<string>,
): ChartLegend | undefined {
  if (!legend) return undefined;
  const position = attributeByLocalName(legend, 'legend-position') ?? 'end';
  const mappedPosition: ChartLegend['position'] =
    position === 'top-end'
      ? 'topRight'
      : position === 'top' || position === 'top-start'
        ? 'top'
        : position === 'bottom' || position.startsWith('bottom-')
          ? 'bottom'
          : position === 'start'
            ? 'left'
            : 'right';
  if (position === 'top-start' || position.startsWith('bottom-')) approximations.add(`legend position ${position} was aligned to ${mappedPosition}`);
  return {
    visible: true,
    position: mappedPosition,
    overlay: false,
    style: textStyleFor(legend, context, {}, styles),
  };
}

function embeddedChart(
  chart: Element,
  chartDocument: Document,
  context: OdpContext,
  sourcePart: string,
  base: ReturnType<typeof baseElement>,
): DeckElement {
  const styles = new Map([...context.styles, ...collectStyles([chartDocument])]);
  const chartBase = { ...base, source: { ...base.source, part: sourcePart, nativeType: 'chart' as const } };
  const rootClass = attributeByLocalName(chart, 'class');
  const rootType = chartTypeFor(rootClass);
  const plotArea = childElements(chart, 'plot-area')[0] ?? firstDescendant(chart, 'plot-area');
  if (!plotArea) {
    context.warnings.push({
      code: 'ODP_CHART_INVALID',
      severity: 'warning',
      message: 'Embedded chart has no plot area',
      elementId: base.id,
      sourcePart,
    });
    return { ...chartBase, type: 'unsupported', reason: 'Embedded ODF chart has no plot area', fallbackText: base.name };
  }

  const approximations = new Set<string>();
  if ((rootClass ?? '').endsWith('filled-radar')) approximations.add('filled radar was imported as an unfilled radar chart');
  const rootProperties = styleProperties(chart, styles);
  const plotProperties = styleProperties(plotArea, styles);
  if (odfBoolean(rootProperties['three-dimensional']) || odfBoolean(plotProperties['three-dimensional'])) {
    approximations.add('three-dimensional geometry was flattened to 2D');
  }
  if (odfBoolean(plotProperties.deep)) approximations.add('deep series placement was flattened to 2D');
  if (childElements(chart, 'subtitle').length > 0) approximations.add('chart subtitle was omitted');
  if (descendants(plotArea, 'wall').length > 0 || descendants(plotArea, 'floor').length > 0) {
    approximations.add('chart wall and floor effects were omitted');
  }
  if (descendants(plotArea, 'regression-curve').length > 0 || descendants(plotArea, 'error-indicator').length > 0) {
    approximations.add('regression or error-indicator overlays were omitted');
  }
  if (descendants(plotArea, 'mean-value').length > 0) approximations.add('mean-value overlays were omitted');
  if (odfBoolean(plotProperties['connect-bars'])) approximations.add('bar connector lines were omitted');
  if (plotProperties['solid-type']) approximations.add(`3D solid type ${plotProperties['solid-type']} was flattened to 2D`);
  for (const axis of descendants(plotArea, 'axis')) {
    if (odfBoolean(styleProperties(axis, styles).logarithmic)) approximations.add('logarithmic axis scaling was approximated as linear');
  }
  for (const point of descendants(plotArea, 'data-point')) {
    const offset = finiteNumber(styleProperties(point, styles)['pie-offset']);
    if (offset && offset !== 0) approximations.add('exploded pie or ring slices were imported without offsets');
  }

  const tables = chartDataTables(chart, context, sourcePart, base.id);
  const warnedReferences = new Set<string>();
  const resolveReference = (reference: string | undefined): OdfDataCell[] => {
    const resolved = cellsForAddress(reference, tables);
    if (reference && !resolved.valid && !warnedReferences.has(reference)) {
      warnedReferences.add(reference);
      context.warnings.push({
        code: 'ODP_CHART_DATA_REFERENCE_MISSING',
        severity: 'warning',
        message: `Chart cell-range reference could not be resolved: ${reference}`,
        elementId: base.id,
        sourcePart,
      });
    }
    return resolved.cells;
  };
  const categoriesElement = descendants(plotArea, 'categories')[0];
  const categories = resolveReference(categoriesElement && attributeByLocalName(categoriesElement, 'cell-range-address'));
  const parsedSeries: ParsedOdfSeries[] = [];
  let unsupportedSeries = 0;
  for (const seriesElement of descendants(plotArea, 'series')) {
    const nativeSeriesType = attributeByLocalName(seriesElement, 'class');
    const type = chartTypeFor(nativeSeriesType) ?? rootType;
    if (!type) {
      unsupportedSeries += 1;
      continue;
    }
    if (nativeSeriesType && !chartTypeFor(nativeSeriesType)) {
      approximations.add(`series class ${nativeSeriesType} was imported as ${type}`);
    }
    const labelReference = attributeByLocalName(seriesElement, 'label-cell-address');
    const label = resolveReference(labelReference)[0];
    const domains = childElements(seriesElement, 'domain').map((domain) =>
      resolveReference(attributeByLocalName(domain, 'cell-range-address')),
    );
    const properties = styleProperties(seriesElement, styles);
    const interpolation = properties.interpolation;
    if (interpolation && interpolation !== 'none' && interpolation !== 'linear') {
      approximations.add(`interpolation ${interpolation} was represented as a smooth series`);
    }
    parsedSeries.push({
      element: seriesElement,
      type,
      name: labelForPoint(label) ?? `Series ${parsedSeries.length + 1}`,
      values: resolveReference(attributeByLocalName(seriesElement, 'values-cell-range-address')),
      domains,
      categories,
      properties,
    });
  }
  if (unsupportedSeries > 0) approximations.add(`${unsupportedSeries} unsupported chart series were omitted`);

  const effectiveTypes = Array.from(new Set(parsedSeries.map((series) => series.type)));
  if (effectiveTypes.length === 0 && rootType) effectiveTypes.push(rootType);
  if (!rootType && rootClass && effectiveTypes.length > 0) {
    approximations.add(`chart class ${rootClass} was inferred from its supported series classes`);
  }
  if (effectiveTypes.length === 0) {
    context.warnings.push({
      code: 'ODP_CHART_TYPE_UNSUPPORTED',
      severity: 'warning',
      message: `Embedded chart class ${rootClass ?? 'unknown'} is unsupported`,
      elementId: base.id,
      sourcePart,
    });
    return {
      ...chartBase,
      type: 'unsupported',
      reason: `Unsupported ODF chart type: ${rootClass ?? 'unknown'}`,
      fallbackText: base.name,
    };
  }

  const axes = chartAxes(chart, plotArea, effectiveTypes, context, styles, sourcePart);
  const axisIds = axes.map((axis) => axis.id).slice(0, 4);
  const titleElement = childElements(chart, 'title')[0];
  const title = titleElement ? textFromElement(titleElement).trim() || undefined : undefined;
  const legend = legendForChart(childElements(chart, 'legend')[0], context, styles, approximations);
  const plots: ChartPlot[] = effectiveTypes.map((type) => {
    const sourceSeries = parsedSeries.filter((series) => series.type === type);
    const series = type === 'stock'
      ? [stockSeriesFromParsed(sourceSeries, categories, title || 'Stock')]
      : sourceSeries.map((item) => chartSeriesFromParsed(item, styles));
    if (type === 'stock' && sourceSeries.length !== 3 && sourceSeries.length !== 4) {
      approximations.add(`stock chart used ${sourceSeries.length} value series instead of the standard three or four`);
    }
    const percentage = odfBoolean(plotProperties.percentage) === true;
    const stacked = odfBoolean(plotProperties.stacked) === true;
    const angle = finiteNumber(plotProperties['angle-offset']);
    const holeSize = finiteNumber((plotProperties['hole-size'] ?? '').replace('%', ''));
    return {
      type,
      series,
      ...(type === 'bar'
        ? {
            grouping: percentage ? 'percentStacked' as const : stacked ? 'stacked' as const : 'clustered' as const,
            direction: odfBoolean(plotProperties.vertical) === true ? 'bar' as const : 'column' as const,
          }
        : percentage
          ? { grouping: 'percentStacked' as const }
          : stacked
            ? { grouping: 'stacked' as const }
            : {}),
      ...(chartNeedsAxes(type) ? { axisIds } : {}),
      ...(type === 'doughnut' ? { holeSize: Math.max(0, Math.min(90, holeSize ?? 50)) } : {}),
      ...((type === 'pie' || type === 'doughnut') && angle !== undefined ? { firstSliceAngle: angle } : {}),
    };
  });

  if (approximations.size > 0) {
    context.warnings.push({
      code: 'ODP_CHART_EFFECT_APPROXIMATED',
      severity: 'warning',
      message: Array.from(approximations).join('; '),
      elementId: base.id,
      sourcePart,
    });
  }
  const emptyCellMode = plotProperties['treat-empty-cells'];
  const displayBlanksAs = emptyCellMode === 'use-zero'
    ? 'zero' as const
    : emptyCellMode === 'ignore' || emptyCellMode === 'continue'
      ? 'span' as const
      : emptyCellMode
        ? 'gap' as const
        : undefined;
  return {
    ...chartBase,
    type: 'chart',
    plots,
    axes,
    ...(title ? { title, titleStyle: textStyleFor(titleElement!, context, {}, styles) } : {}),
    ...(legend ? { legend } : {}),
    ...(displayBlanksAs ? { displayBlanksAs } : {}),
    ...(fillFromProperties(rootProperties) ? { background: fillFromProperties(rootProperties) } : {}),
    ...(fillFromProperties(plotProperties) ? { plotBackground: fillFromProperties(plotProperties) } : {}),
  } satisfies ChartElement;
}

function embeddedObjectContentPath(href: string | undefined): { contentPath: string; objectPath: string } | undefined {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('#')) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(href).replace(/^\.\//, '');
  } catch {
    return undefined;
  }
  const segments = decoded.split('/').filter((segment) => segment && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..' || segment.includes('\\'))) return undefined;
  if (!segments[0]?.startsWith('Object')) return undefined;
  const normalized = segments.join('/').replace(/\/$/, '');
  const contentPath = normalized.endsWith('/content.xml') ? normalized : `${normalized}/content.xml`;
  const objectPath = contentPath.slice(0, -'/content.xml'.length);
  return { contentPath, objectPath };
}

function embeddedObjectElement(
  frame: Element,
  object: Element,
  context: OdpContext,
  sourcePart: string,
  renderOrder: number,
): DeckElement {
  const base = baseElement(context, sourcePart, frame, 'chart', renderOrder);
  const unsupported = (code: string, message: string, reason: string, objectPart = sourcePart): DeckElement => {
    context.warnings.push({ code, severity: 'warning', message, elementId: base.id, sourcePart: objectPart });
    return { ...base, type: 'unsupported', reason, fallbackText: base.name };
  };
  if (localName(object) !== 'object') {
    return unsupported(
      'ODP_EMBEDDED_OBJECT_UNSUPPORTED',
      `Embedded ${localName(object)} content is not imported`,
      `Embedded ODF ${localName(object)} object is unsupported`,
    );
  }
  const resolved = embeddedObjectContentPath(attributeByLocalName(object, 'href'));
  if (!resolved) {
    return unsupported(
      'ODP_EMBEDDED_OBJECT_UNSUPPORTED',
      'Embedded object reference is absent, external, or outside an Object* package directory',
      'Embedded ODF object reference is unsupported',
    );
  }
  const objectMimeType = context.manifestTypes.get(resolved.objectPath);
  if (objectMimeType && objectMimeType !== 'application/vnd.oasis.opendocument.chart') {
    return unsupported(
      'ODP_EMBEDDED_OBJECT_UNSUPPORTED',
      `Embedded object type ${objectMimeType} is not a chart`,
      `Embedded ODF object type is unsupported: ${objectMimeType}`,
      resolved.contentPath,
    );
  }
  const xml = decodeXml(context.files, resolved.contentPath);
  if (!xml) {
    return unsupported(
      'ODP_EMBEDDED_OBJECT_MISSING',
      `Embedded object data was not found at ${resolved.contentPath}`,
      'Embedded ODF object data is missing',
      resolved.contentPath,
    );
  }
  try {
    const document = parseXmlDocument(xml, resolved.contentPath);
    const chartCandidates = localName(document.documentElement) === 'chart'
      ? [document.documentElement, ...descendants(document, 'chart')]
      : descendants(document, 'chart');
    const chart = chartCandidates.find((candidate) => attributeByLocalName(candidate, 'class'));
    if (!chart) {
      return unsupported(
        'ODP_EMBEDDED_OBJECT_UNSUPPORTED',
        'Embedded ODF object does not contain a chart',
        'Embedded ODF object is not a chart',
        resolved.contentPath,
      );
    }
    return embeddedChart(chart, document, context, resolved.contentPath, base);
  } catch (error) {
    return unsupported(
      'ODP_CHART_INVALID',
      `Embedded chart XML could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      'Embedded ODF chart is invalid',
      resolved.contentPath,
    );
  }
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
    const object = childElements(element).find((child) => ['object', 'object-ole', 'plugin'].includes(localName(child)));
    if (object) return embeddedObjectElement(element, object, context, sourcePart, renderOrder);
    const image = childElements(element, 'image')[0];
    if (image) return imageElement(element, image, context, sourcePart, renderOrder);
    const table = descendants(element, 'table')[0];
    if (table) {
      const base = baseElement(context, sourcePart, element, 'table', renderOrder);
      return {
        ...base,
        type: 'table',
        ...tableData(table, context, sourcePart, base.id),
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
