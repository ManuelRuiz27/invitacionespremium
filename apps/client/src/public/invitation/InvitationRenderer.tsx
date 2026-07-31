import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { FlyerRenderer } from './FlyerRenderer';
import { FlipbookRenderer } from './FlipbookRenderer';

export function InvitationRenderer(props: {
  apiClient: ApiClient;
  token: string;
  view: PublicInvitationView;
  onRsvp: () => void;
  onQr: () => void;
  onUnavailableQr: () => void;
}) {
  return props.view.designType === 'FLIPBOOK' ? <FlipbookRenderer {...props} /> : <FlyerRenderer {...props} />;
}
