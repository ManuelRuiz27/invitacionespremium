import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineOutlined';
import type { Event, UpdateEventInput } from '@invitaciones/api-client';
import { alpha, Box, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import { useState, type ReactNode } from 'react';
import type { SaveState } from '../wizard-model';

export function DataBlock({
  id,
  title,
  icon,
  children,
  draft,
  event,
  confirmedDraft,
  fields,
  completionFields = fields,
  saveState,
  error,
  inlineError = false,
  pending = false,
  selected = true,
  tabId,
  sx = {}
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  draft: UpdateEventInput;
  event: Event | undefined;
  confirmedDraft?: UpdateEventInput | undefined;
  fields: (keyof UpdateEventInput & keyof Event)[];
  completionFields?: (keyof UpdateEventInput & keyof Event)[];
  saveState: SaveState;
  error?: string | undefined;
  inlineError?: boolean;
  pending?: boolean;
  selected?: boolean;
  tabId?: string | undefined;
  sx?: SxProps<Theme> | undefined;
}) {
  const [focused, setFocused] = useState(false);
  const confirmed = confirmedDraft ?? event;
  const dirty = pending || fields.some((field) => (draft[field] ?? null) !== (confirmed?.[field] ?? null));
  const complete =
    Boolean(event) &&
    completionFields.every(
      (field) =>
        draft[field] !== null &&
        draft[field] !== undefined &&
        draft[field] !== '' &&
        event?.[field] !== null &&
        event?.[field] !== undefined &&
        event?.[field] !== ''
    ) &&
    !dirty;
  const failed = Boolean(error) || (dirty && saveState === 'error');
  const state = failed ? 'error' : focused || dirty ? 'editing' : complete ? 'confirmed' : 'empty';
  return (
    <Box
      component="section"
      id={`${id}-panel`}
      role={tabId ? 'tabpanel' : 'region'}
      aria-labelledby={tabId ?? `${id}-title`}
      aria-description={state === 'confirmed' ? 'Confirmado por el servidor' : undefined}
      tabIndex={tabId ? 0 : undefined}
      data-validation={state}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      sx={[
        {
          display: selected ? 'block' : 'none',
          minWidth: 0,
          p: 1.5,
          border: '2px solid',
          borderColor: (theme) =>
            state === 'error'
              ? theme.palette.error.main
              : state === 'editing'
                ? theme.palette.divider
                : state === 'confirmed'
                  ? alpha(theme.palette.success.main, 0.28)
                  : 'transparent',
          borderRadius: 2,
          bgcolor: 'background.paper',
          transition: 'border-color 160ms ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {!tabId ? (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
          <Typography id={`${id}-title`} component="h2" variant="h4" sx={{ flex: 1 }}>
            {title}
          </Typography>
          <Box
            sx={{
              width: 24,
              height: 24,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {state === 'confirmed' ? (
              <CheckCircleOutline
                fontSize="small"
                color="success"
                role="img"
                titleAccess={`${title}: confirmado por el servidor`}
                aria-label={`${title}: confirmado por el servidor`}
              />
            ) : null}
          </Box>
        </Stack>
      ) : null}
      {children}
      {failed ? (
        <Typography role="alert" color="error" variant="body2" sx={{ mt: 1.5 }}>
          {(error ? (inlineError ? 'Revisa los campos señalados en este bloque.' : error) : undefined) ??
            'No pudimos guardar este bloque. Conservamos tus cambios; vuelve a intentarlo al continuar.'}
        </Typography>
      ) : null}
    </Box>
  );
}
