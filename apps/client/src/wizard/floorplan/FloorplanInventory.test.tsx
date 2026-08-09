import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FloorplanInventory } from './FloorplanInventory';

describe('FloorplanInventory', () => {
  it('creates a multi-table UI configuration without calling the API directly', async () => {
    const onCreate = vi.fn();
    render(<FloorplanInventory disabled={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole('button', { name: /Aumentar cantidad/i }));
    await userEvent.click(screen.getByRole('button', { name: /Aumentar cantidad/i }));
    await userEvent.click(screen.getByRole('button', { name: /Reducir número de lugares/i }));
    await userEvent.click(screen.getByRole('button', { name: /Reducir número de lugares/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear 3 mesas' }));
    expect(onCreate).toHaveBeenCalledWith([expect.objectContaining({ geometry: 'CIRCLE', quantity: 3, capacity: 8 })]);
  });

  it('enforces the pending inventory limit', async () => {
    render(<FloorplanInventory disabled={false} maxTables={2} onCreate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Aumentar cantidad/i }));
    expect(screen.getByRole('button', { name: /Aumentar cantidad/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Crear 2 mesas' })).toBeEnabled();
  });
});
