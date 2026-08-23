import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('loads the WebGL Studio and edits a spatial slide', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('.stage-message')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel('Interactive 3D presentation canvas')).toBeVisible();
  await expect(page.locator('.slide-card')).toHaveCount(1);
  await expect(page.locator('.layer-list button')).toHaveCount(4);

  const canvasSize = await page.getByLabel('Interactive 3D presentation canvas').evaluate((canvas) => ({
    width: (canvas as HTMLCanvasElement).width,
    height: (canvas as HTMLCanvasElement).height,
  }));
  expect(canvasSize.width).toBeGreaterThan(1);
  expect(canvasSize.height).toBeGreaterThan(1);

  await page.locator('.layer-list button').nth(1).click();
  await expect(page.getByText('Spatial transform')).toBeVisible();
  await page.getByLabel('Depth value').fill('0.24');
  await expect(page.getByLabel('Depth value')).toHaveValue('0.24');

  await page.getByRole('button', { name: 'Full SBS' }).click();
  await expect(page.getByRole('button', { name: 'Full SBS' })).toHaveClass(/is-active/);
  await page.getByRole('button', { name: /Add slide/ }).click();
  await expect(page.locator('.slide-card')).toHaveCount(2);
  await expect(page.locator('.save-dirty-dot')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export HTML' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(download.suggestedFilename()).toBe('Spatial-ideas-clearly-presented.html');
  expect(downloadPath).toBeTruthy();
  const html = await readFile(downloadPath!, 'utf8');
  expect(html).toContain('type="application/vnd.prismdeck+zip;base64"');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'round-trip.html',
    mimeType: 'text/html',
    buffer: Buffer.from(html),
  });
  await expect(page.locator('.stage-message')).toBeHidden();
  await expect(page.locator('.slide-card')).toHaveCount(2);
  expect(consoleErrors).toEqual([]);
});
