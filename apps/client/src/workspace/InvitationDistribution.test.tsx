import type { Contact, Event, Invitation } from '@invitaciones/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeEvent, mockApiClient } from '../test/fixtures';
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

function assistant(id: string, invitationId: string, name: string) {
  return {
    id,
    eventId: digitalEvent.id,
    invitationId,
    name,
    isPrimary: true,
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

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('Invitation distribution workspace', () => {
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
    const cancelledRow = screen.getByText('Invitación cancelada').closest('li');
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
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Enviar por WhatsApp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir invitación' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(api.contacts.list).toHaveBeenCalledTimes(1);
    expect(api.invitations.list).toHaveBeenCalledTimes(1);

    await user.clear(searchInput);
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'Confirmadas' }));

    await waitFor(() => expect(screen.queryByText('Ana García')).not.toBeInTheDocument());
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(api.contacts.list).toHaveBeenCalledTimes(1);
    expect(api.invitations.list).toHaveBeenCalledTimes(1);
  });
});
