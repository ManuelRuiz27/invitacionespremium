import { RegisterPlannerModal } from '../RegisterPlannerModal';
import type { PlannerRegistrationClient } from '../../registration-client';
import { ApiError } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

afterEach(() => vi.restoreAllMocks());

describe('RegisterPlannerModal', () => {
  it('renders the generated DTO fields only', () => {
    renderModal(clientResolved());
    expect(screen.getByLabelText(/Nombre del Planner/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/WhatsApp|ciudad|estado|términos/i)).not.toBeInTheDocument();
  });

  it('validates the minimum name length', () => {
    const client = clientResolved();
    renderModal(client);
    fillForm({ name: ' A ' });
    submit();
    expect(screen.getByText(/nombre debe tener entre 2 y 160/i)).toBeInTheDocument();
    expect(client.registerPlanner).not.toHaveBeenCalled();
  });

  it('validates email syntax', () => {
    const client = clientResolved();
    renderModal(client);
    fillForm({ email: 'incorrecto' });
    submit();
    expect(screen.getByText(/correo electrónico válido/i)).toBeInTheDocument();
  });

  it('validates password length', () => {
    const client = clientResolved();
    renderModal(client);
    fillForm({ password: 'corta' });
    submit();
    expect(screen.getByText(/contraseña debe tener entre 12 y 1024/i)).toBeInTheDocument();
  });

  it('rejects boundary whitespace in the password', () => {
    const client = clientResolved();
    renderModal(client);
    fillForm({ password: ' password-1234 ' });
    submit();
    expect(screen.getByText(/no debe tener espacios al inicio o al final/i)).toBeInTheDocument();
  });

  it('trims name and email in the submitted DTO', async () => {
    const client = clientResolved();
    renderModal(client);
    fillForm({ name: '  Sofía Planners  ', email: '  sofia@example.com  ' });
    submit();
    await waitFor(() =>
      expect(client.registerPlanner).toHaveBeenCalledWith(
        { name: 'Sofía Planners', email: 'sofia@example.com', password: 'password-1234' },
        expect.any(AbortSignal)
      )
    );
  });

  it('submits exactly once for two clicks in the same turn', () => {
    const pending = deferred<never>();
    const client = clientFrom(() => pending.promise);
    renderModal(client);
    fillForm();
    const button = screen.getByRole('button', { name: 'Crear cuenta' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(client.registerPlanner).toHaveBeenCalledTimes(1);
  });

  it('aborts the active request when the modal closes', () => {
    const pending = deferred<never>();
    const client = clientFrom(() => pending.promise);
    renderModal(client);
    fillForm();
    submit();
    const signal = vi.mocked(client.registerPlanner).mock.calls[0]?.[1];
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar registro' }));
    expect(signal?.aborted).toBe(true);
  });

  it('discards a late success after closing', async () => {
    const pending = deferred<ReturnType<typeof successfulResult>>();
    const client = clientFrom(() => pending.promise);
    const view = renderModal(client);
    fillForm();
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar registro' }));
    pending.resolve(successfulResult());
    view.rerender(wrapper(<RegisterPlannerModal open={false} onClose={vi.fn()} registrationClient={client} />));
    await Promise.resolve();
    expect(screen.queryByText(/Tu cuenta fue creada/i)).not.toBeInTheDocument();
  });

  it('reopens with clean fields and no prior error', () => {
    const client = clientResolved();
    const onClose = vi.fn();
    const view = renderModal(client, onClose);
    fillForm({ name: 'Temporal', email: 'incorrecto' });
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar registro' }));
    view.rerender(wrapper(<RegisterPlannerModal open={false} onClose={onClose} registrationClient={client} />));
    view.rerender(wrapper(<RegisterPlannerModal open onClose={onClose} registrationClient={client} />));
    expect(screen.getByLabelText(/Nombre del Planner/i)).toHaveValue('');
    expect(screen.getByLabelText(/Correo electrónico/i)).toHaveValue('');
    expect(screen.getByLabelText(/Contraseña/i)).toHaveValue('');
    expect(screen.queryByText(/correo electrónico válido/i)).not.toBeInTheDocument();
  });

  it('keeps a previous request from modifying a later opening', async () => {
    const first = deferred<ReturnType<typeof successfulResult>>();
    const second = deferred<ReturnType<typeof successfulResult>>();
    const client = clientFrom(
      vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)
    );
    const onClose = vi.fn();
    const view = renderModal(client, onClose);
    fillForm();
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar registro' }));
    view.rerender(wrapper(<RegisterPlannerModal open={false} onClose={onClose} registrationClient={client} />));
    view.rerender(wrapper(<RegisterPlannerModal open onClose={onClose} registrationClient={client} />));
    fillForm({ email: 'new@example.com' });
    submit();

    first.resolve(successfulResult());
    await Promise.resolve();
    expect(screen.queryByText(/Tu cuenta fue creada/i)).not.toBeInTheDocument();

    second.resolve(successfulResult());
    expect(await screen.findByText(/Tu cuenta fue creada/i)).toBeInTheDocument();
  });

  it('clears the password after success', async () => {
    const client = clientResolved();
    const onClose = vi.fn();
    const view = renderModal(client, onClose);
    fillForm();
    submit();
    expect(await screen.findByText(/Tu cuenta fue creada/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar registro' }));
    view.rerender(wrapper(<RegisterPlannerModal open={false} onClose={onClose} registrationClient={client} />));
    view.rerender(wrapper(<RegisterPlannerModal open onClose={onClose} registrationClient={client} />));
    expect(screen.getByLabelText(/Contraseña/i)).toHaveValue('');
  });

  it.each([
    [new ApiError(409, 'CLIENT_EMAIL_ALREADY_EXISTS', 'technical'), 'Ya existe una cuenta asociada a ese correo.'],
    [new ApiError(429, 'RATE_LIMITED', 'technical'), 'Hubo demasiados intentos. Vuelve a intentarlo más tarde.'],
    [new ApiError(500, 'INTERNAL', 'technical'), 'El servicio no está disponible temporalmente. Inténtalo más tarde.'],
    [
      new TypeError('network detail'),
      'No fue posible conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.'
    ],
    [
      new ApiError(502, 'UNEXPECTED_API_RESPONSE', 'technical'),
      'Recibimos una respuesta inesperada. Inténtalo más tarde.'
    ]
  ])('translates registration failure %#', async (failure, message) => {
    renderModal(clientRejected(failure));
    fillForm();
    submit();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('technical')).not.toBeInTheDocument();
  });

  it.each([400, 422])('translates HTTP %i as invalid data', async (status) => {
    renderModal(clientRejected(new ApiError(status, 'VALIDATION', 'technical')));
    fillForm();
    submit();
    expect(await screen.findByText('Revisa los datos e inténtalo de nuevo.')).toBeInTheDocument();
  });

  it('keeps AbortError silent', async () => {
    renderModal(clientRejected(new DOMException('aborted', 'AbortError')));
    fillForm();
    submit();
    await waitFor(() => expect(screen.queryByLabelText('Creando cuenta')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('never exposes an unknown technical error message', async () => {
    renderModal(clientRejected(new Error('Prisma table client secret')));
    fillForm();
    submit();
    expect(await screen.findByText('No fue posible crear la cuenta. Inténtalo más tarde.')).toBeInTheDocument();
    expect(screen.queryByText(/Prisma|table client secret/i)).not.toBeInTheDocument();
  });

  it('does not persist form or response data', async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSetter = vi.spyOn(Document.prototype, 'cookie', 'set');
    renderModal(clientResolved());
    fillForm();
    submit();
    expect(await screen.findByText(/Tu cuenta fue creada/i)).toBeInTheDocument();
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(cookieSetter).not.toHaveBeenCalled();
  });

  it('links success to the validated Client login URL', async () => {
    renderModal(clientResolved());
    fillForm();
    submit();
    expect(await screen.findByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      'http://localhost:5173/login'
    );
  });

  it('aborts on unmount', () => {
    const pending = deferred<never>();
    const client = clientFrom(() => pending.promise);
    const view = renderModal(client);
    fillForm();
    submit();
    const signal = vi.mocked(client.registerPlanner).mock.calls[0]?.[1];
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

function renderModal(client: PlannerRegistrationClient, onClose = vi.fn()) {
  return render(wrapper(<RegisterPlannerModal open onClose={onClose} registrationClient={client} />));
}

function wrapper(node: ReactNode) {
  return <AppThemeProvider>{node}</AppThemeProvider>;
}

function fillForm(overrides: { name?: string; email?: string; password?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/Nombre del Planner/i), {
    target: { value: overrides.name ?? 'Sofía Planners' }
  });
  fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
    target: { value: overrides.email ?? 'sofia@example.com' }
  });
  fireEvent.change(screen.getByLabelText(/Contraseña/i), {
    target: { value: overrides.password ?? 'password-1234' }
  });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

function clientResolved(): PlannerRegistrationClient {
  return clientFrom(async () => successfulResult());
}

function clientRejected(failure: unknown): PlannerRegistrationClient {
  return clientFrom(async () => Promise.reject(failure));
}

function clientFrom(implementation: PlannerRegistrationClient['registerPlanner']): PlannerRegistrationClient {
  return { registerPlanner: vi.fn(implementation) };
}

function successfulResult() {
  return {
    client: {
      id: 'client',
      name: 'Sofía Planners',
      status: 'ACTIVE',
      type: 'PLANNER',
      commercialChannel: null,
      suspendedAt: null,
      suspensionReason: null,
      createdAt: 'now',
      updatedAt: 'now'
    },
    user: {
      id: 'user',
      clientId: 'client',
      email: 'sofia@example.com',
      role: 'INDEPENDENT_PLANNER',
      createdAt: 'now',
      updatedAt: 'now'
    }
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
