import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { useState } from 'react';

function eventTimeLabel(value: string): string {
  if (!value) return 'Elegir hora';
  const [hour, minute] = value.split(':');
  return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'a. m.' : 'p. m.'}`;
}

export function EventTimePicker({
  value,
  zoneLabel,
  disabled,
  error,
  onChange,
  onEditZone
}: {
  value: string;
  zoneLabel: string;
  disabled: boolean;
  error?: string | undefined;
  onChange: (time: string) => void;
  onEditZone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('');
  const close = () => {
    setOpen(false);
  };
  return (
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
      <Button
        variant="outlined"
        startIcon={<AccessTimeOutlined />}
        aria-label={`Hora de inicio: ${eventTimeLabel(value)}`}
        aria-haspopup="dialog"
        aria-invalid={Boolean(error)}
        disabled={disabled}
        onClick={() => {
          const [hours, minutes] = value.split(':');
          setHour(value ? String(Number(hours) % 12 || 12) : '');
          setMinute(minutes ?? '00');
          setPeriod(value ? (Number(hours) < 12 ? 'am' : 'pm') : '');
          setOpen(true);
        }}
        sx={{ justifyContent: 'flex-start', minHeight: 44, ...(error ? { borderColor: 'error.main' } : {}) }}
      >
        {value ? eventTimeLabel(value) : 'Elegir hora de inicio'}
      </Button>
      <Button
        size="small"
        onClick={onEditZone}
        disabled={disabled}
        aria-label={`Cambiar zona horaria: ${zoneLabel}`}
        sx={{ alignSelf: 'flex-start', minHeight: 44, color: 'text.secondary', fontWeight: 400, px: 0 }}
      >
        {zoneLabel} · Cambiar zona
      </Button>
      <Dialog open={open} onClose={close} aria-labelledby="event-time-title" fullWidth maxWidth="xs">
        <DialogTitle id="event-time-title">Hora de inicio</DialogTitle>
        <DialogContent
          sx={{ '& .MuiInputBase-root': { typography: 'body2' }, '& .MuiInputBase-input': { fontFamily: 'inherit' } }}
        >
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                select
                fullWidth
                disabled={disabled}
                label="Hora"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
              >
                {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((item) => (
                  <MenuItem key={item} value={item} sx={{ typography: 'body2', minHeight: 44 }}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                disabled={disabled}
                label="Minutos"
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
              >
                {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((item) => (
                  <MenuItem key={item} value={item} sx={{ typography: 'body2', minHeight: 44 }}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <ToggleButtonGroup
              value={period}
              exclusive
              onChange={(_, next: string | null) => {
                if (next) setPeriod(next);
              }}
              aria-label="Periodo del día"
              fullWidth
            >
              <ToggleButton value="am" disabled={disabled} sx={{ minHeight: 44 }}>
                a. m.
              </ToggleButton>
              <ToggleButton value="pm" disabled={disabled} sx={{ minHeight: 44 }}>
                p. m.
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary">
              Zona horaria: {zoneLabel}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          {value ? (
            <Button
              disabled={disabled}
              onClick={() => {
                onChange('');
                close();
              }}
            >
              Quitar hora
            </Button>
          ) : null}
          <Button onClick={close}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={disabled || !hour || !period}
            onClick={() => {
              const hours = (Number(hour) % 12) + (period === 'pm' ? 12 : 0);
              onChange(`${String(hours).padStart(2, '0')}:${minute}`);
              close();
            }}
          >
            Usar hora
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
