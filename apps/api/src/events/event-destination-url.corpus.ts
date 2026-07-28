export interface EventDestinationUrlCase {
  name: string;
  url: string;
  accepted: boolean;
  field: 'locationUrl' | 'giftRegistryUrl';
}

export const EVENT_DESTINATION_URL_CORPUS: readonly EventDestinationUrlCase[] = [
  {
    name: 'maps query',
    url: 'https://maps.google.com/?q=19.4326,-99.1332',
    accepted: true,
    field: 'locationUrl'
  },
  {
    name: 'place path',
    url: 'https://maps.google.com/maps/place/Salon',
    accepted: true,
    field: 'locationUrl'
  },
  {
    name: 'registry query',
    url: 'https://example.com/mesa?evento=1',
    accepted: true,
    field: 'giftRegistryUrl'
  },
  {
    name: 'encoded path space',
    url: 'https://example.com/maps/place/Salon%20Principal',
    accepted: true,
    field: 'locationUrl'
  },
  {
    name: 'encoded query value space',
    url: 'https://example.com/mesa?evento=Salon%20Principal',
    accepted: true,
    field: 'giftRegistryUrl'
  },
  {
    name: 'LF in path',
    url: 'https://example.com/%0A',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'lowercase LF in path',
    url: 'https://example.com/%0a',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'TAB in path',
    url: 'https://example.com/%09',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'NULL in path',
    url: 'https://example.com/%00',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'DEL in path',
    url: 'https://example.com/%7f',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'double encoded LF in path',
    url: 'https://example.com/%250A',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'triple encoded LF in path',
    url: 'https://example.com/%25250a',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'LF in query key',
    url: 'https://example.com/?evento%0A=123',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'CRLF in query value',
    url: 'https://example.com/?evento=%0D%0Avalor',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'TAB before reserved query key',
    url: 'https://example.com/?%09token=secret',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'encoded backslash in path',
    url: 'https://example.com/ruta/%5Cinterno',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'lowercase encoded backslash in path',
    url: 'https://example.com/ruta/%5cinterno',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'double encoded TAB in query value',
    url: 'https://example.com/?evento=%2509valor',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'triple encoded DEL in query key',
    url: 'https://example.com/?evento%25257F=123',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'encoded space in query key',
    url: 'https://example.com/?evento%20dia=123',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'encoded space in authority',
    url: 'https://example%20.com/ruta',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'encoded slash in query value',
    url: 'https://example.com/?evento=uno%2Fdos',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'encoded fragment marker in path',
    url: 'https://example.com/ruta/%23interno',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'encoded token key',
    url: 'https://example.com/?%74oken=secret',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'double encoded token key',
    url: 'https://example.com/?%2574oken=secret',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'reserved token path',
    url: 'https://example.com/ruta/token/secret',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'reserved phone path',
    url: 'https://example.com/ruta/telefono/555',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'reserved invitation key with separators',
    url: 'https://example.com/?INVITATION-TOKEN=secret',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'credentials',
    url: 'https://user:password@example.com/ruta',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'literal fragment',
    url: 'https://example.com/ruta#fragment',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'literal space',
    url: 'https://example.com/Salon Principal',
    accepted: false,
    field: 'locationUrl'
  },
  {
    name: 'leading literal space',
    url: ' https://example.com/ruta',
    accepted: false,
    field: 'giftRegistryUrl'
  },
  {
    name: 'trailing literal space',
    url: 'https://example.com/ruta ',
    accepted: false,
    field: 'locationUrl'
  }
] as const;
