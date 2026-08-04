export function scrollToLandingSection(href: string): boolean {
  const element = document.querySelector(href);
  if (!element) return false;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  return true;
}
