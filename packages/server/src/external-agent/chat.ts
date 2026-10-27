import type { ChatOptions, ChatResult } from '../chat/options.js';
import { localAgentEnabled, loadAgentConnection } from './settings.js';
import type { AgentConnection } from './settings.js';
import { streamAgent, type AgentMessage } from './transport.js';
import { publish, startNewRound } from '../chat/sse-bus.js';
import { insertAssistantMessage, insertUserMessage, loadHistory, touchSessionTitle } from '../chat/persist.js';
import { estimateTokens } from '../chat/context.js';
import { publishEvent } from '../events/bus.js';
import { patchDesktopRun } from '../desktop/task-store.js';
import { contentToText } from '../llm/types.js';
import { getDb } from '../storage/db.js';
import { loadAnswerStyle } from '../storage/answer-style.js';
import { withDesktopChatRun } from '../desktop/chat-integration.js';

export function withConfiguredChatRun(opts: ChatOptions, native: (opts: ChatOptions) => Promise<ChatResult>): Promise<ChatResult> {
  return withDesktopChatRun(opts, input => routeExternalAgentTurn(input, native));
}

export async function routeExternalAgentTurn(opts: ChatOptions, native: (opts: ChatOptions) => Promise<ChatResult>): Promise<ChatResult> {
  if (!localAgentEnabled()) return native(opts);
  try {
    const config = loadAgentConnection(opts.ownerId ?? null);
    return config.enabled ? await runExternalTurn(opts, config) : native(opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : '外置 Agent 配置读取失败';
    startNewRound(opts.sessionId);
    publish(opts.sessionId, { type: 'chat-error', sessionId: opts.sessionId, message });
    publish(opts.sessionId, { type: 'done', sessionId: opts.sessionId });
    return { ok: false, error: message };
  }
}
export function agentHistory(sessionId: string, config: AgentConnection, owner: string | null): AgentMessage[] {
  const history = loadHistory(sessionId).filter(m => (m.role === 'user' || m.role === 'assistant') && !m.toolCalls?.length)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: contentToText(m.content) })).slice(-config.historyMessages);
  let size = 0;
  const kept: AgentMessage[] = [];
  for (const message of history.reverse()) {
    if (message.content.length > 120_000 || size + message.content.length > 120_000) {
      if (!kept.length) throw new Error('当前消息超过外置 Agent 的 120000 字符上下文上限，请缩短后再发');
      break;
    }
    kept.unshift(message); size += message.content.length;
  }
  while (kept.length > 1 && kept[0]?.role === 'assistant') kept.shift();
  return [{ role: 'system', content: `你是 StudentBuddy 的外置学习助手。请用中文直接回答当前用户，必要时用 Markdown。
你收到的是当前会话最近的文字消息，不是整个数据库或 ChatGPT 原有记忆。你没有 StudentBuddy 工具权限，不能声称已执行出题、保存词条或修改学习记录。需要这些操作时说明当前接口仅支持文字。
用户回答风格偏好：${JSON.stringify(loadAnswerStyle(owner))}` }, ...kept];
}
async function runExternalTurn(opts: ChatOptions, config: AgentConnection): Promise<ChatResult> {
  const { sessionId } = opts;
  startNewRound(sessionId);
  publish(sessionId, { type: 'round-start', sessionId, startedAt: Date.now() });
  let answer = '';
  try {
    opts.signal?.throwIfAborted();
    if (opts.images?.length) throw new Error('外置 Agent v1 暂只接文字；请移除图片或在设置关闭外置 Agent 后使用视觉模型');
    if (opts.grillMe) throw new Error('外置 Agent v1 不接管 StudentBuddy 的 GrillMe 工具，请关闭该开关，或关闭外置 Agent 使用原模式');
    if (!opts.skipUserPersist) insertUserMessage(sessionId, opts.text, []);
    touchSessionTitle(sessionId, opts.text);
    const messages = agentHistory(sessionId, config, opts.ownerId ?? null);
    if (opts.desktopTaskId) patchDesktopRun(opts.desktopTaskId, opts.ownerId ?? null, { model: `external:${config.name}/${config.model}` });
    publish(sessionId, { type: 'step', sessionId, tool: 'external_agent', status: 'running', detail: `${config.name} · ${config.model}（外置文字对话，不使用 StudentBuddy 联网/文件工具）` });
    for await (const text of streamAgent(config, messages, opts.signal)) {
      opts.signal?.throwIfAborted();
      answer += text;
      publish(sessionId, { type: 'token', sessionId, content: text });
    }
    opts.signal?.throwIfAborted();
    const assistantMessageId = insertAssistantMessage({ sessionId, content: answer, tokens: estimateTokens(answer) });
    getDb().prepare(`UPDATE sessions SET updated_at=datetime('now') WHERE id=?`).run(sessionId);
    publishEvent({ type: 'chat_done', sessionId, ownerId: opts.ownerId ?? null });
    publish(sessionId, { type: 'step', sessionId, tool: 'external_agent', status: 'done', detail: config.name });
    publish(sessionId, { type: 'done', sessionId, messageId: assistantMessageId });
    return { ok: true, assistantMessageId };
  } catch (error) {
    const message = opts.signal?.aborted ? '已停止' : error instanceof Error ? error.message : 'Agent 连接失败';
    if (answer) {
      const suffix = `\n\n（${opts.signal?.aborted ? '已停止' : '生成中断'}）`;
      answer += suffix;
      publish(sessionId, { type: 'token', sessionId, content: suffix });
      insertAssistantMessage({ sessionId, content: answer, tokens: estimateTokens(answer) });
    }
    publish(sessionId, { type: 'step', sessionId, tool: 'external_agent', status: 'error', detail: message });
    publish(sessionId, { type: 'chat-error', sessionId, message: `外置 Agent：${message}。没有自动切换其他模型。` });
    publish(sessionId, { type: 'done', sessionId });
    return { ok: false, error: message };
  }
}
