import type { components } from './generated/schema';
import { isRecord } from './api-client';

export type Countdown = components['schemas']['CountdownResponseDto'];
export type SaveCountdownInput = components['schemas']['SaveCountdownRequestDto'];

export function isCountdown(value: unknown): value is Countdown {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 1
  )
    return false;
  const { x, y, width, height, backgroundOpacity } = value;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 ||
    y + height > 1 ||
    typeof backgroundOpacity !== 'number' ||
    !Number.isFinite(backgroundOpacity) ||
    backgroundOpacity < 0 ||
    backgroundOpacity > 1
  )
    return false;
  if (!(
    (value.visualOwnerType === 'FLYER' && value.flipbookPageId === null) ||
    (value.visualOwnerType === 'FLIPBOOK_PAGE' && typeof value.flipbookPageId === 'string')
  ))
    return false;
  return (
    ['numberColor', 'labelColor', 'backgroundColor', 'borderColor', 'shadowColor'].every(
      (field) => typeof value[field] === 'string' && /^#[0-9A-F]{6}$/i.test(value[field])
    ) &&
    ['montserrat', 'playfair', 'system'].includes(String(value.numberFont)) &&
    ['montserrat', 'playfair', 'system'].includes(String(value.labelFont)) &&
    [400, 500, 600, 700].includes(Number(value.numberWeight)) &&
    typeof value.numberWeight === 'number' &&
    [400, 500, 600, 700].includes(Number(value.labelWeight)) &&
    typeof value.labelWeight === 'number' &&
    ['row', 'grid'].includes(String(value.layout)) &&
    ['none', 'thin', 'double', 'rounded'].includes(String(value.frame)) &&
    ['none', 'soft', 'strong'].includes(String(value.shadow))
  );
}
