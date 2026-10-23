import { ApiError, type Event, type NominalAccessCredential, type PhysicalPass } from '@invitaciones/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient, organizationPlanner } from '../../test/fixtures';
import { renderApp } from '../../test/render-app';
import { createPhysicalPassesPdf } from '../../wizard/physical-passes/physical-passes-pdf';

vi.mock('../../wizard/physical-passes/physical-passes-pdf', () => ({
  createPhysicalPassesPdf: vi.fn().mockResolvedValue(new Blob(['PDF'], { type: 'application/pdf' }))
}));
const nominalEvent = { ...configuredEvent, serviceCode: 'ACCESS_CONTROL', accessMode: 'NOMINAL' } satisfies Event;
const anonymousEvent = { ...nominalEvent, accessMode: 'ANONYMOUS' } satisfies Event;
const user = { ...organizationPlanner, clientOperatingProfile: 'MANAGED' as const };
const contact = {
  id: 'contact-a',
  assistantId: 'assistant-a',
  eventId: nominalEvent.id,
  name: 'Ana Ruiz',
  whatsappPhone: null,
  groupId: null,
  anonymizedAt: null,
  createdAt: nominalEvent.createdAt,
  updatedAt: nominalEvent.updatedAt
};
const credential = {
  id: 'credential-a',
  eventId: nominalEvent.id,
  assistantId: 'assistant-a',
  status: 'ISSUED',
  issuedAt: '2026-10-22T10:00:00.000Z',
  revokedAt: null,
  revocationReasonCode: null,
  hasActiveCheckIn: false
} satisfies NominalAccessCredential;
const pass = {
  id: 'pass-a',
  eventId: nominalEvent.id,
  passNumber: 1,
  status: 'UNUSED',
  table: null,
  usedAt: null,
  createdAt: nominalEvent.createdAt
} satisfies PhysicalPass;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h10v10z"/></svg>';

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:access');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

function setup(event: Event = nominalEvent) {
  const api = mockApiClient(user);
  vi.mocked(api.events.get).mockResolvedValue(event);
  vi.mocked(api.contacts.list).mockResolvedValue([contact]);
  vi.mocked(api.contacts.create).mockResolvedValue(contact);
  vi.mocked(api.invitations.list).mockRejectedValue(new ApiError(409, 'INVITATION_INTERNAL_ONLY', 'Internal record'));
  vi.mocked(api.nominalAccessCredentials.svg).mockResolvedValue(svg);
  vi.mocked(api.physicalPasses.svg).mockResolvedValue(svg);
  return api;
}

describe('ACCESS_CONTROL Client workspace', () => {
  it('keeps nominal preparation in the existing workspace without RSVP, builders or Finance', async () => {
    const api = setup();
    renderApp(api, `/eventos/${nominalEvent.id}`);
    expect(await screen.findByRole('link', { name: 'Credenciales individuales' })).toBeInTheDocument();
    expect(await screen.findByText('Accesos vigentes: 0')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invitaciones' })).not.toBeInTheDocument();
    expect(api.finance.balance).not.toHaveBeenCalled();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
    expect(api.design.get).not.toHaveBeenCalled();
    expect(api.eventConfirmation.get).not.toHaveBeenCalled();
  });

  it('registers a nominal guest without phone and leaves the internal aggregate to the backend', async () => {
    const api = setup();
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=invitados`);
    const panel = await screen.findByTestId('guest-management-panel');
    await actor.type(within(panel).getByRole('textbox', { name: 'Nombre' }), 'Ana Ruiz');
    expect(within(panel).getByRole('textbox', { name: 'Teléfono (opcional)' })).not.toBeRequired();
    await actor.click(within(panel).getByRole('button', { name: 'Agregar' }));
    await waitFor(() =>
      expect(api.contacts.create).toHaveBeenCalledWith(nominalEvent.id, {
        name: 'Ana Ruiz',
        whatsappPhone: null,
        groupId: null
      })
    );
    expect(api.invitations.update).not.toHaveBeenCalled();
    expect(api.invitations.addAssistant).not.toHaveBeenCalled();
    expect(api.eventConfirmation.override).not.toHaveBeenCalled();
  });

  it('previews duplicate names as separate CSV rows and retains commit idempotency on network uncertainty', async () => {
    const api = setup();
    vi.mocked(api.contacts.preview).mockResolvedValue({
      previewId: 'preview-a',
      validRows: 2,
      totalRows: 2,
      invalidRows: 0,
      rows: [1, 2].map((rowNumber) => ({
        rowNumber,
        name: 'Ana Ruiz',
        normalizedPhone: null,
        group: null,
        groupId: null,
        groupResolution: 'NONE',
        errors: []
      })),
      expiresAt: '2026-10-22T11:00:00.000Z'
    });
    vi.mocked(api.contacts.commit)
      .mockRejectedValueOnce(new TypeError('Network'))
      .mockResolvedValueOnce({ createdContacts: 2, createdGroups: 0, contacts: [] });
    const actor = userEvent.setup();
    const { container } = renderApp(api, `/eventos/${nominalEvent.id}?seccion=invitados`);
    await screen.findByRole('button', { name: 'Importar lista' });
    await actor.upload(
      container.querySelector('input[type="file"]')!,
      new File(['name,whatsappPhone,group\nAna Ruiz,,\nAna Ruiz,,'], 'invitados.csv', { type: 'text/csv' })
    );
    expect(await screen.findByText(/2 registros listos para importar/)).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Confirmar importación' }));
    await waitFor(() => expect(api.contacts.commit).toHaveBeenCalledTimes(1));
    await actor.click(screen.getByRole('button', { name: 'Confirmar importación' }));
    await waitFor(() => expect(api.contacts.commit).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.contacts.commit).mock.calls[0]).toEqual(vi.mocked(api.contacts.commit).mock.calls[1]);
  });

  it('issues individual credentials by Assistant UUID even when names repeat', async () => {
    const api = setup();
    vi.mocked(api.contacts.list).mockResolvedValue([
      contact,
      { ...contact, id: 'contact-b', assistantId: 'assistant-b' }
    ]);
    vi.mocked(api.nominalAccessCredentials.issue).mockResolvedValue(credential);
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=accesos`);
    const actions = await screen.findAllByRole('button', { name: 'Emitir credencial' });
    await actor.click(actions[1]!);
    await waitFor(() =>
      expect(api.nominalAccessCredentials.issue).toHaveBeenCalledWith(
        nominalEvent.id,
        'assistant-b',
        expect.any(String)
      )
    );
    expect(api.eventConfirmation.override).not.toHaveBeenCalled();
    expect(api.physicalPasses.generate).not.toHaveBeenCalled();
    expect(api.invitations.list).not.toHaveBeenCalled();
  });

  it('downloads SVG and exports selected current nominal material with a name only in print', async () => {
    const api = setup();
    vi.mocked(api.nominalAccessCredentials.list).mockResolvedValue([credential]);
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=accesos`);
    await actor.click(await screen.findByRole('button', { name: 'Descargar QR SVG' }));
    await waitFor(() => expect(api.nominalAccessCredentials.svg).toHaveBeenCalledWith(nominalEvent.id, credential.id));
    await actor.click(screen.getByRole('checkbox', { name: 'Seleccionar credencial de Ana Ruiz' }));
    await actor.click(screen.getByRole('button', { name: 'Exportar seleccionados a PDF (1)' }));
    await waitFor(() => expect(createPhysicalPassesPdf).toHaveBeenCalled());
    const options = vi.mocked(createPhysicalPassesPdf).mock.calls.at(-1)![0];
    expect(options.passes).toEqual([{ id: credential.id, passNumber: 1 }]);
    expect(await options.loadSvg(options.passes[0]!)).toContain('Ana Ruiz');
    expect(svg).not.toContain('Ana Ruiz');
  });

  it('requires explicit revocation before a fresh credential can be issued', async () => {
    const api = setup();
    let history: NominalAccessCredential[] = [credential];
    vi.mocked(api.nominalAccessCredentials.list).mockImplementation(async () => history);
    vi.mocked(api.nominalAccessCredentials.revoke).mockImplementation(async () => {
      const revoked = {
        ...credential,
        status: 'REVOKED' as const,
        revokedAt: '2026-10-22T11:00:00.000Z',
        revocationReasonCode: 'OPERATOR_REQUEST'
      };
      history = [revoked];
      return revoked;
    });
    vi.mocked(api.nominalAccessCredentials.issue).mockResolvedValue({ ...credential, id: 'credential-b' });
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=accesos`);
    await actor.click(await screen.findByRole('button', { name: 'Revocar credencial' }));
    expect(api.nominalAccessCredentials.revoke).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Confirmar revocación' }));
    await waitFor(() =>
      expect(api.nominalAccessCredentials.revoke).toHaveBeenCalledWith(
        nominalEvent.id,
        credential.id,
        { revocationReasonCode: 'OPERATOR_REQUEST' },
        expect.any(String)
      )
    );
    await actor.click(await screen.findByRole('button', { name: 'Reemitir credencial' }));
    await waitFor(() =>
      expect(api.nominalAccessCredentials.issue).toHaveBeenCalledWith(
        nominalEvent.id,
        credential.assistantId,
        expect.any(String)
      )
    );
    expect(vi.mocked(api.nominalAccessCredentials.issue).mock.calls[0]![2]).not.toBe(
      vi.mocked(api.nominalAccessCredentials.revoke).mock.calls[0]![3]
    );
  });

  it('retains the exact issue key on an uncertain result and blocks other intentions', async () => {
    const api = setup();
    vi.mocked(api.nominalAccessCredentials.issue)
      .mockRejectedValueOnce(new TypeError('Network'))
      .mockResolvedValueOnce(credential);
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=accesos`);
    await actor.click(await screen.findByRole('button', { name: 'Emitir credencial' }));
    await screen.findByRole('button', { name: 'Reintentar operación incierta' });
    await actor.click(screen.getByRole('link', { name: 'Resumen' }));
    expect(await screen.findByRole('dialog', { name: 'Hay una operación pendiente' })).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Seguir trabajando' }));
    await actor.click(await screen.findByRole('button', { name: 'Reintentar operación incierta' }));
    await waitFor(() => expect(api.nominalAccessCredentials.issue).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.nominalAccessCredentials.issue).mock.calls[0]).toEqual(
      vi.mocked(api.nominalAccessCredentials.issue).mock.calls[1]
    );
  });

  it('does not offer revocation or distribution PDF for credentials with active ingress', async () => {
    const api = setup({ ...nominalEvent, status: 'ACTIVE' });
    vi.mocked(api.nominalAccessCredentials.list).mockResolvedValue([{ ...credential, hasActiveCheckIn: true }]);
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=accesos`);
    expect(await screen.findByText(/Ingreso registrado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revocar credencial' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar credencial de Ana Ruiz' })).toBeDisabled();
  });

  it('shows anonymous historical folios and only exports selected unused, unrevoked passes', async () => {
    const api = setup(anonymousEvent);
    vi.mocked(api.physicalPasses.list).mockResolvedValue([
      pass,
      { ...pass, id: 'used', passNumber: 2, status: 'USED' },
      { ...pass, id: 'revoked', passNumber: 3, status: 'REVOKED' }
    ]);
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${anonymousEvent.id}?seccion=accesos`);
    expect(await screen.findByText(/Folio 3.*Revocado/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invitados' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar SVG del folio 3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar folio 2' })).not.toBeInTheDocument();
    await actor.click(screen.getByRole('checkbox', { name: 'Seleccionar folio 1' }));
    await actor.click(screen.getByRole('button', { name: 'Exportar seleccionados a PDF (1)' }));
    await waitFor(() => expect(createPhysicalPassesPdf).toHaveBeenCalled());
    expect(vi.mocked(createPhysicalPassesPdf).mock.calls.at(-1)![0].passes).toEqual([{ id: pass.id, passNumber: 1 }]);
    expect(api.physicalPasses.generate).not.toHaveBeenCalled();
    expect(api.contacts.list).not.toHaveBeenCalled();
    expect(api.invitations.list).not.toHaveBeenCalled();
    expect(api.eventConfirmation.get).not.toHaveBeenCalled();
  });

  it('revokes an unused anonymous pass and removes it from distributable selection without deleting history', async () => {
    const api = setup(anonymousEvent);
    vi.mocked(api.physicalPasses.list)
      .mockResolvedValueOnce([pass])
      .mockResolvedValue([{ ...pass, status: 'REVOKED' }]);
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${anonymousEvent.id}?seccion=accesos`);
    await actor.click(await screen.findByRole('button', { name: 'Revocar folio 1' }));
    await actor.click(screen.getByRole('button', { name: 'Confirmar revocación' }));
    expect(await screen.findByText(/Folio 1.*Revocado/)).toBeInTheDocument();
    expect(api.physicalPasses.revoke).toHaveBeenCalledWith(
      anonymousEvent.id,
      pass.id,
      { revocationReasonCode: 'OPERATOR_REQUEST' },
      expect.any(String)
    );
    expect(screen.queryByRole('button', { name: 'Descargar SVG del folio 1' })).not.toBeInTheDocument();
  });

  it.each(['CLOSED', 'CANCELLED'] as const)(
    'keeps %s anonymous material in consultation with no new mutations',
    async (status) => {
      const api = setup({ ...anonymousEvent, status });
      vi.mocked(api.physicalPasses.list).mockResolvedValue([pass]);
      renderApp(api, `/eventos/${anonymousEvent.id}?seccion=accesos`);
      expect(await screen.findByText(/Folio 1/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Revocar folio 1' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Descargar SVG del folio 1' })).toBeEnabled();
    }
  );

  it('does not load event resources when an unassigned Planner is denied', async () => {
    const api = setup();
    vi.mocked(api.events.get).mockRejectedValue(new ApiError(404, 'EVENT_NOT_FOUND', 'Not found'));
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=accesos`);
    expect(await screen.findByRole('heading', { name: 'Este evento no está disponible.' })).toBeInTheDocument();
    expect(api.nominalAccessCredentials.list).not.toHaveBeenCalled();
    expect(api.contacts.list).not.toHaveBeenCalled();
  });
});
