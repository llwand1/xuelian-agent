// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useDuelEgg } from './useDuelEgg';
import { NAV } from './nav';
function Egg() { useDuelEgg(); return <input aria-label="编辑" />; }
const keys = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
afterEach(() => { cleanup(); location.hash = ''; });
it('has no battle navigation item; only the complete deliberate sequence opens the retained game', () => {
  expect(NAV.some(n => n.key === 'pk')).toBe(false); render(<Egg />);
  keys.slice(0,8).forEach(key => fireEvent.keyDown(window, { key })); expect(location.hash).not.toBe('#/pk');
  fireEvent.keyDown(window, { key: 'b' }); fireEvent.keyDown(window, { key: 'a' }); expect(location.hash).toBe('#/pk');
});
it('never treats typing or incomplete/wrong sequences as an easter egg', () => {
  const view = render(<Egg />); keys.forEach(key => fireEvent.keyDown(view.getByLabelText('编辑'), { key }));
  expect(location.hash).not.toBe('#/pk');
  [...keys.slice(0,5),'x',...keys.slice(5)].forEach(key => fireEvent.keyDown(window, { key })); expect(location.hash).not.toBe('#/pk');
});
