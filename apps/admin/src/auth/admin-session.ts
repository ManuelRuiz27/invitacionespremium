export type AdminAuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'forbidden' | 'unavailable';

export function safeAdminReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const parsed = new URL(value, 'https://admin.invalid');
    if (parsed.origin !== 'https://admin.invalid' || parsed.pathname === '/login') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}
