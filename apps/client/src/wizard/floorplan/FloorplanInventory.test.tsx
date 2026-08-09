import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FloorplanInventory } from './FloorplanInventory';

describe('FloorplanInventory', () => {
  it('creates a multi-table UI configuration without calling the API directly', async () => {
    const onCreate = vi.fn();
    render(<FloorplanInventory disabled={false} onCreate={onCreate} />);

    await userEvent.clear(screen.getByLabelText('Cantidad'));
    await userEvent.type(screen.getByLabelText('Cantidad'), '3');
    await userEvent.clear(screen.getByLabelText('Número de lugares'));
    await userEvent.type(screen.getByLabelText('Número de lugares'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Crear inventario de 3 mesas' }));

    expect(onCreate).toHaveBeenCalledWith([expect.objectContaining({ geometry: 'CIRCLE', quantity: 3, capacity: 8 })]);
  });

  it('enforces the 200-table inventory limit', async () => {
    render(<FloorplanInventory disabled={false} onCreate={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText('Cantidad'));
    await userEvent.type(screen.getByLabelText('Cantidad'), '201');
    expect(screen.getByRole('button', { name: 'Crear inventario de 201 mesas' })).toBeDisabled();
  });
});
