import * as THREE from 'three';
import { CELL, DIR_VEC, loopPoint, type Cell, type Course, type Laser, type Loop, type Magnet, type Piston } from './course';
import type { Game } from './game';
import { JOY_BALL, VALLEY, type BallTheme, type WorldTheme } from './themes';

const BALL_RADIUS = 1.05;
const BALL_MAX_GROWTH = 2; // extra size, as a multiple, at great height
const BALL_GROWTH_HEIGHT = 7; // height that gives about two thirds of it
const SHADOW_DRIFT = 0.3; // the sun is off to one side: the higher the marble, the further away its shadow
const LOOP_SEGMENTS = 36;
const LOOP_RAIL_THICK = 0.5;
const LOOP_TIE_EVERY = 4;
const CLIFF_DEPTH = 14;
const CRUMBLE_DEPTH = 3;
const CRUMBLE_DROP = 22;
const CRUMBLE_SHAKE = 0.12;
const GONE = new THREE.Vector3(0, 0, 0);
const STREAKS = 34;
const STREAK_RANGE = 42;
const RINGS_PER_HOP = 3;
const ORB_RADIUS = 0.9;
const PISTON_DEPTH = 12;
const LASER_THICK = 0.35;
const EMITTER_WIDTH = 1.8;
const EMITTER_HEIGHT = 3.2;
const LASER_GUIDE_WIDTH = 0.5;
const LENS_SIZES = [0.5, 1, 1.5]; // off, charging, firing

// Three layers at different depths, moving at different speeds on screen, as in Sonic:
// foreground slabs rush past near the lens, the course is the middle, towers drift below.
const FRONT_COUNT = 12;
const FRONT_SPAN = 110;
const FRONT_MIN_HEIGHT = 48;
const FRONT_HEIGHT_RANGE = 24;
const FRONT_OPACITY = 0.42;
const FRONT_FROM_SPEED = 28;
const BACK_COUNT = 46;
const BACK_SPAN = 220;

const DEG = Math.PI / 180;
const CAMERA_ELEVATION = 78 * DEG;
const PARALLAX_SIDE = 12 * DEG;
const PARALLAX_ELEVATION = 9 * DEG;
const FOV_SLOW = 30;
const FOV_FAST = 52;
const DIST_SLOW = 100;
const DIST_FAST = 122;
const SPEED_FOR_FAST = 95;
const LOOK_AHEAD_SECONDS = 0.32;
const BALL_LOW_ON_SCREEN = 0.17; // fraction of camera distance the view centre sits above the ball
const STREAK_FROM_SPEED = 26;

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface Drifter {
  x: number;
  y: number;
  z: number;
  scale: THREE.Vector3;
}

export class View {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_SLOW, 1, 5, 800);
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;
  private streaks: THREE.InstancedMesh;
  private streakOffsets: THREE.Vector3[] = [];
  private front: THREE.InstancedMesh;
  private frontMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  private frontItems: Drifter[] = [];
  private back: THREE.InstancedMesh;
  private backMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  private backItems: Drifter[] = [];
  private chevronMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  private rings: THREE.InstancedMesh | null = null;
  private ringBase: THREE.Matrix4[] = [];
  private orbs: THREE.InstancedMesh | null = null;
  private crumbles: THREE.InstancedMesh | null = null;
  private crumbleCells: Cell[] = [];
  private pistons: THREE.InstancedMesh | null = null;
  private pistonShadows: THREE.InstancedMesh | null = null;
  private pistonItems: Piston[] = [];
  private lasers: THREE.InstancedMesh | null = null;
  private laserMaterial: THREE.MeshBasicMaterial;
  private laserItems: Laser[] = [];
  private laserLenses: THREE.InstancedMesh | null = null;
  private magnets: THREE.InstancedMesh | null = null;
  private magnetItems: Magnet[] = [];

  private sky: THREE.Color;
  private jumpSpace: THREE.Color;
  private backInSpace: THREE.Color;
  private bg: THREE.Color;
  private spaceMix = 0;

  private target = new THREE.Vector3();
  private wantTarget = new THREE.Vector3();
  private dist = DIST_SLOW;
  private fast = 0;
  private tiltX = 0;
  private tiltY = 0;
  private snap = true;

  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private identity = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private zAxis = new THREE.Vector3(0, 0, 1);
  private flatRing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  private color = new THREE.Color();

  constructor(
    private game: Game,
    private theme: WorldTheme = VALLEY,
    ballTheme: BallTheme = JOY_BALL,
  ) {
    this.sky = new THREE.Color(theme.sky);
    this.jumpSpace = new THREE.Color(theme.jumpSpace);
    this.backInSpace = new THREE.Color(theme.backInJumpSpace);
    this.bg = this.sky.clone();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    document.body.prepend(this.renderer.domElement);
    this.scene.background = this.bg;
    // Looking almost straight down, screen up must stay along the course or side tilt rolls the picture.
    this.camera.up.set(0, 0, -1);

    this.scene.add(new THREE.HemisphereLight(theme.lightSky, theme.lightGround, 1.5));
    const sun = new THREE.DirectionalLight(theme.sun, 2.2);
    sun.position.set(-0.5, 1, 0.65);
    this.scene.add(sun);

    this.laserMaterial = new THREE.MeshBasicMaterial({ color: theme.laser, transparent: true, depthWrite: false });

    const course = game.course;
    this.buildBlocks(course);
    this.buildCrumbles(course);
    this.buildChevrons(course);
    this.buildRings(course);
    this.buildOrbs(course);
    this.buildHazards(course);
    this.buildLoops(course);

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.back = new THREE.InstancedMesh(box, this.backMaterial, BACK_COUNT);
    this.back.frustumCulled = false;
    this.front = new THREE.InstancedMesh(box, this.frontMaterial, FRONT_COUNT);
    this.front.frustumCulled = false;
    this.front.renderOrder = 2;
    this.scene.add(this.back, this.front);
    this.seedLayers();

    this.ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(BALL_RADIUS, 1),
      new THREE.MeshMatcapMaterial({ matcap: makeMatcap(ballTheme), flatShading: true }),
    );
    this.scene.add(this.ball);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_RADIUS, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#4a3b52', transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.scene.add(this.shadow);

    this.streaks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.05, 1),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }),
      STREAKS,
    );
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);
    for (let i = 0; i < STREAKS; i++) {
      this.streakOffsets.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2 * STREAK_RANGE,
          3 + Math.random() * 8,
          (Math.random() - 0.5) * 2 * STREAK_RANGE,
        ),
      );
    }

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resetCamera(): void {
    this.snap = true;
  }

  private tintedBox(): THREE.BoxGeometry {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const positions = box.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const top = positions.getY(i) > 0;
      colors[i * 3] = top ? 1 : 0.86;
      colors[i * 3 + 1] = top ? 1 : 0.68;
      colors[i * 3 + 2] = top ? 1 : 0.72;
    }
    box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return box;
  }

  // One box per grid cell in a single draw call. Sloped cells are the same box, sheared.
  private buildBlocks(course: Course): void {
    const solid = course.list.filter((c) => c.kind !== 'crumble');
    const blocks = new THREE.InstancedMesh(
      this.tintedBox(),
      new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true }),
      solid.length,
    );
    const size = CELL + 0.01;
    solid.forEach((c, i) => {
      const cx = (c.ix + 0.5) * CELL;
      const cz = (c.iz + 0.5) * CELL;
      const top = c.h + (c.sx + c.sz) * (CELL / 2);
      this.m.set(
        size, 0, 0, cx,
        c.sx * size, CLIFF_DEPTH, c.sz * size, top - CLIFF_DEPTH / 2,
        0, 0, size, cz,
        0, 0, 0, 1,
      );
      blocks.setMatrixAt(i, this.m);
      blocks.setColorAt(i, this.color.set(this.theme.tones[c.kind][toneIndex(c)]));
    });
    this.scene.add(blocks);
  }

  // Kept apart from the other blocks so only these few are re-uploaded while they fall.
  private buildCrumbles(course: Course): void {
    this.crumbleCells = course.list.filter((c) => c.kind === 'crumble');
    if (this.crumbleCells.length === 0) return;
    this.crumbles = new THREE.InstancedMesh(
      this.tintedBox(),
      new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true }),
      this.crumbleCells.length,
    );
    this.crumbles.frustumCulled = false;
    this.crumbleCells.forEach((c, i) => {
      this.crumbles!.setColorAt(i, this.color.set(this.theme.tones.crumble[toneIndex(c)]));
    });
    this.scene.add(this.crumbles);
  }

  private updateCrumbles(): void {
    const mesh = this.crumbles;
    if (!mesh) return;
    const world = this.game.world;
    const time = performance.now() * 0.05;
    this.sc.set(CELL + 0.01, CRUMBLE_DEPTH, CELL + 0.01);
    this.crumbleCells.forEach((c, i) => {
      const state = world.crumbleState(c);
      const shake = state > 0 && state < 1 ? Math.sin(time + i) * CRUMBLE_SHAKE : 0;
      const fall = state > 1 ? (state - 1) * (state - 1) * CRUMBLE_DROP : 0;
      this.v.set((c.ix + 0.5) * CELL + shake, c.h - CRUMBLE_DEPTH / 2 - fall, (c.iz + 0.5) * CELL);
      this.m.compose(this.v, this.identity, state >= 2 ? GONE : this.sc);
      mesh.setMatrixAt(i, this.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private seedLayers(): void {
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const tones = this.theme.back;
    for (let i = 0; i < BACK_COUNT; i++) {
      const wide = 4 + rand() * 7;
      const tall = 18 + rand() * 30;
      this.backItems.push({
        x: rand() * BACK_SPAN,
        y: -55 - rand() * 80 - tall / 2,
        z: rand() * BACK_SPAN,
        scale: new THREE.Vector3(wide, tall, wide),
      });
      this.back.setColorAt(i, this.color.set(tones[i % tones.length]));
    }
    for (let i = 0; i < FRONT_COUNT; i++) {
      this.frontItems.push({
        x: rand() * FRONT_SPAN,
        y: FRONT_MIN_HEIGHT + rand() * FRONT_HEIGHT_RANGE,
        z: rand() * FRONT_SPAN,
        scale: new THREE.Vector3(3 + rand() * 7, 0.4, 10 + rand() * 18),
      });
    }
  }

  private buildChevrons(course: Course): void {
    const rows = new Map<string, Cell[]>();
    for (const c of course.list) {
      if ((c.kind !== 'boost' && c.kind !== 'launch') || !c.dir) continue;
      const id = `${c.section}:${c.dir === 'N' ? c.iz : c.ix}`;
      if (!rows.has(id)) rows.set(id, []);
      rows.get(id)!.push(c);
    }

    const shape = new THREE.Shape();
    shape.moveTo(-1.6, -0.5);
    shape.lineTo(0, 0.7);
    shape.lineTo(1.6, -0.5);
    shape.lineTo(1.6, -1.2);
    shape.lineTo(0, 0);
    shape.lineTo(-1.6, -1.2);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);

    const chevrons = new THREE.InstancedMesh(geometry, this.chevronMaterial, rows.size);
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const row of rows.values()) {
      const c = row[0];
      const x = row.reduce((sum, r) => sum + (r.ix + 0.5) * CELL, 0) / row.length;
      const z = row.reduce((sum, r) => sum + (r.iz + 0.5) * CELL, 0) / row.length;
      // Flat on the middle of the block, lifted clear on a launch ramp's slope.
      dummy.position.set(x, c.h + (c.sx + c.sz) * (CELL / 2) + (c.kind === 'launch' ? 0.45 : 0.06), z);
      dummy.rotation.set(0, c.dir === 'W' ? Math.PI / 2 : c.dir === 'E' ? -Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      chevrons.setMatrixAt(i++, dummy.matrix);
    }
    this.scene.add(chevrons);
  }

  // Rings along each hop's arc, spinning while Jump-Space is open.
  private buildRings(course: Course): void {
    const hops = [...course.hops.values()];
    if (hops.length === 0) return;
    const rings = new THREE.InstancedMesh(
      new THREE.TorusGeometry(5, 0.2, 4, 6),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      hops.length * RINGS_PER_HOP,
    );
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const hop of hops) {
      for (let r = 0; r < RINGS_PER_HOP; r++) {
        const f = (r + 1) / (RINGS_PER_HOP + 1);
        dummy.position.set(
          hop.from.x + (hop.to.x - hop.from.x) * f,
          hop.from.y + (hop.to.y - hop.from.y) * f + Math.sin(f * Math.PI) * 5,
          hop.from.z + (hop.to.z - hop.from.z) * f,
        );
        dummy.rotation.set(0, Math.atan2(hop.to.x - hop.from.x, hop.to.z - hop.from.z), 0);
        dummy.updateMatrix();
        this.ringBase.push(dummy.matrix.clone());
        rings.setMatrixAt(i, dummy.matrix);
        rings.setColorAt(i, this.color.setHSL(0.52 + i * 0.03, 0.9, 0.7));
        i++;
      }
    }
    rings.visible = false;
    this.rings = rings;
    this.scene.add(rings);
  }

  // Two rails and a few ties, not a solid road: from above, a floor overhead would hide the marble.
  private buildLoops(course: Course): void {
    if (course.loops.length === 0) return;
    const ties = Math.ceil(LOOP_SEGMENTS / LOOP_TIE_EVERY);
    const parts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: this.theme.loop, flatShading: true }),
      course.loops.length * (LOOP_SEGMENTS * 2 + ties),
    );
    parts.frustumCulled = false;
    let i = 0;
    for (const l of course.loops) {
      const d = DIR_VEC[l.dir];
      const side = new THREE.Vector3(-d.z, 0, d.x);
      const radius = l.radius + BALL_RADIUS;
      const from = { x: 0, y: 0, z: 0 };
      const to = { x: 0, y: 0, z: 0 };
      for (let s = 0; s < LOOP_SEGMENTS; s++) {
        loopPoint(l, (s / LOOP_SEGMENTS) * Math.PI * 2, from, radius);
        loopPoint(l, ((s + 1) / LOOP_SEGMENTS) * Math.PI * 2, to, radius);
        i = this.placeLoopSegment(parts, i, l, from, to, side, s);
      }
    }
    this.scene.add(parts);
  }

  private placeLoopSegment(parts: THREE.InstancedMesh, start: number, l: Loop, from: Point3, to: Point3, side: THREE.Vector3, s: number): number {
    let i = start;
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const length = a.distanceTo(b) + 0.2;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.m.lookAt(a, b, side);
    this.q.setFromRotationMatrix(this.m);
    this.sc.set(LOOP_RAIL_THICK, LOOP_RAIL_THICK, length);
    for (const edge of [-1, 1]) {
      this.v.copy(mid).addScaledVector(side, (edge * l.width) / 2);
      parts.setMatrixAt(i++, this.m.compose(this.v, this.q, this.sc));
    }
    if (s % LOOP_TIE_EVERY === 0) {
      this.sc.set(l.width, LOOP_RAIL_THICK * 0.6, LOOP_RAIL_THICK * 0.8);
      const along = b.clone().sub(a).normalize();
      this.m.makeBasis(side, new THREE.Vector3().crossVectors(along, side), along);
      this.q.setFromRotationMatrix(this.m);
      parts.setMatrixAt(i++, this.m.compose(mid, this.q, this.sc));
    }
    return i;
  }

  private buildOrbs(course: Course): void {
    if (course.orbs.length === 0) return;
    this.orbs = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(ORB_RADIUS, 0),
      new THREE.MeshBasicMaterial({ color: this.theme.orb }),
      course.orbs.length,
    );
    this.orbs.frustumCulled = false;
    this.scene.add(this.orbs);
  }

  private updateOrbs(): void {
    const mesh = this.orbs;
    if (!mesh) return;
    const g = this.game;
    const orbs = g.course.orbs;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), performance.now() * 0.003);
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      this.sc.setScalar(g.orbTaken[i] ? 0 : 1);
      this.m.compose(this.v.set(o.x, o.y, o.z), this.q, this.sc);
      mesh.setMatrixAt(i, this.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private buildHazards(course: Course): void {
    this.pistonItems = course.hazards.filter((h): h is Piston => h.type === 'piston');
    this.laserItems = course.hazards.filter((h): h is Laser => h.type === 'laser');
    this.magnetItems = course.hazards.filter((h): h is Magnet => h.type === 'magnet');

    if (this.pistonItems.length > 0) {
      this.pistons = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: this.theme.piston, transparent: true, opacity: 0.7, flatShading: true }),
        this.pistonItems.length,
      );
      this.pistons.frustumCulled = false;
      this.pistons.renderOrder = 1;
      this.pistonShadows = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#2a2040', transparent: true, opacity: 0.32, depthWrite: false }),
        this.pistonItems.length,
      );
      this.pistonShadows.frustumCulled = false;
      this.scene.add(this.pistonShadows, this.pistons);
    }
    if (this.laserItems.length > 0) {
      this.lasers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.laserMaterial, this.laserItems.length);
      this.lasers.frustumCulled = false;
      this.scene.add(this.lasers);
      this.buildLaserEmitters();
    }
    if (this.magnetItems.length > 0) {
      this.magnets = new THREE.InstancedMesh(
        new THREE.TorusGeometry(1, 0.03, 4, 24),
        new THREE.MeshBasicMaterial({ color: this.theme.magnet, transparent: true, opacity: 0.8, depthWrite: false }),
        this.magnetItems.length * 2,
      );
      this.magnets.frustumCulled = false;
      this.scene.add(this.magnets);
    }
  }

  // A post at each end of the beam and a faint line between them, there even while the laser is off,
  // so the player can see the danger before it fires. Lenses on the posts show its charge.
  private buildLaserEmitters(): void {
    const count = this.laserItems.length;
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: this.theme.piston, flatShading: true }),
      count * 2,
    );
    const guides = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.theme.laser, transparent: true, opacity: 0.22, depthWrite: false }),
      count,
    );
    this.laserLenses = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.2, 1),
      new THREE.MeshBasicMaterial({ color: this.theme.laser }),
      count * 2,
    );
    this.laserLenses.frustumCulled = false;
    this.sc.set(EMITTER_WIDTH, EMITTER_HEIGHT, EMITTER_WIDTH);
    this.laserItems.forEach((l, i) => {
      for (let side = 0; side < 2; side++) {
        this.laserEnd(l, side);
        this.v.y = l.y + EMITTER_HEIGHT / 2;
        posts.setMatrixAt(i * 2 + side, this.m.compose(this.v, this.identity, this.sc));
      }
      const guideScale = l.axis === 'x' ? new THREE.Vector3(l.span, 1, LASER_GUIDE_WIDTH) : new THREE.Vector3(LASER_GUIDE_WIDTH, 1, l.span);
      guides.setMatrixAt(i, this.m.compose(this.v.set(l.x, l.y + 0.05, l.z), this.identity, guideScale));
    });
    this.scene.add(posts, guides, this.laserLenses);
  }

  private laserEnd(l: Laser, side: number): void {
    const offset = (side === 0 ? -1 : 1) * (l.span / 2 + EMITTER_WIDTH / 2);
    if (l.axis === 'x') this.v.set(l.x + offset, l.y, l.z);
    else this.v.set(l.x, l.y, l.z + offset);
  }

  private updateHazards(): void {
    const world = this.game.world;
    this.pistonItems.forEach((p, i) => {
      const height = world.pistonHeight(p);
      this.sc.set(p.size, PISTON_DEPTH, p.size);
      this.m.compose(this.v.set(p.x, p.y + height + PISTON_DEPTH / 2, p.z), this.identity, this.sc);
      this.pistons!.setMatrixAt(i, this.m);
      this.sc.set(p.size, 1, p.size);
      this.m.compose(this.v.set(p.x, p.y + 0.05, p.z), this.identity, this.sc);
      this.pistonShadows!.setMatrixAt(i, this.m);
    });
    if (this.pistons) {
      this.pistons.instanceMatrix.needsUpdate = true;
      this.pistonShadows!.instanceMatrix.needsUpdate = true;
    }

    let brightest = 0;
    this.laserItems.forEach((l, i) => {
      const state = world.laserState(l);
      brightest = Math.max(brightest, state);
      const thick = state === 2 ? LASER_THICK * 2 : state === 1 ? LASER_THICK * 0.5 : 0;
      if (l.axis === 'x') this.sc.set(l.span, thick, thick);
      else this.sc.set(thick, thick, l.span);
      this.m.compose(this.v.set(l.x, l.y + 1, l.z), this.identity, this.sc);
      this.lasers!.setMatrixAt(i, this.m);

      const lens = LENS_SIZES[state];
      this.sc.set(lens, 1, lens);
      for (let side = 0; side < 2; side++) {
        this.laserEnd(l, side);
        this.v.y = l.y + EMITTER_HEIGHT + 0.1;
        this.laserLenses!.setMatrixAt(i * 2 + side, this.m.compose(this.v, this.identity, this.sc));
      }
    });
    if (this.laserLenses) this.laserLenses.instanceMatrix.needsUpdate = true;
    if (this.lasers) {
      this.lasers.instanceMatrix.needsUpdate = true;
      this.laserMaterial.opacity = brightest === 2 ? 1 : 0.5;
    }

    // Rings closing in on the centre show which way the pull goes.
    const pulse = (performance.now() * 0.0007) % 1;
    this.magnetItems.forEach((g, i) => {
      for (let r = 0; r < 2; r++) {
        const f = 1 - ((pulse + r * 0.5) % 1);
        this.sc.set(g.radius * f, g.radius * f, 1);
        this.m.compose(this.v.set(g.x, g.y + 0.1, g.z), this.flatRing, this.sc);
        this.magnets!.setMatrixAt(i * 2 + r, this.m);
      }
    });
    if (this.magnets) this.magnets.instanceMatrix.needsUpdate = true;
  }

  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    const g = this.game;
    const b = g.ball;
    this.ball.position.set(b.x, b.y + BALL_RADIUS, b.z);
    // From this high up, height barely shows on its own: grow the marble as it rises,
    // measured from where it left the ground so crossing a gap doesn't change its size.
    const groundBelow = g.world.surface(b.x, b.z);
    const height = Math.max(0, b.y - g.groundY);
    const growth = BALL_MAX_GROWTH * (1 - Math.exp(-height / BALL_GROWTH_HEIGHT));
    this.ball.scale.setScalar(1 + growth);

    const speed = b.speed;
    if (speed > 0.01) {
      this.v.set(b.vz / speed, 0, -b.vx / speed);
      this.q.setFromAxisAngle(this.v, (speed * dt) / BALL_RADIUS);
      this.ball.quaternion.premultiply(this.q);
    }

    this.shadow.visible = groundBelow > -Infinity;
    if (this.shadow.visible) {
      const above = Math.max(0, b.y - groundBelow);
      this.shadow.position.set(b.x + above * SHADOW_DRIFT, groundBelow + 0.05, b.z - above * SHADOW_DRIFT * 0.6);
      this.shadow.scale.setScalar(Math.max(0.3, 1 - above * 0.05));
    }

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
    this.chevronMaterial.color.setRGB(0.85 + pulse * 0.15, 1, 0.85 + pulse * 0.15);

    this.updateCamera(dt, g.speed);
    this.updateSpace(dt);
    this.updateStreaks(speed);
    this.updateLayers(speed);
    this.updateOrbs();
    this.updateCrumbles();
    this.updateHazards();
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number, speed: number): void {
    const b = this.game.ball;
    const g = this.game;
    const wantFast = Math.min(1, speed / SPEED_FOR_FAST);
    this.fast += (wantFast - this.fast) * (1 - Math.exp(-dt * 3));
    // Widening the lens rather than only pulling back: the road stretches and rushes at the edges.
    this.dist = DIST_SLOW + (DIST_FAST - DIST_SLOW) * this.fast;
    const fov = FOV_SLOW + (FOV_FAST - FOV_SLOW) * this.fast;
    if (Math.abs(fov - this.camera.fov) > 0.02) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Keep the marble low on screen with the road ahead of it above.
    // In a loop it comes back on itself, and looking ahead would throw the view back and forth.
    const ahead = g.state === 'loop' ? 0 : LOOK_AHEAD_SECONDS;
    this.wantTarget.set(
      b.x + b.vx * ahead,
      g.state === 'loop' ? g.groundY : b.y,
      b.z + b.vz * ahead - this.dist * BALL_LOW_ON_SCREEN,
    );
    const follow = this.snap ? 1 : 1 - Math.exp(-dt * 6);
    this.target.lerp(this.wantTarget, follow);

    // Tilting the phone tilts the table: the eye swings the opposite way around the marble,
    // so blocks and the deep towers slide against each other.
    const smooth = 1 - Math.exp(-dt * 9);
    this.tiltX += (g.tiltX - this.tiltX) * smooth;
    this.tiltY += (g.tiltY - this.tiltY) * smooth;
    const side = this.tiltX * PARALLAX_SIDE;
    const elevation = CAMERA_ELEVATION - this.tiltY * PARALLAX_ELEVATION;

    const flat = Math.cos(elevation) * this.dist;
    this.camera.position.set(
      this.target.x - Math.sin(side) * this.dist,
      this.target.y + Math.sin(elevation) * this.dist,
      this.target.z + flat,
    );
    this.camera.lookAt(this.target);
    this.snap = false;
  }

  private updateSpace(dt: number): void {
    const s = this.game.state;
    const inSpace = s === 'jumpWindow' || s === 'flight';
    this.spaceMix += ((inSpace ? 1 : 0) - this.spaceMix) * (1 - Math.exp(-dt * 6));
    this.bg.copy(this.sky).lerp(this.jumpSpace, this.spaceMix);
    // Towers sink into the dark so nothing competes with the marble's arc.
    this.backMaterial.color.setRGB(1, 1, 1).lerp(this.backInSpace, this.spaceMix);

    const rings = this.rings;
    if (!rings) return;
    rings.visible = this.spaceMix > 0.05;
    if (!rings.visible) return;
    const spin = performance.now() * 0.0015;
    for (let i = 0; i < this.ringBase.length; i++) {
      this.q.setFromAxisAngle(this.zAxis, spin * (i % 2 ? 1 : -1));
      this.m2.makeRotationFromQuaternion(this.q);
      this.m.multiplyMatrices(this.ringBase[i], this.m2);
      rings.setMatrixAt(i, this.m);
    }
    rings.instanceMatrix.needsUpdate = true;
  }

  // Fixed in the world and stretched along travel, so faster means longer lines rushing past.
  private updateStreaks(speed: number): void {
    const g = this.game;
    const b = g.ball;
    const on = speed > STREAK_FROM_SPEED && g.state === 'run';
    this.streaks.visible = on;
    if (!on) return;
    const yaw = Math.atan2(b.vx, b.vz);
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), yaw);
    this.sc.set(1, 1, 2 + speed * 0.28);
    const span = STREAK_RANGE * 2;
    for (let i = 0; i < STREAKS; i++) {
      const o = this.streakOffsets[i];
      o.x -= Math.round((o.x - b.x) / span) * span;
      o.z -= Math.round((o.z - b.z) / span) * span;
      this.v.set(o.x, b.y + o.y, o.z);
      this.m.compose(this.v, this.q, this.sc);
      this.streaks.setMatrixAt(i, this.m);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }

  // Both layers stay fixed in the world and wrap around the view, so the course can be any length.
  private updateLayers(speed: number): void {
    this.placeLayer(this.back, this.backItems, BACK_SPAN);

    const opacity = FRONT_OPACITY * Math.min(1, Math.max(0, (speed - FRONT_FROM_SPEED) / 30));
    this.frontMaterial.opacity = opacity;
    this.front.visible = opacity > 0.01 && this.game.state === 'run';
    if (this.front.visible) this.placeLayer(this.front, this.frontItems, FRONT_SPAN);
  }

  private placeLayer(mesh: THREE.InstancedMesh, items: Drifter[], span: number): void {
    const t = this.target;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const x = item.x + Math.round((t.x - item.x) / span) * span;
      const z = item.z + Math.round((t.z - item.z) / span) * span;
      this.m.compose(this.v.set(x, t.y + item.y, z), this.identity, item.scale);
      mesh.setMatrixAt(i, this.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

// Stripes across speed zones give the eye a beat to count; everything else is a soft checker.
function toneIndex(c: Cell): number {
  if (c.kind === 'fast') {
    const along = c.dir === 'N' ? c.iz : c.ix;
    return Math.abs(Math.floor(along / 2)) % 2;
  }
  return Math.abs(c.ix + c.iz) % 2;
}

function makeMatcap(theme: BallTheme): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const base = c.createRadialGradient(size * 0.36, size * 0.28, 2, size / 2, size / 2, size * 0.72);
  base.addColorStop(0, theme.stops[0]);
  base.addColorStop(0.28, theme.stops[1]);
  base.addColorStop(0.62, theme.stops[2]);
  base.addColorStop(1, theme.stops[3]);
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
