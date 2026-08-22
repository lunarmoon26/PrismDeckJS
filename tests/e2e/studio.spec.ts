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
  expect(consoleErrors).toEqual([]);
});
