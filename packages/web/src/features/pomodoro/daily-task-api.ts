import type { DailyStudyTask, DailyStudyProgress, DailyStudyNudge } from '@sb/shared';
import { request } from '../../lib/api-request';
export const STUDY_TASK_OPEN = 'sb:study-task-open';
export const STUDY_TASK_UPDATED = 'sb:study-task-updated';
export const dailyTaskApi = {
  get: () => request<DailyStudyProgress>('/api/pomodoro/task'),
  save: (task: DailyStudyTask) => request<DailyStudyProgress>('/api/pomodoro/task', { method: 'PUT', body: JSON.stringify(task) }),
  tick: (eligible: boolean) => request<{ nudge: DailyStudyNudge | null }>('/api/desktop/task/tick', { method: 'POST', body: JSON.stringify({ eligible }) }),
  dismiss: (id: string, action: 'open' | 'snooze') => request('/api/desktop/task/dismiss', { method: 'POST', body: JSON.stringify({ id, action }) }),
};
