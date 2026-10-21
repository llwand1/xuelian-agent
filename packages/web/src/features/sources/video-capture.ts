import { hasHost, onHostMessage, postToHost } from '../float/float-view';
import { parseDesktopCapture, type DesktopCapture } from '../desktop/desktop-input';
export interface VideoShot extends DesktopCapture { scope: 'player' | 'tab' }
const PREFIX = 'sb-video:frame-result:';
interface RegionTrack extends MediaStreamTrack { cropTo?: (target: unknown) => Promise<void> }
/** Native captures THIS live WebView, never a remote URL, thumbnail or unrelated desktop. */
export async function captureVideoFrame(frame: HTMLIFrameElement, signal?: AbortSignal): Promise<VideoShot> {
  if (signal?.aborted) throw new Error('截图已取消');
  const id = crypto.randomUUID(), rect = frame.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) throw new Error('请先让整个播放器进入可见区域，再截图。');
  if (hasHost()) return new Promise((resolve, reject) => {
    frame.dataset.sbVideoCapture = id;
    const finish = () => { delete frame.dataset.sbVideoCapture; off(); clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new Error('截图已取消')); };
    const off = onHostMessage(message => {
      if (!message.startsWith(PREFIX)) return;
      let value: { id?: string; error?: string };
      try { value = JSON.parse(message.slice(PREFIX.length)) as typeof value; } catch { return; }
      if (value.id !== id) return;
      const shot = parseDesktopCapture(message.slice(PREFIX.length));
      finish(); if (shot) resolve({ ...shot, scope: 'player' }); else reject(new Error(value.error || '视频截图未成功，请重试。'));
    });
    const timer = setTimeout(() => { finish(); reject(new Error('视频截图超时，请重试。')); }, 12_000);
    signal?.addEventListener('abort', abort, { once: true });
    postToHost('sb-video:capture:' + JSON.stringify({ id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight }));
  });
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('此浏览器没有屏幕捕获能力，请在安装版中截图。');
  let stream: MediaStream | undefined;
  const video = document.createElement('video');
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
    if (signal?.aborted) throw new Error('截图已取消');
    const crop = (window as unknown as { CropTarget?: { fromElement: (element: Element) => Promise<unknown> } }).CropTarget;
    const track = stream.getVideoTracks()[0] as RegionTrack;
    let scope: VideoShot['scope'] = 'tab';
    if (crop && track.cropTo && track.getSettings().displaySurface === 'browser') {
      await track.cropTo(await crop.fromElement(frame)); scope = 'player';
    }
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    await video.play();
    if (!video.videoWidth || !video.videoHeight || signal?.aborted) throw new Error('尚未取得实时画面，请重试。');
    const scale = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('当前浏览器无法生成截图');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > 5_000_000) throw new Error('截图过大，请缩小共享区域重试。');
    return { id, dataUrl, name: `视频画面-${Date.now()}.png`, width: canvas.width, height: canvas.height, scope };
  } finally { stream?.getTracks().forEach(t => t.stop()); video.srcObject = null; }
}
