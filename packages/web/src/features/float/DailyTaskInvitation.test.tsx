// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_DAILY_STUDY_TASK } from '@sb/shared';
const mock = vi.hoisted(() => ({ tick: vi.fn(), dismiss: vi.fn() }));
vi.mock('../pomodoro/daily-task-api', () => ({ dailyTaskApi: mock, STUDY_TASK_OPEN: 'sb:study-task-open' }));
import { DailyTaskInvitation } from './DailyTaskInvitation';
const nudge = { id: 'task-current', ai: true, text: '先完成下一题吧。', progress: { task: DEFAULT_DAILY_STUDY_TASK, day: '2026-10-20', answered: 8, correct: 6, remaining: 12, completed: false } };
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); delete (window as unknown as { chrome?: unknown }).chrome; });
it('does not auto-expand; snooze is real and opening explicitly takes the user to the mines', async () => {
  vi.useFakeTimers(); mock.tick.mockResolvedValue({ nudge }); mock.dismiss.mockResolvedValue({ ok: true });
  const open = vi.fn();
  await act(async () => { render(<DailyTaskInvitation visible eligible onOpen={open} />); });
  expect(screen.getByText(/今日 8\/20 题/)).toBeTruthy(); expect(open).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByText('去做题')); });
  expect(mock.dismiss).toHaveBeenCalledWith('task-current', 'open'); expect(open).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('每日任务提醒')).toBeNull();
});
it('native balloon has bounded task protocol, no quiz launch, and is removed when another activity takes priority', async () => {
  const sent: string[] = [];
  (window as unknown as { chrome: unknown }).chrome = { webview: { postMessage: (s: string) => sent.push(s), addEventListener: () => {}, removeEventListener: () => {} } };
  mock.tick.mockResolvedValue({ nudge });
  const open = vi.fn(); let view: ReturnType<typeof render>;
  await act(async () => { view = render(<DailyTaskInvitation visible eligible onOpen={open} />); });
  const payload = JSON.parse(sent.find(s => s.startsWith('sb-float:invite:{'))!.slice('sb-float:invite:'.length));
  expect(payload).toMatchObject({ id: 'task-current', kind: 'task' }); expect(payload.topic).toContain('8/20');
  expect(open).not.toHaveBeenCalled(); expect(sent).not.toContain('sb-float:quiz');
  view!.rerender(<DailyTaskInvitation visible eligible={false} onOpen={open} />); expect(sent.at(-1)).toBe('sb-float:invite:off:task-current');
});
