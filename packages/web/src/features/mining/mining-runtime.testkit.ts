import type { CombatSettings, CombatState } from '@sb/open-engine/mining';
export const battleProbe = { runtime: null as FakeMiningRuntime | null };
/** UI clock double; physics and outcome rules are exercised with the real simulation separately. */
export class FakeMiningRuntime {
  private key: string | null = null;
  private answered = false;
  private timer: ReturnType<typeof setInterval>;
  private settings: CombatSettings;
  private value: CombatState = {hp:100,guard:0,index:0,pending:null,cooldown:0,paused:false,action:'attack',monster:{kind:'slime',hp:3,maxHp:3,attackIn:12,windup:false},spawnIn:15,log:[]};
  readonly resolutions: string[] = [];
  constructor(_canvas: HTMLCanvasElement, private opts: { onEncounter: () => void; onRequestRound?: () => void; onState: (s: CombatState) => void; settings: CombatSettings }) {
    this.settings = opts.settings; battleProbe.runtime = this;
    this.timer = setInterval(() => {
      if (this.value.paused) return;
      this.value.cooldown = Math.max(0, this.value.cooldown - .1);
      if (this.value.monster) {
        this.value.monster.attackIn -= .1;
        if (this.value.monster.attackIn <= .001) { this.value.hp -= 8; this.value.monster.attackIn = this.settings.attackSeconds; }
      }
      this.emit();
    },100);
  }
  private emit() { this.opts.onState(this.state()); }
  requestRound() { this.opts.onRequestRound?.(); }
  state(): CombatState { return structuredClone(this.value); }
  setInput() {} recall() {} recover() { this.value.hp=100;this.emit(); }
  setCard(key: string | null, _origin?: string, answered = false) { this.answered=key===this.key?this.answered||answered:answered;this.key=key; }
  setPaused(value: boolean) { this.value.paused=value;this.emit(); }
  configure(value: CombatSettings) { this.settings=value;this.value.action=value.sequence[this.value.index % value.sequence.length]!;this.emit();return true; }
  encounter() {
    if (!this.key || this.answered || this.value.paused || this.value.pending || this.value.cooldown>.001 || !this.value.monster) return false;
    this.value.pending=this.settings.sequence[this.value.index % this.settings.sequence.length]!;this.opts.onEncounter();this.emit();return true;
  }
  resolve(kind: string,key: string) {
    if (!this.value.pending || key!==this.key) return false;
    this.answered=true;
    this.resolutions.push(kind);
    if (kind!=='slay' && kind!=='wrong') {
      if(this.value.pending==='attack') this.value.monster!.hp--;else this.value.guard++;
    }
    this.value.pending=null;this.value.index=(this.value.index+1)%this.settings.sequence.length;
    this.value.action=this.settings.sequence[this.value.index]!;this.value.cooldown=this.settings.roundSeconds;this.emit();return true;
  }
  dispose() { clearInterval(this.timer); }
}
