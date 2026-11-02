import type { FloorplanShape } from '@invitaciones/api-client';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableNameSelector } from './TableNameSelector';

const tables = Array.from({ length: 200 }, (_, i) => ({
  id: `table-${i}`,
  name: `Mesa ${i + 1}`,
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 10,
  occupancy: 0,
  availableCapacity: 10,
  x: 0,
  y: 0,
  width: 0.03,
  height: 0.03,
  rotation: 0,
  sourceElementId: null,
  polygonPoints: null
})) satisfies FloorplanShape[];

describe('TableNameSelector', () => {
  it('bounds the 200-option list, supports partial/exact/empty search and removes its portal on close', async () => {
    render(<TableNameSelector tables={tables} selectedTable={undefined} onSelect={vi.fn()} onClear={vi.fn()} />);
    const user = userEvent.setup(),
      input = screen.getByRole('combobox');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await user.click(input);
    expect(screen.getByRole('listbox')).toHaveStyle({ maxHeight: 'min(320px, 40dvh)' });
    expect(screen.getAllByRole('option')).toHaveLength(200);
    await user.type(input, 'sa 19');
    expect(screen.getAllByRole('option')).toHaveLength(11);
    await user.clear(input);
    await user.type(input, 'Mesa 200');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(input);
    await user.type(input, 'inexistente');
    expect(screen.getByText('No hay mesas con ese nombre.')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('uses stable IDs for repeated names, preserves full long names and supports keyboard selection', async () => {
    const repeated = [
      { ...tables[0]!, name: 'Familia Pérez' },
      { ...tables[1]!, name: 'Familia Pérez' },
      { ...tables[2]!, name: 'Mesa de amistades y familiares con una referencia humana muy extensa' }
    ];
    const onSelect = vi.fn(),
      onClear = vi.fn();
    const view = render(
      <TableNameSelector tables={repeated} selectedTable={repeated[1]} onSelect={onSelect} onClear={onClear} />
    );
    const input = screen.getByRole('combobox'),
      user = userEvent.setup();
    expect(input).toHaveValue('Familia Pérez (2/2)');
    await user.click(input);
    expect(screen.getByRole('option', { name: 'Familia Pérez (1/2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Familia Pérez (2/2)' })).toHaveAttribute('aria-selected', 'true');
    await user.clear(input);
    await user.type(input, 'amistades');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(repeated[2]);
    view.rerender(
      <TableNameSelector tables={repeated} selectedTable={repeated[2]} onSelect={onSelect} onClear={onClear} />
    );
    expect(input).toHaveValue(repeated[2]!.name);
    await user.click(screen.getByRole('button', { name: 'Limpiar mesa seleccionada' }));
    expect(onClear).toHaveBeenCalled();
    await user.click(input);
    fireEvent.touchStart(within(screen.getByRole('listbox')).getByText('Familia Pérez (1/2)'));
    await user.click(screen.getByRole('option', { name: 'Familia Pérez (1/2)' }));
    expect(onSelect).toHaveBeenLastCalledWith(repeated[0]);
  });
});
