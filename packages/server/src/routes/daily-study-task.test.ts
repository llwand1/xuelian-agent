import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_DAILY_STUDY_TASK, AUTH_COOKIE_NAME } from '@sb/shared';
process.env.SB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-daily-task-'));
const { app } = await import('../index.js');
const { closeDb, getDb } = await import('../storage/db.js');
const { dailyStudyProgress, saveDailyTask } = await import('../learning/daily-study-task.js');
const { dailyTaskTick, dismissDailyTask } = await import('../desktop/daily-task-nudge.js');
const { createUser } = await import('../auth/users.js');
const { createSession } = await import('../auth/session.js');
const request = (await import('supertest')).default;
let a: string, b: string;
const origin = 'http://localhost:5173';
beforeAll(async () => {
  const u = await createUser('task-a@example.com', 'good-password-1', undefined);
  a = `${AUTH_COOKIE_NAME}=${createSession(u.id).token}`;
  const v = await createUser('task-b@example.com', 'good-password-1', undefined); b = `${AUTH_COOKIE_NAME}=${createSession(v.id).token}`;
});
afterAll(() => { vi.useRealTimers(); closeDb(); });
const get = (cookie = a) => request(app).get('/api/pomodoro/task').set('Cookie', cookie);
it('saves real owner-scoped recurring targets; invalid requests and foreign origins cannot mutate', async () => {
  expect((await get()).body.task.enabled).toBe(false);
  await request(app).put('/api/pomodoro/task').set('Origin', origin).set('Cookie', a).send({ ...DEFAULT_DAILY_STUDY_TASK, enabled: true, target: 3 }).expect(200);
  expect((await get()).body.task.target).toBe(3);
  expect((await get(b)).body.task.enabled).toBe(false);
  await request(app).put('/api/pomodoro/task').set('Origin', origin).set('Cookie', a).send({ ...DEFAULT_DAILY_STUDY_TASK, target: -1 }).expect(400);
  await request(app).put('/api/pomodoro/task').set('Origin', 'https://evil.example').set('Cookie', a).send(DEFAULT_DAILY_STUDY_TASK).expect(403);
});
it('correct AND wrong submitted answers count, an idempotent retry does not, and another owner stays isolated', async () => {
  const answer = { correct: false, source: 'wait-drill', qtype: 'judge', attemptKey: 'drill:stable-card-1' };
  const post = () => request(app).post('/api/learning/answers').set('Origin', origin).set('Cookie', a).send(answer);
  expect((await post()).body).toEqual({ accepted: 1 });
  expect((await post()).body).toEqual({ accepted: 0, duplicates: 1 });
  expect((await get()).body).toMatchObject({ answered: 1, correct: 0, remaining: 2 });
  expect((await get(b)).body.answered).toBe(0);
});
it('projects actual event timestamps with user timezone; no-answer and yesterday do not count', () => {
  saveDailyTask('projection-user', { ...DEFAULT_DAILY_STUDY_TASK, enabled: true, target: 2 });
  const row = getDb().prepare("INSERT INTO learning_event(owner_id,kind,payload,day,created_at) VALUES(?,'quiz.answered',?,'ignored',?)");
  for (const [time, payload] of [
    ['2026-10-20 15:59:00', { correct: true }], ['2026-10-20 16:00:00', { correct: false }],
    ['2026-10-20 16:02:00', { correct: true }], ['2026-10-20 16:03:00', { correct: false, answered: false }],
  ] as const) row.run('projection-user', JSON.stringify(payload), time);
  expect(dailyStudyProgress('projection-user', new Date('2026-10-20T16:05:00Z'))).toMatchObject({ day: '2026-10-21', answered: 2, correct: 1, completed: true });
});
it('floating nudges use fallback honestly, respect snooze/quiet hours/completion, and reject stale actions', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T05:00:00Z'));
  saveDailyTask('nudge-user', { ...DEFAULT_DAILY_STUDY_TASK, enabled: true });
  expect(dailyTaskTick('nudge-user', true)).toBeNull();
  vi.advanceTimersByTime(61_000); dailyTaskTick('nudge-user', true);
  await Promise.resolve(); await Promise.resolve();
  const nudge = dailyTaskTick('nudge-user', true);
  expect(nudge).toMatchObject({ ai: false, progress: { answered: 0, remaining: 20 } });
  expect(dismissDailyTask('nudge-user', 'stale', 'snooze')).toBe(false);
  expect(dismissDailyTask('nudge-user', nudge!.id, 'snooze')).toBe(true);
  expect(dailyTaskTick('nudge-user', true)).toBeNull();
  vi.advanceTimersByTime(9 * 60_000); expect(dailyTaskTick('nudge-user', true)).toBeNull();
  vi.setSystemTime(new Date('2026-10-20T15:00:00Z')); expect(dailyTaskTick('nudge-user', true)).toBeNull();
  vi.useRealTimers();
});
