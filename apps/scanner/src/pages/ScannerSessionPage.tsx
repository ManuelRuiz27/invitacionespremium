import { useCallback, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ApiClient, ScannerCheckInResponse } from '@invitaciones/api-client';
import { Alert, Box, Button, CircularProgress, Container, Stack, Tab, Tabs, Typography } from '@mui/material';
import { ErrorState, LoadingState, StatusChip } from '@invitaciones/ui';
import { CameraReader } from '../components/CameraReader';
import { ScanResultPanel, type ScannerOperationalResult } from '../components/ScanResultPanel';
import { ScannerFloorplan } from '../components/ScannerFloorplan';
import { ScannerSearchPanel } from '../components/ScannerSearchPanel';
import { useScannerFloorplan, useScannerMutations, useScannerSession } from '../hooks/useScannerQueries';
import { useScannerRealtime } from '../hooks/useScannerRealtime';
import { scannerErrorMessage } from '../scanner-errors';
import type { ScannerRealtimeConfig } from '../env';

export interface ScannerSessionPageProps {
  apiClient: ApiClient;
  apiBaseUrl?: string;
  realtime: ScannerRealtimeConfig;
}

export function ScannerSessionPage({
  apiClient,
  apiBaseUrl = window.location.origin,
  realtime
}: ScannerSessionPageProps) {
  const { staffToken = '' } = useParams<{ staffToken: string }>();
  const [currentTab, setCurrentTab] = useState(0);
  const [scanResult, setScanResult] = useState<ScannerOperationalResult | null>(null);
  const [confirmation, setConfirmation] = useState<ScannerCheckInResponse | null>(null);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([]);
  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null);
  const [terminalState, setTerminalState] = useState(false);
  const terminalStateRef = useRef(false);
  const checkInAttempt = useRef<{ signature: string; key: string } | null>(null);
  const session = useScannerSession(apiClient, staffToken);
  const operational =
    session.data?.status === 'AVAILABLE' && ['ACTIVE', 'EVENT_DAY'].includes(session.data.event.status);
  const floorplan = useScannerFloorplan(
    apiClient,
    staffToken,
    Boolean(operational && session.data?.event.floorplanEnabled)
  );
  const { scanMutation, checkInMutation, searchMutation } = useScannerMutations(apiClient, staffToken);

  const clearResult = useCallback(() => {
    setScanResult(null);
    setConfirmation(null);
    setSelectedAssistantIds([]);
    checkInAttempt.current = null;
    scanMutation.reset();
    checkInMutation.reset();
  }, [checkInMutation, scanMutation]);

  const discardStaleResult = useCallback(() => {
    clearResult();
    searchMutation.reset();
    setRealtimeNotice('La disponibilidad cambió. Escanea o busca nuevamente.');
  }, [clearResult, searchMutation]);

  const realtimeStatus = useScannerRealtime(
    staffToken,
    operational && !terminalState ? session.data : undefined,
    realtime,
    {
      onTerminal: () => {
        terminalStateRef.current = true;
        clearResult();
        searchMutation.reset();
        setTerminalState(true);
      },
      onInvitationStale: discardStaleResult,
      onSeatingStale: discardStaleResult
    }
  );

  const handleScan = useCallback(
    (qrToken: string) => {
      if (scanResult || confirmation || scanMutation.isPending || checkInMutation.isPending) return;
      setRealtimeNotice(null);
      scanMutation.mutate(qrToken, {
        onSuccess: (result) => {
          if (terminalStateRef.current) return;
          setScanResult(result);
          setSelectedAssistantIds(result.pendingAssistants.map((assistant) => assistant.id));
        }
      });
    },
    [scanResult, confirmation, scanMutation, checkInMutation.isPending]
  );

  const handleCheckIn = (assistantIds: string[]) => {
    if (!scanResult || assistantIds.length === 0 || checkInMutation.isPending) return;
    const payload = { invitationId: scanResult.invitation.id, assistantIds };
    const signature = JSON.stringify(payload);
    if (checkInAttempt.current?.signature !== signature)
      checkInAttempt.current = { signature, key: crypto.randomUUID() };
    checkInMutation.mutate(
      { idempotencyKey: checkInAttempt.current.key, payload },
      {
        onSuccess: (result) => {
          if (terminalStateRef.current) return;
          setConfirmation(result);
          setSelectedAssistantIds(result.remainingPendingAssistants.map((assistant) => assistant.id));
          setScanResult({
            ...scanResult,
            status: result.remainingPendingCount === 0 ? 'NO_PENDING' : 'AVAILABLE',
            pendingAssistants: result.remainingPendingAssistants,
            pendingCount: result.remainingPendingCount,
            checkedInCount: scanResult.confirmedCount - result.remainingPendingCount
          });
        }
      }
    );
  };

  if (!staffToken)
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Falta el token Staff.</Alert>
      </Container>
    );
  if (session.isLoading) return <LoadingState label="Validando acceso Staff…" />;
  if (session.error)
    return (
      <Container sx={{ py: 4 }}>
        <ErrorState
          message={scannerErrorMessage(session.error, 'No pudimos validar la sesión Staff.')}
          onRetry={() => {
            void session.refetch();
          }}
        />
      </Container>
    );
  const sessionData = session.data;
  if (!operational || terminalState || !sessionData)
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">El Evento está cerrado, cancelado, archivado o fuera de operación.</Alert>
      </Container>
    );

  const tableIds =
    scanResult?.pendingAssistants.flatMap((assistant) =>
      selectedAssistantIds.includes(assistant.id) && assistant.table ? [assistant.table.id] : []
    ) ?? [];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 2 }}>
      <Container maxWidth="sm">
        <Stack component="header" spacing={0.75} sx={{ mb: 2 }}>
          <Typography component="h1" variant="h1">
            {sessionData.event.name}
          </Typography>
          <Typography color="text.secondary">Staff: {sessionData.staff.alias}</Typography>
          <StatusChip
            label={
              sessionData.event.status === 'EVENT_DAY' ? 'Día del Evento · operativo' : 'Evento activo · operativo'
            }
            tone="success"
          />
        </Stack>
        {realtimeStatus === 'error' || realtimeStatus === 'disconnected' ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            La actualización en tiempo real no está disponible. Puedes continuar usando el Scanner; validaremos cada
            operación con el servidor.
          </Alert>
        ) : null}
        {realtimeNotice ? (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setRealtimeNotice(null)}>
            {realtimeNotice}
          </Alert>
        ) : null}
        <Tabs
          value={currentTab}
          onChange={(_, value: number) => setCurrentTab(value)}
          aria-label="Herramientas de Scanner"
          variant="fullWidth"
          sx={{ mb: 3 }}
        >
          <Tab label="Cámara" id="scanner-tab-camera" aria-controls="scanner-panel-camera" />
          <Tab label="Buscar" id="scanner-tab-search" aria-controls="scanner-panel-search" />
          {sessionData.event.floorplanEnabled ? (
            <Tab label="Croquis" id="scanner-tab-floorplan" aria-controls="scanner-panel-floorplan" />
          ) : null}
        </Tabs>
        {currentTab === 0 ? (
          <Box role="tabpanel" id="scanner-panel-camera" aria-labelledby="scanner-tab-camera">
            {confirmation ? (
              <Stack spacing={2}>
                <Alert severity="success">
                  Ingreso registrado: {confirmation.checkedIn.map((assistant) => assistant.name).join(', ')}.
                </Alert>
                <Button variant="contained" size="large" onClick={clearResult}>
                  Siguiente escaneo
                </Button>
              </Stack>
            ) : scanResult ? (
              <ScanResultPanel
                scanResult={scanResult}
                onCheckIn={handleCheckIn}
                onCancel={clearResult}
                selectedIds={selectedAssistantIds}
                onSelectionChange={setSelectedAssistantIds}
                isLoading={checkInMutation.isPending}
                errorMessage={
                  checkInMutation.error
                    ? scannerErrorMessage(checkInMutation.error, 'No pudimos registrar el ingreso.')
                    : null
                }
              />
            ) : (
              <>
                <CameraReader onScan={handleScan} paused={scanMutation.isPending} />
                {scanMutation.isPending ? (
                  <Stack role="status" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
                    <CircularProgress size={28} />
                    <Typography>Validando código…</Typography>
                  </Stack>
                ) : null}
                {scanMutation.error ? (
                  <Alert severity="error" sx={{ mt: 2 }} onClose={() => scanMutation.reset()}>
                    {scannerErrorMessage(scanMutation.error, 'No pudimos procesar el código.')}
                  </Alert>
                ) : null}
              </>
            )}
          </Box>
        ) : null}
        {currentTab === 1 ? (
          <Box role="tabpanel" id="scanner-panel-search" aria-labelledby="scanner-tab-search">
            <ScannerSearchPanel
              onSearch={(query) => {
                setRealtimeNotice(null);
                searchMutation.mutate(query);
              }}
              isLoading={searchMutation.isPending}
              result={searchMutation.data ?? null}
              errorMessage={
                searchMutation.error
                  ? scannerErrorMessage(searchMutation.error, 'No pudimos completar la búsqueda.')
                  : null
              }
              onSelectResult={(result) => {
                if (terminalStateRef.current) return;
                setScanResult({ ...result, status: result.pendingCount === 0 ? 'NO_PENDING' : 'AVAILABLE' });
                setSelectedAssistantIds(result.pendingAssistants.map((assistant) => assistant.id));
                setCurrentTab(0);
              }}
            />
          </Box>
        ) : null}
        {currentTab === 2 && sessionData.event.floorplanEnabled ? (
          <Box role="tabpanel" id="scanner-panel-floorplan" aria-labelledby="scanner-tab-floorplan">
            {floorplan.isLoading ? <LoadingState label="Cargando Croquis…" /> : null}
            {floorplan.error ? (
              <Alert severity="info">{scannerErrorMessage(floorplan.error, 'El Croquis no está disponible.')}</Alert>
            ) : null}
            {floorplan.data ? (
              <ScannerFloorplan
                floorplan={floorplan.data}
                contentUrl={new URL(floorplan.data.contentPath, apiBaseUrl).toString()}
                highlightedTableIds={tableIds}
              />
            ) : null}
          </Box>
        ) : null}
      </Container>
    </Box>
  );
}
