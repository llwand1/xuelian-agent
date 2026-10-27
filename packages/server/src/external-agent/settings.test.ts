import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_EXTERNAL_AGENT } from '@sb/shared';
import { closeDb, openIsolated, getDb } from '../storage/db.js';
vi.mock('../storage/crypto.js', () => ({ encryptSecret: (v: string) => v ? 'encrypted:' + Buffer.from(v).toString('base64') : '', decryptSecret: (v: string) => v ? Buffer.from(v.slice(10), 'base64').toString() : '' }));
import { agentBaseUrl, agentView, loadAgentConnection, resolveAgentPatch, saveAgentConnection, validateAgentPatch } from './settings.js';
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sb-external-settings-')); openIsolated(dir); });
afterEach(() => { closeDb(); rmSync(dir, { recursive: true, force: true }); });
it('defaults disabled; owner-scoped settings encrypt and never return the pairing secret', () => {
  expect(loadAgentConnection('a').enabled).toBe(false);
  saveAgentConnection({ ...DEFAULT_EXTERNAL_AGENT, enabled: true, token: 'pairing-secret' }, 'a');
  expect(loadAgentConnection('a').token).toBe('pairing-secret');
  expect(loadAgentConnection('b').token).toBe('');
  expect(loadAgentConnection(null).enabled).toBe(false);
  expect(JSON.stringify(agentView(loadAgentConnection('a')))).not.toContain('pairing-secret');
  expect(JSON.stringify(getDb().prepare('SELECT value FROM app_settings').all())).not.toContain('pairing-secret');
});
it('retains token for same endpoint only; supports explicit clearing without changing native providers', () => {
  saveAgentConnection({ ...DEFAULT_EXTERNAL_AGENT, token: 'secret' }, null);
  expect(resolveAgentPatch(DEFAULT_EXTERNAL_AGENT, null).token).toBe('secret');
  expect(resolveAgentPatch({ ...DEFAULT_EXTERNAL_AGENT, baseUrl: 'http://127.0.0.1:4013/v1' }, null).token).toBe('');
  expect(resolveAgentPatch({ ...DEFAULT_EXTERNAL_AGENT, token: '' }, null).token).toBe('');
});
it('rejects remote, rebinding, credentials, query, redirect-shaped and malformed configs', () => {
  for (const url of ['https://example.com/v1', 'http://localhost:4012/v1', 'http://127.0.0.1.example.com/v1', 'http://user:pass@127.0.0.1/v1', 'http://127.0.0.1/v1?token=a', 'http://127.0.0.1/v1/chat/completions']) expect(() => agentBaseUrl(url)).toThrow();
  expect(agentBaseUrl('http://[::1]:4012/v1/')).toBe('http://[::1]:4012/v1');
  for (const patch of [{ enabled: 'yes' }, { timeoutSeconds: 0 }, { historyMessages: 101 }, { token: 'x\r\nInjected: yes' }]) expect(() => validateAgentPatch({ ...DEFAULT_EXTERNAL_AGENT, ...patch })).toThrow();
});
