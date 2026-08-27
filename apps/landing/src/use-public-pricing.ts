import type { PublicPricing } from '@invitaciones/api-client';
import { useCallback, useEffect, useState } from 'react';
import { createLandingPricingClient } from './pricing-client';

export type PublicPricingState =
  | { status: 'loading' }
  | { status: 'ready'; prices: PublicPricing[] }
  | { status: 'unavailable' }
  | { status: 'error' };

export function usePublicPricing(): {
  state: PublicPricingState;
  retry: () => void;
} {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<PublicPricingState>({ status: 'loading' });

  useEffect(() => {
    const client = createLandingPricingClient();
    if (!client) {
      setState({ status: 'unavailable' });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });

    void client
      .list(controller.signal)
      .then((prices) => {
        if (active) setState({ status: 'ready', prices });
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof Error && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [generation]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setGeneration((current) => current + 1);
  }, []);

  return { state, retry };
}
