import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Dev only: the phone POSTs JSON lines here and they land in telemetry/<session>.jsonl.
function telemetrySink(): Plugin {
  const dir = join(process.cwd(), 'telemetry');
  return {
    name: 'telemetry-sink',
    configureServer(server) {
      mkdirSync(dir, { recursive: true });
      server.middlewares.use('/telemetry', (req, res) => {
        const session = String(req.headers['x-session'] ?? 'unknown').replace(/[^\w-]/g, '');
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          appendFileSync(join(dir, `${session}.jsonl`), body);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [telemetrySink()],
  server: {
    host: '127.0.0.1', // adb reverse tunnels to IPv4; 'localhost' can bind IPv6 only on Windows
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/telemetry/**', '**/android/**'] },
  },
  build: { target: 'es2020' },
});
