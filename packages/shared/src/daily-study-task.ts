/** 每日任务与番茄钟解耦：同一学习事件账本，不因切换常规/游戏重复计数。 */
export interface DailyStudyTask {
  enabled: boolean;
  title: string;
  target: number;
  remind: boolean;
  intervalMinutes: number;
  startHour: number;
  endHour: number;
  timeZone: string;
}
export interface DailyStudyProgress {
  task: DailyStudyTask;
  day: string;
  answered: number;
  correct: number;
  remaining: number;
  completed: boolean;
}
export interface DailyStudyNudge {
  id: string;
  text: string;
  ai: boolean;
  progress: DailyStudyProgress;
}
export const DEFAULT_DAILY_STUDY_TASK: DailyStudyTask = {
  enabled: false, title: '每天进步一点', target: 20, remind: true,
  intervalMinutes: 30, startHour: 9, endHour: 22, timeZone: 'Asia/Shanghai',
};
export function parseDailyStudyTask(input: unknown): DailyStudyTask | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const b = input as Record<string, unknown>;
  const integer = (key: string, min: number, max: number) => typeof b[key] === 'number' && Number.isInteger(b[key]) && Number(b[key]) >= min && Number(b[key]) <= max;
  if (typeof b.enabled !== 'boolean' || typeof b.remind !== 'boolean' || typeof b.title !== 'string' ||
      !b.title.trim() || b.title.trim().length > 60 || Array.from(b.title).some(c => c.charCodeAt(0) < 32) ||
      !integer('target', 1, 1000) || !integer('intervalMinutes', 5, 180) ||
      !integer('startHour', 0, 23) || !integer('endHour', 1, 24) || Number(b.startHour) >= Number(b.endHour) ||
      typeof b.timeZone !== 'string' || b.timeZone.length > 80) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: b.timeZone }).format(); } catch { return null; }
  return { enabled: b.enabled, remind: b.remind, title: b.title.trim(), target: Number(b.target),
    intervalMinutes: Number(b.intervalMinutes), startHour: Number(b.startHour), endHour: Number(b.endHour), timeZone: b.timeZone };
}
export function studyDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function studyReminderHours(task: DailyStudyTask, now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: task.timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return hour >= task.startHour && hour < task.endHour;
}
