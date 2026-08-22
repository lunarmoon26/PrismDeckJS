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
