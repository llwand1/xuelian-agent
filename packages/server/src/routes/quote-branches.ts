import { Router } from 'express';
import type { Response } from 'express';
import type { QuoteAnchor, QuoteBranchEvent } from '@sb/shared';
import { ownerIdOf } from '../auth/ownership.js';
import { asyncHandler } from '../http/async-handler.js';
import { createQuoteBranch, listQuoteBranches, QuoteBranchError } from '../chat/quote-branch-store.js';
import { beginQuoteReply, quoteBranchDetail, stopQuoteBranch } from '../chat/quote-branch-reply.js';

export const quoteBranchesRouter = Router();
function failure(res: Response, err: unknown) {
  if (err instanceof QuoteBranchError) { res.status(err.status).json({ error: err.message }); return; }
  throw err;
}
quoteBranchesRouter.get('/', (req, res) => {
  try { res.json(listQuoteBranches(typeof req.query.sessionId === 'string' ? req.query.sessionId : '', ownerIdOf(req))); }
  catch (err) { failure(res, err); }
});
quoteBranchesRouter.post('/', (req, res) => {
  try {
    const { sessionId, anchor } = req.body as { sessionId?: unknown; anchor?: QuoteAnchor };
    if (typeof sessionId !== 'string' || !anchor || typeof anchor !== 'object') throw new QuoteBranchError(400, 'sessionId 与 anchor 必填');
    res.status(201).json(createQuoteBranch(sessionId, anchor, ownerIdOf(req)));
  } catch (err) { failure(res, err); }
});
quoteBranchesRouter.get('/:id', (req, res) => {
  try { res.json(quoteBranchDetail(req.params.id!, ownerIdOf(req))); } catch (err) { failure(res, err); }
});
quoteBranchesRouter.post('/:id/abort', (req, res) => {
  try { stopQuoteBranch(req.params.id!, ownerIdOf(req)); res.json({ ok: true }); } catch (err) { failure(res, err); }
});
quoteBranchesRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  let job;
  try { job = beginQuoteReply(req.params.id!, req.body.text as string, ownerIdOf(req)); }
  catch (err) { failure(res, err); return; }
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders();
  const send = (event: QuoteBranchEvent) => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(event) + '\n'); };
  send({ type: 'snapshot', detail: job.initial });
  // Closing the popup/transport does not destroy the branch or its in-flight answer.
  const detail = await job.run(content => send({ type: 'token', content }));
  send({ type: 'done', detail }); res.end();
}));
