import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { FlyerRenderer } from './FlyerRenderer';
import { FlipbookRenderer } from './FlipbookRenderer';
import { InvitationCountdownClock } from './CountdownLayer';

export function InvitationRenderer(props: {
  apiClient: ApiClient;
  token: string;
  view: PublicInvitationView;
  onRsvp: () => void;
  onUnavailableQr: () => void;
}) {
  return (
    <InvitationCountdownClock view={props.view}>
      {props.view.designType === 'FLIPBOOK' ? <FlipbookRenderer {...props} /> : <FlyerRenderer {...props} />}
    </InvitationCountdownClock>
  );
}
