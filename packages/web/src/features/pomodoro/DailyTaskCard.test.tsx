// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_DAILY_STUDY_TASK } from '@sb/shared';
const mock = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('./daily-task-api', () => ({ dailyTaskApi: mock, STUDY_TASK_OPEN: 'sb:study-task-open', STUDY_TASK_UPDATED: 'sb:study-task-updated' }));
import { DailyTaskCard } from './DailyTaskCard';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('edits and saves a real task; source progress rather than a local counter drives completion', async () => {
  const p = { task: { ...DEFAULT_DAILY_STUDY_TASK, enabled: true }, day: '2026-10-20', answered: 8, correct: 5, remaining: 12, completed: false };
  mock.get.mockResolvedValue(p); mock.save.mockImplementation(async task => ({ ...p, task, remaining: 2 }));
  await act(async () => { render(<DailyTaskCard />); });
  expect(screen.getByText('今日进度 8 / 20 题')).toBeTruthy();
  expect(screen.getByTestId('pixel-pomodoro-icon').tagName).toBe('svg');
  fireEvent.change(screen.getByLabelText('每天做题'), { target: { value: '10' } });
  await act(async () => { fireEvent.click(screen.getByText('保存每日任务')); });
  expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ target: 10, enabled: true }));
  const open = vi.fn(); window.addEventListener('sb:study-task-open', open);
  fireEvent.click(screen.getByText('去矿境做题')); expect(open).toHaveBeenCalledTimes(1); window.removeEventListener('sb:study-task-open', open);
});
