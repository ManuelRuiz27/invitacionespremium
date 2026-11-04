import { Box, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export function EventAnalogClock({ zone }: { zone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    const sync = () => {
      clearInterval(timer);
      tick();
      if (!document.hidden) timer = setInterval(tick, 1000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((value) => value.type === type)?.value ?? 0);
  const seconds = part('second');
  const minutes = part('minute') + seconds / 60;
  const hours = (part('hour') % 12) + minutes / 60;
  return (
    <Box sx={{ width: { xs: 72, sm: 84 }, flexShrink: 0, textAlign: 'center', color: 'text.secondary' }}>
      <Box
        component="svg"
        viewBox="0 0 100 100"
        aria-hidden="true"
        sx={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, index) => (
          <line
            key={index}
            x1="50"
            x2="50"
            y1="7"
            y2={index % 3 === 0 ? '15' : '11'}
            stroke="currentColor"
            strokeWidth={index % 3 === 0 ? 1.5 : 1}
            transform={`rotate(${index * 30} 50 50)`}
          />
        ))}
        <line
          data-hand="hour"
          x1="50"
          y1="53"
          x2="50"
          y2="28"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${hours * 30} 50 50)`}
        />
        <line
          data-hand="minute"
          x1="50"
          y1="55"
          x2="50"
          y2="17"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${minutes * 6} 50 50)`}
        />
        <line
          data-hand="second"
          x1="50"
          y1="58"
          x2="50"
          y2="13"
          stroke="currentColor"
          strokeWidth=".8"
          transform={`rotate(${seconds * 6} 50 50)`}
        />
        <circle cx="50" cy="50" r="2.5" fill="currentColor" />
      </Box>
      <Typography
        component="time"
        dateTime={now.toISOString()}
        aria-label={`Hora actual en ${zone}`}
        aria-live="off"
        variant="caption"
        sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '.65rem', whiteSpace: 'nowrap' }}
      >
        Ahora ·{' '}
        {new Intl.DateTimeFormat('es-MX', {
          timeZone: zone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23'
        }).format(now)}
      </Typography>
    </Box>
  );
}
