import type { ReactNode } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';

export function ConfirmSensitiveActionDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled = false,
  destructive = false,
  error,
  children,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  confirmDisabled?: boolean;
  destructive?: boolean;
  error?: string;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-describedby="sensitive-description"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography id="sensitive-description" color="text.secondary">
            {description}
          </Typography>
          {children}
          {error ? (
            <Alert severity="error" aria-live="polite">
              {error}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          color={destructive ? 'error' : 'primary'}
          variant="contained"
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
        >
          {busy ? 'Procesando...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
