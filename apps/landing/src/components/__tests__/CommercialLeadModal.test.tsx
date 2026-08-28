import { ApiError } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { LandingCommercialLeadsClient } from '../../commercial-leads-client';
import { CommercialLeadModal } from '../CommercialLeadModal';

describe('CommercialLeadModal', () => {
  it('validates required fields and privacy before posting', () => {
    const client = resolvedClient();
    renderModal(client);
    submit();
    expect(screen.getByText(/nombre de 2 a 160/i)).toBeInTheDocument();
    expect(screen.getByText(/empresa de 2 a 160/i)).toBeInTheDocument();
    expect(screen.getByText(/correo electrónico válido/i)).toBeInTheDocument();
    expect(screen.getByText(/debes aceptar el uso de datos/i)).toBeInTheDocument();
    expect(client.submit).not.toHaveBeenCalled();
  });

  it('submits exactly once on a double click', () => {
    const pending = deferred();
    const client = clientFrom(() => pending.promise);
    renderModal(client);
    fillValidForm();
    const button = screen.getByRole('button', { name: 'Enviar solicitud' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(client.submit).toHaveBeenCalledTimes(1);
  });

  it('keeps the submission id for manual retry and never retries automatically', async () => {
    const client = clientFrom(async () => {
      if (vi.mocked(client.submit).mock.calls.length === 1) throw new TypeError('network');
      return { accepted: true };
    });
    renderModal(client);
    fillValidForm();
    submit();
    await screen.findByText(/no pudimos enviar/i);
    expect(client.submit).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(client.submit).toHaveBeenCalledTimes(1);
    const firstId = vi.mocked(client.submit).mock.calls[0]?.[0].submissionId;
    fireEvent.click(screen.getByRole('button', { name: /reintentar envío/i }));
    await screen.findByText(/recibimos tu solicitud/i);
    expect(vi.mocked(client.submit).mock.calls[1]?.[0].submissionId).toBe(firstId);
  }, 15_000);

  it('shows a natural rate-limit state without approval or pricing promises', async () => {
    const client = clientFrom(async () => {
      throw new ApiError(429, 'COMMERCIAL_LEAD_RATE_LIMITED', 'technical');
    });
    renderModal(client);
    fillValidForm();
    submit();
    expect(await screen.findByText(/ya recibimos varias solicitudes/i)).toBeInTheDocument();
    expect(screen.queryByText(/aprobado|tarifa aprobada|cuenta creada/i)).not.toBeInTheDocument();
  }, 15_000);

  it('uses the contracted Venue title, success copy and restores focus on close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir venue
          </button>
          <CommercialLeadModal
            open={open}
            opportunityType="VENUE"
            onClose={() => setOpen(false)}
            client={resolvedClient()}
          />
        </>
      );
    }
    render(
      <AppThemeProvider>
        <Harness />
      </AppThemeProvider>
    );
    const trigger = screen.getByRole('button', { name: 'Abrir venue' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('heading', { name: 'Propuesta para tu venue' })).toBeInTheDocument();
    fillValidForm();
    submit();
    expect(
      await screen.findByText('Recibimos tu solicitud. La revisaremos para continuar el proceso comercial.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  }, 15_000);

  it('keeps the form accessible at mobile width and hides the honeypot from navigation', () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));

    const view = renderModal(resolvedClient());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre de contacto/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeVisible();
    expect(document.querySelector('input[name="website"]')).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('textbox', { name: /website/i })).not.toBeInTheDocument();

    view.unmount();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    window.dispatchEvent(new Event('resize'));
  });
});

function renderModal(client: LandingCommercialLeadsClient) {
  return render(
    <AppThemeProvider>
      <CommercialLeadModal open opportunityType="PLANNER_AGENCY" onClose={vi.fn()} client={client} />
    </AppThemeProvider>
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/nombre de contacto/i), { target: { value: 'María López' } });
  fireEvent.change(screen.getByLabelText(/empresa \/ venue \/ agencia/i), { target: { value: 'Eventos Aurora' } });
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), { target: { value: 'maria@aurora.mx' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }));
}

function resolvedClient(): LandingCommercialLeadsClient {
  return clientFrom(async () => ({ accepted: true }));
}

function clientFrom(implementation: LandingCommercialLeadsClient['submit']): LandingCommercialLeadsClient {
  return { submit: vi.fn(implementation) };
}

function deferred() {
  let resolve!: (value: { accepted: true }) => void;
  const promise = new Promise<{ accepted: true }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
