export type MiningInput = 'left' | 'right' | 'jump' | 'down' | 'mine';
export type CombatAction = 'attack' | 'defend';
export interface CombatSettings { spawnSeconds: number; roundSeconds: number; attackSeconds: number; sequence: CombatAction[] }
export interface CombatState {
  hp: number; guard: number; index: number; pending: CombatAction | null; cooldown: number; paused: boolean; action: CombatAction;
  monster: { kind: string; hp: number; maxHp: number; attackIn: number; windup: boolean } | null;
  spawnIn: number; log: Array<{id: number; kind: string; text: string}>;
}
export const COMBAT_ACTIONS: Record<CombatAction, {code: string; label: string; success: string; failure: string}>;
export const DEFAULT_COMBAT: CombatSettings;
export function parseCombatSettings(value: unknown): CombatSettings | null;
export class MiningRuntime {
  constructor(canvas: HTMLCanvasElement, options?: {
    onEncounter?: (reason: 'monster' | 'ore') => void;
    onRequestRound?: () => void;
    onNotice?: (message: string) => void;
    storageKey?: string | null;
    settings?: CombatSettings;
    onState?: (state: CombatState) => void;
  });
  setInput(key: MiningInput, down: boolean): void;
  setPaused(paused: boolean): void;
  setCard(key: string | null, origin?: 'due' | 'library' | 'new', answered?: boolean): void;
  resolve(kind: 'wrong' | 'slay' | 'slash' | 'burst' | 'star' | 'bolt' | 'ink', key?: string): boolean;
  configure(settings: CombatSettings): boolean;
  state(): CombatState;
  recover(): void;
  encounter(): boolean;
  recall(): void;
  save(): void;
  dispose(): void;
}
