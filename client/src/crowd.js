// The Sidekicks hopping along after everyone: little creatures in four shapes (a chick, a bunny, a fox, a bat), tinted per
// instance. One instanced mesh per shape for the whole scene, its list rewritten once a frame (only the nearest characters get
// them), so a crowd costs a few draws.
import { T, scene } from './engine.js';
import { tileMat, FX } from './surfaces.js';
import { PKit } from './kit.js';
import { petById } from '../../shared/config.js';

const MAX = 40;
const NONE = 0;
const m4 = new T.Matrix4(), q = new T.Quaternion(), vP = new T.Vector3(), vS = new T.Vector3(), tc = new T.Color(), UP = new T.Vector3(0, 1, 0);
const W = 0xffffff, BLACK = 0x101018;
function shapeGeo(s) {
    const k = new PKit(), o = { layer: NONE };
    const eyes = (y, z, gap, r) => { for (const sx of [-gap, gap]) { k.blob(sx, y, z, r * 2, r * 2, r, BLACK, o); k.blob(sx + r * 0.3, y + r * 0.35, z + r * 0.35, r * 0.7, r * 0.7, r * 0.4, 0xfff8f0, { layer: NONE, mode: FX.GLOW, far: true }); } };
    switch (s) {
        case 0: { // a chick: round, a beak, stubby wings
            k.blob(0, 0.95, 0, 1.9, 1.9, 1.9, W, o);
            eyes(1.25, 0.82, 0.42, 0.2);
            k.box(0, 1, 0.98, 0.5, 0.26, 0.5, 0x101010 + 0xffa82a - 0x101010, o);
            for (const sx of [-1, 1]) { k.blob(sx * 0.95, 0.9, -0.05, 0.42, 0.9, 0.7, W, o); k.box(sx * 0.4, 0.08, 0.1, 0.42, 0.16, 0.6, 0xffa82a, o); }
            k.blob(0, 1.95, -0.05, 0.3, 0.55, 0.5, W, o);
            break;
        }
        case 1: { // a bunny: a body, a head, long ears, a puff of a tail
            k.blob(0, 0.72, -0.1, 1.5, 1.4, 1.7, W, o);
            k.blob(0, 1.62, 0.28, 1.3, 1.2, 1.2, W, o);
            eyes(1.78, 0.82, 0.32, 0.16);
            k.blob(0, 1.52, 0.86, 0.26, 0.2, 0.2, 0xff8ab0, { layer: NONE, far: true });
            for (const sx of [-0.32, 0.32]) k.blob(sx, 2.68, 0.1, 0.42, 1.5, 0.3, W, o);
            k.blob(0, 0.8, -1, 0.7, 0.7, 0.7, 0xffffff, o);
            for (const sx of [-0.46, 0.46]) k.blob(sx, 0.16, 0.5, 0.56, 0.34, 0.8, W, o);
            break;
        }
        case 2: { // a fox: pointed ears, a big tail with a pale tip
            k.blob(0, 0.72, -0.2, 1.3, 1.25, 1.9, W, o);
            k.blob(0, 1.5, 0.42, 1.34, 1.14, 1.2, W, o);
            k.blob(0, 1.28, 1, 0.6, 0.46, 0.6, 0xfff4e8, { layer: NONE, far: true });
            k.blob(0, 1.34, 1.26, 0.2, 0.18, 0.2, BLACK, { layer: NONE, far: true });
            eyes(1.66, 0.94, 0.32, 0.15);
            for (const sx of [-0.42, 0.42]) k.cyl(sx, 1.94, 0.36, 0.3, 0.02, 0.8, W, { n: 4, layer: NONE, cap: false });
            k.blob(0, 1, -1.5, 0.9, 0.9, 1.8, W, o);
            k.blob(0, 1.16, -2.26, 0.6, 0.6, 0.7, 0xfff4e8, { layer: NONE, far: true });
            for (const sx of [-0.4, 0.4]) k.box(sx, 0.16, 0.34, 0.32, 0.32, 0.36, 0x2a2228, o);
            break;
        }
        default: { // a bat: a round body and two wings
            k.blob(0, 1.1, 0, 1.4, 1.5, 1.3, W, o);
            eyes(1.34, 0.6, 0.28, 0.15);
            for (const sx of [-1, 1]) {
                k.box(sx * 1.45, 1.26, -0.05, 1.8, 0.16, 1, W, o);
                k.box(sx * 2.1, 1.1, -0.05, 0.8, 0.14, 0.6, W, o);
                k.cyl(sx * 0.42, 1.76, 0, 0.26, 0.02, 0.62, W, { n: 4, layer: NONE, cap: false });
            }
        }
    }
    return k.geometry();
}
const meshes = [];
let built = false, n = [0, 0, 0, 0];
function build() {
    if (built) return;
    built = true;
    for (let s = 0; s < 4; s++) {
        const m = new T.InstancedMesh(shapeGeo(s), tileMat('crowd'), MAX);
        m.setColorAt(0, tc.set(0xffffff));
        m.instanceColor.setUsage(T.DynamicDrawUsage);
        m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.count = 0; m.visible = false;
        scene.add(m);
        meshes.push(m);
    }
}
export function beginCrowd() { build(); n[0] = n[1] = n[2] = n[3] = 0; }
export function addPet(id, x, y, z, ry, sq) {
    const k = petById[id];
    if (!k) return;
    const s = k.shape;
    if (n[s] >= MAX) return;
    q.setFromAxisAngle(UP, ry);
    const m = meshes[s], w = (2 - sq) * 0.5 + 0.5;
    m.setMatrixAt(n[s], m4.compose(vP.set(x, y, z), q, vS.set(w, sq, w)));
    m.setColorAt(n[s], tc.set(k.color));
    n[s]++;
}
export function endCrowd() {
    for (let s = 0; s < 4; s++) {
        const m = meshes[s];
        m.count = n[s]; m.visible = n[s] > 0;
        if (n[s]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    }
}
// for the loading warm-up: one of each, drawn behind the loading screen
export function crowdWarm() { build(); for (const m of meshes) { m.count = 1; m.visible = true; m.setMatrixAt(0, m4.makeTranslation(0, -200, 0)); m.instanceMatrix.needsUpdate = true; } }

// A team's Sidekicks following their owner: a state per pet, hopping along behind in a line
export class Team {
    constructor() { this.ids = []; this.key = ''; this.st = []; }
    set(csv) {
        if (csv === this.key) return;
        this.key = csv;
        this.ids = csv ? csv.split(',').filter((id) => petById[id]).slice(0, 6) : [];
        while (this.st.length < this.ids.length) this.st.push({ x: 1e9, z: 0, gy: 0, h: 0, vy: 0, ry: 0, s: 1, sv: 0, p: Math.random() * 6 });
    }
    update(dt, t, x, y, z, ry) {
        const ids = this.ids;
        for (let i = 0; i < ids.length; i++) {
            const S = this.st[i], side = i % 2 ? 1 : -1, back = 4 + Math.floor(i / 2) * 2.8;
            const tx = x - Math.sin(ry) * back + Math.cos(ry) * side * 2.4, tz = z - Math.cos(ry) * back - Math.sin(ry) * side * 2.4;
            if (S.x > 1e8 || (S.x - tx) ** 2 + (S.z - tz) ** 2 > 2500) { S.x = tx; S.z = tz; S.h = 0; S.vy = 0; S.gy = y; }
            const dx = tx - S.x, dz = tz - S.z, d = Math.hypot(dx, dz), moving = d > 1.2, sp = Math.min(60, d * 8);
            if (moving) { S.x += dx / d * sp * dt; S.z += dz / d * sp * dt; S.ry = Math.atan2(dx, dz); }
            S.gy += (y - S.gy) * Math.min(1, dt * 7);
            // hopping along when there's ground to cover, a little bounce on the spot now and then
            S.vy -= 70 * dt; S.h += S.vy * dt;
            if (S.h <= 0) { if (S.vy < -3) S.sv = -3.4; S.h = 0; S.vy = moving ? 15 : (Math.sin(t * 0.8 + S.p) > 0.985 ? 9 : 0); }
            S.sv += (((1 - S.s) * 120) - S.sv * 11) * dt; S.s = Math.max(0.65, Math.min(1.3, S.s + S.sv * dt));
            addPet(ids[i], S.x, S.gy + S.h + 0.1, S.z, S.ry, S.s);
        }
    }
}
