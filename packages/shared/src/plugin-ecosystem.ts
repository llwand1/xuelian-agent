/** Declarative remote plugins; no executable code or credentials in manifests. */
export interface PluginManifest {
  schemaVersion: 1 | 2;
  id: string;
  name: string;
  version: string;
  description: string;
  transport: 'streamable-http' | 'builtin';
  endpoint: string;
  tools: string[];
  /** v2 is the published integration contract; v1 remains import-compatible. */
  publisher?: { name: string; url: string };
  kind?: 'service' | 'agent';
  network?: 'public' | 'loopback';
  auth?: 'none' | 'bearer' | 'x-api-key';
  permissions?: Record<string, PluginCapability>;
}
export type PluginCapability = 'web:read' | 'web:automate' | 'context:read' | 'context:write' | 'tasks:delegate' | 'tasks:read';
export const PLUGIN_CAPABILITIES: Record<PluginCapability, string> = {
  'web:read': '联网检索与读取页面', 'web:automate': '远端浏览器操作（可能产生费用或写入）',
  'context:read': '读取明确共享的资料', 'context:write': '向 Agent 共享指定资料',
  'tasks:delegate': '向 Agent 委派任务', 'tasks:read': '读取 Agent 状态与任务结果',
};
/** Shared endpoint validation, also enforced immediately before network IO. */
export function pluginEndpoint(endpoint: string, network: 'public' | 'loopback' = 'public'): URL {
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash) throw new Error('插件端点不能含账号、查询参数或片段');
  if (network === 'loopback') {
    if (!/^http:\/\/(127\.0\.0\.1|\[::1\]):[0-9]{2,5}\//u.test(endpoint) ||
        !['127.0.0.1','[::1]'].includes(url.hostname) || Number(url.port) < 1024 || Number(url.port) > 65535) {
      throw new Error('本地 Agent 端点必须是 http://127.0.0.1:端口/路径 或 http://[::1]:端口/路径（端口 1024–65535）');
    }
  } else if (url.protocol !== 'https:' || !url.hostname.includes('.') || /^[\d.[\]:]+$/u.test(url.hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/iu.test(url.hostname)) throw new Error('端点必须是公网 HTTPS 域名');
  return url;
}
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface PluginView {
  authMode?: 'token' | 'browser';
  manifest: PluginManifest;
  builtin: boolean;
  policy: 'github_read_only' | 'bilibili_public_learning' | 'confirm_each_call';
  enabled: boolean;
  hasToken: boolean;
  repositories: string[];
  tools: PluginTool[];
  testedAt: number | null;
  error: string;
}
export interface GithubLoginState { status: 'disconnected' | 'authorizing' | 'connected' | 'error'; id: string; login: string; error: string }
export interface PluginCallLog {
  id: number; pluginId: string; tool: string;
  status: 'done' | 'error' | 'denied' | 'cancelled';
  durationMs: number; error: string; createdAt: number;
}
export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 JSON 对象');
  return value as Record<string, unknown>;
}
export function parsePluginManifest(raw: unknown): PluginManifest {
  const x = objectValue(raw);
  const permitted = ['schemaVersion','id','name','version','description','transport','endpoint','tools',...(x.schemaVersion === 2 ? ['publisher','kind','network','auth','permissions'] : [])];
  if (Object.keys(x).some(k => !permitted.includes(k))) throw new Error('插件声明含不支持的字段（不允许脚本、密钥或自定义请求头）');
  if (![1,2].includes(Number(x.schemaVersion)) || typeof x.schemaVersion !== 'number' || x.transport !== 'streamable-http') throw new Error('仅支持 schemaVersion=1/2 的 Streamable HTTP 插件');
  const str = (key: string, limit: number) => {
    const v = x[key];
    if (typeof v !== 'string' || !v.trim() || v.length > limit || [...v].some(c => c.charCodeAt(0) < 32)) throw new Error(`插件 ${key} 无效`);
    return v.trim();
  };
  const id = str('id', 48);
  if (!/^[a-z][a-z0-9-]{1,47}$/u.test(id)) throw new Error('插件 id 只能使用小写字母、数字和短横线（2–48 字符）');
  const endpoint = str('endpoint', 1000);
  const url = pluginEndpoint(endpoint, x.schemaVersion === 2 && x.network === 'loopback' ? 'loopback' : 'public');
  if (!Array.isArray(x.tools) || !x.tools.length || x.tools.length > 32 ||
      x.tools.some(t => typeof t !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/u.test(t))) throw new Error('必须声明 1–32 个合法工具名');
  const result: PluginManifest = { schemaVersion: x.schemaVersion as 1 | 2, id, name: str('name', 64), version: str('version', 32),
    description: str('description', 500), transport: 'streamable-http', endpoint: url.href,
    tools: [...new Set(x.tools as string[])] };
  if (x.schemaVersion === 2) {
    if (result.tools.length !== x.tools.length) throw new Error('v2 工具白名单不能重复');
    if (!/^\d+\.\d+\.\d+$/u.test(result.version)) throw new Error('v2 插件 version 必须为 X.Y.Z');
    const publisher = objectValue(x.publisher);
    if (Object.keys(publisher).some(k => !['name','url'].includes(k)) || typeof publisher.name !== 'string' ||
        !publisher.name.trim() || publisher.name.length > 80 || [...publisher.name].some(c=>c.charCodeAt(0)<32) || typeof publisher.url !== 'string' || publisher.url.length > 1000) throw new Error('请声明插件发布者及 HTTPS 主页');
    const home = pluginEndpoint(publisher.url);
    if (!['service','agent'].includes(String(x.kind)) || !['public','loopback'].includes(String(x.network)) ||
        !['none','bearer','x-api-key'].includes(String(x.auth))) throw new Error('请声明插件 kind、network、auth');
    if (x.network === 'loopback' && (x.kind !== 'agent' || x.auth !== 'bearer')) throw new Error('本地桥接仅支持需要 Bearer 密钥的 Agent 插件');
    const permissions = objectValue(x.permissions);
    if (Object.keys(permissions).length !== result.tools.length || result.tools.some(t => !Object.hasOwn(permissions,t)) ||
        Object.values(permissions).some(v => typeof v !== 'string' || !Object.hasOwn(PLUGIN_CAPABILITIES,v))) throw new Error('每个工具必须且只能声明一个受支持的权限');
    result.publisher = { name: publisher.name.trim(), url: home.href };
    result.kind = x.kind as 'service' | 'agent'; result.network = x.network as 'public' | 'loopback';
    result.auth = x.auth as 'none' | 'bearer' | 'x-api-key'; result.permissions = permissions as Record<string, PluginCapability>;
  }
  return result;
}
export function parsePluginRepositories(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > 50 || raw.some(v => typeof v !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/([a-zA-Z0-9_.-]{1,100})$/u.test(v) || /\/\.{1,2}$/u.test(v))) {
    throw new Error('仓库填写 owner/repo，每次最多 50 个');
  }
  return [...new Set((raw as string[]).map(v => v.toLowerCase()))];
}

