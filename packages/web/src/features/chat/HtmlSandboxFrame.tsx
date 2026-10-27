import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildHtmlSandbox, HTML_MIN_HEIGHT, readHtmlReport } from './html-sandbox';

export function HtmlSandboxFrame({ code, title, runId, onError, onWarning, staticOnly = false }: {
  code: string; title: string; runId: string; onError: (message: string) => void;
  onWarning?: (message: string) => void; staticOnly?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const reportError = useRef(onError); reportError.current = onError;
  const reportWarning = useRef(onWarning); reportWarning.current = onWarning;
  const loads = useRef(0);
  const [ready, setReady] = useState(staticOnly);
  const [height, setHeight] = useState(staticOnly ? 480 : HTML_MIN_HEIGHT);
  const doc = useMemo(() => buildHtmlSandbox(code, runId, window.location.origin, staticOnly), [code, runId, staticOnly]);
  useEffect(() => { frame.current?.style.setProperty('--sb-html-height', `${height}px`); }, [height]);
  useLayoutEffect(() => {
    if (staticOnly) return;
    let lastResize = 0;
    const timeout = setTimeout(() => reportError.current('卡片未能完成初始化，请查看源码或重播。'), 8000);
    const receive = (ev: MessageEvent) => {
      if (ev.origin !== 'null' || !frame.current || ev.source !== frame.current.contentWindow) return;
      const data = readHtmlReport(ev.data, runId);
      if (!data) return;
      if (data.event === 'ready') { clearTimeout(timeout); setReady(true); }
      else if (data.event === 'error') reportError.current(data.message);
      else if (data.event === 'warning') reportWarning.current?.(data.message);
      else if (data.event === 'resize' && Date.now() - lastResize >= 100) { lastResize = Date.now(); setHeight(data.height); }
    };
    window.addEventListener('message', receive);
    return () => { clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [runId, staticOnly]);
  return <>
    {!ready && <p className="html-card-status" role="status">正在启动沙箱…</p>}
    <iframe ref={frame} className="html-card-frame" srcDoc={doc} title={title}
      sandbox={staticOnly ? '' : 'allow-scripts'} referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen 'none'; payment 'none'; usb 'none'; serial 'none'"
      onError={() => reportError.current('卡片加载失败，请查看源码或重播。')}
      onLoad={() => { if (++loads.current > 1) reportError.current('卡片发生页面导航，已停止运行。'); }} />
  </>;
}
