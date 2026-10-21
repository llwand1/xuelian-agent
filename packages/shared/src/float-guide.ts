import type { GuideView } from './guide-models.js';
export interface FloatGuideSnapshot {
  clientId: string; revision: number; key: string; sessionId: string | null; view: GuideView;
  enabled: boolean; headline: string; label: string; hint: string; source: 'ai' | 'rules';
}
export interface FloatGuideNudge extends FloatGuideSnapshot { id: string }
