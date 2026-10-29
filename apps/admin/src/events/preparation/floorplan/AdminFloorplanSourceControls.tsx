import ImageOutlined from '@mui/icons-material/ImageOutlined';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Typography
} from '@mui/material';

export function AdminFloorplanUploadButton({
  label,
  disabled,
  onFile
}: {
  label: string;
  disabled: boolean;
  onFile: (file: File) => Promise<void>;
}) {
  return (
    <Button
      component="label"
      variant="outlined"
      disabled={disabled}
      startIcon={<ImageOutlined />}
      sx={{ minHeight: 44 }}
    >
      {label}
      <input
        hidden
        type="file"
        accept=".svg,.jpg,.jpeg,.png,image/png,image/jpeg,image/svg+xml"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (file)
            void onFile(file).finally(() => {
              input.value = '';
            });
        }}
      />
    </Button>
  );
}

export function AdminFloorplanSourceEmptyState({
  uploading,
  disabled,
  validationMessage,
  message,
  refreshRequired,
  onFile,
  onRefresh
}: {
  uploading: boolean;
  disabled: boolean;
  validationMessage: string | undefined;
  message: string | undefined;
  refreshRequired: boolean;
  onFile: (file: File) => Promise<void>;
  onRefresh: () => void;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ minHeight: 430, display: 'grid', placeItems: 'center', p: 3, borderRadius: 3, bgcolor: 'grey.50' }}
    >
      <Stack spacing={2} sx={{ alignItems: 'center', maxWidth: 520, textAlign: 'center' }}>
        <ImageOutlined color="primary" sx={{ fontSize: 56 }} />
        <Typography component="h2" variant="h4">
          Comienza con el plano del lugar
        </Typography>
        <Typography color="text.secondary">Sube una imagen JPG, PNG o SVG para distribuir Mesas y Zonas.</Typography>
        <AdminFloorplanUploadButton
          label={uploading ? 'Subiendo plano...' : 'Subir plano'}
          disabled={disabled}
          onFile={onFile}
        />
        {validationMessage ? <Alert severity="warning">{validationMessage}</Alert> : null}
        {message ? <Alert severity="error">{message}</Alert> : null}
        {refreshRequired ? (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" onClick={onRefresh}>
                Actualizar plano
              </Button>
            }
          >
            No pudimos confirmar si el plano se creó. Actualiza antes de volver a subirlo.
          </Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function AdminFloorplanSourceReplacementDialog({
  open,
  onClose,
  onConfirm
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>¿Reemplazar el plano SVG?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          El plano actual tiene elementos vinculados. Al reemplazarlo se desvincularán de este SVG; las mesas, los
          lugares y las asignaciones se conservarán para que puedas vincularlos de nuevo si lo necesitas.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={onConfirm}>
          Reemplazar y desvincular
        </Button>
      </DialogActions>
    </Dialog>
  );
}
