import type { Countdown, PublicInvitationView } from '@invitaciones/api-client';

export const countdownCacheKey = 'ip.countdown.v1';
export const countdownCacheTtl = 24 * 60 * 60 * 1000;

// Deliberately whitelist visual metadata. Never persist the public projection,
// invitation token, private contentPath, assistants, RSVP or QR data.
function visualSnapshot(value: Countdown): Countdown {
  return {
    id: value.id,
    revision: value.revision,
    visualOwnerType: value.visualOwnerType,
    flipbookPageId: value.flipbookPageId,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    numberFont: value.numberFont,
    labelFont: value.labelFont,
    numberWeight: value.numberWeight,
    labelWeight: value.labelWeight,
    layout: value.layout,
    numberColor: value.numberColor,
    labelColor: value.labelColor,
    backgroundColor: value.backgroundColor,
    borderColor: value.borderColor,
    shadowColor: value.shadowColor,
    backgroundOpacity: value.backgroundOpacity,
    frame: value.frame,
    shadow: value.shadow
  };
}

export function clearCountdownCache(): void {
  try {
    localStorage.removeItem(countdownCacheKey);
  } catch {
    // The authorized in-memory projection remains sufficient in private mode.
  }
}

/** Call only after the current invitation access has been validated by the API. */
export function authorizedCountdown(view: PublicInvitationView, now = Date.now()): Countdown | null {
  const current = view.status === 'AVAILABLE' ? view.design?.countdown : null;
  const event = view.status === 'AVAILABLE' ? view.event : null;
  if (!current || !event) {
    clearCountdownCache();
    return null;
  }
  const countdown = visualSnapshot(current);
  const content = {
    schemaVersion: 1,
    eventDateTime: event.eventDateTime,
    timeZone: event.timeZone,
    countdown
  };
  try {
    const raw = localStorage.getItem(countdownCacheKey);
    if (raw) {
      try {
        const cached: unknown = JSON.parse(raw);
        if (
          typeof cached === 'object' &&
          cached !== null &&
          'cachedAt' in cached &&
          typeof cached.cachedAt === 'number' &&
          cached.cachedAt <= now &&
          'expiresAt' in cached &&
          typeof cached.expiresAt === 'number' &&
          cached.expiresAt > now &&
          cached.expiresAt <= cached.cachedAt + countdownCacheTtl &&
          'content' in cached &&
          JSON.stringify(cached.content) === JSON.stringify(content)
        ) {
          // Match against the freshly authorized server values, including all
          // fields. Corrupt, stale or locally changed entries cannot win.
          return (cached.content as typeof content).countdown;
        }
      } catch {
        // Replace malformed storage with the current authorized metadata.
      }
    }
    localStorage.setItem(
      countdownCacheKey,
      JSON.stringify({
        content,
        cachedAt: now,
        expiresAt: now + countdownCacheTtl
      })
    );
  } catch {
    // Storage availability must never block the invitation.
  }
  return countdown;
}

export function withAuthorizedCountdown(view: PublicInvitationView): PublicInvitationView {
  const countdown = authorizedCountdown(view);
  return view.status === 'AVAILABLE' && view.design ? { ...view, design: { ...view.design, countdown } } : view;
}
