// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_EXTERNAL_AGENT } from '@sb/shared';
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), probe: vi.fn() }));
vi.mock('./external-agent-api', () => ({ externalAgentApi: mocks }));
import { ExternalAgentCard } from './ExternalAgentCard';
beforeEach(() => {
  vi.clearAllMocks(); mocks.get.mockResolvedValue({ supported: true, settings: DEFAULT_EXTERNAL_AGENT, tokenConfigured: true });
  mocks.save.mockImplementation(async settings => ({ supported: true, settings, tokenConfigured: true }));
  mocks.probe.mockResolvedValue({ ok: true, models: ['fixture-agent'], message: '连接检查成功' });
});
afterEach(cleanup);
it('fills a Qoder preset and ships a complete adapter download without automatically switching backend', async () => {
  render(<ExternalAgentCard />); await screen.findByLabelText('配对密钥');
  fireEvent.click(screen.getByRole('button', { name: '使用 Qoder 预设' }));
  expect((screen.getByLabelText('接口基础地址') as HTMLInputElement).value).toBe('http://127.0.0.1:4015/v1');
  expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('Qoder 本地 Agent');
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('连接 Codex / OpenCode / Qoder / 其他 Agent'));
  expect(screen.getByRole('link', { name: '下载 Qoder 桥接包' }).getAttribute('href')).toBe('/studentbuddy-qoder-bridge.zip');
});
it('fills an OpenCode preset without saving or carrying a typed Codex key', async () => {
  render(<ExternalAgentCard />); await screen.findByLabelText('配对密钥');
  fireEvent.change(screen.getByLabelText('配对密钥'), { target: { value: 'old-typed-secret' } });
  fireEvent.click(screen.getByRole('button', { name: '使用 OpenCode 预设' }));
  expect((screen.getByLabelText('接口基础地址') as HTMLInputElement).value).toBe('http://127.0.0.1:4013/v1');
  expect((screen.getByLabelText('配对密钥') as HTMLInputElement).value).toBe('');
  expect(mocks.save).not.toHaveBeenCalled(); expect(screen.getByText(/仅填入预设/)).toBeTruthy();
});
it('tests an unsaved connection without enabling and saves an explicitly selected mode', async () => {
  render(<ExternalAgentCard />); await screen.findByLabelText('启用外置 Agent 作为聊天后端');
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
  await screen.findByText(/此操作不会保存或启用/); expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('启用外置 Agent 作为聊天后端'));
  fireEvent.change(screen.getByLabelText('配对密钥'), { target: { value: 'test-pairing-secret' } });
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await screen.findByText(/下一条文字消息由它回答/);
  expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({ enabled: true, token: 'test-pairing-secret' });
  expect((screen.getByLabelText('配对密钥') as HTMLInputElement).value).toBe('');
});
it('never restores saved secrets and keeps errors visible without falsely updating current backend', async () => {
  mocks.save.mockRejectedValue(new Error('保存失败'));
  render(<ExternalAgentCard />); await screen.findByLabelText('配对密钥');
  expect((screen.getByLabelText('配对密钥') as HTMLInputElement).type).toBe('password');
  fireEvent.click(screen.getByLabelText('启用外置 Agent 作为聊天后端'));
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await screen.findByRole('alert'); expect(screen.getByText('当前后端：原有模型')).toBeTruthy();
  expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty('token');
});
it('does not expose editable local endpoint settings on hosted deployment', async () => {
  mocks.get.mockResolvedValue({ supported: false, settings: DEFAULT_EXTERNAL_AGENT, tokenConfigured: false });
  render(<ExternalAgentCard />); await screen.findByText('外置 Agent 仅在本机连接');
  expect(screen.queryByRole('button', { name: '保存设置' })).toBeNull();
});
it('blocks edits while loading and shows configuration read failures', async () => {
  mocks.get.mockRejectedValue(new Error('读取失败')); render(<ExternalAgentCard />);
  expect(screen.queryByRole('button', { name: '保存设置' })).toBeNull();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('读取失败'));
});
