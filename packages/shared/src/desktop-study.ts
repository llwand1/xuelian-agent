import type { CampfireOpener } from './campfire-opener.js';

/** Desktop-only contracts. Page text is temporary and never a saved document. */
export interface DesktopStudySettings {
  enabled: boolean;
  intervalMinutes: number;
  /** Missing in older installations: preserve the former two-minute snooze. */
  snoozeMinutes?: number;
  scope: 'learning' | 'browser' | 'bilibili';
}
export const DEFAULT_STUDY_SNOOZE_MINUTES = 2;
export const DEFAULT_DESKTOP_STUDY: DesktopStudySettings = { enabled: false, intervalMinutes: 3, snoozeMinutes: DEFAULT_STUDY_SNOOZE_MINUTES, scope: 'learning' };
export function parseDesktopStudySettings(value: unknown): DesktopStudySettings | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean' || !Number.isInteger(v.intervalMinutes) ||
      (v.intervalMinutes as number) < 1 || (v.intervalMinutes as number) > 60 ||
      (v.scope !== 'learning' && v.scope !== 'browser' && v.scope !== 'bilibili') ||
      (v.snoozeMinutes !== undefined && (!Number.isInteger(v.snoozeMinutes) || Number(v.snoozeMinutes) < 1 || Number(v.snoozeMinutes) > 60))) return null;
  return { enabled: v.enabled, intervalMinutes: v.intervalMinutes as number, snoozeMinutes: v.snoozeMinutes as number | undefined ?? DEFAULT_STUDY_SNOOZE_MINUTES, scope: v.scope };
}
export interface BrowserPageSnapshot {
  url: string;
  title: string;
  text: string;
  selection: string;
  viewport: string;
  epoch: string;
  seq: number;
}
export interface DesktopBrowserState {
  sessionId: string;
  connected: boolean;
  title: string;
  url: string;
  chars: number;
  revision: number;
  contentRevision: number;
  updatedAt: number;
  selection: string;
  text?: string;
  /** True briefly after this page supplied retrieved material to a question or answer. */
  retrieving?: boolean;
}
export interface DesktopStudyState {
  settings: DesktopStudySettings;
  nextAt: number | null;
  preparing: boolean;
  awaiting: boolean;
  question: CampfireOpener | null;
  error: string;
}
