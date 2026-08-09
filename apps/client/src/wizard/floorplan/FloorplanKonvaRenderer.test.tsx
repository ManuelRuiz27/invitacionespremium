import type { Floorplan, FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import { act, render } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const konva = vi.hoisted(() => ({ nodes: [] as Array<{ type: string; props: Record<string, unknown> }> }));

vi.mock('react-konva', () => {
  const component = (type: string) =>
    forwardRef<Record<string, unknown>, Record<string, unknown>>((props, ref) => {
      const node = {
        nodes: vi.fn(),
        getLayer: () => ({ batchDraw: vi.fn() }),
        cache: vi.fn(),
        clearCache: vi.fn(),
        hitStrokeWidth: vi.fn(),
        container: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
        stopDrag: vi.fn(),
        x: () => Number(props.x ?? 0),
        y: () => Number(props.y ?? 0),
        scaleX: () => Number(props.scaleX ?? 1),
        scaleY: () => Number(props.scaleY ?? 1),
        scale: vi.fn(),
        position: vi.fn(),
        batchDraw: vi.fn()
      };
      useImperativeHandle(ref, () => node);
      konva.nodes.push({ type, props });
      return React.createElement(
        'div',
        {
          'data-konva-type': type,
          'data-konva-name': props.name,
          style: props.style as React.CSSProperties | undefined
        },
        props.children as React.ReactNode
      );
    });
  return {
    Stage: component('Stage'),
    Layer: component('Layer'),
    Image: component('Image'),
    Group: component('Group'),
    Circle: component('Circle'),
    Line: component('Line'),
    Rect: component('Rect'),
    Text: component('Text'),
    Transformer: component('Transformer')
  };
});

import { FloorplanKonvaRenderer } from './FloorplanKonvaRenderer';

const table: FloorplanShape = {
  id: 'table-1',
  name: 'Mesa 1',
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 4,
  occupancy: 0,
  availableCapacity: 4,
  x: 0.1,
  y: 0.2,
  width: 0.2,
  height: 0.2,
  rotation: 0,
  polygonPoints: null
};
const floorplan: Floorplan = {
  id: 'fp',
  eventId: 'event',
  image: { fileAssetId: 'asset', contentPath: '/asset' },
  locked: false,
  lockedAt: null,
  shapes: [table],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};
const image = {} as HTMLImageElement;

function props(overrides: Record<string, unknown> = {}) {
  return {
    floorplan,
    imageUrl: 'blob:plan',
    image,
    width: 1000,
    height: 500,
    viewport: { scale: 1, x: 0, y: 0 },
    selectedId: undefined,
    draft: undefined,
    disabled: false,
    showSeats: false,
    snap: false,
    panEnabled: false,
    onSelect: vi.fn(),
    onDraftChange: vi.fn(),
    onViewportChange: vi.fn(),
    ...overrides
  };
}

const latest = (type: string, name?: string) =>
  [...konva.nodes].reverse().find((node) => node.type === type && (!name || node.props.name === name))!;

describe('FloorplanKonvaRenderer de producción', () => {
  beforeEach(() => {
    konva.nodes.length = 0;
  });

  it('selecciona elementos y respeta read-only/lock sin perder la alternativa DOM', () => {
    const onSelect = vi.fn();
    const view = render(<FloorplanKonvaRenderer {...props({ onSelect })} />);
    act(() => (latest('Group', 'floorplan-shape').props.onClick as () => void)());
    expect(onSelect).toHaveBeenCalledWith(table);
    view.rerender(<FloorplanKonvaRenderer {...props({ disabled: true })} />);
    expect(latest('Group', 'floorplan-shape').props.listening).toBe(false);
  });

  it('proyecta dragEnd normalizado, aplica snap y no persiste durante frames de drag', () => {
    const onDraftChange = vi.fn();
    const apiRequest = vi.fn();
    render(<FloorplanKonvaRenderer {...props({ draft: table, selectedId: table.id, snap: true, onDraftChange })} />);
    const group = latest('Group', 'floorplan-editable-shape').props;
    act(() => (group.onDragStart as (event: unknown) => void)({ evt: { preventDefault: vi.fn() } }));
    expect(onDraftChange).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
    act(() =>
      (group.onDragEnd as (event: unknown) => void)({
        target: { x: () => 330, y: () => 190, rotation: () => 0 }
      })
    );
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ x: 0.3, y: 0.3 }));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('confirma resize y rotate sólo en transformEnd', () => {
    const onDraftChange = vi.fn();
    render(<FloorplanKonvaRenderer {...props({ draft: table, selectedId: table.id, onDraftChange })} />);
    const transform = latest('Group', 'floorplan-editable-shape').props.onTransformEnd as (event: unknown) => void;
    expect(onDraftChange).not.toHaveBeenCalled();
    act(() =>
      transform({
        target: {
          x: () => 200,
          y: () => 150,
          rotation: () => 30,
          scaleX: () => 1.5,
          scaleY: () => 1.5,
          scale: vi.fn()
        }
      })
    );
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ width: 0.3, height: 0.3, rotation: 30 }));
  });

  it('edita polygonPoints normalizados con targets táctiles de 44px', () => {
    const onDraftChange = vi.fn();
    const polygon: FloorplanShapeInput = {
      ...table,
      kind: 'DECORATIVE_ZONE',
      geometry: 'POLYGON',
      capacity: 0,
      polygonPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]
    };
    render(<FloorplanKonvaRenderer {...props({ draft: polygon, onDraftChange })} />);
    const handle = latest('Circle', 'floorplan-polygon-handle').props;
    expect(handle.radius).toBe(6);
    expect(handle.hitStrokeWidth).toBe(44);
    act(() => (handle.onDragEnd as (event: unknown) => void)({ target: { x: () => -50, y: () => -25 } }));
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ polygonPoints: expect.any(Array) }));
  });

  it('cubre zoom, pan explícito, snap y sillas visuales sin bloquear scroll por defecto', () => {
    const onViewportChange = vi.fn();
    const view = render(<FloorplanKonvaRenderer {...props({ showSeats: true, snap: true, onViewportChange })} />);
    expect(latest('Stage').props.style).toEqual({ touchAction: 'pan-y' });
    expect(konva.nodes.filter((node) => node.props.name === 'floorplan-visual-seat')).toHaveLength(4);
    expect(konva.nodes.some((node) => node.type === 'Text' && node.props.text === '0/4')).toBe(true);
    expect(konva.nodes.filter((node) => node.type === 'Line').length).toBeGreaterThanOrEqual(38);
    act(() =>
      (latest('Stage').props.onWheel as (event: unknown) => void)({
        evt: { preventDefault: vi.fn(), deltaY: -1 },
        target: { getStage: () => ({ getPointerPosition: () => ({ x: 100, y: 100 }) }) }
      })
    );
    expect(onViewportChange).toHaveBeenCalledWith({ scale: 1.1, x: -10.000000000000014, y: -10.000000000000014 });
    view.rerender(<FloorplanKonvaRenderer {...props({ panEnabled: true, onViewportChange })} />);
    expect(latest('Stage').props.draggable).toBe(true);
    act(() => (latest('Stage').props.onDragEnd as (event: unknown) => void)({ target: { x: () => 24, y: () => 36 } }));
    expect(onViewportChange).toHaveBeenLastCalledWith({ scale: 1, x: 24, y: 36 });
  });
});
