// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
const api = vi.hoisted(() => ({ settings: vi.fn(), configure: vi.fn() }));
vi.mock('../guide/float-guide-api', () => ({ floatGuideApi: api }));
import { FloatGuideSwitch } from './FloatGuideSwitch';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('loads the saved preference, saves a toggle, and opens only on explicit click', async () => {
  api.settings.mockResolvedValue({ enabled: false }); api.configure.mockResolvedValue({ enabled: true });
  const open = vi.fn(); let v!: ReturnType<typeof render>;
  await act(async () => { v = render(<FloatGuideSwitch onOpen={open} />); });
  const toggle = v.getByRole('checkbox') as HTMLInputElement;
  expect(toggle.checked).toBe(false); expect(open).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(toggle); });
  expect(api.configure).toHaveBeenCalledWith(true); expect(toggle.checked).toBe(true);
  fireEvent.click(v.getByRole('button', { name: '打开引路灯 · 下一步学什么' }));
  expect(open).toHaveBeenCalledTimes(1);
});
it('retains the saved value and shows a retryable failure when saving fails', async () => {
  api.settings.mockResolvedValue({ enabled: true }); api.configure.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ enabled: false });
  let v!: ReturnType<typeof render>;
  await act(async () => { v = render(<FloatGuideSwitch onOpen={vi.fn()} />); });
  const toggle = v.getByRole('checkbox') as HTMLInputElement;
  await act(async () => { fireEvent.click(toggle); });
  expect(v.getByRole('alert').textContent).toContain('保存失败'); expect(toggle.checked).toBe(true); expect(toggle.disabled).toBe(false);
  await act(async () => { fireEvent.click(toggle); });
  expect(toggle.checked).toBe(false); expect(v.queryByRole('alert')).toBeNull();
});
