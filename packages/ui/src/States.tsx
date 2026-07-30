import type { ReactNode } from 'react';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Stack spacing={1.5} sx={{ py: 8, px: 2, alignItems: 'center', textAlign: 'center' }}>
      <InboxOutlined color="disabled" sx={{ fontSize: 48 }} aria-hidden="true" />
      <Typography variant="h3">{title}</Typography>
      {description ? <Typography color="text.secondary">{description}</Typography> : null}
      {action}
    </Stack>
  );
}

export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Cargando información…' }: LoadingStateProps) {
  return (
    <Stack role="status" aria-live="polite" spacing={2} sx={{ py: 8, alignItems: 'center' }}>
      <CircularProgress size={32} />
      <Typography color="text.secondary">{label}</Typography>
    </Stack>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  operationId?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'No pudimos cargar esta información',
  message,
  operationId,
  onRetry
}: ErrorStateProps) {
  return (
    <Alert
      severity="error"
      icon={<ErrorOutlineRounded />}
      action={
        onRetry ? (
          <Button color="inherit" onClick={onRetry}>
            Reintentar
          </Button>
        ) : undefined
      }
      sx={{ alignItems: 'flex-start' }}
    >
      <Box>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="body2">{message}</Typography>
        {operationId ? (
          <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
            Referencia: {operationId}
          </Typography>
        ) : null}
      </Box>
    </Alert>
  );
}
