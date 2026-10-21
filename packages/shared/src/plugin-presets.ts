import { parsePluginManifest, type PluginManifest } from './plugin-ecosystem.js';
/** Fixed official endpoint; discovery still determines actual tool availability. */
export const TINYFISH_PLUGIN: PluginManifest = parsePluginManifest({
  schemaVersion: 2, id: 'tinyfish', name: 'TinyFish', version: '1.0.0',
  description: '联网搜索、提取页面与异步网页自动化；自动化可能消耗 TinyFish 额度，每次调用均确认。',
  publisher: { name: 'TinyFish', url: 'https://github.com/tinyfish-io/tinyfish-mcp-server' },
  kind: 'service', network: 'public', auth: 'x-api-key', transport: 'streamable-http',
  endpoint: 'https://agent.tinyfish.ai/mcp',
  tools: ['search','fetch_content','run_web_automation_async','get_run','cancel_run'],
  permissions: { search:'web:read', fetch_content:'web:read', run_web_automation_async:'web:automate', get_run:'web:read', cancel_run:'web:automate' },
});
export function localAgentManifest(endpoint: string, name = '本地 Agent'): PluginManifest {
  return parsePluginManifest({
    schemaVersion: 2, id: 'local-agent', name, version: '1.0.0',
    description: '连接本机 Agent，双向共享指定资料、委派任务并查询结果；不自动读取词库或会话。',
    publisher: { name: 'StudentBuddy Bridge', url: 'https://github.com/llwand1/xuelian-agent' },
    kind: 'agent', network: 'loopback', auth: 'bearer', transport: 'streamable-http', endpoint,
    tools: ['agent_status','share_context','list_context','delegate_task','get_task'],
    permissions: { agent_status:'tasks:read', share_context:'context:write', list_context:'context:read', delegate_task:'tasks:delegate', get_task:'tasks:read' },
  });
}
