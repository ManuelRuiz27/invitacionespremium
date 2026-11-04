import { CountdownVisual, defaultCountdownStyle, useCountdownSeconds } from '@invitaciones/ui';
import { Box, Typography, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { instantToWallClock, wallClockToInstant } from './timezone';
import { EventAnalogClock } from './EventAnalogClock';

export function EventCountdown({ target, zone }: { target: string | null | undefined; zone: string }) {
  const theme = useTheme();
  const seconds = useCountdownSeconds(target);
  const [localDay, setLocalDay] = useState(() => instantToWallClock(new Date().toISOString(), zone).slice(0, 10));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const day = instantToWallClock(new Date().toISOString(), zone).slice(0, 10);
      setLocalDay(day);
      const tomorrow = new Date(`${day}T12:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      let delay = 1000;
      try {
        delay = Math.max(
          1,
          Date.parse(wallClockToInstant(`${tomorrow.toISOString().slice(0, 10)}T00:00`, zone)) - Date.now()
        );
      } catch {
        /* Recheck the local day if midnight is skipped by DST. */
      }
      timer = setTimeout(sync, Math.min(delay, 2_147_483_647));
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [zone]);
  const eventDay = instantToWallClock(target, zone).slice(0, 10);
  const message =
    seconds === null
      ? 'Elige una fecha para comenzar la cuenta regresiva.'
      : seconds === 0
        ? localDay > eventDay
          ? 'La fecha del evento ya pasó'
          : 'Hoy es el evento'
        : null;
  return (
    <Box sx={{ pt: 1, mt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="overline" color="text.secondary">
        Cuenta regresiva
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
        <EventAnalogClock zone={zone} />
        {message ? (
          <Typography role="status" variant="body2">
            {message}
          </Typography>
        ) : (
          <Box sx={{ height: 96, minWidth: 0, flex: 1, position: 'relative', overflow: 'hidden' }}>
            <CountdownVisual
              seconds={seconds}
              appearance={{
                ...defaultCountdownStyle,
                frame: 'none',
                shadow: 'none',
                backgroundOpacity: 0,
                numberColor: theme.palette.text.primary,
                labelColor: theme.palette.text.secondary
              }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
