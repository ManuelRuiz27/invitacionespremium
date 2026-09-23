import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { Box, Typography } from '@mui/material';
import { PublicInvitationTokenPage } from './PublicInvitationPage';

const token = 'flipbook-magazine-local-fixture';
const params = new URLSearchParams(window.location.search);
const requestedCount = Number(params.get('pages') ?? 6);
const pageCount = [1, 2, 3, 4, 5, 6, 10].includes(requestedCount) ? requestedCount : 6;
const assetIds = Array.from({ length: pageCount }, (_, index) => `5c643f2f-7247-42a3-8348-${String(index + 1).padStart(12, '0')}`);

const fixtureApiClient = {
  publicInvitation: {
    resolve: async () => fixtureView,
    qr: async () =>
      new Blob(
        [
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="390 670 336 336"><rect x="390" y="670" width="336" height="336" fill="white"/><g fill="#111827">${fakeQr()}</g></svg>`
        ],
        { type: 'image/svg+xml' }
      ),
    asset: async (_token: string, assetId: string) => {
      const page = assetIds.indexOf(assetId) + 1;
      if (page < 1) throw new Error('Fixture asset not found');
      if (params.has('slow') && page === 2) await new Promise((resolve) => window.setTimeout(resolve, 1800));
      return new Blob([fixturePageSvg(page)], { type: 'image/svg+xml' });
    }
  }
} as unknown as ApiClient;

const fixtureView = {
  status: 'AVAILABLE',
  designType: 'FLIPBOOK',
  event: { name: 'Ana & Luis', eventDateTime: '2026-09-14T23:30:00Z', timeZone: 'America/Mexico_City' },
  invitation: { id: 'fixture-invitation', mode: 'INDIVIDUAL', responseStatus: 'CONFIRMED', additionalAssistantLimit: 0 },
  assistants: [{ id: 'fixture-primary', name: 'Invitado de prueba', isPrimary: true, responseStatus: 'CONFIRMED' }],
  confirmation: { open: true },
  qr: { available: true },
  design: {
    type: 'FLIPBOOK',
    pages: assetIds.map((assetId, index) => ({
      id: `fixture-page-${index + 1}`,
      position: index + 1,
      asset: { id: assetId, contentPath: `/api/v1/public/invitations/${token}/assets/${assetId}/content` }
    })),
    hotspots: [
      fixtureHotspot('fixture-rsvp', 'RSVP', 'fixture-page-1', 0.16, 0.73, 0.36, 0.1),
      fixtureHotspot('fixture-qr', 'QR_AREA', 'fixture-page-3', 370 / 1120, 650 / 1520, 380 / 1120, 380 / 1520),
      fixtureHotspot(
        'fixture-location',
        'LOCATION',
        'fixture-page-4',
        0.16,
        0.78,
        0.43,
        0.1,
        'https://maps.google.com/'
      ),
      fixtureHotspot(
        'fixture-gift',
        'GIFT_REGISTRY',
        'fixture-page-5',
        0.16,
        0.68,
        0.43,
        0.1,
        'https://example.com/mesa-regalos'
      ),
      fixtureHotspot(
        'fixture-link',
        'EXTERNAL_LINK',
        'fixture-page-5',
        0.16,
        0.82,
        0.43,
        0.08,
        'https://example.com/nuestra-historia'
      )
    ].filter((hotspot) => Number(hotspot.flipbookPageId.split('-').at(-1)) <= pageCount)
  }
} as unknown as PublicInvitationView;

export function DevFlipbookFixturePage() {
  return (
    <>
      <PublicInvitationTokenPage apiClient={fixtureApiClient} invitationToken={token} />
      <Box component="aside" sx={{ p: 2 }} aria-label="Opciones del fixture">
        <Typography>Demo local · sin API ni storage. Confirmación disponible para inspección, sin guardar.</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, my: 2 }}>
          {[1, 2, 3, 4, 5, 6, 10].map((count) => <a key={count} href={`?pages=${count}`}>{count} páginas</a>)}
          <a href="?pages=6&mixed">Proporciones diferentes</a>
          <a href="?pages=6&slow">Asset lento</a>
        </Box>
      </Box>
    </>
  );
}

function fixtureHotspot(
  id: string,
  action: 'RSVP' | 'QR_AREA' | 'LOCATION' | 'GIFT_REGISTRY' | 'EXTERNAL_LINK',
  flipbookPageId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  destination: string | null = null
) {
  return {
    id,
    action,
    destination,
    flipbookPageId,
    visualOwnerType: 'FLIPBOOK_PAGE',
    x,
    y,
    width,
    height,
    priority: 0
  };
}

function fixturePageSvg(page: number): string {
  const pageContent = [
    `<text x="560" y="235" text-anchor="middle" class="eyebrow">NUESTRA BODA</text>
     <text x="560" y="555" text-anchor="middle" class="names">Ana &amp; Luis</text>
     <text x="560" y="645" text-anchor="middle" class="subtitle">14 · SEPTIEMBRE · 2026</text>
     <path d="M360 710 H760" class="rule"/>
     <text x="560" y="790" text-anchor="middle" class="body">Nos encantará compartir este día contigo.</text>
     <text x="560" y="900" text-anchor="middle" class="hint">Toca “Confirmar asistencia”</text>`,
    `<text x="120" y="245" class="eyebrow">NUESTRA HISTORIA</text>
     <text x="120" y="410" class="heading">Todo comenzó</text>
     <text x="120" y="475" class="body">con una conversación que se convirtió</text>
     <text x="120" y="525" class="body">en viajes, domingos y muchos planes.</text>
     <circle cx="220" cy="720" r="26" class="dot"/><path d="M246 720 H820" class="timeline"/>
     <circle cx="520" cy="720" r="26" class="dot"/><circle cx="820" cy="720" r="26" class="dot"/>
     <text x="180" y="800" class="caption">2019</text><text x="480" y="800" class="caption">2023</text><text x="780" y="800" class="caption">2026</text>
     <text x="140" y="855" class="small">Nos conocimos</text><text x="430" y="855" class="small">Dijimos sí</text><text x="730" y="855" class="small">Nos casamos</text>`,
    `<text x="560" y="245" text-anchor="middle" class="eyebrow">CONFIRMACIÓN</text>
     <text x="560" y="395" text-anchor="middle" class="heading">Queremos contar contigo</text>
     <text x="560" y="475" text-anchor="middle" class="body">Confirma tu asistencia y guarda tu acceso.</text>
     <rect x="370" y="650" width="380" height="380" rx="28" class="qrbox"/>
     <g fill="#2c322d">${fakeQr()}</g>
     <text x="560" y="1110" text-anchor="middle" class="hint">Área QR interactiva</text>`,
    `<text x="120" y="245" class="eyebrow">CEREMONIA &amp; RECEPCIÓN</text>
     <text x="120" y="410" class="heading">Hacienda Los Olivos</text>
     <text x="120" y="485" class="body">Sábado 14 de septiembre · 17:30 h</text>
     <rect x="120" y="610" width="880" height="410" rx="36" class="map"/>
     <path d="M560 735 C500 735 460 780 460 835 C460 925 560 1010 560 1010 C560 1010 660 925 660 835 C660 780 620 735 560 735Z" class="pin"/>
     <circle cx="560" cy="835" r="32" fill="#f9f4ec"/>
     <text x="120" y="1190" class="hint">Usa “Ver ubicación” para probar el hotspot.</text>`,
    `<text x="120" y="245" class="eyebrow">DETALLES</text>
     <text x="120" y="410" class="heading">Mesa de regalos</text>
     <text x="120" y="485" class="body">Tu presencia es nuestro mejor regalo.</text>
     <rect x="380" y="635" width="360" height="300" rx="28" class="gift"/>
     <rect x="445" y="735" width="230" height="200" rx="12" fill="#d2b58b"/>
     <rect x="425" y="695" width="270" height="55" rx="12" fill="#b99464"/>
     <path d="M560 695 V935 M445 795 H675" class="giftline"/>
     <path d="M560 690 C500 640 475 590 515 565 C555 540 575 590 560 690 C575 590 595 540 635 565 C675 590 645 640 560 690Z" fill="none" stroke="#8d704e" stroke-width="18"/>
     <text x="120" y="1140" class="hint">Prueba Mesa de regalos y Enlace adicional.</text>`,
    `<text x="560" y="430" text-anchor="middle" class="eyebrow">GRACIAS</text>
     <text x="560" y="625" text-anchor="middle" class="names smallnames">Nos vemos pronto</text>
     <path d="M380 710 H740" class="rule"/>
     <text x="560" y="805" text-anchor="middle" class="body">Ana &amp; Luis · 14.09.2026</text>
     <text x="560" y="1000" text-anchor="middle" class="hint">InvitacionesPremium · Flipbook Magazine</text>`
  ][page === pageCount && pageCount > 1 ? 5 : (page - 1) % 5];

  const assetWidth = params.has('mixed') && page === 2 ? 1520 : 1120;
  const assetHeight = params.has('mixed') ? (page === 2 ? 1120 : page === 3 ? 2800 : 1520) : 1520;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${assetWidth}" height="${assetHeight}" viewBox="0 0 1120 1520">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf3"/><stop offset="1" stop-color="#eee2d2"/></linearGradient>
    <style>
      .eyebrow{font:600 30px Arial,sans-serif;letter-spacing:9px;fill:#75634f}.names{font:italic 132px Georgia,serif;fill:#42372d}.smallnames{font-size:94px}.heading{font:italic 78px Georgia,serif;fill:#42372d}.subtitle{font:500 28px Arial,sans-serif;letter-spacing:5px;fill:#75634f}.body{font:34px Georgia,serif;fill:#5a4c40}.hint{font:600 26px Arial,sans-serif;letter-spacing:2px;fill:#8a704f}.caption{font:600 24px Arial,sans-serif;fill:#6d5a48}.small{font:26px Georgia,serif;fill:#5a4c40}.rule,.timeline{stroke:#b99564;stroke-width:3}.dot{fill:#b99564}.qrbox{fill:#fff;stroke:#c8ac83;stroke-width:4}.map{fill:#d9dfd6;stroke:#a9b5a6;stroke-width:4}.pin{fill:#657b69}.gift{fill:#f4eadc;stroke:#c8ac83;stroke-width:4}.giftline{fill:none;stroke:#8d704e;stroke-width:12}
    </style>
  </defs>
  <rect width="1120" height="1520" fill="url(#paper)"/>
  <rect x="46" y="46" width="1028" height="1428" rx="28" fill="none" stroke="#c9ad83" stroke-width="2"/>
  <g opacity=".9" fill="none" stroke="#72816f" stroke-width="7" stroke-linecap="round">
    <path d="M65 245 C115 160 160 115 260 85 M95 205 C145 215 185 200 215 160 M140 150 C125 115 130 90 150 65"/>
    <path d="M1055 1275 C1005 1360 960 1405 860 1435 M1025 1315 C975 1305 935 1320 905 1360 M980 1370 C995 1405 990 1430 970 1455"/>
  </g>
  ${pageContent ?? ''}
  ${page === 1 ? '<rect x="179" y="1110" width="403" height="152" rx="16" fill="#e1d0b6"/><text x="200" y="1195" class="caption">Confirmar asistencia</text>' : ''}
  <text x="1000" y="1430" text-anchor="end" class="caption">${page} / ${pageCount}</text>
</svg>`;
}

function fakeQr(): string {
  const cells: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [0, 1],
    [4, 1],
    [0, 2],
    [2, 2],
    [4, 2],
    [0, 3],
    [4, 3],
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [7, 0],
    [8, 0],
    [9, 0],
    [10, 0],
    [11, 0],
    [7, 1],
    [11, 1],
    [7, 2],
    [9, 2],
    [11, 2],
    [7, 3],
    [11, 3],
    [7, 4],
    [8, 4],
    [9, 4],
    [10, 4],
    [11, 4],
    [0, 7],
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [0, 8],
    [4, 8],
    [0, 9],
    [2, 9],
    [4, 9],
    [0, 10],
    [4, 10],
    [0, 11],
    [1, 11],
    [2, 11],
    [3, 11],
    [4, 11],
    [6, 6],
    [8, 6],
    [10, 6],
    [6, 7],
    [7, 8],
    [9, 8],
    [11, 8],
    [6, 9],
    [8, 9],
    [10, 10],
    [11, 11],
    [7, 11],
    [9, 6],
    [11, 6],
    [6, 11]
  ];
  return cells
    .map(([x, y]) => `<rect x="${414 + x * 24}" y="${694 + y * 24}" width="20" height="20" rx="2"/>`)
    .join('');
}
