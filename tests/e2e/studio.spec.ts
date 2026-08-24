import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

function semanticDeckArchive(): Buffer {
  const transform = { z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1 };
  const textStyle = {
    fontFamily: 'Arial, sans-serif', fontSize: 0.035, fontWeight: 400, fontStyle: 'normal',
    color: '#111111', align: 'left', verticalAlign: 'middle', lineHeight: 1.2,
  };
  const border = { color: '#334155', width: 1, style: 'solid' };
  const document = {
    schemaVersion: '0.2.0', id: 'semantic-e2e', kind: 'presentation', metadata: { title: 'Semantic surfaces' },
    size: { width: 1600, height: 900 }, layouts: [], slides: [{
      id: 'slide', name: 'Chart and table', durationMs: 5000, background: '#F8FAFC', elements: [
        {
          id: 'table', type: 'table', name: 'Quarterly table', frame: { x: 0.05, y: 0.15, width: 0.4, height: 0.65 },
          transform, opacity: 1, visible: true, renderOrder: 0, columns: [2, 1],
          rows: [
            { height: 1, cells: [{ column: 0, columnSpan: 2, text: 'Quarterly results', header: true, style: { fill: '#334455', textStyle: { ...textStyle, color: '#FFFFFF', fontWeight: 700 } } }] },
            { height: 1, cells: [{ column: 0, text: 'Q1' }, { column: 1, text: '42' }] },
            { height: 1, cells: [{ column: 0, text: 'Q2' }, { column: 1, text: '57' }] },
          ],
          style: { fill: '#FFFFFF', textStyle, borders: { top: border, right: border, bottom: border, left: border } },
        },
        {
          id: 'chart', type: 'chart', name: 'Revenue chart', title: 'Revenue', frame: { x: 0.5, y: 0.1, width: 0.45, height: 0.72 },
          transform, opacity: 1, visible: true, renderOrder: 1,
          axes: [
            { id: 'category', kind: 'category', position: 'bottom', visible: true },
            { id: 'value', kind: 'value', position: 'left', visible: true },
          ],
          legend: { visible: true, position: 'bottom' },
          plots: [{
            type: 'bar', direction: 'column', grouping: 'clustered', axisIds: ['category', 'value'],
            series: [{ name: 'Sales', color: '#2563EB', points: [{ label: 'Q1', value: 42 }, { label: 'Q2', value: 57 }] }],
          }],
        },
      ],
    }],
  };
  const manifest = { format: 'prismdeck', packageVersion: '0.2.0', document: 'deck.json', assets: [] };
  return Buffer.from(zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'deck.json': strToU8(JSON.stringify(document)),
  }));
}

test('loads the WebGL Studio and edits a spatial slide', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel('Interactive 3D presentation canvas')).toBeVisible();
  await expect(page.locator('.slide-card')).toHaveCount(15);
  await expect(page.locator('.layer-list button')).toHaveCount(4);
  await expect(page.getByLabel('Slide layout').locator('option')).toHaveText([
    'Title Slide',
    'Title and Content',
    'Section Header',
    'Two Content',
    'Comparison',
    'Title Only',
    'Blank',
    'Content with Caption',
    'Picture with Caption',
  ]);
  await expect.poll(() => page.locator('.stage__overlay').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('2d');
    if (!context) return false;
    const pixels = context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) return true;
    return false;
  })).toBe(false);
  await expect(page.locator('.studio-shell')).not.toHaveAttribute('data-theme', /.+/);
  await expect(page.getByLabel('Demo deck theme').locator('option')).toHaveCount(7);
  await expect(page.getByLabel('Demo deck theme').locator('option')).toHaveText(['Edge', 'Office', 'Organic', 'Ion', 'Executive', 'Pastel', 'Grayscale']);
  await expect(page.getByLabel('Insert element').locator('option')).toHaveText([
    'Select', 'Text box', 'Rectangle', 'Rounded rectangle', 'Ellipse', 'Line', 'Picture…',
  ]);
  const chromeColor = await page.locator('.studio-shell').evaluate((element) => getComputedStyle(element).color);
  const originalDeckBackground = await page.locator('.slide-card__preview').first().evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByLabel('Demo deck theme').selectOption('edge-light');
  await expect.poll(() => page.locator('.slide-card__preview').first().evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(originalDeckBackground);
  await expect.poll(() => page.locator('.studio-shell').evaluate((element) => getComputedStyle(element).color)).toBe(chromeColor);
  await page.locator('.layer-list button').nth(1).click();
  await expect(page.locator('.stage__selection-layer polygon')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Resize bottom right' })).toBeDisabled();
  await page.getByLabel('Text color').fill('#010203');
  await expect(page.getByLabel('Demo deck theme')).toBeEnabled();
  await page.getByLabel('Demo deck theme').selectOption('mecha');
  await expect(page.getByLabel('Demo deck theme')).toBeEnabled();

  await page.locator('.slide-card').nth(1).click();
  await expect.poll(() => page.getByLabel('Interactive 3D presentation canvas').evaluate((canvas) => canvas.getAnimations().some((animation) => animation.playState === 'running'))).toBe(true);
  await expect.poll(() => page.locator('.stage__overlay').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('2d');
    if (!context) return false;
    const pixels = context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) return true;
    return false;
  })).toBe(true);
  const capturePromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Capture PNG' }).click();
  const capture = await capturePromise;
  expect(capture.suggestedFilename()).toBe('Import-locally-mono.png');
  await page.locator('.slide-card').first().click();

  await page.getByLabel('Scene background color').fill('#123456');
  await expect(page.locator('.slide-card__preview').first()).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await expect(page.getByLabel('Demo deck theme')).toBeEnabled();
  await expect(page.getByLabel('Transition duration')).toBeDisabled();
  await page.getByLabel('Slide transition').selectOption('fade');
  await page.getByLabel('Transition duration').fill('650');
  await expect(page.getByLabel('Transition duration')).toHaveValue('650');

  const canvasSize = await page.getByLabel('Interactive 3D presentation canvas').evaluate((canvas) => ({
    width: (canvas as HTMLCanvasElement).width,
    height: (canvas as HTMLCanvasElement).height,
  }));
  expect(canvasSize.width).toBeGreaterThan(1);
  expect(canvasSize.height).toBeGreaterThan(1);

  const canvas = page.getByLabel('Interactive 3D presentation canvas');
  await page.getByLabel('Insert element').selectOption('rectangle');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(bounds!.x + 2, bounds!.y + 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 8, bounds!.y + 8);
  await page.mouse.up();
  await expect(page.locator('.layer-list button')).toHaveCount(4);
  await page.mouse.move(bounds!.x + bounds!.width * 0.58, bounds!.y + bounds!.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.76, bounds!.y + bounds!.height * 0.5);
  await page.mouse.up();
  await expect(page.locator('.layer-list button')).toHaveCount(5);
  const moveBefore = await page.locator('.stage__selection-layer polygon').boundingBox();
  expect(moveBefore).toBeTruthy();
  await page.mouse.move(moveBefore!.x + moveBefore!.width / 2, moveBefore!.y + moveBefore!.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBefore!.x + moveBefore!.width / 2 + 30, moveBefore!.y + moveBefore!.height / 2 + 20);
  await page.mouse.up();
  const moveAfter = await page.locator('.stage__selection-layer polygon').boundingBox();
  expect(moveAfter!.x).toBeGreaterThan(moveBefore!.x + 15);
  expect(moveAfter!.y).toBeGreaterThan(moveBefore!.y + 10);
  await canvas.scrollIntoViewIfNeeded();
  const selectionBefore = await page.locator('.stage__selection-layer polygon').boundingBox();
  const resizeHandle = page.getByRole('button', { name: 'Resize bottom right' });
  const resizeBounds = await resizeHandle.boundingBox();
  expect(selectionBefore).toBeTruthy();
  expect(resizeBounds).toBeTruthy();
  await page.mouse.move(resizeBounds!.x + resizeBounds!.width / 2, resizeBounds!.y + resizeBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBounds!.x + resizeBounds!.width / 2 + 32, resizeBounds!.y + resizeBounds!.height / 2 + 24);
  await page.mouse.up();
  const selectionAfter = await page.locator('.stage__selection-layer polygon').boundingBox();
  expect(selectionAfter!.width).toBeGreaterThan(selectionBefore!.width + 10);
  expect(selectionAfter!.height).toBeGreaterThan(selectionBefore!.height + 8);
  await expect(page.getByLabel('Shape fill color')).toBeVisible();
  await page.getByLabel('Shape fill color').fill('#334455');
  await page.getByLabel('Shape stroke width').fill('3');
  await expect(page.getByLabel('Shape stroke width')).toHaveValue('3');
  await page.getByLabel('Opacity / alpha value').fill('0.65');
  await expect(page.getByLabel('Opacity / alpha value')).toHaveValue('0.65');
  await page.getByLabel('Scale X value').fill('1.1');
  await expect(page.getByLabel('Scale X value')).toHaveValue('1.1');

  await page.getByLabel('Insert element').selectOption('text');
  await canvas.scrollIntoViewIfNeeded();
  const textBounds = await canvas.boundingBox();
  expect(textBounds).toBeTruthy();
  await page.mouse.move(textBounds!.x + textBounds!.width * 0.2, textBounds!.y + textBounds!.height * 0.68);
  await page.mouse.down();
  await page.mouse.move(textBounds!.x + textBounds!.width * 0.48, textBounds!.y + textBounds!.height * 0.78);
  await page.mouse.up();
  await expect(page.locator('.layer-list button')).toHaveCount(6);
  await page.locator('.stacked-field textarea').fill('Canvas text');
  await page.getByLabel('Text size').fill('32');
  await expect(page.getByLabel('Text size')).toHaveValue('32');
  await page.getByLabel('Text alignment').selectOption('center');

  await page.locator('.layer-list button').nth(1).click();
  const spatial = page.getByText('Spatial transformation');
  await expect(spatial).toBeVisible();
  await expect(page.getByLabel('Thickness value')).toBeHidden();
  await spatial.click();
  await expect(page.getByLabel('Thickness value')).toHaveValue('0');
  await page.getByLabel('Thickness value').fill('0.1');
  await page.getByLabel('Thickness value').fill('0');
  await expect(page.getByLabel('Thickness value')).toHaveValue('0');
  await page.getByLabel('Depth value').fill('0.24');
  await expect(page.getByLabel('Depth value')).toHaveValue('0.24');

  await page.getByRole('button', { name: 'Full SBS' }).click();
  await expect(page.getByRole('button', { name: 'Full SBS' })).toHaveClass(/is-active/);
  await expect(page.getByLabel('Output geometry')).toHaveText('3840 × 1080 · 1920 × 1080 / eye');
  await expect(page.locator('.stage-toolbar').getByLabel('Insert element')).toBeVisible();
  await page.getByLabel('SBS depth scale').focus();
  await page.keyboard.press('End');
  await expect(page.getByText('1.50×')).toBeVisible();
  await page.locator('.slide-card').nth(1).click();
  await expect.poll(() => page.locator('.stage__overlay').evaluate((canvas) => {
    const overlay = canvas as HTMLCanvasElement;
    const context = overlay.getContext('2d');
    if (!context) return [false, false];
    const half = Math.floor(overlay.width / 2);
    const hasPixels = (x: number, width: number) => {
      const pixels = context.getImageData(x, 0, width, overlay.height).data;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) return true;
      return false;
    };
    return [hasPixels(0, half), hasPixels(half, overlay.width - half)];
  })).toEqual([true, true]);
  await page.locator('.slide-card').first().click();
  await page.getByRole('button', { name: /Add slide/ }).click();
  await expect(page.locator('.slide-card')).toHaveCount(16);
  await expect(page.locator('.slide-card__preview').last()).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await expect(page.locator('.save-dirty-dot')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(download.suggestedFilename()).toBe('PrismDeckJS-Spatial-Runtime.html');
  expect(downloadPath).toBeTruthy();
  const html = await readFile(downloadPath!, 'utf8');
  expect(html).toContain('type="application/vnd.prismdeck+zip;base64"');

  await page.getByLabel('Import deck file').setInputFiles({
    name: 'round-trip.html',
    mimeType: 'text/html',
    buffer: Buffer.from(html),
  });
  await expect(page.locator('.stage-message')).toBeHidden();
  await expect(page.locator('.slide-card')).toHaveCount(16);
  await expect(page.getByLabel('Demo deck theme')).toBeDisabled();
  expect(consoleErrors).toEqual([]);
});

test('renders semantic chart and table surfaces without browser errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });
  await page.getByLabel('Import deck file').setInputFiles({
    name: 'semantic.prismdeck',
    mimeType: 'application/vnd.prismdeck+zip',
    buffer: semanticDeckArchive(),
  });
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.layer-list button')).toHaveCount(2);
  await expect.poll(() => page.locator('.stage__overlay').evaluate((canvas) => {
    const surface = canvas as HTMLCanvasElement;
    const context = surface.getContext('2d');
    if (!context) return { table: false, chart: false };
    const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
    let table = false;
    let chart = false;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      if (alpha === 0) continue;
      if (red > 35 && red < 80 && green > 45 && green < 100 && blue > 60 && blue < 120) table = true;
      if (red < 80 && green > 60 && green < 150 && blue > 160) chart = true;
      if (table && chart) break;
    }
    return { table, chart };
  }), { timeout: 30_000 }).toEqual({ table: true, chart: true });
  expect(consoleErrors).toEqual([]);
});

test('fills and edits a picture placeholder from the inspector', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });
  await page.getByLabel('Slide layout').selectOption('layout-picture-caption');
  await page.getByRole('button', { name: /Add slide/ }).click();
  await expect(page.locator('.slide-card')).toHaveCount(16);
  await page.locator('.layer-list button').filter({ hasText: 'Picture' }).click();
  await expect(page.getByRole('button', { name: 'Choose picture…' })).toBeVisible();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose picture…' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'feature.png', mimeType: 'image/png', buffer: TEST_PNG });

  await expect(page.locator('.type-badge')).toHaveText('image');
  await expect(page.getByRole('button', { name: 'Replace picture…' })).toBeVisible();
  await page.getByLabel('Picture fit').selectOption('cover');
  await page.getByLabel('Picture alternative text').fill('PrismDeck feature preview');
  await expect(page.locator('.layer-list button')).toHaveCount(3);

  const oversizedChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace picture…' }).click();
  const oversizedChooser = await oversizedChooserPromise;
  await oversizedChooser.setFiles({
    name: 'oversized.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9000" height="10"><rect width="100%" height="100%"/></svg>'),
  });
  await expect(page.locator('.stage-error')).toContainText('Pictures are limited to 8192 px per side and 40 megapixels.');
  await expect(page.locator('.type-badge')).toHaveText('image');
  expect(consoleErrors).toEqual([]);
});

test('creates slides from the standard PowerPoint layout catalog', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });
  const layouts = [
    ['layout-title-slide', 2],
    ['layout-title-content', 2],
    ['layout-section-header', 2],
    ['layout-two-content', 3],
    ['layout-comparison', 5],
    ['layout-title-only', 1],
    ['layout-blank', 0],
    ['layout-content-caption', 3],
    ['layout-picture-caption', 3],
  ] as const;
  const layoutSelect = page.getByLabel('Slide layout');
  let slideCount = 15;
  for (const [layoutId, elementCount] of layouts) {
    await layoutSelect.selectOption(layoutId);
    await page.getByRole('button', { name: /Add slide/ }).click();
    slideCount += 1;
    await expect(page.locator('.slide-card')).toHaveCount(slideCount);
    await expect(page.locator('.layer-list button')).toHaveCount(elementCount);
  }
});

test('selects the topmost coplanar element', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });
  await page.getByLabel('Slide layout').selectOption('layout-blank');
  await page.getByRole('button', { name: /Add slide/ }).click();
  const canvas = page.getByLabel('Interactive 3D presentation canvas');
  const drawRectangle = async (start: [number, number], end: [number, number]) => {
    await page.getByLabel('Insert element').selectOption('rectangle');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    expect(bounds).toBeTruthy();
    await page.mouse.move(bounds!.x + bounds!.width * start[0], bounds!.y + bounds!.height * start[1]);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * end[0], bounds!.y + bounds!.height * end[1]);
    await page.mouse.up();
  };
  await drawRectangle([0.3, 0.3], [0.65, 0.65]);
  await drawRectangle([0.4, 0.4], [0.56, 0.56]);
  await expect(page.locator('.layer-list button')).toHaveCount(2);
  const topElementId = await page.locator('.object-summary small').textContent();
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width * 0.48, bounds!.y + bounds!.height * 0.48);
  await expect(page.locator('.object-summary small')).toHaveText(topElementId!);
});

test('keeps desktop panels bounded after shrinking and widening', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });

  for (const width of [600, 821, 900, 1000, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 821) continue;
    await expect.poll(() => page.evaluate(() => {
      const stageColumn = document.querySelector<HTMLElement>('.stage-column')!;
      const inspector = document.querySelector<HTMLElement>('.inspector')!.getBoundingClientRect();
      const transport = document.querySelector<HTMLElement>('.transport')!.getBoundingClientRect();
      return {
        bodyBottom: document.body.getBoundingClientRect().bottom <= innerHeight + 1,
        inspectorRight: inspector.right <= innerWidth + 1,
        inspectorBottom: inspector.bottom <= innerHeight + 1,
        transportRight: transport.right <= innerWidth + 1,
        transportBottom: transport.bottom <= innerHeight + 1,
        stageWidth: stageColumn.scrollWidth <= stageColumn.clientWidth,
      };
    })).toEqual({
      bodyBottom: true,
      inspectorRight: true,
      inspectorBottom: true,
      transportRight: true,
      transportBottom: true,
      stageWidth: true,
    });
  }
});
