import type { FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import { normalizeFloorplanShape } from './floorplan-geometry';
import type { FloorplanRendererProps } from './FloorplanDomRenderer';
import { hasEqualPhysicalSides, shapeToStageRect, stageRectToShape } from './floorplan-scene';
import { contrastingText, stickerColor } from './floorplan-sticker-style';
import { visualSeats } from './floorplan-visual-seats';

export interface ViewportState {
  scale: number;
  x: number;
  y: number;
}

export function FloorplanKonvaRenderer(
  props: FloorplanRendererProps & {
    image: HTMLImageElement;
    width: number;
    height: number;
    viewport: ViewportState;
    onViewportChange: (viewport: ViewportState) => void;
  }
) {
  const stageRef = useRef<Konva.Stage>(null);
  const pinchRef = useRef<
    | {
        distance: number;
        point: { x: number; y: number };
        scale: number;
        viewport: ViewportState;
      }
    | undefined
  >(undefined);
  const stageSize = { width: props.width, height: props.height };
  const selected = props.draft;
  const selectedRect = selected ? shapeToStageRect(selected, stageSize) : undefined;

  const place = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!props.onCanvasPlace || props.disabled) return;
    const stage = event.target.getStage();
    if (!stage || (event.target !== stage && event.target.name() !== 'floorplan-image')) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    props.onCanvasPlace({
      x: Math.min(1, Math.max(0, (pointer.x - props.viewport.x) / props.viewport.scale / props.width)),
      y: Math.min(1, Math.max(0, (pointer.y - props.viewport.y) / props.viewport.scale / props.height))
    });
  };

  const wheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const oldScale = props.viewport.scale;
    const nextScale = Math.min(4, Math.max(0.5, oldScale * (event.evt.deltaY > 0 ? 0.9 : 1.1)));
    const point = { x: (pointer.x - props.viewport.x) / oldScale, y: (pointer.y - props.viewport.y) / oldScale };
    props.onViewportChange({
      scale: nextScale,
      x: pointer.x - point.x * nextScale,
      y: pointer.y - point.y * nextScale
    });
  };

  const touchPoint = (touch: Touch, stage: Konva.Stage) => {
    const bounds = stage.container().getBoundingClientRect();
    return { x: touch.clientX - bounds.left, y: touch.clientY - bounds.top };
  };

  const startPinch = (event: KonvaEventObject<TouchEvent>) => {
    if (event.evt.touches.length !== 2) return;
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    stage.stopDrag();
    const first = touchPoint(event.evt.touches[0]!, stage);
    const second = touchPoint(event.evt.touches[1]!, stage);
    const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    pinchRef.current = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      point: {
        x: (center.x - stage.x()) / stage.scaleX(),
        y: (center.y - stage.y()) / stage.scaleY()
      },
      scale: stage.scaleX(),
      viewport: props.viewport
    };
  };

  const movePinch = (event: KonvaEventObject<TouchEvent>) => {
    const pinch = pinchRef.current;
    const stage = stageRef.current;
    if (!pinch || !stage || event.evt.touches.length !== 2) return;
    event.evt.preventDefault();
    const first = touchPoint(event.evt.touches[0]!, stage);
    const second = touchPoint(event.evt.touches[1]!, stage);
    const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const scale = Math.min(4, Math.max(0.5, pinch.scale * (distance / pinch.distance)));
    const viewport = { scale, x: center.x - pinch.point.x * scale, y: center.y - pinch.point.y * scale };
    stage.scale({ x: scale, y: scale });
    stage.position({ x: viewport.x, y: viewport.y });
    stage.batchDraw();
    pinch.viewport = viewport;
  };

  const finishPinch = (event: KonvaEventObject<TouchEvent>) => {
    if (event.evt.touches.length >= 2 || !pinchRef.current) return;
    props.onViewportChange(pinchRef.current.viewport);
    pinchRef.current = undefined;
  };

  return (
    <Stage
      ref={stageRef}
      width={props.width}
      height={props.height}
      scaleX={props.viewport.scale}
      scaleY={props.viewport.scale}
      x={props.viewport.x}
      y={props.viewport.y}
      draggable={!selected}
      onDragEnd={(event) => {
        if (selected) return;
        props.onViewportChange({ ...props.viewport, x: event.target.x(), y: event.target.y() });
      }}
      onWheel={wheel}
      onTouchStart={startPinch}
      onTouchMove={movePinch}
      onTouchEnd={finishPinch}
      onClick={place}
      onTap={place}
      style={{ touchAction: 'none' }}
    >
      <Layer>
        <KonvaImage
          name="floorplan-image"
          image={props.image}
          width={props.width}
          height={props.height}
          listening={!selected}
        />
        {props.snap
          ? Array.from({ length: 19 }, (_, index) => (index + 1) / 20).flatMap((position) => [
              <Line
                key={`vertical-${position}`}
                points={[position * props.width, 0, position * props.width, props.height]}
                stroke="rgba(25, 118, 210, 0.24)"
                dash={[4, 6]}
                listening={false}
              />,
              <Line
                key={`horizontal-${position}`}
                points={[0, position * props.height, props.width, position * props.height]}
                stroke="rgba(25, 118, 210, 0.24)"
                dash={[4, 6]}
                listening={false}
              />
            ])
          : null}
        {props.floorplan.shapes.map((shape) => {
          if (selected && props.selectedId === shape.id) return null;
          return (
            <KonvaShapeNode
              key={shape.id}
              shape={shape}
              stageSize={stageSize}
              selected={false}
              disabled={props.disabled || Boolean(selected)}
              showSeats={props.showSeats}
              onSelect={() => props.onSelect(shape)}
            />
          );
        })}
        {selected && selectedRect ? (
          <EditableKonvaShape
            shape={selected}
            stageSize={stageSize}
            disabled={props.disabled}
            snap={props.snap}
            showSeats={props.showSeats}
            onChange={props.onDraftChange}
          />
        ) : null}
      </Layer>
    </Stage>
  );
}

function EditableKonvaShape({
  shape,
  stageSize,
  disabled,
  snap,
  showSeats,
  onChange
}: {
  shape: FloorplanShapeInput;
  stageSize: { width: number; height: number };
  disabled: boolean;
  snap: boolean;
  showSeats: boolean;
  onChange: (shape: FloorplanShapeInput) => void;
}) {
  const nodeRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const rect = shapeToStageRect(shape, stageSize);
  useEffect(() => {
    const node = nodeRef.current;
    const transformer = transformerRef.current;
    if (node && transformer) {
      transformer.nodes([node]);
      transformer.getLayer()?.batchDraw();
    }
  }, [shape.geometry]);

  const commitPosition = (node: Konva.Group) => {
    const next = stageRectToShape(
      shape,
      {
        x: node.x() - rect.width / 2,
        y: node.y() - rect.height / 2,
        width: rect.width,
        height: rect.height,
        rotation: node.rotation()
      },
      stageSize
    );
    onChange(
      snap
        ? normalizeFloorplanShape({ ...next, x: Math.round(next.x * 20) / 20, y: Math.round(next.y * 20) / 20 })
        : next
    );
  };

  const commitTransform = (node: Konva.Group) => {
    const width = Math.max(1, rect.width * Math.abs(node.scaleX()));
    const height = Math.max(1, rect.height * Math.abs(node.scaleY()));
    node.scale({ x: 1, y: 1 });
    onChange(
      stageRectToShape(
        shape,
        { x: node.x() - width / 2, y: node.y() - height / 2, width, height, rotation: node.rotation() },
        stageSize
      )
    );
  };

  return (
    <>
      <Group
        ref={nodeRef}
        x={rect.x + rect.width / 2}
        y={rect.y + rect.height / 2}
        rotation={rect.rotation}
        draggable={!disabled}
        onDragEnd={(event) => commitPosition(event.target as Konva.Group)}
        onTransformEnd={(event) => commitTransform(event.target as Konva.Group)}
      >
        <KonvaShapeVisual
          shape={shape}
          width={rect.width}
          height={rect.height}
          selected
          showSeats={showSeats}
          colorKey={shape.name}
        />
        {shape.geometry === 'POLYGON'
          ? shape.polygonPoints?.map((point, index) => (
              <Circle
                key={index}
                x={point.x * rect.width - rect.width / 2}
                y={point.y * rect.height - rect.height / 2}
                radius={22}
                fill="rgba(255,255,255,0.01)"
                stroke="#8C5000"
                strokeWidth={4}
                draggable={!disabled}
                onDragEnd={(event) => {
                  const points = shape.polygonPoints!.map((candidate, pointIndex) =>
                    pointIndex === index
                      ? {
                          x: Math.min(1, Math.max(0, (event.target.x() + rect.width / 2) / rect.width)),
                          y: Math.min(1, Math.max(0, (event.target.y() + rect.height / 2) / rect.height))
                        }
                      : candidate
                  );
                  onChange(normalizeFloorplanShape({ ...shape, polygonPoints: points }));
                }}
              />
            ))
          : null}
      </Group>
      <Transformer
        ref={transformerRef}
        rotateEnabled
        flipEnabled={false}
        keepRatio={hasEqualPhysicalSides(shape.geometry)}
        anchorSize={16}
        anchorCornerRadius={8}
        borderStroke="#8C5000"
        enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        boundBoxFunc={(oldBox, nextBox) => (nextBox.width < 24 || nextBox.height < 24 ? oldBox : nextBox)}
      />
    </>
  );
}

function KonvaShapeNode({
  shape,
  stageSize,
  selected,
  disabled,
  showSeats,
  onSelect
}: {
  shape: FloorplanShape;
  stageSize: { width: number; height: number };
  selected: boolean;
  disabled: boolean;
  showSeats: boolean;
  onSelect: () => void;
}) {
  const rect = shapeToStageRect(shape, stageSize);
  return (
    <Group
      x={rect.x + rect.width / 2}
      y={rect.y + rect.height / 2}
      rotation={rect.rotation}
      listening={!disabled}
      onClick={onSelect}
      onTap={onSelect}
    >
      <KonvaShapeVisual
        shape={shape}
        width={rect.width}
        height={rect.height}
        selected={selected}
        showSeats={showSeats}
        colorKey={shape.id}
      />
    </Group>
  );
}

function KonvaShapeVisual({
  shape,
  width,
  height,
  selected,
  showSeats,
  colorKey
}: {
  shape: FloorplanShape | FloorplanShapeInput;
  width: number;
  height: number;
  selected: boolean;
  showSeats: boolean;
  colorKey: string;
}) {
  const background = stickerColor(colorKey, shape.kind === 'DECORATIVE_ZONE');
  const seats =
    shape.kind === 'TABLE' && showSeats ? visualSeats(shape.geometry, shape.capacity, width, height, 10) : [];
  const polygonPoints = useMemo(
    () => shape.polygonPoints?.flatMap((point) => [point.x * width - width / 2, point.y * height - height / 2]) ?? [],
    [height, shape.polygonPoints, width]
  );
  const common = { fill: background, stroke: selected ? '#8C5000' : '#FFFFFF', strokeWidth: selected ? 4 : 2 };
  return (
    <>
      {seats.map((seat, index) => (
        <Circle
          key={index}
          x={seat.x - width / 2}
          y={seat.y - height / 2}
          radius={5}
          fill={background}
          stroke="#FFFFFF"
          strokeWidth={1}
          listening={false}
        />
      ))}
      {shape.geometry === 'CIRCLE' ? (
        <Circle radius={width / 2} {...common} />
      ) : shape.geometry === 'POLYGON' ? (
        <Line points={polygonPoints} closed {...common} />
      ) : (
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          cornerRadius={shape.geometry === 'SQUARE' ? 8 : 6}
          {...common}
        />
      )}
      <Text
        x={-width / 2 + 4}
        y={-12}
        width={Math.max(0, width - 8)}
        text={
          shape.kind === 'TABLE'
            ? `${shape.name || 'Nueva mesa'}\n${shape.capacity} lugares`
            : shape.name || 'Nueva zona'
        }
        align="center"
        fontSize={Math.max(10, Math.min(14, width / 5))}
        fontStyle="bold"
        lineHeight={1.15}
        fill={contrastingText(background)}
        listening={false}
      />
    </>
  );
}
