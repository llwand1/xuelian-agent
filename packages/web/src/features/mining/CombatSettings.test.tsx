// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_COMBAT, parseCombatSettings } from '@sb/open-engine/mining';
import { CombatSettings } from './CombatSettings';
import { loadCombatPrefs, saveCombatPrefs } from './combat-prefs';
afterEach(() => { cleanup();localStorage.clear(); });
it('accepts AB, ABB, BAA and custom integer pacing while rejecting invalid or excessive settings',()=>{
  for(const sequence of [['attack','defend'],['attack','defend','defend'],['defend','attack','attack']]) expect(parseCombatSettings({...DEFAULT_COMBAT,sequence})).not.toBeNull();
  for(const patch of [{spawnSeconds:0},{spawnSeconds:121},{roundSeconds:1},{roundSeconds:31},{attackSeconds:7},{attackSeconds:61},{roundSeconds:4.5},{spawnSeconds:'15'},{sequence:[]},{sequence:['magic']},{sequence:[['attack']]},{sequence:Array(17).fill('attack')}]) expect(parseCombatSettings({...DEFAULT_COMBAT,...patch})).toBeNull();
});
it('edits ordering, repeated actions and removal; the saved sequence is exactly what the player arranged',()=>{
  const save=vi.fn();render(<CombatSettings value={DEFAULT_COMBAT} onSave={save}/>);
  fireEvent.click(screen.getByText('加入 B · 防御'));expect((screen.getByLabelText('动作序列') as HTMLInputElement).value).toBe('ABB');
  fireEvent.click(screen.getByLabelText('第2步前移'));expect((screen.getByLabelText('动作序列') as HTMLInputElement).value).toBe('BAB');
  fireEvent.click(screen.getByLabelText('删除第3步'));fireEvent.click(screen.getByText('加入 A · 平A'));
  fireEvent.click(screen.getByText('保存节奏与轮播'));expect(save).toHaveBeenCalledWith({...DEFAULT_COMBAT,sequence:['defend','attack','attack']});
});
it('does not save an empty deck, missing duration, out of range or fractional duration',()=>{
  const save=vi.fn();render(<CombatSettings value={DEFAULT_COMBAT} onSave={save}/>);
  for(const value of ['', '0','1.5','121']){
    fireEvent.change(screen.getByLabelText('刷怪间隔（秒）'),{target:{value}});fireEvent.click(screen.getByText('保存节奏与轮播'));
    expect(screen.getByRole('alert')).toBeTruthy();
  }
  fireEvent.change(screen.getByLabelText('刷怪间隔（秒）'),{target:{value:'15'}});fireEvent.change(screen.getByLabelText('动作序列'),{target:{value:''}});
  fireEvent.click(screen.getByText('保存节奏与轮播'));expect(save).not.toHaveBeenCalled();
});
it('keeps preferences account-scoped and separate from terrain or the learning ledger, recovering bad saves safely',()=>{
  saveCombatPrefs('sb:mining:a:v1',{...DEFAULT_COMBAT,roundSeconds:9,sequence:['defend','attack','attack']});
  expect(loadCombatPrefs('sb:mining:a:v1').roundSeconds).toBe(9);expect(loadCombatPrefs('sb:mining:b:v1').roundSeconds).toBe(4);
  expect(localStorage.getItem('sb:mining:a:v1')).toBeNull();expect(localStorage.getItem('sb:drill:stats')).toBeNull();
  localStorage.setItem('sb:mining:a:v1:combat:v1','bad JSON');expect(loadCombatPrefs('sb:mining:a:v1')).toEqual(DEFAULT_COMBAT);
});
