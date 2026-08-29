import { describe, expect, test } from 'vitest';
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  evaluateSlideTimeline,
  timelineClickGroupCount,
  type DeckSlide,
} from '../src/index';

function timelineSlide(): DeckSlide {
  return {
    id: 'slide',
    name: 'Timeline',
    durationMs: 0,
    background: '#FFFFFF',
    elements: [
      {
        id: 'title',
        type: 'text',
        name: 'Title',
        frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
        transform: { ...DEFAULT_TRANSFORM },
        opacity: 1,
        visible: true,
        renderOrder: 0,
        text: 'Timeline',
        style: { ...DEFAULT_TEXT_STYLE },
      },
    ],
    timeline: {
      clips: [
        {
          id: 'enter', targetId: 'title', kind: 'entrance', effect: 'fade', trigger: 'on-enter',
          delayMs: 0, durationMs: 200, easing: 'linear', repeat: 1, fill: 'hold',
        },
        {
          id: 'pulse', targetId: 'title', kind: 'emphasis', effect: 'pulse', trigger: 'after-previous',
          delayMs: 50, durationMs: 100, easing: 'linear', repeat: 2, fill: 'remove',
        },
        {
          id: 'move', targetId: 'title', kind: 'motion', effect: 'path', trigger: 'on-click',
          delayMs: 0, durationMs: 100, easing: 'linear', repeat: 1, fill: 'hold',
          path: { from: { x: 0, y: 0 }, to: { x: 0.2, y: -0.1 } },
        },
        {
          id: 'exit', targetId: 'title', kind: 'exit', effect: 'fade', trigger: 'after-previous',
          delayMs: 0, durationMs: 100, easing: 'linear', repeat: 1, fill: 'hold',
        },
      ],
    },
  };
}

describe('normalized element timelines', () => {
  test('evaluates entrance, emphasis, click-gated motion, and exit deterministically', () => {
    const slide = timelineSlide();

    const initial = evaluateSlideTimeline(slide, { timeMs: 0, clickTimesMs: [] }).get('title')!;
    expect(initial).toMatchObject({ visible: true, opacity: 0, offsetX: 0, offsetY: 0, scale: 1 });

    const pulsing = evaluateSlideTimeline(slide, { timeMs: 300, clickTimesMs: [] }).get('title')!;
    expect(pulsing.opacity).toBe(1);
    expect(pulsing.scale).toBeCloseTo(1.08);

    const moving = evaluateSlideTimeline(slide, { timeMs: 500, clickTimesMs: [450] }).get('title')!;
    expect(moving).toMatchObject({ visible: true, opacity: 1, offsetX: 0.1, offsetY: -0.05, scale: 1 });

    const exited = evaluateSlideTimeline(slide, { timeMs: 700, clickTimesMs: [450] }).get('title')!;
    expect(exited).toMatchObject({ visible: false, opacity: 0, offsetX: 0.2, offsetY: -0.1, scale: 1 });
    expect(timelineClickGroupCount(slide)).toBe(1);
  });

  test('applies triggered groups immediately while preserving reduced-motion click boundaries', () => {
    const slide = timelineSlide();

    const entered = evaluateSlideTimeline(slide, { timeMs: 0, clickTimesMs: [] }, true).get('title')!;
    expect(entered).toMatchObject({ visible: true, opacity: 1, offsetX: 0, offsetY: 0, scale: 1 });

    const exited = evaluateSlideTimeline(slide, { timeMs: 0, clickTimesMs: [0] }, true).get('title')!;
    expect(exited).toMatchObject({ visible: false, opacity: 0, offsetX: 0.2, offsetY: -0.1, scale: 1 });
  });
});
