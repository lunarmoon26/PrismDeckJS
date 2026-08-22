import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type { DeckSize, DeckSlide } from '../document/types';
import { elementWorldTransform, type PhysicsTransform } from '../render/renderer';

type RapierModule = typeof import('@dimforge/rapier3d-compat');

export interface DeckPhysicsOptions {
  gravity?: { x: number; y: number; z: number };
  fixedStepSeconds?: number;
  maxSubSteps?: number;
  maxFrameDeltaSeconds?: number;
}

export class DeckPhysics {
  private world: World;
  private readonly bodies = new Map<string, RigidBody>();
  private accumulator = 0;
  private disposed = false;

  private constructor(
    private readonly rapier: RapierModule,
    private readonly options: Required<DeckPhysicsOptions>,
  ) {
    this.world = this.createWorld();
  }

  static async create(options: DeckPhysicsOptions = {}): Promise<DeckPhysics> {
    const fixedStepSeconds = options.fixedStepSeconds ?? 1 / 60;
    const maxSubSteps = options.maxSubSteps ?? 5;
    const maxFrameDeltaSeconds = options.maxFrameDeltaSeconds ?? 0.25;
    if (!Number.isFinite(fixedStepSeconds) || fixedStepSeconds <= 0) {
      throw new Error('fixedStepSeconds must be finite and greater than zero');
    }
    if (!Number.isInteger(maxSubSteps) || maxSubSteps <= 0) {
      throw new Error('maxSubSteps must be a positive integer');
    }
    if (!Number.isFinite(maxFrameDeltaSeconds) || maxFrameDeltaSeconds < 0) {
      throw new Error('maxFrameDeltaSeconds must be finite and non-negative');
    }
    const rapier = await import('@dimforge/rapier3d-compat');
    await rapier.init();
    return new DeckPhysics(rapier, {
      gravity: options.gravity ?? { x: 0, y: -9.81, z: 0 },
      fixedStepSeconds,
      maxSubSteps,
      maxFrameDeltaSeconds,
    });
  }

  setSlide(slide: DeckSlide | undefined, size: DeckSize): void {
    this.assertUsable();
    this.resetWorld();
    if (!slide) return;
    for (const element of slide.elements) {
      const physics = element.physics;
      if (!physics || !element.visible) continue;
      const world = elementWorldTransform(element, size);
      const descriptor =
        physics.body === 'dynamic'
          ? this.rapier.RigidBodyDesc.dynamic()
          : physics.body === 'kinematic'
            ? this.rapier.RigidBodyDesc.kinematicPositionBased()
            : this.rapier.RigidBodyDesc.fixed();
      descriptor
        .setTranslation(world.position.x, world.position.y, world.position.z)
        .setRotation(world.rotation)
        .setUserData({ elementId: element.id });
      const body = this.world.createRigidBody(descriptor);
      const scaledWidth = world.size.width * Math.abs(element.transform.scaleX);
      const scaledHeight = world.size.height * Math.abs(element.transform.scaleY);
      const collider =
        physics.shape === 'ball'
          ? this.rapier.ColliderDesc.ball(Math.max(0.01, Math.min(scaledWidth, scaledHeight) / 2))
          : this.rapier.ColliderDesc.cuboid(
              Math.max(0.005, scaledWidth / 2),
              Math.max(0.005, scaledHeight / 2),
              Math.max(0.005, world.size.depth / 2),
            );
      collider
        .setDensity(Math.max(0, physics.density))
        .setFriction(Math.max(0, physics.friction))
        .setRestitution(Math.min(1, Math.max(0, physics.restitution)))
        .setSensor(physics.body === 'sensor');
      this.world.createCollider(collider, body);
      this.bodies.set(element.id, body);
    }
  }

  step(deltaSeconds: number): ReadonlyMap<string, PhysicsTransform> {
    this.assertUsable();
    const finiteDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.accumulator += Math.min(finiteDelta, this.options.maxFrameDeltaSeconds);
    let subSteps = 0;
    while (this.accumulator >= this.options.fixedStepSeconds && subSteps < this.options.maxSubSteps) {
      this.world.step();
      this.accumulator -= this.options.fixedStepSeconds;
      subSteps += 1;
    }
    if (subSteps === this.options.maxSubSteps) this.accumulator = Math.min(this.accumulator, this.options.fixedStepSeconds);
    return this.transforms();
  }

  transforms(): ReadonlyMap<string, PhysicsTransform> {
    this.assertUsable();
    const transforms = new Map<string, PhysicsTransform>();
    for (const [elementId, body] of this.bodies) {
      const position = body.translation();
      const rotation = body.rotation();
      transforms.set(elementId, {
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      });
    }
    return transforms;
  }

  setKinematicTransform(elementId: string, transform: PhysicsTransform): boolean {
    this.assertUsable();
    const body = this.bodies.get(elementId);
    if (!body) return false;
    body.setNextKinematicTranslation(transform.position);
    body.setNextKinematicRotation(transform.rotation);
    return true;
  }

  applyImpulse(elementId: string, impulse: { x: number; y: number; z: number }): boolean {
    this.assertUsable();
    const body = this.bodies.get(elementId);
    if (!body) return false;
    body.applyImpulse(impulse, true);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bodies.clear();
    this.world.free();
  }

  private createWorld(): World {
    const world = new this.rapier.World(this.options.gravity);
    world.timestep = this.options.fixedStepSeconds;
    return world;
  }

  private resetWorld(): void {
    this.bodies.clear();
    this.world.free();
    this.world = this.createWorld();
    this.accumulator = 0;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('DeckPhysics has been disposed');
  }
}
