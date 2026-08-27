import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LandingPricingClient } from './pricing-client';
import { publicPricingFixture } from './test/pricing-fixtures';

const mocks = vi.hoisted(() => ({ client: undefined as LandingPricingClient | undefined }));

vi.mock('./pricing-client', () => ({ createLandingPricingClient: () => mocks.client }));

import { usePublicPricing } from './use-public-pricing';

describe('usePublicPricing', () => {
  beforeEach(() => {
    mocks.client = undefined;
  });

  it('loads once and exposes the public prices', async () => {
    const list = vi.fn().mockResolvedValue(publicPricingFixture);
    mocks.client = { list };
    const { result } = renderHook(() => usePublicPricing());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('reports unavailable without making a request', async () => {
    const { result } = renderHook(() => usePublicPricing());
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'));
  });

  it('reports an ordinary error without retrying automatically', async () => {
    const list = vi.fn().mockRejectedValue(new Error('network'));
    mocks.client = { list };
    const { result } = renderHook(() => usePublicPricing());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    await Promise.resolve();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('retries only after an explicit request', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(publicPricingFixture);
    mocks.client = { list };
    const { result } = renderHook(() => usePublicPricing());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('aborts the active request on unmount and ignores AbortError', () => {
    const list = vi.fn((_signal?: AbortSignal) => new Promise<never>(() => undefined));
    mocks.client = { list };
    const view = renderHook(() => usePublicPricing());
    const signal = list.mock.calls[0]?.[0];
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
