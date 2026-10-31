import * as THREE from 'three';
import { REPULSE_RADIUS, type Race, type Rival } from './race';
import type { World } from './world';

// One colour per player, the only place the game needs several: telling the balls apart.
export const PLAYER_COLOURS = ['#ff6b5e', '#5eb0ff', '#7bd96b', '#ffd24a'];

const BALL_RADIUS = 1.05;
const SETTLE_RATE = 14; // how fast a drawn rival catches up with where it must be
const MAX_RIVALS = 3;
const BOX_SIZE = 1.8;
const MINE_RADIUS = 1.1;
const SEEKER_RADIUS = 0.8;
const MAX_MINES = 12;
const MAX_SEEKERS = 6;
const MAX_PULSES = 4;
const SHIELD_RADIUS = 2.1;
const GROWTH_HEIGHT = 7; // as for the player's own marble: higher looks bigger

// The other balls and what is flying around them, drawn over the course.
export class RaceView {
  private group = new THREE.Group();
  private rivalMeshes: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshMatcapMaterial>[] = [];
  private rivalShields: THREE.Mesh[] = [];
  private rivalShadows: THREE.Mesh[] = [];
  private shown = new Map<string, THREE.Vector3>();
  private boxes: THREE.InstancedMesh;
  private mines: THREE.InstancedMesh;
  private seekers: THREE.InstancedMesh;
  private pulses: THREE.InstancedMesh;
  private shield: THREE.Mesh;

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private at = { x: 0, y: 0, z: 0 };
  private flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  constructor(
    scene: THREE.Scene,
    private race: Race,
    private world: World,
    private ownBall: THREE.Object3D,
    matcap: THREE.Texture,
    accent: string,
    wall: string,
    shadow: string,
  ) {
    const ballShape = new THREE.IcosahedronGeometry(BALL_RADIUS, 1);
    const shieldShape = new THREE.IcosahedronGeometry(SHIELD_RADIUS, 1);
    const shieldLook = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.3, depthWrite: false });
    const shadowShape = new THREE.CircleGeometry(BALL_RADIUS, 12).rotateX(-Math.PI / 2);
    const shadowLook = new THREE.MeshBasicMaterial({ color: shadow, transparent: true, opacity: 0.3, depthWrite: false });
    for (let i = 0; i < MAX_RIVALS; i++) {
      const mesh = new THREE.Mesh(ballShape, new THREE.MeshMatcapMaterial({ matcap, flatShading: true }));
      const bubble = new THREE.Mesh(shieldShape, shieldLook);
      const ground = new THREE.Mesh(shadowShape, shadowLook);
      mesh.visible = bubble.visible = ground.visible = false;
      this.rivalMeshes.push(mesh);
      this.rivalShields.push(bubble);
      this.rivalShadows.push(ground);
      this.group.add(mesh, bubble, ground);
    }
    this.shield = new THREE.Mesh(shieldShape, shieldLook);
    this.shield.visible = false;
    this.group.add(this.shield);

    const items = race.course.itemBoxes;
    this.boxes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE),
      new THREE.MeshLambertMaterial({ color: accent, flatShading: true }),
      Math.max(1, items.length),
    );
    this.mines = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(MINE_RADIUS, 0),
      new THREE.MeshLambertMaterial({ color: wall, flatShading: true }),
      MAX_MINES,
    );
    this.seekers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(SEEKER_RADIUS, 0), new THREE.MeshBasicMaterial({ color: accent }), MAX_SEEKERS);
    this.pulses = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.05, 4, 32),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8, depthWrite: false }),
      MAX_PULSES,
    );
    for (const mesh of [this.boxes, this.mines, this.seekers, this.pulses]) mesh.frustumCulled = false;
    this.group.add(this.boxes, this.mines, this.seekers, this.pulses);
    scene.add(this.group);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
  }

  update(dt: number): void {
    this.updateRivals(dt);
    this.shield.visible = this.race.shieldLeft > 0;
    if (this.shield.visible) this.shield.position.copy(this.ownBall.position);

    const spin = performance.now() * 0.002;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), spin);
    this.race.course.itemBoxes.forEach((box, i) => {
      this.sc.setScalar(this.race.itemWait[i] > 0 ? 0 : 1);
      this.boxes.setMatrixAt(i, this.m.compose(this.v.set(box.x, box.y, box.z), this.q, this.sc));
    });
    this.boxes.instanceMatrix.needsUpdate = true;

    this.fill(this.mines, MAX_MINES, this.race.mines.values(), (mine) => {
      this.sc.setScalar(mine.armIn > 0 ? 0.6 : 1);
      this.m.compose(this.v.set(mine.x, mine.y + MINE_RADIUS, mine.z), this.q, this.sc);
    });
    this.fill(this.seekers, MAX_SEEKERS, this.race.seekers.values(), (s) => {
      this.sc.setScalar(1);
      this.m.compose(this.v.set(s.x, s.y + 2, s.z), this.q, this.sc);
    });
    this.fill(this.pulses, MAX_PULSES, this.race.pulses, (p) => {
      this.sc.set(REPULSE_RADIUS * p.age, REPULSE_RADIUS * p.age, 8);
      this.m.compose(this.v.set(p.x, p.y + 1, p.z), this.flat, this.sc);
    });
  }

  private fill<T>(mesh: THREE.InstancedMesh, most: number, items: Iterable<T>, place: (item: T) => void): void {
    let i = 0;
    for (const item of items) {
      if (i >= most) break;
      place(item);
      mesh.setMatrixAt(i++, this.m);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateRivals(dt: number): void {
    let i = 0;
    const settle = 1 - Math.exp(-dt * SETTLE_RATE);
    for (const r of this.race.rivals.values()) {
      if (i >= MAX_RIVALS) break;
      this.placeRival(i++, r, settle);
    }
  }

  private placeRival(i: number, r: Rival, settle: number): void {
    const mesh = this.rivalMeshes[i];
    const bubble = this.rivalShields[i];
    const ground = this.rivalShadows[i];
    const known = r.heardAt > 0 && !(this.race.battle && r.finish !== null);
    mesh.visible = known;
    bubble.visible = known && r.shielded;
    ground.visible = false;
    if (!known) return;
    mesh.material.color.set(PLAYER_COLOURS[r.index % PLAYER_COLOURS.length]);
    this.race.rivalAt(r, this.at);
    let shown = this.shown.get(r.id);
    if (!shown) {
      shown = new THREE.Vector3(this.at.x, this.at.y, this.at.z);
      this.shown.set(r.id, shown);
    }
    shown.lerp(this.v.set(this.at.x, this.at.y, this.at.z), settle);
    const below = this.world.surface(shown.x, shown.z);
    const above = Math.max(0, shown.y - below);
    mesh.position.set(shown.x, shown.y + BALL_RADIUS, shown.z);
    mesh.scale.setScalar(1 + 2 * (1 - Math.exp(-(below > -Infinity ? above : 0) / GROWTH_HEIGHT)));
    bubble.position.copy(mesh.position);
    if (below > -Infinity) {
      ground.visible = true;
      ground.position.set(shown.x, below + 0.05, shown.z);
    }
  }
}
