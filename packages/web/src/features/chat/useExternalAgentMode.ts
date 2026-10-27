import { useEffect, useState } from 'react';
import { externalAgentApi } from '../settings/external-agent-api';

/** Keep the normal composer truthful when an external text-only backend is selected. */
export function useExternalAgentMode(setOnline: (value: boolean) => void): string {
  const [name, setName] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => { void externalAgentApi.get().then(view => {
      if (!active) return;
      const enabled = view.supported && view.settings.enabled;
      setName(enabled ? view.settings.name : '');
      if (enabled) setOnline(false);
    }).catch(() => { /* Actual send path reports configuration errors; don't block ordinary chat. */ }); };
    load(); window.addEventListener('sb:external-agent-changed', load);
    return () => { active = false; window.removeEventListener('sb:external-agent-changed', load); };
  }, [setOnline]);
  return name;
}
