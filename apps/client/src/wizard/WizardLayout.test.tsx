import { AppThemeProvider } from '@invitaciones/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { configuredEvent } from '../test/fixtures';
import { WizardLayout } from './WizardLayout';

function layout(overrides: Partial<ComponentProps<typeof WizardLayout>> = {}) {
  const props: ComponentProps<typeof WizardLayout> = {
    event: configuredEvent,
    steps: ['datos', 'contactos', 'invitacion', 'confirmacion', 'croquis', 'revision'],
    selectedStep: 'contactos',
    editable: true,
    saveState: 'idle',
    message: undefined,
    busy: false,
    onDismissMessage: vi.fn(),
    onGo: vi.fn(),
    onExit: vi.fn(),
    children: <div>Contenido del paso</div>,
    ...overrides
  };
  const view = render(
    <AppThemeProvider>
      <WizardLayout {...props} />
    </AppThemeProvider>
  );
  return { ...view, props };
}

describe('WizardLayout', () => {
  it('keeps the event as the only h1 and uses light navigation with the active step identified', () => {
    const { container } = layout();
    expect(screen.getByRole('heading', { level: 1, name: configuredEvent.name! })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/Completa los pasos/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sin cambios pendientes')).not.toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Etapas de configuración' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invitados', selected: true })).toHaveAttribute('aria-current', 'step');
    expect(container.querySelector('.MuiPaper-root')).toBeNull();
  });

  it.each(['pending', 'saving', 'saved', 'error'] as const)(
    'communicates %s without changing save behavior',
    (saveState) => {
      layout({ saveState });
      const labels = {
        pending: 'Cambios pendientes',
        saving: 'Guardando…',
        saved: 'Cambios guardados',
        error: 'No pudimos guardar los cambios'
      };
      expect(screen.getByText(labels[saveState])).toBeInTheDocument();
      if (saveState === 'error') expect(screen.getByRole('alert')).toHaveTextContent(labels.error);
    }
  );

  it('preserves previous, next, exit and direct step callbacks', async () => {
    const { props } = layout();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(props.onGo).toHaveBeenLastCalledWith('datos');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(props.onGo).toHaveBeenLastCalledWith('invitacion');
    await user.click(screen.getByRole('tab', { name: 'Revisión' }));
    expect(props.onGo).toHaveBeenLastCalledWith('revision');
    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(props.onExit).toHaveBeenCalledOnce();
  });

  it('disables navigation during saves and respects sequence boundaries', () => {
    layout({ busy: true });
    for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
    for (const name of ['Salir', 'Anterior', 'Continuar']) expect(screen.getByRole('button', { name })).toBeDisabled();
  });

  it.each(['datos', 'revision'] as const)('keeps the %s navigation boundary', (selectedStep) => {
    layout({ selectedStep });
    expect(screen.getByRole('button', { name: selectedStep === 'datos' ? 'Anterior' : 'Continuar' })).toBeDisabled();
  });

  it('keeps read-only and dismissible feedback visible', async () => {
    const { props } = layout({ editable: false, message: 'Revisa los datos antes de continuar.' });
    expect(screen.getByText(/solo lectura/)).toBeInTheDocument();
    expect(screen.getByText('Revisa los datos antes de continuar.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onDismissMessage).toHaveBeenCalledOnce();
  });
});
