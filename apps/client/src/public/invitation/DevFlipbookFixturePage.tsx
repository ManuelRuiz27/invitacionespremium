import { useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { Alert, Stack, Typography } from '@mui/material';
import { PublicLayout } from '../PublicLayout';
import { FlipbookRenderer } from './FlipbookRenderer';

const token = 'flipbook-magazine-local-fixture';
const assetIds = [
  '5c643f2f-7247-42a3-8348-000000000001',
  '5c643f2f-7247-42a3-8348-000000000002',
  '5c643f2f-7247-42a3-8348-000000000003',
  '5c643f2f-7247-42a3-8348-000000000004',
  '5c643f2f-7247-42a3-8348-000000000005'
];

const fixtureApiClient = {
  publicInvitation: {
    asset: async (_token: string, assetId: string) => new Blob([fixturePageSvg(assetIds.indexOf(assetId) + 1)], { type: 'image/svg+xml' })
  }
} as unknown as ApiClient;

const fixtureView = {
  status: 'AVAILABLE',
  designType: 'FLIPBOOK',
  qr: { available: false },
  design: {
    type: 'FLIPBOOK',
    pages: assetIds.map((assetId, index) => ({
      id: `fixture-page-${index + 1}`,
      position: index + 1,
      asset: { id: assetId, contentPath: `/api/v1/public/invitations/${token}/assets/${assetId}/content` }
    })),
    hotspots: [
      fixtureHotspot('fixture-rsvp', 'RSVP', 'fixture-page-1', 0.12, 0.72, 0.34, 0.1),
      fixtureHotspot('fixture-qr', 'QR_AREA', 'fixture-page-3', 0.3, 0.58, 0.34, 0.12),
      fixtureHotspot('fixture-link', 'EXTERNAL_LINK', 'fixture-page-5', 0.18, 0.78, 0.42, 0.1, 'https://example.com/mesa-regalos')
    ]
  }
} as unknown as PublicInvitationView;

export function DevFlipbookFixturePage() {
  const [notice, setNotice] = useState<string>();
  return (
    <PublicLayout>
      <Stack spacing={3}>
        <Stack spacing={0.5}>
          <Typography component="h1" variant="h2">
            Flipbook Magazine · fixture local
          </Typography>
          <Typography color="text.secondary">Cinco páginas con acciones en portada, interior y cierre.</Typography>
        </Stack>
        {notice ? <Alert severity="info">{notice}</Alert> : null}
        <FlipbookRenderer
          apiClient={fixtureApiClient}
          token={token}
          view={fixtureView}
          onRsvp={() => setNotice('La acción de Confirmar asistencia fue activada.')}
          onQr={() => setNotice('La acción de QR fue activada.')}
          onUnavailableQr={() => setNotice('El QR no está disponible en este fixture.')}
        />
      </Stack>
    </PublicLayout>
  );
}

function fixtureHotspot(
  id: string,
  action: 'RSVP' | 'QR_AREA' | 'EXTERNAL_LINK',
  flipbookPageId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  destination: string | null = null
) {
  return { id, action, destination, flipbookPageId, visualOwnerType: 'FLIPBOOK_PAGE', x, y, width, height, priority: 0 };
}

function fixturePageSvg(page: number): string {
  const colors = ['#d9b48f', '#6b7c72', '#b7625d', '#7e6e9e', '#b88b4a'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="1520" viewBox="0 0 1120 1520">
  <rect width="1120" height="1520" fill="#f8f1e8"/>
  <rect x="70" y="70" width="980" height="1380" rx="18" fill="${colors[page - 1]}" opacity=".18"/>
  <path d="M0 1080 C260 930 670 1240 1120 970 V1520 H0Z" fill="${colors[page - 1]}" opacity=".8"/>
  <text x="110" y="220" font-family="Georgia, serif" font-size="46" fill="#332b25" letter-spacing="8">INVITACIONES PREMIUM</text>
  <text x="110" y="450" font-family="Georgia, serif" font-size="152" fill="#332b25">${page === 1 ? 'Ana & Luis' : `Capítulo ${page}`}</text>
  <text x="116" y="535" font-family="Arial, sans-serif" font-size="35" fill="#4c4037">Fixture local para QA visual</text>
  <text x="110" y="1360" font-family="Arial, sans-serif" font-size="28" fill="#f8f1e8">PÁGINA ${page} DE 5</text>
</svg>`;
}
