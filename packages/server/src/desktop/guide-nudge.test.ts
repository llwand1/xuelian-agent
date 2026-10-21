import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FloatGuideSnapshot } from '@sb/shared';
import { openIsolated, closeDb } from '../storage/db.js';
import { publishFloatGuide, floatGuideTick, dismissFloatGuide, resetFloatGuide, setFloatGuideEnabled } from './guide-nudge.js';
let dir: string;
const now = Date.parse('2026-10-21T02:00:00Z');
const snap = (extra: Partial<FloatGuideSnapshot> = {}): FloatGuideSnapshot => ({ clientId: 'main', revision: 1, key: 'chatted:quiz.start', sessionId: null, view: 'chat', enabled: true, headline: '刚学完，来检验一下？', label: '来一套题', hint: '用刚才的知识练习', source: 'ai', ...extra });
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-float-guide-')); openIsolated(dir); resetFloatGuide(); });
afterEach(() => { closeDb(); fs.rmSync(dir, { recursive: true, force: true }); });
it('reuses the real guide snapshot, waits a minute, keeps owners isolated, and snoozes with a new invitation identity', () => {
  expect(publishFloatGuide('a', snap(), now)).toBe(true);
  expect(floatGuideTick('a', true, now)).toBeNull(); expect(floatGuideTick('b', true, now+61_000)).toBeNull();
  const nudge = floatGuideTick('a', true, now+61_000)!;
  expect(nudge).toMatchObject({ source: 'ai', label: '来一套题' });
  expect(dismissFloatGuide('b', nudge.id, 'open', now+62_000)).toBeNull();
  expect(dismissFloatGuide('a', 'stale', 'open', now+62_000)).toBeNull();
  expect(dismissFloatGuide('a', nudge.id, 'snooze', now+62_000)?.id).toBe(nudge.id);
  publishFloatGuide('a', snap({ revision: 2 }), now+600_000);
  expect(floatGuideTick('a', true, now+650_000)).toBeNull();
  const next = floatGuideTick('a', true, now+663_000)!; expect(next.id).not.toBe(nudge.id);
});
it('busy/quiet contexts and stale actions cannot resurrect an old suggestion; out-of-order heartbeats are ignored', () => {
  publishFloatGuide('a', snap(), now); const old = floatGuideTick('a', true, now+61_000)!;
  publishFloatGuide('a', snap({ revision: 3, enabled: false }), now+62_000);
  publishFloatGuide('a', snap({ revision: 2, enabled: true }), now+63_000);
  expect(floatGuideTick('a', true, now+64_000)).toBeNull(); expect(dismissFloatGuide('a', old.id, 'open', now+64_000)).toBeNull();
  expect(publishFloatGuide('a', snap({ sessionId: 'nonexistent' }), now)).toBe(false);
});
it('global floating reminder preference is owner-scoped, expiry and ineligible activity suppress the balloon', () => {
  publishFloatGuide('a', snap(), now); setFloatGuideEnabled('a', false);
  expect(floatGuideTick('a', true, now+61_000)).toBeNull();
  setFloatGuideEnabled('a', true); expect(floatGuideTick('a', false, now+61_000)).toBeNull();
  expect(floatGuideTick('a', true, now+61_000)).not.toBeNull();
  expect(floatGuideTick('a', true, now+181_000)).toBeNull();
});
