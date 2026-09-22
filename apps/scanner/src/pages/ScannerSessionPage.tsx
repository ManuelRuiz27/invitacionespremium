import { useCallback, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ApiClient, ScannerCheckInResponse } from '@invitaciones/api-client';
import { Alert, Box, Button, CircularProgress, Container, Stack, Tab, Tabs, Typography } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import MapRounded from '@mui/icons-material/MapRounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
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
  const confirmationRef = useRef<ScannerCheckInResponse | null>(null);
  const checkInInFlightRef = useRef(false);
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
    confirmationRef.current = null;
    checkInInFlightRef.current = false;
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
      onInvitationStale: () => {
        if (confirmationRef.current || checkInInFlightRef.current) return;
        discardStaleResult();
      },
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
    checkInInFlightRef.current = true;
    checkInMutation.mutate(
      { idempotencyKey: checkInAttempt.current.key, payload },
      {
        onSuccess: (result) => {
          if (terminalStateRef.current) return;
          confirmationRef.current = result;
          checkInInFlightRef.current = false;
          setConfirmation(result);
          setSelectedAssistantIds(result.remainingPendingAssistants.map((assistant) => assistant.id));
          setScanResult({
            ...scanResult,
            status: result.remainingPendingCount === 0 ? 'NO_PENDING' : 'AVAILABLE',
            pendingAssistants: result.remainingPendingAssistants,
            pendingCount: result.remainingPendingCount,
            checkedInCount: scanResult.confirmedCount - result.remainingPendingCount
          });
        },
        onError: () => {
          checkInInFlightRef.current = false;
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

  const activeAssistants = confirmation
    ? confirmation.checkedIn
    : scanResult?.pendingAssistants.filter((assistant) => selectedAssistantIds.includes(assistant.id)) ?? [];

  const tableIds = activeAssistants.flatMap((assistant) => (assistant.table ? [assistant.table.id] : []));
  const highlightedSeats = activeAssistants.flatMap((assistant) => (assistant.seat ? [assistant.seat] : []));

  const alertsBlock = (
    <>
      {realtimeStatus === 'error' || realtimeStatus === 'disconnected' ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          La actualización en tiempo real no está disponible. Puedes continuar usando el Scanner;
          validaremos cada operación con el servidor.
        </Alert>
      ) : null}
      {realtimeNotice ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setRealtimeNotice(null)}>
          {realtimeNotice}
        </Alert>
      ) : null}
    </>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pt: { xs: 1.5, sm: 2 }, pb: 12 }}>
      <Container maxWidth="sm">
        {/* Pestaña 0: Scanner */}
        {currentTab === 0 ? (
          <Box role="tabpanel" id="scanner-panel-camera" aria-labelledby="scanner-tab-camera">
            {confirmation ? (
              <Box
                sx={{
                  animation: 'scannerConfirmIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  '@keyframes scannerConfirmIn': {
                    '0%': { opacity: 0, transform: 'translateY(16px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' }
                  }
                }}
              >
                {alertsBlock}
                <Stack spacing={2.5}>
                  <Alert severity="success" icon={<CheckCircleRounded />}>
                    Ingreso registrado: {confirmation.checkedIn.map((assistant) => assistant.name).join(', ')}.
                  </Alert>

                  {sessionData.event.floorplanEnabled && floorplan.data ? (
                    <Box sx={{ mt: 1 }}>
                      <ScannerFloorplan
                        floorplan={floorplan.data}
                        contentUrl={new URL(floorplan.data.contentPath, apiBaseUrl).toString()}
                        highlightedTableIds={tableIds}
                        highlightedSeats={highlightedSeats}
                      />
                    </Box>
                  ) : null}

                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<QrCodeScannerRounded />}
                    onClick={clearResult}
                    fullWidth
                    sx={{ minHeight: 46, borderRadius: 1 }}
                  >
                    Siguiente escaneo
                  </Button>
                </Stack>
              </Box>
            ) : scanResult ? (
              <>
                {alertsBlock}
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
                  floorplanSlot={
                    sessionData.event.floorplanEnabled ? (
                      <Box sx={{ mt: 2 }}>
                        {floorplan.isLoading ? <LoadingState label="Cargando Croquis…" /> : null}
                        {floorplan.error ? (
                          <Alert severity="info">
                            {scannerErrorMessage(floorplan.error, 'El Croquis no está disponible.')}
                          </Alert>
                        ) : null}
                        {floorplan.data ? (
                          <ScannerFloorplan
                            floorplan={floorplan.data}
                            contentUrl={new URL(floorplan.data.contentPath, apiBaseUrl).toString()}
                            highlightedTableIds={tableIds}
                            highlightedSeats={highlightedSeats}
                          />
                        ) : null}
                      </Box>
                    ) : null
                  }
                />
              </>
            ) : (
              <>
                {/* Div de video en la parte superior: limpio, alargado, sin etiquetas, botones ni texto */}
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

                {/* Alertas debajo del video en modo scanner */}
                <Box sx={{ mt: 2 }}>
                  {alertsBlock}
                </Box>

                {/* Información operativa del evento debajo de la cámara */}
                <Stack component="header" spacing={0.75} sx={{ mt: 1, mb: 1.5 }}>
                  <Typography component="h1" variant="h1">
                    {sessionData.event.name}
                  </Typography>
                  <Typography color="text.secondary">Staff: {sessionData.staff.alias}</Typography>
                  <StatusChip
                    label={
                      sessionData.event.status === 'EVENT_DAY'
                        ? 'Día del Evento · operativo'
                        : 'Evento activo · operativo'
                    }
                    tone="success"
                  />
                </Stack>
              </>
            )}
          </Box>
        ) : null}

        {/* Pestaña 1: Buscar */}
        {currentTab === 1 ? (
          <Box role="tabpanel" id="scanner-panel-search" aria-labelledby="scanner-tab-search">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<QrCodeScannerRounded />}
                onClick={() => setCurrentTab(0)}
                sx={{ borderRadius: 999, px: 2 }}
              >
                Volver al Scanner
              </Button>
            </Box>

            {alertsBlock}

            <Stack component="header" spacing={0.75} sx={{ mb: 2 }}>
              <Typography component="h1" variant="h1">
                {sessionData.event.name}
              </Typography>
              <Typography color="text.secondary">Staff: {sessionData.staff.alias}</Typography>
              <StatusChip
                label={
                  sessionData.event.status === 'EVENT_DAY'
                    ? 'Día del Evento · operativo'
                    : 'Evento activo · operativo'
                }
                tone="success"
              />
            </Stack>

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

        {/* Pestaña 2: Croquis */}
        {currentTab === 2 && sessionData.event.floorplanEnabled ? (
          <Box role="tabpanel" id="scanner-panel-floorplan" aria-labelledby="scanner-tab-floorplan">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<QrCodeScannerRounded />}
                onClick={() => setCurrentTab(0)}
                sx={{ borderRadius: 999, px: 2 }}
              >
                Volver al Scanner
              </Button>
            </Box>

            {alertsBlock}

            <Stack component="header" spacing={0.75} sx={{ mb: 2 }}>
              <Typography component="h1" variant="h1">
                {sessionData.event.name}
              </Typography>
              <Typography color="text.secondary">Staff: {sessionData.staff.alias}</Typography>
              <StatusChip
                label={
                  sessionData.event.status === 'EVENT_DAY'
                    ? 'Día del Evento · operativo'
                    : 'Evento activo · operativo'
                }
                tone="success"
              />
            </Stack>

            {floorplan.isLoading ? <LoadingState label="Cargando Croquis…" /> : null}
            {floorplan.error ? (
              <Alert severity="info">{scannerErrorMessage(floorplan.error, 'El Croquis no está disponible.')}</Alert>
            ) : null}
            {floorplan.data ? (
              <ScannerFloorplan
                floorplan={floorplan.data}
                contentUrl={new URL(floorplan.data.contentPath, apiBaseUrl).toString()}
                highlightedTableIds={tableIds}
                highlightedSeats={highlightedSeats}
              />
            ) : null}
          </Box>
        ) : null}
      </Container>

      {/* Menú inferior accesible a los pulgares */}
      <Box
        component="nav"
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          pb: 'max(env(safe-area-inset-bottom), 8px)',
          pt: 0.5
        }}
      >
        <Container maxWidth="sm" disableGutters>
          <Tabs
            value={currentTab}
            onChange={(_, value: number) => setCurrentTab(value)}
            aria-label="Herramientas de Scanner"
            variant="fullWidth"
            sx={{
              minHeight: 56,
              '& .MuiTab-root': {
                minHeight: 56,
                minWidth: 48,
                py: 0.75,
                fontSize: '0.8125rem',
                fontWeight: 600,
                touchAction: 'manipulation'
              }
            }}
          >
            <Tab
              icon={<QrCodeScannerRounded />}
              iconPosition="top"
              label="Scanner"
              id="scanner-tab-camera"
              aria-controls="scanner-panel-camera"
            />
            <Tab
              icon={<SearchRounded />}
              iconPosition="top"
              label="Buscar"
              id="scanner-tab-search"
              aria-controls="scanner-panel-search"
            />
            {sessionData.event.floorplanEnabled ? (
              <Tab
                icon={<MapRounded />}
                iconPosition="top"
                label="Croquis"
                id="scanner-tab-floorplan"
                aria-controls="scanner-panel-floorplan"
              />
            ) : null}
          </Tabs>
        </Container>
      </Box>
    </Box>
  );
}
