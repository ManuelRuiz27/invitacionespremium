import type { AdminPrice, PublicPricing } from '@invitaciones/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';
import { toLocalInput } from './catalog-format';

const services = ['PHYSICAL_QR', 'FLYER', 'FLIPBOOK'] as const;
const credits = [
  [125, 150, 175],
  [225, 275, 325],
  [300, 350, 400]
];
const prices: AdminPrice[] = services.flatMap((code, serviceIndex) =>
  [
    [1, 50],
    [51, 100],
    [101, 150]
  ].map(([min, max], range) => ({
    id: `${code}-${min}`,
    serviceId: `service-${code}`,
    serviceCode: code,
    pricingVersion: 2,
    clientType: null,
    commercialChannel: 'STANDARD',
    capacityMin: min!,
    capacityMax: max!,
    venueTier: null,
    credits: credits[serviceIndex]![range]!,
    validFrom: '2020-01-01T00:00:00.000Z',
    validUntil: null,
    createdAt: '2020-01-01T00:00:00.000Z'
  }))
);
const publication: PublicPricing[] = prices.map((price) => ({
  serviceCode: price.serviceCode,
  displayName: price.serviceCode,
  capacityMin: price.capacityMin!,
  capacityMax: price.capacityMax!,
  credits: price.credits,
  amountMxnCents: price.credits * 2000,
  validFrom: price.validFrom,
  validUntil: price.validUntil
}));

describe('matriz pública STANDARD', () => {
  it('muestra nueve tarifas vigentes y separa futuros, legado, PARTNER y VENUE', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([
      ...prices.map((price, index) => (index === 0 ? { ...price, validUntil: '2099-01-01T00:00:00.000Z' } : price)),
      { ...prices[0]!, id: 'scheduled', credits: 160, validFrom: '2099-01-01T00:00:00.000Z' },
      { ...prices[0]!, id: 'partner', commercialChannel: 'PARTNER', credits: 80 },
      {
        ...prices[0]!,
        id: 'venue',
        commercialChannel: 'VENUE',
        capacityMin: null,
        capacityMax: null,
        venueTier: 'ONE_TO_TWO',
        credits: 90
      },
      {
        ...prices[0]!,
        id: 'legacy',
        pricingVersion: 1,
        clientType: 'PLANNER',
        commercialChannel: null,
        capacityMin: null,
        capacityMax: null,
        credits: 15
      }
    ]);
    vi.mocked(api.publicPricing.list).mockResolvedValue(
      publication.map((price, index) => (index === 0 ? { ...price, validUntil: '2099-01-01T00:00:00.000Z' } : price))
    );
    await openPrices(api);
    expect(await screen.findByText('9 de 9 tarifas publicadas y coincidentes con el historial vigente.')).toBeVisible();
    const matrix = screen.getByRole('region', { name: 'Tarifas públicas STANDARD' });
    expect(within(matrix).getAllByRole('article')).toHaveLength(9);
    expect(within(matrix).getAllByText('Tarifa vigente')).toHaveLength(9);
    expect(within(matrix).getByText(/Programada: 160 créditos/)).toBeVisible();
    expect(within(matrix).queryByText(/80 créditos|90 créditos|15 créditos/)).not.toBeInTheDocument();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('distingue una tarifa existente no publicada de una realmente faltante', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue(prices.filter((price) => price.id !== 'PHYSICAL_QR-101'));
    vi.mocked(api.publicPricing.list).mockResolvedValue(
      publication.filter(
        (price) => price.serviceCode !== 'FLYER' && !(price.serviceCode === 'PHYSICAL_QR' && price.capacityMin === 101)
      )
    );
    await openPrices(api);
    expect(await screen.findByText('5 de 9 tarifas publicadas y coincidentes con el historial vigente.')).toBeVisible();
    const flyer = within(screen.getByRole('article', { name: 'Flyer · 1–50 personas' }));
    expect(flyer.getByText('Tarifa vigente')).toBeVisible();
    expect(flyer.getByText('No publicada o no coincide con la API pública')).toBeVisible();
    const missing = within(screen.getByRole('article', { name: 'Pase fisico QR · 101–150 personas' }));
    expect(missing.getByText('Tarifa vigente faltante')).toBeVisible();
    await userEvent.click(missing.getByRole('button', { name: 'Configurar tarifa' }));
    expect(screen.getByLabelText('Servicio')).toHaveTextContent('Pase fisico QR');
    expect(screen.getByLabelText('Canal comercial')).toHaveTextContent('Estándar / PVP');
    expect(screen.getByLabelText('Capacidad mínima')).toHaveValue(101);
    expect(screen.getByLabelText('Capacidad máxima')).toHaveValue(150);
    expect(screen.getByLabelText('Creditos')).toHaveValue(null);
  });

  it('crea una tarifa faltante y vuelve a consultar publicación e historial sin precios optimistas', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue(prices.slice(1));
    vi.mocked(api.publicPricing.list).mockResolvedValue(publication.slice(1));
    vi.mocked(api.adminCatalog.createPrice).mockImplementation(async () => {
      vi.mocked(api.adminCatalog.listPrices).mockResolvedValue(prices);
      vi.mocked(api.publicPricing.list).mockResolvedValue(publication);
      return prices[0]!;
    });
    await openPrices(api);
    await screen.findByText('8 de 9 tarifas publicadas y coincidentes con el historial vigente.');
    const cell = within(screen.getByRole('article', { name: 'Pase fisico QR · 1–50 personas' }));
    await userEvent.click(cell.getByRole('button', { name: 'Configurar tarifa' }));
    await userEvent.type(screen.getByLabelText('Creditos'), '125');
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), {
      target: { value: toLocalInput(prices[0]!.validFrom) }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
    expect(await screen.findByText('9 de 9 tarifas publicadas y coincidentes con el historial vigente.')).toBeVisible();
    expect(api.adminCatalog.createPrice).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ commercialChannel: 'STANDARD', capacityMin: 1, capacityMax: 50, credits: 125 }),
      expect.any(AbortSignal)
    );
    expect(api.adminCatalog.listPrices).toHaveBeenCalledTimes(2);
    expect(api.publicPricing.list).toHaveBeenCalledTimes(2);
  });

  it('retira la confirmación pública al fallar la actualización aunque conserve datos en caché', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue(prices);
    vi.mocked(api.publicPricing.list).mockResolvedValueOnce(publication).mockRejectedValueOnce(new Error('network'));
    await openPrices(api);
    await screen.findByText('9 de 9 tarifas publicadas y coincidentes con el historial vigente.');
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar catálogo' }));
    expect(await screen.findByText(/No pudimos verificar la publicación/)).toBeVisible();
    expect(
      screen.queryByText('9 de 9 tarifas publicadas y coincidentes con el historial vigente.')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Publicación sin verificar')).toHaveLength(9));
  });
});

async function openPrices(api: ReturnType<typeof mockAdminApi>) {
  renderAdminApp(api, '/catalogo');
  await screen.findByRole('heading', { name: 'Catálogo' });
  await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
}
