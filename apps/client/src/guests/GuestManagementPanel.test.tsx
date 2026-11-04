import type { Contact, ContactGroup, Event, Invitation } from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeEvent, configuredEvent, managedUser, mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';
import { ApiError } from '@invitaciones/api-client';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const csvPreview = (previewId = 'preview-a') => ({
  previewId,
  expiresAt: '2027-01-01T00:00:00.000Z',
  totalRows: 1,
  validRows: 1,
  invalidRows: 0,
  rows: [
    {
      rowNumber: 2,
      name: 'Carla Díaz',
      normalizedPhone: '+525551111111',
      group: null,
      groupId: null,
      groupResolution: 'NONE' as const,
      errors: [] as string[]
    }
  ]
});

const managedEvent = {
  ...configuredEvent,
  serviceId: 'service-flyer',
  serviceCode: 'FLYER',
  floorplanEnabled: true
} satisfies Event;

const group = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  eventId: managedEvent.id,
  name: 'Familia Ruiz',
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z'
} satisfies ContactGroup;

const contactAna = {
  id: '11111111-1111-4111-8111-111111111111',
  eventId: managedEvent.id,
  groupId: group.id,
  name: 'Ana García',
  whatsappPhone: '+524441234567',
  anonymizedAt: null,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z'
} satisfies Contact;

const contactLuis = {
  ...contactAna,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Luis Pérez',
  whatsappPhone: '+525551234567'
} satisfies Contact;

const invitation = {
  id: '33333333-3333-4333-8333-333333333333',
  eventId: managedEvent.id,
  contactId: contactAna.id,
  mode: 'INDIVIDUAL',
  responseStatus: 'PENDING',
  additionalAssistantLimit: 0,
  contactName: contactAna.name,
  invitationLink: 'https://example.test/invitacion/ana',
  cancelledAt: null,
  assistants: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      eventId: managedEvent.id,
      invitationId: '33333333-3333-4333-8333-333333333333',
      name: contactAna.name,
      isPrimary: true,
      responseStatus: 'PENDING',
      anonymizedAt: null,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z'
    }
  ],
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z'
} satisfies Invitation;

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:contacts');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('Guest management workspace', () => {
  it('filters by group while preserving distinct contact, invitation and assistant counts', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna, { ...contactLuis, groupId: null }]);
    vi.mocked(api.contacts.groups).mockResolvedValue([group]);
    vi.mocked(api.invitations.list).mockResolvedValue([
      {
        ...invitation,
        assistants: [
          invitation.assistants[0]!,
          { ...invitation.assistants[0]!, id: 'additional' },
          { ...invitation.assistants[0]!, id: 'third' }
        ]
      }
    ]);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);
    expect(await screen.findByText('2 contactos registrados')).toBeInTheDocument();
    expect(
      screen.getByText(/Invitaciones: 1 · Personas contempladas: 3 · Lugares disponibles: 117/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Filtrar por grupo' }));
    await user.click(screen.getByRole('option', { name: group.name }));
    const list = screen.getByRole('list', { name: 'Lista de invitados' });
    expect(within(list).getByText('Ana García')).toBeInTheDocument();
    expect(within(list).queryByText('Luis Pérez')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Buscar invitado' }), 'sin coincidencias');
    expect(screen.getByText(/No encontramos invitados/)).toBeInTheDocument();
    expect(api.contacts.list).toHaveBeenCalledOnce();
  });

  it('blocks repeated creates and shows operation errors inside the dialog without losing the draft', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    const pending = deferred<Contact>();
    vi.mocked(api.contacts.create).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);
    await user.click(await screen.findByRole('button', { name: 'Agregar invitado' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar invitado' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nombre' }), 'Luis Pérez');
    await user.type(within(dialog).getByRole('textbox', { name: 'Número de WhatsApp' }), '+525551234567');
    const form = within(dialog).getByRole('button', { name: 'Agregar' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.contacts.create).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole('button', { name: 'Agregando…' })).toBeDisabled();
    await act(async () => pending.reject(new ApiError(409, 'CONTACT_LIMIT_EXCEEDED', 'limit')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/150/);
    expect(within(dialog).getByRole('textbox', { name: 'Nombre' })).toHaveValue('Luis Pérez');
  });

  it('invalidates the previous preview immediately and ignores out-of-order CSV responses', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    const second = deferred<ReturnType<typeof csvPreview>>();
    const third = deferred<ReturnType<typeof csvPreview>>();
    vi.mocked(api.contacts.preview)
      .mockResolvedValueOnce(csvPreview())
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);
    await user.click(await screen.findByRole('button', { name: 'Importar lista' }));
    const input = screen.getByLabelText('Seleccionar archivo CSV');
    const upload = (name: string) => user.upload(input, new File(['csv'], name, { type: 'text/csv' }));
    await upload('uno.csv');
    expect(await screen.findByRole('button', { name: 'Confirmar importación' })).toBeEnabled();
    await upload('dos.csv');
    expect(screen.queryByText(/Fila 2: Carla/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
    await upload('tres.csv');
    await act(async () => third.resolve(csvPreview('preview-c')));
    await act(async () => second.resolve(csvPreview('preview-b')));
    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));
    await waitFor(() =>
      expect(api.contacts.commit).toHaveBeenCalledWith(managedEvent.id, 'preview-c', expect.any(String))
    );
  });

  it('clears an older preview when replacement validation fails and blocks rows with errors', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.preview)
      .mockResolvedValueOnce(csvPreview())
      .mockRejectedValueOnce(new ApiError(400, 'CONTACT_LIMIT_EXCEEDED', 'limit'))
      .mockResolvedValueOnce({
        ...csvPreview('invalid'),
        validRows: 0,
        invalidRows: 1,
        rows: [{ ...csvPreview().rows[0]!, errors: ['CONTACT_PHONE_INVALID'] }]
      });
    const user = userEvent.setup();
    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);
    await user.click(await screen.findByRole('button', { name: 'Importar lista' }));
    const input = screen.getByLabelText('Seleccionar archivo CSV');
    await user.upload(input, new File(['a'], 'uno.csv', { type: 'text/csv' }));
    await screen.findByText(/Fila 2: Carla/);
    await user.upload(input, new File(['b'], 'dos.csv', { type: 'text/csv' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/150/);
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
    await user.upload(input, new File(['c'], 'tres.csv', { type: 'text/csv' }));
    expect(await screen.findByText(/CONTACT_PHONE_INVALID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
    expect(api.contacts.commit).not.toHaveBeenCalled();
  });

  it('preserves the same uncertain CSV attempt, blocks replacement and protects exit', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.preview).mockResolvedValue(csvPreview());
    vi.mocked(api.contacts.commit)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce({ createdContacts: 1, createdGroups: 0, contacts: [] });
    const user = userEvent.setup();
    const { router } = renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);
    await user.click(await screen.findByRole('button', { name: 'Importar lista' }));
    await user.upload(
      screen.getByLabelText('Seleccionar archivo CSV'),
      new File(['csv'], 'uno.csv', { type: 'text/csv' })
    );
    await user.click(await screen.findByRole('button', { name: 'Confirmar importación' }));
    expect(await screen.findByText(/resultado de la importación es incierto/)).toBeInTheDocument();
    expect(screen.getByLabelText('Seleccionar archivo CSV')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    await act(async () => {
      void router.navigate('/eventos');
    });
    expect(await screen.findByRole('dialog', { name: 'Hay una importación pendiente' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir trabajando' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Hay una importación pendiente' })).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));
    await waitFor(() => expect(api.contacts.commit).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.contacts.commit).mock.calls[1]).toEqual(vi.mocked(api.contacts.commit).mock.calls[0]);
    expect(await screen.findByText(/1 contactos importados/)).toBeInTheDocument();
  });

  it('lets a Managed Planner enter Invitados from CONFIGURED without mounting the technical Wizard', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.contacts.groups).mockResolvedValue([group]);
    vi.mocked(api.invitations.list).mockResolvedValue([invitation]);
    const user = userEvent.setup();
    const { router } = renderApp(api, `/eventos/${managedEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Invitados' }));

    expect(router.state.location.pathname).toBe(`/eventos/${managedEvent.id}`);
    expect(router.state.location.search).toBe('?seccion=invitados');
    expect(await screen.findByTestId('guest-management-panel')).toBeInTheDocument();
    expect(screen.getByText(/Personas contempladas: 1/)).toBeInTheDocument();
    expect(screen.queryByText('Completa los pasos para dejar tu evento listo para activar.')).not.toBeInTheDocument();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('creates, edits, deletes, groups, and assigns Contacts through the existing API client', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.contacts.groups).mockResolvedValue([group]);
    vi.mocked(api.invitations.list).mockResolvedValue([invitation]);
    vi.mocked(api.contacts.create).mockResolvedValue(contactLuis);
    vi.mocked(api.contacts.update).mockResolvedValue(contactAna);
    vi.mocked(api.contacts.remove).mockResolvedValue(undefined);
    vi.mocked(api.contacts.createGroup).mockResolvedValue(group);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);

    await screen.findByText(/Ana García/);
    expect(screen.queryByRole('textbox', { name: 'Nombre' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Luis Pérez');
    await user.type(screen.getByRole('textbox', { name: 'Número de WhatsApp' }), '+525551234567');
    await user.click(screen.getByRole('combobox', { name: 'Grupo' }));
    await user.click(await screen.findByRole('option', { name: group.name }));
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() =>
      expect(api.contacts.create).toHaveBeenCalledWith(managedEvent.id, {
        name: 'Luis Pérez',
        whatsappPhone: '+525551234567',
        groupId: group.id
      })
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }));
    await user.click(screen.getByRole('button', { name: 'Crear grupo' }));
    await user.type(screen.getByRole('textbox', { name: 'Nuevo grupo' }), 'Amistades');
    expect(screen.getByRole('textbox', { name: 'Nuevo grupo' })).toHaveValue('Amistades');
    await user.click(screen.getByRole('button', { name: 'Guardar grupo' }));
    await waitFor(() => expect(api.contacts.createGroup).toHaveBeenCalledWith(managedEvent.id, { name: 'Amistades' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nuevo grupo' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Opciones de Ana García' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const editDialog = await screen.findByRole('dialog', { name: 'Editar invitado' });
    const editName = within(editDialog).getByRole('textbox', { name: 'Nombre' });
    await user.clear(editName);
    await user.type(editName, 'Ana María García');
    await user.click(within(editDialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.contacts.update).toHaveBeenCalledWith(
        managedEvent.id,
        contactAna.id,
        expect.objectContaining({ name: 'Ana María García', groupId: group.id })
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar invitado' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Opciones de Ana García' }));
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    expect(api.contacts.remove).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Confirmar eliminación' }));
    await waitFor(() => expect(api.contacts.remove).toHaveBeenCalledWith(managedEvent.id, contactAna.id));
  });

  it('downloads the template and preserves CSV preview and commit semantics', async () => {
    const api = mockApiClient(managedUser);
    const preview = {
      previewId: '55555555-5555-4555-8555-555555555555',
      expiresAt: '2027-01-01T00:00:00.000Z',
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      rows: [
        {
          rowNumber: 2,
          name: 'Carla Díaz',
          normalizedPhone: '+525551111111',
          group: 'Amistades',
          groupId: null,
          groupResolution: 'NEW' as const,
          errors: []
        }
      ]
    };
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.template).mockResolvedValue(new Blob(['name,whatsapp_phone,group']));
    vi.mocked(api.contacts.preview).mockResolvedValue(preview);
    vi.mocked(api.contacts.commit).mockResolvedValue({ createdContacts: 1, createdGroups: 1, contacts: [] });
    const user = userEvent.setup();
    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);

    await user.click(await screen.findByRole('button', { name: 'Importar lista' }));
    await user.click(screen.getByRole('button', { name: 'Descargar plantilla' }));
    expect(api.contacts.template).toHaveBeenCalledWith(managedEvent.id);

    await user.upload(
      screen.getByLabelText('Seleccionar archivo CSV'),
      new File(['csv'], 'invitados.csv', { type: 'text/csv' })
    );
    expect(await screen.findByText(/Fila 2: Carla Díaz/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));
    await waitFor(() =>
      expect(api.contacts.commit).toHaveBeenCalledWith(managedEvent.id, preview.previewId, expect.any(String))
    );
    expect(api.contacts.list).toHaveBeenCalledTimes(2);
  });

  it('filters the authoritative list locally by accent-insensitive name and phone without another request', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna, contactLuis]);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);

    await screen.findByText(/Ana García/);
    await user.type(screen.getByRole('textbox', { name: 'Buscar invitado' }), 'garcia');
    expect(screen.getByText(/Ana García/)).toBeInTheDocument();
    expect(screen.queryByText(/Luis Pérez/)).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Buscar invitado' }));
    await user.type(screen.getByRole('textbox', { name: 'Buscar invitado' }), '555123');
    expect(screen.queryByText(/Ana García/)).not.toBeInTheDocument();
    expect(screen.getByText(/Luis Pérez/)).toBeInTheDocument();
    expect(api.contacts.list).toHaveBeenCalledOnce();
    expect(api.contacts.list).toHaveBeenCalledWith(managedEvent.id);
  });

  it('reloads the authoritative list after remounting the same workspace URL', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedEvent);
    vi.mocked(api.contacts.list).mockResolvedValueOnce([contactAna]).mockResolvedValue([contactLuis]);
    const first = renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);
    await screen.findByText(/Ana García/);
    first.unmount();

    renderApp(api, `/eventos/${managedEvent.id}?seccion=invitados`);
    expect(await screen.findByText(/Luis Pérez/)).toBeInTheDocument();
    expect(screen.queryByText(/Ana García/)).not.toBeInTheDocument();
    expect(api.contacts.list).toHaveBeenCalledTimes(2);
  });

  it('keeps ACTIVE Guests read-only and mounts the same panel from the Self-Service Wizard', async () => {
    const activeDigitalEvent = {
      ...managedEvent,
      ...activeEvent,
      serviceId: 'service-flyer',
      serviceCode: 'FLYER'
    } satisfies Event;
    const activeApi = mockApiClient(managedUser);
    vi.mocked(activeApi.events.get).mockResolvedValue(activeDigitalEvent);
    vi.mocked(activeApi.contacts.list).mockResolvedValue([contactAna]);
    const active = renderApp(activeApi, `/eventos/${activeDigitalEvent.id}?seccion=invitados`);

    expect(await screen.findByTestId('guest-management-panel')).toBeInTheDocument();
    expect(screen.getByText(/modo de consulta/)).toBeInTheDocument();
    for (const action of [
      'Agregar invitado',
      'Editar',
      'Eliminar',
      'Crear grupo',
      'Importar lista',
      'Opciones de Ana García'
    ]) {
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
    }
    expect(activeApi.contacts.create).not.toHaveBeenCalled();
    active.unmount();

    const selfServiceApi = mockApiClient();
    vi.mocked(selfServiceApi.events.get).mockResolvedValue(managedEvent);
    renderApp(selfServiceApi, `/eventos/${managedEvent.id}/configuracion/contactos`);
    expect(await screen.findByTestId('guest-management-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar invitado' })).toBeInTheDocument();
    expect(selfServiceApi.contacts.list).toHaveBeenCalledWith(managedEvent.id);
  });
});
