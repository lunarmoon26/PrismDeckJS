import { describe, expect, test } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  elementTextureSize,
  elementWorldBallRadius,
  elementWorldTransform,
  type ChartElement,
  type ShapeElement,
  type TextElement,
} from '../src/index';
import { chartToEChartsOption, renderChartSvg } from '../src/render/chart';
import { slideTransitionFrame } from '../src/render/renderer';

function textElement(thickness?: number): TextElement {
  return {
    id: 'text',
    type: 'text',
    name: 'Text',
    frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.2 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: 0,
    ...(thickness === undefined ? {} : { thickness }),
    text: 'Planar by default',
    style: { ...DEFAULT_TEXT_STYLE },
  };
}

function chartElement(): ChartElement {
  return {
    id: 'chart',
    type: 'chart',
    name: 'Revenue chart',
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: 0,
    title: 'Revenue <script>alert(1)</script>',
    legend: { visible: true, position: 'bottom' },
    axes: [
      { id: 'category', kind: 'category', position: 'bottom', visible: true },
      { id: 'primary', kind: 'value', position: 'left', visible: true, numberFormat: '$#,##0' },
      { id: 'secondary', kind: 'value', position: 'right', visible: true, numberFormat: '0%' },
    ],
    plots: [
      {
        type: 'bar',
        direction: 'column',
        grouping: 'stacked',
        axisIds: ['category', 'primary'],
        series: [{ name: 'Sales', color: '#2563EB', points: [{ label: 'Q1', value: 42 }, { label: 'Q2', value: 56 }] }],
      },
      {
        type: 'line',
        axisIds: ['category', 'secondary'],
        series: [{ name: 'Margin', color: '#EA580C', smooth: true, points: [{ label: 'Q1', value: 0.2 }, { label: 'Q2', value: 0.3 }] }],
      },
    ],
  };
}

describe('element rendering dimensions', () => {
  test('uses a flat plane unless positive thickness opts into extrusion', () => {
    const size = { width: 1600, height: 900 };

    expect(elementWorldTransform(textElement(), size).size.depth).toBe(0);
    expect(elementWorldTransform(textElement(0), size).size.depth).toBe(0);
    expect(elementWorldTransform(textElement(0.2), size).size.depth).toBe(0.2);
  });

  test('keeps texture pixels at the physical slide-frame aspect ratio', () => {
    const size = { width: 1600, height: 900 };
    const element = textElement();
    element.frame = { x: 0.1, y: 0.1, width: 0.56, height: 0.06 };

    const texture = elementTextureSize(element, size);
    const physicalAspect = (element.frame.width * size.width) / (element.frame.height * size.height);

    expect(texture.width / texture.height).toBeCloseTo(physicalAspect, 1);
    expect(Math.max(texture.width, texture.height)).toBeLessThanOrEqual(2048);
  });

  test('uses the same scaled minimum face dimension for a physics ball', () => {
    const ball: ShapeElement = {
      id: 'ball',
      type: 'shape',
      name: 'Ball',
      frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
      transform: { ...DEFAULT_TRANSFORM, scaleX: 0.5, scaleY: 2 },
      opacity: 1,
      visible: true,
      renderOrder: 0,
      thickness: 0.1,
      shape: 'ellipse',
      fill: '#00FFFF',
      stroke: '#FFFFFF',
      strokeWidth: 1,
      physics: { body: 'dynamic', shape: 'ball', density: 1, restitution: 0.8, friction: 0.2 },
    };

    expect(elementWorldBallRadius(ball, { width: 1600, height: 900 })).toBeCloseTo(0.8889, 4);
  });
});

describe('semantic chart rendering', () => {
  test('maps combination plots and secondary axes without mutating the document', () => {
    const element = chartElement();
    const before = JSON.stringify(element);
    const option = chartToEChartsOption(element, 800, 450) as {
      series?: Array<{ type?: string; yAxisIndex?: number; stack?: string }>;
      yAxis?: Array<unknown>;
    };

    expect(option.series?.map((series) => series.type)).toEqual(['bar', 'line']);
    expect(option.series?.[0]).toMatchObject({ stack: 'plot-0', yAxisIndex: 0 });
    expect(option.series?.[1]).toMatchObject({ yAxisIndex: 1 });
    expect(option.yAxis).toHaveLength(2);
    expect(JSON.stringify(element)).toBe(before);
  });

  test('renders deterministic inert SVG and disposes its ECharts instance', () => {
    const first = renderChartSvg(chartElement(), 800, 450);
    const second = renderChartSvg(chartElement(), 800, 450);

    expect(first).toBe(second);
    expect(first.startsWith('<svg')).toBe(true);
    expect(first).toContain('Revenue');
    expect(first).not.toContain('<script');
  });
});

describe('persistent-background slide transitions', () => {
  test('eases only destination content for WebGL fade and slide entries', () => {
    expect(slideTransitionFrame('fade', 0, 400, 16)).toEqual({ opacity: 0, offsetX: 0, done: false });
    expect(slideTransitionFrame('fade', 400, 400, 16)).toEqual({ opacity: 1, offsetX: 0, done: true });
    expect(slideTransitionFrame('slide', 0, 400, 16)).toEqual({ opacity: 0.35, offsetX: 0.96, done: false });
    expect(slideTransitionFrame('slide', 400, 400, 16)).toEqual({ opacity: 1, offsetX: 0, done: true });
  });
});
