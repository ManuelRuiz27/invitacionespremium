import { ApiError, type Contact, type Event, type Invitation } from '@invitaciones/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeEvent, managedUser, mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const digitalEvent = {
  ...activeEvent,
  serviceId: 'service-flyer',
  serviceCode: 'FLYER',
  status: 'ACTIVE',
  floorplanEnabled: false
} satisfies Event;

const contactAna = {
  id: '11111111-1111-4111-8111-111111111111',
  eventId: digitalEvent.id,
  groupId: null,
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
  whatsappPhone: '+524449876543'
} satisfies Contact;

function assistant(id: string, invitationId: string, name: string, isPrimary = true) {
  return {
    id,
    eventId: digitalEvent.id,
    invitationId,
    name,
    isPrimary,
    responseStatus: 'PENDING',
    anonymizedAt: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z'
  } as const;
}

const pendingInvitation = {
  id: '33333333-3333-4333-8333-333333333333',
  eventId: digitalEvent.id,
  contactId: contactAna.id,
  mode: 'INDIVIDUAL',
  responseStatus: 'PENDING',
  additionalAssistantLimit: 0,
  contactName: contactAna.name,
  invitationLink: 'https://example.test/invitacion/token-ana',
  cancelledAt: null,
  assistants: [assistant('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'Ana García')],
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z'
} satisfies Invitation;

const confirmedInvitation = {
  ...pendingInvitation,
  id: '55555555-5555-4555-8555-555555555555',
  contactId: contactLuis.id,
  contactName: contactLuis.name,
  responseStatus: 'CONFIRMED',
  invitationLink: 'https://example.test/invitacion/token-luis',
  assistants: [
    {
      ...assistant('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'Luis Pérez'),
      responseStatus: 'CONFIRMED'
    }
  ]
} satisfies Invitation;

const cancelledInvitation = {
  ...pendingInvitation,
  id: '77777777-7777-4777-8777-777777777777',
  contactId: '88888888-8888-4888-8888-888888888888',
  contactName: 'Invitación cancelada',
  invitationLink: 'https://example.test/invitacion/token-cancelled',
  cancelledAt: '2026-08-08T12:00:00.000Z',
  assistants: [
    assistant('99999999-9999-4999-8999-999999999999', '77777777-7777-4777-8777-777777777777', 'Invitación cancelada')
  ]
} satisfies Invitation;

const managedPreparationEvent = {
  ...digitalEvent,
  status: 'CONFIGURED'
} satisfies Event;

const familyInvitation = {
  ...pendingInvitation,
  mode: 'FAMILY_NOMINAL',
  additionalAssistantLimit: 2,
  assistants: [
    pendingInvitation.assistants[0]!,
    assistant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pendingInvitation.id, 'María García', false)
  ]
} satisfies Invitation;

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('Invitation operations workspace', () => {
  it('opens the provisioned individual Invitation from Managed preparation without mounting the Wizard', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedPreparationEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValue([pendingInvitation]);

    renderApp(api, `/eventos/${managedPreparationEvent.id}?seccion=invitaciones`);

    expect(await screen.findByRole('heading', { name: 'Invitaciones', level: 2 })).toBeInTheDocument();
    expect(await screen.findByTestId('invitation-operations-panel')).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Secciones del Evento' });
    expect(within(navigation).getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Invitados' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Invitaciones', current: 'page' })).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: `Tipo de invitación de ${contactAna.name}` })).toHaveTextContent(
      'Individual'
    );
    expect(screen.getAllByText(contactAna.name).length).toBeGreaterThan(1);
    expect(screen.getByText('Titular')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar acompañante/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar acompañante/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Completa los pasos para dejar tu evento listo para activar.')).not.toBeInTheDocument();
  });

  it('converts an individual Invitation to family, configures its limit, and refetches authoritative state', async () => {
    const api = mockApiClient(managedUser);
    const familyWithoutExtras = { ...familyInvitation, assistants: [pendingInvitation.assistants[0]!] };
    const expandedFamily = { ...familyWithoutExtras, additionalAssistantLimit: 3 };
    vi.mocked(api.events.get).mockResolvedValue(managedPreparationEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list)
      .mockResolvedValueOnce([pendingInvitation])
      .mockResolvedValueOnce([familyWithoutExtras])
      .mockResolvedValue([expandedFamily]);
    vi.mocked(api.invitations.update).mockResolvedValueOnce(familyWithoutExtras).mockResolvedValueOnce(expandedFamily);
    const user = userEvent.setup();

    renderApp(api, `/eventos/${managedPreparationEvent.id}?seccion=invitaciones`);
    await user.click(await screen.findByRole('combobox', { name: `Tipo de invitación de ${contactAna.name}` }));
    await user.click(await screen.findByRole('option', { name: 'Familia nominal' }));

    await waitFor(() =>
      expect(api.invitations.update).toHaveBeenCalledWith(managedPreparationEvent.id, pendingInvitation.id, {
        mode: 'FAMILY_NOMINAL'
      })
    );
    const limit = await screen.findByRole('spinbutton', { name: `Límite de acompañantes de ${contactAna.name}` });
    await user.clear(limit);
    await user.type(limit, '3');
    await user.click(screen.getByRole('button', { name: 'Guardar límite' }));

    await waitFor(() =>
      expect(api.invitations.update).toHaveBeenLastCalledWith(managedPreparationEvent.id, pendingInvitation.id, {
        additionalAssistantLimit: 3
      })
    );
    expect(await screen.findByText('0 de 3 acompañantes adicionales')).toBeInTheDocument();
    expect(api.invitations.list).toHaveBeenCalledTimes(3);
  });

  it('creates, renames, and deletes only additional Assistants and refetches after every mutation', async () => {
    const api = mockApiClient(managedUser);
    const familyWithoutExtras = { ...familyInvitation, assistants: [pendingInvitation.assistants[0]!] };
    const addedAssistant = assistant(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      pendingInvitation.id,
      'Sofía García',
      false
    );
    let authoritative: Invitation = familyWithoutExtras;
    vi.mocked(api.events.get).mockResolvedValue(managedPreparationEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockImplementation(async () => [authoritative]);
    vi.mocked(api.invitations.addAssistant).mockImplementation(async () => {
      authoritative = { ...familyWithoutExtras, assistants: [...familyWithoutExtras.assistants, addedAssistant] };
      return addedAssistant;
    });
    vi.mocked(api.invitations.updateAssistant).mockImplementation(async () => {
      const renamed = { ...addedAssistant, name: 'Sofía Ruiz' };
      authoritative = { ...authoritative, assistants: [familyWithoutExtras.assistants[0]!, renamed] };
      return renamed;
    });
    vi.mocked(api.invitations.removeAssistant).mockImplementation(async () => {
      authoritative = familyWithoutExtras;
    });
    const user = userEvent.setup();

    renderApp(api, `/eventos/${managedPreparationEvent.id}?seccion=invitaciones`);
    const newAssistant = await screen.findByRole('textbox', { name: `Nuevo acompañante de ${contactAna.name}` });
    await user.type(newAssistant, '  Sofía   García  ');
    await user.click(screen.getByRole('button', { name: 'Agregar acompañante' }));

    await waitFor(() =>
      expect(api.invitations.addAssistant).toHaveBeenCalledWith(managedPreparationEvent.id, pendingInvitation.id, {
        name: 'Sofía García'
      })
    );
    await user.click(await screen.findByRole('button', { name: 'Editar acompañante Sofía García' }));
    const editName = screen.getByRole('textbox', { name: `Nombre del acompañante de ${contactAna.name}` });
    await user.clear(editName);
    await user.type(editName, 'Sofía Ruiz');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Sofía Ruiz')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar acompañante Sofía Ruiz' }));
    await waitFor(() => expect(api.invitations.removeAssistant).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Sofía Ruiz')).not.toBeInTheDocument());
    expect(api.invitations.list).toHaveBeenCalledTimes(4);
    expect(screen.getByText('Titular')).toBeInTheDocument();
  });

  it('requires removing extras before switching to individual', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(managedPreparationEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValue([familyInvitation]);
    const user = userEvent.setup();

    renderApp(api, `/eventos/${managedPreparationEvent.id}?seccion=invitaciones`);
    await user.click(await screen.findByRole('combobox', { name: `Tipo de invitación de ${contactAna.name}` }));
    await user.click(await screen.findByRole('option', { name: 'Individual' }));

    expect(
      await screen.findByText(
        'Elimina primero los acompañantes adicionales para convertir esta invitación en individual.'
      )
    ).toBeInTheDocument();
    expect(api.invitations.update).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: `Tipo de invitación de ${contactAna.name}` })).toHaveTextContent(
      'Familia nominal'
    );
  });

  it('switches a family without extras to a coherent individual Invitation', async () => {
    const api = mockApiClient(managedUser);
    const familyWithoutExtras = { ...familyInvitation, assistants: [pendingInvitation.assistants[0]!] };
    vi.mocked(api.events.get).mockResolvedValue(managedPreparationEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValueOnce([familyWithoutExtras]).mockResolvedValue([pendingInvitation]);
    vi.mocked(api.invitations.update).mockResolvedValue(pendingInvitation);
    const user = userEvent.setup();

    renderApp(api, `/eventos/${managedPreparationEvent.id}?seccion=invitaciones`);
    await user.click(await screen.findByRole('combobox', { name: `Tipo de invitación de ${contactAna.name}` }));
    await user.click(await screen.findByRole('option', { name: 'Individual' }));

    await waitFor(() =>
      expect(api.invitations.update).toHaveBeenCalledWith(managedPreparationEvent.id, pendingInvitation.id, {
        mode: 'INDIVIDUAL',
        additionalAssistantLimit: 0
      })
    );
    expect(screen.queryByRole('spinbutton', { name: /Límite de acompañantes/ })).not.toBeInTheDocument();
    expect(api.invitations.list).toHaveBeenCalledTimes(2);
  });

  it('presents assistant-limit errors and restores the authoritative Invitation', async () => {
    const api = mockApiClient(managedUser);
    const familyWithoutExtras = {
      ...familyInvitation,
      additionalAssistantLimit: 1,
      assistants: [pendingInvitation.assistants[0]!]
    };
    vi.mocked(api.events.get).mockResolvedValue(managedPreparationEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValue([familyWithoutExtras]);
    vi.mocked(api.invitations.addAssistant).mockRejectedValue(
      new ApiError(
        409,
        'INVITATION_ASSISTANT_LIMIT_EXCEEDED',
        'The invitation assistant limit would be exceeded.',
        'operation-limit'
      )
    );
    const user = userEvent.setup();

    renderApp(api, `/eventos/${managedPreparationEvent.id}?seccion=invitaciones`);
    await user.type(
      await screen.findByRole('textbox', { name: `Nuevo acompañante de ${contactAna.name}` }),
      'Invitada concurrente'
    );
    await user.click(screen.getByRole('button', { name: 'Agregar acompañante' }));

    expect(
      await screen.findByText(
        'La cantidad de acompañantes supera el límite de esta invitación. Actualiza la información e inténtalo nuevamente. Referencia: operation-limit'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('0 de 1 acompañantes adicionales')).toBeInTheDocument();
    expect(screen.queryByText('Invitada concurrente', { selector: 'p' })).not.toBeInTheDocument();
    expect(api.invitations.list).toHaveBeenCalledTimes(2);
  });

  it('exposes WhatsApp distribution only after activation without inventing delivery state', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(digitalEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna, contactLuis]);
    vi.mocked(api.invitations.list).mockResolvedValue([pendingInvitation, confirmedInvitation, cancelledInvitation]);

    renderApp(api, `/eventos/${digitalEvent.id}?seccion=invitaciones`);

    expect(await screen.findByRole('heading', { name: 'Enviar invitaciones', level: 2 })).toBeInTheDocument();
    expect(await screen.findByText('Sin respuesta')).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByText(/enviada/i)).not.toBeInTheDocument();

    const whatsappLinks = screen.getAllByRole('link', { name: 'Enviar por WhatsApp' });
    expect(whatsappLinks).toHaveLength(2);
    expect(whatsappLinks[0]).toHaveAttribute(
      'href',
      `https://wa.me/524441234567?text=${encodeURIComponent(
        `Hola, te comparto la invitación para ${digitalEvent.name}:\n${pendingInvitation.invitationLink}`
      )}`
    );

    expect(screen.getAllByRole('button', { name: 'Copiar enlace' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Abrir invitación' })).toHaveLength(2);
    expect(screen.queryByRole('combobox', { name: /Tipo de invitación/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar acompañante' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar acompañante/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar acompañante/ })).not.toBeInTheDocument();
    expect(api.invitations.update).not.toHaveBeenCalled();
    expect(api.invitations.addAssistant).not.toHaveBeenCalled();
    const cancelledRow = screen.getAllByText('Invitación cancelada')[0]!.closest('li');
    expect(cancelledRow).not.toBeNull();
    expect(within(cancelledRow!).queryByRole('link', { name: 'Enviar por WhatsApp' })).not.toBeInTheDocument();
    expect(within(cancelledRow!).queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(api.contacts.list).toHaveBeenCalledWith(digitalEvent.id, undefined, expect.any(AbortSignal));
    expect(api.invitations.list).toHaveBeenCalledWith(digitalEvent.id);
  });

  it('keeps sharing available on EVENT_DAY because it preserves ACTIVE operational rules', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...digitalEvent, status: 'EVENT_DAY' });
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValue([pendingInvitation]);

    renderApp(api, `/eventos/${digitalEvent.id}?seccion=invitaciones`);

    expect(await screen.findByRole('heading', { name: 'Enviar invitaciones', level: 2 })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Enviar por WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument();
  });

  it('copies the exact invitation link and reports the action without persisting a fake sent state', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(digitalEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValue([pendingInvitation]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    renderApp(api, `/eventos/${digitalEvent.id}?seccion=invitaciones`);
    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));

    expect(writeText).toHaveBeenCalledWith(pendingInvitation.invitationLink);
    expect(await screen.findByText('Enlace de Ana García copiado.')).toBeInTheDocument();
    expect(screen.queryByText(/enviada/i)).not.toBeInTheDocument();
  });

  it('shows a recoverable message when clipboard access fails', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(digitalEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValue([pendingInvitation]);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    });

    renderApp(api, `/eventos/${digitalEvent.id}?seccion=invitaciones`);
    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));

    expect(
      await screen.findByText('No pudimos copiar el enlace. Abre la invitación y cópialo manualmente.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir invitación' })).toBeInTheDocument();
  });

  it('keeps invitation history consultable but removes share actions outside ACTIVE and EVENT_DAY', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...digitalEvent, status: 'CLOSED' });
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna]);
    vi.mocked(api.invitations.list).mockResolvedValue([pendingInvitation]);

    renderApp(api, `/eventos/${digitalEvent.id}?seccion=invitaciones`);

    expect(
      await screen.findByText(
        'Este evento ya no admite nuevos envíos. Puedes consultar el estado final de sus invitaciones.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invitaciones', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByText('Ana García').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Enviar por WhatsApp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir invitación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Tipo de invitación/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar acompañante' })).not.toBeInTheDocument();
    expect(api.invitations.update).not.toHaveBeenCalled();
    expect(api.invitations.addAssistant).not.toHaveBeenCalled();
  });

  it('does not expose invitation distribution for Physical QR', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...digitalEvent, serviceCode: 'PHYSICAL_QR' });

    renderApp(api, `/eventos/${digitalEvent.id}?seccion=invitaciones`);

    const navigation = await screen.findByRole('navigation', { name: 'Secciones del Evento' });
    expect(within(navigation).queryByRole('link', { name: 'Invitaciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enviar invitaciones' })).not.toBeInTheDocument();
    expect(api.contacts.list).not.toHaveBeenCalled();
    expect(api.invitations.list).not.toHaveBeenCalled();
  });

  it('filters locally by recipient and response without additional requests', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(digitalEvent);
    vi.mocked(api.contacts.list).mockResolvedValue([contactAna, contactLuis]);
    vi.mocked(api.invitations.list).mockResolvedValue([pendingInvitation, confirmedInvitation]);
    const user = userEvent.setup();

    renderApp(api, `/eventos/${digitalEvent.id}?seccion=invitaciones`);
    const searchInput = await screen.findByRole('textbox', { name: 'Buscar invitación' });
    await user.type(searchInput, 'luis');

    expect(screen.queryByText('Ana García')).not.toBeInTheDocument();
    expect(screen.getAllByText('Luis Pérez').length).toBeGreaterThan(0);
    expect(api.contacts.list).toHaveBeenCalledTimes(1);
    expect(api.invitations.list).toHaveBeenCalledTimes(1);

    await user.clear(searchInput);
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'Confirmadas' }));

    await waitFor(() => expect(screen.queryByText('Ana García')).not.toBeInTheDocument());
    expect(screen.getAllByText('Luis Pérez').length).toBeGreaterThan(0);
    expect(api.contacts.list).toHaveBeenCalledTimes(1);
    expect(api.invitations.list).toHaveBeenCalledTimes(1);
  });
});
