const supportedHostname =
  /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])(?:\.(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9]))*$/iu;

export function isValidInvitationExternalUrl(value: string): boolean {
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (
    value.length === 0 ||
    value.length > 2048 ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    /\s/u.test(value) ||
    hasControlCharacter
  ) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.hostname.length > 0 &&
      supportedHostname.test(url.hostname) &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}
