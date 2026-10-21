import { getDb } from '../storage/db.js';
import { ownerForWrite } from '../auth/ownership.js';
import { publishEvent, type DomainEvent } from '../events/bus.js';
import { recordLearningEvent, toLearningEvents } from './learning-events.js';
/** Gate the whole synchronous publication, not only its event-ledger subscriber (also prevents duplicate XP). */
export function reportAnswerOnce(event: Extract<DomainEvent, { type: 'quiz_answered' }>): boolean {
  return getDb().transaction(() => {
    if (event.attemptKey && getDb().prepare(`SELECT 1 FROM learning_event WHERE owner_id=? AND kind='quiz.answered'
      AND json_valid(payload) AND json_extract(payload,'$.attemptKey')=?`).get(ownerForWrite(event.ownerId), event.attemptKey)) return false;
    // Persist the claim before other subscribers; unique index ignores the ledger's subsequent echo.
    if (event.attemptKey) recordLearningEvent(toLearningEvents(event)[0]!);
    publishEvent(event);
    return true;
  })();
}
