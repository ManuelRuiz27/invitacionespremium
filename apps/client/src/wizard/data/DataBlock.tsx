import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineOutlined';
import type { Event, UpdateEventInput } from '@invitaciones/api-client';
import { alpha, Box, Stack, Typography } from '@mui/material';
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
  saveState,
  error,
  inlineError = false
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  draft: UpdateEventInput;
  event: Event | undefined;
  confirmedDraft?: UpdateEventInput | undefined;
  fields: (keyof UpdateEventInput & keyof Event)[];
  saveState: SaveState;
  error?: string | undefined;
  inlineError?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const confirmed = confirmedDraft ?? event;
  const dirty = fields.some((field) => (draft[field] ?? null) !== (confirmed?.[field] ?? null));
  const complete =
    Boolean(event) &&
    fields.every(
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
  const state = failed
    ? 'error'
    : focused || dirty || saveState === 'saving'
      ? 'editing'
      : complete
        ? 'confirmed'
        : 'empty';
  return (
    <Box
      component="section"
      aria-labelledby={`${id}-title`}
      data-validation={state}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      sx={{
        minWidth: 0,
        p: { xs: 1.5, sm: 2.5 },
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
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2.5 }}>
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
        <Typography id={`${id}-title`} component="h3" variant="h4" sx={{ flex: 1 }}>
          {title}
        </Typography>
        {state === 'confirmed' ? (
          <CheckCircleOutline
            fontSize="small"
            color="success"
            role="img"
            titleAccess={`${title}: confirmado por el servidor`}
            aria-label={`${title}: confirmado por el servidor`}
          />
        ) : null}
      </Stack>
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
