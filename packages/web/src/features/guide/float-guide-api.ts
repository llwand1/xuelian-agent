import type { FloatGuideSnapshot, FloatGuideNudge } from '@sb/shared';
import { request } from '../../lib/api-request';
export const FLOAT_GUIDE_OPEN = 'sb:float-guide-open';
export const floatGuideApi = {
  settings: () => request<{ enabled: boolean }>('/api/desktop/guide/settings'),
  configure: (enabled: boolean) => request<{ enabled: boolean }>('/api/desktop/guide/settings', { method: 'PUT', body: JSON.stringify({ enabled }) }),
  publish: (snapshot: FloatGuideSnapshot) => request('/api/desktop/guide', { method: 'PUT', body: JSON.stringify(snapshot) }),
  tick: (eligible: boolean) => request<{ guide: FloatGuideNudge | null }>('/api/desktop/guide/tick', { method: 'POST', body: JSON.stringify({ eligible }) }),
  dismiss: (id: string, action: 'open' | 'snooze') => request<{ guide: FloatGuideNudge | null }>('/api/desktop/guide/dismiss', { method: 'POST', body: JSON.stringify({ id, action }) }),
};
