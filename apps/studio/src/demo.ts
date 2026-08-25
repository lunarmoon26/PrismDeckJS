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
  luna: { id: 'solar-luna', fileName: 'solar-luna.webp', url: solarLunaUrl },
  mars: { id: 'solar-mars', fileName: 'solar-mars.webp', url: solarMarsUrl },
  jupiter: { id: 'solar-jupiter', fileName: 'solar-jupiter.webp', url: solarJupiterUrl },
  saturn: { id: 'solar-saturn', fileName: 'solar-saturn.webp', url: solarSaturnUrl },
  uranus: { id: 'solar-uranus', fileName: 'solar-uranus.webp', url: solarUranusUrl },
  neptune: { id: 'solar-neptune', fileName: 'solar-neptune.webp', url: solarNeptuneUrl },
  saturnRing: { id: 'solar-saturn-ring', fileName: 'solar-saturn-ring.webp', url: solarSaturnRingUrl },
  stars: { id: 'solar-stars', fileName: 'solar-stars.webp', url: solarStarsUrl },
} satisfies Record<GalaxySolarTextureKey, { id: string; fileName: string; url: string }>;

const DISPLAY_FONT = 'Avenir Next, Inter, Helvetica Neue, Arial, sans-serif';
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
    transform: { ...DEFAULT_TRANSFORM },
    opacity: options.opacity ?? 1,
    visible: true,
    renderOrder: options.renderOrder ?? 1,
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
  const metric = (id: string, label: string, value: string, x: number, color: string = HUD.primary) =>
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
    title: 'Mean distance from Sol (AU)',
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
  const elementChart: ChartElement = {
    id: 'element-chart',
    type: 'chart',
    name: 'Cosmic element chart',
    frame: { x: 0.5, y: 0.19, width: 0.43, height: 0.59 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 0.94,
    visible: true,
    renderOrder: 2,
    title: 'Ordinary matter by mass',
    titleStyle: { ...chartTextStyle, fontSize: 0.023, fontWeight: 700, color: HUD.primary },
    background: HUD.surface,
    plotBackground: HUD.background,
    axes: [],
    legend: { visible: true, position: 'bottom', style: chartTextStyle },
    plots: [{
      type: 'doughnut',
      holeSize: 58,
      series: [{
        name: 'Element share',
        points: [
          { label: 'Hydrogen', value: 74, style: { color: HUD.primary } },
          { label: 'Helium', value: 24, style: { color: HUD.accent } },
          { label: 'Heavier elements', value: 2, style: { color: HUD.success } },
        ],
        dataLabels: { visible: true, showCategory: true, showPercent: true, position: 'outside', style: chartTextStyle },
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
    columns: [1.5, 1, 1.5],
    rows: [
      { height: 0.8, cells: ['Region', 'Scale', 'Our relation'].map((value, column) => ({ column, text: value, header: true, style: { fill: HUD.accent, textStyle: { ...chartTextStyle, color: HUD.background, fontWeight: 700, align: 'center' } } })) },
      { height: 0.72, cells: ['Stellar disk', '100,000 ly', 'Contains the spiral arms'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Orion Spur', '3,500 ly wide', 'Our local stellar lane'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Galactic center', '26,000 ly away', 'Direction of Sagittarius'].map((value, column) => ({ column, text: value })) },
      { height: 0.72, cells: ['Halo', 'Beyond the disk', 'Old stars and dark matter'].map((value, column) => ({ column, text: value })) },
    ],
    style: {
      fill: HUD.surface,
      textStyle: { ...chartTextStyle, color: HUD.warning, verticalAlign: 'middle' },
      verticalAlign: 'middle',
      padding: { top: 7, right: 10, bottom: 7, left: 10 },
      borders: { top: tableBorder, right: tableBorder, bottom: tableBorder, left: tableBorder },
    },
  };

  const slides: DeckSlide[] = [
    slide('welcome-slide', 'Our Universe', 'layout-title-slide', [
      eyebrow('welcome-kicker', 'A JOURNEY FROM EVERYTHING TO HERE'),
      text({ id: 'welcome-title', name: 'Hero title', text: 'OUR\nUNIVERSE', frame: { x: 0.07, y: 0.2, width: 0.56, height: 0.3 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.082, fontWeight: 700, lineHeight: 0.9 } }),
      body('welcome-subtitle', 'A story of scale, light, gravity, and the small blue world from which we learned to look outward.', { x: 0.075, y: 0.57, width: 0.53, height: 0.14 }),
      panel({ id: 'welcome-coordinate', name: 'Cosmic coordinate', frame: { x: 0.72, y: 0.63, width: 0.2, height: 0.13 }, label: 'SOL\nORION SPUR', fill: HUD.surface, stroke: HUD.accent, textColor: HUD.accent, opacity: 0.86, labelSize: 0.021 }),
      text({ id: 'welcome-credit', name: 'Backdrop credit', text: 'GALAXY: NASA/JPL-CALTECH/R. HURT  /  PLANET MAPS: SOLAR SYSTEM SCOPE (CC BY 4.0)', frame: { x: 0.48, y: 0.94, width: 0.47, height: 0.025 }, style: { fontSize: 0.0085, fontWeight: 600, color: HUD.warning, align: 'right', lineHeight: 1 } }),
    ], [
      'The background is one continuous model. Only the story layer changes as we move through the deck.',
      'Galaxy backdrop: NASA/JPL-Caltech/R. Hurt (SSC/Caltech), https://science.nasa.gov/resource/the-milky-way-galaxy/.',
      'Planet and solar-sky maps: Solar System Scope, CC BY 4.0, https://www.solarsystemscope.com/textures/, https://creativecommons.org/licenses/by/4.0/.',
    ].join('\n\n')),

    slide('scale-slide', 'A ladder of scale', 'layout-title-content', [
      heading('scale-title', 'THE UNIVERSE DOES NOT FIT ONE SCALE.'),
      body('scale-body', 'Each step outward multiplies distance until familiar intuition gives way to light-years and cosmic time.', { x: 0.07, y: 0.22, width: 0.72, height: 0.1 }),
      metric('scale-earth', 'EARTH', '12,742 KM', 0.07, HUD.success),
      metric('scale-sol', 'SOL', '1.39M KM', 0.285, HUD.accent),
      metric('scale-system', 'SOL SYSTEM', '60 AU', 0.5, HUD.primary),
      metric('scale-galaxy', 'MILKY WAY', '100K LY', 0.715, HUD.warning),
      eyebrow('scale-footer', 'ONE LIGHT-YEAR = 9.46 TRILLION KILOMETERS', { x: 0.07, y: 0.82, width: 0.6, height: 0.05 }),
    ], 'A scale ladder establishes the units that the rest of the presentation uses.'),

    slide('light-slide', 'Light is our messenger', 'layout-section-header', [
      eyebrow('light-kicker', '03  /  THE COSMIC MESSENGER', { x: 0.08, y: 0.25, width: 0.5, height: 0.05 }),
      text({ id: 'light-title', name: 'Section title', text: 'To look far away\nis to look back in time.', frame: { x: 0.08, y: 0.34, width: 0.72, height: 0.2 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.061, fontWeight: 700, lineHeight: 1.02 } }),
      body('light-body', 'Moonlight is 1.3 seconds old. Sunlight is 8 minutes old. The nearest large galaxy arrives 2.5 million years late.', { x: 0.08, y: 0.61, width: 0.67, height: 0.13 }),
      panel({ id: 'light-speed', name: 'Speed of light', frame: { x: 0.8, y: 0.33, width: 0.13, height: 0.24 }, label: '299,792\nKM / S', fill: HUD.accent, stroke: HUD.accent, textColor: HUD.background, labelSize: 0.024 }),
    ], 'Astronomy is historical evidence carried by light.'),

    slide('address-slide', 'Our cosmic address', 'layout-two-content', [
      heading('address-title', 'EVERY LOCATION NESTS INSIDE ANOTHER.'),
      panel({ id: 'address-left', name: 'Local address', frame: { x: 0.07, y: 0.28, width: 0.39, height: 0.45 }, label: 'EARTH\nSOL SYSTEM\nORION SPUR\nMILKY WAY', fill: HUD.surface, stroke: HUD.primary, textColor: HUD.primary, opacity: 0.88, labelSize: 0.032 }),
      panel({ id: 'address-right', name: 'Large scale address', frame: { x: 0.54, y: 0.28, width: 0.39, height: 0.45 }, label: 'LOCAL GROUP\nLANIAKEA\nCOSMIC WEB\nOBSERVABLE UNIVERSE', fill: HUD.surface, stroke: HUD.accent, textColor: HUD.accent, opacity: 0.88, labelSize: 0.03 }),
      body('address-caption', 'We are not at a center. We are one address in a structure without a privileged viewpoint.', { x: 0.15, y: 0.79, width: 0.7, height: 0.08 }, 'center'),
    ], 'The nested address moves from Earth to the largest mapped structures.'),

    slide('milky-way-slide', 'The Milky Way', 'layout-comparison', [
      heading('milky-way-title', 'A BARRED SPIRAL, SEEN FROM WITHIN.'),
      body('milky-way-body', 'Hundreds of billions of stars orbit a common center. Gas, dust, and dark matter shape the disk while our system rides the Orion Spur.', { x: 0.07, y: 0.23, width: 0.44, height: 0.18 }),
      panel({ id: 'milky-way-scale', name: 'Galaxy scale', frame: { x: 0.07, y: 0.53, width: 0.2, height: 0.17 }, label: 'ABOUT\n100,000 LY', stroke: HUD.primary, textColor: HUD.primary, opacity: 0.88, labelSize: 0.023 }),
      panel({ id: 'milky-way-stars', name: 'Star count', frame: { x: 0.3, y: 0.53, width: 0.2, height: 0.17 }, label: '100-400B\nSTARS', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.88, labelSize: 0.023 }),
      text({ id: 'milky-way-model', name: 'Model caption', text: 'The moving galaxy behind this slide is the same scene that began the presentation.', frame: { x: 0.58, y: 0.31, width: 0.3, height: 0.24 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.039, fontWeight: 700, color: HUD.warning, align: 'center', verticalAlign: 'middle', lineHeight: 1.25 } }),
      eyebrow('milky-way-footer', 'ONE MODEL  /  ONE CLOCK  /  EVERY SLIDE', { x: 0.58, y: 0.63, width: 0.3, height: 0.05 }),
    ], 'The persistent particle model adapts the calibrated CyberHUD Galaxy distribution.'),

    slide('galaxy-anatomy-slide', 'Anatomy of our galaxy', 'layout-title-only', [
      heading('galaxy-anatomy-title', 'THE MILKY WAY HAS NEIGHBORHOODS.'),
      galaxyTable,
      eyebrow('galaxy-anatomy-footer', 'DISTANCES ARE APPROXIMATE; THE MODEL IS A MAP, NOT A PHOTOGRAPH', { x: 0.07, y: 0.82, width: 0.78, height: 0.05 }),
    ], 'A semantic table describes the structures represented by the galaxy scene.'),

    slide('sol-slide', 'A star called Sol', 'layout-picture-caption', [
      text({ id: 'sol-title', name: 'Slide title', text: 'SOL', frame: { x: 0.055, y: 0.2, width: 0.28, height: 0.16 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.078, fontWeight: 700, lineHeight: 1 } }),
      body('sol-body', 'A middle-aged G-type star. Ordinary by galactic standards, indispensable by ours.', { x: 0.055, y: 0.41, width: 0.29, height: 0.16 }),
      panel({ id: 'sol-age', name: 'Sol age', frame: { x: 0.055, y: 0.65, width: 0.13, height: 0.12 }, label: '4.6B YR\nOLD', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.9, labelSize: 0.019 }),
      panel({ id: 'sol-share', name: 'Sol mass share', frame: { x: 0.205, y: 0.65, width: 0.14, height: 0.12 }, label: '99.86%\nSYSTEM MASS', stroke: HUD.primary, textColor: HUD.primary, opacity: 0.9, labelSize: 0.018 }),
      text({ id: 'sol-marker-copy', name: 'Sol marker explanation', text: 'The Galactic marker opens into the same nested solar system used by the following slides.', frame: { x: 0.58, y: 0.62, width: 0.31, height: 0.11 }, style: { fontSize: 0.024, color: HUD.warning, align: 'center', lineHeight: 1.35 } }),
    ], 'The camera crosses from Sol at 8.15 kiloparsecs into the nested CyberHUD-derived solar system.'),

    slide('solar-family-slide', 'The solar family', 'layout-content-caption', [
      text({ id: 'solar-family-title', name: 'Slide title', text: 'GRAVITY KEEPS\nA FAMILY TOGETHER.', frame: { x: 0.055, y: 0.2, width: 0.26, height: 0.18 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.045, fontWeight: 700, lineHeight: 1.03 } }),
      body('solar-family-body', 'Eight planets occupy a tiny fraction of the galaxy, yet even their distances span two orders of magnitude.', { x: 0.055, y: 0.45, width: 0.26, height: 0.18 }),
      panel({ id: 'solar-family-au', name: 'Astronomical unit', frame: { x: 0.055, y: 0.7, width: 0.26, height: 0.1 }, label: '1 AU = EARTH TO SOL', stroke: HUD.success, textColor: HUD.success, opacity: 0.88, labelSize: 0.018 }),
      orbitChart,
    ], 'The chart stores orbital distances as editable semantic data.'),

    slide('rocky-worlds-slide', 'The rocky worlds', 'layout-blank', [
      eyebrow('rocky-kicker', '09  /  THE INNER SYSTEM'),
      heading('rocky-title', 'FOUR WORLDS BUILT FROM ROCK AND METAL.', { x: 0.07, y: 0.15, width: 0.78, height: 0.14 }),
      ...([
        ['MERCURY', 'HOT DAYS\nCOLD NIGHTS', HUD.warning],
        ['VENUS', 'RUNAWAY\nGREENHOUSE', HUD.accent],
        ['EARTH', 'LIQUID WATER\nLIVING OCEAN', HUD.success],
        ['MARS', 'ANCIENT RIVERS\nTHIN AIR', HUD.danger],
      ] satisfies Array<[string, string, string]>).map(([label, copy, color], index) => panel({
        id: `rocky-${String(label).toLowerCase()}`,
        name: `${label} card`,
        frame: { x: 0.07 + index * 0.22, y: 0.43, width: 0.18, height: 0.25 },
        label: `${label}\n\n${copy}`,
        fill: HUD.surface,
        stroke: color,
        textColor: color,
        opacity: 0.9,
        labelSize: 0.019,
      })),
      body('rocky-footer', 'Similar ingredients produced radically different climates.', { x: 0.2, y: 0.77, width: 0.6, height: 0.07 }, 'center'),
    ], 'The inner planets are compared as outcomes of shared initial materials.'),

    slide('giant-worlds-slide', 'The giant worlds', 'layout-two-content', [
      heading('giants-title', 'BEYOND THE ASTEROIDS, SCALE CHANGES AGAIN.'),
      panel({ id: 'gas-giants', name: 'Gas giants', frame: { x: 0.07, y: 0.29, width: 0.4, height: 0.42 }, label: 'JUPITER\nLargest planet\n\nSATURN\nA world encircled', fill: HUD.surface, stroke: HUD.accent, textColor: HUD.accent, opacity: 0.9, labelSize: 0.026 }),
      panel({ id: 'ice-giants', name: 'Ice giants', frame: { x: 0.53, y: 0.29, width: 0.4, height: 0.42 }, label: 'URANUS\nRotates on its side\n\nNEPTUNE\nSupersonic winds', fill: HUD.surface, stroke: HUD.primary, textColor: HUD.primary, opacity: 0.9, labelSize: 0.026 }),
      body('giants-footer', 'Together, the four giants contain more than 99 percent of all planetary mass.', { x: 0.18, y: 0.79, width: 0.64, height: 0.07 }, 'center'),
    ], 'The outer planets divide naturally into gas giants and ice giants.'),

    slide('earth-luna-slide', 'Earth and Luna', 'layout-comparison', [
      heading('earth-luna-title', 'A DOUBLE PORTRAIT SHAPED BY GRAVITY.'),
      text({ id: 'earth-title', name: 'Earth heading', text: 'EARTH', frame: { x: 0.09, y: 0.28, width: 0.33, height: 0.06 }, style: { fontSize: 0.025, fontWeight: 700, color: HUD.success, align: 'center' } }),
      panel({ id: 'earth-card', name: 'Earth facts', frame: { x: 0.09, y: 0.38, width: 0.33, height: 0.31 }, label: '71% OCEAN\nACTIVE GEOLOGY\nTHICK ATMOSPHERE\nONE BIOSPHERE', stroke: HUD.success, textColor: HUD.success, opacity: 0.9, labelSize: 0.024 }),
      text({ id: 'luna-title', name: 'Luna heading', text: 'LUNA', frame: { x: 0.58, y: 0.28, width: 0.33, height: 0.06 }, style: { fontSize: 0.025, fontWeight: 700, color: HUD.primary, align: 'center' } }),
      panel({ id: 'luna-card', name: 'Luna facts', frame: { x: 0.58, y: 0.38, width: 0.33, height: 0.31 }, label: 'TIDALLY LOCKED\nAIRLESS SURFACE\nSTABILIZES TILT\nDRIVES TIDES', stroke: HUD.primary, textColor: HUD.primary, opacity: 0.9, labelSize: 0.024 }),
      body('earth-luna-footer', 'Two bodies, one evolving system.', { x: 0.3, y: 0.78, width: 0.4, height: 0.07 }, 'center'),
    ], 'Earth and Luna are presented as a coupled dynamical system.'),

    slide('stardust-slide', 'We are made of stardust', 'layout-content-caption', [
      text({ id: 'stardust-title', name: 'Slide title', text: 'THE PERIODIC TABLE\nHAS A COSMIC HISTORY.', frame: { x: 0.055, y: 0.2, width: 0.38, height: 0.18 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.044, fontWeight: 700, lineHeight: 1.04 } }),
      body('stardust-body', 'Hydrogen formed early. Stars fused heavier nuclei. Exploding stars and colliding remnants scattered the ingredients of worlds and life.', { x: 0.055, y: 0.46, width: 0.37, height: 0.21 }),
      eyebrow('stardust-footer', 'CARBON  /  OXYGEN  /  IRON  /  CALCIUM', { x: 0.055, y: 0.75, width: 0.37, height: 0.05 }),
      elementChart,
    ], 'The doughnut chart keeps the broad cosmic abundance split editable.'),

    slide('deep-time-slide', 'Deep time', 'layout-title-content', [
      heading('time-title', 'THE UNIVERSE HAS BEEN BECOMING FOR 13.8 BILLION YEARS.'),
      ...([
        ['13.8B', 'UNIVERSE BEGINS'],
        ['13.6B', 'FIRST STARS'],
        ['4.6B', 'SOL FORMS'],
        ['4.5B', 'EARTH FORMS'],
        ['NOW', 'WE LOOK BACK'],
      ] satisfies Array<[string, string]>).map(([value, label], index) => panel({
        id: `time-${index + 1}`,
        name: label,
        frame: { x: 0.055 + index * 0.185, y: 0.41, width: 0.155, height: 0.2 },
        label: `${value}\n${label}`,
        fill: index === 4 ? HUD.accent : HUD.surface,
        stroke: index === 4 ? HUD.accent : HUD.primary,
        textColor: index === 4 ? HUD.background : HUD.primary,
        opacity: 0.9,
        labelSize: 0.019,
      })),
      panel({ id: 'time-line', name: 'Timeline', frame: { x: 0.07, y: 0.67, width: 0.86, height: 0.006 }, shape: 'line', fill: HUD.accent, stroke: HUD.accent, strokeWidth: 4 }),
      body('time-footer', 'Nearly all of cosmic history passed before humans learned that galaxies existed beyond the Milky Way.', { x: 0.17, y: 0.75, width: 0.66, height: 0.1 }, 'center'),
    ], 'The timeline compresses cosmic history into five memorable anchors.'),

    slide('life-slide', 'A universe that can know itself', 'layout-title-only', [
      heading('life-title', 'SO FAR, LIFE IS THE RAREST THING WE KNOW.'),
      panel({ id: 'life-water', name: 'Water condition', frame: { x: 0.07, y: 0.33, width: 0.25, height: 0.27 }, label: 'LIQUID WATER\nA solvent for chemistry', stroke: HUD.primary, textColor: HUD.primary, opacity: 0.9, labelSize: 0.023 }),
      panel({ id: 'life-energy', name: 'Energy condition', frame: { x: 0.375, y: 0.33, width: 0.25, height: 0.27 }, label: 'ENERGY\nA gradient to exploit', stroke: HUD.accent, textColor: HUD.accent, opacity: 0.9, labelSize: 0.023 }),
      panel({ id: 'life-time', name: 'Time condition', frame: { x: 0.68, y: 0.33, width: 0.25, height: 0.27 }, label: 'TIME\nA chance to evolve', stroke: HUD.success, textColor: HUD.success, opacity: 0.9, labelSize: 0.023 }),
      body('life-body', 'The search continues through nearby worlds, distant atmospheres, and signals that nature alone may not explain.', { x: 0.18, y: 0.7, width: 0.64, height: 0.1 }, 'center'),
    ], 'The conditions are hypotheses for exploration, not a claim that Earth is the only path to life.'),

    slide('finale-slide', 'We belong to the story', 'layout-title-slide', [
      eyebrow('finale-kicker', '15  /  A VIEW FROM ONE SMALL WORLD'),
      text({ id: 'finale-title', name: 'Final statement', text: 'WE ARE THE UNIVERSE\nLOOKING BACK AT ITSELF.', frame: { x: 0.07, y: 0.22, width: 0.72, height: 0.24 }, style: { fontFamily: DISPLAY_FONT, fontSize: 0.058, fontWeight: 700, lineHeight: 1.02 } }),
      body('finale-body', 'Every atom has a history. Every photon carries a message. Every question begins from here.', { x: 0.075, y: 0.56, width: 0.53, height: 0.14 }),
      panel({ id: 'finale-coordinate', name: 'Final coordinate', frame: { x: 0.72, y: 0.28, width: 0.2, height: 0.34 }, label: 'EARTH\nSOL\nMILKY WAY\nOUR UNIVERSE', fill: HUD.accent, stroke: HUD.accent, textColor: HUD.background, opacity: 0.9, labelSize: 0.026 }),
    ], 'The closing returns from cosmic scale to the observer.'),
  ];

  const backgroundCameras: BackgroundCamera[] = [
    { x: 0, y: 0, z: 1, view: 'top', transitionDurationMs: 0 },
    { x: -3.5, y: 1.6, z: 0, view: 'tilt', transitionDurationMs: 1_400 },
    { x: 2.1, y: 0.2, z: -3.8, view: 'tilt', transitionDurationMs: 1_500 },
    { x: 0, y: 0, z: 3, view: 'top', transitionDurationMs: 1_600 },
    { x: 2.1, y: 0, z: -2.4, view: 'top', transitionDurationMs: 1_400 },
    { x: 2.1, y: 0.5, z: -4.2, view: 'tilt', transitionDurationMs: 1_500 },
    { x: 0, y: 0, z: 0, distance: 2.2, view: 'tilt', focusBody: 'sol', transitionDurationMs: 1_600 },
    { x: 0, y: 0, z: 0, distance: 11, view: 'tilt', focusBody: 'sol', transitionDurationMs: 1_400 },
    { x: 0, y: 0, z: 0, distance: 2.4, view: 'top', focusBody: 'sol', transitionDurationMs: 1_300 },
    { x: 0, y: 0, z: 0, distance: 0.68, view: 'horizon', focusBody: 'jupiter', orbitAzimuthDegrees: -58, orbitElevationDegrees: 0, transitionDurationMs: 1_500 },
    { x: 0, y: 0, z: 0, distance: 0.8, view: 'horizon', focusBody: 'earth', orbitAzimuthDegrees: 58, orbitElevationDegrees: 0, transitionDurationMs: 1_600 },
    { x: 2.1, y: 0, z: -3.5, view: 'tilt', transitionDurationMs: 1_500 },
    { x: -2.5, y: 2, z: 0.8, view: 'top', transitionDurationMs: 1_400 },
    { x: 0, y: 0, z: 4.2, view: 'tilt', transitionDurationMs: 1_700 },
    { x: -0.035, y: 0, z: 0, distance: 0.42, view: 'horizon', focusBody: 'earth', orbitAzimuthDegrees: 58, orbitElevationDegrees: 0, transitionDurationMs: 1_600 },
  ];

  slides.forEach((deckSlide, index) => {
    deckSlide.backgroundCamera = backgroundCameras[index]!;
    deckSlide.transition = index === 0
      ? { type: 'cut', durationMs: 0 }
      : { type: index % 2 === 0 ? 'slide' : 'fade', durationMs: 520 };
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
      mimeType: 'image/webp',
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
        title: 'Our Universe',
        author: 'PrismDeckJS',
        description: 'A fifteen-slide spatial journey from cosmic scale to our place around Sol.',
        sourceFormat: 'native',
      },
      size: { width: 1600, height: 900 },
      backgroundScene: {
        type: 'galaxy',
        seed: 815,
        starCount: 7_000,
        rotationDegreesPerSecond: -3,
        coreColor: '#FFE5C7',
        armColor: '#C7DCFF',
        solColor: '#FFF0A6',
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
