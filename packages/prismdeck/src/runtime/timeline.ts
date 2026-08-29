import type { DeckSlide, ElementAnimationClip, ElementAnimationEasing } from '../document/types';

export interface TimelinePlaybackState {
  timeMs: number;
  clickTimesMs: readonly number[];
}

export interface EvaluatedElementAnimation {
  visible: boolean;
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface ScheduledClip {
  clip: ElementAnimationClip;
  clickGroup: number;
  groupStartMs: number;
  startMs: number;
  endMs: number;
}

interface ClipProgress {
  started: boolean;
  complete: boolean;
  value: number;
}

const BASE_STATE: EvaluatedElementAnimation = Object.freeze({
  visible: true,
  opacity: 1,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
});

function copyBaseState(): EvaluatedElementAnimation {
  return { ...BASE_STATE };
}

function easing(value: number, kind: ElementAnimationEasing): number {
  if (kind === 'ease-in') return value * value;
  if (kind === 'ease-out') return 1 - (1 - value) * (1 - value);
  if (kind === 'ease-in-out') return value * value * (3 - 2 * value);
  return value;
}

function clipProgress(clip: ElementAnimationClip, elapsedMs: number): ClipProgress {
  if (elapsedMs < 0) return { started: false, complete: false, value: 0 };
  const totalDurationMs = clip.durationMs * clip.repeat;
  if (clip.durationMs === 0 || elapsedMs >= totalDurationMs) return { started: true, complete: true, value: 1 };
  const iterationElapsedMs = elapsedMs % clip.durationMs;
  return { started: true, complete: false, value: easing(iterationElapsedMs / clip.durationMs, clip.easing) };
}

function scheduleTimeline(slide: DeckSlide, clickTimesMs: readonly number[]): ScheduledClip[] {
  const clips = slide.timeline?.clips ?? [];
  const scheduled: ScheduledClip[] = [];
  let previous: ScheduledClip | undefined;
  let clickGroup = 0;
  for (const clip of clips) {
    let groupStartMs: number;
    let startMs: number;
    if (clip.trigger === 'on-enter') {
      clickGroup = 0;
      groupStartMs = 0;
      startMs = clip.delayMs;
    } else if (clip.trigger === 'on-click') {
      clickGroup += 1;
      groupStartMs = clickTimesMs[clickGroup - 1] ?? Number.POSITIVE_INFINITY;
      startMs = groupStartMs + clip.delayMs;
    } else if (clip.trigger === 'with-previous') {
      groupStartMs = previous?.groupStartMs ?? Number.POSITIVE_INFINITY;
      startMs = groupStartMs + clip.delayMs;
    } else {
      groupStartMs = previous?.groupStartMs ?? Number.POSITIVE_INFINITY;
      startMs = (previous?.endMs ?? Number.POSITIVE_INFINITY) + clip.delayMs;
    }
    const item: ScheduledClip = {
      clip,
      clickGroup,
      groupStartMs,
      startMs,
      endMs: startMs + clip.durationMs * clip.repeat,
    };
    scheduled.push(item);
    previous = item;
  }
  return scheduled;
}

function applyCompletedClip(state: EvaluatedElementAnimation, clip: ElementAnimationClip): void {
  if (clip.kind === 'entrance') {
    state.visible = true;
    state.opacity = 1;
  } else if (clip.kind === 'exit') {
    state.visible = false;
    state.opacity = 0;
  } else if (clip.kind === 'motion') {
    state.offsetX = clip.path.to.x;
    state.offsetY = clip.path.to.y;
  }
}

function applyClip(state: EvaluatedElementAnimation, clip: ElementAnimationClip, progress: ClipProgress): void {
  if (!progress.started) return;
  if (progress.complete && clip.fill === 'remove') {
    if (clip.kind === 'entrance') {
      state.visible = true;
      state.opacity = 1;
    }
    return;
  }
  if (progress.complete) {
    applyCompletedClip(state, clip);
    return;
  }
  if (clip.kind === 'entrance') {
    state.visible = true;
    state.opacity = progress.value;
  } else if (clip.kind === 'emphasis') {
    state.scale = 1 + Math.sin(Math.PI * progress.value) * 0.08;
  } else if (clip.kind === 'exit') {
    state.visible = true;
    state.opacity = 1 - progress.value;
  } else {
    state.offsetX = clip.path.from.x + (clip.path.to.x - clip.path.from.x) * progress.value;
    state.offsetY = clip.path.from.y + (clip.path.to.y - clip.path.from.y) * progress.value;
  }
}

export function timelineClickGroupCount(slide: DeckSlide | undefined): number {
  return slide?.timeline?.clips.filter((clip) => clip.trigger === 'on-click').length ?? 0;
}

export function evaluateSlideTimeline(
  slide: DeckSlide | undefined,
  playback: TimelinePlaybackState,
  reducedMotion = false,
): ReadonlyMap<string, EvaluatedElementAnimation> {
  if (!slide?.timeline) return new Map();
  const scheduled = scheduleTimeline(slide, playback.clickTimesMs);
  const states = new Map<string, EvaluatedElementAnimation>();
  const stateFor = (targetId: string) => {
    let state = states.get(targetId);
    if (!state) {
      state = copyBaseState();
      states.set(targetId, state);
    }
    return state;
  };

  for (const item of scheduled) {
    if (item.clip.kind === 'entrance') {
      const state = stateFor(item.clip.targetId);
      state.visible = false;
      state.opacity = 0;
    }
  }
  for (const item of scheduled) {
    if (item.clickGroup > 0 && playback.clickTimesMs.length < item.clickGroup) continue;
    const progress = reducedMotion
      ? { started: true, complete: true, value: 1 }
      : clipProgress(item.clip, playback.timeMs - item.startMs);
    applyClip(stateFor(item.clip.targetId), item.clip, progress);
  }
  return states;
}
