import { DEFAULT_COMBAT, parseCombatSettings, type CombatSettings } from '@sb/open-engine/mining';
export function loadCombatPrefs(key: string): CombatSettings {
  try { return parseCombatSettings(JSON.parse(localStorage.getItem(key + ':combat:v1') ?? 'null')) ?? { ...DEFAULT_COMBAT, sequence: [...DEFAULT_COMBAT.sequence] }; }
  catch { return { ...DEFAULT_COMBAT, sequence: [...DEFAULT_COMBAT.sequence] }; }
}
export function saveCombatPrefs(key: string, settings: CombatSettings): void {
  localStorage.setItem(key + ':combat:v1', JSON.stringify(settings));
}
