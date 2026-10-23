/** Adds the guest label only to the printable composition; the downloaded QR remains unchanged. */
export function nominalCredentialPrintableSvg(source: string, name: string): string {
  const namespace = 'http://www.w3.org/2000/svg';
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const qr = parsed.documentElement;
  if (qr.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('INVALID_CREDENTIAL_SVG');
  const document = new DOMParser().parseFromString(
    `<svg xmlns="${namespace}" viewBox="0 0 800 360" width="800" height="360"></svg>`,
    'image/svg+xml'
  );
  const root = document.documentElement;
  const image = document.importNode(qr, true);
  image.setAttribute('x', '0');
  image.setAttribute('y', '0');
  image.setAttribute('width', '360');
  image.setAttribute('height', '360');
  root.append(image);
  const lines = name.match(/.{1,26}/gu)?.slice(0, 5) ?? ['Invitado'];
  lines.forEach((line, index) => {
    const text = document.createElementNS(namespace, 'text');
    text.setAttribute('x', '380');
    text.setAttribute('y', String(100 + index * 34));
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('font-size', '26');
    text.textContent = line;
    root.append(text);
  });
  return new XMLSerializer().serializeToString(root);
}
