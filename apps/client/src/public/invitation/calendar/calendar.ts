import type { PublicInvitationView } from '@invitaciones/api-client';

type PublicEvent = NonNullable<PublicInvitationView['event']>;

export interface CalendarEventData {
  name: string;
  eventDateTime: string;
  eventEndDateTime: string;
  timeZone: string;
  locationUrl: string | null;
}

export function toCalendarEventData(event: PublicEvent | undefined): CalendarEventData | null {
  if (!event?.eventEndDateTime) return null;
  const start = new Date(event.eventDateTime);
  const end = new Date(event.eventEndDateTime);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    !event.timeZone.trim()
  ) {
    return null;
  }
  return {
    name: event.name,
    eventDateTime: event.eventDateTime,
    eventEndDateTime: event.eventEndDateTime,
    timeZone: event.timeZone,
    locationUrl: event.locationUrl ?? null
  };
}

export function buildGoogleCalendarUrl(event: CalendarEventData): string {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', event.name);
  url.searchParams.set('dates', calendarUtc(event.eventDateTime) + '/' + calendarUtc(event.eventEndDateTime));
  url.searchParams.set('ctz', event.timeZone);
  url.searchParams.set('details', 'Invitación del evento');
  if (event.locationUrl) url.searchParams.set('location', event.locationUrl);
  return url.toString();
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
    'DTEND:' + calendarUtc(event.eventEndDateTime),
    'SUMMARY:' + escapeIcs(event.name),
    'DESCRIPTION:Invitación del evento',
    ...(event.locationUrl ? ['LOCATION:' + escapeIcs(event.locationUrl), 'URL:' + escapeIcs(event.locationUrl)] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ];
  return lines.join('\r\n');
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
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

function escapeIcs(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/\r?\n/gu, '\\n').replace(/,/gu, '\\,').replace(/;/gu, '\\;');
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
