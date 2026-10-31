import type { Cell, Course, Point } from './course';
import type { Marble } from './marble';

export type Weapon = 'repulse' | 'seeker' | 'mine' | 'turbo' | 'shield';

export const WEAPON_NAMES: Record<Weapon, string> = {
  repulse: 'Repulse',
  seeker: 'Seeker',
  mine: 'Mine',
  turbo: 'Turbo',
  shield: 'Shield',
};

export interface RacePlayer {
  id: string;
  name: string;
}

// This player's ball as the others need to know it, several times a second.
export interface BallState {
  t: 's';
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lap: number;
  sec: number;
  score: number;
  fin: number | null;
  sh: boolean;
  h: number;
}

// Something that happened once, sent twice in case one copy is lost.
export interface RaceEvent {
  t: 'f';
  id: string;
  n: number;
  w: 'repulse' | 'seeker' | 'mine' | 'mineGone';
  x: number;
  y: number;
  z: number;
  target?: string;
  mine?: string;
}

export type RaceMessage = BallState | RaceEvent;

export interface Rival extends RacePlayer {
  index: number; // place in the room's list, which also picks its colour
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heardAt: number;
  lap: number;
  section: number;
  score: number;
  finish: number | null;
  shielded: boolean;
  bumpWait: number;
  hearts: number;
}

export interface Mine extends Point {
  key: string;
  armIn: number;
}

export interface Seeker extends Point {
  key: string;
  target: string;
  life: number;
}

export interface Pulse {
  x: number;
  y: number;
  z: number;
  age: number;
}

export interface Standing {
  id: string;
  name: string;
  index: number;
  finish: number | null;
  lap: number;
  hearts: number;
}

const SEND_EVERY = 1 / 15;
const RESEND_AFTER = 70; // ms
const PREDICT_AT_MOST = 0.2; // seconds a rival's position is carried forward from the last we heard

const BALL_TOUCH = 2.3; // the distance between centres at which two balls meet
const BALL_TOUCH_HEIGHT = 2.2;
const BUMP_BOUNCE = 1.5; // more than a plain collision, so a shove is worth going for
const BUMP_MIN = 12;
const BUMP_WAIT = 0.12;

const ITEM_REACH = 2.6;
const ITEM_BACK_AFTER = 7;

export const REPULSE_RADIUS = 18;
const REPULSE_PUSH = 40; // enough to knock someone near the edge off, not everyone anywhere on the track
const REPULSE_LIFT = 6;
const SEEKER_SPEED = 120;
const SEEKER_LIFE = 6;
const SEEKER_REACH = 2.5;
const SEEKER_LIFT = 14;
const SEEKER_KEEP = 0.1; // of the speed the target had
const MINE_BEHIND = 3.5;
const MINE_ARM = 0.7;
const MINE_REACH = 2.3;
const MINE_LIFT = 12;
const TURBO_SECONDS = 2.4;
const SHIELD_SECONDS = 8;
const PULSE_SECONDS = 0.45;

export const START_HEARTS = 3;
const SAFE_AFTER_HIT = 1.5; // seconds a player can't lose another heart
const SILENT_MEANS_GONE = 6; // seconds without a word from someone in a battle
const COUNTDOWN = 3;

// Chances at the front of the pack and at the back: the front gets things to defend with, the back to catch up.
const FRONT_ODDS: [Weapon, number][] = [['mine', 0.35], ['shield', 0.3], ['repulse', 0.25], ['turbo', 0.1], ['seeker', 0]];
const BACK_ODDS: [Weapon, number][] = [['seeker', 0.4], ['turbo', 0.35], ['repulse', 0.2], ['mine', 0.05], ['shield', 0]];

// The rules of one race for one player. Each phone is in charge of its own ball, and hears about the others.
export class Race {
  readonly rivals = new Map<string, Rival>();
  readonly itemWait: number[];
  readonly mines = new Map<string, Mine>();
  readonly seekers = new Map<string, Seeker>();
  readonly pulses: Pulse[] = [];
  lap = 1;
  section = 0;
  weapon: Weapon | null = null;
  shieldLeft = 0;
  finish: number | null = null;
  hearts = START_HEARTS;
  readonly battle: boolean;
  readonly open: boolean; // a track from a start to a finish, not a circuit
  private safeLeft = 0;
  private elapsed = -COUNTDOWN;
  private sendWait = 0;
  private nextEvent = 0;
  private heard = new Set<string>();
  private meIndex = 0;
  private myName = '';

  onCue: ((cue: 'orb' | 'hit' | 'burst' | 'wall') => void) | null = null;
  onCallout: ((text: string, tone: 'good' | 'bad') => void) | null = null;

  constructor(
    readonly course: Course,
    players: RacePlayer[],
    readonly meId: string,
    readonly laps: number,
    private ball: Marble,
    private send: (message: RaceMessage) => void,
    private canBeHit: () => boolean,
  ) {
    this.battle = course.data.kind === 'arena';
    this.open = course.data.kind === 'course';
    this.itemWait = course.itemBoxes.map(() => 0);
    players.forEach((p, index) => {
      if (p.id === meId) {
        this.meIndex = index;
        this.myName = p.name;
        return;
      }
      this.rivals.set(p.id, {
        ...p,
        index,
        x: 0,
        y: -1000,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        heardAt: 0,
        lap: 1,
        section: 0,
        score: 0,
        finish: null,
        shielded: false,
        bumpWait: 0,
        hearts: START_HEARTS,
      });
    });
  }

  get gridSlot(): number {
    return this.meIndex;
  }

  get place(): number {
    return 1 + this.standings().findIndex((s) => s.id === this.meId);
  }

  // A battle has ended for this player: out of hearts, or the only one left.
  get over(): boolean {
    if (!this.battle || this.finish !== null) return false;
    if (this.hearts <= 0) return true;
    return this.rivals.size > 0 && [...this.rivals.values()].every((r) => r.finish !== null);
  }

  private get score(): number {
    if (this.battle) return this.hearts;
    const points = this.course.checkpoints;
    const here = points[this.section];
    const next = points[(this.section + 1) % points.length];
    const whole = Math.hypot(next.x - here.x, next.z - here.z) || 1;
    const left = Math.hypot(next.x - this.ball.x, next.z - this.ball.z);
    const part = Math.max(0, Math.min(1, 1 - left / whole));
    return (this.lap - 1) * points.length + this.section + part;
  }

  standings(): Standing[] {
    const everyone = [
      { id: this.meId, name: this.myName, index: this.meIndex, finish: this.finish, lap: this.lap, score: this.score, hearts: this.hearts },
      ...[...this.rivals.values()].map((r) => ({ id: r.id, name: r.name, index: r.index, finish: r.finish, lap: r.lap, score: r.score, hearts: r.hearts })),
    ];
    return everyone.sort((a, b) => {
      if (this.battle && a.finish !== null && b.finish !== null) return b.hearts - a.hearts || b.finish - a.finish;
      if (this.battle && (a.finish === null) !== (b.finish === null)) return a.finish === null ? -1 : 1;
      if (a.finish !== null && b.finish !== null) return a.finish - b.finish;
      if (a.finish !== null) return -1;
      if (b.finish !== null) return 1;
      return b.score - a.score;
    });
  }

  // Where a rival must be by now, given when it was last heard from.
  rivalAt(r: Rival, out: Point, now = performance.now()): void {
    const age = Math.min(PREDICT_AT_MOST, (now - r.heardAt) / 1000);
    out.x = r.x + r.vx * age;
    out.y = r.y + r.vy * age;
    out.z = r.z + r.vz * age;
  }

  // The marble has rolled onto this cell. Returns true when that ends the race for this player.
  passCell(cell: Cell): boolean {
    if (this.battle) return false;
    if (this.open) {
      if (cell.section > this.section) this.section = cell.section;
      return cell.kind === 'finish';
    }
    const count = this.course.checkpoints.length;
    const ahead = (cell.section - this.section + count) % count;
    if (ahead === 0 || ahead > 2) return false;
    const wrapped = cell.section < this.section;
    this.section = cell.section;
    if (!wrapped) return false;
    this.lap++;
    if (this.lap > this.laps) return true;
    this.onCallout?.(this.lap === this.laps ? 'FINAL LAP' : `LAP ${this.lap}`, 'good');
    return false;
  }

  // The marble went over an edge: which checkpoint it comes back at.
  fell(section: number): number {
    if (!this.battle) return section;
    this.loseHeart();
    this.section = Math.floor(Math.random() * this.course.checkpoints.length);
    return this.section;
  }

  private loseHeart(): void {
    if (!this.battle || this.safeLeft > 0 || this.hearts <= 0) return;
    this.hearts--;
    this.safeLeft = SAFE_AFTER_HIT;
    if (this.hearts > 0) this.onCallout?.(this.hearts === 1 ? 'LAST HEART' : 'HEART LOST', 'bad');
  }

  // Every physics step, for what the ball can run into.
  step(dt: number): void {
    const b = this.ball;
    this.shieldLeft = Math.max(0, this.shieldLeft - dt);
    this.safeLeft = Math.max(0, this.safeLeft - dt);
    this.bumpRivals(dt);
    this.pickUpItems();
    for (const [key, mine] of this.mines) {
      mine.armIn -= dt;
      if (mine.armIn > 0) continue;
      if (Math.hypot(mine.x - b.x, mine.z - b.z) < MINE_REACH && Math.abs(mine.y - b.y) < 2) {
        this.mines.delete(key);
        this.event('mineGone', { mine: key });
        this.knocked('MINE', MINE_LIFT);
      }
    }
  }

  // Each player works out their own half of a collision from the same two balls.
  private bumpRivals(dt: number): void {
    const b = this.ball;
    const at = { x: 0, y: 0, z: 0 };
    for (const r of this.rivals.values()) {
      r.bumpWait = Math.max(0, r.bumpWait - dt);
      if (r.heardAt === 0 || r.finish !== null) continue;
      this.rivalAt(r, at);
      const dx = b.x - at.x;
      const dz = b.z - at.z;
      const d = Math.hypot(dx, dz);
      if (d >= BALL_TOUCH || d < 0.001 || Math.abs(b.y - at.y) > BALL_TOUCH_HEIGHT) continue;
      const nx = dx / d;
      const nz = dz / d;
      // Half of the overlap each, since the other phone moves its ball too.
      b.x += nx * (BALL_TOUCH - d) * 0.5;
      b.z += nz * (BALL_TOUCH - d) * 0.5;
      if (r.bumpWait > 0) continue;
      const closing = (b.vx - r.vx) * nx + (b.vz - r.vz) * nz;
      if (closing >= 0) continue;
      const shove = Math.max(BUMP_MIN, -closing * BUMP_BOUNCE * 0.5);
      b.vx += nx * shove;
      b.vz += nz * shove;
      r.bumpWait = BUMP_WAIT;
      this.onCue?.('wall');
    }
  }

  private pickUpItems(): void {
    const b = this.ball;
    const boxes = this.course.itemBoxes;
    for (let i = 0; i < boxes.length; i++) {
      if (this.itemWait[i] > 0) continue;
      const box = boxes[i];
      if (Math.hypot(box.x - b.x, box.z - b.z) > ITEM_REACH || Math.abs(box.y - b.y) > 5) continue;
      this.itemWait[i] = ITEM_BACK_AFTER;
      if (this.weapon) continue;
      this.weapon = this.roll();
      this.onCue?.('orb');
    }
  }

  private roll(): Weapon {
    const count = this.rivals.size + 1;
    const behind = count > 1 && !this.battle ? (this.place - 1) / (count - 1) : 0.5;
    let pick = Math.random();
    for (const weapon of Object.keys(WEAPON_NAMES) as Weapon[]) {
      const front = FRONT_ODDS.find(([w]) => w === weapon)![1];
      const back = BACK_ODDS.find(([w]) => w === weapon)![1];
      pick -= front + (back - front) * behind;
      if (pick <= 0) return weapon;
    }
    return 'turbo';
  }

  // Spends what is held. False if nothing is, so the tap can mean something else.
  useWeapon(): boolean {
    const weapon = this.weapon;
    if (!weapon) return false;
    const b = this.ball;
    if (weapon === 'seeker' && !this.seekerTarget()) return true; // nobody to send it at yet: keep it
    this.weapon = null;
    this.onCue?.('burst');
    switch (weapon) {
      case 'turbo':
        b.burstLeft = TURBO_SECONDS;
        break;
      case 'shield':
        this.shieldLeft = SHIELD_SECONDS;
        break;
      case 'repulse':
        this.pulses.push({ x: b.x, y: b.y, z: b.z, age: 0 });
        this.event('repulse', {});
        break;
      case 'mine': {
        const speed = Math.hypot(b.vx, b.vz) || 1;
        const x = b.x - (b.vx / speed) * MINE_BEHIND;
        const z = b.z - (b.vz / speed) * MINE_BEHIND;
        const key = `${this.meId}:${this.nextEvent}`;
        this.mines.set(key, { key, x, y: b.y, z, armIn: MINE_ARM });
        this.event('mine', { mine: key, x, z });
        break;
      }
      case 'seeker': {
        const target = this.seekerTarget()!;
        const key = `${this.meId}:${this.nextEvent}`;
        this.seekers.set(key, { key, x: b.x, y: b.y, z: b.z, target, life: SEEKER_LIFE });
        this.event('seeker', { mine: key, target });
        break;
      }
    }
    return true;
  }

  // The ball just ahead, or if leading, the one just behind.
  private seekerTarget(): string | undefined {
    if (this.battle) {
      const at = { x: 0, y: 0, z: 0 };
      let nearest: string | undefined;
      let distance = Infinity;
      for (const r of this.rivals.values()) {
        if (r.finish !== null || r.heardAt === 0) continue;
        this.rivalAt(r, at);
        const d = Math.hypot(at.x - this.ball.x, at.z - this.ball.z);
        if (d < distance) {
          distance = d;
          nearest = r.id;
        }
      }
      return nearest;
    }
    const order = this.standings().filter((s) => s.finish === null);
    const i = order.findIndex((s) => s.id === this.meId);
    return order[i - 1]?.id ?? order[i + 1]?.id;
  }

  private event(w: RaceEvent['w'], extra: Partial<RaceEvent>): void {
    const b = this.ball;
    const message: RaceEvent = { t: 'f', id: this.meId, n: this.nextEvent++, w, x: b.x, y: b.y, z: b.z, ...extra };
    this.send(message);
    setTimeout(() => this.send(message), RESEND_AFTER);
  }

  receive(m: RaceMessage): void {
    const r = this.rivals.get(m.id);
    if (!r) return;
    if (m.t === 's') {
      r.x = m.x;
      r.y = m.y;
      r.z = m.z;
      r.vx = m.vx;
      r.vy = m.vy;
      r.vz = m.vz;
      r.lap = m.lap;
      r.section = m.sec;
      r.score = m.score;
      r.finish = m.fin;
      r.shielded = m.sh;
      r.hearts = Number.isFinite(m.h) ? m.h : r.hearts;
      r.heardAt = performance.now();
      return;
    }
    const id = `${m.id}:${m.n}`;
    if (this.heard.has(id)) return;
    this.heard.add(id);
    switch (m.w) {
      case 'repulse':
        this.pulses.push({ x: m.x, y: m.y, z: m.z, age: 0 });
        this.repulsed(m.x, m.z);
        break;
      case 'mine':
        if (m.mine) this.mines.set(m.mine, { key: m.mine, x: m.x, y: m.y, z: m.z, armIn: MINE_ARM });
        break;
      case 'mineGone':
        if (m.mine) this.mines.delete(m.mine);
        break;
      case 'seeker':
        if (m.mine && m.target) this.seekers.set(m.mine, { key: m.mine, x: m.x, y: m.y, z: m.z, target: m.target, life: SEEKER_LIFE });
        break;
    }
  }

  private repulsed(fromX: number, fromZ: number): void {
    if (!this.canBeHit()) return;
    const b = this.ball;
    const dx = b.x - fromX;
    const dz = b.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d > REPULSE_RADIUS) return;
    if (this.absorbed()) return;
    const push = REPULSE_PUSH * (1 - d / REPULSE_RADIUS) + REPULSE_PUSH * 0.3;
    const ux = d > 0.01 ? dx / d : 1;
    const uz = d > 0.01 ? dz / d : 0;
    b.vx += ux * push;
    b.vz += uz * push;
    b.vy = REPULSE_LIFT;
    b.grounded = false;
    this.onCue?.('hit');
    this.onCallout?.('REPULSED', 'bad');
  }

  private knocked(text: string, lift: number): void {
    if (!this.canBeHit() || this.absorbed()) return;
    const b = this.ball;
    b.vx *= SEEKER_KEEP;
    b.vz *= SEEKER_KEEP;
    b.vy = lift;
    b.grounded = false;
    this.onCue?.('hit');
    this.onCallout?.(text, 'bad');
    this.loseHeart();
  }

  private absorbed(): boolean {
    if (this.shieldLeft <= 0) return false;
    this.shieldLeft = 0;
    this.onCue?.('wall');
    this.onCallout?.('BLOCKED', 'good');
    return true;
  }

  // Every frame, whether or not the marble is rolling: this keeps going after a player finishes.
  tick(dt: number): void {
    for (let i = 0; i < this.itemWait.length; i++) this.itemWait[i] = Math.max(0, this.itemWait[i] - dt);
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i].age += dt / PULSE_SECONDS;
      if (this.pulses[i].age >= 1) this.pulses.splice(i, 1);
    }
    this.moveSeekers(dt);
    this.elapsed += dt;
    if (this.battle) this.forgetTheSilent();

    this.sendWait -= dt;
    if (this.sendWait > 0) return;
    this.sendWait = SEND_EVERY;
    const b = this.ball;
    this.send({
      t: 's',
      id: this.meId,
      x: round(b.x),
      y: round(b.y),
      z: round(b.z),
      vx: round(b.vx),
      vy: round(b.vy),
      vz: round(b.vz),
      lap: this.lap,
      sec: this.section,
      score: round(this.score),
      fin: this.finish,
      sh: this.shieldLeft > 0 || this.safeLeft > 0,
      h: this.hearts,
    });
  }

  // Someone who stops being heard from, in a battle, is out, so that it can still end.
  private forgetTheSilent(): void {
    const now = performance.now();
    for (const r of this.rivals.values()) {
      if (r.finish !== null) continue;
      const silence = r.heardAt > 0 ? (now - r.heardAt) / 1000 : this.elapsed + COUNTDOWN;
      if (silence < SILENT_MEANS_GONE) continue;
      r.finish = Math.max(0, this.elapsed);
      r.hearts = 0;
    }
  }

  // A seeker flies over everything to its target. Whoever it was sent at decides that it struck.
  private moveSeekers(dt: number): void {
    const at = { x: 0, y: 0, z: 0 };
    for (const [key, s] of this.seekers) {
      s.life -= dt;
      const rival = this.rivals.get(s.target);
      if (s.target === this.meId) {
        at.x = this.ball.x;
        at.y = this.ball.y;
        at.z = this.ball.z;
      } else if (rival) {
        this.rivalAt(rival, at);
      } else {
        s.life = 0;
      }
      const dx = at.x - s.x;
      const dy = at.y - s.y;
      const dz = at.z - s.z;
      const d = Math.hypot(dx, dy, dz);
      if (s.life <= 0 || d < SEEKER_REACH) {
        this.seekers.delete(key);
        if (s.life > 0 && s.target === this.meId) this.knocked('SEEKER', SEEKER_LIFT);
        continue;
      }
      const move = Math.min(d, SEEKER_SPEED * dt) / d;
      s.x += dx * move;
      s.y += dy * move;
      s.z += dz * move;
    }
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
