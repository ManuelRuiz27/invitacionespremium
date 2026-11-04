import type { Event } from '@invitaciones/api-client';
import { layoutTokens, PageHeader, StatusChip } from '@invitaciones/ui';
import { Alert, Box, Button, Paper, Stack, Step, StepButton, Stepper, Tab, Tabs, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { getEventStatusPresentation } from '../shared/event-status';
import type { SaveState, WizardStep } from './wizard-model';

const labels: Record<WizardStep, string> = {
  datos: 'Datos',
  contactos: 'Invitados',
  invitacion: 'Invitación',
  confirmacion: 'Confirmaciones',
  croquis: 'Mesas',
  pases: 'Pases',
  revision: 'Revisión'
};
const saveLabel: Record<SaveState, string> = {
  idle: '',
  pending: 'Cambios pendientes',
  saving: 'Guardando…',
  saved: 'Cambios guardados',
  error: 'No pudimos guardar los cambios'
};
export function WizardLayout({
  event,
  steps,
  selectedStep,
  editable,
  saveState,
  message,
  busy,
  onDismissMessage,
  onGo,
  onExit,
  children
}: {
  event: Event | undefined;
  steps: WizardStep[];
  selectedStep: WizardStep;
  editable: boolean;
  saveState: SaveState;
  message: string | undefined;
  busy: boolean;
  onDismissMessage: () => void;
  onGo: (step: WizardStep) => void;
  onExit: () => void;
  children: ReactNode;
}) {
  const index = steps.indexOf(selectedStep);
  const floorplan = selectedStep === 'croquis';
  const status = event ? getEventStatusPresentation(event.status) : undefined;
  const saveFeedback = (
    <Typography
      variant="body2"
      role={saveState === 'error' ? 'alert' : 'status'}
      aria-live={saveState === 'error' ? 'assertive' : 'polite'}
      sx={{ color: saveState === 'error' ? 'error.main' : 'text.secondary', minHeight: floorplan ? 21 : undefined }}
    >
      {saveLabel[saveState]}
    </Typography>
  );
  return (
    <Box
      sx={
        selectedStep === 'datos'
          ? { mt: { xs: -3, md: -1 }, mb: { xs: -8, md: -10 }, '& > header': { mb: 1.5 } }
          : selectedStep === 'contactos'
            ? { maxWidth: layoutTokens.content.maxWidthDetail, mx: 'auto' }
            : {}
      }
    >
      <PageHeader
        title={event ? (event.name ?? 'Configurar Evento') : 'Nuevo Evento'}
        {...(floorplan ? { description: 'Completa los pasos para dejar tu evento listo para activar.' } : {})}
        size="operational"
        {...(!floorplan
          ? {
              action: (
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                  {saveState !== 'idle' ? saveFeedback : null}
                  {status ? <StatusChip label={status.label} tone={status.tone} /> : null}
                </Stack>
              )
            }
          : {})}
      />
      <Stack spacing={selectedStep === 'datos' ? 1.5 : selectedStep === 'contactos' ? 3 : 2.5}>
        {floorplan ? (
          <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              {saveFeedback}
              {event
                ? (() => {
                    const status = getEventStatusPresentation(event.status);
                    return <StatusChip label={status.label} tone={status.tone} />;
                  })()
                : null}
            </Stack>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Stepper nonLinear activeStep={index}>
                {steps.map((item) => (
                  <Step key={item}>
                    <StepButton disabled={busy} onClick={() => onGo(item)}>
                      {labels[item]}
                    </StepButton>
                  </Step>
                ))}
              </Stepper>
            </Box>
            <Tabs
              value={selectedStep}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ display: { md: 'none' } }}
              onChange={(_, value: WizardStep) => onGo(value)}
              aria-label="Etapas de configuración"
            >
              {steps.map((item) => (
                <Tab key={item} value={item} label={labels[item]} disabled={busy} />
              ))}
            </Tabs>
          </Paper>
        ) : (
          <Tabs
            value={selectedStep}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            onChange={(_, value: WizardStep) => onGo(value)}
            aria-label="Etapas de configuración"
            sx={{
              minHeight: 48,
              borderBottom: '1px solid',
              borderColor: 'divider',
              '& .MuiTab-root': {
                minHeight: 48,
                minWidth: 'auto',
                px: { xs: 1.5, md: 2.5 },
                color: 'text.secondary',
                fontWeight: 400
              },
              '& .Mui-selected': { color: 'text.primary', fontWeight: 600 }
            }}
          >
            {steps.map((item) => (
              <Tab
                key={item}
                value={item}
                label={labels[item]}
                disabled={busy}
                aria-current={item === selectedStep ? 'step' : undefined}
              />
            ))}
          </Tabs>
        )}
        {!editable ? <Alert severity="info">Este Evento es de solo lectura en su estado actual.</Alert> : null}
        {message ? (
          <Alert severity="warning" onClose={onDismissMessage}>
            {message}
          </Alert>
        ) : null}
        {selectedStep === 'contactos' ? (
          <Box component="section">{children}</Box>
        ) : (
          <Paper
            component="section"
            variant="outlined"
            sx={
              selectedStep === 'croquis' || selectedStep === 'datos'
                ? { p: 0, border: 0, bgcolor: 'transparent', boxShadow: 'none' }
                : { p: { xs: 2, md: 3 } }
            }
          >
            {children}
          </Paper>
        )}
        <Stack
          direction={selectedStep === 'datos' || selectedStep === 'contactos' ? 'row' : { xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', gap: 1.5 }}
        >
          <Button disabled={busy} onClick={onExit}>
            Salir
          </Button>
          <Stack direction="row" spacing={1}>
            <Button disabled={busy || index === 0} onClick={() => onGo(steps[index - 1]!)}>
              Anterior
            </Button>
            <Button
              variant="contained"
              disabled={busy || index === steps.length - 1}
              onClick={() => onGo(steps[index + 1]!)}
            >
              Continuar
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}
