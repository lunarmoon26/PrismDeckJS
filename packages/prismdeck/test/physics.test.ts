import { describe, expect, test } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  DeckPhysics,
  type DeckSlide,
} from '../src/index';

const slide: DeckSlide = {
  id: 'slide',
  name: 'Physics',
  durationMs: 5_000,
  background: '#FFFFFF',
  elements: [
    {
      id: 'dynamic-title',
      type: 'text',
      name: 'Dynamic title',
      frame: { x: 0.25, y: 0.1, width: 0.5, height: 0.2 },
      transform: { ...DEFAULT_TRANSFORM },
      opacity: 1,
      visible: true,
      renderOrder: 1,
      text: 'Drop',
      style: { ...DEFAULT_TEXT_STYLE },
      physics: { body: 'dynamic', shape: 'cuboid', density: 1, restitution: 0.2, friction: 0.5 },
    },
  ],
};

const bouncingSlide: DeckSlide = {
  ...slide,
  id: 'bouncing-slide',
  elements: [
    {
      id: 'ground',
      type: 'shape',
      name: 'Ground',
      frame: { x: 0.3, y: 0.755, width: 0.4, height: 0.035 },
      transform: { ...DEFAULT_TRANSFORM, z: 0.06 },
      opacity: 1,
      visible: true,
      renderOrder: 0,
      thickness: 0.1,
      shape: 'rectangle',
      fill: '#333333',
      stroke: '#FFFFFF',
      strokeWidth: 1,
      physics: { body: 'fixed', shape: 'cuboid', density: 1, restitution: 0.72, friction: 0.7 },
    },
    {
      id: 'ball',
      type: 'shape',
      name: 'Ball',
      frame: { x: 0.45, y: 0.22, width: 0.1, height: 0.178 },
      transform: { ...DEFAULT_TRANSFORM, z: 0.06 },
      opacity: 1,
      visible: true,
      renderOrder: 1,
      thickness: 0.18,
      shape: 'ellipse',
      fill: '#00FFFF',
      stroke: '#FFFFFF',
      strokeWidth: 1,
      physics: { body: 'dynamic', shape: 'ball', density: 1, restitution: 0.82, friction: 0.25 },
    },
  ],
};

describe('DeckPhysics', () => {
  test('rejects a non-positive fixed step', async () => {
    await expect(DeckPhysics.create({ fixedStepSeconds: 0 })).rejects.toThrow('fixedStepSeconds');
  });

  test('advances one fixed world and returns element transforms', async () => {
    const physics = await DeckPhysics.create();
    physics.setSlide(slide, { width: 960, height: 540 });
    const initialY = physics.transforms().get('dynamic-title')!.position.y;
    for (let index = 0; index < 10; index += 1) physics.step(1 / 60);
    expect(physics.transforms().get('dynamic-title')!.position.y).toBeLessThan(initialY);
    physics.dispose();
  });

  test('keeps a dynamic ball on a coplanar fixed ground and lets it bounce', async () => {
    const physics = await DeckPhysics.create();
    physics.setSlide(bouncingSlide, { width: 1600, height: 900 });
    const positions: number[] = [];
    for (let index = 0; index < 240; index += 1) {
      physics.step(1 / 60);
      positions.push(physics.transforms().get('ball')!.position.y);
    }

    expect(Math.min(...positions)).toBeGreaterThan(-2);
    expect(positions.some((position, index) => index > 50 && position > positions[index - 1]! + 0.001)).toBe(true);
    physics.dispose();
  });
});
