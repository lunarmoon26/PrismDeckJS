import type {
  DeckAsset,
  DeckDocument,
  DeckElement,
  DeckSlide,
  ElementPhysics,
  ElementTransform,
  LoadedDeck,
  TextElement,
} from '../document/types';
import { validateDeckDocument } from '../document/validate';
import { timelineClickGroupCount, type TimelinePlaybackState } from './timeline';

export type SessionChangeReason = 'deck' | 'slide' | 'content' | 'playback';

export interface SessionChangeDetail {
  reason: SessionChangeReason;
  slideIndex: number;
  elementId?: string;
}

export interface PresentationSessionOptions {
  loop?: boolean;
}

export interface CreateSlideOptions {
  name?: string;
  background?: string;
  durationMs?: number;
  insertAt?: number;
}

function cloneDocument(document: DeckDocument): DeckDocument {
  return JSON.parse(JSON.stringify(document)) as DeckDocument;
}

let fallbackId = 0;

function uniqueId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  fallbackId += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

function cloneLayoutElement(element: DeckElement): DeckElement {
  const cloned = JSON.parse(JSON.stringify(element)) as DeckElement;
  cloned.id = uniqueId('element');
  return cloned;
}

export class PresentationSession extends EventTarget {
  readonly assets = new Map<string, DeckAsset>();
  private _document: DeckDocument;
  private _currentSlideIndex: number;
  private _playing = false;
  private playbackStartedAt = 0;
  private elapsedBeforePlay = 0;
  private timelineClickTimesMs: number[] = [];
  private loop: boolean;

  constructor(deck: LoadedDeck, options: PresentationSessionOptions = {}) {
    super();
    validateDeckDocument(deck.document);
    this._document = cloneDocument(deck.document);
    this.replaceAssets(deck.assets);
    this._currentSlideIndex = this._document.slides.length > 0 ? 0 : -1;
    this.loop = options.loop ?? false;
  }

  get document(): DeckDocument {
    return this._document;
  }

  get currentSlideIndex(): number {
    return this._currentSlideIndex;
  }

  get currentSlide(): DeckSlide | undefined {
    return this._document.slides[this._currentSlideIndex];
  }

  get isPlaying(): boolean {
    return this._playing;
  }

  get timelineTimeMs(): number {
    return this.elapsedAt(performance.now());
  }

  get timelineClickTimes(): readonly number[] {
    return [...this.timelineClickTimesMs];
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  replaceDeck(deck: LoadedDeck): void {
    validateDeckDocument(deck.document);
    this.pause();
    this._document = cloneDocument(deck.document);
    this.replaceAssets(deck.assets);
    this._currentSlideIndex = this._document.slides.length > 0 ? 0 : -1;
    this.resetPlaybackClock();
    this.emit('deck');
  }

  goTo(index: number, now = performance.now()): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this._document.slides.length) return false;
    if (index === this._currentSlideIndex) return true;
    this._currentSlideIndex = index;
    this.resetPlaybackClock(now);
    this.emit('slide');
    return true;
  }

  next(now = performance.now()): boolean {
    if (this._document.slides.length === 0) return false;
    const nextIndex = this._currentSlideIndex + 1;
    if (nextIndex < this._document.slides.length) return this.goTo(nextIndex, now);
    if (this.loop) return this.goTo(0, now);
    this.pause(now);
    return false;
  }

  /** Reveal one pending explicit-click timeline group, or move to the next slide. */
  advance(now = performance.now()): boolean {
    if (!this.currentSlide) return false;
    if (this.timelineClickTimesMs.length < timelineClickGroupCount(this.currentSlide)) {
      this.timelineClickTimesMs.push(this.elapsedAt(now));
      this.emit('playback');
      return true;
    }
    return this.next(now);
  }

  previous(now = performance.now()): boolean {
    if (this._document.slides.length === 0) return false;
    const previousIndex = this._currentSlideIndex - 1;
    if (previousIndex >= 0) return this.goTo(previousIndex, now);
    if (this.loop) return this.goTo(this._document.slides.length - 1, now);
    return false;
  }

  play(now = performance.now()): void {
    if (this._playing || !this.currentSlide) return;
    this._playing = true;
    this.playbackStartedAt = now;
    this.emit('playback');
  }

  pause(now = performance.now()): void {
    if (!this._playing) return;
    this.elapsedBeforePlay = this.elapsedAt(now);
    this._playing = false;
    this.emit('playback');
  }

  seek(timeMs: number, now = performance.now()): boolean {
    if (!this.currentSlide || !Number.isFinite(timeMs)) return false;
    this.elapsedBeforePlay = Math.max(0, timeMs);
    if (this._playing) this.playbackStartedAt = now;
    this.emit('playback');
    return true;
  }

  timelinePlaybackState(now = performance.now()): TimelinePlaybackState {
    return { timeMs: this.elapsedAt(now), clickTimesMs: [...this.timelineClickTimesMs] };
  }

  tick(now = performance.now()): boolean {
    if (!this._playing || !this.currentSlide) return false;
    let elapsed = this.elapsedAt(now);
    let advanced = false;
    let remainingAdvances = this._document.slides.length;
    while (
      this.currentSlide &&
      (this.currentSlide.durationMs === 0
        ? timelineClickGroupCount(this.currentSlide) === 0
        : elapsed >= this.currentSlide.durationMs) &&
      remainingAdvances > 0
    ) {
      if (this.currentSlide.durationMs > 0) elapsed -= this.currentSlide.durationMs;
      if (!this.next(now)) return advanced;
      advanced = true;
      remainingAdvances -= 1;
      this.playbackStartedAt = now - elapsed;
      this.elapsedBeforePlay = 0;
    }
    if (remainingAdvances === 0 && this.currentSlide?.durationMs === 0 && timelineClickGroupCount(this.currentSlide) === 0) {
      this.pause(now);
    }
    return advanced;
  }

  createSlide(layoutId: string, options: CreateSlideOptions = {}): DeckSlide {
    const layout = this._document.layouts.find((candidate) => candidate.id === layoutId);
    if (!layout) throw new Error(`Unknown layout: ${layoutId}`);
    const slide: DeckSlide = {
      id: uniqueId('slide'),
      name: options.name ?? `Slide ${this._document.slides.length + 1}`,
      layoutId,
      durationMs: options.durationMs ?? 5_000,
      background: options.background ?? this.currentSlide?.background ?? '#FFFFFF',
      elements: layout.elements.map(cloneLayoutElement),
    };
    const insertAt = Math.min(
      this._document.slides.length,
      Math.max(0, options.insertAt ?? this._document.slides.length),
    );
    this._document.slides.splice(insertAt, 0, slide);
    this._document.kind = 'presentation';
    if (this._currentSlideIndex < 0) this._currentSlideIndex = insertAt;
    else if (insertAt <= this._currentSlideIndex) this._currentSlideIndex += 1;
    this.emit('content');
    return slide;
  }

  updateElementTransform(elementId: string, patch: Partial<ElementTransform>): boolean {
    const element = this.findElement(elementId);
    if (!element) return false;
    element.transform = { ...element.transform, ...patch };
    this.emit('content', elementId);
    return true;
  }

  addElement(element: DeckElement): boolean {
    const elements = this.currentSlide?.elements;
    if (!elements || elements.some((candidate) => candidate.id === element.id)) return false;
    const cloned = JSON.parse(JSON.stringify(element)) as DeckElement;
    elements.push(cloned);
    try {
      validateDeckDocument(this._document);
    } catch (error) {
      elements.pop();
      throw error;
    }
    this.emit('content', cloned.id);
    return true;
  }

  updateElementPhysics(elementId: string, physics: ElementPhysics | undefined): boolean {
    const element = this.findElement(elementId);
    if (!element) return false;
    const previous = element.physics;
    element.physics = physics ? { ...physics } : undefined;
    try {
      validateDeckDocument(this._document);
    } catch {
      element.physics = previous;
      return false;
    }
    this.emit('content', elementId);
    return true;
  }

  updateText(elementId: string, text: string): boolean {
    const element = this.findElement(elementId);
    if (!element) return false;
    if (element.type === 'text') element.text = text;
    else if (element.type === 'shape') element.text = text;
    else return false;
    this.emit('content', elementId);
    return true;
  }

  removeElement(elementId: string): boolean {
    const elements = this.currentSlide?.elements;
    if (!elements) return false;
    if (this.currentSlide?.timeline?.clips.some((clip) => clip.targetId === elementId)) return false;
    const index = elements.findIndex((element) => element.id === elementId);
    if (index < 0) return false;
    elements.splice(index, 1);
    this.emit('content', elementId);
    return true;
  }

  findElement(elementId: string): DeckElement | undefined {
    return this.currentSlide?.elements.find((element) => element.id === elementId);
  }

  findTextElement(elementId: string): TextElement | undefined {
    const element = this.findElement(elementId);
    return element?.type === 'text' ? element : undefined;
  }

  notifyContentChanged(elementId?: string): void {
    validateDeckDocument(this._document);
    this.emit('content', elementId);
  }

  private replaceAssets(assets: Map<string, DeckAsset>): void {
    this.assets.clear();
    for (const [id, asset] of assets) this.assets.set(id, asset);
  }

  private resetPlaybackClock(now = performance.now()): void {
    this.elapsedBeforePlay = 0;
    this.timelineClickTimesMs = [];
    if (this._playing) this.playbackStartedAt = now;
  }

  private elapsedAt(now: number): number {
    return this.elapsedBeforePlay + (this._playing ? Math.max(0, now - this.playbackStartedAt) : 0);
  }

  private emit(reason: SessionChangeReason, elementId?: string): void {
    this.dispatchEvent(
      new CustomEvent<SessionChangeDetail>('change', {
        detail: { reason, slideIndex: this._currentSlideIndex, elementId },
      }),
    );
  }
}
