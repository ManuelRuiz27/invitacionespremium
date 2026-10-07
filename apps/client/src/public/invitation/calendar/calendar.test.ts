import { describe, expect, it } from 'vitest';
import { buildIcsCalendar, calendarFileName, toCalendarEventData } from './calendar';

const event = {
  name: 'Boda de Elena & Mateo',
  eventDateTime: '2035-10-18T23:00:00.000Z',
  eventEndDateTime: '2035-10-19T05:00:00.000Z',
  timeZone: 'America/Mexico_City',
  locationUrl: 'https://maps.google.com/?q=22.1565,-100.9855'
};

describe('public invitation calendar helpers', () => {
  it('exports the start alone without inventing an end or duration', () => {
    const data = toCalendarEventData({ ...event, eventEndDateTime: null })!;
    expect(data.eventEndDateTime).toBeNull();
    const ics = buildIcsCalendar(data);
    expect(ics).toContain('DTSTART:20351018T230000Z');
    expect(ics).toContain('X-WR-TIMEZONE:America/Mexico_City');
    expect(ics).not.toMatch(/DTEND|DURATION|VALARM/u);
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
    expect(toCalendarEventData({ ...event, eventEndDateTime: null })).not.toBeNull();
    expect(toCalendarEventData({ ...event, eventEndDateTime: event.eventDateTime })).toBeNull();
  });

  it('creates a safe ICS filename', () => {
    expect(calendarFileName('Boda de Élena & Mateo')).toBe('boda-de-elena-mateo.ics');
  });

  it('preserves explicit offsets and DST instants in UTC', () => {
    expect(buildIcsCalendar({ ...event, eventDateTime: '2035-10-18T17:00:00-06:00' })).toContain(
      'DTSTART:20351018T230000Z'
    );
    expect(
      buildIcsCalendar({ ...event, eventDateTime: '2026-11-01T01:30:00-04:00', timeZone: 'America/New_York' })
    ).toContain('DTSTART:20261101T053000Z');
    expect(toCalendarEventData({ ...event, eventDateTime: 'invalid' })).toBeNull();
    expect(toCalendarEventData({ ...event, timeZone: 'invalid' })).toBeNull();
  });

  it('folds UTF-8 lines at 75 octets and escapes all newline forms', () => {
    const name = 'Recepción 🎉 '.repeat(30) + '\r\nUno\rDos\nTres';
    const ics = buildIcsCalendar({ ...event, name });
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /gu, '')).toContain('SUMMARY:' + 'Recepción 🎉 '.repeat(30) + '\\nUno\\nDos\\nTres');
  });

  it('allowlists public data and keeps the UID stable without secrets', () => {
    const projection = {
      ...event,
      invitationToken: 'secret-invitation',
      qrToken: 'secret-qr',
      nonce: 'secret-nonce',
      contactId: 'private-contact',
      clientId: 'private-client',
      phone: '+525512345678',
      invitationUrl: 'https://private.test/invitacion/secret'
    };
    const data = toCalendarEventData(projection)!;
    const ics = buildIcsCalendar(data);
    for (const secret of [
      'secret-invitation',
      'secret-qr',
      'secret-nonce',
      'private-contact',
      'private-client',
      '+525512345678',
      'private.test'
    ])
      expect(ics).not.toContain(secret);
    expect(ics.match(/UID:.+/u)?.[0]).toBe(buildIcsCalendar(data, new Date('2030-01-01')).match(/UID:.+/u)?.[0]);
    expect(buildIcsCalendar({ ...data, locationUrl: null })).not.toContain('LOCATION:');
  });
});
