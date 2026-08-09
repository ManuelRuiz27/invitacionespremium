import type { ApiClient, Event, Floorplan, FloorplanShape } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { Box, Button, Stack, Typography } from '@mui/material';
import Konva from 'konva';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FloorplanStep } from './wizard/floorplan/FloorplanStep';

type ProfileResult = {
  scenario: string;
  tables: number;
  visualSeats: number;
  konvaNodes: number;
  mountMs: number;
  zoom: InteractionResult;
  pan: InteractionResult;
  drag: InteractionResult;
};
type InteractionResult = { durationMs: number; approximateFps: number; p95FrameMs: number; framesOver20Ms: number };

const venueSvg = new Blob(
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="820" viewBox="0 0 1400 820">
      <rect width="1400" height="820" fill="#F6F4EF"/><path d="M80 90H1320V730H80Z" fill="#FFFEFB" stroke="#B9B4AA" stroke-width="10"/>
      <path d="M460 90V730M930 90V730M80 410H1320" stroke="#DDD8CE" stroke-width="6"/><text x="115" y="145" font-family="sans-serif" font-size="28" fill="#5F6879">Salón principal</text>
    </svg>`
  ],
  { type: 'image/svg+xml' }
);
const event = { id: 'profile-event', name: 'Boda de Andrea y Mateo', status: 'DRAFT', floorplanEnabled: true } as Event;

function shapes(count: number): FloorplanShape[] {
  const columns = count <= 20 ? 8 : count <= 60 ? 12 : 20;
  const cellWidth = 0.92 / columns;
  const rows = Math.ceil(count / columns);
  const cellHeight = 0.84 / rows;
  return Array.from({ length: count }, (_, index) => {
    return {
      id: `table-${index}`,
      name: `${index + 1}`,
      kind: 'TABLE',
      geometry: index % 3 === 0 ? 'CIRCLE' : index % 3 === 1 ? 'SQUARE' : 'RECTANGLE',
      capacity: 10,
      occupancy: 0,
      availableCapacity: 10,
      x: 0.04 + (index % columns) * cellWidth,
      y: 0.07 + Math.floor(index / columns) * cellHeight,
      width: (count <= 20 ? 0.07 : count <= 60 ? 0.05 : 0.032) * (index % 3 === 2 ? 1.3 : 1),
      height: count <= 20 ? 0.1 : count <= 60 ? 0.07 : 0.052,
      rotation: index % 4 === 0 ? 15 : 0,
      polygonPoints: null
    } as FloorplanShape;
  });
}

function makeFloorplan(count: number): Floorplan {
  return {
    id: `profile-${count}`,
    eventId: event.id,
    image: { fileAssetId: 'venue', contentPath: '/venue' },
    locked: false,
    lockedAt: null,
    shapes: shapes(count),
    createdAt: '2026-08-09T00:00:00Z',
    updatedAt: '2026-08-09T00:00:00Z'
  };
}

function App() {
  const [count, setCount] = useState(20);
  const [runKey, setRunKey] = useState(0);
  const [results, setResults] = useState<ProfileResult[]>([]);
  const floorplan = useMemo(() => makeFloorplan(count), [count]);
  const api = useMemo(
    () =>
      ({
        floorplan: {
          get: async () => floorplan,
          addShape: async (_eventId: string, input: FloorplanShape) => ({ ...input, id: crypto.randomUUID() }),
          updateShape: async (_eventId: string, id: string, input: FloorplanShape) => ({ ...input, id }),
          removeShape: async () => undefined,
          lock: async () => ({ ...floorplan, locked: true }),
          unlock: async () => floorplan,
          setImage: async () => floorplan,
          replaceImage: async () => floorplan
        },
        fileAssets: { content: async () => venueSvg, upload: async () => ({ id: 'venue' }) }
      }) as unknown as ApiClient,
    [floorplan]
  );

  window.__floorplanSetScenario = async (nextCount: number) => {
    setCount(nextCount);
    setRunKey((value) => value + 1);
  };
  window.__floorplanRecord = (result: ProfileResult) => setResults((current) => [...current, result]);

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', p: { xs: 1.5, md: 3 } }}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="overline" color="primary">
            Harness de producción
          </Typography>
          <Typography variant="h2">Croquis Sticker · {count} mesas</Typography>
        </Box>
        <Button variant="contained" onClick={() => void runAllProfiles()}>
          Ejecutar perfil completo
        </Button>
      </Stack>
      <FloorplanStep
        key={`${count}-${runKey}`}
        apiClient={api}
        event={event}
        draft={{ confirmationEnabled: false, floorplanEnabled: true }}
        disabled={false}
        onChange={() => undefined}
      />
      <Box
        component="pre"
        data-testid="profile-results"
        sx={{ mt: 2, p: 2, overflow: 'auto', bgcolor: '#17233C', color: '#fff' }}
      >
        {JSON.stringify(results, null, 2)}
      </Box>
    </Box>
  );
}

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForStage(expected: number) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const stage = Konva.stages.at(-1);
    if (stage?.find('.floorplan-shape').length === expected) return stage;
    await nextFrame();
  }
  throw new Error(`Konva no montó ${expected} mesas`);
}

async function measureFrames(action: (stage: Konva.Stage, frame: number) => void): Promise<InteractionResult> {
  const stage = Konva.stages.at(-1)!;
  const samples: number[] = [];
  const start = performance.now();
  let previous = start;
  for (let frame = 0; frame < 90; frame += 1) {
    await nextFrame();
    const now = performance.now();
    samples.push(now - previous);
    previous = now;
    action(stage, frame);
    stage.batchDraw();
  }
  const durationMs = performance.now() - start;
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    durationMs: Number(durationMs.toFixed(1)),
    approximateFps: Number((1000 / (durationMs / samples.length)).toFixed(1)),
    p95FrameMs: Number((sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)),
    framesOver20Ms: samples.filter((sample) => sample > 20).length
  };
}

async function runScenario(count: number, showSeats: boolean): Promise<ProfileResult> {
  const mountedAt = performance.now();
  await window.__floorplanSetScenario(count);
  const stage = await waitForStage(count);
  const mountMs = performance.now() - mountedAt;
  if (showSeats) {
    (document.querySelector('[aria-label="Mostrar sillas"]') as HTMLButtonElement | null)?.click();
    await nextFrame();
  }
  const zoom = await measureFrames((current, frame) =>
    current.scale({ x: 1 + (frame % 15) / 100, y: 1 + (frame % 15) / 100 })
  );
  const pan = await measureFrames((current, frame) => current.position({ x: frame % 30, y: frame % 20 }));
  const node = stage.findOne('.floorplan-shape');
  const drag = await measureFrames((_current, frame) => node?.position({ x: 80 + (frame % 45), y: 80 + (frame % 30) }));
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: 0, y: 0 });
  stage.batchDraw();
  return {
    scenario: showSeats ? '20 mesas con sillas visibles' : `${count} mesas`,
    tables: count,
    visualSeats: stage.find('.floorplan-visual-seat').length,
    konvaNodes: stage.find(() => true).length,
    mountMs: Number(mountMs.toFixed(1)),
    zoom,
    pan,
    drag
  };
}

async function runAllProfiles() {
  const results: ProfileResult[] = [];
  for (const scenario of [
    { count: 10, seats: false },
    { count: 60, seats: false },
    { count: 180, seats: false },
    { count: 200, seats: false },
    { count: 20, seats: true }
  ]) {
    const result = await runScenario(scenario.count, scenario.seats);
    results.push(result);
    window.__floorplanRecord(result);
  }
  return results;
}

declare global {
  interface Window {
    __floorplanSetScenario: (count: number) => Promise<void>;
    __floorplanRecord: (result: ProfileResult) => void;
    runFloorplanProfile: () => Promise<ProfileResult[]>;
  }
}
window.runFloorplanProfile = runAllProfiles;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  </StrictMode>
);
