import type { LoadedDeck } from '../document/types';
import { DeckPhysics, type DeckPhysicsOptions } from '../physics/rapier';
import { DeckRenderer, type DeckRendererOptions } from '../render/renderer';
import { PresentationSession, type PresentationSessionOptions, type SessionChangeDetail } from './session';

export interface DeckPlayerOptions {
  renderer?: DeckRendererOptions;
  session?: PresentationSessionOptions;
  physics?: boolean | DeckPhysicsOptions;
  autoStart?: boolean;
}

export class DeckPlayer {
  readonly session: PresentationSession;
  readonly renderer: DeckRenderer;
  readonly physics?: DeckPhysics;
  private animationFrame?: number;
  private previousFrameTime?: number;
  private disposed = false;
  private readonly sessionChangeListener = (event: Event) => {
    const detail = (event as CustomEvent<SessionChangeDetail>).detail;
    if (detail.reason === 'deck' || detail.reason === 'slide' || detail.reason === 'content') this.resetPhysics();
  };

  private constructor(session: PresentationSession, renderer: DeckRenderer, physics?: DeckPhysics) {
    this.session = session;
    this.renderer = renderer;
    this.physics = physics;
    this.renderer.attach(this.session);
    this.session.addEventListener('change', this.sessionChangeListener);
    this.resetPhysics();
  }

  static async create(canvas: HTMLCanvasElement, deck: LoadedDeck, options: DeckPlayerOptions = {}): Promise<DeckPlayer> {
    const session = new PresentationSession(deck, options.session);
    const renderer = new DeckRenderer(canvas, options.renderer);
    try {
      const physics = options.physics
        ? await DeckPhysics.create(typeof options.physics === 'object' ? options.physics : undefined)
        : undefined;
      const player = new DeckPlayer(session, renderer, physics);
      if (options.autoStart) player.start();
      return player;
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }

  start(): void {
    this.assertUsable();
    if (this.animationFrame !== undefined) return;
    this.previousFrameTime = undefined;
    this.animationFrame = requestAnimationFrame(this.onAnimationFrame);
  }

  stop(): void {
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.previousFrameTime = undefined;
  }

  renderFrame(timestamp = performance.now()): void {
    this.assertUsable();
    const deltaSeconds = this.previousFrameTime === undefined ? 0 : Math.max(0, timestamp - this.previousFrameTime) / 1_000;
    this.previousFrameTime = timestamp;
    this.session.tick(timestamp);
    if (this.physics) this.renderer.applyPhysicsTransforms(this.physics.step(deltaSeconds));
    this.renderer.render();
  }

  load(deck: LoadedDeck): void {
    this.assertUsable();
    this.session.replaceDeck(deck);
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.session.removeEventListener('change', this.sessionChangeListener);
    this.physics?.dispose();
    this.renderer.dispose();
  }

  private readonly onAnimationFrame = (timestamp: number) => {
    this.animationFrame = undefined;
    if (this.disposed) return;
    this.renderFrame(timestamp);
    this.animationFrame = requestAnimationFrame(this.onAnimationFrame);
  };

  private resetPhysics(): void {
    this.physics?.setSlide(this.session.currentSlide, this.session.document.size);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('DeckPlayer has been disposed');
  }
}
