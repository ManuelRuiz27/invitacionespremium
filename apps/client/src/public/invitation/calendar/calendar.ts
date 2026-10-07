import type { PublicInvitationView } from '@invitaciones/api-client';

type PublicEvent = NonNullable<PublicInvitationView['event']>;

export interface CalendarEventData {
  name: string;
  eventDateTime: string;
  eventEndDateTime: string | null;
  timeZone: string;
  locationUrl: string | null;
}

export function toCalendarEventData(event: PublicEvent | undefined): CalendarEventData | null {
  if (!event) return null;
  const start = new Date(event.eventDateTime);
  const end = event.eventEndDateTime ? new Date(event.eventEndDateTime) : null;
  if (
    !Number.isFinite(start.getTime()) ||
    (end !== null && (!Number.isFinite(end.getTime()) || end.getTime() <= start.getTime())) ||
    !event.name.trim() ||
    !event.timeZone.trim()
  ) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: event.timeZone });
  } catch {
    return null;
  }
  return {
    name: event.name,
    eventDateTime: event.eventDateTime,
    eventEndDateTime: event.eventEndDateTime ?? null,
    timeZone: event.timeZone,
    locationUrl: event.locationUrl ?? null
  };
}

export function buildIcsCalendar(event: CalendarEventData, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InvitacionesPremium//Calendar//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:' + escapeIcs(event.timeZone),
    'BEGIN:VEVENT',
    'UID:' + calendarUid(event),
    'DTSTAMP:' + calendarUtc(now),
    'DTSTART:' + calendarUtc(event.eventDateTime),
    ...(event.eventEndDateTime ? ['DTEND:' + calendarUtc(event.eventEndDateTime)] : []),
    'SUMMARY:' + escapeIcs(event.name),
    'DESCRIPTION:Invitación del evento',
    ...(event.locationUrl ? ['LOCATION:' + escapeIcs(event.locationUrl)] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ];
  return lines.map(foldIcsLine).join('\r\n');
}

export function calendarFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64);
  return (slug || 'evento') + '.ics';
}

function calendarUtc(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid calendar date.');
  return date
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/\r\n|\r|\n/gu, '\\n')
    .replace(/,/gu, '\\,')
    .replace(/;/gu, '\\;');
}

// RFC 5545 folds content lines at 75 UTF-8 octets without splitting a code point.
function foldIcsLine(value: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let octets = 0;
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (octets + size > 75) {
      result += '\r\n ';
      octets = 1;
    }
    result += char;
    octets += size;
  }
  return result;
}

function calendarUid(event: CalendarEventData): string {
  let hash = 2166136261;
  for (const char of event.name + '|' + event.eventDateTime) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (
    'event-' +
    event.eventDateTime.replace(/[^0-9]/gu, '').slice(0, 14) +
    '-' +
    (hash >>> 0).toString(16) +
    '@invitacionespremium'
  );
}
