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
  const input = value.trim();
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
    if (pathComponents.some(isSensitiveComponent)) return null;
    if ([...url.searchParams.keys()].some(isSensitiveComponent)) return null;

    return url.href;
  } catch {
    return null;
  }
}

function isSensitiveComponent(value: string): boolean {
  let decoded = value;
  for (let pass = 0; pass < 4 && decoded.includes('%'); pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }
  if (decoded.includes('/') || decoded.includes('\\')) return true;
  return SENSITIVE_COMPONENTS.has(decoded.toLocaleLowerCase('en-US').replaceAll('-', '').replaceAll('_', ''));
}
