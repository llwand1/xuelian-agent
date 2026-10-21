import type { DrillCard } from '@sb/shared';
import { aiOpsApi } from '../../lib/api-ai-ops';
import { STUDY_TASK_UPDATED } from '../pomodoro/daily-task-api';
/** A retry reuses the attempt key. Rendering mode is deliberately not part of its identity. */
export async function reportDrillAnswer(key: string, card: DrillCard, correct: boolean): Promise<void> {
  const item = { attemptKey: key, correct, termId: card.termId,
    qtype: card.kind === 'judge' ? 'judge' as const : card.kind === 'spell' ? 'fill' as const : 'choice' as const,
    source: 'wait-drill' as const };
  try { await aiOpsApi.answers([item]); }
  catch { await aiOpsApi.answers([item]); }
  window.dispatchEvent(new Event(STUDY_TASK_UPDATED));
}
