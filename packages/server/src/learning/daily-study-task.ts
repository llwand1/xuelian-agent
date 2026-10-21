import { DEFAULT_DAILY_STUDY_TASK, parseDailyStudyTask, studyDay, type DailyStudyTask, type DailyStudyProgress } from '@sb/shared';
import { getDb } from '../storage/db.js';
import { ownerForWrite } from '../auth/ownership.js';
const KEY = 'daily-study-task';
export function loadDailyTask(owner: string | null): DailyStudyTask {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE owner_id = ? AND key = ?').get(ownerForWrite(owner), KEY) as { value: string } | undefined;
  try { return parseDailyStudyTask(JSON.parse(row?.value ?? 'null')) ?? { ...DEFAULT_DAILY_STUDY_TASK }; }
  catch { return { ...DEFAULT_DAILY_STUDY_TASK }; }
}
export function saveDailyTask(owner: string | null, task: DailyStudyTask): void {
  getDb().prepare('INSERT INTO app_settings(owner_id, key, value) VALUES(?, ?, ?) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value')
    .run(ownerForWrite(owner), KEY, JSON.stringify(task));
}
/** UTC timestamps → user's calendar day, including DST and a server in a different zone. */
export function dailyStudyProgress(owner: string | null, now = new Date()): DailyStudyProgress {
  const task = loadDailyTask(owner), day = studyDay(now, task.timeZone);
  const from = new Date(now.getTime() - 48 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = getDb().prepare("SELECT payload, created_at FROM learning_event WHERE owner_id=? AND kind='quiz.answered' AND created_at>=? ORDER BY id")
    .all(ownerForWrite(owner), from) as Array<{ payload: string | null; created_at: string }>;
  let answered = 0, correct = 0;
  for (const row of rows) {
    const at = new Date(row.created_at.includes('T') ? row.created_at : row.created_at.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(at.getTime()) || at > now || studyDay(at, task.timeZone) !== day) continue;
    try {
      const p = JSON.parse(row.payload ?? '{}') as Record<string, unknown>;
      if (p.answered === false || typeof p.correct !== 'boolean') continue;
      answered++; if (p.correct) correct++;
    } catch { /* A corrupt legacy row is not a completed question. */ }
  }
  return { task, day, answered, correct, remaining: Math.max(0, task.target - answered), completed: answered >= task.target };
}
