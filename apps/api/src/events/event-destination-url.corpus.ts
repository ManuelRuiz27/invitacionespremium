export interface EventDestinationUrlCase {
  name: string;
  url: string;
  accepted: boolean;
}

export const EVENT_DESTINATION_URL_CORPUS: readonly EventDestinationUrlCase[] = [
  {
    name: 'maps query',
    url: 'https://maps.google.com/?q=19.4326,-99.1332',
    accepted: true
  },
  {
    name: 'place path',
    url: 'https://maps.google.com/maps/place/Salon',
    accepted: true
  },
  {
    name: 'registry query',
    url: 'https://example.com/mesa?evento=1',
    accepted: true
  },
  {
    name: 'encoded path space',
    url: 'https://example.com/maps/place/Salon%20Principal',
    accepted: true
  },
  {
    name: 'encoded query value space',
    url: 'https://example.com/mesa?evento=Salon%20Principal',
    accepted: true
  },
  {
    name: 'valid UTF-8 in path and query value',
    url: 'https://example.com/sal%C3%B3n?zona=peque%C3%B1a',
    accepted: true
  },
  {
    name: 'valid lowercase UTF-8 encoding',
    url: 'https://example.com/sal%c3%b3n',
    accepted: true
  },
  {
    name: 'multiple question marks in valid query value',
    url: 'https://example.com/?evento=principal?extra=valor',
    accepted: true
  },
  {
    name: 'multiple ampersands and empty query parts',
    url: 'https://example.com/?a=1&&b=2&',
    accepted: true
  },
  {
    name: 'query key without equals',
    url: 'https://example.com/?evento',
    accepted: true
  },
  {
    name: 'query value containing equals',
    url: 'https://example.com/?evento=uno=dos',
    accepted: true
  },
  {
    name: 'empty query',
    url: 'https://example.com/?',
    accepted: true
  },
  {
    name: 'LF in path',
    url: 'https://example.com/%0A',
    accepted: false
  },
  {
    name: 'lowercase LF in path',
    url: 'https://example.com/%0a',
    accepted: false
  },
  {
    name: 'TAB in path',
    url: 'https://example.com/%09',
    accepted: false
  },
  {
    name: 'NULL in path',
    url: 'https://example.com/%00',
    accepted: false
  },
  {
    name: 'DEL in path',
    url: 'https://example.com/%7f',
    accepted: false
  },
  {
    name: 'double encoded LF in path',
    url: 'https://example.com/%250A',
    accepted: false
  },
  {
    name: 'triple encoded LF in path',
    url: 'https://example.com/%25250a',
    accepted: false
  },
  {
    name: 'LF in query key',
    url: 'https://example.com/?evento%0A=123',
    accepted: false
  },
  {
    name: 'CRLF in query value',
    url: 'https://example.com/?evento=%0D%0Avalor',
    accepted: false
  },
  {
    name: 'TAB before reserved query key',
    url: 'https://example.com/?%09token=secret',
    accepted: false
  },
  {
    name: 'encoded backslash in path',
    url: 'https://example.com/ruta/%5Cinterno',
    accepted: false
  },
  {
    name: 'lowercase encoded backslash in path',
    url: 'https://example.com/ruta/%5cinterno',
    accepted: false
  },
  {
    name: 'double encoded TAB in query value',
    url: 'https://example.com/?evento=%2509valor',
    accepted: false
  },
  {
    name: 'triple encoded DEL in query key',
    url: 'https://example.com/?evento%25257F=123',
    accepted: false
  },
  {
    name: 'encoded space in query key',
    url: 'https://example.com/?evento%20dia=123',
    accepted: false
  },
  {
    name: 'encoded space in authority',
    url: 'https://example%20.com/ruta',
    accepted: false
  },
  {
    name: 'encoded slash in query value',
    url: 'https://example.com/?evento=uno%2Fdos',
    accepted: false
  },
  {
    name: 'encoded fragment marker in path',
    url: 'https://example.com/ruta/%23interno',
    accepted: false
  },
  {
    name: 'encoded token key',
    url: 'https://example.com/?%74oken=secret',
    accepted: false
  },
  {
    name: 'double encoded token key',
    url: 'https://example.com/?%2574oken=secret',
    accepted: false
  },
  {
    name: 'reserved token path',
    url: 'https://example.com/ruta/token/secret',
    accepted: false
  },
  {
    name: 'reserved phone path',
    url: 'https://example.com/ruta/telefono/555',
    accepted: false
  },
  {
    name: 'reserved invitation key with separators',
    url: 'https://example.com/?INVITATION-TOKEN=secret',
    accepted: false
  },
  {
    name: 'credentials',
    url: 'https://user:password@example.com/ruta',
    accepted: false
  },
  {
    name: 'literal fragment',
    url: 'https://example.com/ruta#fragment',
    accepted: false
  },
  {
    name: 'literal space',
    url: 'https://example.com/Salon Principal',
    accepted: false
  },
  {
    name: 'leading literal space',
    url: ' https://example.com/ruta',
    accepted: false
  },
  {
    name: 'trailing literal space',
    url: 'https://example.com/ruta ',
    accepted: false
  },
  {
    name: 'bare percent in path',
    url: 'https://example.com/%',
    accepted: false
  },
  {
    name: 'truncated percent escape in path',
    url: 'https://example.com/%2',
    accepted: false
  },
  {
    name: 'non-hex percent escape in path',
    url: 'https://example.com/%ZZ',
    accepted: false
  },
  {
    name: 'bare percent in query value',
    url: 'https://example.com/?evento=%',
    accepted: false
  },
  {
    name: 'non-hex percent escape in query value',
    url: 'https://example.com/?evento=%G0',
    accepted: false
  },
  {
    name: 'non-hex percent escape in query key',
    url: 'https://example.com/?%ZZ=valor',
    accepted: false
  },
  {
    name: 'overlong two-byte UTF-8',
    url: 'https://example.com/%C0%AF',
    accepted: false
  },
  {
    name: 'overlong three-byte UTF-8',
    url: 'https://example.com/%E0%80%AF',
    accepted: false
  },
  {
    name: 'overlong four-byte UTF-8',
    url: 'https://example.com/%F0%80%80%AF',
    accepted: false
  },
  {
    name: 'truncated UTF-8 sequence',
    url: 'https://example.com/%C3',
    accepted: false
  },
  {
    name: 'lone UTF-8 continuation byte',
    url: 'https://example.com/%B3',
    accepted: false
  },
  {
    name: 'control after second question mark',
    url: 'https://example.com/?evento=principal?extra=%0A',
    accepted: false
  },
  {
    name: 'double encoded control after second question mark',
    url: 'https://example.com/?evento=principal?extra=%250A',
    accepted: false
  },
  {
    name: 'malformed escape after second question mark',
    url: 'https://example.com/?evento=principal?extra=%ZZ',
    accepted: false
  }
] as const;
