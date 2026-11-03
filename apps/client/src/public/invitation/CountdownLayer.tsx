import { createContext, useContext, type ReactNode } from 'react';
import type { Countdown, PublicInvitationView } from '@invitaciones/api-client';
import { CountdownVisual, relativeRectStyles, useCountdownSeconds } from '@invitaciones/ui';
import { Box } from '@mui/material';

const CountdownSeconds = createContext<number | null>(null);

// Mounted with the authorized renderer, rather than with a lazily loaded leaf:
// the server clock anchor must not restart when a page first becomes visible.
export function InvitationCountdownClock({ view, children }: { view: PublicInvitationView; children: ReactNode }) {
  const seconds = useCountdownSeconds(view.event?.eventDateTime, view.serverNow);
  return <CountdownSeconds.Provider value={seconds}>{children}</CountdownSeconds.Provider>;
}

export function CountdownLayer({
  countdown,
  hidden = false
}: {
  countdown?: Countdown | null | undefined;
  hidden?: boolean;
}) {
  const seconds = useContext(CountdownSeconds);
  if (!countdown) return null;
  return (
    <Box
      data-testid="invitation-countdown"
      aria-hidden={hidden || undefined}
      sx={{ position: 'absolute', ...relativeRectStyles(countdown), pointerEvents: 'none', zIndex: 1 }}
    >
      <CountdownVisual appearance={countdown} seconds={seconds} />
    </Box>
  );
}
