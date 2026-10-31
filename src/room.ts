import type { CourseData } from './course';
import { isCourseData, plainCourse } from './myTracks';
import { LocalNet } from './net';
import type { RaceMessage } from './race';

export interface RoomPlayer {
  id: string;
  name: string;
  bests: Record<string, number>; // best time per course id, shared so the room can compare them
}

export interface FoundRoom {
  ip: string;
  host: string;
  players: number;
  seenAt: number;
}

export interface RoomState {
  players: RoomPlayer[];
  track: string;
  laps: number;
  raceId: number;
  raceAge: number; // ms since that race was started
}

type Wire =
  | { app: 'mv'; t: 'beacon'; id: string; name: string; players: number }
  | { app: 'mv'; t: 'hello'; id: string; name: string; bests: Record<string, number> }
  | { app: 'mv'; t: 'bye'; id: string }
  | { app: 'mv'; t: 'full'; id: string }
  | ({ app: 'mv'; t: 'room' } & RoomState)
  | { app: 'mv'; t: 'needTrack'; id: string; track: string }
  | { app: 'mv'; t: 'trackData'; data: CourseData }
  | ({ app: 'mv' } & RaceMessage);

export const MAX_PLAYERS = 4;
const STATE_EVERY = 500; // ms
const FORGET_ROOM_AFTER = 7000;
const FORGET_PLAYER_AFTER = 6000;
const HOST_GONE_AFTER = 5000;
const MAX_NAME = 16;

// A room on the Wi-Fi: one phone hosts and beacons, the others say hello to it.
// Everything goes through the host, which passes each ball's news on to the rest.
export class Room {
  isHost = false;
  inRoom = false;
  state: RoomState = { players: [], track: '', laps: 3, raceId: 0, raceAge: 0 };
  found: FoundRoom[] = [];
  private started = false;
  private hostIp = '';
  private heardHostAt = 0;
  private clients = new Map<string, { ip: string; heardAt: number }>();
  private raceStartedAt = 0;

  onFound: (() => void) | null = null;
  onChange: (() => void) | null = null;
  onLeft: ((why: string) => void) | null = null;
  onRaceMessage: ((m: RaceMessage) => void) | null = null;
  // A track made by a player has to be handed round the room before it can be raced.
  findTrack: ((id: string) => CourseData | undefined) | null = null;
  onTrackData: ((data: CourseData) => void) | null = null;

  constructor(
    readonly id: string,
    public name: string,
    public bests: () => Record<string, number>,
  ) {}

  async start(): Promise<boolean> {
    if (this.started) return true;
    try {
      await LocalNet.addListener('message', (e) => this.receive(e.ip, e.data));
      await LocalNet.start();
      this.started = true;
      setInterval(() => this.tick(), STATE_EVERY);
      return true;
    } catch {
      return false;
    }
  }

  host(track: string): void {
    this.isHost = true;
    this.inRoom = true;
    this.clients.clear();
    this.state = { players: [this.me()], track, laps: this.state.laps, raceId: 0, raceAge: 0 };
    this.tick();
    this.onChange?.();
  }

  join(ip: string): void {
    this.isHost = false;
    this.inRoom = true;
    this.hostIp = ip;
    this.heardHostAt = performance.now();
    this.state = { players: [], track: '', laps: 3, raceId: 0, raceAge: 0 };
    this.tick();
    this.onChange?.();
  }

  leave(): void {
    if (!this.inRoom) return;
    this.inRoom = false;
    if (this.isHost) LocalNet.setBeacon({ data: null });
    else this.sendTo(this.hostIp, { app: 'mv', t: 'bye', id: this.id });
    this.isHost = false;
    this.clients.clear();
  }

  setTrack(track: string): void {
    this.state.track = track;
    this.shareState();
    this.onChange?.();
  }

  setLaps(laps: number): void {
    this.state.laps = laps;
    this.shareState();
    this.onChange?.();
  }

  startRace(): void {
    this.state.raceId++;
    this.raceStartedAt = performance.now();
    this.shareState();
    this.onChange?.();
  }

  sendRace(message: RaceMessage): void {
    const wire = { app: 'mv', ...message } as Wire;
    if (this.isHost) for (const c of this.clients.values()) this.sendTo(c.ip, wire);
    else this.sendTo(this.hostIp, wire);
  }

  private me(): RoomPlayer {
    return { id: this.id, name: this.name, bests: this.bests() };
  }

  private sendTo(ip: string, message: Wire): void {
    LocalNet.send({ ip, data: JSON.stringify(message) });
  }

  private tick(): void {
    const now = performance.now();
    const before = this.found.length;
    this.found = this.found.filter((r) => now - r.seenAt < FORGET_ROOM_AFTER);
    if (this.found.length !== before) this.onFound?.();
    if (!this.inRoom) return;

    if (this.isHost) {
      for (const [id, c] of this.clients) {
        if (now - c.heardAt < FORGET_PLAYER_AFTER) continue;
        this.clients.delete(id);
        this.state.players = this.state.players.filter((p) => p.id !== id);
        this.onChange?.();
      }
      this.state.players[0] = this.me();
      LocalNet.setBeacon({ data: JSON.stringify({ app: 'mv', t: 'beacon', id: this.id, name: this.name, players: this.state.players.length } satisfies Wire) });
      this.shareState();
    } else {
      this.sendTo(this.hostIp, { app: 'mv', t: 'hello', id: this.id, name: this.name, bests: this.bests() });
      if (this.state.track && !this.findTrack?.(this.state.track)) this.sendTo(this.hostIp, { app: 'mv', t: 'needTrack', id: this.id, track: this.state.track });
      if (now - this.heardHostAt > HOST_GONE_AFTER) {
        this.inRoom = false;
        this.onLeft?.('The host has gone.');
      }
    }
  }

  private shareState(): void {
    this.state.raceAge = this.state.raceId > 0 ? Math.round(performance.now() - this.raceStartedAt) : 0;
    const message: Wire = { app: 'mv', t: 'room', ...this.state };
    for (const c of this.clients.values()) this.sendTo(c.ip, message);
  }

  // Whatever arrives comes from anyone on the network, so nothing in it is trusted to be well formed.
  private receive(ip: string, data: string): void {
    let m: Wire;
    try {
      m = JSON.parse(data) as Wire;
    } catch {
      return;
    }
    if (!m || m.app !== 'mv') return;
    switch (m.t) {
      case 'beacon':
        return this.heardBeacon(ip, m);
      case 'hello':
        return this.heardHello(ip, m);
      case 'bye':
        if (this.isHost && this.clients.delete(m.id)) {
          this.state.players = this.state.players.filter((p) => p.id !== m.id);
          this.onChange?.();
        }
        return;
      case 'full':
        if (this.inRoom && !this.isHost && ip === this.hostIp && m.id === this.id) {
          this.inRoom = false;
          this.onLeft?.('That room is full.');
        }
        return;
      case 'room':
        return this.heardRoom(ip, m);
      case 'needTrack': {
        const track = this.isHost && this.clients.get(m.id)?.ip === ip ? this.findTrack?.(String(m.track)) : undefined;
        if (track) this.sendTo(ip, { app: 'mv', t: 'trackData', data: plainCourse(track) });
        return;
      }
      case 'trackData':
        if (this.inRoom && !this.isHost && ip === this.hostIp && isCourseData(m.data)) this.onTrackData?.(m.data);
        return;
      case 's':
      case 'f':
        return this.heardRace(ip, m);
    }
  }

  private heardBeacon(ip: string, m: { id: string; name: string; players: number }): void {
    if (m.id === this.id || typeof m.id !== 'string') return;
    const entry = this.found.find((r) => r.ip === ip);
    const host = cleanName(m.name);
    const players = Number(m.players) || 1;
    if (entry) {
      const changed = entry.host !== host || entry.players !== players;
      entry.seenAt = performance.now();
      entry.host = host;
      entry.players = players;
      if (changed) this.onFound?.();
    } else {
      this.found.push({ ip, host, players, seenAt: performance.now() });
      this.onFound?.();
    }
  }

  private heardHello(ip: string, m: { id: string; name: string; bests: Record<string, number> }): void {
    if (!this.isHost || typeof m.id !== 'string' || m.id === this.id) return;
    const known = this.clients.get(m.id);
    if (!known && this.state.players.length >= MAX_PLAYERS) {
      this.sendTo(ip, { app: 'mv', t: 'full', id: m.id });
      return;
    }
    this.clients.set(m.id, { ip, heardAt: performance.now() });
    const player: RoomPlayer = { id: m.id, name: cleanName(m.name), bests: cleanBests(m.bests) };
    const at = this.state.players.findIndex((p) => p.id === m.id);
    if (at >= 0) this.state.players[at] = player;
    else this.state.players.push(player);
    if (!known) {
      this.shareState();
      this.onChange?.();
    }
  }

  private heardRoom(ip: string, m: RoomState): void {
    if (!this.inRoom || this.isHost || ip !== this.hostIp || !Array.isArray(m.players)) return;
    this.heardHostAt = performance.now();
    this.state = {
      players: m.players.map((p) => ({ id: String(p.id), name: cleanName(p.name), bests: cleanBests(p.bests) })),
      track: String(m.track),
      laps: Number(m.laps) || 3,
      raceId: Number(m.raceId) || 0,
      raceAge: Number(m.raceAge) || 0,
    };
    this.onChange?.();
  }

  private heardRace(ip: string, m: RaceMessage): void {
    if (!this.inRoom || !isRaceMessage(m)) return;
    if (this.isHost) {
      // Passed on to everyone but whoever it came from.
      const from = this.clients.get(m.id);
      if (!from || from.ip !== ip) return;
      from.heardAt = performance.now();
      const wire = { app: 'mv', ...m } as Wire;
      for (const [id, c] of this.clients) if (id !== m.id) this.sendTo(c.ip, wire);
    } else if (ip !== this.hostIp) {
      return;
    }
    this.onRaceMessage?.(m);
  }
}

function cleanName(name: unknown): string {
  return String(name ?? 'Player').slice(0, MAX_NAME);
}

function cleanBests(bests: unknown): Record<string, number> {
  const clean: Record<string, number> = {};
  if (bests && typeof bests === 'object') {
    for (const [course, time] of Object.entries(bests)) {
      if (typeof time === 'number' && Number.isFinite(time)) clean[course] = time;
    }
  }
  return clean;
}

function isRaceMessage(m: RaceMessage): boolean {
  if (typeof m.id !== 'string' || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)) return false;
  if (m.t === 'f') return Number.isFinite(m.n);
  return Number.isFinite(m.vx) && Number.isFinite(m.vy) && Number.isFinite(m.vz) && Number.isFinite(m.score);
}
