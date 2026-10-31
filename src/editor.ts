import { Course, type CourseData, type CourseOp, type Dir, type Kind } from './course';
import { MAX_TRACK_BYTES, MAX_TRACK_OPS, type MyTrack } from './myTracks';
import { boost, finish, jump, lasers, loop, magnets, maze, pistons, rally, start } from './pieces';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const SURFACES: [string, Kind][] = [['Plain', 'plain'], ['Fast', 'fast'], ['Ice', 'ice'], ['Crumbling', 'crumble'], ['Rough', 'maze']];
const SLOPES: [string, number][] = [['Down', -1], ['Level', 0], ['Up', 1]];
const WIDTHS = [6, 8, 10, 12];
const LENGTHS = [8, 16, 32, 64];
const SLOPE_RISE = 0.18; // of the length

function choices<T>(holder: HTMLElement, options: [string, T][], current: () => T, pick: (value: T) => void): void {
  const draw = (): void => {
    holder.replaceChildren();
    for (const [label, value] of options) {
      const b = document.createElement('button');
      b.textContent = label;
      if (value === current()) b.className = 'chosen';
      b.addEventListener('click', () => {
        pick(value);
        draw();
      });
      holder.append(b);
    }
  };
  draw();
}

// Building a track a piece at a time, with the whole of it drawn from above.
export class TrackEditor {
  private pieces: CourseOp[][] = [];
  private id = '';
  private surface: Kind = 'plain';
  private slope = 0;
  private width = 10;
  private length = 16;
  private seed = 1;

  onTest: ((track: CourseData) => void) | null = null;
  onSave: ((track: MyTrack) => boolean) | null = null;

  constructor() {
    choices($('editSurface'), SURFACES, () => this.surface, (v) => (this.surface = v));
    choices($('editSlope'), SLOPES, () => this.slope, (v) => (this.slope = v));
    choices($('editWidth'), WIDTHS.map((w): [string, number] => [`${w} wide`, w]), () => this.width, (v) => (this.width = v));
    choices($('editLength'), LENGTHS.map((l): [string, number] => [`${l} long`, l]), () => this.length, (v) => (this.length = v));

    for (const [id, dir] of [['editN', 'N'], ['editE', 'E'], ['editS', 'S'], ['editW', 'W']] as [string, Dir][]) {
      $(id).addEventListener('click', () => this.addRun(dir));
    }
    const extras: [string, () => CourseOp[]][] = [
      ['editBoost', () => boost(this.width, this.dir)],
      ['editJump', () => jump(this.width, 14, this.dir)],
      ['editLoop', () => loop()],
      ['editPads', () => rally([0, 8, -8], 10)],
      ['editMaze', () => maze(this.seed++, 5, 5)],
      ['editPiston', () => pistons(1, this.width, 3, this.dir)],
      ['editLaser', () => lasers(1, this.width, 2.6, this.dir)],
      ['editMagnet', () => magnets(1, this.width, this.dir)],
    ];
    for (const [id, make] of extras) $(id).addEventListener('click', () => this.add(make()));
    $('editUndo').addEventListener('click', () => {
      this.pieces.pop();
      this.say('');
      this.draw();
    });
    $('editTest').addEventListener('click', () => this.onTest?.(this.data()));
    $('editSave').addEventListener('click', () => {
      const saved = this.onSave?.({ ...this.data(), pieces: this.pieces });
      this.say(saved ? 'Saved.' : 'Could not save it.');
    });
  }

  open(track?: MyTrack): void {
    this.pieces = track ? track.pieces.map((p) => [...p]) : [];
    this.id = track?.id ?? `custom-${crypto.randomUUID()}`;
    $<HTMLInputElement>('editName').value = track?.name ?? 'My track';
    this.say('');
    this.draw();
  }

  draw(): void {
    const course = new Course(this.data());
    const here = this.dir;
    for (const [id, dir] of [['editN', 'N'], ['editE', 'E'], ['editS', 'S'], ['editW', 'W']] as [string, Dir][]) {
      $<HTMLButtonElement>(id).disabled = dir === OPPOSITE[here];
    }
    // These always head north.
    for (const id of ['editLoop', 'editPads', 'editMaze']) $<HTMLButtonElement>(id).disabled = here === 'S';
    $<HTMLButtonElement>('editUndo').disabled = this.pieces.length === 0;
    this.drawMap(course);
  }

  private get dir(): Dir {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      for (let j = this.pieces[i].length - 1; j >= 0; j--) {
        const op = this.pieces[i][j];
        if (op.op === 'run') return op.dir;
      }
    }
    return 'N';
  }

  private get lastWidth(): number {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      for (let j = this.pieces[i].length - 1; j >= 0; j--) {
        const op = this.pieces[i][j];
        if (op.op === 'run') return op.width;
      }
    }
    return this.width;
  }

  private opsOf(pieces: CourseOp[][]): CourseOp[] {
    const first = pieces.flat().find((op) => op.op === 'run');
    const width = first?.op === 'run' ? first.width : this.width;
    return [...start(width), ...pieces.flat()];
  }

  private data(): CourseData {
    const name = $<HTMLInputElement>('editName').value.trim().slice(0, 32) || 'My track';
    return { version: 1, id: this.id, name, kind: 'course', ops: [...this.opsOf(this.pieces), ...finish(this.lastWidth, this.dir)] };
  }

  private addRun(dir: Dir): void {
    const rise = this.slope * this.length * SLOPE_RISE;
    this.add([{ op: 'run', dir, len: this.length, width: this.width, kind: this.surface === 'plain' ? undefined : this.surface, rise }]);
  }

  // A piece that would land on the track already there, or make it too much to share, is refused.
  private add(piece: CourseOp[]): void {
    const pieces = [...this.pieces, piece];
    const ops = this.opsOf(pieces);
    const end = new Course({ version: 1, id: 'x', name: 'x', ops }).end.dir ?? 'N';
    const course = new Course({ version: 1, id: 'x', name: 'x', ops: [...ops, ...finish(this.lastWidth, end)] });
    if (course.overlaps > 0) return this.say('That would run over the track already there.');
    if (ops.length > MAX_TRACK_OPS || JSON.stringify(ops).length > MAX_TRACK_BYTES) return this.say('The track is as long as it can be.');
    this.pieces = pieces;
    this.say('');
    this.draw();
  }

  private say(text: string): void {
    $('editMessage').textContent = text;
  }

  private drawMap(course: Course): void {
    const canvas = $<HTMLCanvasElement>('editMap');
    const ratio = devicePixelRatio || 1;
    const w = (canvas.width = Math.max(1, canvas.clientWidth * ratio));
    const h = (canvas.height = Math.max(1, canvas.clientHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) return;
    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue('--ink');
    const accent = style.getPropertyValue('--accent');
    let minX = 0;
    let maxX = 0;
    let minZ = 0;
    let maxZ = 0;
    for (const c of course.list) {
      minX = Math.min(minX, c.ix);
      maxX = Math.max(maxX, c.ix);
      minZ = Math.min(minZ, c.iz);
      maxZ = Math.max(maxZ, c.iz);
    }
    const scale = Math.min(w / (maxX - minX + 8), h / (maxZ - minZ + 8));
    const left = (w - (maxX - minX + 1) * scale) / 2 - minX * scale;
    const top = (h - (maxZ - minZ + 1) * scale) / 2 - minZ * scale;
    const size = Math.max(1, Math.ceil(scale));
    context.clearRect(0, 0, w, h);
    for (const c of course.list) {
      const special = c.kind === 'finish' || c.kind === 'boost' || c.kind === 'pad';
      context.fillStyle = special ? accent : ink;
      context.globalAlpha = special ? 1 : c.kind === 'wall' ? 0.9 : c.kind === 'fast' ? 0.65 : c.kind === 'ice' ? 0.3 : 0.45;
      context.fillRect(left + c.ix * scale, top + c.iz * scale, size, size);
    }
    context.globalAlpha = 1;
  }
}
