import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl, buildIcsCalendar, calendarFileName, toCalendarEventData } from './calendar';

const event = {
  name: 'Boda de Elena & Mateo',
  eventDateTime: '2035-10-18T23:00:00.000Z',
  eventEndDateTime: '2035-10-19T05:00:00.000Z',
  timeZone: 'America/Mexico_City',
  locationUrl: 'https://maps.google.com/?q=22.1565,-100.9855'
};

describe('public invitation calendar helpers', () => {
  it('builds the documented Google Calendar event-edit URL with authoritative instants and timezone', () => {
    const url = new URL(buildGoogleCalendarUrl(event));
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.pathname).toBe('/calendar/r/eventedit');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe(event.name);
    expect(url.searchParams.get('dates')).toBe('20351018T230000Z/20351019T050000Z');
    expect(url.searchParams.get('stz')).toBe(event.timeZone);
    expect(url.searchParams.get('etz')).toBe(event.timeZone);
    expect(url.searchParams.get('ctz')).toBeNull();
    expect(url.searchParams.get('location')).toBe(event.locationUrl);
  });

  it('builds an interoperable ICS payload and escapes calendar text', () => {
    const ics = buildIcsCalendar(
      {
        ...event,
        name: ['Boda, Elena; Mateo\\Cena', 'Recepción'].join('\n'),
        locationUrl: 'https://example.com/salon,a;b'
      },
      new Date('2035-10-01T12:00:00.000Z')
    );
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTAMP:20351001T120000Z');
    expect(ics).toContain('DTSTART:20351018T230000Z');
    expect(ics).toContain('DTEND:20351019T050000Z');
    expect(ics).toContain('SUMMARY:Boda\\, Elena\\; Mateo\\\\Cena\\nRecepción');
    expect(ics).toContain('LOCATION:https://example.com/salon\\,a\\;b');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });

  it('only exposes a calendar event when the end is after the start', () => {
    expect(toCalendarEventData(event)).toEqual(event);
    expect(toCalendarEventData({ ...event, eventEndDateTime: null })).toBeNull();
    expect(toCalendarEventData({ ...event, eventEndDateTime: event.eventDateTime })).toBeNull();
  });

  it('creates a safe ICS filename', () => {
    expect(calendarFileName('Boda de Élena & Mateo')).toBe('boda-de-elena-mateo.ics');
  });
});
