// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
const api = vi.hoisted(() => ({ tick: vi.fn(), dismiss: vi.fn() }));
vi.mock('../guide/float-guide-api', () => ({ floatGuideApi: api }));
import { FloatGuideInvitation } from './FloatGuideInvitation';
const guide = { id: 'guide-1', clientId: 'main', revision: 1, key: 'quiz', sessionId: 's1', view: 'chat', enabled: true, headline: '来检验一下？', label: '来一套题', hint: '刚学的知识', source: 'ai' };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('reuses the guide recommendation without auto-executing; clicking restores the corresponding context', async () => {
  api.tick.mockResolvedValue({ guide }); api.dismiss.mockResolvedValue({ guide }); const open = vi.fn();
  let v!: ReturnType<typeof render>; await act(async () => { v = render(<FloatGuideInvitation visible eligible onOpen={open} />); });
  expect(v.getByText(/来一套题/)).toBeTruthy(); expect(open).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(v.getByText('打开引路灯')); });
  expect(api.dismiss).toHaveBeenCalledWith('guide-1','open'); expect(open).toHaveBeenCalledWith(guide);
});
it('can be postponed, and never shows during a higher priority activity', async () => {
  api.tick.mockResolvedValue({ guide }); api.dismiss.mockResolvedValue({ guide }); const open = vi.fn();
  let v!: ReturnType<typeof render>; await act(async () => { v = render(<FloatGuideInvitation visible eligible={false} onOpen={open} />); });
  expect(v.queryByLabelText('悬浮球引路灯提醒')).toBeNull(); v.rerender(<FloatGuideInvitation visible eligible onOpen={open} />);
  await act(async () => { fireEvent.click(v.getByText('十分钟后')); }); expect(api.dismiss).toHaveBeenCalledWith('guide-1','snooze'); expect(open).not.toHaveBeenCalled();
});
