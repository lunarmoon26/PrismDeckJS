import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  PRISMDECK_SCHEMA_VERSION,
  type ChartElement,
  type DeckAsset,
  type DeckDocument,
  type DeckElement,
  type DeckSlide,
  type ElementFrame,
  type ElementPhysics,
  type ImageElement,
  type LoadedDeck,
  type ShapeElement,
  type TableElement,
  type TextElement,
  type TextStyle,
  type UnsupportedElement,
} from 'prismdeckjs';
import { DECK_THEMES, deckTheme, type DeckThemeColors, type DeckThemeId } from './themes';
import { createDefaultLayouts } from './layouts';

export const DEMO_DECK_ID = 'prismdeck-feature-deck';

const DISPLAY_FONT = 'Avenir Next, Inter, Helvetica Neue, Arial, sans-serif';
const UI_FONT = 'Inter, Avenir Next, Helvetica Neue, Arial, sans-serif';
const STUDIO_PREVIEW_ASSET_ID = 'prismdeck-studio-preview';

interface TextOptions {
  id: string;
  name: string;
  text: string;
  frame: ElementFrame;
  z?: number;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  thickness?: number;
  opacity?: number;
  renderOrder?: number;
  style?: Partial<TextStyle>;
}

function createText(HUD: DeckThemeColors, options: TextOptions): TextElement {
  return {
    id: options.id,
    type: 'text',
    name: options.name,
    frame: options.frame,
    transform: {
      ...DEFAULT_TRANSFORM,
      z: options.z ?? 0,
      rotationX: options.rotationX ?? 0,
      rotationY: options.rotationY ?? 0,
      rotationZ: options.rotationZ ?? 0,
    },
    opacity: options.opacity ?? 1,
    visible: true,
    renderOrder: options.renderOrder ?? 2,
    ...(options.thickness === undefined ? {} : { thickness: options.thickness }),
    text: options.text,
    style: {
      ...DEFAULT_TEXT_STYLE,
      fontFamily: UI_FONT,
      color: HUD.primary,
      ...options.style,
    },
  };
}

interface PanelOptions {
  id: string;
  name: string;
  frame: ElementFrame;
  label?: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
  z?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  thickness?: number;
  physics?: ElementPhysics;
  shape?: ShapeElement['shape'];
  opacity?: number;
  strokeWidth?: number;
  renderOrder?: number;
  labelSize?: number;
}

function createPanel(HUD: DeckThemeColors, options: PanelOptions): ShapeElement {
  return {
    id: options.id,
    type: 'shape',
    name: options.name,
    frame: options.frame,
    transform: {
      ...DEFAULT_TRANSFORM,
      z: options.z ?? 0,
      rotationX: options.rotationX ?? 0,
      rotationY: options.rotationY ?? 0,
      rotationZ: options.rotationZ ?? 0,
    },
    opacity: options.opacity ?? 1,
    visible: true,
    renderOrder: options.renderOrder ?? 1,
    ...(options.thickness === undefined ? {} : { thickness: options.thickness }),
    ...(options.physics === undefined ? {} : { physics: options.physics }),
    shape: options.shape ?? 'roundedRectangle',
    fill: options.fill ?? HUD.surface,
    stroke: options.stroke ?? HUD.primary,
    strokeWidth: options.strokeWidth ?? 1.5,
    ...(options.label === undefined
      ? {}
      : {
          text: options.label,
          textStyle: {
            ...DEFAULT_TEXT_STYLE,
            fontFamily: DISPLAY_FONT,
            fontSize: options.labelSize ?? 0.031,
            fontWeight: 700,
            color: options.textColor ?? HUD.primary,
            align: 'center' as const,
            verticalAlign: 'middle' as const,
            lineHeight: 1.35,
          },
        }),
  };
}

function createHeading(HUD: DeckThemeColors, id: string, value: string): TextElement {
  return createText(HUD, {
    id,
    name: 'Slide title',
    text: value,
    frame: { x: 0.075, y: 0.085, width: 0.72, height: 0.15 },
    z: 0,
    style: { fontFamily: DISPLAY_FONT, fontSize: 0.058, fontWeight: 700, lineHeight: 1.05 },
  });
}

function createBody(HUD: DeckThemeColors, id: string, value: string, frame: ElementFrame): TextElement {
  return createText(HUD, {
    id,
    name: 'Body',
    text: value,
    frame,
    z: 0,
    style: { fontSize: 0.032, color: HUD.warning, lineHeight: 1.45 },
  });
}

function createSlide(
  defaultBackground: string,
  id: string,
  name: string,
  layoutId: string,
  elements: DeckElement[],
  notes: string,
  background: string = defaultBackground,
): DeckSlide {
  return { id, name, layoutId, durationMs: 7_000, background, notes, elements };
}

function createImage(id: string, name: string, frame: ElementFrame, fit: ImageElement['fit']): ImageElement {
  return {
    id,
    type: 'image',
    name,
    frame,
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: 2,
    assetId: STUDIO_PREVIEW_ASSET_ID,
    alt: 'A dark PrismDeck Studio interface with slide rail, canvas, and inspector',
    fit,
  };
}

function createStudioPreviewAsset(): DeckAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760">
  <rect width="1200" height="760" rx="44" fill="#0B1020"/>
  <rect x="34" y="34" width="1132" height="692" rx="28" fill="#11182B" stroke="#334155" stroke-width="2"/>
  <circle cx="72" cy="72" r="9" fill="#FB7185"/><circle cx="102" cy="72" r="9" fill="#FBBF24"/><circle cx="132" cy="72" r="9" fill="#2DD4BF"/>
  <rect x="62" y="118" width="184" height="554" rx="18" fill="#0B1020"/>
  <rect x="82" y="146" width="144" height="88" rx="10" fill="#26324D" stroke="#8B5CF6" stroke-width="3"/>
  <rect x="82" y="254" width="144" height="88" rx="10" fill="#1A2338"/><rect x="82" y="362" width="144" height="88" rx="10" fill="#1A2338"/>
  <rect x="276" y="118" width="606" height="554" rx="18" fill="#E8ECF6"/>
  <rect x="318" y="170" width="304" height="30" rx="8" fill="#172033"/><rect x="318" y="220" width="222" height="14" rx="7" fill="#75809A"/>
  <rect x="318" y="292" width="232" height="176" rx="20" fill="#8B5CF6"/><rect x="574" y="292" width="264" height="176" rx="20" fill="#172033"/>
  <rect x="318" y="500" width="520" height="18" rx="9" fill="#CBD2E1"/><rect x="318" y="536" width="420" height="18" rx="9" fill="#CBD2E1"/>
  <rect x="912" y="118" width="226" height="554" rx="18" fill="#0B1020"/><rect x="940" y="158" width="170" height="18" rx="9" fill="#F5F7FF"/>
  <rect x="940" y="208" width="170" height="64" rx="12" fill="#1A2338"/><rect x="940" y="292" width="170" height="64" rx="12" fill="#1A2338"/>
  <rect x="940" y="584" width="170" height="48" rx="16" fill="#2DD4BF"/>
</svg>`;
  return {
    id: STUDIO_PREVIEW_ASSET_ID,
    fileName: 'prismdeck-studio-preview.svg',
    mimeType: 'image/svg+xml',
    data: new TextEncoder().encode(svg),
  };
}

export function createDemoDeck(themeId: DeckThemeId = 'edge'): LoadedDeck {
  const HUD = deckTheme(themeId).colors;
  const text = (options: TextOptions) => createText(HUD, options);
  const panel = (options: PanelOptions) => createPanel(HUD, options);
  const heading = (id: string, value: string) => createHeading(HUD, id, value);
  const body = (id: string, value: string, frame: ElementFrame) => createBody(HUD, id, value, frame);
  const slide = (
    id: string,
    name: string,
    layoutId: string,
    elements: DeckElement[],
    notes: string,
    background?: string,
  ) => createSlide(HUD.background, id, name, layoutId, elements, notes, background);
  const eyebrow = (id: string, value: string, frame: ElementFrame = { x: 0.075, y: 0.08, width: 0.5, height: 0.055 }) =>
    text({
      id,
      name: 'Section label',
      text: value,
      frame,
      style: { fontSize: 0.017, fontWeight: 700, color: HUD.accent, lineHeight: 1.25 },
    });
  const layouts = createDefaultLayouts(HUD);
  const chartTextStyle: TextStyle = {
    ...DEFAULT_TEXT_STYLE,
    fontFamily: UI_FONT,
    fontSize: 0.018,
    color: HUD.warning,
    lineHeight: 1.2,
  };
  const featureChart: ChartElement = {
    id: 'chart-combination',
    type: 'chart',
    name: 'Adoption and performance chart',
    frame: { x: 0.4, y: 0.16, width: 0.55, height: 0.68 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: 2,
    title: 'One semantic model, multiple plots',
    titleStyle: { ...chartTextStyle, fontSize: 0.026, fontWeight: 700, color: HUD.primary },
    background: HUD.surface,
    plotBackground: HUD.background,
    displayBlanksAs: 'span',
    axes: [
      { id: 'quarter', kind: 'category', position: 'bottom', visible: true, labelStyle: chartTextStyle, line: { color: HUD.warning, width: 1, style: 'solid' } },
      { id: 'projects', kind: 'value', position: 'left', visible: true, title: 'Projects', titleStyle: chartTextStyle, labelStyle: chartTextStyle, minimum: 0, maximum: 100, majorGridlines: { color: HUD.warning, width: 0.5, style: 'dotted' } },
      { id: 'speed', kind: 'value', position: 'right', visible: true, title: 'FPS', titleStyle: chartTextStyle, labelStyle: chartTextStyle, minimum: 0, maximum: 90 },
    ],
    legend: { visible: true, position: 'bottom', overlay: false, style: chartTextStyle },
    plots: [
      {
        type: 'bar',
        direction: 'column',
        grouping: 'clustered',
        axisIds: ['quarter', 'projects'],
        series: [{
          name: 'Projects',
          color: HUD.accent,
          points: [
            { label: 'Q1', value: 34 },
            { label: 'Q2', value: 52 },
            { label: 'Q3', value: 71 },
            { label: 'Q4', value: 88 },
          ],
          dataLabels: { visible: true, showValue: true, position: 'top', style: chartTextStyle },
        }],
      },
      {
        type: 'line',
        grouping: 'standard',
        axisIds: ['quarter', 'speed'],
        series: [{
          name: 'Render FPS',
          color: HUD.success,
          smooth: true,
          marker: { visible: true, shape: 'circle', size: 7 },
          line: { color: HUD.success, width: 3, style: 'solid' },
          points: [
            { label: 'Q1', value: 48 },
            { label: 'Q2', value: 58 },
            { label: 'Q3', value: 67 },
            { label: 'Q4', value: 76 },
          ],
        }],
      },
    ],
  };
  const tableBorder = { color: HUD.warning, width: 1, style: 'solid' as const };
  const featureTable: TableElement = {
    id: 'semantic-table',
    type: 'table',
    name: 'Feature support table',
    frame: { x: 0.07, y: 0.25, width: 0.86, height: 0.56 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: 2,
    columns: [1.6, 1, 1, 1.2],
    rows: [
      {
        height: 0.85,
        cells: [{
          column: 0,
          columnSpan: 4,
          text: 'SEMANTIC DATA SURVIVES IMPORT, RENDER, AND EXPORT',
          header: true,
          style: { fill: HUD.accent, textStyle: { ...chartTextStyle, color: HUD.background, fontWeight: 700, align: 'center', verticalAlign: 'middle' } },
        }],
      },
      {
        height: 0.72,
        cells: ['Capability', 'PPTX', 'ODP', 'HTML'].map((value, column) => ({
          column,
          text: value,
          header: true,
          style: { fill: HUD.surface, textStyle: { ...chartTextStyle, color: HUD.primary, fontWeight: 700, align: column === 0 ? 'left' : 'center' } },
        })),
      },
      { height: 0.72, cells: ['Merged cells', 'Yes', 'Yes', 'Native'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Direct styling', 'Yes', 'Yes', 'Native'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Accessibility', 'Mapped', 'Mapped', 'Semantic'].map((value, column) => ({ column, text: value })) },
    ],
    style: {
      fill: HUD.background,
      textStyle: { ...chartTextStyle, color: HUD.warning, verticalAlign: 'middle' },
      verticalAlign: 'middle',
      padding: { top: 7, right: 10, bottom: 7, left: 10 },
      borders: { top: tableBorder, right: tableBorder, bottom: tableBorder, left: tableBorder },
    },
  };
  const unsupportedWarning: UnsupportedElement = {
    id: 'warning-fallback',
    type: 'unsupported',
    name: 'Visible import fallback',
    frame: { x: 0.56, y: 0.67, width: 0.35, height: 0.1 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    visible: true,
    renderOrder: 3,
    reason: 'Unsupported source effect',
    fallbackText: 'Visible fallback + structured warning',
  };
  const physicsGrid: ShapeElement[] = [
    ...Array.from({ length: 6 }, (_, index) => panel({
      id: `physics-grid-row-${index + 1}`,
      name: 'Physics ground grid',
      frame: { x: 0.05, y: 0.7 + index * 0.032, width: 0.9, height: 0.002 },
      shape: 'rectangle',
      fill: HUD.primary,
      stroke: HUD.primary,
      strokeWidth: 0.2,
      opacity: 0.16,
      z: 0.068,
      renderOrder: 0,
    })),
    ...Array.from({ length: 11 }, (_, index) => panel({
      id: `physics-grid-column-${index + 1}`,
      name: 'Physics ground grid',
      frame: { x: 0.05 + index * 0.09, y: 0.7, width: 0.002, height: 0.175 },
      shape: 'rectangle',
      fill: HUD.primary,
      stroke: HUD.primary,
      strokeWidth: 0.2,
      opacity: 0.16,
      z: 0.068,
      renderOrder: 0,
    })),
  ];

  const slides: DeckSlide[] = [
    slide(
      'welcome-slide',
      'PrismDeck',
      'layout-title-slide',
      [
        eyebrow('welcome-kicker', 'OPEN FORMAT  /  LOCAL-FIRST  /  WEBGL'),
        text({
          id: 'welcome-title',
          name: 'Hero title',
          text: 'Build the slide.\nThen break the plane.',
          frame: { x: 0.075, y: 0.2, width: 0.66, height: 0.3 },
          z: 0.09,
          rotationY: 2.5,
          style: { fontFamily: DISPLAY_FONT, fontSize: 0.067, fontWeight: 700, lineHeight: 1.02 },
        }),
        text({
          id: 'welcome-subtitle',
          name: 'Hero subtitle',
          text: 'A browser-native presentation engine for faithful imports, precise editing, spatial storytelling, and portable output.',
          frame: { x: 0.08, y: 0.57, width: 0.58, height: 0.13 },
          z: 0.03,
          style: { fontSize: 0.026, color: HUD.warning, lineHeight: 1.4 },
        }),
        panel({
          id: 'welcome-module',
          name: 'Spatial prism',
          frame: { x: 0.74, y: 0.2, width: 0.18, height: 0.48 },
          label: '2D\n+\nDEPTH',
          fill: HUD.surface,
          stroke: HUD.accent,
          textColor: HUD.primary,
          z: 0.18,
          rotationX: -4,
          rotationY: -11,
          thickness: 0.18,
          labelSize: 0.038,
        }),
      ],
      'PrismDeckJS starts with the familiar slide and adds depth only when the story needs it.',
    ),
    slide(
      'import-slide',
      'Import locally',
      'layout-title-content',
      [
        heading('import-title', 'START WITH WHAT YOU HAVE.'),
        body(
          'import-body',
          'Drop a source file into Studio. Parsing stays on-device, assets stay packaged, and every adapter targets one validated DeckDocument.',
          { x: 0.075, y: 0.245, width: 0.78, height: 0.14 },
        ),
        panel({ id: 'import-pptx', name: 'PPTX card', frame: { x: 0.075, y: 0.48, width: 0.18, height: 0.2 }, label: 'PPTX\nLAYOUTS + CHARTS', stroke: HUD.primary, labelSize: 0.024 }),
        panel({ id: 'import-odp', name: 'ODP card', frame: { x: 0.285, y: 0.48, width: 0.18, height: 0.2 }, label: 'ODP\nMASTERS + TABLES', stroke: HUD.accent, textColor: HUD.accent, labelSize: 0.024 }),
        panel({ id: 'import-native', name: 'Package card', frame: { x: 0.495, y: 0.48, width: 0.18, height: 0.2 }, label: '.PRISMDECK\nDOC + ASSETS', stroke: HUD.success, textColor: HUD.success, labelSize: 0.024 }),
        panel({ id: 'import-html', name: 'HTML card', frame: { x: 0.705, y: 0.48, width: 0.18, height: 0.2 }, label: 'HTML\nRE-EDITABLE', stroke: HUD.warning, textColor: HUD.warning, labelSize: 0.024 }),
        eyebrow('import-footer', 'INERT INPUT  /  STRUCTURED WARNINGS  /  NO CLOUD ROUND TRIP', { x: 0.075, y: 0.76, width: 0.72, height: 0.055 }),
      ],
      'PPTX, ODP, PrismDeck packages, and exported HTML all enter through bounded local import adapters.',
    ),
    slide(
      'editor-slide',
      'Create and edit',
      'layout-two-content',
      [
        heading('editor-title', 'AUTHOR AT THE SPEED OF CANVAS.'),
        body(
          'editor-body',
          'Draw, select, move, resize, restyle, hide, and remove without leaving the stage.',
          { x: 0.075, y: 0.22, width: 0.78, height: 0.1 },
        ),
        panel({ id: 'editor-workflow', name: 'Editing workflow', frame: { x: 0.075, y: 0.38, width: 0.4, height: 0.39 }, label: '01  DRAW\n02  SELECT + RESIZE\n03  STYLE + POSITION\n04  PLAY + REVIEW', fill: HUD.surface, stroke: HUD.accent, textColor: HUD.primary, labelSize: 0.026 }),
        panel({ id: 'shape-rectangle', name: 'Rectangle shape', frame: { x: 0.55, y: 0.39, width: 0.13, height: 0.13 }, label: 'RECT', shape: 'rectangle', stroke: HUD.primary, labelSize: 0.021 }),
        panel({ id: 'shape-rounded', name: 'Rounded shape', frame: { x: 0.72, y: 0.39, width: 0.13, height: 0.13 }, label: 'ROUND', shape: 'roundedRectangle', stroke: HUD.accent, textColor: HUD.accent, labelSize: 0.021 }),
        panel({ id: 'shape-ellipse', name: 'Ellipse shape', frame: { x: 0.55, y: 0.58, width: 0.13, height: 0.13 }, label: 'ELLIPSE', shape: 'ellipse', stroke: HUD.success, textColor: HUD.success, labelSize: 0.019 }),
        panel({ id: 'shape-custom', name: 'Custom shape', frame: { x: 0.72, y: 0.58, width: 0.13, height: 0.13 }, label: 'CUSTOM', shape: 'custom', stroke: HUD.warning, textColor: HUD.warning, labelSize: 0.019 }),
        panel({ id: 'shape-line', name: 'Line shape', frame: { x: 0.55, y: 0.76, width: 0.3, height: 0.008 }, shape: 'line', fill: HUD.accent, stroke: HUD.accent, strokeWidth: 4 }),
      ],
      'The stage supports direct drawing for text and common shapes, projected resize handles, and inspector-based editing.',
    ),
    slide(
      'depth-slide',
      'Edit spatially',
      'layout-comparison',
      [
        heading('depth-title', 'FLAT BY DEFAULT. SPATIAL BY CHOICE.'),
        text({ id: 'depth-flat-label', name: 'Flat heading', text: 'PRESERVE THE SOURCE', frame: { x: 0.075, y: 0.25, width: 0.34, height: 0.05 }, style: { fontSize: 0.021, fontWeight: 700, color: HUD.warning, align: 'center' } }),
        text({ id: 'depth-space-label', name: 'Spatial heading', text: 'ADD INTENTIONAL DEPTH', frame: { x: 0.575, y: 0.25, width: 0.34, height: 0.05 }, style: { fontSize: 0.021, fontWeight: 700, color: HUD.accent, align: 'center' } }),
        panel({ id: 'depth-plane', name: 'Planar source', frame: { x: 0.12, y: 0.39, width: 0.27, height: 0.28 }, label: 'Z 0.00\nCRISP 2D', stroke: HUD.warning, textColor: HUD.warning }),
        panel({ id: 'depth-back', name: 'Back layer', frame: { x: 0.57, y: 0.43, width: 0.27, height: 0.25 }, label: 'ROTATE Y\n-8 DEG', stroke: HUD.primary, z: 0.04, rotationY: -8, thickness: 0.04, labelSize: 0.025 }),
        panel({ id: 'depth-front', name: 'Translucent front layer', frame: { x: 0.63, y: 0.36, width: 0.27, height: 0.25 }, label: 'Z +0.16\n68% ALPHA', stroke: HUD.accent, textColor: HUD.accent, z: 0.16, rotationX: -4, rotationY: 6, thickness: 0.14, opacity: 0.68, labelSize: 0.025 }),
        eyebrow('depth-footer', 'Z  /  ROTATE  /  SCALE  /  THICKNESS  /  ALPHA', { x: 0.575, y: 0.74, width: 0.36, height: 0.055 }),
      ],
      'Imported slides remain planar for fidelity. Any element can then gain depth, rotation, scale, extrusion, or translucent layer opacity.',
    ),
    slide(
      'chart-slide',
      'Semantic charts',
      'layout-content-caption',
      [
        text({ id: 'chart-title', name: 'Slide title', text: 'DATA THAT STAYS\nEDITABLE.', frame: { x: 0.055, y: 0.22, width: 0.29, height: 0.19 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.05, fontWeight: 700, lineHeight: 1.04 } }),
        body(
          'chart-body',
          'Combination plots, secondary axes, labels, legends, markers, formats, and blanks normalize into source-independent data.',
          { x: 0.055, y: 0.45, width: 0.29, height: 0.22 },
        ),
        panel({ id: 'chart-count', name: 'Chart family count', frame: { x: 0.055, y: 0.7, width: 0.13, height: 0.1 }, label: '19\nFAMILIES', fill: HUD.accent, stroke: HUD.accent, textColor: HUD.background, labelSize: 0.022 }),
        panel({ id: 'chart-svg', name: 'SVG output', frame: { x: 0.205, y: 0.7, width: 0.14, height: 0.1 }, label: 'SVG\nECharts', stroke: HUD.success, textColor: HUD.success, labelSize: 0.021 }),
        featureChart,
      ],
      'This slide is a real normalized combination chart rendered deterministically through the ECharts SVG adapter.',
    ),
    slide(
      'image-slide',
      'Packaged images',
      'layout-picture-caption',
      [
        text({ id: 'image-title', name: 'Slide title', text: 'ONE ASSET.\nTHREE FITS.', frame: { x: 0.055, y: 0.22, width: 0.29, height: 0.18 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.05, fontWeight: 700, lineHeight: 1.04 } }),
        body('image-body', 'Images stay inside the deck package and decode locally. Choose contain, cover, or fill for each frame.', { x: 0.055, y: 0.45, width: 0.29, height: 0.19 }),
        createImage('image-contain', 'Contained Studio preview', { x: 0.4, y: 0.2, width: 0.16, height: 0.5 }, 'contain'),
        createImage('image-cover', 'Covered Studio preview', { x: 0.59, y: 0.2, width: 0.16, height: 0.5 }, 'cover'),
        createImage('image-fill', 'Filled Studio preview', { x: 0.78, y: 0.2, width: 0.16, height: 0.5 }, 'fill'),
        text({ id: 'image-contain-label', name: 'Contain label', text: 'CONTAIN', frame: { x: 0.4, y: 0.74, width: 0.16, height: 0.04 }, style: { fontSize: 0.017, fontWeight: 700, color: HUD.warning, align: 'center' } }),
        text({ id: 'image-cover-label', name: 'Cover label', text: 'COVER', frame: { x: 0.59, y: 0.74, width: 0.16, height: 0.04 }, style: { fontSize: 0.017, fontWeight: 700, color: HUD.accent, align: 'center' } }),
        text({ id: 'image-fill-label', name: 'Fill label', text: 'FILL', frame: { x: 0.78, y: 0.74, width: 0.16, height: 0.04 }, style: { fontSize: 0.017, fontWeight: 700, color: HUD.success, align: 'center' } }),
      ],
      'The same packaged SVG asset is rendered here with all three normalized image fit modes.',
    ),
    slide(
      'table-slide',
      'Semantic tables',
      'layout-title-only',
      [
        heading('table-title', 'STRUCTURE, NOT A SCREENSHOT.'),
        featureTable,
        eyebrow('table-footer', 'WEIGHTED COLUMNS  /  ROW HEIGHTS  /  SPANS  /  HEADERS  /  CELL STYLES', { x: 0.07, y: 0.85, width: 0.8, height: 0.055 }),
      ],
      'Normalized tables preserve dimensions, merged cells, headers, direct styling, borders, padding, and alignment.',
    ),
    slide(
      'runtime-section-slide',
      'Runtime section',
      'layout-section-header',
      [
        eyebrow('runtime-section-kicker', '08  /  THE RUNTIME LAYER', { x: 0.08, y: 0.28, width: 0.4, height: 0.055 }),
        text({ id: 'runtime-section-title', name: 'Section title', text: 'A slide deck with\na scene graph underneath.', frame: { x: 0.08, y: 0.36, width: 0.7, height: 0.21 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.062, fontWeight: 700, lineHeight: 1.02 } }),
        text({ id: 'runtime-section-body', name: 'Section subtitle', text: 'One authoritative world for playback, stereo, physics, picking, and deterministic cleanup.', frame: { x: 0.08, y: 0.63, width: 0.66, height: 0.1 }, style: { fontSize: 0.027, color: HUD.warning, lineHeight: 1.35 } }),
        panel({ id: 'runtime-section-index', name: 'Section index', frame: { x: 0.81, y: 0.34, width: 0.11, height: 0.25 }, label: '08', fill: HUD.accent, stroke: HUD.accent, textColor: HUD.background, z: 0.1, thickness: 0.1, labelSize: 0.055 }),
      ],
      'The next slides reveal the runtime capabilities below the familiar editor surface.',
    ),
    slide(
      'stereo-physics-slide',
      'Stereo and physics',
      'layout-blank',
      [
        eyebrow('stereo-kicker', 'ONE WORLD  /  MULTIPLE OUTPUTS'),
        text({ id: 'stereo-title', name: 'Slide title', text: 'Render twice.\nSimulate once.', frame: { x: 0.075, y: 0.16, width: 0.52, height: 0.2 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.058, fontWeight: 700, lineHeight: 1.03 } }),
        panel({ id: 'stereo-mono', name: 'Mono output', frame: { x: 0.075, y: 0.49, width: 0.17, height: 0.16 }, label: 'MONO\n16:9', stroke: HUD.warning, textColor: HUD.warning, labelSize: 0.025 }),
        panel({ id: 'stereo-full', name: 'Full SBS output', frame: { x: 0.27, y: 0.49, width: 0.17, height: 0.16 }, label: 'FULL SBS\n2 x 16:9', stroke: HUD.primary, textColor: HUD.primary, labelSize: 0.025 }),
        panel({ id: 'stereo-half', name: 'Half SBS output', frame: { x: 0.465, y: 0.49, width: 0.17, height: 0.16 }, label: 'HALF SBS\nSQUEEZED', stroke: HUD.accent, textColor: HUD.accent, labelSize: 0.025 }),
        ...physicsGrid,
        panel({ id: 'physics-floor', name: 'Fixed physics floor', frame: { x: 0.05, y: 0.875, width: 0.9, height: 0.035 }, fill: HUD.surface, stroke: HUD.primary, z: 0.06, thickness: 0.1, physics: { body: 'fixed', shape: 'cuboid', density: 1, restitution: 0.72, friction: 0.7 } }),
        panel({ id: 'physics-ball', name: 'Dynamic physics sphere', frame: { x: 0.765, y: 0.22, width: 0.1, height: 0.178 }, shape: 'ellipse', fill: HUD.accent, stroke: HUD.accent, z: 0.06, thickness: 0.18, physics: { body: 'dynamic', shape: 'ball', density: 1, restitution: 0.82, friction: 0.25 } }),
        text({ id: 'physics-label', name: 'Physics label', text: 'RAPIER GRAVITY  /  FIXED STEP', frame: { x: 0.67, y: 0.825, width: 0.28, height: 0.035 }, style: { fontSize: 0.016, fontWeight: 700, color: HUD.success, align: 'center', lineHeight: 1.3 } }),
      ],
      'Physics advances once per fixed step, while mono or stereo cameras project the same world without duplicating state.',
    ),
    slide(
      'playback-slide',
      'Playback and transitions',
      'layout-title-content',
      [
        heading('playback-title', 'MOTION WITH A CLEAR CONTRACT.'),
        body('playback-body', 'Slides own duration, notes, and destination-entry transitions. The player owns navigation, play/pause, and timing.', { x: 0.075, y: 0.235, width: 0.8, height: 0.11 }),
        panel({ id: 'transition-cut', name: 'Cut transition', frame: { x: 0.075, y: 0.46, width: 0.22, height: 0.18 }, label: 'CUT\n0 MS', stroke: HUD.warning, textColor: HUD.warning }),
        panel({ id: 'transition-fade', name: 'Fade transition', frame: { x: 0.34, y: 0.46, width: 0.22, height: 0.18 }, label: 'FADE\n420 MS', stroke: HUD.accent, textColor: HUD.accent }),
        panel({ id: 'transition-slide', name: 'Slide transition', frame: { x: 0.605, y: 0.46, width: 0.22, height: 0.18 }, label: 'SLIDE\n420 MS', stroke: HUD.success, textColor: HUD.success }),
        eyebrow('playback-footer', 'PREVIOUS  /  PLAY-PAUSE  /  NEXT  /  SPEAKER NOTES', { x: 0.075, y: 0.73, width: 0.62, height: 0.055 }),
      ],
      'PrismDeck supports cut, fade, and slide transitions, slide durations, transport controls, and speaker notes.',
    ),
    slide(
      'trust-slide',
      'Accessible and safe',
      'layout-two-content',
      [
        heading('trust-title', 'PORTABLE WITHOUT BECOMING OPAQUE.'),
        text({ id: 'trust-left-title', name: 'Accessibility heading', text: 'SEMANTIC OUTPUT', frame: { x: 0.075, y: 0.27, width: 0.34, height: 0.05 }, style: { fontSize: 0.022, fontWeight: 700, color: HUD.accent } }),
        text({ id: 'trust-left-body', name: 'Accessibility body', text: 'Native table headers and spans\nChart captions and data tables\nImage alternative text\nActive-slide reading order', frame: { x: 0.075, y: 0.36, width: 0.36, height: 0.27 }, style: { fontSize: 0.027, color: HUD.warning, lineHeight: 1.55 } }),
        text({ id: 'trust-right-title', name: 'Security heading', text: 'LOCAL BOUNDARIES', frame: { x: 0.56, y: 0.27, width: 0.34, height: 0.05 }, style: { fontSize: 0.022, fontWeight: 700, color: HUD.success } }),
        text({ id: 'trust-right-body', name: 'Security body', text: 'No macros or imported scripts\nBounded parsing and expansion\nAsset digest verification\nDeterministic disposal', frame: { x: 0.56, y: 0.36, width: 0.36, height: 0.27 }, style: { fontSize: 0.027, color: HUD.warning, lineHeight: 1.55 } }),
        unsupportedWarning,
      ],
      'Exported HTML preserves accessible semantics, while import remains inert, bounded, and explicit about unsupported source features.',
    ),
    slide(
      'export-slide',
      'Export and continue',
      'layout-comparison',
      [
        heading('export-title', 'CHOOSE AN ENDING THAT ISN\'T A DEAD END.'),
        text({ id: 'export-left-title', name: 'Editable heading', text: 'KEEP IT EDITABLE', frame: { x: 0.075, y: 0.25, width: 0.34, height: 0.05 }, style: { fontSize: 0.022, fontWeight: 700, color: HUD.accent, align: 'center' } }),
        text({ id: 'export-right-title', name: 'Capture heading', text: 'CAPTURE THE VIEW', frame: { x: 0.575, y: 0.25, width: 0.34, height: 0.05 }, style: { fontSize: 0.022, fontWeight: 700, color: HUD.success, align: 'center' } }),
        panel({ id: 'export-html', name: 'HTML export', frame: { x: 0.09, y: 0.38, width: 0.31, height: 0.25 }, label: 'SINGLE-FILE HTML\nPLAY + RE-IMPORT', fill: HUD.accent, stroke: HUD.accent, textColor: HUD.background, labelSize: 0.026 }),
        panel({ id: 'export-native', name: 'Native package', frame: { x: 0.14, y: 0.67, width: 0.21, height: 0.1 }, label: '.PRISMDECK', stroke: HUD.primary, textColor: HUD.primary, labelSize: 0.022 }),
        panel({ id: 'export-png', name: 'PNG capture', frame: { x: 0.59, y: 0.38, width: 0.31, height: 0.25 }, label: 'PNG CAPTURE\nMONO OR SBS', fill: HUD.surface, stroke: HUD.success, textColor: HUD.success, labelSize: 0.026 }),
        eyebrow('export-footer', 'VERSIONED JSON  /  EMBEDDED ASSETS  /  ROUND-TRIP VALIDATION', { x: 0.565, y: 0.69, width: 0.38, height: 0.055 }),
      ],
      'Export a re-editable single-file viewer, preserve the native package, or capture the current mono or stereo output as PNG.',
    ),
    slide(
      'layouts-slide',
      'Layouts and themes',
      'layout-title-only',
      [
        heading('layouts-title', 'START WITH STRUCTURE. MAKE IT YOURS.'),
        ...[
          ['TITLE', 0.075, 0.28], ['TITLE + CONTENT', 0.365, 0.28], ['SECTION', 0.655, 0.28],
          ['TWO CONTENT', 0.075, 0.46], ['COMPARISON', 0.365, 0.46], ['TITLE ONLY', 0.655, 0.46],
          ['BLANK', 0.075, 0.64], ['CONTENT + CAPTION', 0.365, 0.64], ['PICTURE + CAPTION', 0.655, 0.64],
        ].map(([label, x, y], index) => panel({
          id: `layout-card-${index + 1}`,
          name: `${label} layout`,
          frame: { x: x as number, y: y as number, width: 0.25, height: 0.12 },
          label: label as string,
          fill: index % 3 === 1 ? HUD.surface : HUD.background,
          stroke: index % 3 === 0 ? HUD.accent : index % 3 === 1 ? HUD.primary : HUD.success,
          textColor: index % 3 === 0 ? HUD.accent : index % 3 === 1 ? HUD.primary : HUD.success,
          labelSize: 0.018,
        })),
        eyebrow('layouts-footer', '9 LAYOUTS  /  7 LIVE THEMES  /  SOURCE LAYOUTS STAY INTACT', { x: 0.075, y: 0.83, width: 0.7, height: 0.055 }),
      ],
      'The built-in deck exercises all nine standard layouts and can switch among seven themes without recoloring imported decks.',
    ),
    slide(
      'lifecycle-slide',
      'Runtime lifecycle',
      'layout-title-content',
      [
        heading('lifecycle-title', 'FAST IN. CLEAN OUT.'),
        body('lifecycle-body', 'The core coordinates the scene, Canvas2D surfaces, chart textures, media, workers, optional physics, and slide state.', { x: 0.075, y: 0.24, width: 0.78, height: 0.12 }),
        panel({ id: 'lifecycle-load', name: 'Load step', frame: { x: 0.075, y: 0.48, width: 0.19, height: 0.18 }, label: '01\nVALIDATE', stroke: HUD.accent, textColor: HUD.accent, labelSize: 0.025 }),
        panel({ id: 'lifecycle-render', name: 'Render step', frame: { x: 0.285, y: 0.48, width: 0.19, height: 0.18 }, label: '02\nCOMPOSE', stroke: HUD.primary, textColor: HUD.primary, labelSize: 0.025 }),
        panel({ id: 'lifecycle-play', name: 'Play step', frame: { x: 0.495, y: 0.48, width: 0.19, height: 0.18 }, label: '03\nSIMULATE', stroke: HUD.success, textColor: HUD.success, labelSize: 0.025 }),
        panel({ id: 'lifecycle-dispose', name: 'Dispose step', frame: { x: 0.705, y: 0.48, width: 0.19, height: 0.18 }, label: '04\nDISPOSE', stroke: HUD.warning, textColor: HUD.warning, labelSize: 0.025 }),
        eyebrow('lifecycle-footer', 'DETERMINISTIC OWNERSHIP ACROSS EVERY DECK AND SLIDE CHANGE', { x: 0.075, y: 0.74, width: 0.7, height: 0.055 }),
      ],
      'Loading a new deck or slide deterministically releases GPU, media, worker, chart, and physics resources.',
    ),
    slide(
      'finale-slide',
      'Build beyond the slide',
      'layout-title-slide',
      [
        eyebrow('finale-kicker', 'PRISMDECKJS  /  YOUR NEXT PRESENTATION'),
        text({ id: 'finale-title', name: 'Final statement', text: 'Keep the format open.\nMake the experience dimensional.', frame: { x: 0.075, y: 0.2, width: 0.72, height: 0.28 }, z: 0.06, rotationY: 2, style: { fontFamily: DISPLAY_FONT, fontSize: 0.059, fontWeight: 700, lineHeight: 1.04 } }),
        text({ id: 'finale-body', name: 'Final body', text: 'Import. Author. Render. Share. Re-open.\nAll in the browser.', frame: { x: 0.08, y: 0.57, width: 0.54, height: 0.13 }, z: 0.02, style: { fontSize: 0.029, color: HUD.warning, lineHeight: 1.45 } }),
        panel({ id: 'finale-mark', name: 'PrismDeck mark', frame: { x: 0.75, y: 0.27, width: 0.17, height: 0.34 }, label: 'P\nD', fill: HUD.accent, stroke: HUD.accent, textColor: HUD.background, z: 0.16, rotationX: -4, rotationY: -9, thickness: 0.16, labelSize: 0.052 }),
      ],
      'PrismDeckJS keeps presentations editable, portable, and ready to move beyond a flat canvas.',
    ),
  ];

  slides.forEach((deckSlide, index) => {
    deckSlide.transition = index === 0
      ? { type: 'cut', durationMs: 0 }
      : { type: index % 2 === 0 ? 'slide' : 'fade', durationMs: 420 };
  });

  return {
    document: {
      schemaVersion: PRISMDECK_SCHEMA_VERSION,
      id: DEMO_DECK_ID,
      kind: 'presentation',
      metadata: {
        title: 'PrismDeckJS Spatial Runtime',
        author: 'PrismDeckJS',
        description: 'Fifteen-slide modern walkthrough of PrismDeckJS authoring, import, data, spatial, runtime, accessibility, and export features.',
        sourceFormat: 'native',
      },
      size: { width: 1600, height: 900 },
      layouts,
      slides,
    },
    assets: new Map([[STUDIO_PREVIEW_ASSET_ID, createStudioPreviewAsset()]]),
  };
}

function normalizeColor(value: string): string {
  return value.toUpperCase();
}

export function detectDemoTheme(document: DeckDocument): DeckThemeId | undefined {
  if (!isDemoDeck(document)) return undefined;
  const colors: string[] = [];
  const collect = (element: DeckElement): void => {
    if (element.type === 'text') colors.push(element.style.color);
    else if (element.type === 'shape') {
      colors.push(element.fill, element.stroke);
      if (element.textStyle) colors.push(element.textStyle.color);
    } else if (element.type === 'table') {
      if (element.style.fill) colors.push(element.style.fill);
      if (element.style.textStyle) colors.push(element.style.textStyle.color);
      for (const border of Object.values(element.style.borders ?? {})) if (border) colors.push(border.color);
      for (const row of element.rows) {
        for (const cell of row.cells) {
          if (cell.style?.fill) colors.push(cell.style.fill);
          if (cell.style?.textStyle) colors.push(cell.style.textStyle.color);
        }
      }
    } else if (element.type === 'chart') {
      for (const plot of element.plots) {
        for (const series of plot.series) if (series.color) colors.push(series.color);
      }
    }
  };
  for (const layout of document.layouts) layout.elements.forEach(collect);
  for (const slide of document.slides) {
    colors.push(slide.background);
    slide.elements.forEach(collect);
  }
  const normalizedColors = colors.map(normalizeColor);
  const scores = DECK_THEMES.map((theme) => {
    const themeColors = new Set(Object.values(theme.colors).map(normalizeColor));
    return { id: theme.id, score: normalizedColors.filter((color) => themeColors.has(color)).length };
  });
  const best = scores.reduce((winner, candidate) => candidate.score > winner.score ? candidate : winner);
  return best.score > 0 ? best.id : undefined;
}

export function isDemoDeck(document: DeckDocument): boolean {
  return document.id === DEMO_DECK_ID;
}

export function applyDemoTheme(document: DeckDocument, nextThemeId: DeckThemeId, currentThemeId = detectDemoTheme(document)): boolean {
  if (!isDemoDeck(document) || !currentThemeId) return false;
  if (currentThemeId === nextThemeId) return true;
  const current = deckTheme(currentThemeId).colors;
  const next = deckTheme(nextThemeId).colors;
  const replace = (value: string, keys: Array<keyof DeckThemeColors>): string => {
    const normalized = normalizeColor(value);
    const key = keys.find((candidate) => normalizeColor(current[candidate]) === normalized);
    return key ? next[key] : value;
  };
  const foregroundKeys: Array<keyof DeckThemeColors> = [
    'primary',
    'accent',
    'success',
    'warning',
    'danger',
    'background',
  ];
  const recolor = (element: DeckElement): void => {
    if (element.type === 'text') element.style.color = replace(element.style.color, foregroundKeys);
    else if (element.type === 'shape') {
      element.fill = replace(element.fill, ['surface', 'accent', 'background', 'primary', 'success', 'warning', 'danger']);
      element.stroke = replace(element.stroke, foregroundKeys);
      if (element.textStyle) element.textStyle.color = replace(element.textStyle.color, foregroundKeys);
    } else if (element.type === 'table') {
      if (element.style.fill) element.style.fill = replace(element.style.fill, ['surface', 'background']);
      if (element.style.textStyle) element.style.textStyle.color = replace(element.style.textStyle.color, foregroundKeys);
      for (const border of Object.values(element.style.borders ?? {})) {
        if (border) border.color = replace(border.color, foregroundKeys);
      }
      for (const row of element.rows) {
        for (const cell of row.cells) {
          if (cell.style?.fill) cell.style.fill = replace(cell.style.fill, ['surface', 'background']);
          if (cell.style?.textStyle) cell.style.textStyle.color = replace(cell.style.textStyle.color, foregroundKeys);
        }
      }
    } else if (element.type === 'chart') {
      for (const plot of element.plots) {
        for (const series of plot.series) if (series.color) series.color = replace(series.color, foregroundKeys);
      }
    }
  };

  for (const layout of document.layouts) layout.elements.forEach(recolor);
  for (const slide of document.slides) {
    slide.background = replace(slide.background, ['background']);
    slide.elements.forEach(recolor);
  }
  return true;
}
