// Streams JSON lines to the dev server over USB. Compiled out of production builds.
const session = new Date().toISOString().replace(/[:.]/g, '-');
let buffer: string[] = [];

export function log(kind: string, data: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  buffer.push(JSON.stringify({ k: kind, t: Math.round(performance.now()), ...data }));
}

function flush(): void {
  if (buffer.length === 0) return;
  const body = buffer.join('\n') + '\n';
  buffer = [];
  fetch('/telemetry', { method: 'POST', headers: { 'x-session': session }, body }).catch(() => {});
}

export function startTelemetry(): void {
  if (!import.meta.env.DEV) return;
  setInterval(flush, 250);
  log('session', { ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio });
  addEventListener('error', (e) => log('error', { message: e.message, file: e.filename, line: e.lineno }));
  addEventListener('unhandledrejection', (e) => log('error', { message: String(e.reason) }));
}
