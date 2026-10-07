import { useState } from 'react';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import { Alert, Button, Stack } from '@mui/material';
import { buildIcsCalendar, calendarFileName, type CalendarEventData } from './calendar';

export function CalendarAction({ event }: { event: CalendarEventData }) {
  const [failed, setFailed] = useState(false);

  const saveIcs = () => {
    setFailed(false);
    let href: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const blob = new Blob([buildIcsCalendar(event)], { type: 'text/calendar;charset=utf-8' });
      href = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = calendarFileName(event.name);
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
    } catch {
      setFailed(true);
    } finally {
      anchor?.remove();
      if (href) {
        const objectUrl = href;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  };

  return (
    <Stack spacing={1}>
      <Button variant="outlined" startIcon={<CalendarMonthOutlined />} onClick={saveIcs} sx={{ width: 'fit-content' }}>
        Agregar a mi calendario
      </Button>
      {failed ? <Alert severity="error">No pudimos preparar el calendario. Inténtalo nuevamente.</Alert> : null}
    </Stack>
  );
}
