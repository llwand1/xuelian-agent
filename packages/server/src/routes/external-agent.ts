import { Router } from 'express';
import { asyncHandler } from '../http/async-handler.js';
import { ownerIdOf } from '../auth/ownership.js';
import { agentView, localAgentRequest, loadAgentConnection, resolveAgentPatch, saveAgentConnection } from '../external-agent/settings.js';
import { probeAgent } from '../external-agent/transport.js';
import { DEFAULT_EXTERNAL_AGENT } from '@sb/shared';

export const externalAgentRouter = Router();
externalAgentRouter.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!localAgentRequest(req)) { res.json({ supported: false, settings: DEFAULT_EXTERNAL_AGENT, tokenConfigured: false }); return; }
  try { res.json({ supported: true, ...agentView(loadAgentConnection(ownerIdOf(req))) }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '配置读取失败' }); }
});
externalAgentRouter.use((req, res, next) => {
  if (!localAgentRequest(req)) { res.status(403).json({ error: '外置 Agent 仅支持本机安装版或显式启用的回环开发服务' }); return; }
  res.setHeader('Cache-Control', 'no-store'); next();
});
externalAgentRouter.put('/', (req, res) => {
  try { res.json({ supported: true, ...agentView(saveAgentConnection(req.body, ownerIdOf(req))) }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '设置无效' }); }
});
externalAgentRouter.post('/probe', asyncHandler(async (req, res) => {
  try { res.json(await probeAgent(resolveAgentPatch(req.body, ownerIdOf(req)))); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '连接失败' }); }
}));
