import { registerPlugin } from '@capacitor/core';

export interface LocalNetPlugin {
  start(): Promise<{ ip: string | null }>;
  stop(): Promise<void>;
  setBeacon(options: { data: string | null }): void;
  send(options: { ip: string; data: string }): void;
  addListener(event: 'message', listener: (e: { ip: string; data: string }) => void): Promise<{ remove: () => Promise<void> }>;
}

const BEACON_MS = 2000;

// In a browser there is no Wi-Fi to reach, so tabs on one computer stand in for phones.
class TabNet implements LocalNetPlugin {
  private channel = new BroadcastChannel('marble-valley-net');
  private ip = `tab-${Math.floor(Math.random() * 1e6)}`;
  private beacon: string | null = null;
  private listeners: ((e: { ip: string; data: string }) => void)[] = [];

  constructor() {
    this.channel.onmessage = (e: MessageEvent<{ to: string; from: string; data: string }>) => {
      if (e.data.to !== '*' && e.data.to !== this.ip) return;
      for (const listener of this.listeners) listener({ ip: e.data.from, data: e.data.data });
    };
    setInterval(() => {
      if (this.beacon) this.channel.postMessage({ to: '*', from: this.ip, data: this.beacon });
    }, BEACON_MS);
  }

  async start(): Promise<{ ip: string | null }> {
    return { ip: this.ip };
  }

  async stop(): Promise<void> {
    this.beacon = null;
  }

  setBeacon(options: { data: string | null }): void {
    this.beacon = options.data;
  }

  send(options: { ip: string; data: string }): void {
    this.channel.postMessage({ to: options.ip, from: this.ip, data: options.data });
  }

  async addListener(_event: 'message', listener: (e: { ip: string; data: string }) => void): Promise<{ remove: () => Promise<void> }> {
    this.listeners.push(listener);
    return { remove: async () => void (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }
}

// The portable PC version has real UDP, handed over by desktop/preload.cjs.
interface DesktopBridge {
  start(): Promise<boolean>;
  setBeacon(data: string | null): void;
  send(ip: string, data: string): void;
  onMessage(listener: (e: { ip: string; data: string }) => void): void;
}

const bridge = (globalThis as { marbleNet?: DesktopBridge }).marbleNet;
export const isDesktop = bridge !== undefined;

class DesktopNet implements LocalNetPlugin {
  constructor(private net: DesktopBridge) {}

  async start(): Promise<{ ip: string | null }> {
    if (!(await this.net.start())) throw new Error('The network port is in use.');
    return { ip: null };
  }

  async stop(): Promise<void> {
    this.net.setBeacon(null);
  }

  setBeacon(options: { data: string | null }): void {
    this.net.setBeacon(options.data);
  }

  send(options: { ip: string; data: string }): void {
    this.net.send(options.ip, options.data);
  }

  async addListener(_event: 'message', listener: (e: { ip: string; data: string }) => void): Promise<{ remove: () => Promise<void> }> {
    this.net.onMessage(listener);
    return { remove: async () => {} };
  }
}

export const LocalNet = registerPlugin<LocalNetPlugin>('LocalNet', { web: () => (bridge ? new DesktopNet(bridge) : new TabNet()) });
