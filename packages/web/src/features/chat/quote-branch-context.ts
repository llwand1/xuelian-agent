import { createContext, useContext } from 'react';
import type { QuoteAnchor, QuoteBranch } from '@sb/shared';
export const QuoteBranchContext = createContext<{
  available: boolean; branches: QuoteBranch[];
  ask: (anchor: QuoteAnchor, question?: string) => Promise<void>;
  open: (id: string) => void;
}>({ available: false, branches: [], ask: async () => {}, open: () => {} });
export const useQuoteBranch = () => useContext(QuoteBranchContext);
