import { BrandLockup } from '@invitaciones/ui';

export interface LandingBrandLockupProps {
  /**
   * `horizontal` — compact for header.
   * `stacked` — editorial with tagline.
   */
  variant?: 'horizontal' | 'stacked' | undefined;
  /** Brand name (retained for backward compatibility) */
  name?: string | undefined;
  /** Brand tagline */
  tagline?: string | undefined;
}

/**
 * Editorial brand lockup for landing pages.
 * Displays "INVITACIONES" in wide-spaced uppercase sans-serif
 * and "Premium" dominant in editorial serif.
 */
export function LandingBrandLockup({ variant = 'horizontal', tagline }: LandingBrandLockupProps) {
  return (
    <BrandLockup
      size={variant === 'horizontal' ? 'small' : 'medium'}
      tagline={variant === 'stacked' && tagline ? tagline : undefined}
    />
  );
}
