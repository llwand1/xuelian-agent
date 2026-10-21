import { useEffect } from 'react';
import { PK_HASH } from './nav';
const CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
/** A deliberate easter egg, never a navigation item or a proactive recommendation. */
export function useDuelEgg() {
  useEffect(() => {
    let at = 0;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable],canvas,[role="dialog"]'))) { at = 0; return; }
      const value = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      at = value === CODE[at] ? at + 1 : value === CODE[0] ? 1 : 0;
      if (at === CODE.length) { at = 0; window.location.hash = PK_HASH; }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
}
