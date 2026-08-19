import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FloorplanStickerCatalog } from './FloorplanStickerCatalog';
import { floorplanStickerPresets } from './floorplan-sticker-catalog';

describe('FloorplanStickerCatalog', () => {
  it('shows both natural groups and all eleven accessible presets', () => {
    render(<FloorplanStickerCatalog disabled={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Mesas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Zonas' })).toBeInTheDocument();
    for (const preset of floorplanStickerPresets) {
      const button = screen.getByRole('button', { name: preset.label });
      expect(button).toBeInTheDocument();
      expect(button).toHaveStyle({ minHeight: '64px' });
    }
  });

  it('selects by pointer and keyboard and communicates the selected state', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<FloorplanStickerCatalog disabled={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pista' }));
    expect(onSelect).toHaveBeenCalledWith('dance-floor');
    screen.getByRole('button', { name: 'Mesa redonda' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('round-table');
    rerender(<FloorplanStickerCatalog selectedId="round-table" disabled={false} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Mesa redonda' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables every preset in locked/read-only mode', () => {
    render(<FloorplanStickerCatalog selectedId="round-table" disabled onSelect={vi.fn()} />);
    for (const preset of floorplanStickerPresets)
      expect(screen.getByRole('button', { name: preset.label })).toBeDisabled();
  });
});
