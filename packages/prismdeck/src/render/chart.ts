import { init, use, type EChartsCoreOption } from 'echarts/core';
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
} from 'echarts/charts';
import {
  GraphicComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
} from 'echarts/components';
import { LabelLayout, LegacyGridContainLabel } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import type {
  BorderStyle,
  ChartAxis,
  ChartDataLabels,
  ChartElement,
  ChartPlot,
  ChartPoint,
  ChartSeries,
  TextStyle,
} from '../document/types';

type EChartsOption = EChartsCoreOption;
type LooseOption = Record<string, unknown>;
type Datum = Record<string, unknown>;

interface LayoutBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface AxisRef {
  source: ChartAxis;
  dimension: 'x' | 'y';
  index: number;
  option: LooseOption;
}

interface BuildState {
  element: ChartElement;
  width: number;
  height: number;
  layout: LayoutBox;
  xAxes: AxisRef[];
  yAxes: AxisRef[];
  axesById: Map<string, AxisRef[]>;
  series: LooseOption[];
  radars: LooseOption[];
  graphics: LooseOption[];
  legendNames: string[];
  colorIndex: number;
  radialIndex: number;
  radialCount: number;
  fallbackCount: number;
}

interface LabelParams {
  dataIndex?: number;
  name?: string | number;
  percent?: number;
  seriesName?: string;
  value?: unknown;
}

const COLORS = [
  '#2563EB',
  '#EA580C',
  '#16A34A',
  '#9333EA',
  '#DC2626',
  '#0891B2',
  '#CA8A04',
  '#DB2777',
  '#4F46E5',
  '#0F766E',
] as const;

const COLOR_NAMES = new Set([
  'black',
  'blue',
  'cyan',
  'gray',
  'green',
  'grey',
  'magenta',
  'orange',
  'purple',
  'red',
  'transparent',
  'white',
  'yellow',
]);

use([
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  LabelLayout,
  LegacyGridContainLabel,
  SVGRenderer,
]);

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function renderDimension(value: number): number {
  return Math.max(1, Math.round(finite(value) ?? 1));
}

function safeText(value: unknown, fallback = '', maximum = 512): string {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim();
  return (text || fallback).slice(0, maximum);
}

function safeFontFamily(value: string | undefined): string {
  const font = safeText(value, 'Arial, sans-serif', 160).replace(/[^a-zA-Z0-9 ,.'"_-]/g, '');
  return font || 'Arial, sans-serif';
}

function safeColor(value: string | undefined, fallback: string): string {
  const color = safeText(value, '', 80);
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|rgba|hsl|hsla)\(\s*[-+.\d%]+(?:\s*[,/]\s*[-+.\d%]+){2,3}\s*\)$/i.test(color)) return color;
  if (COLOR_NAMES.has(color.toLowerCase())) return color.toLowerCase();
  return fallback;
}

function fontSizePixels(element: ChartElement, style: TextStyle | undefined, height: number, fallback: number): number {
  const value = finite(style?.fontSize);
  if (value === undefined || value <= 0) return fallback;
  const pixels = value <= 2 ? (value / Math.max(0.001, element.frame.height)) * height : value;
  return clamp(pixels, 8, Math.max(8, Math.min(96, height * 0.3)));
}

function textStyleOption(
  element: ChartElement,
  style: TextStyle | undefined,
  height: number,
  fallbackSize: number,
  fallbackColor = '#262626',
): LooseOption {
  const fontSize = fontSizePixels(element, style, height, fallbackSize);
  return {
    color: safeColor(style?.color, fallbackColor),
    fontFamily: safeFontFamily(style?.fontFamily),
    fontSize,
    fontStyle: style?.fontStyle === 'italic' ? 'italic' : 'normal',
    fontWeight: Math.round(clamp(finite(style?.fontWeight) ?? 400, 100, 900)),
    lineHeight: Math.max(fontSize, fontSize * clamp(finite(style?.lineHeight) ?? 1.2, 0.8, 3)),
    align: style?.align ?? 'left',
    verticalAlign: style?.verticalAlign === 'middle' ? 'middle' : style?.verticalAlign === 'bottom' ? 'bottom' : 'top',
  };
}

function lineStyleOption(line: BorderStyle | undefined, fallbackColor = '#A3A3A3'): LooseOption {
  return {
    color: safeColor(line?.color, fallbackColor),
    width: clamp(finite(line?.width) ?? 1, 0, 20),
    type: line?.style === 'dashed' || line?.style === 'dotted' ? line.style : 'solid',
  };
}

function pointItemStyle(point: ChartPoint, fallbackColor: string): LooseOption {
  const border = point.style?.border;
  return {
    color: safeColor(point.style?.color, fallbackColor),
    ...(border
      ? {
          borderColor: safeColor(border.color, fallbackColor),
          borderWidth: clamp(finite(border.width) ?? 1, 0, 20),
          borderType: border.style,
        }
      : {}),
  };
}

function splitFormatSections(format: string): string[] {
  const sections: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const character of format) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      current += character;
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
      current += character;
    } else if (character === ';' && !quoted) {
      sections.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  sections.push(current);
  return sections.slice(0, 4);
}

function formatLiteral(value: string): string {
  return value
    .replace(/\[[^\]]{0,64}\]/g, '')
    .replace(/"([^"]*)"/g, '$1')
    .replace(/\\(.)/g, '$1')
    .replace(/[_*]./g, '');
}

function defaultNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  if (Number.isInteger(value)) return String(value);
  const absolute = Math.abs(value);
  if ((absolute !== 0 && absolute < 0.000001) || absolute >= 1e15) return value.toExponential(6).replace(/\.?(?:0+)e/, 'e');
  return value.toFixed(6).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
}

function formatNumber(value: number, format?: string): string {
  if (!Number.isFinite(value)) return '';
  const sections = splitFormatSections(safeText(format, '', 256));
  const sectionIndex = value < 0 && sections.length > 1 ? 1 : value === 0 && sections.length > 2 ? 2 : 0;
  const section = sections[sectionIndex] ?? sections[0] ?? '';
  const cleaned = section.replace(/\[[^\]]{0,64}\]/g, '').replace(/[_*]./g, '');
  const match = /[0#?][0#?,]*(?:\.[0#?]+)?(?:[Ee][+-]?0+)?/.exec(cleaned);
  if (!match) {
    const literal = formatLiteral(cleaned);
    return literal && !/^general$/i.test(literal) ? literal : defaultNumber(value);
  }

  const pattern = match[0];
  const percent = cleaned.includes('%');
  const numeric = Math.abs(value) * (percent ? 100 : 1);
  const decimalPattern = pattern.split(/[Ee]/)[0]?.split('.')[1] ?? '';
  const maximumDecimals = decimalPattern.length;
  const minimumDecimals = (decimalPattern.match(/0/g) ?? []).length;
  const scientific = /E/i.test(pattern);
  let body: string;
  if (scientific) {
    body = numeric.toExponential(maximumDecimals).replace('e', 'E');
  } else {
    body = numeric.toFixed(maximumDecimals);
    if (maximumDecimals > minimumDecimals) {
      const [integer = '0', decimal = ''] = body.split('.');
      const trimmed = decimal.slice(0, minimumDecimals) + decimal.slice(minimumDecimals).replace(/0+$/, '');
      body = trimmed ? `${integer}.${trimmed}` : integer;
    }
    if (pattern.split('.')[0]?.includes(',')) {
      const [integer = '0', decimal] = body.split('.');
      body = `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimal === undefined ? '' : `.${decimal}`}`;
    }
  }

  const prefix = formatLiteral(cleaned.slice(0, match.index));
  const suffix = formatLiteral(cleaned.slice(match.index + pattern.length));
  const sign = value < 0 && sectionIndex === 0 ? '-' : '';
  return `${sign}${prefix}${body}${suffix}`;
}

function axisFormatter(format: string | undefined, dateAxis: boolean): (value: string | number) => string {
  return (value: string | number): string => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (format) return formatNumber(value, format);
      if (dateAxis) {
        const date = new Date(value);
        if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
      }
      return defaultNumber(value);
    }
    return safeText(value, '', 160);
  };
}

function pointNumber(point: ChartPoint): number | null {
  return finite(point.value) ?? finite(point.y) ?? null;
}

function blankNumber(value: number | null, mode: ChartElement['displayBlanksAs']): number | null {
  return value === null && mode === 'zero' ? 0 : value;
}

function pointLabel(point: ChartPoint, index: number): string {
  return safeText(point.label ?? point.x, String(index + 1), 160);
}

function labelPosition(position: string | undefined): string {
  switch (safeText(position).toLowerCase()) {
    case 'ctr':
    case 'center':
      return 'inside';
    case 'inbase':
      return 'insideBottom';
    case 'inend':
      return 'insideTop';
    case 'l':
    case 'left':
      return 'left';
    case 'r':
    case 'right':
      return 'right';
    case 't':
    case 'top':
      return 'top';
    case 'b':
    case 'bottom':
      return 'bottom';
    case 'bestfit':
    case 'outend':
    case 'outside':
      return 'outside';
    default:
      return 'top';
  }
}

function labelNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return finite(value);
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const candidate = finite(value[index]);
      if (candidate !== undefined) return candidate;
    }
  }
  if (value && typeof value === 'object' && 'value' in value) return labelNumber((value as { value: unknown }).value);
  return undefined;
}

function dataLabelOption(
  state: BuildState,
  series: ChartSeries,
  points: ChartPoint[],
  displayedValues?: Array<number | null>,
  defaultVisible = false,
): LooseOption {
  const labels: ChartDataLabels | undefined = series.dataLabels;
  const visible = labels?.visible ?? defaultVisible;
  const noExplicitParts = !labels?.showValue && !labels?.showCategory && !labels?.showSeries && !labels?.showPercent;
  return {
    show: visible,
    position: labelPosition(labels?.position),
    ...textStyleOption(state.element, labels?.style, state.height, Math.max(9, state.height * 0.032)),
    formatter: (parameters: LabelParams): string => {
      const index = Math.max(0, Math.trunc(parameters.dataIndex ?? 0));
      const point = points[index];
      const value = displayedValues?.[index] ?? (point ? pointNumber(point) : labelNumber(parameters.value));
      const parts: string[] = [];
      if (labels?.showSeries) parts.push(safeText(parameters.seriesName ?? series.name, 'Series', 120));
      if (labels?.showCategory) parts.push(point ? pointLabel(point, index) : safeText(parameters.name, String(index + 1), 120));
      if (labels?.showValue || noExplicitParts) {
        const number = value ?? labelNumber(parameters.value);
        if (number !== undefined && number !== null) parts.push(formatNumber(number, series.numberFormat));
      }
      if (labels?.showPercent) {
        const ratio = finite(parameters.percent) !== undefined ? (parameters.percent as number) / 100 : value;
        if (ratio !== undefined && ratio !== null) parts.push(formatNumber(ratio, '0.##%'));
      }
      if (parts.length === 0 && defaultVisible) return point ? pointLabel(point, index) : safeText(parameters.name, '', 120);
      return parts.join(' | ');
    },
  };
}

function markerSymbol(series: ChartSeries): string {
  if (series.marker?.visible === false) return 'none';
  if (series.marker?.shape === 'square') return 'rect';
  return series.marker?.shape ?? 'circle';
}

function seriesColor(state: BuildState, series: ChartSeries): string {
  const fallback = COLORS[state.colorIndex % COLORS.length] ?? COLORS[0];
  state.colorIndex += 1;
  return safeColor(series.color, fallback);
}

function addLegendName(state: BuildState, name: string): void {
  if (name && !state.legendNames.includes(name)) state.legendNames.push(name);
}

function addSeries(state: BuildState, option: LooseOption, includeInLegend = true): void {
  state.series.push(option);
  if (includeInLegend) addLegendName(state, safeText(option.name, '', 160));
}

function baseSeries(
  state: BuildState,
  series: ChartSeries,
  color: string,
  points: ChartPoint[],
  displayedValues?: Array<number | null>,
  defaultLabels = false,
): LooseOption {
  const name = safeText(series.name, `Series ${state.series.length + 1}`, 160);
  return {
    name,
    silent: true,
    animation: false,
    legendHoverLink: false,
    emphasis: { disabled: true },
    itemStyle: { color },
    label: dataLabelOption(state, series, points, displayedValues, defaultLabels),
  };
}

function layoutFor(element: ChartElement, width: number, height: number): LayoutBox {
  const padding = Math.max(10, Math.round(Math.min(width, height) * 0.055));
  const titleHeight = element.title ? Math.max(24, Math.round(fontSizePixels(element, element.titleStyle, height, 18) * 1.6)) : 0;
  const legend = element.legend;
  const reserveLegend = Boolean(legend?.visible && !legend.overlay);
  return {
    left: padding + (reserveLegend && legend?.position === 'left' ? Math.round(width * 0.18) : 0),
    right: padding + (reserveLegend && legend?.position === 'right' ? Math.round(width * 0.18) : 0),
    top: padding + titleHeight + (reserveLegend && legend?.position === 'top' ? Math.round(height * 0.1) : 0),
    bottom: padding + (reserveLegend && legend?.position === 'bottom' ? Math.round(height * 0.1) : 0),
  };
}

function isCartesian(plot: ChartPlot): boolean {
  return [
    'bar',
    'line',
    'area',
    'scatter',
    'bubble',
    'stock',
    'surface',
    'histogram',
    'pareto',
    'boxWhisker',
    'waterfall',
  ].includes(plot.type);
}

function axisOption(state: BuildState, axis: ChartAxis, dimension: 'x' | 'y', offset: number): LooseOption {
  const line = lineStyleOption(axis.line, '#737373');
  const gridline = lineStyleOption(axis.majorGridlines, '#D4D4D4');
  const labelStyle = textStyleOption(state.element, axis.labelStyle, state.height, Math.max(9, state.height * 0.03));
  const titleStyle = textStyleOption(state.element, axis.titleStyle, state.height, Math.max(10, state.height * 0.032));
  const dateAxis = axis.kind === 'date';
  return {
    id: `${dimension}-axis-${dimension === 'x' ? state.xAxes.length : state.yAxes.length}`,
    type: axis.kind === 'category' ? 'category' : dateAxis ? 'time' : 'value',
    position:
      dimension === 'x'
        ? axis.position === 'top'
          ? 'top'
          : 'bottom'
        : axis.position === 'right'
          ? 'right'
          : 'left',
    offset,
    show: axis.visible,
    inverse: Boolean(axis.reversed),
    min: finite(axis.minimum),
    max: finite(axis.maximum),
    name: safeText(axis.title, '', 160),
    nameLocation: 'middle',
    nameGap: Math.max(24, state.height * 0.06),
    nameTextStyle: titleStyle,
    axisLine: { show: axis.visible, lineStyle: line },
    axisTick: { show: axis.visible },
    axisLabel: {
      ...labelStyle,
      show: axis.visible,
      hideOverlap: true,
      formatter: axisFormatter(axis.numberFormat, dateAxis),
    },
    splitLine: { show: axis.visible && Boolean(axis.majorGridlines), lineStyle: gridline },
    splitArea: { show: false },
    boundaryGap: axis.kind === 'category',
    gridIndex: 0,
  };
}

function prepareAxes(state: BuildState): void {
  const cartesian = state.element.plots.filter(isCartesian);
  if (cartesian.length === 0) return;
  const horizontal = cartesian.every((plot) => (plot.type === 'bar' || plot.type === 'histogram') && plot.direction === 'bar');
  let axes: ChartAxis[] = state.element.axes.map((axis) => ({ ...axis }));
  if (axes.length === 0) {
    const numericX = cartesian.every((plot) => ['scatter', 'bubble', 'surface'].includes(plot.type));
    axes = horizontal
      ? [
          { id: 'value', kind: 'value', position: 'bottom', visible: true },
          { id: 'category', kind: 'category', position: 'left', visible: true },
        ]
      : [
          { id: 'x', kind: numericX ? 'value' : 'category', position: 'bottom', visible: true },
          { id: 'y', kind: 'value', position: 'left', visible: true },
        ];
  }

  const offsets = new Map<string, number>();
  const addAxis = (axis: ChartAxis, dimension: 'x' | 'y'): void => {
    const side = dimension === 'x' ? (axis.position === 'top' ? 'top' : 'bottom') : axis.position === 'right' ? 'right' : 'left';
    const count = offsets.get(side) ?? 0;
    offsets.set(side, count + 1);
    const refs = dimension === 'x' ? state.xAxes : state.yAxes;
    const ref: AxisRef = {
      source: axis,
      dimension,
      index: refs.length,
      option: axisOption(state, axis, dimension, count * Math.max(26, state.height * 0.055)),
    };
    refs.push(ref);
    const matching = state.axesById.get(axis.id) ?? [];
    matching.push(ref);
    state.axesById.set(axis.id, matching);
  };

  for (const axis of axes) {
    const dimension = horizontal
      ? axis.kind === 'category' || axis.kind === 'date'
        ? 'y'
        : 'x'
      : axis.position === 'top' || axis.position === 'bottom'
        ? 'x'
        : 'y';
    addAxis(axis, dimension);
  }

  if (state.xAxes.length === 0) addAxis({ id: 'x', kind: horizontal ? 'value' : 'category', position: 'bottom', visible: true }, 'x');
  if (state.yAxes.length === 0) addAxis({ id: 'y', kind: horizontal ? 'category' : 'value', position: 'left', visible: true }, 'y');
}

function axesForPlot(state: BuildState, plot: ChartPlot): { x: AxisRef; y: AxisRef } {
  const ids = plot.axisIds ?? [];
  const fromIds = (dimension: 'x' | 'y'): AxisRef | undefined => {
    for (const id of ids) {
      const match = state.axesById.get(id)?.find((axis) => axis.dimension === dimension);
      if (match) return match;
    }
    return undefined;
  };
  const wantsCategory = !['scatter', 'bubble', 'surface'].includes(plot.type);
  const x =
    fromIds('x') ??
    (wantsCategory ? state.xAxes.find((axis) => axis.source.kind !== 'value') : state.xAxes.find((axis) => axis.source.kind === 'value')) ??
    state.xAxes[0]!;
  const y =
    fromIds('y') ??
    (wantsCategory ? state.yAxes.find((axis) => axis.source.kind === 'value') : state.yAxes.find((axis) => axis.source.kind === 'value')) ??
    state.yAxes[0]!;
  return { x, y };
}

function categoryAxis(axes: { x: AxisRef; y: AxisRef }): AxisRef | undefined {
  if (axes.x.source.kind === 'category') return axes.x;
  if (axes.y.source.kind === 'category') return axes.y;
  return undefined;
}

function registerCategories(axis: AxisRef | undefined, points: ChartPoint[]): void {
  if (!axis) return;
  const labels = points.map(pointLabel);
  const current = Array.isArray(axis.option.data) ? axis.option.data : [];
  if (labels.length > current.length) axis.option.data = labels;
}

function cartesianData(
  points: ChartPoint[],
  values: Array<number | null>,
  axes: { x: AxisRef; y: AxisRef },
  color: string,
): Datum[] {
  const category = categoryAxis(axes);
  registerCategories(category, points);
  return points.map((point, index) => {
    const value = values[index] ?? null;
    let coordinate: unknown = value;
    if (!category) {
      const x = finite(point.x) ?? (axes.x.source.kind === 'date' ? pointLabel(point, index) : index);
      const y = finite(point.y) ?? value;
      coordinate = axes.y.source.kind === 'date' ? [value, pointLabel(point, index)] : [x, y];
    }
    return {
      name: pointLabel(point, index),
      value: coordinate,
      itemStyle: pointItemStyle(point, color),
    };
  });
}

function normalizedPlotValues(element: ChartElement, plot: ChartPlot): Array<Array<number | null>> {
  const values = plot.series.map((series) => series.points.map((point) => blankNumber(pointNumber(point), element.displayBlanksAs)));
  if (plot.grouping !== 'percentStacked') return values;
  const length = Math.max(0, ...values.map((series) => series.length));
  for (let index = 0; index < length; index += 1) {
    let positive = 0;
    let negative = 0;
    for (const series of values) {
      const value = series[index];
      if (value === null || value === undefined) continue;
      if (value >= 0) positive += value;
      else negative += Math.abs(value);
    }
    for (const series of values) {
      const value = series[index];
      if (value === null || value === undefined) continue;
      series[index] = value >= 0 ? (positive === 0 ? 0 : value / positive) : negative === 0 ? 0 : value / negative;
    }
  }
  return values;
}

function applyPercentAxis(axis: AxisRef): void {
  if (axis.option.min === undefined) axis.option.min = 0;
  if (axis.option.max === undefined) axis.option.max = 1;
  axis.option.axisLabel = {
    ...((axis.option.axisLabel as LooseOption | undefined) ?? {}),
    formatter: axisFormatter('0%', false),
  };
}

function addBarOrLinePlot(state: BuildState, plot: ChartPlot, plotIndex: number): void {
  const axes = axesForPlot(state, plot);
  const values = normalizedPlotValues(state.element, plot);
  const stack = plot.grouping === 'stacked' || plot.grouping === 'percentStacked' ? `plot-${plotIndex}` : undefined;
  if (plot.grouping === 'percentStacked') {
    const valueAxis = axes.x.source.kind === 'value' && axes.y.source.kind !== 'value' ? axes.x : axes.y;
    applyPercentAxis(valueAxis);
  }

  plot.series.forEach((series, seriesIndex) => {
    const color = seriesColor(state, series);
    const displayed = values[seriesIndex] ?? [];
    const common = baseSeries(state, series, color, series.points, displayed);
    const type = plot.type === 'line' || plot.type === 'area' ? 'line' : 'bar';
    addSeries(state, {
      ...common,
      type,
      xAxisIndex: axes.x.index,
      yAxisIndex: axes.y.index,
      data: cartesianData(series.points, displayed, axes, color),
      stack,
      connectNulls: state.element.displayBlanksAs === 'span',
      smooth: Boolean(series.smooth),
      showSymbol: series.marker?.visible !== false,
      symbol: markerSymbol(series),
      symbolSize: clamp(finite(series.marker?.size) ?? 6, 0, 50),
      lineStyle: lineStyleOption(series.line, color),
      ...(plot.type === 'area' ? { areaStyle: { color, opacity: 0.28 } } : {}),
    });
  });
}

function addScatterPlot(state: BuildState, plot: ChartPlot, approximation = false): void {
  const axes = axesForPlot(state, plot);
  plot.series.forEach((series) => {
    const color = seriesColor(state, series);
    const sizes = series.points.map((point) => Math.abs(finite(approximation ? point.value : point.size) ?? 0));
    const maximum = Math.max(1, ...sizes);
    const data = series.points.map((point, index) => {
      const x = finite(point.x) ?? index;
      const y = finite(point.y) ?? finite(point.value) ?? null;
      const extra = approximation ? finite(point.value) ?? null : finite(point.size) ?? null;
      const ratio = Math.sqrt(sizes[index] ?? 0) / Math.sqrt(maximum);
      const symbolSize = plot.type === 'bubble' || approximation ? 7 + ratio * (approximation ? 15 : 29) : finite(series.marker?.size) ?? 7;
      return {
        name: pointLabel(point, index),
        value: [x, y, extra],
        symbolSize: clamp(symbolSize, 2, 48),
        itemStyle: pointItemStyle(point, color),
      };
    });
    addSeries(state, {
      ...baseSeries(state, series, color, series.points),
      type: 'scatter',
      xAxisIndex: axes.x.index,
      yAxisIndex: axes.y.index,
      data,
      symbol: markerSymbol(series),
      symbolSize: clamp(finite(series.marker?.size) ?? 7, 0, 50),
    });
  });
  if (approximation) addNotice(state, 'Surface shown as a 2D scatter approximation');
}

function addStockPlot(state: BuildState, plot: ChartPlot): void {
  const axes = axesForPlot(state, plot);
  const count = Math.max(0, ...plot.series.map((series) => series.points.length));
  const fallbackFields: Array<'open' | 'high' | 'low' | 'close'> =
    plot.series.length >= 4
      ? ['open', 'high', 'low', 'close']
      : plot.series.length === 3
        ? ['high', 'low', 'close']
        : plot.series.length === 2
          ? ['low', 'high']
          : ['close'];
  const points: ChartPoint[] = [];
  const data: Datum[] = [];
  for (let index = 0; index < count; index += 1) {
    const combined: ChartPoint = {};
    for (const series of plot.series) {
      const point = series.points[index];
      if (!point) continue;
      combined.label ??= point.label;
      combined.style ??= point.style;
      for (const field of ['open', 'high', 'low', 'close'] as const) {
        if (combined[field] === undefined || combined[field] === null) combined[field] = finite(point[field]) ?? combined[field];
      }
    }
    plot.series.forEach((series, seriesIndex) => {
      const field = fallbackFields[seriesIndex];
      const value = series.points[index] ? pointNumber(series.points[index]!) : null;
      if (field && combined[field] == null && value !== null) combined[field] = value;
    });
    const open = finite(combined.open) ?? finite(combined.close) ?? 0;
    const close = finite(combined.close) ?? open;
    const low = finite(combined.low) ?? Math.min(open, close);
    const high = finite(combined.high) ?? Math.max(open, close);
    combined.open = open;
    combined.close = close;
    combined.low = Math.min(low, open, close);
    combined.high = Math.max(high, open, close);
    points.push(combined);
    const pointColor = safeColor(combined.style?.color, COLORS[0]);
    data.push({
      name: pointLabel(combined, index),
      value: [open, close, combined.low, combined.high],
      itemStyle: {
        color: pointColor,
        color0: safeColor(combined.style?.color, '#DC2626'),
        borderColor: pointColor,
        borderColor0: safeColor(combined.style?.border?.color, '#DC2626'),
        borderWidth: clamp(finite(combined.style?.border?.width) ?? 1, 0, 20),
      },
    });
  }
  registerCategories(categoryAxis(axes), points);
  const source = plot.series[0] ?? { name: 'Stock', points: [] };
  const color = seriesColor(state, source);
  addSeries(state, {
    ...baseSeries(state, source, color, points, points.map((point) => finite(point.close) ?? null)),
    type: 'candlestick',
    xAxisIndex: axes.x.index,
    yAxisIndex: axes.y.index,
    data,
    itemStyle: { color, color0: '#DC2626', borderColor: color, borderColor0: '#DC2626' },
  });
}

function addBoxPlot(state: BuildState, plot: ChartPlot): void {
  const axes = axesForPlot(state, plot);
  plot.series.forEach((series) => {
    const color = seriesColor(state, series);
    registerCategories(categoryAxis(axes), series.points);
    const data = series.points.map((point, index) => {
      const values = (point.values ?? []).map(finite).filter((value): value is number => value !== undefined).slice(0, 5);
      const fallback = blankNumber(pointNumber(point), state.element.displayBlanksAs);
      const valid = values.length === 5;
      const tuple = valid ? values : Array.from({ length: 5 }, () => fallback ?? 0);
      return {
        name: pointLabel(point, index),
        value: tuple,
        itemStyle: { ...pointItemStyle(point, color), ...(!valid && fallback === null ? { opacity: 0 } : {}) },
      };
    });
    addSeries(state, {
      ...baseSeries(state, series, color, series.points),
      type: 'boxplot',
      xAxisIndex: axes.x.index,
      yAxisIndex: axes.y.index,
      data,
    });
  });
}

function addWaterfallPlot(state: BuildState, plot: ChartPlot, plotIndex: number): void {
  const axes = axesForPlot(state, plot);
  plot.series.forEach((series, seriesIndex) => {
    const color = seriesColor(state, series);
    const changes = series.points.map((point) => blankNumber(pointNumber(point), state.element.displayBlanksAs));
    const helpers: number[] = [];
    const visible: Datum[] = [];
    let total = 0;
    changes.forEach((change, index) => {
      const value = change ?? 0;
      const next = total + value;
      helpers.push(value >= 0 ? total : next);
      visible.push({
        name: pointLabel(series.points[index]!, index),
        value: Math.abs(value),
        itemStyle: pointItemStyle(series.points[index]!, value < 0 ? '#DC2626' : color),
      });
      total = next;
    });
    registerCategories(categoryAxis(axes), series.points);
    const stack = `waterfall-${plotIndex}-${seriesIndex}`;
    addSeries(
      state,
      {
        name: '',
        type: 'bar',
        silent: true,
        animation: false,
        emphasis: { disabled: true },
        xAxisIndex: axes.x.index,
        yAxisIndex: axes.y.index,
        stack,
        data: helpers,
        itemStyle: { color: 'transparent', borderColor: 'transparent' },
      },
      false,
    );
    addSeries(state, {
      ...baseSeries(state, series, color, series.points, changes),
      type: 'bar',
      xAxisIndex: axes.x.index,
      yAxisIndex: axes.y.index,
      stack,
      data: visible,
    });
  });
}

function addParetoPlot(state: BuildState, plot: ChartPlot, plotIndex: number): void {
  addBarOrLinePlot(state, { ...plot, type: 'bar', grouping: plot.grouping ?? 'clustered' }, plotIndex);
  if (plot.series.length === 0) return;
  const axes = axesForPlot(state, plot);
  let percentAxis = state.yAxes.find((axis) => axis.source.position === 'right');
  if (!percentAxis) {
    const source: ChartAxis = { id: `pareto-${plotIndex}`, kind: 'value', position: 'right', visible: true, minimum: 0, maximum: 1, numberFormat: '0%' };
    percentAxis = {
      source,
      dimension: 'y',
      index: state.yAxes.length,
      option: axisOption(state, source, 'y', 0),
    };
    state.yAxes.push(percentAxis);
  }
  applyPercentAxis(percentAxis);
  const count = Math.max(0, ...plot.series.map((series) => series.points.length));
  const totals = Array.from({ length: count }, (_, index) =>
    plot.series.reduce((sum, series) => sum + Math.max(0, pointNumber(series.points[index] ?? {}) ?? 0), 0),
  );
  const grandTotal = totals.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  const ratios = totals.map((value) => {
    cumulative += value;
    return grandTotal === 0 ? 0 : cumulative / grandTotal;
  });
  const source = plot.series[0]!;
  const name = `${safeText(source.name, 'Series', 120)} cumulative`;
  const points = source.points.slice(0, count);
  const color = '#111827';
  registerCategories(categoryAxis(axes), points);
  addSeries(state, {
    ...baseSeries(state, { ...source, name, numberFormat: '0%' }, color, points, ratios),
    type: 'line',
    xAxisIndex: axes.x.index,
    yAxisIndex: percentAxis.index,
    data: ratios,
    smooth: false,
    showSymbol: true,
    symbol: 'circle',
    symbolSize: 5,
    lineStyle: { color, width: 2, type: 'solid' },
  });
}

function addPiePlot(state: BuildState, plot: ChartPlot): void {
  plot.series.forEach((series) => {
    const color = seriesColor(state, series);
    const ring = state.radialIndex;
    state.radialIndex += 1;
    const hole = plot.type === 'doughnut' ? clamp(finite(plot.holeSize) ?? 50, 0, 90) : state.radialCount > 1 ? 8 : 0;
    const available = Math.max(10, 72 - hole);
    const ringWidth = available / Math.max(1, state.radialCount);
    const inner = hole + ring * ringWidth;
    const outer = Math.min(86, inner + ringWidth * 0.82);
    const data = series.points.map((point, index) => ({
      name: pointLabel(point, index),
      value: blankNumber(pointNumber(point), state.element.displayBlanksAs),
      itemStyle: pointItemStyle(point, COLORS[index % COLORS.length] ?? color),
    }));
    const angle = finite(plot.firstSliceAngle) ?? 0;
    addSeries(state, {
      ...baseSeries(state, series, color, series.points, undefined, true),
      type: 'pie',
      radius: [`${inner}%`, `${outer}%`],
      center: ['50%', '53%'],
      startAngle: ((90 - angle) % 360 + 360) % 360,
      clockwise: true,
      selectedMode: false,
      stillShowZeroSum: true,
      avoidLabelOverlap: true,
      data,
    });
  });
}

function addRadarPlot(state: BuildState, plot: ChartPlot): void {
  const count = Math.max(0, ...plot.series.map((series) => series.points.length));
  const indicators = Array.from({ length: count }, (_, index) => {
    const maximum = Math.max(1, ...plot.series.map((series) => Math.abs(pointNumber(series.points[index] ?? {}) ?? 0)));
    const point = plot.series.find((series) => series.points[index])?.points[index];
    return { name: point ? pointLabel(point, index) : String(index + 1), max: maximum };
  });
  const radarIndex = state.radars.length;
  state.radars.push({
    center: ['50%', '54%'],
    radius: '68%',
    shape: 'polygon',
    startAngle: 90,
    indicator: indicators,
    splitNumber: 5,
    axisName: textStyleOption(state.element, undefined, state.height, Math.max(9, state.height * 0.03)),
    axisLine: { lineStyle: { color: '#D4D4D4' } },
    splitLine: { lineStyle: { color: '#D4D4D4' } },
    splitArea: { show: false },
  });
  plot.series.forEach((series) => {
    const color = seriesColor(state, series);
    const values = Array.from({ length: count }, (_, index) => blankNumber(pointNumber(series.points[index] ?? {}), state.element.displayBlanksAs) ?? 0);
    addSeries(state, {
      ...baseSeries(state, series, color, series.points, values),
      type: 'radar',
      radarIndex,
      data: [{ name: safeText(series.name, 'Series', 160), value: values, itemStyle: { color }, lineStyle: lineStyleOption(series.line, color) }],
      symbol: markerSymbol(series),
      symbolSize: clamp(finite(series.marker?.size) ?? 5, 0, 50),
      lineStyle: lineStyleOption(series.line, color),
      areaStyle: plot.grouping === 'stacked' || plot.grouping === 'percentStacked' ? { color, opacity: 0.2 } : undefined,
    });
  });
}

function hierarchyData(series: ChartSeries, color: string): Datum[] {
  interface NodeRecord {
    key: string;
    originalId?: string;
    parentId?: string;
    datum: Datum;
  }
  const records: NodeRecord[] = series.points.map((point, index) => {
    const originalId = safeText(point.id, '', 160) || undefined;
    const key = originalId ? `${originalId}-${index}` : `node-${index}`;
    return {
      key,
      originalId,
      parentId: safeText(point.parentId, '', 160) || undefined,
      datum: {
        id: key,
        name: pointLabel(point, index),
        value: pointNumber(point) ?? 0,
        itemStyle: pointItemStyle(point, color),
        children: [] as Datum[],
      },
    };
  });
  const firstById = new Map<string, NodeRecord>();
  records.forEach((record) => {
    if (record.originalId && !firstById.has(record.originalId)) firstById.set(record.originalId, record);
  });
  const roots: Datum[] = [];
  for (const record of records) {
    const parent = record.parentId ? firstById.get(record.parentId) : undefined;
    let cyclic = parent === record;
    let ancestor = parent;
    const seen = new Set<string>([record.key]);
    while (ancestor && !cyclic) {
      if (seen.has(ancestor.key)) {
        cyclic = true;
        break;
      }
      seen.add(ancestor.key);
      ancestor = ancestor.parentId ? firstById.get(ancestor.parentId) : undefined;
    }
    if (parent && !cyclic) (parent.datum.children as Datum[]).push(record.datum);
    else roots.push(record.datum);
  }
  return roots;
}

function addHierarchyPlot(state: BuildState, plot: ChartPlot, regionApproximation = false): void {
  plot.series.forEach((series) => {
    const color = seriesColor(state, series);
    const common = baseSeries(state, series, color, series.points, undefined, true);
    const data = hierarchyData(series, color);
    if (plot.type === 'sunburst') {
      addSeries(state, {
        ...common,
        type: 'sunburst',
        radius: ['8%', '75%'],
        center: ['50%', '54%'],
        nodeClick: false,
        sort: null,
        data,
      });
    } else {
      addSeries(state, {
        ...common,
        type: 'treemap',
        left: state.layout.left,
        right: state.layout.right,
        top: state.layout.top,
        bottom: state.layout.bottom,
        roam: false,
        nodeClick: false,
        sort: null,
        breadcrumb: { show: false },
        data,
      });
    }
  });
  if (regionApproximation) addNotice(state, 'Region map shown as a treemap approximation');
}

function addFunnelPlot(state: BuildState, plot: ChartPlot): void {
  plot.series.forEach((series) => {
    const color = seriesColor(state, series);
    const common = baseSeries(state, series, color, series.points, undefined, true);
    const label = common.label as LooseOption;
    const position = label.position;
    const data = series.points.map((point, index) => ({
      name: pointLabel(point, index),
      value: blankNumber(pointNumber(point), state.element.displayBlanksAs),
      itemStyle: pointItemStyle(point, COLORS[index % COLORS.length] ?? color),
    }));
    addSeries(state, {
      ...common,
      type: 'funnel',
      label: {
        ...label,
        position: position === 'left' || position === 'inside' ? position : 'right',
      },
      left: state.layout.left,
      right: state.layout.right,
      top: state.layout.top,
      height: Math.max(1, state.height - state.layout.top - state.layout.bottom),
      minSize: '10%',
      maxSize: '90%',
      sort: 'none',
      gap: 2,
      selectedMode: false,
      data,
    });
  });
}

function addFallback(state: BuildState, text: string): void {
  const offset = state.fallbackCount * Math.max(24, state.height * 0.06);
  state.fallbackCount += 1;
  state.graphics.push({
    type: 'text',
    silent: true,
    z: 100,
    left: 'center',
    top: Math.round(state.height * 0.46 + offset),
    style: {
      text: safeText(text, 'Unsupported chart', 240),
      fill: '#7F1D1D',
      backgroundColor: '#FEF2F2',
      borderColor: '#FCA5A5',
      borderWidth: 1,
      borderRadius: 3,
      padding: [7, 10],
      font: `${Math.max(11, Math.round(state.height * 0.035))}px Arial, sans-serif`,
      textAlign: 'center',
      textVerticalAlign: 'middle',
    },
  });
}

function addNotice(state: BuildState, text: string): void {
  const noticeCount = state.graphics.filter((graphic) => graphic.__notice === true).length;
  state.graphics.push({
    __notice: true,
    type: 'text',
    silent: true,
    z: 90,
    right: state.layout.right,
    bottom: state.layout.bottom + noticeCount * 16,
    style: {
      text: safeText(text, '', 180),
      fill: '#525252',
      backgroundColor: 'rgba(255,255,255,0.85)',
      padding: [2, 4],
      font: `${Math.max(9, Math.round(state.height * 0.025))}px Arial, sans-serif`,
      textAlign: 'right',
    },
  });
}

function legendOption(state: BuildState): LooseOption | undefined {
  const legend = state.element.legend;
  if (!legend) return undefined;
  const option: LooseOption = {
    show: legend.visible,
    data: state.legendNames,
    selectedMode: false,
    textStyle: textStyleOption(state.element, legend.style, state.height, Math.max(9, state.height * 0.032)),
    itemGap: Math.max(6, Math.round(state.width * 0.012)),
  };
  switch (legend.position) {
    case 'left':
      return { ...option, left: state.layout.left * 0.25, top: 'middle', orient: 'vertical' };
    case 'right':
      return { ...option, right: state.layout.right * 0.25, top: 'middle', orient: 'vertical' };
    case 'bottom':
      return { ...option, left: 'center', bottom: Math.max(2, state.layout.bottom * 0.2), orient: 'horizontal' };
    case 'topRight':
      return { ...option, right: state.layout.right, top: Math.max(2, state.layout.top * 0.15), orient: 'horizontal' };
    case 'top':
    default:
      return { ...option, left: 'center', top: Math.max(2, state.layout.top * 0.15), orient: 'horizontal' };
  }
}

function addPlot(state: BuildState, plot: ChartPlot, index: number): void {
  switch (plot.type) {
    case 'bar':
    case 'histogram':
    case 'line':
    case 'area':
      addBarOrLinePlot(state, plot, index);
      break;
    case 'scatter':
    case 'bubble':
      addScatterPlot(state, plot);
      break;
    case 'surface':
      addScatterPlot(state, plot, true);
      break;
    case 'stock':
      addStockPlot(state, plot);
      break;
    case 'boxWhisker':
      addBoxPlot(state, plot);
      break;
    case 'waterfall':
      addWaterfallPlot(state, plot, index);
      break;
    case 'pareto':
      addParetoPlot(state, plot, index);
      break;
    case 'pie':
    case 'doughnut':
      addPiePlot(state, plot);
      break;
    case 'radar':
      addRadarPlot(state, plot);
      break;
    case 'treemap':
    case 'sunburst':
      addHierarchyPlot(state, plot);
      break;
    case 'regionMap':
      addHierarchyPlot(state, { ...plot, type: 'treemap' }, true);
      break;
    case 'funnel':
      addFunnelPlot(state, plot);
      break;
    case 'unknown':
      addFallback(state, `Unsupported chart plot: ${safeText(plot.type, 'unknown', 40)}`);
      break;
    default:
      addFallback(state, 'Unsupported chart plot');
  }
}

export function chartToEChartsOption(element: ChartElement, width: number, height: number): EChartsOption {
  const safeWidth = renderDimension(width);
  const safeHeight = renderDimension(height);
  const layout = layoutFor(element, safeWidth, safeHeight);
  const state: BuildState = {
    element,
    width: safeWidth,
    height: safeHeight,
    layout,
    xAxes: [],
    yAxes: [],
    axesById: new Map(),
    series: [],
    radars: [],
    graphics: [],
    legendNames: [],
    colorIndex: 0,
    radialIndex: 0,
    radialCount: element.plots
      .filter((plot) => plot.type === 'pie' || plot.type === 'doughnut')
      .reduce((count, plot) => count + plot.series.length, 0),
    fallbackCount: 0,
  };
  prepareAxes(state);

  const plotBackground = safeColor(element.plotBackground, '#FFFFFF');
  const hasCartesian = element.plots.some(isCartesian);
  if (!hasCartesian && element.plotBackground) {
    state.graphics.push({
      type: 'rect',
      silent: true,
      z: -100,
      shape: {
        x: layout.left,
        y: layout.top,
        width: Math.max(1, safeWidth - layout.left - layout.right),
        height: Math.max(1, safeHeight - layout.top - layout.bottom),
      },
      style: { fill: plotBackground },
    });
  }

  element.plots.forEach((plot, index) => addPlot(state, plot, index));
  if (state.series.length === 0 && state.fallbackCount === 0) addFallback(state, 'Chart data is unavailable');

  const title = element.title
    ? {
        show: true,
        text: safeText(element.title, '', 300),
        left: 'center',
        top: Math.max(2, Math.round(layout.top * 0.12)),
        textStyle: textStyleOption(element, element.titleStyle, safeHeight, Math.max(14, safeHeight * 0.05)),
        padding: 0,
      }
    : undefined;
  const legend = legendOption(state);
  const option: EChartsOption = {
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
    stateAnimation: { duration: 0 },
    useUTC: true,
    backgroundColor: safeColor(element.background, 'transparent'),
    color: [...COLORS],
    textStyle: {
      color: '#262626',
      fontFamily: 'Arial, sans-serif',
      fontSize: Math.max(10, safeHeight * 0.03),
    },
    ...(title ? { title } : {}),
    ...(legend ? { legend } : {}),
    ...(hasCartesian
      ? {
          grid: {
            show: Boolean(element.plotBackground),
            left: layout.left,
            right: layout.right,
            top: layout.top,
            bottom: layout.bottom,
            containLabel: true,
            backgroundColor: plotBackground,
            borderWidth: 0,
          },
          xAxis: state.xAxes.map((axis) => axis.option),
          yAxis: state.yAxes.map((axis) => axis.option),
        }
      : {}),
    ...(state.radars.length > 0 ? { radar: state.radars } : {}),
    ...(state.graphics.length > 0
      ? { graphic: state.graphics.map(({ __notice: _notice, ...graphic }) => graphic) }
      : {}),
    series: state.series,
  };
  return option;
}

function deterministicSvg(svg: string): string {
  const identifiers = new Map<string, string>();
  return svg.replace(/\bzr\d+(?:-[a-zA-Z0-9]+)*\b/g, (identifier) => {
    let replacement = identifiers.get(identifier);
    if (!replacement) {
      replacement = `prismdeck-svg-${identifiers.size}`;
      identifiers.set(identifier, replacement);
    }
    return replacement;
  });
}

export function renderChartSvg(element: ChartElement, width: number, height: number): string {
  const safeWidth = renderDimension(width);
  const safeHeight = renderDimension(height);
  let chart: ReturnType<typeof init> | undefined;
  try {
    chart = init(null, null, { renderer: 'svg', ssr: true, width: safeWidth, height: safeHeight });
    chart.setOption(chartToEChartsOption(element, safeWidth, safeHeight), {
      notMerge: true,
      lazyUpdate: false,
      silent: true,
    });
    return deterministicSvg(chart.renderToSVGString({ useViewBox: true }));
  } finally {
    chart?.dispose();
  }
}
