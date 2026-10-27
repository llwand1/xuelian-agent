import type { Request } from 'express';
import { DEFAULT_EXTERNAL_AGENT, type ExternalAgentPatch, type ExternalAgentSettings } from '@sb/shared';
import { getDb } from '../storage/db.js';
import { encryptSecret, decryptSecret } from '../storage/crypto.js';
import { ownerForWrite } from '../auth/ownership.js';

const KEY = 'external-agent-chat-v1';
export interface AgentConnection extends ExternalAgentSettings { token: string }
export function localAgentEnabled(): boolean {
  return (process.env.SB_DESKTOP === '1' || process.env.SB_EXTERNAL_AGENT === '1') &&
    ['127.0.0.1', '::1', 'localhost'].includes(process.env.SB_HOST ?? '127.0.0.1');
}
export function localAgentRequest(req: Request): boolean {
  return localAgentEnabled() && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
    /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.get('host') ?? '');
}
export function agentBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 500) throw new Error('请填写本地 Agent 接口地址');
  if (!/^http:\/\/(127\.0\.0\.1|\[::1\])(:\d+)?(?:\/|$)/i.test(raw)) throw new Error('请使用明确的回环 HTTP 地址（127.0.0.1 或 [::1]）');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Agent 接口地址无效'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || /%(?:2f|5c)/i.test(url.pathname)) {
    throw new Error('外置 Agent v1 仅连接明确的回环 HTTP 地址（127.0.0.1 或 [::1]），不接受凭据、查询或跳转');
  }
  if (url.pathname.endsWith('/chat/completions')) throw new Error('请填写基础地址（例如 /v1），不要包含 /chat/completions');
  return url.href.replace(/\/+$/, '');
}
export function validateAgentPatch(raw: unknown): ExternalAgentPatch {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Agent 设置必须是对象');
  const v = raw as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') throw new Error('启用状态必须是布尔值');
  const field = (key: string, max: number) => {
    const text = v[key];
    if (typeof text !== 'string' || !text.trim() || text.length > max || /[\r\n]/.test(text) || text.includes('\0')) throw new Error(`${key} 无效`);
    return text.trim();
  };
  const integer = (key: string, min: number, max: number) => {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${key} 必须为 ${min}–${max} 的整数`);
    return n;
  };
  if (v.token !== undefined && (typeof v.token !== 'string' || v.token.length > 4096 || /[\r\n]/.test(v.token) || v.token.includes('\0'))) throw new Error('配对密钥无效');
  return { enabled: v.enabled, name: field('name', 80), baseUrl: agentBaseUrl(v.baseUrl), model: field('model', 160),
    timeoutSeconds: integer('timeoutSeconds', 10, 600), historyMessages: integer('historyMessages', 1, 100),
    ...(typeof v.token === 'string' ? { token: v.token.trim() } : {}) };
}
export function loadAgentConnection(owner: string | null): AgentConnection {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE owner_id=? AND key=?').get(ownerForWrite(owner), KEY) as { value: string } | undefined;
  if (!row) return { ...DEFAULT_EXTERNAL_AGENT, token: '' };
  // A damaged enabled configuration must not silently fall back to another paid model.
  const saved = JSON.parse(row.value) as Record<string, unknown>;
  const clean = validateAgentPatch({ ...saved, token: undefined });
  const token = decryptSecret(typeof saved.token === 'string' ? saved.token : '');
  if (saved.token && !token) throw new Error('外置 Agent 配对密钥无法解密，请重新配对');
  return { ...clean, token };
}
export function resolveAgentPatch(raw: unknown, owner: string | null): AgentConnection {
  const patch = validateAgentPatch(raw), previous = loadAgentConnection(owner);
  return { ...patch, token: patch.token ?? (patch.baseUrl === previous.baseUrl ? previous.token : '') };
}
export function saveAgentConnection(raw: unknown, owner: string | null): AgentConnection {
  const config = resolveAgentPatch(raw, owner);
  getDb().prepare(`INSERT INTO app_settings(owner_id,key,value) VALUES(?,?,?)
    ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value`).run(ownerForWrite(owner), KEY, JSON.stringify({ ...config, token: encryptSecret(config.token) }));
  return config;
}
export function agentView(connection: AgentConnection) {
  const { token, ...settings } = connection;
  return { settings, tokenConfigured: !!token };
}
