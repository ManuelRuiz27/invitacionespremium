import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CountdownVisual } from './CountdownVisual';
import {
  countdownContrast,
  countdownParts,
  defaultCountdownStyle,
  colorWithOpacity,
  normalizeHexColor,
  projectCountdownPreview,
  rectanglesOverlap
} from './countdown-style';

describe('countdown visual formatting', () => {
  it('formats days beyond two digits and rolls hours/minutes/seconds independently', () => {
    expect(countdownParts(123 * 86400 + 23 * 3600 + 59 * 60 + 58).map((part) => part.value)).toEqual([
      '123',
      '23',
      '59',
      '58'
    ]);
    expect(countdownParts(86400).map((part) => part.value)).toEqual(['01', '00', '00', '00']);
  });
  it('never shows negative time and distinguishes undefined schedules', () => {
    expect(countdownParts(-12).map((part) => part.value)).toEqual(['00', '00', '00', '00']);
    expect(countdownParts(null).map((part) => part.value)).toEqual(['—', '—', '—', '—']);
    expect(countdownParts(NaN).map((part) => part.value)).toEqual(['—', '—', '—', '—']);
  });
  it('uses background alpha without fading number or label colors', () => {
    const html = renderToStaticMarkup(
      createElement(CountdownVisual, {
        appearance: {
          ...defaultCountdownStyle,
          backgroundOpacity: 0.25,
          numberColor: '#112233',
          labelColor: '#445566'
        },
        seconds: 65
      })
    );
    expect(html).toContain('rgba(255, 255, 255, 0.25)');
    expect(html).toContain('#112233');
    expect(html).toContain('#445566');
    expect(html).toContain('aria-live="off"');
    expect(html).not.toContain('name:');
    expect(defaultCountdownStyle).not.toHaveProperty('name');
  });
  it('identifies the ended and schedule-free presentation accessibly', () => {
    expect(
      renderToStaticMarkup(createElement(CountdownVisual, { appearance: defaultCountdownStyle, seconds: 0 }))
    ).toContain('aria-label="El evento ha comenzado"');
    expect(
      renderToStaticMarkup(createElement(CountdownVisual, { appearance: defaultCountdownStyle, seconds: null }))
    ).toContain('Cuenta regresiva sin fecha definida');
  });
});

describe('color controls and layout guides', () => {
  it('matches mobile Flyer gutters and the actual contained image on a Flipbook leaf', () => {
    const flyer = projectCountdownPreview(0.5);
    expect(flyer).toEqual({
      surfaceWidth: 288,
      surfaceHeight: 576,
      imageWidth: 288,
      imageHeight: 576,
      imageLeft: 0,
      imageTop: 0
    });
    const portraitPage = projectCountdownPreview(480 / 680, 320, 480 / 680);
    expect(portraitPage.imageWidth).toBe(288);
    expect(portraitPage.imageHeight).toBeCloseTo(408, 8);
    const tallPage = projectCountdownPreview(0.25, 320, 480 / 680);
    expect(tallPage.surfaceWidth).toBe(288);
    expect(tallPage.surfaceHeight).toBeCloseTo(408, 8);
    expect(tallPage.imageWidth).toBeCloseTo(102, 8);
    expect(tallPage.imageHeight).toBeCloseTo(408, 8);
    expect(tallPage.imageLeft).toBeCloseTo(93, 8);
    expect(tallPage.imageTop).toBe(0);
  });
  it.each([
    ['#abc', '#AABBCC'],
    [' #12abef ', '#12ABEF'],
    ['#000', '#000000']
  ])('normalizes %s', (value, expected) => expect(normalizeHexColor(value)).toBe(expected));
  it.each(['red', '#ab', '#12345678', 'url(https://example.com)', '#zzzzzz'])('rejects unsupported color %s', (value) =>
    expect(normalizeHexColor(value)).toBeNull()
  );
  it('bounds background opacity and computes basic foreground contrast', () => {
    expect(colorWithOpacity('#ABC', 3)).toBe('rgba(170, 187, 204, 1)');
    expect(colorWithOpacity('#ABC', -1)).toBe('rgba(170, 187, 204, 0)');
    expect(countdownContrast('#FFFFFF', '#000000')).toBeCloseTo(21);
    expect(countdownContrast('#171717', '#171717')).toBe(1);
  });
  it('warns for intersecting regions but not touching edges', () => {
    const a = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    expect(rectanglesOverlap(a, { x: 0.2, y: 0.2, width: 0.1, height: 0.1 })).toBe(true);
    expect(rectanglesOverlap(a, { x: 0.4, y: 0.1, width: 0.2, height: 0.2 })).toBe(false);
  });
});
