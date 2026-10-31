// The portable PC version: the built game in a window, with UDP for playing over the local network.
const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const dgram = require('node:dgram');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PORT = 47787; // the same as the phones, so they can play together
const BEACON_MS = 2000;
const GAME_DIR = path.join(__dirname, '..', 'dist');

// Records and tracks stay beside the portable program, so it leaves nothing on the computer.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'MarbleValleyData'));
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let window = null;
let socket = null;
let beacon = null;

const broadcastAddresses = () => {
  const list = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      list.push(ip.map((part, i) => (part & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return list;
};

const ownAddresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4')
    .map((a) => a.address);

const startNet = () =>
  new Promise((resolve) => {
    if (socket) return resolve(true);
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.once('error', () => resolve(false));
    s.on('message', (data, from) => {
      if (ownAddresses().includes(from.address)) return;
      window?.webContents.send('net-message', { ip: from.address, data: data.toString('utf8') });
    });
    s.bind(PORT, () => {
      s.setBroadcast(true);
      socket = s;
      setInterval(() => {
        if (!beacon) return;
        for (const address of broadcastAddresses()) s.send(beacon, PORT, address, () => {});
      }, BEACON_MS);
      resolve(true);
    });
  });

ipcMain.handle('net-start', () => startNet());
ipcMain.on('net-beacon', (_e, data) => {
  beacon = typeof data === 'string' ? data : null;
});
ipcMain.on('net-send', (_e, ip, data) => {
  if (socket && typeof ip === 'string' && typeof data === 'string') socket.send(data, PORT, ip, () => {});
});

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const wanted = path.normalize(decodeURIComponent(new URL(request.url).pathname)).replace(/^[\\/]+/, '');
    const file = path.join(GAME_DIR, wanted || 'index.html');
    if (!file.startsWith(GAME_DIR)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  window = new BrowserWindow({
    width: 560,
    height: 960,
    minWidth: 360,
    minHeight: 560,
    title: 'Marble Valley',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  window.removeMenu();
  // Links from the Attribution page belong in the computer's own browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.on('closed', () => (window = null));
  void window.loadURL('app://game/index.html');
});

app.on('window-all-closed', () => app.quit());
