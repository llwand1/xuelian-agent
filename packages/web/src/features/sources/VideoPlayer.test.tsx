// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
const capture = vi.hoisted(() => vi.fn());
vi.mock('./video-capture', () => ({ captureVideoFrame: capture }));
import { VideoPlayer } from './VideoPlayer';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('keeps the SAME iframe and playback identity through floating, wide and restore; close is always outside the iframe', () => {
  const close = vi.fn(), v = render(<VideoPlayer title="讲解" embed="https://player.bilibili.com/player.html?bvid=BV1nR4y1y751" onClose={close} route />);
  const frame = v.container.querySelector('iframe');
  expect(frame?.getAttribute('allow')).toContain("fullscreen 'none'"); expect(frame?.hasAttribute('allowfullscreen')).toBe(false);
  fireEvent.click(v.getByText('悬浮播放')); expect(v.container.querySelector('.is-floating iframe')).toBe(frame);
  fireEvent.click(v.getByText('放大')); expect(v.container.querySelector('.is-wide iframe')).toBe(frame);
  fireEvent.click(v.getByText('退出放大')); expect(v.container.querySelector('.is-inline iframe')).toBe(frame);
  fireEvent.click(v.getByText('悬浮播放')); fireEvent.keyDown(window, { key: 'Escape' }); expect(v.container.querySelector('.is-inline iframe')).toBe(frame);
  fireEvent.click(v.getByLabelText('关闭视频')); expect(close).toHaveBeenCalledTimes(1);
});
it('captures the current player, offers a real image/download and reports failures instead of showing a thumbnail', async () => {
  capture.mockResolvedValue({ id: 'shot', dataUrl: 'data:image/png;base64,YQ==', name: 'frame.png', width: 320, height: 180, scope: 'player' });
  const v = render(<VideoPlayer title="讲解" embed="https://player.example/video" onClose={vi.fn()} />);
  await act(async () => { fireEvent.click(v.getByText('截取当前画面')); });
  expect(capture).toHaveBeenCalledWith(v.container.querySelector('iframe'), expect.any(AbortSignal));
  expect(v.getByAltText('刚截取的播放器实时画面').getAttribute('src')).toBe('data:image/png;base64,YQ==');
  expect(v.getByText('保存截图').getAttribute('download')).toBe('frame.png');
  fireEvent.click(v.getByLabelText('收起截图')); capture.mockRejectedValue(new Error('实际捕获失败'));
  await act(async () => { fireEvent.click(v.getByText('截取当前画面')); }); expect(v.getByRole('alert').textContent).toBe('实际捕获失败');
});
