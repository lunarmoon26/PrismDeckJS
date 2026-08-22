// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  PRISMDECK_SCHEMA_VERSION,
  PresentationSession,
  type LoadedDeck,
} from '../src/index';

function templateDeck(): LoadedDeck {
  return {
    document: {
      schemaVersion: PRISMDECK_SCHEMA_VERSION,
      id: 'deck',
      kind: 'template',
      metadata: { title: 'Template' },
      size: { width: 960, height: 540 },
      layouts: [
        {
          id: 'layout-title',
          name: 'Title',
          elements: [
            {
              id: 'layout-title-element',
              type: 'text',
              name: 'Title',
              frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
              transform: { ...DEFAULT_TRANSFORM },
              opacity: 1,
              visible: true,
              renderOrder: 0,
              text: 'Title',
              style: { ...DEFAULT_TEXT_STYLE },
              placeholder: { type: 'title' },
            },
          ],
        },
      ],
      slides: [],
    },
    assets: new Map(),
  };
}

describe('PresentationSession', () => {
  test('creates independent slides from imported layouts and edits depth', () => {
    const session = new PresentationSession(templateDeck());
    const first = session.createSlide('layout-title', { name: 'First' });
    const second = session.createSlide('layout-title', { name: 'Second' });

    expect(session.document.kind).toBe('presentation');
    expect(session.document.slides).toHaveLength(2);
    expect(first.elements[0]?.id).not.toBe(second.elements[0]?.id);
    expect(first.elements[0]?.id).not.toBe('layout-title-element');

    expect(session.updateElementTransform(first.elements[0]!.id, { z: 0.25, rotationY: 15 })).toBe(true);
    expect(first.elements[0]?.transform).toMatchObject({ z: 0.25, rotationY: 15 });
  });

  test('navigates and advances timed playback without duplicate state', () => {
    const session = new PresentationSession(templateDeck());
    session.createSlide('layout-title', { durationMs: 100 });
    session.createSlide('layout-title', { durationMs: 100 });
    const listener = vi.fn();
    session.addEventListener('change', listener);

    session.goTo(0);
    session.play(1_000);
    expect(session.tick(1_150)).toBe(true);
    expect(session.currentSlideIndex).toBe(1);
    expect(listener).toHaveBeenCalled();
  });

  test('bounds looping playback when every slide has zero duration', () => {
    const session = new PresentationSession(templateDeck(), { loop: true });
    session.createSlide('layout-title', { durationMs: 0 });
    session.play(1_000);
    expect(session.tick(1_000)).toBe(true);
    expect(session.isPlaying).toBe(false);
  });
});
