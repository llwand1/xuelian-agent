import { randomUUID } from 'node:crypto';
import { GUIDE_VIEWS, cleanGuideLine, type FloatGuideSnapshot, type FloatGuideNudge } from '@sb/shared';
import { canAccessSession, sessionExists, ownerForWrite } from '../auth/ownership.js';
import { getDb } from '../storage/db.js';
import { loadPomodoro } from '../storage/pomodoro.js';
interface Entry { value: FloatGuideSnapshot; expires: number; updated: number }
interface State { entries: Map<string, Entry>; pending: FloatGuideNudge | null; nextAt: number }
const owners = new Map<string, State>();
const TTL = 180_000, KEY = 'float-guide-next';
function state(owner: string | null, now: number): State {
  const key = ownerForWrite(owner); let current = owners.get(key);
  if (!current) {
    const r = getDb().prepare('SELECT value FROM app_settings WHERE owner_id=? AND key=?').get(key, KEY) as { value: string } | undefined;
    current = { entries: new Map(), pending: null, nextAt: Math.max(now + 60_000, Number(r?.value) || 0) };
    owners.set(key, current);
  }
  for (const [id, e] of current.entries) if (e.expires < now) current.entries.delete(id);
  while (owners.size > 256) owners.delete(owners.keys().next().value!);
  return current;
}
export function publishFloatGuide(owner: string | null, input: unknown, now = Date.now()): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const b = input as Record<string, unknown>;
  if (typeof b.clientId !== 'string' || !/^[\w-]{1,80}$/.test(b.clientId) || !Number.isSafeInteger(b.revision) || Number(b.revision) < 0 ||
      typeof b.key !== 'string' || b.key.length > 400 || typeof b.enabled !== 'boolean' ||
      !(GUIDE_VIEWS as readonly unknown[]).includes(b.view) || (b.sessionId !== null && (typeof b.sessionId !== 'string' || b.sessionId.length > 128)) ||
      !['ai','rules'].includes(String(b.source)) || ['headline','label','hint'].some(k => typeof b[k] !== 'string' || String(b[k]).length > 120)) return false;
  if (typeof b.sessionId === 'string' && (!sessionExists(b.sessionId) || !canAccessSession(b.sessionId, owner))) return false;
  const s = state(owner, now), old = s.entries.get(b.clientId);
  if (old && old.value.revision >= Number(b.revision)) return true;
  const value: FloatGuideSnapshot = { clientId: b.clientId, revision: Number(b.revision), key: b.key, enabled: b.enabled, view: b.view as FloatGuideSnapshot['view'],
    sessionId: b.sessionId as string | null, headline: cleanGuideLine(b.headline, 80), label: cleanGuideLine(b.label, 40), hint: cleanGuideLine(b.hint, 100), source: b.source as 'ai' | 'rules' };
  s.entries.set(value.clientId, { value, expires: now + TTL, updated: now });
  while (s.entries.size > 8) s.entries.delete(s.entries.keys().next().value!);
  if (s.pending?.clientId === value.clientId) {
    if (!value.enabled || s.pending.key !== value.key) s.pending = null;
    else s.pending = { ...value, id: s.pending.id };
  }
  return true;
}
function latest(s: State): Entry | undefined {
  // Most recently changed context wins; a disabled/busy context must not resurrect an older one.
  return [...s.entries.values()].sort((a,b) => b.updated - a.updated)[0];
}
export function floatGuideEnabled(owner: string | null): boolean {
  return (getDb().prepare('SELECT value FROM app_settings WHERE owner_id=? AND key=?').get(ownerForWrite(owner), 'float-guide-enabled') as { value: string } | undefined)?.value !== 'false';
}
export function setFloatGuideEnabled(owner: string | null, enabled: boolean): void {
  getDb().prepare('INSERT INTO app_settings(owner_id,key,value) VALUES(?,?,?) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value')
    .run(ownerForWrite(owner), 'float-guide-enabled', String(enabled));
  if (!enabled) { const current = owners.get(ownerForWrite(owner)); if (current) current.pending = null; }
}
export function floatGuideTick(owner: string | null, eligible: boolean, now = Date.now()): FloatGuideNudge | null {
  const s = state(owner, now), entry = latest(s);
  if (entry?.value.sessionId && (!sessionExists(entry.value.sessionId) || !canAccessSession(entry.value.sessionId, owner))) { s.pending = null; return null; }
  if (!floatGuideEnabled(owner) || !entry?.value.enabled || !entry.value.label || !eligible || loadPomodoro(owner)?.phase === 'break') { s.pending = null; return null; }
  if (s.pending && (s.pending.key !== entry.value.key || s.pending.clientId !== entry.value.clientId)) s.pending = null;
  if (s.pending) return s.pending;
  if (s.nextAt > now) return null;
  s.pending = { ...entry.value, id: 'guide-' + randomUUID() };
  s.nextAt = now + 30 * 60_000;
  getDb().prepare('INSERT INTO app_settings(owner_id,key,value) VALUES(?,?,?) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value')
    .run(ownerForWrite(owner), KEY, String(s.nextAt));
  return s.pending;
}
export function dismissFloatGuide(owner: string | null, id: string, action: 'open' | 'snooze', now = Date.now()): FloatGuideNudge | null {
  const s = state(owner, now), pending = s.pending;
  const entry = latest(s);
  if (pending?.sessionId && (!sessionExists(pending.sessionId) || !canAccessSession(pending.sessionId, owner))) { s.pending = null; return null; }
  if (!pending || pending.id !== id || !floatGuideEnabled(owner) || !entry?.value.enabled || entry.value.key !== pending.key || entry.value.clientId !== pending.clientId) return null;
  s.pending = null; s.nextAt = now + (action === 'snooze' ? 10 : 30) * 60_000;
  getDb().prepare('INSERT INTO app_settings(owner_id,key,value) VALUES(?,?,?) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value')
    .run(ownerForWrite(owner), KEY, String(s.nextAt));
  return pending;
}
export function resetFloatGuide(): void { owners.clear(); }
