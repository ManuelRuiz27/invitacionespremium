import type { FloorplanShapeInput } from '@invitaciones/api-client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FloorplanTray } from './FloorplanTray';
import type { PendingTable } from './floorplan-inventory';

const input = (name: string): FloorplanShapeInput => ({
  name,
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 8,
  x: 0.1,
  y: 0.1,
  width: 0.12,
  height: 0.12,
  rotation: 0,
  polygonPoints: null
});
const tables: PendingTable[] = [
  { temporaryId: 'pending-1', input: input('Mesa 1') },
  { temporaryId: 'pending-2', input: input('Mesa Jardín') }
];

describe('FloorplanTray', () => {
  it('exposes keyboard-accessible placement selection', async () => {
    const onChoose = vi.fn();
    render(<FloorplanTray tables={tables} disabled={false} onChoose={onChoose} onAutoPlace={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Mesa Jardín8 lugares/ }));
    expect(onChoose).toHaveBeenCalledWith('pending-2');
  });

  it('offers the batch auto-placement action', async () => {
    const onAutoPlace = vi.fn();
    render(<FloorplanTray tables={tables} disabled={false} onChoose={vi.fn()} onAutoPlace={onAutoPlace} />);
    await userEvent.click(screen.getByRole('button', { name: 'Colocar automáticamente' }));
    expect(onAutoPlace).toHaveBeenCalledOnce();
  });
});
