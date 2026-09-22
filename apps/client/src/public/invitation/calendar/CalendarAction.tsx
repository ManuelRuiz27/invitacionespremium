import { useState } from 'react';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import {
  buildGoogleCalendarUrl,
  buildIcsCalendar,
  calendarFileName,
  type CalendarEventData
} from './calendar';

export function CalendarAction({ event }: { event: CalendarEventData }) {
  const [open, setOpen] = useState(false);
  const googleUrl = buildGoogleCalendarUrl(event);

  const saveIcs = () => {
    const blob = new Blob([buildIcsCalendar(event)], { type: 'text/calendar;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = calendarFileName(event.name);
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<CalendarMonthOutlined />}
        onClick={() => setOpen(true)}
        sx={{ width: 'fit-content' }}
      >
        Agregar al calendario
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="calendar-title">
        <DialogTitle id="calendar-title">Agregar al calendario</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Button
              component="a"
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              onClick={() => setOpen(false)}
            >
              Google Calendar
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                saveIcs();
                setOpen(false);
              }}
            >
              Apple / Outlook (.ics)
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
