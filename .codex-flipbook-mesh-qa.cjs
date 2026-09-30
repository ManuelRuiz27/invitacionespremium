const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const url = 'http://127.0.0.1:5173/demo/flipbook-magazine';
const outputDir = path.join(os.tmpdir(), 'flipbook-mesh-final');
fs.mkdirSync(outputDir, { recursive: true });

async function openBook(page) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.flipbook-volume').evaluate((element) => element.click());
  await page.waitForFunction(() => document.querySelector('.flipbook-volume')?.getAttribute('data-intro') === 'open');
  await page.waitForFunction(() => document.querySelector('.flipbook-reader')?.getAttribute('data-transition') === 'idle');
}

async function meshState(page) {
  return page.evaluate(() => {
    const mesh = document.querySelector('[data-stf-mesh]');
    const source = document.querySelector('.stf__item.--mesh-source');
    const segments = [...document.querySelectorAll('[data-stf-mesh-segment]')];
    return {
      transition: document.querySelector('.flipbook-reader')?.getAttribute('data-transition'),
      meshCount: document.querySelectorAll('[data-stf-mesh]').length,
      segmentCount: segments.length,
      meshHidden: mesh?.getAttribute('aria-hidden') ?? null,
      meshInert: mesh?.hasAttribute('inert') ?? false,
      sourceId: source?.getAttribute('data-flipbook-page-id') ?? null,
      copies: document.querySelectorAll('[data-stf-mesh-copy]').length,
      transforms: segments.slice(0, 5).map((segment) => getComputedStyle(segment).transform),
      controls: document.querySelectorAll('.flipbook-controls button').length
    };
  });
}

async function recordTurn(page, buttonName, prefix) {
  await page.locator(`button[aria-label="${buttonName}"]`).evaluate((element) => element.click());
  const frames = [];
  for (const [delay, label] of [[190, 'early'], [150, 'middle'], [150, 'late']]) {
    await page.waitForTimeout(delay);
    const file = path.join(outputDir, `${prefix}-${label}.png`);
    await page.screenshot({ path: file });
    frames.push({ label, file, state: await meshState(page) });
  }
  await page.waitForFunction(() => document.querySelector('.flipbook-reader')?.getAttribute('data-transition') === 'idle');
  frames.push({ label: 'settled', state: await meshState(page) });
  return frames;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await openBook(page);
  const forward = await recordTurn(page, 'Siguiente', 'forward');
  const reverse = await recordTurn(page, 'Anterior', 'reverse');

  await page.evaluate(() => {
    window.__meshFrameTimes = [];
    const start = performance.now();
    let previous = start;
    const sample = (now) => {
      window.__meshFrameTimes.push(now - previous);
      previous = now;
      if (now - start < 900) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('button[aria-label="Siguiente"]').evaluate((element) => element.click());
  await page.waitForTimeout(950);
  const frameTimes = await page.evaluate(() => window.__meshFrameTimes ?? []);
  const activeFrames = frameTimes.filter((time) => time > 0 && time < 100);
  const performance = {
    samples: activeFrames.length,
    averageMs: activeFrames.reduce((sum, time) => sum + time, 0) / Math.max(1, activeFrames.length),
    p95Ms: [...activeFrames].sort((a, b) => a - b)[Math.floor(activeFrames.length * 0.95)] ?? null,
    longFrames: activeFrames.filter((time) => time > 34).length
  };
  await context.close();

  const dragContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const dragPage = await dragContext.newPage();
  await openBook(dragPage);
  const block = await dragPage.locator('.stf__block').boundingBox();
  if (!block) throw new Error('No se pudo medir el flipbook');
  const cdp = await dragContext.newCDPSession(dragPage);
  const from = { x: block.x + block.width - 8, y: block.y + block.height - 16 };
  const to = { x: block.x + block.width * 0.38, y: block.y + block.height * 0.7 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  for (let index = 1; index <= 10; index += 1) {
    const ratio = index / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, id: 1 }] });
    await dragPage.waitForTimeout(16);
  }
  await dragPage.screenshot({ path: path.join(outputDir, 'drag-held.png') });
  const held = await meshState(dragPage);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await dragPage.waitForTimeout(32);
  await dragPage.screenshot({ path: path.join(outputDir, 'drag-released.png') });
  const released = await meshState(dragPage);
  await dragPage.waitForFunction(() => document.querySelector('.flipbook-reader')?.getAttribute('data-transition') === 'idle');
  const dragSettled = await meshState(dragPage);
  await dragContext.close();

  const reducedContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await openBook(reducedPage);
  await reducedPage.locator('button[aria-label="Siguiente"]').evaluate((element) => element.click());
  await reducedPage.waitForTimeout(50);
  const reduced = await meshState(reducedPage);
  await reducedContext.close();

  const landscapeContext = await browser.newContext({ viewport: { width: 812, height: 375 }, isMobile: true, hasTouch: true });
  const landscapePage = await landscapeContext.newPage();
  await openBook(landscapePage);
  await landscapePage.locator('button[aria-label="Siguiente"]').evaluate((element) => element.click());
  await landscapePage.waitForTimeout(300);
  await landscapePage.screenshot({ path: path.join(outputDir, 'landscape-turn.png') });
  const landscape = await meshState(landscapePage);
  await landscapeContext.close();
  await browser.close();

  console.log(JSON.stringify({ outputDir, errors, forward, reverse, performance, drag: { held, released, settled: dragSettled }, reduced, landscape }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
