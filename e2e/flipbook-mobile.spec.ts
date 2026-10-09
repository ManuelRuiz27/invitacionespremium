import { expect, test, type Page, type TestInfo } from '@playwright/test';

const reader = (page: Page) => page.locator('.flipbook-reader');
const next = (page: Page) => page.locator('.flipbook-controls button').last();
const previous = (page: Page) => page.locator('.flipbook-controls button').first();

type InitialLeafFrame = { x: number; y: number; width: number; height: number };

async function installInitialLeafCapture(page: Page) {
  await page.addInitScript(() => {
    const frames: InitialLeafFrame[] = [];
    Object.assign(window, { __initialLeafFrames: frames });
    const started = performance.now();
    const sample = () => {
      const volume = document.querySelector('.flipbook-volume');
      const leaf = document.querySelector('.stf__item.--shown');
      if (volume?.getAttribute('data-intro') === 'closed' && leaf) {
        const { x, y, width, height } = leaf.getBoundingClientRect();
        frames.push({ x, y, width, height });
      }
      if (performance.now() - started < 5000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function captureInitialLeafFrames(page: Page, query: string): Promise<InitialLeafFrame[]> {
  await open(page, query);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return page.evaluate(() => (window as Window & { __initialLeafFrames: InitialLeafFrame[] }).__initialLeafFrames);
}

function expectStableInitialLeaf(frames: InitialLeafFrame[]) {
  expect(frames.length).toBeGreaterThan(0);
  for (const axis of ['x', 'y', 'width', 'height'] as const) {
    const values = frames.map((frame) => frame[axis]);
    expect(Math.max(...values) - Math.min(...values), `${axis} shifted during initial presentation`).toBeLessThan(2);
  }
}

async function open(page: Page, query = '', autoplay = false) {
  await page.goto(`/__dev/flipbook-magazine${query}`);
  await reader(page).waitFor();
  const pause = page.getByRole('button', { name: 'Pausar animación automática' });
  if (!autoplay && (await pause.count())) {
    await expect(pause).toBeEnabled();
    await pause.click();
  }
  await page.locator('.stf__item.--shown img').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(reader(page)).toHaveAttribute('data-transition', 'idle');
}

async function visible(page: Page, indexes: string) {
  await expect(reader(page)).toHaveAttribute('data-visible-pages', indexes);
  await expect(reader(page)).toHaveAttribute('data-transition', 'idle');
}

async function binding(page: Page) {
  return page.locator('.flipbook-magazine-engine').evaluate((engine) => {
    const bounds = engine.getBoundingClientRect();
    return ['::before', '::after'].map((pseudo) => {
      const style = getComputedStyle(engine, pseudo);
      return {
        content: style.content,
        top: bounds.top + parseFloat(style.top),
        bottom: bounds.bottom - parseFloat(style.bottom),
        left: bounds.left + parseFloat(style.left),
        width: parseFloat(style.width),
        pointerEvents: style.pointerEvents
      };
    });
  });
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
  const readGeometry = () =>
    page.evaluate(() => {
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
        leafAspectRatio: leaf.clientWidth / leaf.clientHeight,
        controlsTop: controls.top,
        controlsBottom: controls.bottom,
        shown: root.querySelectorAll('.stf__item.--shown').length
      };
    });
  await expect
    .poll(async () => {
      const geometry = await readGeometry();
      const expectedWidth = Math.min(geometry.viewportWidth - 32, ((geometry.viewportHeight - 104) * 480) / 680) - 2;
      return (
        Math.abs(geometry.readerHeight - geometry.viewportHeight) <= 1 &&
        geometry.x >= 0 &&
        geometry.y >= 0 &&
        geometry.right <= geometry.viewportWidth + 1 &&
        geometry.bottom <= geometry.controlsTop &&
        geometry.controlsBottom <= geometry.viewportHeight + 1 &&
        geometry.width >= expectedWidth &&
        Math.abs(geometry.leafAspectRatio - 480 / 680) < 0.01 &&
        geometry.shown === 1
      );
    })
    .toBe(true);
  const geometry = await readGeometry();
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.readerHeight).toBeCloseTo(geometry.viewportHeight, 0);
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.controlsTop);
  expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.leafAspectRatio).toBeCloseTo(480 / 680, 2);
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

test('REQ-04 cover geometry stays fixed through initialization and full reload', async ({ page }) => {
  await installInitialLeafCapture(page);
  for (const [width, height, query] of [
    [320, 568, '?pages=6'],
    [390, 844, '?pages=6&slow=1'],
    [768, 1024, '?pages=6'],
    [1440, 1000, '?pages=6&slow=1']
  ] as const) {
    await page.setViewportSize({ width, height });
    expectStableInitialLeaf(await captureInitialLeafFrames(page, query));
    await page.reload();
    await page.locator('.stf__item.--shown img').first().waitFor();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expectStableInitialLeaf(
      await page.evaluate(() => (window as Window & { __initialLeafFrames: InitialLeafFrame[] }).__initialLeafFrames)
    );
  }
});

test('mobile page stays centered above thumb-reachable bottom controls', async ({ page }) => {
  for (const [width, height] of [
    [320, 568],
    [390, 844]
  ]) {
    await page.setViewportSize({ width, height });
    await open(page, '?pages=6');
    const stage = (await page.locator('.flipbook-stage').boundingBox())!;
    const leaf = (await page.locator('.stf__item.--shown').boundingBox())!;
    const controls = (await page.locator('.flipbook-controls').boundingBox())!;
    const previousButton = (await previous(page).boundingBox())!;
    const nextButton = (await next(page).boundingBox())!;
    expect(Math.abs(leaf.y + leaf.height / 2 - (stage.y + 24 + controls.y) / 2)).toBeLessThan(8);
    expect(controls.y + controls.height).toBeCloseTo(height - 24, 0);
    expect(previousButton.x).toBeLessThan(33);
    expect(width - nextButton.x - nextButton.width).toBeLessThan(33);
    await next(page).click();
    await visible(page, '1');
    await previous(page).click();
    await visible(page, '0');
  }
});

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

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [430, 932]
]) {
  test(`portrait binding joins the physical leaf at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width: width!, height: height! });
    for (const query of ['?pages=6', '?pages=6&mixed']) {
      await open(page, query);
      await next(page).click();
      await visible(page, '1');
      await fits(page);
      const leaf = page.locator('.stf__item.--shown').first();
      const bounds = (await leaf.boundingBox())!;
      const [crease, edge] = await binding(page);
      for (const layer of [crease!, edge!]) {
        expect(layer.content).toBe('""');
        expect(layer.pointerEvents).toBe('none');
        expect(Math.abs(layer.top - bounds.y)).toBeLessThan(2.5);
        expect(Math.abs(layer.bottom - bounds.y - bounds.height)).toBeLessThan(2.5);
      }
      expect(crease!.width).toBeGreaterThanOrEqual(21);
      expect(crease!.width).toBeLessThanOrEqual(26);
      expect(edge!.width).toBeGreaterThanOrEqual(8);
      expect(edge!.width).toBeLessThanOrEqual(12);
      expect(Math.abs(edge!.left + edge!.width - crease!.left)).toBeLessThan(1);
      expect(Math.abs(crease!.left - bounds.x)).toBeLessThan(1);
      await expect(leaf.locator('img')).toHaveCSS('object-fit', 'contain');
      await shot(page, info, `binding-${width}-${query.includes('mixed') ? 'mixed' : 'interior'}`);
      await next(page).click();
      await visible(page, '2');
      expect(await binding(page)).toEqual([crease, edge]);
      await previous(page).click();
      await visible(page, '1');
      expect(await binding(page)).toEqual([crease, edge]);
    }
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
  const stationaryBinding = await binding(page);
  await next(page).click({ force: true });
  await page.clock.runFor(160);
  await expect(reader(page)).not.toHaveAttribute('data-transition', 'idle');
  expect(await binding(page)).toEqual(stationaryBinding);
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

for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1440, 1000]
]) {
  test(`REQ-03 reverse turn keeps real leaves mounted at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
    await open(page, '?pages=6');
    const positions = width === 390 ? ['3', '2', '1', '0'] : ['5', '3,4', '1,2', '0'];
    for (let index = 0; index < 3; index++) {
      await next(page).click();
      await visible(page, width === 390 ? String(index + 1) : ['1,2', '3,4', '5'][index]!);
    }
    for (let index = 1; index < positions.length; index++) {
      await page.clock.pauseAt(new Date(`2026-09-23T12:0${index}:00Z`));
      await previous(page).click({ force: true });
      await page.clock.runFor(160);
      await expect(reader(page)).not.toHaveAttribute('data-transition', 'idle');
      await expect(reader(page)).toHaveAttribute('data-visible-pages', positions[index - 1]!);
      expect(
        await page
          .locator('.stf__item.--shown')
          .evaluateAll(
            (leaves) =>
              leaves.length > 0 &&
              leaves.every(
                (leaf) => leaf.hasAttribute('data-flipbook-page-id') && !leaf.hasAttribute('data-flipbook-lazy')
              )
          )
      ).toBe(true);
      if (index === 1) {
        await reader(page).evaluate((element) => {
          element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
          element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        });
        await shot(page, info, `req03-${width}-reverse-turning`);
      }
      await page.clock.runFor(320);
      const shownLeaves = await page
        .locator('.stf__item.--shown')
        .evaluateAll((leaves) => leaves.map((leaf) => leaf.getAttribute('data-flipbook-page-id')));
      expect(shownLeaves.length).toBeGreaterThan(0);
      expect(shownLeaves.every((pageId) => pageId !== null)).toBe(true);
      if (width === 390 && index === 1) await shot(page, info, 'req03-390-reverse-landing');
      await page.clock.resume();
      await visible(page, positions[index]!);
    }
    await expect(previous(page)).toBeDisabled();
  });
}

test('automatic reading settles with a left fold and stops after manual input', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
  await open(page, '?pages=4', true);
  await page.clock.runFor(2200);
  await visible(page, '0');
  await page.clock.runFor(1100);
  await visible(page, '1');
  const folded = page.locator('[data-flipbook-page-id="fixture-page-2"]');
  await expect(folded).toHaveAttribute('data-folded', 'true');
  expect((await binding(page)).every((layer) => layer.content === '""')).toBe(true);
  await shot(page, info, 'mobile-390-folded-left');
  await next(page).click();
  await visible(page, '2');
  await page.clock.runFor(10_000);
  await visible(page, '2');
});

test('REQ-02 mobile taps preserve the settled curl without turning a page', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '?pages=6');
  await next(page).click();
  await visible(page, '1');
  const folded = page.locator('[data-flipbook-page-id="fixture-page-2"]:not([data-stf-clone])');
  const curl = () =>
    folded.evaluate((element) => {
      const style = getComputedStyle(element, '::after');
      return { content: style.content, border: style.borderLeftWidth };
    });
  await expect.poll(curl).toEqual({ content: '""', border: '1px' });
  const rect = (await folded.boundingBox())!;
  for (const [x, y] of [
    [0.5, 0.5],
    [0.08, 0.5],
    [0.95, 0.08],
    [0.05, 0.92]
  ]) {
    await page.touchscreen.tap(rect.x + rect.width * x!, rect.y + rect.height * y!);
    await visible(page, '1');
    await expect(folded).toHaveAttribute('data-folded', 'true');
    expect(await curl()).toEqual({ content: '""', border: '1px' });
    expect((await binding(page)).every((layer) => layer.content === '""')).toBe(true);
  }
  await shot(page, info, 'req02-mobile-settled-curl');
  await next(page).click();
  await visible(page, '2');
  await previous(page).click();
  await visible(page, '1');
  expect(await curl()).toEqual({ content: '""', border: '1px' });
  expect((await binding(page)).every((layer) => layer.content === '""')).toBe(true);
});

test('automatic reading reaches the back cover and respects reduced motion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
  await open(page, '?pages=3', true);
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
  await open(page, '?pages=3', true);
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
    await open(page, '?pages=3', true);
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
  await expect(page.locator('[data-flipbook-page-id] img')).toHaveCount(3);
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
  await expect(page.getByRole('heading', { name: 'Ana & Luis' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Modificar acompañantes' })).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await visible(page, '0');
});

test.describe('desktop and tablet regression', () => {
  test.use({ isMobile: false, hasTouch: false });
  test('REQ-02 corner preview preserves only the stationary leaf curl', async ({ page, browserName }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page, '?pages=6');
    await next(page).click();
    await visible(page, '1,2');
    const folded = page.locator('[data-flipbook-page-id="fixture-page-2"]:not([data-stf-clone])');
    const rect = (await page.locator('.stf__block').boundingBox())!;
    const curl = () => folded.evaluate((element) => getComputedStyle(element, '::after').content);
    for (const y of [0.08, 0.92]) {
      await page.mouse.move(rect.x + rect.width * (browserName === 'chromium' ? 0.9 : 0.95), rect.y + rect.height * y);
      await expect(reader(page)).toHaveAttribute('data-corner-preview', 'true');
      await expect(folded).toHaveClass(/--simple/);
      await expect.poll(curl).toBe('""');
      await page.mouse.down();
      await page.mouse.up();
      await expect(reader(page)).toHaveAttribute('data-visible-pages', '1,2');
      await expect.poll(curl).toBe('""');
      await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
      await visible(page, '1,2');
      await expect.poll(curl).toBe('""');
    }
    await shot(page, info, 'desktop-req02-settled-curl');

    // A preview that actually lifts the folded leaf still hides its settled curl.
    await page.mouse.move(
      rect.x + rect.width * (browserName === 'chromium' ? 0.08 : 0.05),
      rect.y + rect.height * 0.08
    );
    await expect(reader(page)).toHaveAttribute('data-corner-preview', 'true');
    await expect(folded).not.toHaveClass(/--simple/);
    await expect.poll(curl).toBe('none');
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
    await visible(page, '1,2');
    await expect.poll(curl).toBe('""');

    await next(page).click();
    await expect(reader(page)).not.toHaveAttribute('data-transition', 'idle');
    await expect(reader(page)).not.toHaveAttribute('data-corner-preview', 'true');
    expect(await curl()).toBe('none');
    await visible(page, '3,4');
    await previous(page).click();
    await visible(page, '1,2');
    await expect.poll(curl).toBe('""');
  });
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
