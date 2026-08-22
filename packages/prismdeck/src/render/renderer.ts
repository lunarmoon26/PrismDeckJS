import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  WebGLRenderer,
  type Material,
} from 'three';
import type {
  ChartElement,
  DeckElement,
  DeckSize,
  ShapeElement,
  TableElement,
  TextStyle,
} from '../document/types';
import { PresentationSession, type SessionChangeDetail } from '../runtime/session';
import { configureStereoCameraRig, OUTPUT_PRESETS, type OutputMode } from './stereo';

export interface DeckRendererOptions {
  outputMode?: OutputMode;
  antialias?: boolean;
  fovDegrees?: number;
  eyeSeparation?: number;
  clearColor?: string;
  pixelRatio?: number;
}

export interface PhysicsTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

const SLIDE_HEIGHT = 10;
const MIN_THICKNESS = 0.025;

function degrees(value: number): number {
  return (value * Math.PI) / 180;
}

function elementWorldSize(element: DeckElement, size: DeckSize): { width: number; height: number; depth: number } {
  const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
  return {
    width: Math.max(0.01, element.frame.width * slideWidth),
    height: Math.max(0.01, element.frame.height * SLIDE_HEIGHT),
    depth: Math.max(MIN_THICKNESS, element.thickness ?? MIN_THICKNESS),
  };
}

export function elementWorldTransform(element: DeckElement, size: DeckSize): PhysicsTransform & { size: { width: number; height: number; depth: number } } {
  const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
  const worldSize = elementWorldSize(element, size);
  const object = new Object3D();
  object.position.set(
    (element.frame.x + element.frame.width / 2 - 0.5) * slideWidth,
    (0.5 - element.frame.y - element.frame.height / 2) * SLIDE_HEIGHT,
    element.transform.z * SLIDE_HEIGHT,
  );
  object.rotation.set(degrees(element.transform.rotationX), degrees(element.transform.rotationY), degrees(element.transform.rotationZ));
  return {
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
    size: worldSize,
  };
}

function textureCanvas(element: DeckElement): HTMLCanvasElement {
  const aspect = Math.max(0.2, Math.min(5, element.frame.width / Math.max(0.001, element.frame.height)));
  const width = Math.round(Math.min(1400, Math.max(384, 720 * aspect)));
  const height = Math.round(Math.min(1024, Math.max(192, width / aspect)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function applyFont(context: CanvasRenderingContext2D, style: TextStyle, element: DeckElement): number {
  const fontSize = Math.max(10, (style.fontSize / Math.max(0.001, element.frame.height)) * context.canvas.height);
  context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textAlign = style.align;
  context.textBaseline = 'top';
  return fontSize;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0] ?? '';
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawText(
  context: CanvasRenderingContext2D,
  element: DeckElement,
  text: string,
  style: TextStyle,
): void {
  const fontSize = applyFont(context, style, element);
  const padding = Math.max(8, context.canvas.width * 0.025);
  const lineHeight = fontSize * style.lineHeight;
  const lines = wrapLines(context, text, context.canvas.width - padding * 2);
  const blockHeight = lines.length * lineHeight;
  const startY =
    style.verticalAlign === 'middle'
      ? (context.canvas.height - blockHeight) / 2
      : style.verticalAlign === 'bottom'
        ? context.canvas.height - blockHeight - padding
        : padding;
  const x = style.align === 'center' ? context.canvas.width / 2 : style.align === 'right' ? context.canvas.width - padding : padding;
  lines.forEach((line, index) => context.fillText(line, x, startY + index * lineHeight));
}

function drawShape(context: CanvasRenderingContext2D, element: ShapeElement): void {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.fillStyle = element.fill;
  context.strokeStyle = element.stroke;
  context.lineWidth = Math.max(1, element.strokeWidth * (context.canvas.width / 600));
  const inset = context.lineWidth / 2;
  context.beginPath();
  if (element.shape === 'ellipse') {
    context.ellipse(
      context.canvas.width / 2,
      context.canvas.height / 2,
      context.canvas.width / 2 - inset,
      context.canvas.height / 2 - inset,
      0,
      0,
      Math.PI * 2,
    );
  } else if (element.shape === 'line') {
    context.moveTo(inset, context.canvas.height - inset);
    context.lineTo(context.canvas.width - inset, inset);
  } else if (element.shape === 'roundedRectangle') {
    context.roundRect(inset, inset, context.canvas.width - context.lineWidth, context.canvas.height - context.lineWidth, 28);
  } else {
    context.rect(inset, inset, context.canvas.width - context.lineWidth, context.canvas.height - context.lineWidth);
  }
  if (element.shape !== 'line') context.fill();
  context.stroke();
  if (element.text && element.textStyle) drawText(context, element, element.text, element.textStyle);
}

function drawTable(context: CanvasRenderingContext2D, element: TableElement): void {
  context.fillStyle = element.fill;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  const rowCount = Math.max(1, element.rows.length);
  const columnCount = Math.max(1, ...element.rows.map((row) => row.length));
  const cellWidth = context.canvas.width / columnCount;
  const cellHeight = context.canvas.height / rowCount;
  context.strokeStyle = element.stroke;
  context.lineWidth = 2;
  const fontSize = applyFont(context, element.textStyle, element);
  element.rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const x = columnIndex * cellWidth;
      const y = rowIndex * cellHeight;
      if (rowIndex < element.headerRows) {
        context.fillStyle = '#E7E5E4';
        context.fillRect(x, y, cellWidth, cellHeight);
      }
      context.strokeRect(x, y, cellWidth, cellHeight);
      context.fillStyle = element.textStyle.color;
      context.textAlign = 'left';
      context.fillText(value, x + 8, y + Math.max(4, (cellHeight - fontSize) / 2), cellWidth - 16);
    });
  });
}

function drawChart(context: CanvasRenderingContext2D, element: ChartElement): void {
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  const padding = Math.round(Math.min(context.canvas.width, context.canvas.height) * 0.1);
  const values = element.series.flatMap((series) => series.values).filter((value): value is number => value !== null);
  const maximum = Math.max(1, ...values.map(Math.abs));
  const categoryCount = Math.max(1, element.categories.length, ...element.series.map((series) => series.values.length));
  const colors = ['#2563EB', '#F97316', '#16A34A', '#9333EA', '#DC2626'];
  context.strokeStyle = '#A8A29E';
  context.beginPath();
  context.moveTo(padding, padding);
  context.lineTo(padding, context.canvas.height - padding);
  context.lineTo(context.canvas.width - padding, context.canvas.height - padding);
  context.stroke();
  const plotWidth = context.canvas.width - padding * 2;
  const plotHeight = context.canvas.height - padding * 2;
  if (element.chartType === 'pie') {
    const pieValues = element.series[0]?.values.map((value) => Math.max(0, value ?? 0)) ?? [];
    const total = pieValues.reduce((sum, value) => sum + value, 0) || 1;
    let angle = -Math.PI / 2;
    pieValues.forEach((value, index) => {
      const next = angle + (value / total) * Math.PI * 2;
      context.fillStyle = colors[index % colors.length] ?? '#2563EB';
      context.beginPath();
      context.moveTo(context.canvas.width / 2, context.canvas.height / 2);
      context.arc(context.canvas.width / 2, context.canvas.height / 2, Math.min(plotWidth, plotHeight) * 0.4, angle, next);
      context.fill();
      angle = next;
    });
    return;
  }
  const groupWidth = plotWidth / categoryCount;
  const barWidth = groupWidth / Math.max(1, element.series.length + 1);
  element.series.forEach((series, seriesIndex) => {
    context.fillStyle = series.color ?? colors[seriesIndex % colors.length] ?? '#2563EB';
    context.strokeStyle = context.fillStyle;
    context.beginPath();
    series.values.forEach((value, categoryIndex) => {
      const normalized = (value ?? 0) / maximum;
      const x = padding + categoryIndex * groupWidth + (seriesIndex + 0.5) * barWidth;
      const y = context.canvas.height - padding - normalized * plotHeight;
      if (element.chartType === 'line' || element.chartType === 'area') {
        if (categoryIndex === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      } else {
        context.fillRect(x, y, barWidth * 0.8, normalized * plotHeight);
      }
    });
    if (element.chartType === 'line' || element.chartType === 'area') context.stroke();
  });
}

function canvasTextureFor(element: DeckElement): CanvasTexture {
  const canvas = textureCanvas(element);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D rendering is unavailable');
  if (element.type === 'text') drawText(context, element, element.text, element.style);
  else if (element.type === 'shape') drawShape(context, element);
  else if (element.type === 'table') drawTable(context, element);
  else if (element.type === 'chart') drawChart(context, element);
  else {
    context.fillStyle = '#FEF2F2';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawText(context, element, element.type === 'unsupported' ? element.fallbackText ?? element.reason : element.name, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 0.04,
      fontWeight: 600,
      fontStyle: 'normal',
      color: '#991B1B',
      align: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.2,
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class DeckRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera();
  readonly leftCamera = new PerspectiveCamera();
  readonly rightCamera = new PerspectiveCamera();
  readonly renderer: WebGLRenderer;
  private readonly slideGroup = new Group();
  private readonly elementObjects = new Map<string, Object3D>();
  private readonly textures = new Set<Texture>();
  private readonly materials = new Set<Material>();
  private readonly pendingImageLoads = new Set<Promise<void>>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private session?: PresentationSession;
  private outputMode: OutputMode;
  private width = 1;
  private height = 1;
  private disposed = false;
  private generation = 0;
  private readonly fovDegrees: number;
  private readonly eyeSeparation: number;
  private cameraDistance = 15;
  private activeDeckSize?: DeckSize;
  private sessionChangeListener = (event: Event) => {
    const detail = (event as CustomEvent<SessionChangeDetail>).detail;
    if (detail.reason === 'slide' || detail.reason === 'deck' || detail.reason === 'content') this.rebuild();
  };

  constructor(readonly canvas: HTMLCanvasElement, options: DeckRendererOptions = {}) {
    this.outputMode = options.outputMode ?? 'mono';
    this.fovDegrees = options.fovDegrees ?? 40;
    this.eyeSeparation = options.eyeSeparation ?? 0.18;
    this.renderer = new WebGLRenderer({ canvas, antialias: options.antialias ?? true, alpha: false });
    this.renderer.setPixelRatio(options.pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(new Color(options.clearColor ?? '#0C0A09'), 1);
    this.renderer.autoClear = false;
    this.scene.add(this.slideGroup);
    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(-4, 8, 12);
    this.scene.add(key);
    this.resize(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1, false);
  }

  attach(session: PresentationSession): void {
    if (this.session === session) return;
    this.detach();
    this.session = session;
    session.addEventListener('change', this.sessionChangeListener);
    this.rebuild();
  }

  detach(): void {
    this.session?.removeEventListener('change', this.sessionChangeListener);
    this.session = undefined;
    this.clearSlide();
  }

  setOutputMode(mode: OutputMode): void {
    if (this.outputMode === mode) return;
    this.outputMode = mode;
    if (this.activeDeckSize) this.fitCamera(this.activeDeckSize);
    else this.configureCameras();
  }

  getOutputMode(): OutputMode {
    return this.outputMode;
  }

  resize(width: number, height: number, updateStyle = false): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setSize(this.width, this.height, updateStyle);
    if (this.activeDeckSize) this.fitCamera(this.activeDeckSize);
    else this.configureCameras();
  }

  resizeToPreset(mode = this.outputMode): void {
    this.setOutputMode(mode);
    const preset = OUTPUT_PRESETS[mode];
    this.renderer.setPixelRatio(1);
    this.resize(preset.width, preset.height, false);
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.clear(true, true, true);
    if (this.outputMode === 'mono') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const eyeWidth = Math.floor(this.width / 2);
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, eyeWidth, this.height);
    this.renderer.setScissor(0, 0, eyeWidth, this.height);
    this.renderer.render(this.scene, this.leftCamera);
    this.renderer.setViewport(eyeWidth, 0, this.width - eyeWidth, this.height);
    this.renderer.setScissor(eyeWidth, 0, this.width - eyeWidth, this.height);
    this.renderer.render(this.scene, this.rightCamera);
    this.renderer.setScissorTest(false);
  }

  pick(clientX: number, clientY: number): string | undefined {
    const bounds = this.canvas.getBoundingClientRect();
    const normalizedX = (clientX - bounds.left) / bounds.width;
    const normalizedY = (clientY - bounds.top) / bounds.height;
    let camera: PerspectiveCamera = this.camera;
    let eyeX = normalizedX;
    if (this.outputMode !== 'mono') {
      const rightEye = normalizedX >= 0.5;
      camera = rightEye ? this.rightCamera : this.leftCamera;
      eyeX = rightEye ? (normalizedX - 0.5) * 2 : normalizedX * 2;
    }
    this.pointer.set(eyeX * 2 - 1, -(normalizedY * 2 - 1));
    this.raycaster.setFromCamera(this.pointer, camera);
    const hit = this.raycaster.intersectObjects(Array.from(this.elementObjects.values()), true)[0];
    let object: Object3D | null = hit?.object ?? null;
    while (object && typeof object.userData.elementId !== 'string') object = object.parent;
    return object?.userData.elementId as string | undefined;
  }

  getElementObject(elementId: string): Object3D | undefined {
    return this.elementObjects.get(elementId);
  }

  applyPhysicsTransforms(transforms: ReadonlyMap<string, PhysicsTransform>): void {
    for (const [elementId, transform] of transforms) {
      const object = this.elementObjects.get(elementId);
      if (!object) continue;
      object.position.set(transform.position.x, transform.position.y, transform.position.z);
      object.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
    }
  }

  async whenReady(): Promise<void> {
    while (this.pendingImageLoads.size > 0) {
      await Promise.allSettled(Array.from(this.pendingImageLoads));
    }
  }

  rebuild(): void {
    if (this.disposed) return;
    this.clearSlide();
    const slide = this.session?.currentSlide;
    const document = this.session?.document;
    if (!slide || !document) return;
    this.activeDeckSize = document.size;
    const generation = this.generation;
    const slideWidth = SLIDE_HEIGHT * (document.size.width / document.size.height);
    const backgroundGeometry = new BoxGeometry(slideWidth, SLIDE_HEIGHT, 0.04);
    const backgroundMaterial = new MeshStandardMaterial({ color: new Color(slide.background), roughness: 0.9 });
    this.materials.add(backgroundMaterial);
    const background = new Mesh(backgroundGeometry, backgroundMaterial);
    background.position.z = -0.08;
    background.receiveShadow = true;
    this.slideGroup.add(background);

    for (const element of slide.elements) {
      if (!element.visible) continue;
      const object = this.createElementObject(element, document.size);
      this.elementObjects.set(element.id, object);
      this.slideGroup.add(object);
      if (element.type === 'image') {
        const pending = this.loadImage(element.id, element.assetId, generation);
        this.pendingImageLoads.add(pending);
        void pending.finally(() => this.pendingImageLoads.delete(pending));
      }
    }
    this.fitCamera(document.size);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private createElementObject(element: DeckElement, deckSize: DeckSize): Object3D {
    const world = elementWorldTransform(element, deckSize);
    const geometry = new BoxGeometry(world.size.width, world.size.height, world.size.depth);
    let material: MeshStandardMaterial | MeshBasicMaterial;
    if (element.type === 'image') {
      const placeholder = canvasTextureFor({ ...element, type: 'unsupported', reason: 'Loading image', fallbackText: element.alt ?? element.name });
      this.textures.add(placeholder);
      material = new MeshBasicMaterial({ map: placeholder, transparent: true, opacity: element.opacity, side: DoubleSide });
    } else {
      const texture = canvasTextureFor(element);
      this.textures.add(texture);
      material = new MeshStandardMaterial({
        map: texture,
        transparent: element.opacity < 1 || element.type === 'text',
        opacity: element.opacity,
        roughness: 0.72,
        metalness: 0.02,
      });
    }
    this.materials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(world.position.x, world.position.y, world.position.z);
    mesh.quaternion.set(world.rotation.x, world.rotation.y, world.rotation.z, world.rotation.w);
    mesh.scale.set(element.transform.scaleX, element.transform.scaleY, 1);
    mesh.renderOrder = element.renderOrder;
    mesh.userData.elementId = element.id;
    mesh.userData.element = element;
    return mesh;
  }

  private async loadImage(elementId: string, assetId: string, generation: number): Promise<void> {
    const asset = this.session?.assets.get(assetId);
    if (!asset) return;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(asset.data)], { type: asset.mimeType }));
    try {
      const texture = await new TextureLoader().loadAsync(url);
      texture.colorSpace = SRGBColorSpace;
      if (this.disposed || generation !== this.generation) {
        texture.dispose();
        return;
      }
      const object = this.elementObjects.get(elementId);
      if (!(object instanceof Mesh)) {
        texture.dispose();
        return;
      }
      const oldMaterial = object.material as Material;
      const opacity = oldMaterial.opacity;
      const material = new MeshBasicMaterial({ map: texture, transparent: opacity < 1, opacity, side: DoubleSide });
      object.material = material;
      this.textures.add(texture);
      this.materials.add(material);
      oldMaterial.dispose();
      this.materials.delete(oldMaterial);
    } catch {
      // Keep the visible fallback generated while the image was loading.
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private fitCamera(size: DeckSize): void {
    const slideWidth = SLIDE_HEIGHT * (size.width / size.height);
    const logicalAspect =
      this.outputMode === 'mono' ? this.width / this.height : OUTPUT_PRESETS[this.outputMode].logicalEyeAspect;
    const verticalFov = degrees(this.fovDegrees);
    const distanceForHeight = SLIDE_HEIGHT / 2 / Math.tan(verticalFov / 2);
    const distanceForWidth = slideWidth / 2 / (Math.tan(verticalFov / 2) * logicalAspect);
    this.cameraDistance = Math.max(distanceForHeight, distanceForWidth) * 1.08 + 1;
    this.configureCameras();
  }

  private configureCameras(): void {
    const actualAspect = this.width / this.height;
    this.camera.fov = this.fovDegrees;
    this.camera.aspect = this.outputMode === 'mono' ? actualAspect : OUTPUT_PRESETS[this.outputMode].logicalEyeAspect;
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.position.set(0, 0, this.cameraDistance);
    this.camera.quaternion.identity();
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    configureStereoCameraRig(this.leftCamera, this.rightCamera, {
      fovDegrees: this.fovDegrees,
      near: 0.1,
      far: 200,
      distance: this.cameraDistance,
      convergenceDistance: this.cameraDistance,
      eyeSeparation: this.eyeSeparation,
      aspect: OUTPUT_PRESETS[this.outputMode].logicalEyeAspect,
    });
  }

  private clearSlide(): void {
    this.generation += 1;
    this.activeDeckSize = undefined;
    for (const child of [...this.slideGroup.children]) {
      this.slideGroup.remove(child);
      child.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
    }
    for (const texture of this.textures) texture.dispose();
    for (const material of this.materials) material.dispose();
    this.textures.clear();
    this.materials.clear();
    this.elementObjects.clear();
  }
}
