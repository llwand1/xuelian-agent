/** Hidden conversations belong to a saved answer, not to the main sessions/messages stream. */
export interface QuoteAnchor {
  messageId: string;
  quote: string;
  start: number;
  end: number;
  prefix: string;
  suffix: string;
}
export interface QuoteBranch extends QuoteAnchor {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}
export interface QuoteBranchMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'complete' | 'stopped' | 'error';
  error?: string;
  createdAt: string;
}
export interface QuoteBranchDetail {
  branch: QuoteBranch;
  messages: QuoteBranchMessage[];
  busy: boolean;
}
export type QuoteBranchEvent =
  | { type: 'snapshot'; detail: QuoteBranchDetail }
  | { type: 'token'; content: string }
  | { type: 'done'; detail: QuoteBranchDetail };
export const QUOTE_BRANCH_MAX = 1200;
export const QUOTE_QUESTION_MAX = 4000;
