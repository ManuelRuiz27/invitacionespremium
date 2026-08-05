import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ApiClient } from '@invitaciones/api-client';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { useScannerSession, useScannerMutations } from '../hooks/useScannerQueries';
import { useScannerRealtime } from '../hooks/useScannerRealtime';
import { CameraReader } from '../components/CameraReader';
import { ScanResultPanel, type ScannerScanResponseDto } from '../components/ScanResultPanel';

export interface ScannerSessionPageProps {
  apiClient: ApiClient;
}

export function ScannerSessionPage({ apiClient }: ScannerSessionPageProps) {
  const { staffToken } = useParams<{ staffToken: string }>();
  const [scanResult, setScanResult] = useState<ScannerScanResponseDto | null>(null);

  const { data: sessionData, error, isLoading, refetch } = useScannerSession(apiClient, staffToken!);
  useScannerRealtime(staffToken!, sessionData);

  const { scanMutation, checkInMutation } = useScannerMutations(apiClient, staffToken!);

  const handleScan = (qrData: string) => {
    if (scanResult || scanMutation.isPending) return;

    scanMutation.mutate(qrData, {
      onSuccess: (res) => {
        setScanResult(res);
      },
      onError: (err) => {
        console.error('Scan error', err);
      }
    });
  };

  const handleCheckIn = (assistantIds: string[]) => {
    if (!scanResult?.invitation?.id) return;
    
    checkInMutation.mutate({
      invitationId: scanResult.invitation.id,
      assistantIds
    }, {
      onSuccess: () => {
        setScanResult(null);
        refetch(); // Refetch session stats if needed
      },
      onError: (err) => {
        console.error('Checkin error', err);
        alert('Hubo un error al registrar el ingreso.');
      }
    });
  };

  const handleCancel = () => {
    setScanResult(null);
    scanMutation.reset();
  };

  if (!staffToken) {
    return <Alert severity="error">Token no provisto.</Alert>;
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    const status = (error as { status?: number })?.status;
    let msg = 'Ocurrió un error al cargar la sesión.';
    if (status === 401) msg = 'Token revocado, expirado o inválido.';
    if (status === 403) msg = 'No tienes permiso.';
    if (status === 409) msg = 'El evento está cerrado o cancelado.';

    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error">{msg}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh' }}>
      <Box sx={{ mb: 3, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          {sessionData?.event?.name}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Staff: {sessionData?.staff?.alias}
        </Typography>
      </Box>

      <Box>
          {!scanResult && (
            <CameraReader onScan={handleScan} paused={scanMutation.isPending} />
          )}
          
          {scanMutation.isPending && !scanResult && (
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <CircularProgress size={30} />
              <Typography>Procesando código...</Typography>
            </Box>
          )}

          {scanMutation.isError && !scanResult && (
            <Box sx={{ mt: 2 }}>
              <Alert 
                severity="error" 
                onClose={() => scanMutation.reset()}
              >
                Error al procesar el código: {(scanMutation.error as { body?: { message?: string } })?.body?.message || 'Inválido'}
              </Alert>
            </Box>
          )}

          {scanResult && (
            <ScanResultPanel 
              scanResult={scanResult} 
              onCheckIn={handleCheckIn} 
              onCancel={handleCancel}
              isLoading={checkInMutation.isPending}
            />
          )}
      </Box>
    </Box>
  );
}
