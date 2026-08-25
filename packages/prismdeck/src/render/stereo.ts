import { PerspectiveCamera } from 'three';

export type OutputMode = 'mono' | 'full-sbs' | 'half-sbs';

export interface OutputPreset {
  width: number;
  height: number;
  eyeWidth: number;
  logicalEyeAspect: number;
}

export const OUTPUT_PRESETS: Readonly<Record<OutputMode, OutputPreset>> = Object.freeze({
  mono: { width: 1920, height: 1080, eyeWidth: 1920, logicalEyeAspect: 16 / 9 },
  'full-sbs': { width: 3840, height: 1080, eyeWidth: 1920, logicalEyeAspect: 16 / 9 },
  'half-sbs': { width: 1920, height: 1080, eyeWidth: 960, logicalEyeAspect: 16 / 9 },
});

export interface StereoCameraRigOptions {
  fovDegrees: number;
  near: number;
  far: number;
  distance: number;
  convergenceDistance: number;
  eyeSeparation: number;
  aspect?: number;
}

export const DEFAULT_STEREO_EYE_SEPARATION_RATIO = 0.04;
export const MAX_STEREO_EYE_SEPARATION_RATIO = 0.06;

export function pinholeScale(focalDistance: number, depthBehindPlane: number): number {
  if (!Number.isFinite(focalDistance) || focalDistance <= 0) throw new RangeError('focalDistance must be positive');
  if (!Number.isFinite(depthBehindPlane) || focalDistance + depthBehindPlane <= 0) {
    throw new RangeError('depth must remain behind the pinhole');
  }
  return focalDistance / (focalDistance + depthBehindPlane);
}

export function projectPinholePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  focalDistance: number,
  depthBehindPlane: number,
): { x: number; y: number; scale: number } {
  const scale = pinholeScale(focalDistance, depthBehindPlane);
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
    scale,
  };
}

export function scaledStereoEyeSeparationRatio(baseRatio: number, depthScale = 1): number {
  if (!Number.isFinite(baseRatio) || baseRatio < 0) throw new RangeError('baseRatio must not be negative');
  const normalizedScale = Math.max(0, Math.min(1.5, Number.isFinite(depthScale) ? depthScale : 1));
  return Math.min(MAX_STEREO_EYE_SEPARATION_RATIO, baseRatio * normalizedScale);
}

export function logarithmicStereoEyeSeparationRatio(
  sceneDistance: number,
  minimumSceneDistance: number,
  maximumSceneDistance: number,
  minimumRatio: number,
  maximumRatio: number,
  depthScale = 1,
): number {
  if (!Number.isFinite(sceneDistance) || sceneDistance <= 0) throw new RangeError('sceneDistance must be positive');
  if (!Number.isFinite(minimumSceneDistance) || minimumSceneDistance <= 0) {
    throw new RangeError('minimumSceneDistance must be positive');
  }
  if (!Number.isFinite(maximumSceneDistance) || maximumSceneDistance < minimumSceneDistance) {
    throw new RangeError('maximumSceneDistance must not be less than minimumSceneDistance');
  }
  if (!Number.isFinite(minimumRatio) || minimumRatio < 0 || !Number.isFinite(maximumRatio) || maximumRatio < minimumRatio) {
    throw new RangeError('stereo ratios must be finite and increasing');
  }
  const distance = Math.max(minimumSceneDistance, Math.min(maximumSceneDistance, sceneDistance));
  const range = Math.log(maximumSceneDistance / minimumSceneDistance);
  const progress = range === 0 ? 0 : Math.log(distance / minimumSceneDistance) / range;
  return scaledStereoEyeSeparationRatio(minimumRatio + (maximumRatio - minimumRatio) * progress, depthScale);
}

function configureEye(
  camera: PerspectiveCamera,
  eyeOffset: number,
  options: StereoCameraRigOptions,
): void {
  const aspect = options.aspect ?? 16 / 9;
  const top = options.near * Math.tan((options.fovDegrees * Math.PI) / 360);
  const right = top * aspect;
  const shift = (-eyeOffset * options.near) / Math.max(options.near, options.convergenceDistance);
  camera.fov = options.fovDegrees;
  camera.near = options.near;
  camera.far = options.far;
  camera.aspect = aspect;
  camera.position.set(eyeOffset, 0, options.distance);
  camera.quaternion.identity();
  camera.projectionMatrix.makePerspective(
    -right + shift,
    right + shift,
    top,
    -top,
    options.near,
    options.far,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld(true);
}

export function configureStereoCameraRig(
  left: PerspectiveCamera,
  right: PerspectiveCamera,
  options: StereoCameraRigOptions,
): void {
  configureEye(left, -options.eyeSeparation / 2, options);
  configureEye(right, options.eyeSeparation / 2, options);
}
