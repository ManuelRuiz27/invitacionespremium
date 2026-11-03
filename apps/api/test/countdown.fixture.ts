import { HotspotVisualOwnerType } from '../src/generated/prisma/client';
import type { SaveCountdownInput } from '../src/invitation-design/countdown.dto';

export const countdownInput: SaveCountdownInput = {
  visualOwnerType: HotspotVisualOwnerType.FLYER,
  flipbookPageId: null,
  x: 0.1,
  y: 0.2,
  width: 0.8,
  height: 0.2,
  numberFont: 'montserrat',
  labelFont: 'playfair',
  numberWeight: 600,
  labelWeight: 400,
  layout: 'row',
  numberColor: '#171717',
  labelColor: '#57594F',
  backgroundColor: '#FFFFFF',
  borderColor: '#B8A58A',
  shadowColor: '#171717',
  backgroundOpacity: 0.85,
  frame: 'thin',
  shadow: 'soft',
  revision: 0
};
