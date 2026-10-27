/** Strict OpenAI-compatible text transport. No retries, redirects, tools or hidden fallback. */
import type { ExternalAgentProbe } from '@sb/shared';
import type { AgentConnection } from './settings.js';
import { agentBaseUrl } from './settings.js';

export interface AgentMessage { role: 'system' | 'user' | 'assistant'; content: string }
const MAX_RESPONSE = 2 * 1024 * 1024;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function headers(config: AgentConnection) {
  return { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) };
}
async function limitedText(response: Response, limit = MAX_RESPONSE): Promise<string> {
  if (!response.body) throw new Error('Agent 未返回响应体');
  let size = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for await (const bytes of response.body) {
      size += bytes.length;
      if (size > limit) throw new Error('Agent 响应超过大小上限');
      text += decoder.decode(bytes, { stream: true });
    }
    return text + decoder.decode();
  } finally { if (!response.body.locked) await response.body.cancel().catch(() => undefined); }
}
function httpError(status: number): Error {
  return new Error(status === 401 || status === 403 ? 'Agent 拒绝认证，请检查配对密钥或外置 Agent 登录状态' : `Agent 接口返回 HTTP ${status}，本轮没有自动重试或切换模型`);
}
/** Translate only known bridge categories. Never echo arbitrary provider diagnostics, headers or keys. */
function knownAgentError(value: unknown): Error | null {
  const message = object(value).message;
  if (typeof message !== 'string') return null;
  if (message.startsWith('Qoder authentication required;')) return new Error('Qoder CLI 尚未登录或认证已失效，请运行 qodercn login（国内版）或 qoder login；桌面登录不会自动代替 CLI 登录');
  if (message.startsWith('Qoder provider quota exhausted;')) return new Error('Qoder 当前模型额度不足，请在 Qoder 选择可用模型；本轮没有自动重试');
  if (message.startsWith('OpenCode provider quota exhausted;')) return new Error('OpenCode 当前模型额度已用尽；已停止自动重试，请在 OpenCode 选择可用模型');
  if (message.startsWith('OpenCode provider requested a retry;')) return new Error('OpenCode 上游暂不可用或受限；已停止自动重试，请检查该模型状态');
  if (/^OpenCode \w+ HTTP (401|403); check the selected provider/.test(message)) return new Error('OpenCode 模型认证失败，请在 OpenCode 重新登录对应服务商');
  if (message === 'Agent request cancelled or timed out') return new Error('外置 Agent 已取消或超时，请检查 Agent 状态或调整最长等待时间');
  return null;
}
export async function probeAgent(config: AgentConnection): Promise<ExternalAgentProbe> {
  const response = await fetch(agentBaseUrl(config.baseUrl) + '/models', { headers: headers(config), redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) { await response.body?.cancel(); throw httpError(response.status); }
  const body = object(JSON.parse(await limitedText(response, 256 * 1024)));
  if (!Array.isArray(body.data)) throw new Error('Agent 必须提供 OpenAI 兼容的 GET /models 接口');
  const models = body.data.map(v => object(v).id).filter((v): v is string => typeof v === 'string').slice(0, 200);
  if (!models.length) throw new Error('Agent 没有可用模型，请检查登录或配置');
  return { ok: true, models, message: '连接与模型列表检查成功；实际生成权限以对话结果为准。' };
}
export async function* streamAgent(config: AgentConnection, messages: AgentMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const controller = new AbortController();
  const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeoutSeconds * 1000), ...(signal ? [signal] : [])]);
  let response: Response | undefined;
  try {
    response = await fetch(agentBaseUrl(config.baseUrl) + '/chat/completions', {
      method: 'POST', headers: headers(config), redirect: 'error', signal: combined,
      body: JSON.stringify({ model: config.model, messages, stream: true }),
    });
    if (!response.ok) {
      let known: Error | null = null;
      try { known = knownAgentError(object(JSON.parse(await limitedText(response, 8192))).error); } catch { /* Unknown diagnostics remain private. */ }
      throw known ?? httpError(response.status);
    }
    if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const body = object(JSON.parse(await limitedText(response)));
      if (body.error) throw knownAgentError(body.error) ?? new Error('Agent 返回错误，请检查桥接器状态');
      const choice = object(Array.isArray(body.choices) ? body.choices[0] : null), message = object(choice.message);
      if (choice.finish_reason && choice.finish_reason !== 'stop') throw new Error('Agent 回答未正常完成');
      if (message.tool_calls || typeof message.content !== 'string' || !message.content.trim()) throw new Error('Agent 没有返回可显示的文字回答（此入口不执行工具调用）');
      yield message.content;
      return;
    }
    if (!response.body) throw new Error('Agent 返回空流');
    const decoder = new TextDecoder();
    let buffer = '', size = 0, completed = false, hasText = false;
    const frame = (raw: string): { text?: string; done?: boolean } => {
      const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) return {};
      if (data.trim() === '[DONE]') return { done: true };
      const event = object(JSON.parse(data));
      if (event.error) throw knownAgentError(event.error) ?? new Error('Agent 在生成过程中报告错误，请检查桥接器状态');
      const choice = object(Array.isArray(event.choices) ? event.choices[0] : null), delta = object(choice.delta);
      if (delta.tool_calls || choice.finish_reason === 'tool_calls') throw new Error('外置 Agent 返回了未执行的工具调用，此入口仅接收最终文字');
      if (choice.finish_reason && choice.finish_reason !== 'stop') throw new Error(`Agent 未正常完成回答（${String(choice.finish_reason).slice(0, 40)}）`);
      return { ...(typeof delta.content === 'string' ? { text: delta.content } : {}), ...(choice.finish_reason === 'stop' ? { done: true } : {}) };
    };
    for await (const bytes of response.body) {
      size += bytes.length;
      if (size > MAX_RESPONSE) throw new Error('Agent 响应超过 2MB 上限');
      buffer += decoder.decode(bytes, { stream: true }).replace(/\r/g, '');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const result = frame(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
        if (result.text) { hasText = true; yield result.text; }
        if (result.done) completed = true;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const result = frame(buffer);
      if (result.text) { hasText = true; yield result.text; }
      if (result.done) completed = true;
    }
    if (!completed) throw new Error('Agent 连接在完成标记前断开，回答不完整');
    if (!hasText) throw new Error('Agent 返回空回答');
  } finally {
    controller.abort();
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
  }
}
