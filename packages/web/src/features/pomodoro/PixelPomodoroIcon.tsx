/** Original 16×16 pixel glyphs; no platform-dependent emoji or smooth strokes. */
export function PixelPomodoroIcon({ rest = false }: { rest?: boolean }) {
  return <svg className="pomo-pixel-icon" data-testid="pixel-pomodoro-icon" viewBox="0 0 16 16" width="20" height="20" shapeRendering="crispEdges" aria-hidden="true">
    {rest ? <>
      <path fill="#eedc9a" d="M2 5h10v7H4v-1H2zM12 6h3v5h-3V9h1V8h-1zM1 13h12v1H1z" />
      <path fill="#b88965" d="M4 6h6v2H4z" /><path fill="#8dd3cb" d="M4 1h1v2H4zM8 2h1v2H8z" />
    </> : <>
      <path fill="#683549" d="M4 4h8v1h2v2h1v5h-1v2h-2v1H4v-1H2v-2H1V7h1V5h2z" />
      <path fill="#eb655b" d="M4 5h8v1h1v2h1v4h-2v2H4v-1H3v-2H2V8h1V6h1z" />
      <path fill="#a93e4e" d="M12 8h2v4h-2v2H5v-1h6v-2h1z" />
      <path fill="#8cba6f" d="M7 1h2v3h4v1H9v2H7V5H3V4h4z" />
      <path fill="#ffe1b5" d="M4 7h2v2H4z" />
    </>}
  </svg>;
}
