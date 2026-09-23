import { expect, test, type Page, type TestInfo } from '@playwright/test';

const reader = (page: Page) => page.locator('.flipbook-reader');
const next = (page: Page) => page.locator('.flipbook-controls button').last();
const previous = (page: Page) => page.locator('.flipbook-controls button').first();

async function open(page: Page, query = '') {
  await page.goto(`/__dev/flipbook-magazine${query}`);
  await page.locator('.stf__item.--shown img').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(reader(page)).toHaveAttribute('data-transition', 'idle');
}

async function visible(page: Page, indexes: string) {
  await expect(reader(page)).toHaveAttribute('data-visible-pages', indexes);
  await expect(reader(page)).toHaveAttribute('data-transition', 'idle');
}

async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({
    path,
    fullPage: name.startsWith('desktop-'),
    animations: name.endsWith('-turning') ? 'allow' : 'disabled'
  });
  await info.attach(name, { path, contentType: 'image/png' });
}

async function fits(page: Page) {
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('.flipbook-reader')!;
    const leaf = root.querySelector('[data-flipbook-page-id]:not([aria-hidden="true"])')!;
    const rect = leaf.getBoundingClientRect();
    const controls = root.querySelector('.flipbook-controls')!.getBoundingClientRect();
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      readerHeight: root.getBoundingClientRect().height,
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      controlsTop: controls.top,
      controlsBottom: controls.bottom,
      shown: root.querySelectorAll('.stf__item.--shown').length
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.readerHeight).toBeCloseTo(geometry.viewportHeight, 0);
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.controlsTop);
  expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.width / geometry.height).toBeCloseTo(480 / 680, 2);
  expect(geometry.width).toBeGreaterThanOrEqual(
    Math.min(geometry.viewportWidth - 32, ((geometry.viewportHeight - 104) * 480) / 680) - 2
  );
  expect(geometry.shown).toBe(1);
  return geometry;
}

async function swipe(page: Page, browserName: string, dx: number, dy = 0, stepDelay = 8) {
  const rect = await page.locator('.flipbook-volume').boundingBox();
  const start = { x: rect!.x + rect!.width * (dx < 0 ? 0.82 : 0.18), y: rect!.y + rect!.height * 0.35 };
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 4; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x + (dx * step) / 4, y: start.y + (dy * step) / 4 }]
      });
      await page.waitForTimeout(stepDelay);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    // Playwright WebKit has no native drag-touch API. This verifies the engine's
    // pointer path, not Safari's OS gesture arbitration (covered on Chromium).
    await page.evaluate(
      async ({ start, dx, dy, stepDelay }) => {
        const target = document.elementFromPoint(start.x, start.y)!;
        const send = (type: string, x: number, y: number) =>
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x,
              clientY: y,
              buttons: type === 'pointerup' ? 0 : 1
            })
          );
        send('pointerdown', start.x, start.y);
        for (let step = 1; step <= 4; step++) {
          send('pointermove', start.x + (dx * step) / 4, start.y + (dy * step) / 4);
          await new Promise((resolve) => setTimeout(resolve, stepDelay));
        }
        send('pointerup', start.x + dx, start.y + dy);
      },
      { start, dx, dy, stepDelay }
    );
  }
}

for (const [width, height] of [
  [320, 568],
  [360, 800],
  [375, 667],
  [390, 844],
  [393, 852],
  [412, 915],
  [430, 932]
]) {
  test(`complete mobile leaf ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width: width!, height: height! });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    const geometry = await fits(page);
    await info.attach('geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
    if ([320, 390, 430].includes(width!))
      await shot(page, info, width === 390 ? 'mobile-390-cover' : `mobile-${width}`);
    await next(page).click();
    await visible(page, '1');
    await fits(page);
    if (width === 390) await shot(page, info, 'mobile-390-interior');
    await previous(page).click();
    await visible(page, '0');
    await fits(page);
    expect(errors).toEqual([]);
  });
}

for (const count of [1, 2, 3, 4, 5, 6, 10]) {
  test(`mobile boundaries and every real page N=${count}`, async ({ page }) => {
    await open(page, `?pages=${count}`);
    await expect(previous(page)).toBeDisabled();
    for (let index = 1; index < count; index++) {
      await next(page).click();
      await visible(page, String(index));
      await expect(page.locator(`[data-flipbook-page-id="fixture-page-${index + 1}"]`)).not.toHaveAttribute(
        'aria-hidden',
        'true'
      );
    }
    await expect(next(page)).toBeDisabled();
    for (let index = count - 2; index >= 0; index--) {
      await previous(page).click();
      await visible(page, String(index));
    }
    await expect(previous(page)).toBeDisabled();
  });
}

test('physical curl, touch navigation, concurrent input and vertical scroll', async ({ page, browserName }) => {
  await open(page);
  await next(page).click();
  await visible(page, '1');
  await next(page).click();
  await visible(page, '2');
  await swipe(page, browserName, -180);
  await visible(page, '3');
  await swipe(page, browserName, 180);
  await visible(page, '2');
  await swipe(page, browserName, -180, 0, 90);
  await visible(page, '3');
  await swipe(page, browserName, 180, 0, 90);
  await visible(page, '2');
  await swipe(page, browserName, -180);
  await swipe(page, browserName, -180);
  await expect(reader(page)).toHaveAttribute('data-transition', 'idle');
  // A second gesture may finish after the first; never skip a real leaf.
  expect(['3', '4']).toContain(await reader(page).getAttribute('data-visible-pages'));
  if (browserName === 'chromium') {
    const before = await reader(page).getAttribute('data-visible-pages');
    await swipe(page, browserName, 2, -210);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
    await expect(reader(page)).toHaveAttribute('data-visible-pages', before!);
  }
});

test('real focal leaf survives orientation, viewport chrome and reduced motion changes', async ({ page }) => {
  await open(page);
  await next(page).click();
  await visible(page, '1');
  await next(page).click();
  await visible(page, '2');
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 700 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await visible(page, '2');
    await fits(page);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await visible(page, '1,2');
  await page.setViewportSize({ width: 390, height: 844 });
  await visible(page, '2');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visible(page, '2');
  await next(page).click();
  await visible(page, '3');
  await fits(page);
});

test('visual evidence at a physical curl frame', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
  await open(page);
  await next(page).click();
  await visible(page, '1');
  await page.clock.pauseAt(new Date('2026-09-23T12:05:00Z'));
  await next(page).click({ force: true });
  await page.clock.runFor(160);
  await expect(reader(page)).not.toHaveAttribute('data-transition', 'idle');
  expect(
    await page
      .locator('.stf__item')
      .evaluateAll((leaves) => leaves.some((leaf) => leaf.getAttribute('style')?.includes('clip-path')))
  ).toBe(true);
  await reader(page).evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  await shot(page, info, 'mobile-390-turning');
  await page.clock.resume();
  await visible(page, '2');
});

test('automatic reading settles with a left fold and stops after manual input', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
  await open(page, '?pages=4');
  await page.clock.runFor(2200);
  await visible(page, '0');
  await page.clock.runFor(1100);
  await visible(page, '1');
  const folded = page.locator('[data-flipbook-page-id="fixture-page-2"]');
  await expect(folded).toHaveAttribute('data-folded', 'true');
  expect(await folded.evaluate((element) => getComputedStyle(element, '::after').content)).not.toBe('none');
  await shot(page, info, 'mobile-390-folded-left');
  await next(page).click();
  await visible(page, '2');
  await page.clock.runFor(10_000);
  await visible(page, '2');
});

test('automatic reading reaches the back cover and respects reduced motion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
  await open(page, '?pages=3');
  await page.clock.runFor(3_300);
  await visible(page, '1');
  await page.clock.runFor(4_000);
  await visible(page, '2');
  await page.clock.runFor(8_000);
  await visible(page, '2');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(reader(page)).toHaveAttribute('data-transition', 'idle');
  await page.clock.runFor(10_000);
  await visible(page, '0');
});

test('automatic reading can be paused and resumed explicitly', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
  await open(page, '?pages=3');
  await page.getByRole('button', { name: 'Pausar animación automática' }).click();
  await page.clock.runFor(10_000);
  await visible(page, '0');
  await page.getByRole('button', { name: 'Reanudar animación automática' }).click();
  await page.clock.runFor(3_300);
  await visible(page, '1');
});

test('automatic page turns in real time with video evidence', async ({ browser, browserName }, info) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5183',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: info.outputDir, size: { width: 390, height: 844 } }
  });
  const page = await context.newPage();
  try {
    await open(page, '?pages=3');
    await expect(reader(page)).toHaveAttribute('data-visible-pages', '2', { timeout: 15_000 });
    await expect(reader(page)).toHaveAttribute('data-transition', 'idle');
  } finally {
    const video = page.video();
    await context.close();
    if (video)
      await info.attach(`automatic-reader-${browserName}`, { path: await video.path(), contentType: 'video/webm' });
  }
});

test('hotspots keep their own leaf, actions and focus guards', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Modificar acompañantes' }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, info, 'mobile-390-hotspot');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await visible(page, '0');
  await next(page).click();
  await visible(page, '1');
  await next(page).click();
  await visible(page, '2');
  await page.getByRole('button', { name: 'Mostrar QR' }).tap();
  await expect(page.getByRole('img', { name: 'Código QR de acceso' })).toBeVisible();
  await next(page).click();
  await visible(page, '3');
  const location = page.locator('[data-flipbook-page-id="fixture-page-4"]:not([data-stf-clone]) a');
  await expect(location).toHaveAttribute('href', 'https://maps.google.com/');
  await expect(location.locator('xpath=ancestor::*[@data-flipbook-page-id]')).toHaveAttribute(
    'data-flipbook-page-id',
    'fixture-page-4'
  );
  await next(page).click();
  await expect(location).toHaveAttribute('aria-disabled', 'true');
  expect(
    await location.evaluate((link) => !link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
  ).toBe(true);
  await visible(page, '4');
  await expect(page.getByRole('link', { name: 'Mesa de regalos' })).toHaveAttribute(
    'href',
    'https://example.com/mesa-regalos'
  );
  await expect(page.getByRole('link', { name: 'Abrir enlace' })).toHaveAttribute(
    'href',
    'https://example.com/nuestra-historia'
  );
  expect(
    await page
      .locator('[data-flipbook-page-id][aria-hidden="true"] a')
      .evaluateAll((links) => links.every((link) => link.getAttribute('tabindex') === '-1'))
  ).toBe(true);
});

test('contained mixed assets and adjacent slow load', async ({ page }) => {
  await open(page, '?pages=6&mixed');
  for (let index = 1; index <= 2; index++) {
    await next(page).click();
    await visible(page, String(index));
    const image = page.locator(`.stf__item.--shown img`).first();
    await expect(image).toHaveCSS('object-fit', 'contain');
    await fits(page);
  }
  await open(page, '?pages=6&slow');
  await next(page).click();
  await visible(page, '1');
  await expect(page.locator('.stf__item.--shown img')).toBeVisible();
  await fits(page);
});

test('safe area budget, adjacent preload and access to the public document', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page, '?pages=10');
  await expect(page.locator('[data-flipbook-page-id] img')).toHaveCount(2);
  await reader(page).evaluate((element) => {
    (element as HTMLElement).style.setProperty('--reader-safe-top', '47px');
    (element as HTMLElement).style.setProperty('--reader-safe-bottom', '34px');
  });
  await expect.poll(async () => (await page.locator('.flipbook-volume').boundingBox())!.y).toBeGreaterThanOrEqual(47);
  await expect
    .poll(async () => {
      const rect = (await page.locator('.flipbook-controls').boundingBox())!;
      return rect.y + rect.height;
    })
    .toBeLessThanOrEqual(534);
  await page.getByRole('heading', { name: 'Ana & Luis' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Ana & Luis' })).toBeInViewport();
  await expect(page.getByRole('button', { name: /calendario/i })).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await visible(page, '0');
});

test.describe('desktop and tablet regression', () => {
  test.use({ isMobile: false, hasTouch: false });
  for (const [width, height] of [
    [768, 1024],
    [1024, 768],
    [1440, 1000]
  ]) {
    test(`covers, native spreads and keyboard at ${width}x${height}`, async ({ page }, info) => {
      await page.setViewportSize({ width: width!, height: height! });
      await open(page);
      await visible(page, '0');
      if (width === 1440) await shot(page, info, 'desktop-cover');
      await reader(page).press('ArrowRight');
      await visible(page, '1,2');
      if (width === 1440) await shot(page, info, 'desktop-spread');
      await reader(page).press('ArrowRight');
      await visible(page, '3,4');
      await expect(page.getByRole('link', { name: 'Ver ubicación' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Mesa de regalos' })).toBeVisible();
      await next(page).click();
      await visible(page, '5');
      await expect(next(page)).toBeDisabled();
      await previous(page).click();
      await visible(page, '3,4');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});
