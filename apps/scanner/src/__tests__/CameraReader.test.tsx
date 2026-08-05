import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import jsQR from 'jsqr';
import { CameraReader } from '../components/CameraReader';

vi.mock('jsqr', () => ({ default: vi.fn() }));

const stop = vi.fn();
const getUserMedia = vi.fn();
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

beforeEach(() => {
  stop.mockClear();
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
  frames = new Map();
  nextFrameId = 1;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined)
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 320 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 240 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }))
    }))
  });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id))
  );
  vi.mocked(jsQR).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CameraReader', () => {
  it('inicia una sola cámara, usa playsInline y libera recursos al desmontar', async () => {
    const firstScan = vi.fn();
    const view = render(<CameraReader onScan={firstScan} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Vista de la cámara')).toHaveAttribute('playsinline');
    view.rerender(<CameraReader onScan={vi.fn()} paused />);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('distingue permiso denegado', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    render(<CameraReader onScan={vi.fn()} />);
    expect(
      await screen.findByText('Permiso de cámara denegado. Habilítalo en el navegador para escanear.')
    ).toBeInTheDocument();
  });

  it('distingue cámara no disponible', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Missing', 'NotFoundError'));
    render(<CameraReader onScan={vi.fn()} />);
    expect(await screen.findByText('No hay una cámara disponible para escanear.')).toBeInTheDocument();
  });

  it('maneja ausencia de mediaDevices', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    render(<CameraReader onScan={vi.fn()} />);
    expect(await screen.findByText('Este dispositivo o navegador no ofrece acceso a la cámara.')).toBeInTheDocument();
  });

  it('maneja rechazo inesperado de video.play', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('play failed'))
    });
    render(<CameraReader onScan={vi.fn()} />);
    expect(await screen.findByText('Ocurrió un error inesperado al iniciar la cámara.')).toBeInTheDocument();
  });

  it('limita frames y no emite lecturas consecutivas del mismo QR', async () => {
    const onScan = vi.fn();
    vi.mocked(jsQR).mockReturnValue({
      data: 'qr-repetido',
      binaryData: [],
      chunks: [],
      version: 1,
      location: {
        topRightCorner: { x: 0, y: 0 },
        topLeftCorner: { x: 0, y: 0 },
        bottomRightCorner: { x: 0, y: 0 },
        bottomLeftCorner: { x: 0, y: 0 },
        topRightFinderPattern: { x: 0, y: 0 },
        topLeftFinderPattern: { x: 0, y: 0 },
        bottomLeftFinderPattern: { x: 0, y: 0 },
        bottomRightAlignmentPattern: { x: 0, y: 0 }
      }
    });
    render(<CameraReader onScan={onScan} />);
    await waitFor(() => expect(frames.size).toBeGreaterThan(0));
    const runFrame = (timestamp: number) => {
      const entry = frames.entries().next().value;
      if (!entry) throw new Error('No scheduled frame.');
      const [id, callback] = entry;
      frames.delete(id);
      callback(timestamp);
    };
    runFrame(200);
    runFrame(400);
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});
