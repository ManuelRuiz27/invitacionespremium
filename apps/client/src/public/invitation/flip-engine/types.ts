export type FlipDirection = 'next' | 'prev';

export type FlipEnginePhase = 'idle' | 'dragging' | 'completing' | 'snapping_back' | 'resizing';

export type FlipLayout = 'single' | 'spread';

export type FlipOrientation = 'portrait' | 'landscape';

export interface BookSnapshot {
  page: number;
  pageCount: number;
  orientation: FlipOrientation;
  visiblePages: number[];
}

export interface TurnSnapshot {
  phase: FlipEnginePhase;
  direction: FlipDirection | null;
  progress: number;
  velocity: number;
}

export interface PointerPoint {
  x: number;
  y: number;
  at: number;
}

export interface TurnBounds {
  width: number;
  height: number;
}
