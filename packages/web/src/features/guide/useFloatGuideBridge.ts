import { useEffect, useRef } from 'react';
import type { FloatGuideSnapshot } from '@sb/shared';
import { hasHost } from '../float/float-view';
import { floatGuideApi } from './float-guide-api';
/** Reuse the SAME visible guide recommendation, not another prompt or a second action engine. */
export function useFloatGuideBridge(snapshot: Omit<FloatGuideSnapshot,'clientId'|'revision'>) {
  const clientId = useRef(crypto.randomUUID()), revision = useRef(0), current = useRef(snapshot); current.current = snapshot;
  useEffect(() => {
    if (!hasHost()) return;
    const send = () => {
      const paused = document.documentElement.dataset.float && document.documentElement.dataset.float !== 'screen';
      if (paused) return;
      void floatGuideApi.publish({ ...current.current, clientId: clientId.current, revision: ++revision.current }).catch(() => undefined);
    };
    send(); const timer = window.setInterval(send, 30_000); return () => window.clearInterval(timer);
  }, [snapshot.key, snapshot.enabled, snapshot.headline, snapshot.label, snapshot.hint, snapshot.source]);
  useEffect(() => () => {
    if (hasHost()) void floatGuideApi.publish({ ...current.current, enabled: false, clientId: clientId.current, revision: ++revision.current }).catch(() => undefined);
  }, []);
}
