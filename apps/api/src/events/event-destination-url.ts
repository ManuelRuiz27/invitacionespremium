const SENSITIVE_COMPONENTS = new Set([
  'token',
  'invitationtoken',
  'name',
  'nombre',
  'phone',
  'phonenumber',
  'telefono',
  'tel',
  'whatsapp'
]);

export function normalizeEventDestinationUrl(value: string): string | null {
  const input = value;
  if (
    input.length === 0 ||
    input.includes('\\') ||
    input.includes('#') ||
    [...input].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 || /\s/u.test(character);
    })
  ) {
    return null;
  }

  try {
    const url = new URL(input);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.hostname.length === 0 ||
      url.hash !== ''
    ) {
      return null;
    }

    const pathComponents = url.pathname.split('/').filter(Boolean);
    if (pathComponents.some((component) => !isValidComponent(component, true, true))) return null;

    const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
    for (const queryPart of rawQuery.split('&')) {
      if (queryPart === '') continue;
      const separator = queryPart.indexOf('=');
      const key = separator < 0 ? queryPart : queryPart.slice(0, separator);
      const queryValue = separator < 0 ? '' : queryPart.slice(separator + 1);
      if (!isValidComponent(key, false, true) || !isValidComponent(queryValue, true, false)) return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function isValidComponent(value: string, allowSpace: boolean, rejectSensitiveMaterial: boolean): boolean {
  let decoded = value;
  for (let pass = 0; pass < 4 && decoded.includes('%'); pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return false;
    }
  }
  if (
    [...decoded].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 || (!allowSpace && code === 32);
    }) ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('#')
  ) {
    return false;
  }
  if (!rejectSensitiveMaterial) return true;
  return !SENSITIVE_COMPONENTS.has(decoded.toLocaleLowerCase('en-US').replaceAll('-', '').replaceAll('_', ''));
}
