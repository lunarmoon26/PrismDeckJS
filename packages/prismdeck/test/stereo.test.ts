import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { configureStereoCameraRig, OUTPUT_PRESETS } from '../src/index';

describe('stereo camera rig', () => {
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
