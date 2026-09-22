import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Alert, Box } from '@mui/material';

export interface CameraReaderProps {
  onScan: (data: string) => void;
  paused?: boolean;
}

const FRAME_INTERVAL_MS = 160;
const DUPLICATE_INTERVAL_MS = 2_000;

export function CameraReader({ onScan, paused = false }: CameraReaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [error, setError] = useState<string | null>(null);

  onScanRef.current = onScan;
  pausedRef.current = paused;

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;
    let lastFrameAt = 0;
    let lastScan = { data: '', at: 0 };

    const stop = () => {
      active = false;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const tick = (timestamp: number) => {
      if (!active) return;
      animationFrameId = requestAnimationFrame(tick);
      if (pausedRef.current || timestamp - lastFrameAt < FRAME_INTERVAL_MS) return;
      lastFrameAt = timestamp;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || canvas.width === 0 || canvas.height === 0) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      const data = result?.data.trim();
      if (!data || (data === lastScan.data && timestamp - lastScan.at < DUPLICATE_INTERVAL_MS)) return;
      lastScan = { data, at: timestamp };
      onScanRef.current(data);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este dispositivo o navegador no ofrece acceso a la cámara.');
        return;
      }
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!active) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (active) animationFrameId = requestAnimationFrame(tick);
      } catch (cause) {
        if (!active) return;
        const name = cause instanceof DOMException ? cause.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setError('Permiso de cámara denegado. Habilítalo en el navegador para escanear.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
          setError('No hay una cámara disponible para escanear.');
        } else {
          setError('Ocurrió un error inesperado al iniciar la cámara.');
        }
      }
    };

    void start();
    return stop;
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 520,
        mx: 'auto',
        overflow: 'hidden',
        borderRadius: 3,
        aspectRatio: { xs: '3/4', sm: '4/5' },
        minHeight: { xs: 380, sm: 480 },
        bgcolor: '#090a0f',
        boxShadow: (theme) => theme.shadows[4],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        aria-label="Vista de la cámara"
      />
      <canvas ref={canvasRef} hidden />
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none'
        }}
      >
        {/* Retícula central de escaneo sin texto ni botones */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '74%',
            aspectRatio: '1 / 1',
            maxHeight: '78%',
            borderRadius: 3,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
            border: '2px solid rgba(255, 255, 255, 0.35)',
            overflow: 'hidden'
          }}
        >
          {/* Línea animada de escaneo */}
          <Box
            sx={{
              position: 'absolute',
              left: 12,
              right: 12,
              height: 2,
              bgcolor: 'primary.light',
              boxShadow: (theme) => `0 0 10px 2px ${theme.palette.primary.main}`,
              animation: 'scannerLaserPulse 2.4s ease-in-out infinite alternate',
              '@keyframes scannerLaserPulse': {
                '0%': { top: '8%', opacity: 0.3 },
                '50%': { opacity: 1 },
                '100%': { top: '92%', opacity: 0.3 }
              }
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
