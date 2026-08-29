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
    const first = session.createSlide('layout-title', { name: 'First', background: '#123456' });
    const second = session.createSlide('layout-title', { name: 'Second' });

    expect(session.document.kind).toBe('presentation');
    expect(session.document.slides).toHaveLength(2);
    expect(first.elements[0]?.id).not.toBe(second.elements[0]?.id);
    expect(first.elements[0]?.id).not.toBe('layout-title-element');
    expect(second.background).toBe('#123456');

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

  test('retains legacy zero-duration auto-navigation when a timeline has no click groups', () => {
    const session = new PresentationSession(templateDeck());
    const first = session.createSlide('layout-title', { durationMs: 0 });
    session.createSlide('layout-title', { durationMs: 100 });
    first.timeline = {
      clips: [{
        id: 'enter-title', targetId: first.elements[0]!.id, kind: 'entrance', effect: 'fade', trigger: 'on-enter',
        delayMs: 0, durationMs: 100, easing: 'linear', repeat: 1, fill: 'hold',
      }],
    };

    session.play(1_000);
    expect(session.tick(1_000)).toBe(true);
    expect(session.currentSlideIndex).toBe(1);
  });

  test('seeks and pauses one timeline clock while advance reveals click groups before navigating', () => {
    const session = new PresentationSession(templateDeck());
    const first = session.createSlide('layout-title', { durationMs: 0 });
    session.createSlide('layout-title', { durationMs: 0 });
    first.timeline = {
      clips: [{
        id: 'reveal-title', targetId: first.elements[0]!.id, kind: 'entrance', effect: 'fade', trigger: 'on-click',
        delayMs: 0, durationMs: 100, easing: 'linear', repeat: 1, fill: 'hold',
      }],
    };
    expect(session.updateElementPhysics(first.elements[0]!.id, {
      body: 'fixed', shape: 'cuboid', density: 1, restitution: 0.2, friction: 0.5,
    })).toBe(false);
    expect(session.removeElement(first.elements[0]!.id)).toBe(false);
    session.play(1_000);
    expect(session.tick(1_120)).toBe(false);
    expect(session.currentSlideIndex).toBe(0);
    expect(session.advance(1_120)).toBe(true);
    expect(session.currentSlideIndex).toBe(0);
    expect(session.timelineClickTimes).toEqual([120]);

    expect(session.seek(40, 1_120)).toBe(true);
    session.pause(1_140);
    expect(session.timelinePlaybackState(2_000).timeMs).toBe(60);
    session.play(2_000);
    expect(session.timelinePlaybackState(2_040).timeMs).toBe(100);

    expect(session.advance(2_040)).toBe(true);
    expect(session.currentSlideIndex).toBe(1);
    expect(session.timelinePlaybackState(2_040)).toMatchObject({ timeMs: 0, clickTimesMs: [] });
  });

  test('adds validated elements to the active slide', () => {
    const session = new PresentationSession(templateDeck());
    session.createSlide('layout-title');

    expect(session.addElement({
      id: 'drawn-text',
      type: 'text',
      name: 'Text box',
      frame: { x: 0.2, y: 0.3, width: 0.4, height: 0.15 },
      transform: { ...DEFAULT_TRANSFORM },
      opacity: 1,
      visible: true,
      renderOrder: 2,
      text: 'Drawn text',
      style: { ...DEFAULT_TEXT_STYLE },
    })).toBe(true);
    expect(session.findTextElement('drawn-text')?.text).toBe('Drawn text');
    expect(session.addElement(session.findTextElement('drawn-text')!)).toBe(false);
  });
});
