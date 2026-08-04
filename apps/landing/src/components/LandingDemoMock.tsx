import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import TableBarIcon from '@mui/icons-material/TableBar';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useState, type ReactNode } from 'react';

const landingContent = getLandingConfig();

function DemoPanel({ active, index, children }: { active: boolean; index: number; children: ReactNode }) {
  if (!active) return null;
  return (
    <Box role="tabpanel" id={`landing-demo-panel-${index}`} aria-labelledby={`landing-demo-tab-${index}`} tabIndex={0}>
      {children}
    </Box>
  );
}

export function LandingDemoMock() {
  const [activeTab, setActiveTab] = useState(0);

  // Mock RSVP State
  const [contactName] = useState('Fam. Mendoza García');
  const [assistant1, setAssistant1] = useState('Carlos Mendoza');
  const [assistant2, setAssistant2] = useState('Lucía García');
  const [confirmed, setConfirmed] = useState(false);

  // Mock Scanner State
  const [scannedAsst, setScannedAsst] = useState<string | null>(null);

  const handleConfirmRsvp = () => {
    setConfirmed(true);
  };

  const handleResetRsvp = () => {
    setConfirmed(false);
    setScannedAsst(null);
  };

  const handleSimulateScan = (name: string) => {
    setScannedAsst(name);
  };

  return (
    <Box id="demo" component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.paper' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Chip
            label={landingContent.demo.label}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 800, mb: 1.5 }}
          />
          <Typography variant="h2" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
            Experimenta la operación en vivo
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', maxWidth: 640, mx: 'auto' }}>
            Explora de forma interactiva cómo una Invitación y la recepción pueden operar dentro del alcance
            documentado.
          </Typography>
          <Alert severity="info" sx={{ mt: 2, mx: 'auto', maxWidth: 760, textAlign: 'left' }}>
            {landingContent.demo.disclaimer}
          </Alert>
        </Box>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            overflow: 'hidden',
            bgcolor: 'background.default'
          }}
        >
          <Tabs
            aria-label="Recorrido de la simulación visual"
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              bgcolor: 'background.paper',
              borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
              px: 2,
              '& .MuiTab-root': { fontWeight: 700, minHeight: 60 }
            }}
          >
            <Tab
              id="landing-demo-tab-0"
              aria-controls="landing-demo-panel-0"
              icon={<TouchAppIcon />}
              iconPosition="start"
              label="1. Vista Invitación"
            />
            <Tab
              id="landing-demo-tab-1"
              aria-controls="landing-demo-panel-1"
              icon={<CheckCircleIcon />}
              iconPosition="start"
              label="2. Confirmación nominal"
            />
            <Tab
              id="landing-demo-tab-2"
              aria-controls="landing-demo-panel-2"
              icon={<QrCode2Icon />}
              iconPosition="start"
              label="3. QR y check-in"
            />
            <Tab
              id="landing-demo-tab-3"
              aria-controls="landing-demo-panel-3"
              icon={<TableBarIcon />}
              iconPosition="start"
              label="4. Croquis y Mesas"
            />
          </Tabs>

          <Box sx={{ p: { xs: 2.5, md: 4 } }}>
            {/* TAB 1: VISTA INVITACIÓN */}
            <DemoPanel active={activeTab === 0} index={0}>
              <Grid container spacing={4} sx={{ alignItems: 'center' }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack spacing={2}>
                    <Chip
                      label="Flyer / Flipbook Preview"
                      size="small"
                      sx={{ width: 'fit-content', fontWeight: 700 }}
                    />
                    <Typography variant="h3" sx={{ fontWeight: 800 }}>
                      Diseño Interactivo con Hotspots
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      Los invitados reciben un enlace único. Al abrirlo visualizan la invitación con botones
                      interactivos (Hotspots) para confirmar asistencia, ver ubicación o consultar mesa de regalos.
                    </Typography>

                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                      Prueba hacer clic en la pestaña <strong>2. RSVP Nominal</strong> para simular el proceso de
                      confirmación.
                    </Alert>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card
                    sx={{
                      borderRadius: 3,
                      border: '2px solid #17233C',
                      bgcolor: '#17233C',
                      color: '#FFF',
                      p: 3,
                      textAlign: 'center'
                    }}
                  >
                    <Typography variant="overline" sx={{ color: '#3157C8', letterSpacing: '0.15em', fontWeight: 800 }}>
                      BODA SOFÍA & MATEO
                    </Typography>
                    <Typography variant="h3" sx={{ color: '#FFF', my: 1, fontFamily: 'serif' }}>
                      Sofía & Mateo
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#D1D5DB', mb: 3 }}>
                      Sábado 15 de Noviembre, 2026 • 18:00 HRS
                    </Typography>

                    <Stack spacing={1.5} sx={{ maxWidth: 300, mx: 'auto' }}>
                      <Button
                        variant="contained"
                        fullWidth
                        size="medium"
                        onClick={() => setActiveTab(1)}
                        sx={{ bgcolor: '#3157C8', fontWeight: 700 }}
                      >
                        Hotspot: Confirmar Asistencia
                      </Button>
                      <Button
                        variant="outlined"
                        fullWidth
                        size="medium"
                        sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.3)' }}
                      >
                        Hotspot: Ver Ubicación
                      </Button>
                    </Stack>
                  </Card>
                </Grid>
              </Grid>
            </DemoPanel>

            {/* TAB 2: RSVP NOMINAL */}
            <DemoPanel active={activeTab === 1} index={1}>
              <Grid container spacing={4} sx={{ alignItems: 'center' }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack spacing={2}>
                    <Chip
                      label="Confirmación Nominal"
                      color="primary"
                      size="small"
                      sx={{ width: 'fit-content', fontWeight: 700 }}
                    />
                    <Typography variant="h3" sx={{ fontWeight: 800 }}>
                      Asistentes registrados individualmente
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      Cada Invitación pertenece a un Contacto principal ({contactName}), pero la asistencia se confirma
                      nominalmente por cada Asistente.
                    </Typography>

                    {confirmed ? (
                      <Alert severity="success" sx={{ borderRadius: 2 }}>
                        ¡Confirmación registrada! El QR de acceso se encuentra disponible en la pestaña 3.
                      </Alert>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Completa los nombres y haz clic en &quot;Confirmar Asistencia&quot; para generar el QR.
                      </Typography>
                    )}
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card sx={{ p: 3, borderRadius: 3, bgcolor: '#FFF' }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                      Confirmar Asistencia
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Contacto Principal: <strong>{contactName}</strong> (Cupo: 2 Asistentes)
                    </Typography>

                    {confirmed ? (
                      <Stack spacing={2} sx={{ textAlign: 'center', py: 2 }}>
                        <CheckCircleIcon color="success" sx={{ fontSize: 48, mx: 'auto' }} />
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>
                          Asistencia Confirmada
                        </Typography>
                        <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: 2, textAlign: 'left' }}>
                          <Typography variant="body2">1. {assistant1} — Confirmado</Typography>
                          <Typography variant="body2">2. {assistant2} — Confirmado</Typography>
                        </Box>
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                          <Button variant="contained" size="small" onClick={() => setActiveTab(2)}>
                            Ver QR de Acceso
                          </Button>
                          <Button variant="outlined" size="small" onClick={handleResetRsvp}>
                            Reiniciar Demo
                          </Button>
                        </Stack>
                      </Stack>
                    ) : (
                      <Stack spacing={2}>
                        <TextField
                          label="Asistente 1 (Principal)"
                          value={assistant1}
                          onChange={(e) => setAssistant1(e.target.value)}
                          size="small"
                          fullWidth
                        />
                        <TextField
                          label="Asistente 2 (Acompañante)"
                          value={assistant2}
                          onChange={(e) => setAssistant2(e.target.value)}
                          size="small"
                          fullWidth
                        />
                        <Button
                          variant="contained"
                          fullWidth
                          color="primary"
                          onClick={handleConfirmRsvp}
                          sx={{ fontWeight: 700 }}
                        >
                          Confirmar Asistencia (2 Asistentes)
                        </Button>
                      </Stack>
                    )}
                  </Card>
                </Grid>
              </Grid>
            </DemoPanel>

            {/* TAB 3: QR Y SCANNER CHECK-IN */}
            <DemoPanel active={activeTab === 2} index={2}>
              <Grid container spacing={4} sx={{ alignItems: 'center' }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack spacing={2}>
                    <Chip
                      label="Regla de Acceso"
                      color="primary"
                      size="small"
                      sx={{ width: 'fit-content', fontWeight: 700 }}
                    />
                    <Typography variant="h3" sx={{ fontWeight: 800 }}>
                      QR por Invitación; check-in por Asistente
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      El QR de la Invitación se genera dinámicamente tras confirmar. Al ser escaneado por el Staff, la
                      microapp de Scanner despliega la lista de Asistentes nominales para marcar el check-in individual
                      de quien ingresa.
                    </Typography>

                    {scannedAsst ? (
                      <Alert severity="success" sx={{ borderRadius: 2 }}>
                        ¡Check-in registrado con éxito para <strong>{scannedAsst}</strong>!
                      </Alert>
                    ) : (
                      <Alert severity="info" sx={{ borderRadius: 2 }}>
                        {confirmed
                          ? 'Haz clic en el botón de la tarjeta derecha para simular el escaneo del Staff.'
                          : 'Primero confirma la asistencia en la Pestaña 2 para ver el QR generado.'}
                      </Alert>
                    )}
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card sx={{ p: 3, borderRadius: 3, bgcolor: '#FFF', textAlign: 'center' }}>
                    {confirmed ? (
                      <Stack spacing={2} sx={{ alignItems: 'center' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                          QR DE ACCESO (INVITACIÓN PREM-MENDOZA)
                        </Typography>

                        {/* Mock Vectorial SVG QR */}
                        <Box
                          sx={{
                            width: 160,
                            height: 160,
                            border: '2px solid #17233C',
                            borderRadius: 2,
                            p: 1.5,
                            bgcolor: '#FFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <svg viewBox="0 0 100 100" width="100%" height="100%">
                            <rect x="0" y="0" width="30" height="30" fill="#17233C" />
                            <rect x="5" y="5" width="20" height="20" fill="#FFF" />
                            <rect x="10" y="10" width="10" height="10" fill="#17233C" />

                            <rect x="70" y="0" width="30" height="30" fill="#17233C" />
                            <rect x="75" y="5" width="20" height="20" fill="#FFF" />
                            <rect x="80" y="10" width="10" height="10" fill="#17233C" />

                            <rect x="0" y="70" width="30" height="30" fill="#17233C" />
                            <rect x="5" y="75" width="20" height="20" fill="#FFF" />
                            <rect x="10" y="80" width="10" height="10" fill="#17233C" />

                            <rect x="40" y="40" width="20" height="20" fill="#3157C8" />
                            <rect x="60" y="70" width="15" height="15" fill="#17233C" />
                            <rect x="75" y="85" width="15" height="15" fill="#17233C" />
                          </svg>
                        </Box>

                        <Divider sx={{ width: '100%', my: 1 }} />

                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Simular Scanner de Staff por Token:
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleSimulateScan(assistant1)}
                            disabled={scannedAsst === assistant1}
                          >
                            Check-in: {assistant1}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleSimulateScan(assistant2)}
                            disabled={scannedAsst === assistant2}
                          >
                            Check-in: {assistant2}
                          </Button>
                        </Stack>
                      </Stack>
                    ) : (
                      <Stack spacing={2} sx={{ py: 4, alignItems: 'center' }}>
                        <QrCode2Icon sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.5 }} />
                        <Typography variant="body2" color="text.secondary">
                          No hay QR disponible. Primero debes confirmar la asistencia en la Pestaña 2.
                        </Typography>
                        <Button variant="contained" size="small" onClick={() => setActiveTab(1)}>
                          Ir a Confirmar Asistencia
                        </Button>
                      </Stack>
                    )}
                  </Card>
                </Grid>
              </Grid>
            </DemoPanel>

            {/* TAB 4: CROQUIS Y MESAS */}
            <DemoPanel active={activeTab === 3} index={3}>
              <Grid container spacing={4} sx={{ alignItems: 'center' }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack spacing={2}>
                    <Chip label="Croquis & Mesas" size="small" sx={{ width: 'fit-content', fontWeight: 700 }} />
                    <Typography variant="h3" sx={{ fontWeight: 800 }}>
                      Asignación visual de espacio
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      Diseña el plano del recinto en el editor visual. Asigna capacidad a cada mesa y ubica a los
                      Asistentes de forma individual o por Grupo familiar.
                    </Typography>
                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                      En puerta, el Scanner también proyecta a qué mesa pertenece el Asistente al realizar el check-in.
                    </Alert>
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card sx={{ p: 3, borderRadius: 3, bgcolor: '#17233C', color: '#FFF' }}>
                    <Typography variant="subtitle2" sx={{ color: '#3157C8', fontWeight: 800, mb: 2 }}>
                      PLANO DE RECEPCIÓN (MOCK)
                    </Typography>

                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6 }}>
                        <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.08)', color: '#FFF', borderRadius: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Mesa 01 — Principal
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block' }}>
                            Capacidad: 10 / Ocupados: 8
                          </Typography>
                        </Paper>
                      </Grid>

                      <Grid size={{ xs: 6 }}>
                        <Paper
                          sx={{
                            p: 2,
                            bgcolor: 'rgba(49,87,200,0.3)',
                            border: '1px solid #3157C8',
                            color: '#FFF',
                            borderRadius: 2
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Mesa 04 — Fam. Mendoza
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#E5E7EB', display: 'block' }}>
                            Capacidad: 8 / Ocupados: 2
                          </Typography>
                        </Paper>
                      </Grid>

                      <Grid size={{ xs: 12 }}>
                        <Paper
                          sx={{
                            p: 1.5,
                            bgcolor: 'rgba(255,255,255,0.04)',
                            color: '#9CA3AF',
                            borderRadius: 2,
                            textAlign: 'center'
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            Zona Decorativa: Pista de Baile / Escenario (Capacidad 0)
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                  </Card>
                </Grid>
              </Grid>
            </DemoPanel>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
import { getLandingConfig } from '../config/landing-config';
