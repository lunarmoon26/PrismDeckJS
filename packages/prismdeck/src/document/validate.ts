import type { ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import schema from '../../schema/prismdeck.schema.json';
import {
  DEFAULT_TEXT_STYLE,
  LEGACY_PRISMDECK_SCHEMA_VERSION,
  LEGACY_PRISMDECK_SCHEMA_VERSIONS,
  PRISMDECK_SCHEMA_VERSION,
  type ChartAxis,
  type ChartElement,
  type ChartPlot,
  type DeckSlide,
  type DeckDocument,
  type DeckElement,
  type TableElement,
  type TextStyle,
} from './types';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile<DeckDocument>(schema);

export class DeckValidationError extends Error {
  readonly issues: readonly ErrorObject[];

  constructor(message: string, issues: readonly ErrorObject[] = []) {
    super(message);
    this.name = 'DeckValidationError';
    this.issues = issues;
  }
}

interface LegacyTableElement extends Omit<TableElement, 'columns' | 'rows' | 'style'> {
  rows: string[][];
  headerRows: number;
  fill: string;
  stroke: string;
  textStyle: TextStyle;
}

interface LegacyChartSeries {
  name: string;
  values: Array<number | null>;
  color?: string;
}

interface LegacyChartElement extends Omit<ChartElement, 'plots' | 'axes'> {
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'area' | 'unknown';
  categories: string[];
  series: LegacyChartSeries[];
}

function migrateTable(element: LegacyTableElement): TableElement {
  const { rows, headerRows, fill, stroke, textStyle, ...base } = element;
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const border = { color: stroke || '#78716C', width: 1, style: 'solid' as const };
  return {
    ...base,
    columns: Array.from({ length: columnCount }, () => 1),
    rows: rows.map((row, rowIndex) => ({
      height: 1,
      cells: row.map((text, column) => ({
        column,
        text,
        ...(rowIndex < headerRows ? { header: true, style: { fill: '#E7E5E4' } } : {}),
      })),
    })),
    style: {
      fill: fill || '#FFFFFF',
      textStyle: textStyle ?? { ...DEFAULT_TEXT_STYLE },
      borders: { top: border, right: border, bottom: border, left: border },
    },
  };
}

function defaultLegacyAxes(): ChartAxis[] {
  return [
    { id: 'category', kind: 'category', position: 'bottom', visible: true },
    { id: 'value', kind: 'value', position: 'left', visible: true },
  ];
}

function migrateChart(element: LegacyChartElement): ChartElement {
  const { chartType, categories, series, ...base } = element;
  const type = chartType === 'column' || chartType === 'bar' ? 'bar' : chartType;
  const cartesian = !['pie', 'unknown'].includes(type);
  const plot: ChartPlot = {
    type,
    ...(chartType === 'column' ? { direction: 'column' as const } : {}),
    ...(chartType === 'bar' ? { direction: 'bar' as const } : {}),
    ...(cartesian ? { axisIds: ['category', 'value'] } : {}),
    series: series.map((legacySeries) => ({
      name: legacySeries.name,
      color: legacySeries.color,
      points: legacySeries.values.map((value, index) => ({ label: categories[index], value })),
    })),
  };
  return { ...base, plots: [plot], axes: cartesian ? defaultLegacyAxes() : [] };
}

/** Upgrade persisted documents at package boundaries before strict validation. */
export function migrateDeckDocument(value: unknown): DeckDocument {
  if (!value || typeof value !== 'object') throw new DeckValidationError('Invalid PrismDeck document');
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version === PRISMDECK_SCHEMA_VERSION) {
    validateDeckDocument(value);
    return value;
  }
  if (!(LEGACY_PRISMDECK_SCHEMA_VERSIONS as readonly unknown[]).includes(version)) {
    throw new DeckValidationError(`Unsupported PrismDeck schema version: ${String(version)}`);
  }

  const migrated = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  const migrateElements = (container: unknown): void => {
    if (!container || typeof container !== 'object') return;
    const elements = (container as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) return;
    (container as { elements: unknown[] }).elements = elements.map((element) => {
      if (!element || typeof element !== 'object') return element;
      const typed = element as { type?: unknown };
      if (typed.type === 'table') return migrateTable(element as LegacyTableElement);
      if (typed.type === 'chart') return migrateChart(element as LegacyChartElement);
      return element;
    });
  };
  if (version === LEGACY_PRISMDECK_SCHEMA_VERSION) {
    const layouts = migrated.layouts;
    const slides = migrated.slides;
    if (Array.isArray(layouts)) layouts.forEach(migrateElements);
    if (Array.isArray(slides)) slides.forEach(migrateElements);
  }
  migrated.schemaVersion = PRISMDECK_SCHEMA_VERSION;
  validateDeckDocument(migrated);
  return migrated;
}

function assertElementSpecific(element: DeckElement): void {
  switch (element.type) {
    case 'text':
      if (typeof element.text !== 'string' || !element.style) {
        throw new DeckValidationError(`Text element ${element.id} is missing text or style`);
      }
      break;
    case 'image':
      if (!element.assetId) {
        throw new DeckValidationError(`Image element ${element.id} is missing assetId`);
      }
      break;
    case 'shape':
      if (!element.shape || !element.fill || !element.stroke) {
        throw new DeckValidationError(`Shape element ${element.id} is incomplete`);
      }
      break;
    case 'table':
      if (!Array.isArray(element.columns) || element.columns.length === 0 || !Array.isArray(element.rows) || !element.style) {
        throw new DeckValidationError(`Table element ${element.id} is incomplete`);
      }
      if (element.columns.some((width) => !Number.isFinite(width) || width <= 0)) {
        throw new DeckValidationError(`Table element ${element.id} has invalid column widths`);
      }
      const occupiedRows = new Map<number, Uint8Array>();
      for (let rowIndex = 0; rowIndex < element.rows.length; rowIndex += 1) {
        const row = element.rows[rowIndex]!;
        if (!Number.isFinite(row.height) || row.height <= 0) {
          throw new DeckValidationError(`Table element ${element.id} has an invalid row height`);
        }
        for (const cell of row.cells) {
          const columnSpan = cell.columnSpan ?? 1;
          const rowSpan = cell.rowSpan ?? 1;
          if (
            !Number.isInteger(cell.column) ||
            cell.column < 0 ||
            !Number.isInteger(columnSpan) ||
            columnSpan < 1 ||
            cell.column + columnSpan > element.columns.length ||
            !Number.isInteger(rowSpan) ||
            rowSpan < 1 ||
            rowIndex + rowSpan > element.rows.length
          ) {
            throw new DeckValidationError(`Table element ${element.id} has an invalid cell span`);
          }
          for (let occupiedRowIndex = rowIndex; occupiedRowIndex < rowIndex + rowSpan; occupiedRowIndex += 1) {
            let occupied = occupiedRows.get(occupiedRowIndex);
            if (!occupied) {
              occupied = new Uint8Array(element.columns.length);
              occupiedRows.set(occupiedRowIndex, occupied);
            }
            for (let column = cell.column; column < cell.column + columnSpan; column += 1) {
              if (occupied[column]) throw new DeckValidationError(`Table element ${element.id} has overlapping cells`);
              occupied[column] = 1;
            }
          }
        }
      }
      break;
    case 'chart':
      if (!Array.isArray(element.plots) || element.plots.length === 0 || !Array.isArray(element.axes)) {
        throw new DeckValidationError(`Chart element ${element.id} is incomplete`);
      }
      const axisIds = new Set(element.axes.map((axis) => axis.id));
      if (axisIds.size !== element.axes.length) throw new DeckValidationError(`Chart element ${element.id} has duplicate axes`);
      for (const plot of element.plots) {
        if (!Array.isArray(plot.series)) throw new DeckValidationError(`Chart element ${element.id} has invalid series`);
        if (plot.axisIds?.some((axisId) => !axisIds.has(axisId))) {
          throw new DeckValidationError(`Chart element ${element.id} references a missing axis`);
        }
        for (const series of plot.series) {
          if (!Array.isArray(series.points)) throw new DeckValidationError(`Chart element ${element.id} has invalid points`);
        }
      }
      break;
    case 'unsupported':
      if (!element.reason) {
        throw new DeckValidationError(`Unsupported element ${element.id} is missing a reason`);
      }
      break;
    default: {
      const neverElement: never = element;
      throw new DeckValidationError(`Unknown element type: ${String(neverElement)}`);
    }
  }
}

function assertSlideTimeline(slide: DeckSlide): void {
  if (!slide.timeline) return;
  const elementIds = new Set<string>();
  for (const element of slide.elements) {
    if (elementIds.has(element.id)) throw new DeckValidationError(`Slide ${slide.id} has duplicate element ID: ${element.id}`);
    elementIds.add(element.id);
  }
  const clipIds = new Set<string>();
  const entranceTargetIds = new Set<string>();
  let previousClip = false;
  let encounteredClickTrigger = false;
  for (const clip of slide.timeline.clips) {
    if (clipIds.has(clip.id)) throw new DeckValidationError(`Slide ${slide.id} has duplicate timeline clip ID: ${clip.id}`);
    clipIds.add(clip.id);
    const target = slide.elements.find((element) => element.id === clip.targetId);
    if (!target) throw new DeckValidationError(`Timeline clip ${clip.id} targets missing element: ${clip.targetId}`);
    if (!target.visible) throw new DeckValidationError(`Timeline clip ${clip.id} targets an authored-hidden element: ${clip.targetId}`);
    if (target.physics) throw new DeckValidationError(`Timeline clip ${clip.id} targets a physics element: ${clip.targetId}`);
    if (clip.kind === 'entrance') {
      if (entranceTargetIds.has(clip.targetId)) {
        throw new DeckValidationError(`Slide ${slide.id} has multiple entrance clips for element: ${clip.targetId}`);
      }
      entranceTargetIds.add(clip.targetId);
    }
    if (!previousClip && (clip.trigger === 'with-previous' || clip.trigger === 'after-previous')) {
      throw new DeckValidationError(`Timeline clip ${clip.id} has ${clip.trigger} without a preceding clip`);
    }
    if (encounteredClickTrigger && clip.trigger === 'on-enter') {
      throw new DeckValidationError(`Timeline clip ${clip.id} cannot enter after an explicit click group`);
    }
    if (clip.trigger === 'on-click') encounteredClickTrigger = true;
    previousClip = true;
  }
}

export function validateDeckDocument(value: unknown): asserts value is DeckDocument {
  if (!validateSchema(value)) {
    throw new DeckValidationError('Invalid PrismDeck document', validateSchema.errors ?? []);
  }

  for (const layout of value.layouts) {
    for (const element of layout.elements) assertElementSpecific(element);
  }
  for (const slide of value.slides) {
    for (const element of slide.elements) assertElementSpecific(element);
    assertSlideTimeline(slide);
  }
}

export function isDeckDocument(value: unknown): value is DeckDocument {
  try {
    validateDeckDocument(value);
    return true;
  } catch {
    return false;
  }
}
