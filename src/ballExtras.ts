import * as THREE from 'three';
import type { BallExtra } from './themes';

const TURN_RATE = 8;
const MOVING_FROM = 3;

const solid = (color: string): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color, flatShading: true });

function add(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

// In the group's own space, forward is -z, right is +x and up is +y; the marble's radius is about 1.
function buildSpear(group: THREE.Group): void {
  const wood = solid('#7a5230');
  const steel = solid('#d8dce2');
  add(group, new THREE.CylinderGeometry(0.1, 0.1, 5.2, 5).rotateX(Math.PI / 2), wood, 1.7, 0.2, 0.3);
  add(group, new THREE.ConeGeometry(0.34, 1.2, 4).rotateX(-Math.PI / 2), steel, 1.7, 0.2, -2.9);
  add(group, new THREE.BoxGeometry(0.75, 0.12, 0.14), steel, 1.7, 0.2, -2.2);
}

function buildSkateboard(group: THREE.Group): void {
  const deck = solid('#2a8fd8');
  const wheel = solid('#f4f0e0');
  add(group, new THREE.BoxGeometry(1.5, 0.16, 4.2), deck, 0, -0.8, 0);
  add(group, new THREE.BoxGeometry(1.1, 0.16, 0.5), deck, 0, -0.68, -2.2);
  add(group, new THREE.BoxGeometry(1.1, 0.16, 0.5), deck, 0, -0.68, 2.2);
  for (const z of [-1.4, 1.4]) {
    for (const x of [-0.8, 0.8]) add(group, new THREE.BoxGeometry(0.34, 0.34, 0.4), wheel, x, -0.98, z);
  }
}

function buildKittyFace(group: THREE.Group): void {
  const ear = solid('#ffa8cc');
  const dark = new THREE.MeshBasicMaterial({ color: '#4a2a44' });
  const blush = new THREE.MeshBasicMaterial({ color: '#ff7fae' });
  for (const side of [-1, 1]) {
    const shell = add(group, new THREE.ConeGeometry(0.42, 0.9, 4), ear, side * 0.72, 0.62, 0.15);
    shell.rotation.z = -side * 0.7;
    add(group, new THREE.SphereGeometry(0.15, 6, 4), dark, side * 0.36, 0.88, -0.42);
    add(group, new THREE.SphereGeometry(0.16, 6, 4), blush, side * 0.68, 0.6, -0.58).scale.y = 0.4;
  }
}

// What a theme's marble wears or carries. It rides with the marble but doesn't roll with it,
// and turns to keep facing the way the marble is going.
export class BallExtras {
  readonly group = new THREE.Group();
  private heading = 0;
  private tinted: THREE.MeshBasicMaterial[] = [];

  constructor(extra: BallExtra) {
    if (extra === 'spear') buildSpear(this.group);
    else if (extra === 'skateboard') buildSkateboard(this.group);
    else if (extra === 'kittyFace') buildKittyFace(this.group);
    else if (extra === 'neonRing') this.buildNeonRing();
    this.group.visible = extra !== 'none';
  }

  private buildNeonRing(): void {
    const ring = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const halo = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
    add(this.group, new THREE.TorusGeometry(1.55, 0.09, 4, 20).rotateX(Math.PI / 2), ring, 0, 0, 0);
    add(this.group, new THREE.CircleGeometry(2.3, 20).rotateX(-Math.PI / 2), halo, 0, -0.9, 0);
    this.tinted.push(ring, halo);
  }

  tint(color: THREE.Color): void {
    for (const material of this.tinted) material.color.copy(color);
  }

  // holdHeading keeps it steady where the marble's direction means nothing, such as round a loop.
  update(dt: number, ball: THREE.Mesh, vx: number, vz: number, holdHeading: boolean): void {
    this.group.position.copy(ball.position);
    this.group.scale.copy(ball.scale);
    if (holdHeading || Math.hypot(vx, vz) < MOVING_FROM) return;
    const wanted = Math.atan2(-vx, -vz);
    const turn = Math.atan2(Math.sin(wanted - this.heading), Math.cos(wanted - this.heading));
    this.heading += turn * (1 - Math.exp(-dt * TURN_RATE));
    this.group.rotation.y = this.heading;
  }
}
