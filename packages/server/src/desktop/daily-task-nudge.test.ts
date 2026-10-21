import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_DAILY_STUDY_TASK } from '@sb/shared';
const model = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../learning/coach.js', () => ({ resolveCoachTarget: () => ({ model: 'configured-coach' }) }));
vi.mock('../ai/gateway.js', () => ({ aiText: model.call }));
import { openIsolated, closeDb, getDb } from '../storage/db.js';
import { dailyTaskTick } from './daily-task-nudge.js';
import { saveDailyTask } from '../learning/daily-study-task.js';
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-task-ai-')); openIsolated(dir);
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T05:00:00Z')); model.call.mockReset();
  saveDailyTask('u', { ...DEFAULT_DAILY_STUDY_TASK, enabled: true, target: 1 });
});
afterEach(() => { vi.useRealTimers(); closeDb(); fs.rmSync(dir, { recursive: true, force: true }); });
it('uses the actual configured coach through the gateway once per cooldown; completion invalidates the balloon', async () => {
  model.call.mockResolvedValue({ ok: true, text: '去完成下一道判断题吧。' });
  dailyTaskTick('u', true); vi.advanceTimersByTime(61_000); dailyTaskTick('u', true);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const nudge = dailyTaskTick('u', true);
  expect(nudge).toMatchObject({ ai: true, text: '去完成下一道判断题吧。', progress: { remaining: 1 } });
  expect(model.call).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'coach.task', ownerId: 'u', target: { model: 'configured-coach' } }));
  dailyTaskTick('u', true); expect(model.call).toHaveBeenCalledTimes(1);
  getDb().prepare("INSERT INTO learning_event(owner_id,kind,payload,day,created_at) VALUES('u','quiz.answered','{\"correct\":false}','2026-10-20',?)")
    .run(new Date().toISOString().slice(0, 19).replace('T', ' '));
  expect(dailyTaskTick('u', true)).toBeNull();
});
it('does not generate while ineligible and discards an old model result after the task is changed', async () => {
  let resolve!: (value: { ok: boolean; text: string }) => void;
  model.call.mockImplementation(() => new Promise(r => { resolve = r; }));
  dailyTaskTick('u', true); vi.advanceTimersByTime(61_000);
  expect(dailyTaskTick('u', false)).toBeNull(); expect(model.call).not.toHaveBeenCalled();
  dailyTaskTick('u', true);
  saveDailyTask('u', { ...DEFAULT_DAILY_STUDY_TASK, enabled: false });
  resolve({ ok: true, text: '旧建议' }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(dailyTaskTick('u', true)).toBeNull();
});
