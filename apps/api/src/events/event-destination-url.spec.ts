import { describe, expect, it } from 'vitest';
import { EVENT_DESTINATION_URL_CORPUS } from './event-destination-url.corpus';
import { normalizeEventDestinationUrl } from './event-destination-url';

describe('normalizeEventDestinationUrl', () => {
  it.each(EVENT_DESTINATION_URL_CORPUS)('$name', ({ url, accepted }) => {
    const normalized = normalizeEventDestinationUrl(url);
    if (accepted) expect(normalized).toBe(new URL(url).href);
    else expect(normalized).toBeNull();
  });
});
