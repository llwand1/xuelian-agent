import type { ExternalAgentPatch, ExternalAgentProbe, ExternalAgentView } from '@sb/shared';
import { request } from '../../lib/api-request';
const base = '/api/settings/external-agent';
export const externalAgentApi = {
  get: () => request<ExternalAgentView>(base),
  save: (value: ExternalAgentPatch) => request<ExternalAgentView>(base, { method: 'PUT', body: JSON.stringify(value) }),
  probe: (value: ExternalAgentPatch) => request<ExternalAgentProbe>(base + '/probe', { method: 'POST', body: JSON.stringify(value), timeoutMs: 25000 }),
};
