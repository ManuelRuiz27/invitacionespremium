import { Container, type ContainerProps } from '@mui/material';
import { landingTokens } from '../../theme/landing-theme';

export interface LandingContainerProps extends Omit<ContainerProps, 'maxWidth'> {
  /** Apply vertical section padding */
  section?: boolean;
}

/**
 * Consistent landing container with optional section padding.
 * Wraps MUI Container at `lg` max-width.
 */
export function LandingContainer({ section, sx, ...props }: LandingContainerProps) {
  return (
    <Container
      maxWidth="lg"
      sx={{
        py: section ? landingTokens.spacing.sectionY : undefined,
        ...sx
      }}
      {...props}
    />
  );
}
