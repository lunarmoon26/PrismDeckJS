import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Euler,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  Points,
  Quaternion,
  RingGeometry,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector3,
} from 'three';

import type {
  BackgroundCamera,
  DeckBackgroundScene,
  DeckSize,
  GalaxyBackgroundScene,
  GalaxySolarTextureKey,
  SolarBodyKey,
} from '../document/types';

const SLIDE_HEIGHT = 10;
const DISK_RADIUS_KILOPARSECS = 18.4;
const SUN_RADIUS_KILOPARSECS = 8.15;
const STELLAR_DISK_SCALE_LENGTH_KILOPARSECS = 2.6;
const HAZE_DISK_SCALE_LENGTH_KILOPARSECS = 5.8;
const THICK_DISK_STAR_FRACTION = 0.15;
const THICK_DISK_SIGMA_MULTIPLIER = 4.5;
const DISK_THICKNESS_KILOPARSECS = 0.2;
const ARM_LENGTH_MEAN = 0.55;
const ARM_LENGTH_DEVIATION = 0.28;
const HAZE_PARTICLE_RATIO = 0.35;
const HAZE_MINIMUM_SIZE = 20;
const HAZE_MAXIMUM_SIZE = 50;
const HAZE_OPACITY = 0.08;
const CORE_HAZE_OPACITY = 0.14;
const HAZE_NEAR_OPACITY_RATIO = 0.3;
const CORE_HAZE_SIZE_SCALE = 1.8;
const STAR_SIZE_MINIMUM = 0.25;
const STAR_SIZE_MAXIMUM = 3;
const STAR_RASTER_MINIMUM_PIXELS = 3;
const TONE_MAPPING_EXPOSURE = 0.5;
const BLOOM_STRENGTH = 0.8;
const BLOOM_THRESHOLD = 0.4;
const BLOOM_RADIUS = 1;
const BACKDROP_OPACITY = 0.75;
const CYBERHUD_BACKDROP_WORLD_SIZE = 1_000;
const CYBERHUD_BACKDROP_SPAN_KILOPARSECS = (5_000 / 46 * 1_280) / 3_261.56;
const CYBERHUD_WORLD_UNITS_PER_KILOPARSEC = CYBERHUD_BACKDROP_WORLD_SIZE / CYBERHUD_BACKDROP_SPAN_KILOPARSECS;
const CYBERHUD_FOG_DENSITY = 0.00003;
const CYBERHUD_HAZE_DISTANCE_SCALE = 625;
const CYBERHUD_FOG_COLOR = '#ebe2db';
const ARM_FRACTION_PER_FLOW_UNIT = 0.0075;
const DISK_PHASE_PER_FLOW_UNIT = 0.0015;
const DISK_CLOCKWISE_DEGREES_PER_FLOW_UNIT = 0.8;
const SOLAR_DETAIL_CAMERA_DISTANCE = 6;
const SOLAR_SPIN_SIMULATION_HOURS_PER_SECOND = 0.5;
const SOL_DISPLAY_RADIUS = 0.18;
const SOLAR_SKY_SPHERE_RADIUS = 48;
const SOLAR_FOCUSED_BODY_SCALE = 0.62;
const SOLAR_OVERVIEW_BODY_SCALE = 0.42;
const GALACTIC_ECLIPTIC_INCLINATION_DEGREES = 60.188;
const GALACTIC_ECLIPTIC_ASCENDING_NODE_DEGREES = 270.023;

type StructureKind = 'disk' | 'bar' | 'spiral' | 'localSpur' | 'threeKiloparsecArm';

interface GalaxyStructure {
  id: string;
  kind: StructureKind;
  starWeight: number;
  hazeWeight: number;
  tracer?: 'major' | 'gasRich';
  startRadiusKiloparsecs?: number;
  endRadiusKiloparsecs?: number;
  referenceRadiusKiloparsecs?: number;
  referenceAngleDegrees?: number;
  pitchDegrees?: number;
  radialOffsetKiloparsecs?: number;
  radialBumpKiloparsecs?: number;
  radialBumpAngleDegrees?: number;
  radialBumpHalfWidthDegrees?: number;
  widthScale?: number;
  widthKiloparsecs?: number;
  anchorRadiusKiloparsecs?: number;
  anchorAngleDegrees?: number;
  anchorXKiloparsecs?: number;
  anchorYKiloparsecs?: number;
  lengthKiloparsecs?: number;
  rotationDegrees?: number;
  parameterStartDegrees?: number;
  parameterEndDegrees?: number;
  localOffsetXKiloparsecs?: number;
  localOffsetYKiloparsecs?: number;
  semiMajorKiloparsecs?: number;
  semiMinorKiloparsecs?: number;
  orientationDegrees?: number;
  radialPower?: number;
}

interface GalacticPoint {
  x: number;
  y: number;
  normalX?: number;
  normalY?: number;
}

type GalaxyMotion =
  | {
      kind: 'arm';
      structure: GalaxyStructure;
      fraction: number;
      lateralOffsetKiloparsecs: number;
    }
  | {
      kind: 'disk';
      flowPhase: number;
      angleRadians: number;
      radiusKiloparsecs: number;
      thick: boolean;
    };

interface GalaxyParticle extends GalacticPoint {
  z: number;
  structure: GalaxyStructure;
  motion?: GalaxyMotion;
}

interface SolarBodyModel {
  key: Exclude<SolarBodyKey, 'sol'>;
  color: string;
  displayRadius: number;
  semiMajorAxis: number;
  orbitalPeriodDays: number;
  fallbackPhaseDegrees: number;
  orbitalInclinationDegrees: number;
  longitudeAscendingNodeDegrees: number;
  siderealRotationHours: number;
  parent?: 'earth';
}

const STRUCTURES: GalaxyStructure[] = [
  { id: 'disk', kind: 'disk', starWeight: 70, hazeWeight: 35 },
  { id: 'galacticBar', kind: 'bar', semiMajorKiloparsecs: 2.1, semiMinorKiloparsecs: 0.75, orientationDegrees: 62.6, radialPower: 1.45, starWeight: 10, hazeWeight: 4 },
  { id: 'longBar', kind: 'bar', semiMajorKiloparsecs: 4, semiMinorKiloparsecs: 0.6, orientationDegrees: 46, radialPower: 0.72, starWeight: 5, hazeWeight: 1 },
  { id: 'scutumCentaurus', kind: 'spiral', tracer: 'major', startRadiusKiloparsecs: 4, endRadiusKiloparsecs: 18.4, referenceRadiusKiloparsecs: 8.15, referenceAngleDegrees: 26.2, pitchDegrees: 13.3, radialOffsetKiloparsecs: 0.6, radialBumpKiloparsecs: 1.5, radialBumpAngleDegrees: 90, radialBumpHalfWidthDegrees: 110, widthScale: 1, starWeight: 5, hazeWeight: 20 },
  { id: 'perseus', kind: 'spiral', tracer: 'major', startRadiusKiloparsecs: 4, endRadiusKiloparsecs: 18.4, referenceRadiusKiloparsecs: 8.15, referenceAngleDegrees: 206.2, pitchDegrees: 13.7, widthScale: 1, starWeight: 4, hazeWeight: 8 },
  { id: 'norma', kind: 'spiral', tracer: 'gasRich', startRadiusKiloparsecs: 3, endRadiusKiloparsecs: 10.5, referenceRadiusKiloparsecs: 8.15, referenceAngleDegrees: 116.2, pitchDegrees: 13.7, widthScale: 0.82, starWeight: 1, hazeWeight: 9 },
  { id: 'sagittarius', kind: 'spiral', tracer: 'gasRich', startRadiusKiloparsecs: 3.4, endRadiusKiloparsecs: 15.5, referenceRadiusKiloparsecs: 8.15, referenceAngleDegrees: 296.2, pitchDegrees: 14, widthScale: 0.9, starWeight: 1, hazeWeight: 8 },
  { id: 'outer', kind: 'spiral', tracer: 'gasRich', startRadiusKiloparsecs: 9, endRadiusKiloparsecs: 18.4, referenceRadiusKiloparsecs: 8.15, referenceAngleDegrees: 146.2, pitchDegrees: 13.7, widthScale: 1.15, starWeight: 1.5, hazeWeight: 7 },
  { id: 'orion', kind: 'localSpur', tracer: 'gasRich', anchorRadiusKiloparsecs: 8.15, anchorAngleDegrees: 270, anchorXKiloparsecs: 0, anchorYKiloparsecs: -8.15, lengthKiloparsecs: 6, pitchDegrees: 11, rotationDegrees: -10, widthKiloparsecs: 0.23, starWeight: 1.5, hazeWeight: 4 },
  { id: 'near3kpc', kind: 'threeKiloparsecArm', tracer: 'gasRich', parameterStartDegrees: -180, parameterEndDegrees: 0, localOffsetXKiloparsecs: 0.7, localOffsetYKiloparsecs: 0.2, starWeight: 0.5, hazeWeight: 2 },
  { id: 'far3kpc', kind: 'threeKiloparsecArm', tracer: 'gasRich', parameterStartDegrees: 0, parameterEndDegrees: 180, starWeight: 0.5, hazeWeight: 2 },
];

const STAR_TYPE_PERCENTAGES = [76.45, 12.1, 7.6, 3, 0.6, 0.13];
const STAR_TYPE_COLORS = ['#ffcf95', '#ffe3c4', '#fff1e7', '#fff8f8', '#d9e1ff', '#c1d0ff'];
const STAR_TYPE_SIZES = [0.7, 0.7, 1.15, 1.48, 2, 2.5];

const SOLAR_BODIES: SolarBodyModel[] = [
  { key: 'mercury', color: '#777777', displayRadius: 0.045, semiMajorAxis: 0.387, orbitalPeriodDays: 87.969, fallbackPhaseDegrees: 205.619142251, orbitalInclinationDegrees: 7.00497902, longitudeAscendingNodeDegrees: 48.33076593, siderealRotationHours: 1407.5088 },
  { key: 'venus', color: '#e4d5aa', displayRadius: 0.07, semiMajorAxis: 0.723, orbitalPeriodDays: 224.701, fallbackPhaseDegrees: 105.896529412, orbitalInclinationDegrees: 3.39467605, longitudeAscendingNodeDegrees: 76.67984255, siderealRotationHours: -5832.432 },
  { key: 'earth', color: '#3f82c5', displayRadius: 0.075, semiMajorAxis: 1, orbitalPeriodDays: 365.256, fallbackPhaseDegrees: 100.377822768, orbitalInclinationDegrees: 0, longitudeAscendingNodeDegrees: 0, siderealRotationHours: 23.93447 },
  { key: 'luna', color: '#a7a7a1', displayRadius: 0.035, semiMajorAxis: 0.00257, orbitalPeriodDays: 27.322, fallbackPhaseDegrees: 98.240025467, orbitalInclinationDegrees: 5.145, longitudeAscendingNodeDegrees: 125.045, siderealRotationHours: 655.72, parent: 'earth' },
  { key: 'mars', color: '#b95738', displayRadius: 0.06, semiMajorAxis: 1.524, orbitalPeriodDays: 686.98, fallbackPhaseDegrees: 309.873045194, orbitalInclinationDegrees: 1.84969142, longitudeAscendingNodeDegrees: 49.55953891, siderealRotationHours: 24.62296 },
  { key: 'jupiter', color: '#c9a77f', displayRadius: 0.14, semiMajorAxis: 5.203, orbitalPeriodDays: 4332.59, fallbackPhaseDegrees: 295.814859153, orbitalInclinationDegrees: 1.30439695, longitudeAscendingNodeDegrees: 100.47390909, siderealRotationHours: 9.92496 },
  { key: 'saturn', color: '#d8c38f', displayRadius: 0.12, semiMajorAxis: 9.537, orbitalPeriodDays: 10759.22, fallbackPhaseDegrees: 292.041041245, orbitalInclinationDegrees: 2.48599187, longitudeAscendingNodeDegrees: 113.66242448, siderealRotationHours: 10.65624 },
  { key: 'uranus', color: '#83c7cf', displayRadius: 0.1, semiMajorAxis: 19.191, orbitalPeriodDays: 30688.5, fallbackPhaseDegrees: 242.403847289, orbitalInclinationDegrees: 0.77263783, longitudeAscendingNodeDegrees: 74.01692503, siderealRotationHours: -17.23992 },
  { key: 'neptune', color: '#416bb5', displayRadius: 0.1, semiMajorAxis: 30.069, orbitalPeriodDays: 60182, fallbackPhaseDegrees: 172.140931993, orbitalInclinationDegrees: 1.77004347, longitudeAscendingNodeDegrees: 131.78422574, siderealRotationHours: 16.11 },
];

export interface BackgroundSceneRuntime {
  readonly object: Group;
  setBackdrop(image: HTMLImageElement): void;
  setSolarTexture(key: GalaxySolarTextureKey, image: HTMLImageElement): void;
  setCamera(camera: BackgroundCamera | undefined, durationSeconds: number): void;
  setRenderCamera(pointScale: number, distance: number): void;
  stereoSceneDistance(): number;
  setRenderEyeOffset(offsetX: number): void;
  update(elapsedSeconds: number): void;
  dispose(): void;
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4_294_967_296;
  };
}

function normalRandom(random: () => number, mean = 0, deviation = 1): number {
  const first = Math.max(Number.EPSILON, random());
  return mean + deviation * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
}

function boundedUnitNormal(random: () => number): number {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = normalRandom(random, ARM_LENGTH_MEAN, ARM_LENGTH_DEVIATION);
    if (value >= 0 && value <= 1) return value;
  }
  return ARM_LENGTH_MEAN;
}

function rotate2D(x: number, y: number, angle: number, target: GalacticPoint = { x: 0, y: 0 }): GalacticPoint {
  target.x = x * Math.cos(angle) - y * Math.sin(angle);
  target.y = x * Math.sin(angle) + y * Math.cos(angle);
  return target;
}

function rotatedEllipsePoint(
  semiMajor: number,
  semiMinor: number,
  parameter: number,
  orientation: number,
  radius = 1,
  offsetX = 0,
  offsetY = 0,
  target: GalacticPoint = { x: 0, y: 0 },
): GalacticPoint {
  rotate2D(
    semiMajor * radius * Math.cos(parameter),
    semiMinor * radius * Math.sin(parameter),
    orientation,
    target,
  );
  target.x += offsetX;
  target.y += offsetY;
  return target;
}

function selectedStructure(random: () => number, haze: boolean): GalaxyStructure {
  const total = STRUCTURES.reduce((sum, structure) => sum + (haze ? structure.hazeWeight : structure.starWeight), 0);
  let roll = random() * total;
  for (const structure of STRUCTURES) {
    roll -= haze ? structure.hazeWeight : structure.starWeight;
    if (roll < 0) return structure;
  }
  return STRUCTURES[STRUCTURES.length - 1]!;
}

function spiralCenterline(
  structure: GalaxyStructure,
  fraction: number,
  target: GalacticPoint = { x: 0, y: 0 },
): GalacticPoint {
  const start = structure.startRadiusKiloparsecs ?? 1;
  const end = structure.endRadiusKiloparsecs ?? DISK_RADIUS_KILOPARSECS;
  const referenceRadius = structure.referenceRadiusKiloparsecs ?? SUN_RADIUS_KILOPARSECS;
  let radius = start * Math.pow(end / start, fraction);
  const angle = radians(structure.referenceAngleDegrees ?? 0) + Math.log(radius / referenceRadius) / Math.tan(radians(structure.pitchDegrees ?? 13.7));
  radius += structure.radialOffsetKiloparsecs ?? 0;
  if (structure.radialBumpKiloparsecs) {
    const delta = ((angle * 180 / Math.PI - (structure.radialBumpAngleDegrees ?? 0) + 540) % 360) - 180;
    const halfWidth = structure.radialBumpHalfWidthDegrees ?? 1;
    if (Math.abs(delta) < halfWidth) {
      const window = Math.cos(delta / halfWidth * Math.PI / 2);
      radius += structure.radialBumpKiloparsecs * window * window;
    }
  }
  target.x = radius * Math.cos(angle);
  target.y = radius * Math.sin(angle);
  return target;
}

function localSpurCenterline(
  structure: GalaxyStructure,
  fraction: number,
  target: GalacticPoint = { x: 0, y: 0 },
): GalacticPoint {
  const anchorRadius = structure.anchorRadiusKiloparsecs ?? SUN_RADIUS_KILOPARSECS;
  const pitch = radians(structure.pitchDegrees ?? 11);
  const angleOffset = (fraction - 0.5) * (structure.lengthKiloparsecs ?? 6) * Math.cos(pitch) / anchorRadius;
  const radius = anchorRadius * Math.exp(angleOffset * Math.tan(pitch));
  const anchorAngle = radians(structure.anchorAngleDegrees ?? 270);
  const angle = anchorAngle + angleOffset;
  const relativeX = radius * Math.cos(angle) - anchorRadius * Math.cos(anchorAngle);
  const relativeY = radius * Math.sin(angle) - anchorRadius * Math.sin(anchorAngle);
  rotate2D(relativeX, relativeY, radians(structure.rotationDegrees ?? 0), target);
  target.x += structure.anchorXKiloparsecs ?? anchorRadius * Math.cos(anchorAngle);
  target.y += structure.anchorYKiloparsecs ?? anchorRadius * Math.sin(anchorAngle);
  return target;
}

function threeKiloparsecCenterline(
  structure: GalaxyStructure,
  fraction: number,
  target: GalacticPoint = { x: 0, y: 0 },
): GalacticPoint {
  const parameter = radians(
    (structure.parameterStartDegrees ?? -180) +
    ((structure.parameterEndDegrees ?? 180) - (structure.parameterStartDegrees ?? -180)) * fraction,
  );
  const orientation = radians(47.3);
  rotatedEllipsePoint(
    4,
    2.2,
    parameter,
    orientation,
    1,
    structure.localOffsetXKiloparsecs ?? 0,
    structure.localOffsetYKiloparsecs ?? 0,
    target,
  );
  const tangentX = -4 * Math.sin(parameter) * Math.cos(orientation) - 2.2 * Math.cos(parameter) * Math.sin(orientation);
  const tangentY = -4 * Math.sin(parameter) * Math.sin(orientation) + 2.2 * Math.cos(parameter) * Math.cos(orientation);
  const length = Math.max(Number.EPSILON, Math.hypot(tangentX, tangentY));
  target.normalX = tangentY / length;
  target.normalY = -tangentX / length;
  return target;
}

function structureCenterline(
  structure: GalaxyStructure,
  fraction: number,
  target: GalacticPoint = { x: 0, y: 0 },
): GalacticPoint {
  if (structure.kind === 'localSpur') return localSpurCenterline(structure, fraction, target);
  if (structure.kind === 'threeKiloparsecArm') return threeKiloparsecCenterline(structure, fraction, target);
  return spiralCenterline(structure, fraction, target);
}

function armWidthKiloparsecs(structure: GalaxyStructure, radius: number): number {
  if (structure.widthKiloparsecs) return structure.widthKiloparsecs;
  return clamp(0.336 + 0.036 * (radius - SUN_RADIUS_KILOPARSECS), 0.15, 0.7) * (structure.widthScale ?? 1);
}

function armPositionAtFraction(
  structure: GalaxyStructure,
  fraction: number,
  lateralOffsetKiloparsecs: number,
  target: GalacticPoint = { x: 0, y: 0 },
  before: GalacticPoint = { x: 0, y: 0 },
  after: GalacticPoint = { x: 0, y: 0 },
): GalacticPoint {
  structureCenterline(structure, fraction, target);
  let normalX = target.normalX;
  let normalY = target.normalY;
  if (structure.kind !== 'threeKiloparsecArm') {
    structureCenterline(structure, Math.max(0, fraction - 0.001), before);
    structureCenterline(structure, Math.min(1, fraction + 0.001), after);
    const tangentX = after.x - before.x;
    const tangentY = after.y - before.y;
    const length = Math.max(Number.EPSILON, Math.hypot(tangentX, tangentY));
    normalX = tangentY / length;
    normalY = -tangentX / length;
  }
  target.x += normalX! * lateralOffsetKiloparsecs;
  target.y += normalY! * lateralOffsetKiloparsecs;
  return target;
}

function diskFlowPhaseForRadius(radius: number): number {
  const integral = (value: number) => (value + STELLAR_DISK_SCALE_LENGTH_KILOPARSECS) * Math.exp(-value / STELLAR_DISK_SCALE_LENGTH_KILOPARSECS);
  const lower = integral(0);
  const upper = integral(DISK_RADIUS_KILOPARSECS);
  return clamp((lower - integral(clamp(radius, 0, DISK_RADIUS_KILOPARSECS))) / (lower - upper), 0, 1);
}

function diskFlowRadiusTable(): Float32Array {
  const radii = new Float32Array(513);
  for (let sample = 0; sample < radii.length; sample += 1) {
    const phase = sample / (radii.length - 1);
    let lower = 0;
    let upper = DISK_RADIUS_KILOPARSECS;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const middle = (lower + upper) / 2;
      if (diskFlowPhaseForRadius(middle) < phase) lower = middle;
      else upper = middle;
    }
    radii[sample] = (lower + upper) / 2;
  }
  return radii;
}

const DISK_FLOW_RADII = diskFlowRadiusTable();

function diskFlowRadiusForPhase(phase: number): number {
  const position = clamp(phase, 0, 1) * (DISK_FLOW_RADII.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(DISK_FLOW_RADII.length - 1, lowerIndex + 1);
  const lower = DISK_FLOW_RADII[lowerIndex]!;
  return lower + (DISK_FLOW_RADII[upperIndex]! - lower) * (position - lowerIndex);
}

function sampleDiskRadius(random: () => number, scaleLength: number): number {
  let radius = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    radius = -scaleLength * Math.log(Math.max(Number.EPSILON, random()) * Math.max(Number.EPSILON, random()));
    if (radius <= DISK_RADIUS_KILOPARSECS) break;
  }
  return Math.min(radius, DISK_RADIUS_KILOPARSECS);
}

function galaxyParticle(random: () => number, haze: boolean): GalaxyParticle {
  const structure = selectedStructure(random, haze);
  let point: GalacticPoint;
  let motion: GalaxyMotion | undefined;
  let thick = false;
  if (structure.kind === 'disk') {
    const radius = sampleDiskRadius(random, haze ? HAZE_DISK_SCALE_LENGTH_KILOPARSECS : STELLAR_DISK_SCALE_LENGTH_KILOPARSECS);
    const angle = random() * Math.PI * 2;
    thick = !haze && random() < THICK_DISK_STAR_FRACTION;
    point = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    if (!haze) {
      motion = {
        kind: 'disk',
        flowPhase: diskFlowPhaseForRadius(radius),
        angleRadians: angle,
        radiusKiloparsecs: radius,
        thick,
      };
    }
  } else if (structure.kind === 'bar') {
    const pointAngle = random() * Math.PI * 2;
    point = rotatedEllipsePoint(
      structure.semiMajorKiloparsecs ?? 1,
      structure.semiMinorKiloparsecs ?? 1,
      pointAngle,
      radians(structure.orientationDegrees ?? 0),
      Math.pow(random(), structure.radialPower ?? 1),
    );
  } else {
    const fraction = boundedUnitNormal(random);
    const center = structureCenterline(structure, fraction);
    const widthScale = haze ? 1.8 * (0.75 + random() * 0.5) : 1;
    const lateralOffset = normalRandom(random, 0, armWidthKiloparsecs(structure, Math.hypot(center.x, center.y)) * widthScale);
    point = armPositionAtFraction(structure, fraction, lateralOffset);
    if (!haze) motion = { kind: 'arm', structure, fraction, lateralOffsetKiloparsecs: lateralOffset };
  }
  const verticalSigma = DISK_THICKNESS_KILOPARSECS * (thick ? THICK_DISK_SIGMA_MULTIPLIER : 1);
  return { ...point, z: normalRandom(random, 0, verticalSigma), structure, ...(motion ? { motion } : {}) };
}

function weightedStarType(random: () => number, candidates: number[]): number {
  const total = candidates.reduce((sum, type) => sum + STAR_TYPE_PERCENTAGES[type]!, 0);
  let roll = random() * total;
  for (const type of candidates) {
    roll -= STAR_TYPE_PERCENTAGES[type]!;
    if (roll < 0) return type;
  }
  return candidates[candidates.length - 1]!;
}

function randomStarType(random: () => number, particle: GalaxyParticle): number {
  if (particle.structure.tracer === 'gasRich' && random() < 0.62) return weightedStarType(random, [4, 5]);
  const warmCoreProbability = clamp(0.78 * (1 - Math.hypot(particle.x, particle.y) / 5), 0, 0.78);
  if (random() < warmCoreProbability) return weightedStarType(random, [0, 1]);
  return weightedStarType(random, [0, 1, 2, 3, 4, 5]);
}

export function backgroundSceneSignature(scene: DeckBackgroundScene | undefined, size: DeckSize): string {
  if (!scene) return '';
  return [
    scene.type,
    scene.seed,
    scene.starCount,
    scene.rotationDegreesPerSecond,
    scene.coreColor,
    scene.armColor,
    scene.solColor,
    scene.backdropAssetId ?? '',
    JSON.stringify(scene.solarSystem ?? null),
    size.width,
    size.height,
  ].join('|');
}

function starMaterial(presentationScale: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      pointScale: { value: 1 },
      galaxyLayerOpacity: { value: 1 },
      fogColor: { value: new Color(CYBERHUD_FOG_COLOR) },
      fogDensity: { value: CYBERHUD_FOG_DENSITY / presentationScale },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    vertexShader: `
      attribute float pointSize;
      varying vec3 starColor;
      varying float fogDepth;
      uniform float pointScale;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float distanceToCamera = length(viewPosition.xyz);
        float worldSize = clamp(
          distanceToCamera / 250.0 * pointSize,
          ${(STAR_SIZE_MINIMUM).toFixed(2)} * ${presentationScale.toFixed(8)},
          ${(STAR_SIZE_MAXIMUM).toFixed(2)} * ${presentationScale.toFixed(8)}
        );
        gl_PointSize = max(
          ${STAR_RASTER_MINIMUM_PIXELS.toFixed(1)},
          worldSize * pointScale / max(1.0, -viewPosition.z)
        );
        starColor = color;
        fogDepth = -viewPosition.z;
      }
    `,
    fragmentShader: `
      varying vec3 starColor;
      varying float fogDepth;
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform float galaxyLayerOpacity;
      vec3 acesFilm(vec3 value) {
        return clamp((value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14), 0.0, 1.0);
      }
      void main() {
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float radius = length(point);
        if (radius >= 1.0) discard;
        float core = exp(-18.0 * radius * radius);
        float glow = exp(-3.75 * radius * radius) * (1.0 - smoothstep(0.72, 1.0, radius));
        float bloom = smoothstep(${BLOOM_THRESHOLD.toFixed(1)}, 1.0, core) * ${BLOOM_STRENGTH.toFixed(1)};
        vec3 exposed = starColor * (1.0 + bloom * (0.5 + ${BLOOM_RADIUS.toFixed(1)} * 0.25)) * ${TONE_MAPPING_EXPOSURE.toFixed(1)};
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
        gl_FragColor = vec4(mix(acesFilm(exposed), fogColor, fogFactor), glow * galaxyLayerOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
}

function hazeMaterial(presentationScale: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      pointScale: { value: 1 },
      galaxyLayerOpacity: { value: 1 },
      hazeDistanceScale: { value: CYBERHUD_HAZE_DISTANCE_SCALE * presentationScale },
      fogColor: { value: new Color(CYBERHUD_FOG_COLOR) },
      fogDensity: { value: CYBERHUD_FOG_DENSITY / presentationScale },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    vertexShader: `
      attribute float pointSize;
      attribute float particleOpacity;
      varying vec3 hazeColor;
      varying float hazeOpacity;
      varying float fogDepth;
      uniform float pointScale;
      uniform float hazeDistanceScale;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float distanceToCamera = length(viewPosition.xyz);
        float distanceRatio = clamp(distanceToCamera / hazeDistanceScale, 0.0, 1.0);
        gl_PointSize = min(128.0, pointSize * pointScale / max(1.0, -viewPosition.z));
        hazeColor = color;
        hazeOpacity = particleOpacity * mix(${HAZE_NEAR_OPACITY_RATIO.toFixed(1)}, 1.0, pow(distanceRatio, 1.35));
        fogDepth = -viewPosition.z;
      }
    `,
    fragmentShader: `
      varying vec3 hazeColor;
      varying float hazeOpacity;
      varying float fogDepth;
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform float galaxyLayerOpacity;
      vec3 acesFilm(vec3 value) {
        return clamp((value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14), 0.0, 1.0);
      }
      void main() {
        float radius = length(gl_PointCoord * 2.0 - 1.0);
        if (radius >= 1.0) discard;
        float alpha = exp(-5.5 * radius * radius) * (1.0 - smoothstep(0.82, 1.0, radius));
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
        gl_FragColor = vec4(mix(acesFilm(hazeColor * ${TONE_MAPPING_EXPOSURE.toFixed(1)}), fogColor, fogFactor), alpha * hazeOpacity * galaxyLayerOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
}

function solarOrbitDisplayRadius(body: SolarBodyModel): number {
  return body.parent === 'earth' ? 0.23 : 0.45 + Math.log1p(body.semiMajorAxis) * 1.15;
}

function solarBodyMinimumCameraDistance(key: SolarBodyKey, displayScale: number): number {
  if (key === 'sol') return (SOL_DISPLAY_RADIUS + 0.12) * displayScale;
  return ((SOLAR_BODIES.find((body) => body.key === key)?.displayRadius ?? 0.04) + 0.12) * displayScale;
}

function solarOrbitPosition(body: SolarBodyModel, angle: number, target: Vector3): Vector3 {
  const radius = solarOrbitDisplayRadius(body);
  const inclination = radians(body.orbitalInclinationDegrees);
  const ascendingNode = radians(body.longitudeAscendingNodeDegrees);
  const planeX = Math.cos(angle) * radius;
  const planeY = Math.sin(angle) * radius;
  const tiltedY = planeY * Math.cos(inclination);
  return target.set(
    planeX * Math.cos(ascendingNode) - tiltedY * Math.sin(ascendingNode),
    planeX * Math.sin(ascendingNode) + tiltedY * Math.cos(ascendingNode),
    planeY * Math.sin(inclination),
  );
}

function createSolarOrbit(body: SolarBodyModel, color: string): LineLoop {
  const positions = new Float32Array(96 * 3);
  const point = new Vector3();
  for (let index = 0; index < 96; index += 1) {
    solarOrbitPosition(body, index / 96 * Math.PI * 2, point);
    positions.set(point.toArray(), index * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const orbit = new LineLoop(geometry, new LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  }));
  orbit.name = `PrismDeck ${body.key} orbit`;
  orbit.renderOrder = -4;
  return orbit;
}

function solarPlanetMaterial(color: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      baseColor: { value: new Color(color) },
      surfaceMap: { value: null },
      hasSurfaceMap: { value: 0 },
      specularMap: { value: null },
      hasSpecularMap: { value: 0 },
      sunDirection: { value: new Vector3(0, 0, 1) },
    },
    vertexShader: `
      varying vec2 surfaceUv;
      varying vec3 surfaceNormal;
      varying vec3 surfaceViewPosition;
      varying vec3 viewSunDirection;
      uniform vec3 sunDirection;
      void main() {
        surfaceUv = uv;
        surfaceNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        surfaceViewPosition = viewPosition.xyz;
        viewSunDirection = normalize(mat3(modelViewMatrix) * sunDirection);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform sampler2D surfaceMap;
      uniform float hasSurfaceMap;
      uniform sampler2D specularMap;
      uniform float hasSpecularMap;
      varying vec2 surfaceUv;
      varying vec3 surfaceNormal;
      varying vec3 surfaceViewPosition;
      varying vec3 viewSunDirection;
      void main() {
        vec3 albedo = baseColor;
        if (hasSurfaceMap > 0.5) {
          albedo = sRGBTransferEOTF(texture2D(surfaceMap, surfaceUv)).rgb;
        }
        vec3 normal = normalize(surfaceNormal);
        vec3 sun = normalize(viewSunDirection);
        float facing = dot(normal, sun);
        float daylight = smoothstep(-0.08, 0.14, facing);
        float diffuse = max(0.0, facing);
        vec3 halfVector = normalize(sun + normalize(-surfaceViewPosition));
        float specularMask = hasSpecularMap > 0.5 ? texture2D(specularMap, surfaceUv).r : 0.0;
        float specular = pow(max(dot(normal, halfVector), 0.0), 28.0) * specularMask * diffuse * 0.58;
        vec3 outgoingLight = albedo * (0.045 + daylight * 0.18 + diffuse * 0.92) + vec3(specular);
        gl_FragColor = vec4(outgoingLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function solarCoreTexture(): DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const horizontal = (x + 0.5) / size * 2 - 1;
      const vertical = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(horizontal, vertical);
      const glow = Math.exp(-radius * radius * 7);
      const rays = Math.max(
        Math.exp(-(horizontal * horizontal / 0.003 + vertical * vertical / 0.65)),
        Math.exp(-(vertical * vertical / 0.003 + horizontal * horizontal / 0.65)),
      );
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 224;
      data[offset + 2] = 152;
      data[offset + 3] = Math.round(Math.min(1, glow + rays * 0.35) * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function solarCore(radius: number): { object: Group; texture: DataTexture } {
  const texture = solarCoreTexture();
  const object = new Group();
  object.name = 'PrismDeck Sol core';
  const corona = new Sprite(new SpriteMaterial({
    color: new Color(1.7, 1.3, 0.65),
    map: texture,
    transparent: true,
    opacity: 0.48,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  corona.name = 'PrismDeck Sol corona';
  corona.scale.setScalar(radius * 8);
  corona.renderOrder = -5;
  const core = new Sprite(new SpriteMaterial({
    color: new Color(2, 1.55, 0.75),
    map: texture,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  core.name = 'PrismDeck Sol core sprite';
  core.scale.setScalar(radius * 2);
  core.renderOrder = -4;
  object.add(corona, core);
  return { object, texture };
}

function earthCloudMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      cloudMap: { value: null },
      hasCloudMap: { value: 0 },
      sunDirection: { value: new Vector3(0, 0, 1) },
    },
    vertexShader: `
      varying vec2 cloudUv;
      varying vec3 cloudNormal;
      varying vec3 cloudViewPosition;
      varying vec3 viewSunDirection;
      uniform vec3 sunDirection;
      void main() {
        cloudUv = uv;
        cloudNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        cloudViewPosition = viewPosition.xyz;
        viewSunDirection = normalize(mat3(modelViewMatrix) * sunDirection);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudMap;
      uniform float hasCloudMap;
      varying vec2 cloudUv;
      varying vec3 cloudNormal;
      varying vec3 cloudViewPosition;
      varying vec3 viewSunDirection;
      void main() {
        float cloud = hasCloudMap > 0.5 ? texture2D(cloudMap, cloudUv).r : 0.0;
        if (cloud < 0.01) discard;
        vec3 normal = normalize(cloudNormal);
        float diffuse = max(dot(normal, normalize(viewSunDirection)), 0.0);
        float limb = pow(max(0.0, 1.0 - abs(dot(normal, normalize(-cloudViewPosition)))), 2.0);
        vec3 outgoingLight = vec3(0.34 + diffuse * 0.66 + limb * 0.12);
        gl_FragColor = vec4(outgoingLight, cloud * 0.72);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

interface SolarSystemRuntime {
  readonly object: Group;
  readonly bodies: ReadonlyMap<SolarBodyKey, Group>;
  focusPosition(key: SolarBodyKey, target: Vector3): Vector3;
  focusCameraOrientation(
    key: SolarBodyKey,
    azimuthDegrees: number,
    elevationDegrees: number,
    offset: Vector3,
    up: Vector3,
  ): void;
  centerSkyAt(cameraPosition: Vector3): void;
  setFocusBody(key: SolarBodyKey | undefined, progress?: number): void;
  setDetailVisible(visible: boolean): void;
  setTexture(key: GalaxySolarTextureKey, image: HTMLImageElement): void;
  update(elapsedSeconds: number): void;
  dispose(): void;
}

function createSolarSystem(scene: GalaxyBackgroundScene, x: number, y: number, displayScale: number): SolarSystemRuntime {
  const object = new Group();
  object.name = 'PrismDeck solar system';
  object.position.set(x, y, 0.2);
  const eclipticNode = new Vector3(
    Math.cos(radians(GALACTIC_ECLIPTIC_ASCENDING_NODE_DEGREES)),
    Math.sin(radians(GALACTIC_ECLIPTIC_ASCENDING_NODE_DEGREES)),
    0,
  );
  object.quaternion.setFromAxisAngle(eclipticNode, radians(GALACTIC_ECLIPTIC_INCLINATION_DEGREES));
  object.visible = false;

  const detail = new Group();
  detail.name = 'PrismDeck solar detail';
  detail.scale.setScalar(displayScale);
  object.add(detail);
  const orbitGroup = new Group();
  orbitGroup.name = 'PrismDeck solar orbits';
  detail.add(orbitGroup);
  const bodies = new Map<SolarBodyKey, Group>();
  const surfaces = new Map<SolarBodyKey, Mesh<SphereGeometry, MeshBasicMaterial | ShaderMaterial>>();
  const spins = new Map<SolarBodyKey, Group>();
  const textures = new Map<GalaxySolarTextureKey, Texture>();
  const point = new Vector3();
  const focusRight = new Vector3();
  const inverseSpin = new Quaternion();
  const inverseEclipticRotation = object.quaternion.clone().invert();
  const focusStartScales = new Map<SolarBodyKey, number>();
  let earthCloudShell: Mesh<SphereGeometry, ShaderMaterial> | undefined;
  let solCoreTexture: Texture | undefined;
  let focusTarget: SolarBodyKey | undefined;
  let hasFocusTarget = false;
  let lunaOrbit: LineLoop | undefined;
  let saturnRing: Mesh<RingGeometry, MeshBasicMaterial> | undefined;
  const skyGeometry = new SphereGeometry(SOLAR_SKY_SPHERE_RADIUS, 48, 24);
  skyGeometry.rotateX(Math.PI / 2);
  const skyMaterial = new MeshBasicMaterial({
    color: new Color(1.6, 1.6, 1.6),
    side: BackSide,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    toneMapped: false,
  });
  const skySphere = new Mesh(skyGeometry, skyMaterial);
  skySphere.name = 'PrismDeck solar sky sphere';
  skySphere.quaternion.copy(object.quaternion).invert();
  skySphere.renderOrder = -10;
  skySphere.frustumCulled = false;
  skySphere.visible = false;
  object.add(skySphere);

  const makeBody = (key: SolarBodyKey, color: string, radius: number, sun = false): Group => {
    const body = new Group();
    body.name = `PrismDeck solar body ${key}`;
    const spin = new Group();
    const geometry = new SphereGeometry(radius, 24, 16);
    geometry.rotateX(Math.PI / 2);
    const material = sun
      ? new MeshBasicMaterial({
        color: new Color(1.15, 0.9, 0.55),
        transparent: true,
        opacity: 0.82,
        depthWrite: true,
        toneMapped: false,
      })
      : solarPlanetMaterial(color);
    const surface = new Mesh(geometry, material);
    surface.name = `PrismDeck ${key} surface`;
    surface.renderOrder = -2;
    spin.add(surface);
    if (sun) {
      const core = solarCore(radius * 0.8);
      solCoreTexture = core.texture;
      spin.add(core.object);
    }
    if (key === 'earth') {
      const cloudGeometry = new SphereGeometry(radius * 1.012, 24, 16);
      cloudGeometry.rotateX(Math.PI / 2);
      earthCloudShell = new Mesh(cloudGeometry, earthCloudMaterial());
      earthCloudShell.name = 'PrismDeck Earth clouds';
      earthCloudShell.renderOrder = -1;
      spin.add(earthCloudShell);
    }
    body.add(spin);
    spins.set(key, spin);
    surfaces.set(key, surface);
    bodies.set(key, body);
    detail.add(body);
    return body;
  };

  makeBody('sol', scene.solColor, SOL_DISPLAY_RADIUS, true);
  for (const body of SOLAR_BODIES) {
    const bodyObject = makeBody(body.key, body.color, body.displayRadius);
    const orbit = createSolarOrbit(body, scene.armColor);
    if (body.parent === 'earth') {
      lunaOrbit = orbit;
      detail.add(orbit);
    } else {
      orbitGroup.add(orbit);
    }
    if (body.key === 'saturn') {
      const geometry = new RingGeometry(body.displayRadius * 1.3, body.displayRadius * 2.35, 128);
      const positions = geometry.getAttribute('position');
      const uvs = geometry.getAttribute('uv');
      for (let index = 0; index < positions.count; index += 1) {
        const radius = Math.hypot(positions.getX(index), positions.getY(index));
        uvs.setXY(index, (radius - body.displayRadius * 1.3) / (body.displayRadius * 1.05), 0.5);
      }
      uvs.needsUpdate = true;
      saturnRing = new Mesh(geometry, new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.86,
        alphaTest: 0.02,
        depthWrite: false,
        side: DoubleSide,
      }));
      saturnRing.name = 'PrismDeck Saturn rings';
      saturnRing.rotation.x = Math.PI / 2.7;
      bodyObject.add(saturnRing);
    }
  }

  const update = (elapsedSeconds: number): void => {
    const positions = new Map<SolarBodyKey, Vector3>();
    const simulatedDays = elapsedSeconds * SOLAR_SPIN_SIMULATION_HOURS_PER_SECOND / 24;
    for (const body of SOLAR_BODIES) {
      if (body.parent) continue;
      const angle = radians(body.fallbackPhaseDegrees) + simulatedDays / body.orbitalPeriodDays * Math.PI * 2;
      const position = solarOrbitPosition(body, angle, new Vector3());
      bodies.get(body.key)!.position.copy(position);
      positions.set(body.key, position);
    }
    const earth = positions.get('earth') ?? point.set(0, 0, 0);
    const luna = SOLAR_BODIES.find((body) => body.key === 'luna')!;
    const lunaAngle = radians(luna.fallbackPhaseDegrees) + simulatedDays / luna.orbitalPeriodDays * Math.PI * 2;
    const lunaPosition = solarOrbitPosition(luna, lunaAngle, new Vector3()).add(earth);
    bodies.get('luna')!.position.copy(lunaPosition);
    lunaOrbit?.position.copy(earth);
    for (const body of SOLAR_BODIES) {
      spins.get(body.key)!.rotation.z = elapsedSeconds * SOLAR_SPIN_SIMULATION_HOURS_PER_SECOND / body.siderealRotationHours * Math.PI * 2;
    }
    spins.get('sol')!.rotation.z = elapsedSeconds * SOLAR_SPIN_SIMULATION_HOURS_PER_SECOND / 609.12 * Math.PI * 2;
    for (const [key, surface] of surfaces) {
      if (!(surface.material instanceof ShaderMaterial)) continue;
      const body = bodies.get(key)!;
      const spin = spins.get(key)!;
      const sunDirection = surface.material.uniforms.sunDirection!.value as Vector3;
      sunDirection.copy(body.position).multiplyScalar(-1);
      inverseSpin.copy(spin.quaternion).invert();
      sunDirection.applyQuaternion(inverseSpin).normalize();
    }
    if (earthCloudShell) {
      const earthSpin = spins.get('earth')!;
      const sunDirection = earthCloudShell.material.uniforms.sunDirection!.value as Vector3;
      sunDirection.copy(bodies.get('earth')!.position).multiplyScalar(-1);
      inverseSpin.copy(earthSpin.quaternion).invert();
      sunDirection.applyQuaternion(inverseSpin).normalize();
    }
  };
  update(0);

  return {
    object,
    bodies,
    focusPosition(key, target) {
      target.copy(object.position);
      const body = bodies.get(key);
      if (body) target.add(point.copy(body.position).multiplyScalar(displayScale).applyQuaternion(object.quaternion));
      return target;
    },
    focusCameraOrientation(key, azimuthDegrees, elevationDegrees, offset, up) {
      const body = bodies.get(key);
      if (body && key !== 'sol') offset.copy(body.position).multiplyScalar(-displayScale);
      else offset.set(0, -1, 0);
      up.set(0, 0, 1).applyQuaternion(object.quaternion).normalize();
      offset.applyQuaternion(object.quaternion);
      offset.addScaledVector(up, -offset.dot(up)).normalize();
      offset.applyAxisAngle(up, radians(azimuthDegrees));
      const forward = point.copy(offset).multiplyScalar(-1);
      focusRight.crossVectors(forward, up).normalize();
      offset.applyAxisAngle(focusRight, radians(elevationDegrees)).normalize();
      up.applyAxisAngle(focusRight, radians(elevationDegrees)).normalize();
    },
    centerSkyAt(cameraPosition) {
      skySphere.position.copy(cameraPosition).sub(object.position).applyQuaternion(inverseEclipticRotation);
    },
    setFocusBody(key, progress = 1) {
      if (!hasFocusTarget || key !== focusTarget) {
        for (const [bodyKey, body] of bodies) focusStartScales.set(bodyKey, body.scale.x);
        focusTarget = key;
        hasFocusTarget = true;
      }
      for (const [bodyKey, body] of bodies) {
        const targetScale = bodyKey === 'sol'
          ? 1
          : bodyKey === key ? SOLAR_FOCUSED_BODY_SCALE : SOLAR_OVERVIEW_BODY_SCALE;
        const startScale = focusStartScales.get(bodyKey) ?? targetScale;
        const scale = startScale + (targetScale - startScale) * progress;
        body.scale.setScalar(scale);
      }
    },
    setDetailVisible(visible) {
      object.visible = visible;
      skySphere.visible = visible && Boolean(skyMaterial.map);
    },
    setTexture(key, image) {
      textures.get(key)?.dispose();
      const texture = new Texture(image);
      if (key !== 'earthClouds' && key !== 'earthSpecular' && key !== 'saturnRing') texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      textures.set(key, texture);
      if (key === 'stars') {
        skyMaterial.map = texture;
        skyMaterial.needsUpdate = true;
        skySphere.visible = object.visible;
        return;
      }
      if (key === 'saturnRing') {
        if (saturnRing) {
          saturnRing.material.map = texture;
          saturnRing.material.needsUpdate = true;
        }
        return;
      }
      if (key === 'earthClouds') {
        if (earthCloudShell) {
          earthCloudShell.material.uniforms.cloudMap!.value = texture;
          earthCloudShell.material.uniforms.hasCloudMap!.value = 1;
        }
        return;
      }
      if (key === 'earthSpecular') {
        const earthSurface = surfaces.get('earth');
        if (earthSurface?.material instanceof ShaderMaterial) {
          earthSurface.material.uniforms.specularMap!.value = texture;
          earthSurface.material.uniforms.hasSpecularMap!.value = 1;
        }
        return;
      }
      const surface = surfaces.get(key as SolarBodyKey);
      if (!surface) return;
      if (surface.material instanceof ShaderMaterial) {
        surface.material.uniforms.surfaceMap!.value = texture;
        surface.material.uniforms.hasSurfaceMap!.value = 1;
      } else {
        surface.material.map = texture;
        surface.material.color.set(0xffffff);
      }
      surface.material.needsUpdate = true;
    },
    update,
    dispose() {
      object.traverse((child) => {
        if (child instanceof Mesh || child instanceof LineLoop) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) material.dispose();
        } else if (child instanceof Sprite) {
          child.material.dispose();
        }
      });
      for (const texture of textures.values()) texture.dispose();
      textures.clear();
      solCoreTexture?.dispose();
      object.clear();
    },
  };
}

function createGalaxy(scene: GalaxyBackgroundScene, size: DeckSize): BackgroundSceneRuntime {
  const random = seededRandom(scene.seed);
  const hazeRandom = seededRandom(scene.seed ^ 0x9e3779b9);
  const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
  const galaxyRadius = Math.max(SLIDE_HEIGHT, slideWidth) * 0.68;
  const worldUnitsPerKiloparsec = galaxyRadius / DISK_RADIUS_KILOPARSECS;
  const presentationScale = worldUnitsPerKiloparsec / CYBERHUD_WORLD_UNITS_PER_KILOPARSEC;
  const centerX = slideWidth * 0.12;
  const writeWorldPosition = (
    target: Float32Array,
    index: number,
    point: GalacticPoint,
    z = 0,
  ): void => {
    const offset = index * 3;
    target[offset] = centerX + point.x * worldUnitsPerKiloparsec;
    target[offset + 1] = point.y * worldUnitsPerKiloparsec;
    target[offset + 2] = z * worldUnitsPerKiloparsec;
  };

  const particles: GalaxyParticle[] = [];
  const positions = new Float32Array(scene.starCount * 3);
  const colors = new Float32Array(scene.starCount * 3);
  const sizes = new Float32Array(scene.starCount);
  for (let index = 0; index < scene.starCount; index += 1) {
    const particle = galaxyParticle(random, false);
    particles.push(particle);
    writeWorldPosition(positions, index, particle, particle.z);
    const type = randomStarType(random, particle);
    const color = new Color(STAR_TYPE_COLORS[type]!);
    colors.set([color.r, color.g, color.b], index * 3);
    sizes[index] = STAR_TYPE_SIZES[type]!;
  }
  const starGeometry = new BufferGeometry();
  const starPositionAttribute = new BufferAttribute(positions, 3);
  starGeometry.setAttribute('position', starPositionAttribute);
  starGeometry.setAttribute('color', new BufferAttribute(colors, 3));
  starGeometry.setAttribute('pointSize', new BufferAttribute(sizes, 1));
  const stars = new Points(starGeometry, starMaterial(presentationScale));
  stars.name = 'PrismDeck galaxy stars';
  stars.frustumCulled = false;
  stars.renderOrder = -8;

  const hazeCount = Math.max(1, Math.floor(scene.starCount * HAZE_PARTICLE_RATIO));
  const hazePositions = new Float32Array(hazeCount * 3);
  const hazeColors = new Float32Array(hazeCount * 3);
  const hazeSizes = new Float32Array(hazeCount);
  const hazeOpacities = new Float32Array(hazeCount);
  const regularHazeColor = new Color(scene.armColor);
  const coreHazeColor = new Color(scene.coreColor);
  for (let index = 0; index < hazeCount; index += 1) {
    const particle = galaxyParticle(hazeRandom, true);
    writeWorldPosition(hazePositions, index, particle, particle.z);
    const isCore = particle.structure.kind === 'bar';
    const color = isCore ? coreHazeColor : regularHazeColor;
    hazeColors.set([color.r, color.g, color.b], index * 3);
    const localSize = Math.max(HAZE_MINIMUM_SIZE, HAZE_MAXIMUM_SIZE * hazeRandom());
    hazeSizes[index] = localSize * presentationScale * (isCore ? CORE_HAZE_SIZE_SCALE : 1);
    hazeOpacities[index] = isCore ? CORE_HAZE_OPACITY : HAZE_OPACITY;
  }
  const hazeGeometry = new BufferGeometry();
  hazeGeometry.setAttribute('position', new BufferAttribute(hazePositions, 3));
  hazeGeometry.setAttribute('color', new BufferAttribute(hazeColors, 3));
  hazeGeometry.setAttribute('pointSize', new BufferAttribute(hazeSizes, 1));
  hazeGeometry.setAttribute('particleOpacity', new BufferAttribute(hazeOpacities, 1));
  const haze = new Points(hazeGeometry, hazeMaterial(presentationScale));
  haze.name = 'PrismDeck galaxy haze';
  haze.frustumCulled = false;
  haze.renderOrder = -9;

  const backdropWorldSize = CYBERHUD_BACKDROP_WORLD_SIZE * presentationScale;
  const backdropGeometry = new PlaneGeometry(backdropWorldSize, backdropWorldSize);
  const backdropMaterial = new MeshBasicMaterial({
    color: new Color(TONE_MAPPING_EXPOSURE, TONE_MAPPING_EXPOSURE, TONE_MAPPING_EXPOSURE),
    transparent: true,
    opacity: BACKDROP_OPACITY,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
  });
  const backdrop = new Mesh(backdropGeometry, backdropMaterial);
  backdrop.name = 'PrismDeck galaxy backdrop';
  backdrop.position.set(centerX, 0, -0.4);
  backdrop.renderOrder = -10;
  backdrop.visible = false;
  let backdropTexture: Texture | undefined;

  const solOrbitRadius = SUN_RADIUS_KILOPARSECS * worldUnitsPerKiloparsec;
  const orbitPositions = new Float32Array(192 * 3);
  for (let index = 0; index < 192; index += 1) {
    const angle = index / 192 * Math.PI * 2;
    orbitPositions.set([centerX + Math.cos(angle) * solOrbitRadius, Math.sin(angle) * solOrbitRadius, 0.14], index * 3);
  }
  const orbitGeometry = new BufferGeometry();
  orbitGeometry.setAttribute('position', new BufferAttribute(orbitPositions, 3));
  const orbitMaterial = new LineDashedMaterial({
    color: scene.solColor,
    transparent: true,
    opacity: 0.34,
    dashSize: 0.1,
    gapSize: 0.075,
    depthWrite: false,
  });
  const orbit = new LineLoop(orbitGeometry, orbitMaterial);
  orbit.computeLineDistances();
  orbit.name = 'PrismDeck Sol galactic orbit';
  orbit.renderOrder = -7;

  const solGeometry = new PlaneGeometry(0.92, 0.92);
  const solMaterial = new ShaderMaterial({
    uniforms: { solColor: { value: new Color(scene.solColor) } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `
      varying vec2 solUv;
      void main() {
        solUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 solColor;
      varying vec2 solUv;
      void main() {
        float radius = length(solUv);
        if (radius >= 1.0) discard;
        float core = exp(-24.0 * radius * radius);
        float corona = exp(-4.2 * radius * radius) * (1.0 - smoothstep(0.72, 1.0, radius));
        float horizontal = exp(-85.0 * abs(solUv.y)) * (1.0 - smoothstep(0.25, 1.0, abs(solUv.x)));
        float vertical = exp(-85.0 * abs(solUv.x)) * (1.0 - smoothstep(0.18, 0.82, abs(solUv.y)));
        float spike = max(horizontal, vertical) * 0.55;
        gl_FragColor = vec4(solColor * (0.72 + core * 2.2 + spike), max(core, max(corona * 0.7, spike)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sol = new Mesh(solGeometry, solMaterial);
  sol.name = 'PrismDeck Sol';
  sol.position.set(centerX, -solOrbitRadius, 0.2);
  sol.renderOrder = -6;
  const solarSystem = scene.solarSystem ? createSolarSystem(scene, centerX, -solOrbitRadius, presentationScale) : undefined;
  const solarDetailCameraDistance = SOLAR_DETAIL_CAMERA_DISTANCE * presentationScale;

  const object = new Group();
  object.name = 'PrismDeck CyberHUD galaxy background';
  object.add(backdrop, haze, stars, orbit, sol);
  if (solarSystem) object.add(solarSystem.object);
  const flowPoint: GalacticPoint = { x: 0, y: 0 };
  const beforeFlowPoint: GalacticPoint = { x: 0, y: 0 };
  const afterFlowPoint: GalacticPoint = { x: 0, y: 0 };
  const cameraTarget = new Vector3();
  const startCameraTarget = new Vector3();
  const targetCameraTarget = new Vector3();
  const targetCameraOffset = new Vector3();
  const transformedCameraTarget = new Vector3();
  const cameraRotation = new Quaternion();
  const startCameraRotation = new Quaternion();
  const targetCameraRotation = new Quaternion();
  const cameraBasis = new Matrix4();
  const cameraOffset = new Vector3();
  const cameraUp = new Vector3();
  const cameraRight = new Vector3();
  const cameraTrueUp = new Vector3();
  const backgroundCameraPosition = new Vector3();
  const inverseCameraRotation = new Quaternion();
  const tiltRotation = new Quaternion().setFromEuler(new Euler(-Math.PI / 4, 0, radians(-5)));
  let renderCameraDistance = 15;
  let renderEyeOffsetX = 0;
  let cameraDistance = renderCameraDistance + 3.2;
  let startCameraDistance = cameraDistance;
  let targetCameraDistance = cameraDistance;
  let cameraDistanceIsExplicit = false;
  let targetCameraDistanceIsExplicit = false;
  let targetCameraView: BackgroundCamera['view'] = 'top';
  let targetOrbitAzimuthDegrees = 0;
  let targetOrbitElevationDegrees = 0;
  let galaxyLayerOpacity = 1;
  let startGalaxyLayerOpacity = 1;
  let targetGalaxyLayerOpacity = 1;
  let cameraFocusBody: SolarBodyKey | undefined;
  let targetCameraFocusBody: SolarBodyKey | undefined;
  let cameraTransitionDuration = 0;
  let cameraTransitionStartedAt: number | undefined;
  let focusScaleProgress = 1;
  let lastFlowUnits: number | undefined;
  let lastParticleFlowUpdate: number | undefined;
  const resolveTargetCamera = (): void => {
    if (targetCameraFocusBody && solarSystem) {
      solarSystem.focusPosition(targetCameraFocusBody, targetCameraTarget).add(targetCameraOffset);
    } else {
      targetCameraTarget.copy(targetCameraOffset);
    }
    if (targetCameraView === 'tilt') {
      targetCameraRotation.copy(tiltRotation);
    } else if (targetCameraView === 'horizon' && targetCameraFocusBody && solarSystem) {
      solarSystem.focusCameraOrientation(
        targetCameraFocusBody,
        targetOrbitAzimuthDegrees,
        targetOrbitElevationDegrees,
        cameraOffset,
        cameraUp,
      );
      cameraRight.crossVectors(cameraUp, cameraOffset).normalize();
      cameraTrueUp.crossVectors(cameraOffset, cameraRight).normalize();
      cameraBasis.makeBasis(cameraRight, cameraTrueUp, cameraOffset);
      targetCameraRotation.setFromRotationMatrix(cameraBasis).invert();
    } else {
      targetCameraRotation.identity();
    }
  };
  const applyGalaxyLayerOpacity = (): void => {
    stars.material.uniforms.galaxyLayerOpacity!.value = galaxyLayerOpacity;
    haze.material.uniforms.galaxyLayerOpacity!.value = galaxyLayerOpacity;
    backdropMaterial.opacity = BACKDROP_OPACITY * galaxyLayerOpacity;
    orbitMaterial.opacity = 0.34 * galaxyLayerOpacity;
    backdrop.visible = Boolean(backdropTexture && galaxyLayerOpacity > 0.001);
    orbit.visible = galaxyLayerOpacity > 0.001 && !solarSystem?.object.visible;
  };
  const centerSkyAtRenderEye = (): void => {
    inverseCameraRotation.copy(cameraRotation).invert();
    backgroundCameraPosition
      .set(renderEyeOffsetX, 0, renderCameraDistance)
      .sub(object.position)
      .applyQuaternion(inverseCameraRotation);
    solarSystem?.centerSkyAt(backgroundCameraPosition);
  };
  const applyCamera = (focusProgress = 1): void => {
    object.quaternion.copy(cameraRotation);
    transformedCameraTarget.copy(cameraTarget).applyQuaternion(cameraRotation);
    object.position.set(
      -transformedCameraTarget.x,
      -transformedCameraTarget.y,
      renderCameraDistance - cameraDistance - transformedCameraTarget.z,
    );
    centerSkyAtRenderEye();
    const showsSolarDetail = Boolean(solarSystem && (cameraFocusBody || targetCameraFocusBody || cameraDistance <= solarDetailCameraDistance));
    solarSystem?.setFocusBody(targetCameraFocusBody, focusProgress);
    solarSystem?.setDetailVisible(showsSolarDetail);
    sol.visible = !showsSolarDetail;
    applyGalaxyLayerOpacity();
  };
  applyCamera();

  return {
    object,
    setBackdrop(image) {
      backdropTexture?.dispose();
      backdropTexture = new Texture(image);
      backdropTexture.colorSpace = SRGBColorSpace;
      backdropTexture.needsUpdate = true;
      backdropMaterial.map = backdropTexture;
      backdropMaterial.needsUpdate = true;
      backdrop.visible = galaxyLayerOpacity > 0.001;
    },
    setSolarTexture(key, image) {
      solarSystem?.setTexture(key, image);
    },
    setCamera(camera, durationSeconds) {
      startCameraTarget.copy(cameraTarget);
      startCameraDistance = cameraDistance;
      startCameraRotation.copy(cameraRotation);
      startGalaxyLayerOpacity = galaxyLayerOpacity;
      targetCameraFocusBody = camera?.focusBody;
      targetCameraOffset.set(camera?.x ?? 0, camera?.y ?? 0, targetCameraFocusBody ? camera?.z ?? 0 : 0);
      targetCameraView = camera?.view ?? 'top';
      targetOrbitAzimuthDegrees = camera?.orbitAzimuthDegrees ?? 0;
      targetOrbitElevationDegrees = camera?.orbitElevationDegrees ?? 0;
      resolveTargetCamera();
      targetCameraDistanceIsExplicit = camera?.distance !== undefined || targetCameraFocusBody !== undefined;
      targetCameraDistance = camera?.distance ?? (targetCameraFocusBody ? 4 : renderCameraDistance + 3.2 + (camera?.z ?? 0));
      if (targetCameraFocusBody) {
        targetCameraDistance = Math.max(targetCameraDistance, solarBodyMinimumCameraDistance(targetCameraFocusBody, presentationScale));
      }
      targetGalaxyLayerOpacity = solarSystem && targetCameraFocusBody ? 0 : 1;
      cameraTransitionDuration = Math.max(0, durationSeconds);
      cameraTransitionStartedAt = undefined;
      focusScaleProgress = cameraTransitionDuration > 0 ? 0 : 1;
      if (cameraTransitionDuration === 0) {
        cameraTarget.copy(targetCameraTarget);
        cameraDistance = targetCameraDistance;
        cameraDistanceIsExplicit = targetCameraDistanceIsExplicit;
        cameraRotation.copy(targetCameraRotation);
        galaxyLayerOpacity = targetGalaxyLayerOpacity;
        cameraFocusBody = targetCameraFocusBody;
        applyCamera();
      }
    },
    setRenderCamera(pointScale, distance) {
      const safePointScale = Math.max(1, pointScale);
      stars.material.uniforms.pointScale!.value = safePointScale;
      haze.material.uniforms.pointScale!.value = safePointScale;
      const safeDistance = Math.max(0.1, distance);
      const distanceChange = safeDistance - renderCameraDistance;
      if (!cameraDistanceIsExplicit) cameraDistance += distanceChange;
      if (!targetCameraDistanceIsExplicit) targetCameraDistance += distanceChange;
      renderCameraDistance = safeDistance;
      applyCamera(focusScaleProgress);
    },
    stereoSceneDistance() {
      return Math.max(0.001, cameraDistance);
    },
    setRenderEyeOffset(offsetX) {
      renderEyeOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
      centerSkyAtRenderEye();
    },
    update(elapsedSeconds) {
      solarSystem?.update(elapsedSeconds);
      if (targetCameraFocusBody) resolveTargetCamera();
      const flowUnits = -elapsedSeconds * scene.rotationDegreesPerSecond;
      const updatesParticleFlow = flowUnits !== lastFlowUnits && (
        lastParticleFlowUpdate === undefined ||
        elapsedSeconds < lastParticleFlowUpdate ||
        elapsedSeconds - lastParticleFlowUpdate >= 1 / 30
      );
      if (updatesParticleFlow) {
        lastFlowUnits = flowUnits;
        lastParticleFlowUpdate = elapsedSeconds;
        const armFractionOffset = flowUnits * ARM_FRACTION_PER_FLOW_UNIT;
        const diskPhaseOffset = flowUnits * DISK_PHASE_PER_FLOW_UNIT;
        const diskClockwiseRadians = radians(flowUnits * DISK_CLOCKWISE_DEGREES_PER_FLOW_UNIT);
        for (let index = 0; index < particles.length; index += 1) {
          const particle = particles[index]!;
          if (!particle.motion) continue;
          if (particle.motion.kind === 'arm') {
            armPositionAtFraction(
              particle.motion.structure,
              positiveModulo(particle.motion.fraction - armFractionOffset, 1),
              particle.motion.lateralOffsetKiloparsecs,
              flowPoint,
              beforeFlowPoint,
              afterFlowPoint,
            );
          } else {
            const radius = particle.motion.thick
              ? particle.motion.radiusKiloparsecs
              : diskFlowRadiusForPhase(positiveModulo(particle.motion.flowPhase - diskPhaseOffset, 1));
            const angle = particle.motion.angleRadians - diskClockwiseRadians;
            flowPoint.x = radius * Math.cos(angle);
            flowPoint.y = radius * Math.sin(angle);
          }
          writeWorldPosition(positions, index, flowPoint, particle.z);
        }
        starPositionAttribute.needsUpdate = true;
      }
      if (cameraTransitionDuration > 0) {
        cameraTransitionStartedAt ??= elapsedSeconds;
        const progress = clamp((elapsedSeconds - cameraTransitionStartedAt) / cameraTransitionDuration, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        focusScaleProgress = eased;
        cameraTarget.lerpVectors(startCameraTarget, targetCameraTarget, eased);
        cameraDistance = startCameraDistance + (targetCameraDistance - startCameraDistance) * eased;
        cameraRotation.slerpQuaternions(startCameraRotation, targetCameraRotation, eased);
        galaxyLayerOpacity = startGalaxyLayerOpacity + (targetGalaxyLayerOpacity - startGalaxyLayerOpacity) * eased;
        if (progress === 1) {
          cameraTransitionDuration = 0;
          cameraDistanceIsExplicit = targetCameraDistanceIsExplicit;
          cameraFocusBody = targetCameraFocusBody;
        }
        applyCamera(eased);
      } else if (cameraFocusBody && solarSystem) {
        solarSystem.focusPosition(cameraFocusBody, cameraTarget).add(targetCameraOffset);
        cameraRotation.copy(targetCameraRotation);
        applyCamera();
      }
    },
    dispose() {
      object.remove(backdrop, haze, stars, orbit, sol);
      if (solarSystem) {
        object.remove(solarSystem.object);
        solarSystem.dispose();
      }
      backdropTexture?.dispose();
      backdropGeometry.dispose();
      backdropMaterial.dispose();
      hazeGeometry.dispose();
      haze.material.dispose();
      starGeometry.dispose();
      stars.material.dispose();
      orbitGeometry.dispose();
      orbitMaterial.dispose();
      solGeometry.dispose();
      solMaterial.dispose();
    },
  };
}

export function createBackgroundScene(scene: DeckBackgroundScene, size: DeckSize): BackgroundSceneRuntime {
  return createGalaxy(scene, size);
}
