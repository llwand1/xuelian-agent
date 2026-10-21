import { describe, it, expect } from 'vitest';
import { DEFAULT_DAILY_STUDY_TASK as defaults, parseDailyStudyTask, studyDay, studyReminderHours } from './daily-study-task.js';
describe('daily study task contract', () => {
  it('strictly validates targets, hours, timezone and booleans', () => {
    expect(parseDailyStudyTask(defaults)).toEqual(defaults);
    for (const bad of [{ target: 0 }, { target: 1001 }, { target: 2.5 }, { remind: 'yes' }, { startHour: 22, endHour: 9 }, { timeZone: 'bad/zone' }, { intervalMinutes: 1 }, { title: '' }])
      expect(parseDailyStudyTask({ ...defaults, ...bad })).toBeNull();
  });
  it('uses the user calendar day across UTC midnight and DST', () => {
    expect(studyDay(new Date('2026-10-20T16:01:00Z'), 'Asia/Shanghai')).toBe('2026-10-21');
    expect(studyDay(new Date('2026-11-01T05:30:00Z'), 'America/New_York')).toBe('2026-11-01');
    expect(studyReminderHours(defaults, new Date('2026-10-20T14:00:00Z'))).toBe(false);
    expect(studyReminderHours(defaults, new Date('2026-10-20T01:00:00Z'))).toBe(true);
  });
});
