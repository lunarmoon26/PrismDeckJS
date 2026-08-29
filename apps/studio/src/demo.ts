import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  PRISMDECK_SCHEMA_VERSION,
  type BackgroundCamera,
  type ChartElement,
  type DeckAsset,
  type DeckDocument,
  type DeckElement,
  type DeckSlide,
  type ElementTransform,
  type ElementFrame,
  type GalaxySolarTextureKey,
  type LoadedDeck,
  type ShapeElement,
  type TableElement,
  type TextElement,
  type TextStyle,
} from 'prismdeckjs';
import { DECK_THEMES, deckTheme, type DeckThemeColors, type DeckThemeId } from './themes';
import { createDefaultLayouts } from './layouts';
import galaxyBackdropUrl from './assets/galaxy-backdrop.webp?url';
import galaxyBackdropLicense from './assets/galaxy-backdrop-license.txt?raw';
import solarEarthUrl from './assets/solar-earth.webp?url';
import solarEarthCloudsUrl from './assets/solar-earth-clouds.jpg?url';
import solarEarthSpecularUrl from './assets/solar-earth-specular.png?url';
import solarJupiterUrl from './assets/solar-jupiter.webp?url';
import solarLunaUrl from './assets/solar-luna.webp?url';
import solarMarsUrl from './assets/solar-mars.webp?url';
import solarMercuryUrl from './assets/solar-mercury.webp?url';
import solarNeptuneUrl from './assets/solar-neptune.webp?url';
import solarSaturnRingUrl from './assets/solar-saturn-ring.webp?url';
import solarSaturnUrl from './assets/solar-saturn.webp?url';
import solarSolUrl from './assets/solar-sol.webp?url';
import solarStarsUrl from './assets/solar-stars.webp?url';
import solarUranusUrl from './assets/solar-uranus.webp?url';
import solarVenusUrl from './assets/solar-venus.webp?url';
import solarTextureLicense from './assets/solar-system-textures-license.txt?raw';

export const DEMO_DECK_ID = 'prismdeck-feature-deck';
const GALAXY_BACKDROP_ASSET_ID = 'nasa-milky-way-backdrop';
const SOLAR_TEXTURES = {
  sol: { id: 'solar-sol', fileName: 'solar-sol.webp', url: solarSolUrl },
  mercury: { id: 'solar-mercury', fileName: 'solar-mercury.webp', url: solarMercuryUrl },
  venus: { id: 'solar-venus', fileName: 'solar-venus.webp', url: solarVenusUrl },
  earth: { id: 'solar-earth', fileName: 'solar-earth.webp', url: solarEarthUrl },
  earthClouds: { id: 'solar-earth-clouds', fileName: 'solar-earth-clouds.jpg', url: solarEarthCloudsUrl },
  earthSpecular: { id: 'solar-earth-specular', fileName: 'solar-earth-specular.png', url: solarEarthSpecularUrl },
  luna: { id: 'solar-luna', fileName: 'solar-luna.webp', url: solarLunaUrl },
  mars: { id: 'solar-mars', fileName: 'solar-mars.webp', url: solarMarsUrl },
  jupiter: { id: 'solar-jupiter', fileName: 'solar-jupiter.webp', url: solarJupiterUrl },
  saturn: { id: 'solar-saturn', fileName: 'solar-saturn.webp', url: solarSaturnUrl },
  uranus: { id: 'solar-uranus', fileName: 'solar-uranus.webp', url: solarUranusUrl },
  neptune: { id: 'solar-neptune', fileName: 'solar-neptune.webp', url: solarNeptuneUrl },
  saturnRing: { id: 'solar-saturn-ring', fileName: 'solar-saturn-ring.webp', url: solarSaturnRingUrl },
  stars: { id: 'solar-stars', fileName: 'solar-stars.webp', url: solarStarsUrl },
} satisfies Record<GalaxySolarTextureKey, { id: string; fileName: string; url: string }>;

const DISPLAY_FONT = 'Orbitron, Avenir Next, Inter, Helvetica Neue, Arial, sans-serif';
const UI_FONT = 'Inter, Avenir Next, Helvetica Neue, Arial, sans-serif';

interface TextOptions {
  id: string;
  name: string;
  text: string;
  frame: ElementFrame;
  opacity?: number;
  renderOrder?: number;
  style?: Partial<TextStyle>;
}

interface PanelOptions {
  id: string;
  name: string;
  frame: ElementFrame;
  label?: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
  shape?: ShapeElement['shape'];
  opacity?: number;
  strokeWidth?: number;
  renderOrder?: number;
  labelSize?: number;
  transform?: Partial<ElementTransform>;
  thickness?: number;
}

function createText(HUD: DeckThemeColors, options: TextOptions): TextElement {
  return {
    id: options.id,
    type: 'text',
    name: options.name,
    frame: options.frame,
    transform: { ...DEFAULT_TRANSFORM },
    opacity: options.opacity ?? 1,
    visible: true,
    renderOrder: options.renderOrder ?? 2,
    text: options.text,
    style: {
      ...DEFAULT_TEXT_STYLE,
      fontFamily: UI_FONT,
      color: HUD.primary,
      ...options.style,
    },
  };
}

function createPanel(HUD: DeckThemeColors, options: PanelOptions): ShapeElement {
  return {
    id: options.id,
    type: 'shape',
    name: options.name,
    frame: options.frame,
    transform: { ...DEFAULT_TRANSFORM, ...(options.transform ?? {}) },
    opacity: options.opacity ?? 1,
    visible: true,
    renderOrder: options.renderOrder ?? 1,
    shape: options.shape ?? 'roundedRectangle',
    fill: options.fill ?? HUD.surface,
    stroke: options.stroke ?? HUD.primary,
    strokeWidth: options.strokeWidth ?? 1.5,
    ...(options.thickness === undefined ? {} : { thickness: options.thickness }),
    ...(options.label === undefined
      ? {}
      : {
          text: options.label,
          textStyle: {
            ...DEFAULT_TEXT_STYLE,
            fontFamily: DISPLAY_FONT,
            fontSize: options.labelSize ?? 0.026,
            fontWeight: 700,
            color: options.textColor ?? HUD.primary,
            align: 'center' as const,
            verticalAlign: 'middle' as const,
            lineHeight: 1.35,
          },
        }),
  };
}

function createSlide(
  background: string,
  id: string,
  name: string,
  layoutId: string,
  elements: DeckElement[],
  notes: string,
): DeckSlide {
  return { id, name, layoutId, durationMs: 7_000, background, notes, elements };
}

export async function createDemoDeck(themeId: DeckThemeId = 'edge'): Promise<LoadedDeck> {
  const HUD = deckTheme(themeId).colors;
  const text = (options: TextOptions) => createText(HUD, options);
  const panel = (options: PanelOptions) => createPanel(HUD, options);
  const slide = (id: string, name: string, layoutId: string, elements: DeckElement[], notes: string) =>
    createSlide(HUD.background, id, name, layoutId, elements, notes);
  const heading = (id: string, value: string, frame: ElementFrame = { x: 0.07, y: 0.08, width: 0.8, height: 0.13 }) =>
    text({
      id,
      name: 'Slide title',
      text: value,
      frame,
      style: { fontFamily: DISPLAY_FONT, fontSize: 0.055, fontWeight: 700, lineHeight: 1.04 },
    });
  const body = (id: string, value: string, frame: ElementFrame, align: TextStyle['align'] = 'left') =>
    text({
      id,
      name: 'Body',
      text: value,
      frame,
      style: { fontSize: 0.028, color: HUD.warning, lineHeight: 1.45, align },
    });
  const eyebrow = (id: string, value: string, frame: ElementFrame = { x: 0.07, y: 0.075, width: 0.62, height: 0.05 }) =>
    text({
      id,
      name: 'Section label',
      text: value,
      frame,
      style: { fontSize: 0.016, fontWeight: 700, color: HUD.accent, lineHeight: 1.2 },
    });
  const metric = (
    id: string,
    label: string,
    value: string,
    x: number,
    color: string = HUD.primary,
    depth = 0,
    rotationY = 0,
  ) =>
    panel({
      id,
      name: label,
      frame: { x, y: 0.58, width: 0.19, height: 0.17 },
      label: `${value}\n${label}`,
      fill: HUD.surface,
      stroke: color,
      textColor: color,
      opacity: 0.9,
      labelSize: 0.022,
      transform: { z: depth, rotationY },
      ...(depth === 0 ? {} : { thickness: 0.032 }),
    });

  const chartTextStyle: TextStyle = {
    ...DEFAULT_TEXT_STYLE,
    fontFamily: UI_FONT,
    fontSize: 0.017,
    color: HUD.warning,
    lineHeight: 1.2,
  };
  const orbitChart: ChartElement = {
    id: 'orbit-chart',
    type: 'chart',
    name: 'Planet distance chart',
    frame: { x: 0.36, y: 0.18, width: 0.58, height: 0.66 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 0.94,
    visible: true,
    renderOrder: 2,
    title: 'Mean orbital distance from Sol (AU)',
    titleStyle: { ...chartTextStyle, fontSize: 0.024, fontWeight: 700, color: HUD.primary },
    background: HUD.surface,
    plotBackground: HUD.background,
    axes: [
      { id: 'planet', kind: 'category', position: 'bottom', visible: true, labelStyle: chartTextStyle },
      { id: 'distance', kind: 'value', position: 'left', visible: true, title: 'Astronomical units', titleStyle: chartTextStyle, labelStyle: chartTextStyle, minimum: 0, maximum: 32, majorGridlines: { color: HUD.warning, width: 0.5, style: 'dotted' } },
    ],
    legend: { visible: false, position: 'bottom', style: chartTextStyle },
    plots: [{
      type: 'bar',
      direction: 'column',
      grouping: 'clustered',
      axisIds: ['planet', 'distance'],
      series: [{
        name: 'Distance',
        color: HUD.accent,
        points: [
          { label: 'Mercury', value: 0.39 },
          { label: 'Venus', value: 0.72 },
          { label: 'Earth', value: 1 },
          { label: 'Mars', value: 1.52 },
          { label: 'Jupiter', value: 5.2 },
          { label: 'Saturn', value: 9.54 },
          { label: 'Uranus', value: 19.19 },
          { label: 'Neptune', value: 30.07 },
        ],
      }],
    }],
  };
  const tableBorder = { color: HUD.warning, width: 0.8, style: 'solid' as const };
  const galaxyTable: TableElement = {
    id: 'galaxy-table',
    type: 'table',
    name: 'Milky Way structure table',
    frame: { x: 0.07, y: 0.24, width: 0.86, height: 0.52 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 0.94,
    visible: true,
    renderOrder: 2,
    columns: [1.45, 1.55, 1.5],
    rows: [
      { height: 0.8, cells: ['Structure', 'What the model shows', 'Our relation'].map((value, column) => ({ column, text: value, header: true, style: { fill: HUD.accent, textStyle: { ...chartTextStyle, color: HUD.background, fontWeight: 700, align: 'center' } } })) },
      { height: 0.72, cells: ['Central bar', 'Dense stellar bar at the core', 'Anchors the major arms'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Scutum-Centaurus + Perseus', 'Two major spiral arms', 'Highest density of young and old stars'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Norma + Sagittarius', 'Two minor arms', 'Gas-rich, active star-forming regions'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Orion Spur', 'Small partial arm', 'Sol lies between Sagittarius and Perseus'].map((value, column) => ({ column, text: value })) },
    ],
    style: {
      fill: HUD.surface,
      textStyle: { ...chartTextStyle, color: HUD.warning, verticalAlign: 'middle' },
      verticalAlign: 'middle',
      padding: { top: 7, right: 10, bottom: 7, left: 10 },
      borders: { top: tableBorder, right: tableBorder, bottom: tableBorder, left: tableBorder },
    },
  };
  const planetTable: TableElement = {
    id: 'planet-index-table',
    type: 'table',
    name: 'Planet metric index',
    frame: { x: 0.06, y: 0.22, width: 0.88, height: 0.61 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 0.94,
    visible: true,
    renderOrder: 2,
    columns: [1.15, 1.45, 1.05, 1.3],
    rows: [
      ['Planet', 'Diameter (km)', 'Mean orbit (AU)', 'Orbital period'],
      ['Mercury', '4,880', '0.387', '88 days'],
      ['Venus', '12,104', '0.723', '225 days'],
      ['Earth', '12,756', '1.000', '365 days'],
      ['Mars', '6,792', '1.524', '687 days'],
      ['Jupiter', '142,984', '5.203', '11.9 years'],
      ['Saturn', '120,536', '9.537', '29.5 years'],
      ['Uranus', '51,118', '19.191', '84.0 years'],
      ['Neptune', '49,528', '30.069', '164.8 years'],
    ].map((values, rowIndex) => ({
      height: rowIndex === 0 ? 0.78 : 0.63,
      cells: values.map((value, column) => ({
        column,
        text: value,
        header: rowIndex === 0,
        ...(rowIndex === 0 ? { style: { fill: HUD.accent, textStyle: { ...chartTextStyle, color: HUD.background, fontWeight: 700, align: 'center' } } } : {}),
      })),
    })),
    style: {
      fill: HUD.surface,
      textStyle: { ...chartTextStyle, color: HUD.warning, verticalAlign: 'middle' },
      verticalAlign: 'middle',
      padding: { top: 5, right: 8, bottom: 5, left: 8 },
      borders: { top: tableBorder, right: tableBorder, bottom: tableBorder, left: tableBorder },
    },
  };

  const slides: DeckSlide[] = [
    slide('welcome-slide', 'Milky Way field brief', 'layout-title-slide', [
      eyebrow('welcome-kicker', 'MILKY WAY / FIELD BRIEF'),
      text({ id: 'welcome-title', name: 'Hero title', text: 'A WALK THROUGH\nOUR GALAXY.', frame: { x: 0.07, y: 0.2, width: 0.56, height: 0.28 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.074, fontWeight: 700, lineHeight: 0.92 } }),
      body('welcome-subtitle', 'A flight plan from the Milky Way’s arms to one small blue world in its Orion Spur.', { x: 0.075, y: 0.57, width: 0.47, height: 0.13 }),
      panel({ id: 'welcome-coordinate', name: 'Mission coordinate', frame: { x: 0.07, y: 0.76, width: 0.22, height: 0.1 }, label: 'SOL / ORION SPUR', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.78, labelSize: 0.017 }),
      text({ id: 'welcome-credit', name: 'Backdrop credit', text: 'GALAXY: NASA/JPL-CALTECH/R. HURT  /  PLANET MAPS: SOLAR SYSTEM SCOPE (CC BY 4.0)', frame: { x: 0.48, y: 0.94, width: 0.47, height: 0.025 }, style: { fontSize: 0.0085, fontWeight: 600, color: HUD.warning, align: 'right', lineHeight: 1 } }),
    ], [
      'A continuous declarative galaxy scene carries the story from the Milky Way to the Solar System.',
      'Galaxy structure and solar-system location: NASA Science, https://science.nasa.gov/resource/the-milky-way-galaxy/, https://science.nasa.gov/solar-system/solar-system-facts/.',
      'Galaxy backdrop: NASA/JPL-Caltech/R. Hurt (SSC/Caltech), https://science.nasa.gov/resource/the-milky-way-galaxy/.',
      'Planet and solar-sky maps: Solar System Scope, CC BY 4.0, https://www.solarsystemscope.com/textures/, https://creativecommons.org/licenses/by/4.0/.',
    ].join('\n\n')),

    slide('scale-slide', 'A galaxy in numbers', 'layout-title-content', [
      heading('scale-title', 'A GALAXY IS A MACHINE OF DISTANCE.'),
      body('scale-body', 'The rendered particles are a navigational model. The numbers below describe the physical Milky Way.', { x: 0.07, y: 0.22, width: 0.72, height: 0.1 }),
      metric('scale-diameter', 'STELLAR DISK', '100K LY', 0.07, HUD.primary),
      metric('scale-stars', 'ESTIMATED STARS', '100-400B', 0.285, HUD.accent),
      metric('scale-orbit', 'GALACTIC YEAR', '230M YR', 0.5, HUD.success),
      metric('scale-speed', 'SOL ORBIT SPEED', '828K KM/H', 0.715, HUD.warning),
      eyebrow('scale-footer', 'THE VIEW IS A MAP OF SCALE, NOT A LITERAL STAR COUNT', { x: 0.07, y: 0.82, width: 0.7, height: 0.05 }),
    ], 'NASA estimates the Milky Way at about 100,000 light-years across. Star counts remain uncertain because faint stars and dust are difficult to measure from within the disk.'),

    slide('anatomy-slide', 'The Milky Way blueprint', 'layout-title-only', [
      heading('anatomy-title', 'A BARRED SPIRAL WITH A LOCAL LANE.'),
      galaxyTable,
      eyebrow('anatomy-footer', 'THE ORION SPUR IS OUR LOCAL STELLAR ADDRESS', { x: 0.07, y: 0.82, width: 0.68, height: 0.05 }),
    ], 'NASA describes the Milky Way as a barred spiral with two major arms, two minor arms, and the Sun in the Orion Spur between Sagittarius and Perseus.'),

    slide('address-slide', 'Our galactic address', 'layout-comparison', [
      heading('address-title', 'WE ARE NOT NEAR THE CENTER.'),
      panel({ id: 'address-location', name: 'Solar location', frame: { x: 0.07, y: 0.29, width: 0.37, height: 0.39 }, label: 'SOL\nORION SPUR\nBETWEEN SAGITTARIUS\nAND PERSEUS', stroke: HUD.primary, textColor: HUD.primary, opacity: 0.8, labelSize: 0.026 }),
      panel({ id: 'address-motion', name: 'Galactic motion', frame: { x: 0.5, y: 0.29, width: 0.25, height: 0.39 }, label: 'ABOUT\n26,000 LY\nFROM THE CENTER\n\n230M-YEAR\nORBIT', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.8, labelSize: 0.022 }),
      body('address-caption', 'Sol travels around the Milky Way at about 828,000 kilometers per hour. Our ordinary location is a moving coordinate.', { x: 0.07, y: 0.76, width: 0.62, height: 0.1 }),
    ], 'Our Solar System is about 26,000 light-years from the Galactic Center and completes one orbit in about 230 million years.'),

    slide('handoff-slide', 'From galaxy to star', 'layout-section-header', [
      eyebrow('handoff-kicker', 'GALACTIC SCALE / LOCAL ARRIVAL', { x: 0.08, y: 0.25, width: 0.5, height: 0.05 }),
      text({ id: 'handoff-title', name: 'Section title', text: 'ONE ORDINARY STAR\nHOLDS A WHOLE SYSTEM.', frame: { x: 0.08, y: 0.34, width: 0.58, height: 0.2 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.058, fontWeight: 700, lineHeight: 1.02 } }),
      body('handoff-body', 'The next transition leaves 26,000 light-years behind and hands the camera to Sol.', { x: 0.08, y: 0.61, width: 0.52, height: 0.12 }),
      panel({ id: 'handoff-distance', name: 'Solar system handoff', frame: { x: 0.08, y: 0.77, width: 0.22, height: 0.09 }, label: 'FOCUS / SOL', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.78, labelSize: 0.018 }),
    ], 'This slide uses the same background scene as the galactic overview, then focuses its nested solar-system model on Sol.'),

    slide('sol-slide', 'Sol systems brief', 'layout-picture-caption', [
      text({ id: 'sol-title', name: 'Slide title', text: 'SOL', frame: { x: 0.055, y: 0.2, width: 0.28, height: 0.13 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.074, fontWeight: 700, lineHeight: 1 } }),
      body('sol-body', 'A middle-aged G-type star. Ordinary by galactic standards, indispensable to every orbit shown here.', { x: 0.055, y: 0.39, width: 0.28, height: 0.16 }),
      panel({ id: 'sol-diameter', name: 'Sol diameter', frame: { x: 0.055, y: 0.63, width: 0.13, height: 0.13 }, label: '1.4M KM\nDIAMETER', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.78, labelSize: 0.017, transform: { z: 0.06, rotationY: -3 }, thickness: 0.028 }),
      panel({ id: 'sol-age', name: 'Sol age', frame: { x: 0.205, y: 0.63, width: 0.14, height: 0.13 }, label: '4.6B YR\nOLD', stroke: HUD.primary, textColor: HUD.primary, opacity: 0.78, labelSize: 0.018, transform: { z: 0.1, rotationY: 2 }, thickness: 0.028 }),
      text({ id: 'sol-offset-caption', name: 'Solar framing caption', text: 'The focused Sun is intentionally held on the right so the systems brief stays clear on the left.', frame: { x: 0.055, y: 0.81, width: 0.29, height: 0.08 }, style: { fontSize: 0.016, color: HUD.warning, lineHeight: 1.35 } }),
    ], 'The focused horizon camera uses a target offset to hold Sol in the right half of the viewport while the authoring layer remains fixed on the left.'),

    slide('orbits-slide', 'Eight orbital lanes', 'layout-content-caption', [
      text({ id: 'orbits-title', name: 'Slide title', text: 'EIGHT WORLDS.\nONE GRAVITY WELL.', frame: { x: 0.055, y: 0.2, width: 0.27, height: 0.18 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.044, fontWeight: 700, lineHeight: 1.03 } }),
      body('orbits-body', 'Mean orbital distance makes the outer system look sparse. Neptune is about 30 times farther from Sol than Earth.', { x: 0.055, y: 0.45, width: 0.28, height: 0.18 }),
      panel({ id: 'orbits-au', name: 'Astronomical unit', frame: { x: 0.055, y: 0.7, width: 0.26, height: 0.1 }, label: '1 AU = EARTH TO SOL', stroke: HUD.success, textColor: HUD.success, opacity: 0.78, labelSize: 0.018 }),
      orbitChart,
    ], 'The chart is editable semantic data. Values are mean orbital distances in astronomical units.'),

    slide('planet-index-slide', 'Planet index', 'layout-blank', [
      eyebrow('planet-index-kicker', 'SOLAR SYSTEM / REFERENCE DATA'),
      heading('planet-index-title', 'EIGHT WORLDS, THREE USEFUL METRICS.', { x: 0.07, y: 0.12, width: 0.8, height: 0.08 }),
      planetTable,
      eyebrow('planet-index-footer', 'DIAMETERS AND MEAN ORBITS ARE APPROXIMATE NASA REFERENCE VALUES', { x: 0.07, y: 0.86, width: 0.76, height: 0.04 }),
    ], 'Planet diameters, distances, and orbital periods are NASA reference values. This semantic table remains editable in Studio.'),

    slide('giant-worlds-slide', 'The outer worlds', 'layout-two-content', [
      heading('giants-title', 'THE OUTER SYSTEM CHANGES THE SCALE AGAIN.', { x: 0.07, y: 0.08, width: 0.76, height: 0.18 }),
      panel({ id: 'gas-giants', name: 'Gas giants', frame: { x: 0.06, y: 0.29, width: 0.19, height: 0.38 }, label: 'GAS GIANTS\n\nJUPITER\n142,984 KM\n\nSATURN\n120,536 KM', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.78, labelSize: 0.018 }),
      panel({ id: 'ice-giants', name: 'Ice giants', frame: { x: 0.275, y: 0.29, width: 0.19, height: 0.38 }, label: 'ICE GIANTS\n\nURANUS\n51,118 KM\n\nNEPTUNE\n49,528 KM', stroke: HUD.primary, textColor: HUD.primary, opacity: 0.78, labelSize: 0.018 }),
      body('giants-footer', 'Jupiter is held above the lower edge: a physical subject, not a backdrop behind the comparison.', { x: 0.06, y: 0.74, width: 0.4, height: 0.1 }),
    ], 'The camera focuses Jupiter closely enough to make its scale legible while keeping the comparison clear on the left.'),

    slide('finale-slide', 'Earth, our endpoint', 'layout-title-slide', [
      eyebrow('finale-kicker', 'FINAL COORDINATE / EARTH'),
      text({ id: 'finale-title', name: 'Final statement', text: 'ONE BLUE WORLD\nIN A MOVING GALAXY.', frame: { x: 0.07, y: 0.22, width: 0.54, height: 0.24 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.057, fontWeight: 700, lineHeight: 1.02 } }),
      body('finale-body', 'The walkthrough ends where the measurements begin: one planet, one star, one local spur in the Milky Way.', { x: 0.075, y: 0.56, width: 0.45, height: 0.14 }),
      panel({ id: 'finale-coordinate', name: 'Final coordinate', frame: { x: 0.075, y: 0.76, width: 0.2, height: 0.1 }, label: 'EARTH / SOL\nORION SPUR', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.78, labelSize: 0.017 }),
      text({ id: 'finale-offset-caption', name: 'Earth framing caption', text: 'Earth remains to the right of the closing copy.', frame: { x: 0.075, y: 0.88, width: 0.3, height: 0.04 }, style: { fontSize: 0.013, color: HUD.warning, lineHeight: 1.2 } }),
    ], 'The horizon focus camera offsets Earth to the right side of the viewport, preserving a left-side closing message.'),
  ];

  const backgroundCameras: BackgroundCamera[] = [
    { x: -3.1, y: 1.1, z: 1.2, view: 'top', transitionDurationMs: 0 },
    { x: -1.8, y: 0.9, z: -1.3, view: 'tilt', transitionDurationMs: 1_400 },
    { x: 2.4, y: 0.5, z: -2.3, view: 'top', transitionDurationMs: 1_500 },
    { x: 0.6, y: -1.3, z: -3.2, view: 'tilt', transitionDurationMs: 1_600 },
    { x: -0.006, y: 0, z: 0, distance: 0.27, view: 'tilt', focusBody: 'sol', transitionDurationMs: 2_600 },
    { x: -0.009, y: 0.003, z: 0, distance: 0.05, view: 'horizon', focusBody: 'sol', orbitAzimuthDegrees: -42, orbitElevationDegrees: 8, transitionDurationMs: 2_200 },
    { x: -0.007, y: 0.003, z: 0, distance: 0.31, view: 'top', focusBody: 'sol', transitionDurationMs: 1_800 },
    { x: -0.011, y: 0.006, z: 0, distance: 0.27, view: 'tilt', focusBody: 'sol', transitionDurationMs: 1_600 },
    { x: 0, y: 0.003, z: 0, distance: 0.016, view: 'horizon', focusBody: 'jupiter', orbitAzimuthDegrees: -58, orbitElevationDegrees: 10, transitionDurationMs: 1_900 },
    { x: 0, y: -0.003, z: 0, distance: 0.012, view: 'horizon', focusBody: 'earth', orbitAzimuthDegrees: 58, orbitElevationDegrees: 4, transitionDurationMs: 1_900 },
  ];

  slides.forEach((deckSlide, index) => {
    deckSlide.backgroundCamera = backgroundCameras[index]!;
    deckSlide.transition = { type: index === 0 || index === 4 ? 'fade' : index % 2 === 0 ? 'slide' : 'fade', durationMs: 520 };
  });

  const packagedAssets = [
    { id: GALAXY_BACKDROP_ASSET_ID, fileName: 'galaxy-backdrop.webp', url: galaxyBackdropUrl },
    ...Object.values(SOLAR_TEXTURES),
  ];
  const assets: Map<string, DeckAsset> = new Map(await Promise.all(packagedAssets.map(async (asset) => {
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`Unable to load bundled asset ${asset.fileName} (${response.status})`);
    return [asset.id, {
      id: asset.id,
      fileName: asset.fileName,
      mimeType: asset.fileName.endsWith('.png') ? 'image/png' : asset.fileName.endsWith('.jpg') ? 'image/jpeg' : 'image/webp',
      data: new Uint8Array(await response.arrayBuffer()),
    }] as const;
  })));
  const textEncoder = new TextEncoder();
  assets.set('galaxy-backdrop-license', {
    id: 'galaxy-backdrop-license',
    fileName: 'galaxy-backdrop-license.txt',
    mimeType: 'text/plain',
    data: textEncoder.encode(galaxyBackdropLicense),
  });
  assets.set('solar-system-textures-license', {
    id: 'solar-system-textures-license',
    fileName: 'solar-system-textures-license.txt',
    mimeType: 'text/plain',
    data: textEncoder.encode(solarTextureLicense),
  });

  return {
    document: {
      schemaVersion: PRISMDECK_SCHEMA_VERSION,
      id: DEMO_DECK_ID,
      kind: 'presentation',
      metadata: {
        title: 'Milky Way Field Brief',
        author: 'PrismDeckJS',
        description: 'A ten-slide spatial walkthrough from the Milky Way’s arms to Earth, with focused astronomical framing and editable data surfaces.',
        sourceFormat: 'native',
      },
      size: { width: 1600, height: 900 },
      backgroundScene: {
        type: 'galaxy',
        seed: 815,
        starCount: 9_000,
        rotationDegreesPerSecond: -0.75,
        coreColor: '#F6E2C8',
        armColor: '#8FAED0',
        solColor: '#FFF1C5',
        backdropAssetId: GALAXY_BACKDROP_ASSET_ID,
        solarSystem: {
          textureAssetIds: Object.fromEntries(
            Object.entries(SOLAR_TEXTURES).map(([key, asset]) => [key, asset.id]),
          ),
        },
      },
      layouts: createDefaultLayouts(HUD),
      slides,
    },
    assets,
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
  for (const deckSlide of document.slides) {
    colors.push(deckSlide.background);
    deckSlide.elements.forEach(collect);
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
          if (cell.style?.fill) cell.style.fill = replace(cell.style.fill, ['surface', 'background', 'accent']);
          if (cell.style?.textStyle) cell.style.textStyle.color = replace(cell.style.textStyle.color, foregroundKeys);
        }
      }
    } else if (element.type === 'chart') {
      if (element.background) element.background = replace(element.background, ['surface', 'background']);
      if (element.plotBackground) element.plotBackground = replace(element.plotBackground, ['surface', 'background']);
      if (element.titleStyle) element.titleStyle.color = replace(element.titleStyle.color, foregroundKeys);
      if (element.legend?.style) element.legend.style.color = replace(element.legend.style.color, foregroundKeys);
      for (const axis of element.axes) {
        if (axis.labelStyle) axis.labelStyle.color = replace(axis.labelStyle.color, foregroundKeys);
        if (axis.titleStyle) axis.titleStyle.color = replace(axis.titleStyle.color, foregroundKeys);
        if (axis.line) axis.line.color = replace(axis.line.color, foregroundKeys);
        if (axis.majorGridlines) axis.majorGridlines.color = replace(axis.majorGridlines.color, foregroundKeys);
      }
      for (const plot of element.plots) {
        for (const series of plot.series) {
          if (series.color) series.color = replace(series.color, foregroundKeys);
          if (series.dataLabels?.style) series.dataLabels.style.color = replace(series.dataLabels.style.color, foregroundKeys);
          for (const point of series.points) {
            if (point.style?.color) point.style.color = replace(point.style.color, foregroundKeys);
          }
        }
      }
    }
  };

  for (const layout of document.layouts) layout.elements.forEach(recolor);
  for (const deckSlide of document.slides) {
    deckSlide.background = replace(deckSlide.background, ['background']);
    deckSlide.elements.forEach(recolor);
  }
  return true;
}
