import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const fromKey = (key: string) => new Date(`${key}T12:00:00Z`);
const dayLabel = (date: Date) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeZone: 'UTC' }).format(date);

export function EventCalendar({
  value,
  today,
  disabled,
  onChange
}: {
  value: string;
  today: string;
  disabled: boolean;
  onChange: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => (value || today).slice(0, 7));
  const [focusDay, setFocusDay] = useState(value || today);
  const focusRequested = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (value) {
      setMonth(value.slice(0, 7));
      setFocusDay(value);
    }
  }, [value]);
  useEffect(() => {
    if (focusRequested.current) {
      buttons.current.get(focusDay)?.focus();
      focusRequested.current = false;
    }
  }, [focusDay, month]);
  const start = fromKey(`${month}-01`);
  const days = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = (start.getUTCDay() + 6) % 7;
  const navigate = (delta: number) => {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1, 12));
    setMonth(dateKey(next).slice(0, 7));
    setFocusDay(dateKey(next));
  };
  return (
    <Box aria-label="Calendario del evento" sx={{ minWidth: 0 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <IconButton
          aria-label="Mes anterior"
          disabled={disabled}
          onClick={() => navigate(-1)}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ChevronLeft />
        </IconButton>
        <Typography component="p" aria-live="polite" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
          {new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start)}
        </Typography>
        <IconButton
          aria-label="Mes siguiente"
          disabled={disabled}
          onClick={() => navigate(1)}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ChevronRight />
        </IconButton>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', textAlign: 'center' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
          <Typography key={index} aria-hidden="true" variant="caption" color="text.secondary" sx={{ py: 1 }}>
            {day}
          </Typography>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const key = `${month}-${String(index + 1).padStart(2, '0')}`;
          return (
            <Button
              key={key}
              ref={(node) => {
                if (node) buttons.current.set(key, node);
                else buttons.current.delete(key);
              }}
              aria-label={dayLabel(fromKey(key))}
              aria-pressed={value === key}
              aria-current={key === today ? 'date' : undefined}
              tabIndex={key === focusDay ? 0 : -1}
              disabled={disabled}
              variant={value === key ? 'contained' : 'text'}
              onClick={() => {
                setFocusDay(key);
                onChange(key);
              }}
              onKeyDown={(e) => {
                const date = fromKey(key);
                if (e.key === 'ArrowLeft') date.setUTCDate(date.getUTCDate() - 1);
                else if (e.key === 'ArrowRight') date.setUTCDate(date.getUTCDate() + 1);
                else if (e.key === 'ArrowUp') date.setUTCDate(date.getUTCDate() - 7);
                else if (e.key === 'ArrowDown') date.setUTCDate(date.getUTCDate() + 7);
                else if (e.key === 'Home') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
                else if (e.key === 'End') date.setUTCDate(date.getUTCDate() + 6 - ((date.getUTCDay() + 6) % 7));
                else if (e.key === 'PageUp' || e.key === 'PageDown') {
                  const day = date.getUTCDate();
                  date.setUTCDate(1);
                  date.setUTCMonth(date.getUTCMonth() + (e.key === 'PageUp' ? -1 : 1));
                  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
                  date.setUTCDate(Math.min(day, last));
                } else return;
                e.preventDefault();
                focusRequested.current = true;
                setMonth(dateKey(date).slice(0, 7));
                setFocusDay(dateKey(date));
              }}
              sx={{
                minWidth: 0,
                minHeight: 44,
                p: 0,
                borderRadius: 1,
                fontWeight: value === key ? 700 : 400,
                boxShadow: 'none',
                ...(key === today && value !== key ? { textDecoration: 'underline', textUnderlineOffset: 5 } : {})
              }}
            >
              {index + 1}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
