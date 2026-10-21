// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CompanionInvitation } from './CompanionInvitation';
const opener={id:'q1',scope:'',question:{topic:'闭包',question:'题干',options:['A','B'],answer:0,explanation:'解析'}};
afterEach(()=>{cleanup();delete(window as unknown as {chrome?:unknown}).chrome;});
it('a browser preview has complete accessible text, character effects and explicit challenge / snooze actions',()=>{
  const challenge=vi.fn(),snooze=vi.fn();render(<CompanionInvitation visible opener={opener} onChallenge={challenge} onSnooze={snooze}/>);
  expect(screen.getByText('闭包的小题出好了，快来挑战一下吧！')).toBeTruthy();expect(document.querySelectorAll('.sb-invite-char').length).toBeGreaterThan(15);
  expect(challenge).not.toHaveBeenCalled();fireEvent.click(screen.getByText('挑战一下'));expect(challenge).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('稍后提醒 · 2 分钟'));expect(snooze).toHaveBeenCalledOnce();
});
it('sends one native invite per unchanged question, with no expansion, and cleans it on unmount',()=>{
  const sent:string[]=[];(window as unknown as {chrome:unknown}).chrome={webview:{postMessage:(message:string)=>sent.push(message)}};
  const view=render(<CompanionInvitation visible opener={opener} onChallenge={()=>{}} onSnooze={()=>{}}/>);
  view.rerender(<CompanionInvitation visible opener={{...opener}} onChallenge={()=>{}} onSnooze={()=>{}}/>);
  expect(sent).toHaveLength(1);expect(JSON.parse(sent[0]!.slice('sb-float:invite:'.length))).toEqual({id:'q1',topic:'闭包',reducedMotion:false,manual:true,snoozeMinutes:2});
  expect(screen.queryByText('挑战一下')).toBeNull();view.unmount();expect(sent.at(-1)).toBe('sb-float:invite:off:q1');expect(sent).not.toContain('sb-float:quiz');
});

it('receiving a question stays silent until mail is opened; closing keeps it available for reopening',()=>{
  const sent:string[]=[];(window as unknown as {chrome:unknown}).chrome={webview:{postMessage:(message:string)=>sent.push(message)}};
  const props={opener,onChallenge:vi.fn(),onSnooze:vi.fn(),snoozeMinutes:17};
  const view=render(<CompanionInvitation {...props}/>);
  expect(sent).toEqual([]);expect(screen.queryByText('挑战一下')).toBeNull();
  view.rerender(<CompanionInvitation {...props} visible/>);expect(sent[0]).toContain('"snoozeMinutes":17');
  view.rerender(<CompanionInvitation {...props} visible={false}/>);expect(sent.at(-1)).toBe('sb-float:invite:off:q1');
  view.rerender(<CompanionInvitation {...props} visible/>);expect(sent.filter(m=>m.includes('"manual":true')).length).toBe(2);
  expect(props.onSnooze).not.toHaveBeenCalled();
});
