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
});
