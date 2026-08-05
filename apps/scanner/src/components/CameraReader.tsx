import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Box, Typography } from '@mui/material';

export interface CameraReaderProps {
  onScan: (data: string) => void;
  paused?: boolean;
}

export function CameraReader({ onScan, paused = false }: CameraReaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err) {
        console.error('Camera error', err);
        setError('No se pudo acceder a la cámara. Revisa los permisos.');
      }
    }

    function tick() {
      if (paused) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        if (canvas) {
          canvas.height = video.videoHeight;
          canvas.width = video.videoWidth;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          
          if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            // Decodificar QR
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert'
            });

            if (code && code.data) {
              onScan(code.data);
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [onScan, paused]);

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', bgcolor: 'error.main', color: 'error.contrastText', borderRadius: 2 }}>
        <Typography variant="body1">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', maxWidth: 500, mx: 'auto', overflow: 'hidden', borderRadius: 4 }}>
      <video ref={videoRef} style={{ width: '100%', display: 'block' }} muted />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          boxShadow: 'inset 0 0 0 40px rgba(0,0,0,0.5)',
          pointerEvents: 'none'
        }}
      />
    </Box>
  );
}
