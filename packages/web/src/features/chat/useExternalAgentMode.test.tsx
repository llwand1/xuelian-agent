// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_EXTERNAL_AGENT } from '@sb/shared';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../settings/external-agent-api', () => ({ externalAgentApi: mocks }));
import { useExternalAgentMode } from './useExternalAgentMode';
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
it('automatically turns off the default online flag and follows saved backend changes', async () => {
  mocks.get.mockResolvedValue({ supported: true, settings: { ...DEFAULT_EXTERNAL_AGENT, enabled: true } });
  const online = vi.fn(), hook = renderHook(() => useExternalAgentMode(online));
  await waitFor(() => expect(hook.result.current).toBe(DEFAULT_EXTERNAL_AGENT.name)); expect(online).toHaveBeenCalledWith(false);
  mocks.get.mockResolvedValue({ supported: true, settings: DEFAULT_EXTERNAL_AGENT });
  act(() => window.dispatchEvent(new Event('sb:external-agent-changed')));
  await waitFor(() => expect(hook.result.current).toBe(''));
});
it('does not change native chat on hosted deployment or failed metadata reads', async () => {
  mocks.get.mockResolvedValue({ supported: false, settings: { ...DEFAULT_EXTERNAL_AGENT, enabled: true } });
  const online = vi.fn(), hook = renderHook(() => useExternalAgentMode(online));
  await waitFor(() => expect(mocks.get).toHaveBeenCalled()); expect(hook.result.current).toBe(''); expect(online).not.toHaveBeenCalled();
  mocks.get.mockRejectedValue(new Error('offline')); act(() => window.dispatchEvent(new Event('sb:external-agent-changed')));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2)); expect(hook.result.current).toBe('');
});
