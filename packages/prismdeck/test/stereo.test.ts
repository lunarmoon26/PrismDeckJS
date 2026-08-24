import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import {
  configureStereoCameraRig,
  OUTPUT_PRESETS,
  pinholeScale,
  projectPinholePoint,
  scaledStereoEyeSeparationRatio,
} from '../src/index';

describe('stereo camera rig', () => {
  test('uses pinhole scale and bounded depth calibration', () => {
    expect(pinholeScale(36, 4)).toBeCloseTo(0.9);
    expect(projectPinholePoint({ x: 10, y: 6 }, { x: 2, y: 2 }, 36, 4)).toEqual({ x: 9.2, y: 5.6, scale: 0.9 });
    expect(scaledStereoEyeSeparationRatio(0.04, 0)).toBe(0);
    expect(scaledStereoEyeSeparationRatio(0.04, 1)).toBe(0.04);
    expect(scaledStereoEyeSeparationRatio(0.04, 1.5)).toBe(0.06);
  });

  test('keeps the convergence plane centered for both parallel cameras', () => {
    const left = new PerspectiveCamera();
    const right = new PerspectiveCamera();
    configureStereoCameraRig(left, right, {
      fovDegrees: 40,
      near: 0.1,
      far: 100,
      distance: 12,
      convergenceDistance: 12,
      eyeSeparation: 0.2,
      aspect: 16 / 9,
    });

    expect(new Vector3(0, 0, 0).project(left).x).toBeCloseTo(0, 8);
    expect(new Vector3(0, 0, 0).project(right).x).toBeCloseTo(0, 8);
    expect(left.position.x).toBeCloseTo(-0.1);
    expect(right.position.x).toBeCloseTo(0.1);
  });

  test('declares exact full and half SBS output geometry', () => {
    expect(OUTPUT_PRESETS['full-sbs']).toMatchObject({ width: 3840, height: 1080, eyeWidth: 1920 });
    expect(OUTPUT_PRESETS['half-sbs']).toMatchObject({ width: 1920, height: 1080, eyeWidth: 960 });
    expect(OUTPUT_PRESETS['half-sbs'].logicalEyeAspect).toBe(16 / 9);
  });
});
