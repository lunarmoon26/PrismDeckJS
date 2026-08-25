import { describe, expect, test, vi } from 'vitest';
import {
  BackSide,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Points,
  ShaderMaterial,
  Texture,
  Vector3,
} from 'three';

import type { GalaxyBackgroundScene } from '../src/document/types';
import { backgroundSceneSignature, createBackgroundScene } from '../src/render/background';

const scene: GalaxyBackgroundScene = {
  type: 'galaxy',
  seed: 815,
  starCount: 1_000,
  rotationDegreesPerSecond: -3,
  coreColor: '#FFE5C7',
  armColor: '#C7DCFF',
  solColor: '#FFF0A6',
};
const size = { width: 1600, height: 900 };

describe('persistent galaxy background', () => {
  test('builds deterministic geometry and advances from the shared frame clock', () => {
    const first = createBackgroundScene(scene, size);
    const second = createBackgroundScene(scene, size);
    try {
      const firstStars = first.object.getObjectByName('PrismDeck galaxy stars') as Points<BufferGeometry, Material>;
      const secondStars = second.object.getObjectByName('PrismDeck galaxy stars') as Points<BufferGeometry, Material>;
      const haze = first.object.getObjectByName('PrismDeck galaxy haze') as Points<BufferGeometry, Material>;
      const initialPositions = Array.from(firstStars.geometry.getAttribute('position').array);
      expect(firstStars.geometry.getAttribute('position').count).toBe(1_000);
      expect(haze.geometry.getAttribute('position').count).toBe(350);
      expect(initialPositions.some((value, index) => index % 3 === 2 && value !== 0)).toBe(true);
      expect(initialPositions).toEqual(Array.from(secondStars.geometry.getAttribute('position').array));
      first.update(10);
      expect(Array.from(firstStars.geometry.getAttribute('position').array)).not.toEqual(initialPositions);
      expect(first.object.rotation.z).toBeCloseTo(0);
      expect(first.object.getObjectByName('PrismDeck Sol')).toBeTruthy();
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  test('signs the complete declaration and disposes owned GPU resources', () => {
    expect(backgroundSceneSignature(scene, size)).not.toBe(
      backgroundSceneSignature({ ...scene, seed: 816 }, size),
    );
    const runtime = createBackgroundScene(scene, size);
    const stars = runtime.object.getObjectByName('PrismDeck galaxy stars') as Points<BufferGeometry, Material>;
    const haze = runtime.object.getObjectByName('PrismDeck galaxy haze') as Points<BufferGeometry, Material>;
    const backdrop = runtime.object.getObjectByName('PrismDeck galaxy backdrop') as Mesh<BufferGeometry, MeshBasicMaterial>;
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    const hazeGeometryDisposed = vi.fn();
    const hazeMaterialDisposed = vi.fn();
    const backdropTextureDisposed = vi.fn();
    stars.geometry.addEventListener('dispose', geometryDisposed);
    stars.material.addEventListener('dispose', materialDisposed);
    haze.geometry.addEventListener('dispose', hazeGeometryDisposed);
    haze.material.addEventListener('dispose', hazeMaterialDisposed);
    expect(backdrop.visible).toBe(false);
    runtime.setBackdrop({} as HTMLImageElement);
    expect(backdrop.visible).toBe(true);
    const backdropTexture = backdrop.material.map as Texture;
    backdropTexture.addEventListener('dispose', backdropTextureDisposed);

    runtime.dispose();

    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(hazeGeometryDisposed).toHaveBeenCalledOnce();
    expect(hazeMaterialDisposed).toHaveBeenCalledOnce();
    expect(backdropTextureDisposed).toHaveBeenCalledOnce();
    expect(runtime.object.children).toHaveLength(0);
  });

  test('preserves the declared flow direction', () => {
    const clockwise = createBackgroundScene(scene, size);
    const counterclockwise = createBackgroundScene({ ...scene, rotationDegreesPerSecond: 3 }, size);
    try {
      clockwise.update(5);
      counterclockwise.update(5);
      const clockwiseStars = clockwise.object.getObjectByName('PrismDeck galaxy stars') as Points<BufferGeometry, Material>;
      const counterclockwiseStars = counterclockwise.object.getObjectByName('PrismDeck galaxy stars') as Points<BufferGeometry, Material>;
      expect(Array.from(clockwiseStars.geometry.getAttribute('position').array)).not.toEqual(
        Array.from(counterclockwiseStars.geometry.getAttribute('position').array),
      );
    } finally {
      clockwise.dispose();
      counterclockwise.dispose();
    }
  });

  test('uses CyberHUD default particle sizes and projection scale', () => {
    const runtime = createBackgroundScene(scene, size);
    try {
      const stars = runtime.object.getObjectByName('PrismDeck galaxy stars') as Points<BufferGeometry, ShaderMaterial>;
      const haze = runtime.object.getObjectByName('PrismDeck galaxy haze') as Points<BufferGeometry, ShaderMaterial>;
      const starSizes = Array.from(stars.geometry.getAttribute('pointSize').array);
      const hazeSizes = Array.from(haze.geometry.getAttribute('pointSize').array);
      const hazeOpacities = Array.from(haze.geometry.getAttribute('particleOpacity').array);
      const spectralSizes = [0.7, 1.15, 1.48, 2, 2.5];
      expect(starSizes.every((value) => spectralSizes.some((size) => Math.abs(value - size) < 0.0001))).toBe(true);

      const galaxyRadius = Math.max(10, 10 * size.width / size.height) * 0.68;
      const worldUnitsPerKiloparsec = galaxyRadius / 18.4;
      const backdropSpanKiloparsecs = (5_000 / 46 * 1_280) / 3_261.56;
      const presentationScale = worldUnitsPerKiloparsec / (1_000 / backdropSpanKiloparsecs);
      expect(Math.min(...hazeSizes)).toBeGreaterThanOrEqual(20 * presentationScale - 0.0001);
      expect(Math.max(...hazeSizes)).toBeLessThanOrEqual(50 * presentationScale * 1.8 + 0.0001);
      expect(hazeOpacities.every((value) => Math.abs(value - 0.08) < 0.0001 || Math.abs(value - 0.14) < 0.0001)).toBe(true);

      runtime.setRenderCamera(720, 15);
      expect(stars.material.uniforms.pointScale!.value).toBe(720);
      expect(haze.material.uniforms.pointScale!.value).toBe(720);
    } finally {
      runtime.dispose();
    }
  });

  test('eases slide camera translation without rotating the presentation layer', () => {
    const runtime = createBackgroundScene(scene, size);
    try {
      runtime.setCamera({ x: 2, y: -1, z: 3 }, 1);
      runtime.update(0);
      expect(runtime.object.position.x).toBeCloseTo(0);
      expect(runtime.object.position.y).toBeCloseTo(0);
      expect(runtime.object.position.z).toBeCloseTo(-3.2);
      runtime.update(0.5);
      expect(runtime.object.position.x).toBeCloseTo(-1);
      expect(runtime.object.position.y).toBeCloseTo(0.5);
      expect(runtime.object.position.z).toBeCloseTo(-4.7);
      runtime.update(1);
      expect(runtime.object.position.x).toBeCloseTo(-2);
      expect(runtime.object.position.y).toBeCloseTo(1);
      expect(runtime.object.position.z).toBeCloseTo(-6.2);
    } finally {
      runtime.dispose();
    }
  });

  test('tilts the persistent scene and reveals focused solar bodies', () => {
    const runtime = createBackgroundScene({ ...scene, solarSystem: {} }, size);
    try {
      const solarSystem = runtime.object.getObjectByName('PrismDeck solar system') as Group;
      const earth = runtime.object.getObjectByName('PrismDeck solar body earth') as Group;
      const jupiter = runtime.object.getObjectByName('PrismDeck solar body jupiter') as Group;
      const sky = runtime.object.getObjectByName('PrismDeck solar sky sphere') as Mesh<BufferGeometry, MeshBasicMaterial>;
      const earthSurface = runtime.object.getObjectByName('PrismDeck earth surface') as Mesh<BufferGeometry, ShaderMaterial>;
      const eclipticNorth = new Vector3(0, 0, 1).applyQuaternion(solarSystem.quaternion);
      expect(solarSystem.visible).toBe(false);
      expect(earth).toBeTruthy();
      expect(jupiter).toBeTruthy();
      expect(eclipticNorth.angleTo(new Vector3(0, 0, 1)) * 180 / Math.PI).toBeCloseTo(60.188);
      expect(earthSurface.material).toBeInstanceOf(ShaderMaterial);
      expect(earthSurface.material.uniforms.sunDirection!.value).toBeInstanceOf(Vector3);
      expect(jupiter.scale.x).toBeCloseTo(0.42);
      expect(sky.material.side).toBe(BackSide);
      expect(sky.visible).toBe(false);

      runtime.setRenderCamera(720, 15);
      runtime.setCamera({ x: 0, y: 0, z: 0, distance: 0.8, view: 'tilt', focusBody: 'earth' }, 1);
      runtime.update(0);
      runtime.update(0.5);
      expect(runtime.object.rotation.x).toBeCloseTo(-Math.PI / 8);
      expect(runtime.object.rotation.z).toBeCloseTo(-Math.PI / 72);
      expect(solarSystem.visible).toBe(true);
      expect(earth.scale.x).toBeCloseTo(0.62);
      expect(jupiter.scale.x).toBeCloseTo(0.42);
      runtime.update(1);
      expect(runtime.object.rotation.x).toBeCloseTo(-Math.PI / 4);

      runtime.setSolarTexture('earth', {} as HTMLImageElement);
      expect(earthSurface.material.uniforms.surfaceMap!.value).toBeInstanceOf(Texture);
      runtime.setSolarTexture('stars', {} as HTMLImageElement);
      expect(sky.material.map).toBeInstanceOf(Texture);
      expect(sky.visible).toBe(true);
      runtime.object.updateMatrixWorld(true);
      expect(sky.getWorldPosition(new Vector3()).distanceTo(new Vector3(0, 0, 15))).toBeCloseTo(0);
      runtime.setRenderEyeOffset(-0.01);
      runtime.object.updateMatrixWorld(true);
      expect(sky.getWorldPosition(new Vector3()).distanceTo(new Vector3(-0.01, 0, 15))).toBeCloseTo(0);
      runtime.setRenderEyeOffset(0.01);
      runtime.object.updateMatrixWorld(true);
      expect(sky.getWorldPosition(new Vector3()).distanceTo(new Vector3(0.01, 0, 15))).toBeCloseTo(0);
      runtime.setRenderEyeOffset(0);

      runtime.setCamera({ x: 0, y: 0, z: 0, distance: 0.8, view: 'horizon', focusBody: 'earth' }, 0);
      runtime.update(1.5);
      runtime.object.updateMatrixWorld(true);
      expect(sky.getWorldPosition(new Vector3()).distanceTo(new Vector3(0, 0, 15))).toBeCloseTo(0);
      const horizonUp = new Vector3(0, 0, 1)
        .applyQuaternion(solarSystem.quaternion)
        .applyQuaternion(runtime.object.quaternion);
      const horizonOffset = earth.position.clone()
        .multiplyScalar(-1)
        .applyQuaternion(solarSystem.quaternion)
        .applyQuaternion(runtime.object.quaternion)
        .normalize();
      expect(horizonUp.x).toBeCloseTo(0);
      expect(horizonUp.y).toBeCloseTo(1);
      expect(horizonUp.z).toBeCloseTo(0);
      expect(horizonOffset.x).toBeCloseTo(0);
      expect(horizonOffset.y).toBeCloseTo(0);
      expect(horizonOffset.z).toBeCloseTo(1);

      runtime.setCamera({ x: 0, y: 0, z: 0, distance: 0.16, view: 'top', focusBody: 'sol' }, 0);
      runtime.update(2);
      runtime.object.updateMatrixWorld(true);
      const solPosition = runtime.object.getObjectByName('PrismDeck solar body sol')!.getWorldPosition(new Vector3());
      expect(15 - solPosition.z).toBeCloseTo(0.3);
    } finally {
      runtime.dispose();
    }
  });
});
