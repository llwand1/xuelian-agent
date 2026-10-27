// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LandingWorkbench } from './LandingWorkbench';
import { LandingMines } from './LandingMines';
import { CURRENT as C, DEMO_MODES, MINE_CHOICES, PRACTICE_CHOICES } from './landing-current-copy';
afterEach(cleanup);
const tab = (id: string) => screen.getByRole('tab', { name: DEMO_MODES.find(value => value.id === id)!.label.zh });
it('opens a focused quotation without calling a model or writing records', () => {
  const network = vi.spyOn(globalThis, 'fetch'); const write = vi.spyOn(Storage.prototype, 'setItem');
  render(<LandingWorkbench />);
  expect(screen.getByText(C.demoBadge.zh)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: C.quoteButton.zh }));
  expect(screen.getByRole('complementary', { name: C.quoteLabel.zh }).textContent).toContain(C.quoteReply.zh);
  fireEvent.click(screen.getByRole('button', { name: C.close.zh }));
  expect(screen.queryByRole('complementary')).toBeNull();
  expect(network).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); network.mockRestore(); write.mockRestore();
});
it('supports keyboard tabs and an internally consistent buoyancy diagram', () => {
  render(<LandingWorkbench />); fireEvent.keyDown(tab('read'), { key: 'ArrowRight' });
  expect(tab('diagram').getAttribute('aria-selected')).toBe('true'); expect(document.activeElement).toBe(tab('diagram'));
  fireEvent.change(screen.getByRole('slider'), { target: { value: '90' } });
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('90%');
  expect(screen.getByText('Fᵦ = 0.90')).toBeTruthy();
  fireEvent.keyDown(tab('diagram'), { key: 'End' }); expect(tab('review').getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(tab('review'), { key: 'Home' }); expect(tab('read').getAttribute('aria-selected')).toBe('true');
});
it('checks practice, retains reasoning between tabs, and flips a review card', () => {
  render(<LandingWorkbench />); fireEvent.click(tab('practice'));
  fireEvent.click(screen.getByRole('button', { name: C.check.zh })); expect(screen.getByRole('status').textContent).toBe(C.choose.zh);
  fireEvent.click(screen.getByRole('button', { name: 'A' + PRACTICE_CHOICES[0]!.zh }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '排开水的体积变大' } });
  fireEvent.click(screen.getByRole('button', { name: C.check.zh })); expect(screen.getByRole('status').textContent).toBe(C.right.zh);
  fireEvent.click(tab('review')); fireEvent.click(screen.getByRole('button', { name: C.reveal.zh })); expect(screen.getByText(C.termDefinition.zh)).toBeTruthy();
  fireEvent.click(tab('practice')); expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('排开水的体积变大');
});
it('moves the mine illustration and answers a spell without claiming a real save', () => {
  const { container } = render(<LandingMines />); expect(screen.getByText(C.miningCaption.zh)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: C.rightMove.zh })); expect(container.querySelector('g[transform="translate(205 153)"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /准备施法/ }));
  fireEvent.click(screen.getByRole('button', { name: MINE_CHOICES[1]!.zh })); expect(screen.getByRole('status').textContent).toBe(C.miningRetry.zh);
  fireEvent.click(screen.getByRole('button', { name: MINE_CHOICES[0]!.zh })); expect(screen.getByRole('status').textContent).toBe(C.miningSuccess.zh); expect(container.querySelector('.lm-spell')).toBeTruthy();
});
