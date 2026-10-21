// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
const api = vi.hoisted(() => ({ state: vi.fn(), settings: vi.fn() }));
vi.mock('../desktop/desktop-api', () => ({ desktopApi: api, isLocalDesktopAddress: () => true, STUDY_SETTINGS_UPDATED: 'sb:study-settings-updated' }));
import { StudyMailSettings } from './StudyMailSettings';
const state = { settings: { enabled: true, intervalMinutes: 3, scope: 'learning' }, nextAt: 1000, awaiting: false, preparing: false, question: null, error: '' };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('loads legacy timing, saves arbitrary minutes and broadcasts the server-confirmed settings', async () => {
  api.state.mockResolvedValue(state); api.settings.mockImplementation(async settings => ({ ...state, settings }));
  const updated = vi.fn(); window.addEventListener('sb:study-settings-updated', updated);
  await act(async () => { render(<StudyMailSettings />); });
  expect((screen.getByLabelText('来信延后时间（分钟）') as HTMLInputElement).value).toBe('2');
  fireEvent.change(screen.getByLabelText('出题间隔（分钟）'), { target: { value: '13' } });
  fireEvent.change(screen.getByLabelText('来信延后时间（分钟）'), { target: { value: '17' } });
  await act(async () => { fireEvent.click(screen.getByText('保存来信设置')); });
  expect(api.settings).toHaveBeenCalledWith({ enabled: true, intervalMinutes: 13, snoozeMinutes: 17, scope: 'learning' });
  expect(updated).toHaveBeenCalledOnce(); expect(screen.getByRole('status').textContent).toContain('已保存');
  window.removeEventListener('sb:study-settings-updated', updated);
});
it('rejects blank, fractional and out-of-range minutes without touching the running clock', async () => {
  api.state.mockResolvedValue(state); await act(async () => { render(<StudyMailSettings />); });
  for (const value of ['', '0', '61', '1.5']) {
    fireEvent.change(screen.getByLabelText('来信延后时间（分钟）'), { target: { value } });
    await act(async () => { fireEvent.click(screen.getByText('保存来信设置')); });
    expect(screen.getByRole('alert').textContent).toContain('1–60');
  }
  expect(api.settings).not.toHaveBeenCalled();
});
it('reports save failures, keeps the edited value and retries successfully', async () => {
  api.state.mockResolvedValue(state); api.settings.mockRejectedValueOnce(new Error('服务暂时断开'));
  await act(async () => { render(<StudyMailSettings />); });
  fireEvent.change(screen.getByLabelText('来信延后时间（分钟）'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByText('保存来信设置')); });
  expect(screen.getByRole('alert').textContent).toContain('服务暂时断开'); expect(screen.queryByRole('status')).toBeNull();
  expect((screen.getByLabelText('来信延后时间（分钟）') as HTMLInputElement).value).toBe('20');
  api.settings.mockImplementation(async settings => ({ ...state, settings }));
  await act(async () => { fireEvent.click(screen.getByText('保存来信设置')); }); expect(screen.getByRole('status')).toBeTruthy();
});
it('does not show a desktop-only card when the capability endpoint is unavailable', async () => {
  api.state.mockRejectedValue(new Error('404')); await act(async () => { render(<StudyMailSettings />); });
  expect(screen.queryByLabelText('学习来信设置')).toBeNull();
});
