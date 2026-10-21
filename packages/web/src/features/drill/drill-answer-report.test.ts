// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { buildDrillCard } from '@sb/shared';
const answer = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api-ai-ops', () => ({ aiOpsApi: { answers: answer } }));
import { reportDrillAnswer } from './drill-answer-report';
it('retries a failed report with the SAME attempt key, maps judge correctly, signals task refresh', async () => {
  answer.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ accepted: 1 });
  const event = vi.fn(); window.addEventListener('sb:study-task-updated', event);
  const t = { id: 't1', term: '幂等', definition: '同一操作重试不重复产生效果', domain: 'general' };
  await reportDrillAnswer('drill:abc:3', buildDrillCard('judge', t, [t], 'library', 'seed'), false);
  expect(answer).toHaveBeenCalledTimes(2); expect(answer.mock.calls[0]).toEqual(answer.mock.calls[1]);
  expect(answer.mock.calls[0]![0][0]).toMatchObject({ attemptKey: 'drill:abc:3', correct: false, qtype: 'judge', source: 'wait-drill' });
  expect(event).toHaveBeenCalledTimes(1); window.removeEventListener('sb:study-task-updated', event);
});
