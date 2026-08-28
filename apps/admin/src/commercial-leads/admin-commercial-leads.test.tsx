import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderAdminApp } from '../test/render-admin-app';
import { commercialLead, mockAdminApi } from '../test/fixtures';

describe('administrative commercial leads', () => {
  it('exposes Oportunidades navigation and renders the read-only list', async () => {
    renderAdminApp(mockAdminApi(), '/oportunidades');
    expect(await screen.findByRole('heading', { name: 'Oportunidades' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Oportunidades/i })).toBeInTheDocument();
    expect((await screen.findAllByText(commercialLead.businessName)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(commercialLead.phone!).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /editar|borrar|aceptar|convertir|asignar/i })).not.toBeInTheDocument();
  });

  it('filters the list by opportunity type', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/oportunidades');
    await screen.findAllByText(commercialLead.businessName);
    fireEvent.mouseDown(screen.getByLabelText('Tipo de oportunidad'));
    fireEvent.click(await screen.findByRole('option', { name: 'Venue' }));
    await waitFor(() =>
      expect(api.adminCommercialLeads.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ opportunityType: 'VENUE' }),
        expect.any(AbortSignal)
      )
    );
  });

  it('shows empty and recoverable error states', async () => {
    const emptyApi = mockAdminApi();
    vi.mocked(emptyApi.adminCommercialLeads.list).mockResolvedValue({ items: [], nextCursor: null });
    const empty = renderAdminApp(emptyApi, '/oportunidades');
    expect(await screen.findByText('Sin oportunidades')).toBeInTheDocument();
    empty.unmount();

    const errorApi = mockAdminApi();
    vi.mocked(errorApi.adminCommercialLeads.list).mockRejectedValue(new Error('network'));
    renderAdminApp(errorApi, '/oportunidades');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('renders all contracted detail data and no CRM actions', async () => {
    renderAdminApp(mockAdminApi(), `/oportunidades/${commercialLead.id}`);
    expect(await screen.findByRole('heading', { name: commercialLead.businessName })).toBeInTheDocument();
    expect(screen.getByText(commercialLead.contactName)).toBeInTheDocument();
    expect(screen.getByText(commercialLead.email)).toBeInTheDocument();
    expect(screen.getByText(commercialLead.notes!)).toBeInTheDocument();
    expect(screen.getByText('Consentimiento de privacidad')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /editar|borrar|aceptar|rechazar|convertir|asignar/i })
    ).not.toBeInTheDocument();
  });
});
