import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import {
  configureStereoCameraRig,
  logarithmicStereoEyeSeparationRatio,
  OUTPUT_PRESETS,
  pinholeScale,
  projectPinholePoint,
  scaledStereoEyeSeparationRatio,
} from '../src/index';
import { outputViewport } from '../src/render/renderer';

describe('stereo camera rig', () => {
  test('uses pinhole scale and bounded depth calibration', () => {
    expect(pinholeScale(36, 4)).toBeCloseTo(0.9);
    expect(projectPinholePoint({ x: 10, y: 6 }, { x: 2, y: 2 }, 36, 4)).toEqual({ x: 9.2, y: 5.6, scale: 0.9 });
    expect(scaledStereoEyeSeparationRatio(0.04, 0)).toBe(0);
    expect(scaledStereoEyeSeparationRatio(0.04, 1)).toBe(0.04);
    expect(scaledStereoEyeSeparationRatio(0.04, 1.5)).toBe(0.06);
    expect(logarithmicStereoEyeSeparationRatio(0.16, 0.16, 100, 0.024, 0.04)).toBeCloseTo(0.024);
    expect(logarithmicStereoEyeSeparationRatio(100, 0.16, 100, 0.024, 0.04)).toBeCloseTo(0.04);
    expect(logarithmicStereoEyeSeparationRatio(0.68, 0.16, 100, 0.024, 0.04)).toBeLessThan(0.03);
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

  test('uses the focused background distance without moving the slide rig', () => {
    const left = new PerspectiveCamera();
    const right = new PerspectiveCamera();
    const sceneDistance = 0.68;
    const ratio = logarithmicStereoEyeSeparationRatio(sceneDistance, 0.16, 100, 0.024, 0.04);
    configureStereoCameraRig(left, right, {
      fovDegrees: 40,
      near: 0.1,
      far: 200,
      distance: 15,
      convergenceDistance: sceneDistance,
      eyeSeparation: sceneDistance * ratio,
      aspect: 16 / 9,
    });

    const target = new Vector3(0, 0, 15 - sceneDistance);
    expect(target.clone().project(left).x).toBeCloseTo(0, 8);
    expect(target.clone().project(right).x).toBeCloseTo(0, 8);
    expect(right.position.x - left.position.x).toBeLessThan(0.021);
  });

  test('declares exact full and half SBS output geometry', () => {
    expect(OUTPUT_PRESETS['full-sbs']).toMatchObject({ width: 3840, height: 1080, eyeWidth: 1920 });
    expect(OUTPUT_PRESETS['half-sbs']).toMatchObject({ width: 1920, height: 1080, eyeWidth: 960 });
    expect(OUTPUT_PRESETS['half-sbs'].logicalEyeAspect).toBe(16 / 9);
  });

  test('previews full SBS at its native 32:9 aspect while half SBS fills 16:9', () => {
    expect(outputViewport('full-sbs', 1600, 900)).toEqual({ x: 0, y: 225, width: 1600, height: 450 });
    expect(outputViewport('full-sbs', 3840, 1080)).toEqual({ x: 0, y: 0, width: 3840, height: 1080 });
    expect(outputViewport('half-sbs', 1600, 900)).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
  });
});
