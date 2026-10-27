/** Page-wide LRU of running cards. Eviction destroys the frame; no code/state is persisted here. */
export const MAX_HTML_RUNS = 2;
const active = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of [...listeners]) listener(); };
export const isHtmlRunning = (id: string) => active.has(id);
export function subscribeHtmlRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function startHtmlRun(id: string): void {
  active.delete(id);
  active.add(id);
  while (active.size > MAX_HTML_RUNS) active.delete(active.values().next().value!);
  notify();
}
export function stopHtmlRun(id: string): void {
  if (active.delete(id)) notify();
}
