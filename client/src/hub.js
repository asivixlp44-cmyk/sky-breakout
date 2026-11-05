// The home island: sand, grass and paving under palm trees, the inflatable Start Gate, the stalls (gear, eggs, trails), the Storm Rush portal and the
// boards. The still things are merged into one mesh (one draw); the palms and umbrellas are instanced per square of the map, each square with a near and
// a far version, so what's off screen is skipped and what's far costs little. The boards are canvases redrawn only when their rows change.
import { T, texFrom, fitFont, prompts } from './engine.js';
import { L } from './surfaces.js';
import { tileMat } from './surfaces.js';
import { PKit, TAU, col, scale } from './kit.js';
import { big, WHITE as WHITE_S, PINK, GOLD, AQUA, LIME } from './signs.js';
import { HUB, HUB_R } from '../../shared/course.js';
import { TIME_RANKS, clockMs } from '../../shared/config.js';

const soft = (x, z) => 0.97 + 0.04 * Math.sin(x * 0.05 + 1.3) * Math.sin(z * 0.06) + 0.02 * Math.sin((x + z) * 0.13);
const edge = (a) => HUB_R + 7 * Math.sin(a * 5 + 1) + 4 * Math.sin(a * 11 + 2) + 2;
// the ground: rings of quads from the middle to the water, grass to sand to the shallows
function island(k, low) {
    const n = low ? 40 : 96, rings = [[0, 0, L.GRASS, 0.98], [0.5, 0, L.GRASS, 1], [0.72, 0, L.GRASS, 1], [0.8, 0.02, L.SAND, 1], [0.97, -0.05, L.SAND, 1], [1.08, -1.4, L.SAND, 0.92], [1.18, -4.2, L.SAND, 0.74]];
    for (let r = 0; r < rings.length - 1; r++) {
        const [k0, y0, ly, g0] = rings[r], [k1, y1, ly1, g1] = rings[r + 1], layer = r >= 2 ? (ly1 === L.SAND ? L.SAND : ly) : ly;
        const b = k.nv;
        for (let i = 0; i <= n; i++) {
            const a = i / n * TAU, e = edge(a), cs = Math.cos(a), sn = Math.sin(a);
            const x0 = cs * e * k0, z0 = sn * e * k0, x1 = cs * e * k1, z1 = sn * e * k1, s0 = soft(x0, z0) * g0, s1 = soft(x1, z1) * g1;
            k.vc(x0, y0, z0, 0, 1, 0, s0, s0, s0, x0 / 14, z0 / 14, layer, 0);
            k.vc(x1, y1, z1, 0, 1, 0, s1, s1, s1, x1 / 14, z1 / 14, layer, 0);
        }
        for (let i = 0; i < n; i++) { const q = b + i * 2; k.qi(q, q + 2, q + 3, q + 1); }
    }
}
// a paved way between two points, in rounded flagstones
function path(k, ax, az, bx, bz, w) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    k.slab(mx, 0.14, mz, w, 0.3, l, 0xffffff, { ry, bevel: 0.2, topLayer: L.PATH, topUv: [0, 0, w / 9, l / 9], noBottom: true, sideC: 0xcab98a, grad: 0.2 });
}
// a stall: a counter, posts and a striped awning
function stall(k, x, z, c, signs, title, g, ry) {
    const cs = Math.cos(ry), sn = Math.sin(ry), W = 22, D = 14, H = 11, at = (u, v) => [x + u * cs + v * sn, z - u * sn + v * cs];
    k.slab(x, 0.5, z, W + 4, 0.8, D + 4, 0xfff4d8, { ry, bevel: 0.3, topLayer: L.PLANK, topTile: 10, noBottom: true, grad: 0.2 });
    const c0 = at(0, 3);
    k.slab(c0[0], 4.2, c0[1], W, 3.6, 4, c, { ry, bevel: 0.45, sideC: scale(col(c), 0.92), layer: L.STRIPE, tile: 6, grad: 0.25, noBottom: true, topLayer: L.PLANK });
    for (const u of [-W / 2 + 1, W / 2 - 1]) for (const v of [-D / 2 + 1, D / 2 - 1]) { const q = at(u, v); k.cyl(q[0], 0.5, q[1], 0.5, 0.42, H, 0xffffff, { n: 8, cap: false }); }
    // the awning: bands sloping up to the ridge
    const bands = 7, bw = (W + 3) / bands, wy = 11.5;
    for (let i = 0; i < bands; i++) {
        const u = -(W + 3) / 2 + (i + 0.5) * bw, q = at(u, 0), ca = i % 2 ? c : 0xffffff;
        k.slab(q[0], wy + 2.4, q[1], bw + 0.02, 0.5, D + 4, ca, { ry, yb: wy, bevel: 0.1, noBottom: false, grad: 0.1 });
    }
    signs.add([big(title, g, 74)], 14, new T.Vector3(x + 0, 18, z), true);
}
// the inflatable Start Gate: two fat striped towers and a soft arch
function startGate(k, signs, low) {
    const { x, z } = HUB.gate, W = 19, H = 26, colA = 0xff4a62, colB = 0xffc638, colC = 0x37c4ff;
    for (const sg of [-1, 1]) {
        const px = x + sg * W;
        k.disc(px, 3, z, 7, 3, 0xffffff, { n: low ? 10 : 18, bevel: 1.2, sideC: colC, grad: 0.3 });
        for (let i = 0; i < 4; i++) k.torus(px, 5 + i * 4.8, z, 4.2, 2.5, i % 2 ? colB : colA, { n: low ? 9 : 16, s: low ? 5 : 8, flatten: 1 });
        k.blob(px, H + 1, z, 8.4, 8, 8.4, colC, { ao: 0.24, fine: !low });
        k.cyl(px, H + 4, z, 0.2, 0.2, 7, 0xffffff, { n: 4, cap: false });
        k.quad([px, H + 11, z], [px + sg * 4, H + 9.4, z], [px + sg * 4, H + 8.2, z], [px, H + 7.4, z], colA, {});
        k.quad([px, H + 7.4, z], [px + sg * 4, H + 8.2, z], [px + sg * 4, H + 9.4, z], [px, H + 11, z], colA, {});
    }
    const n = low ? 8 : 16;
    for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, px = x - W + t * W * 2, py = H - 2 + Math.sin(t * Math.PI) * 6, r = 3.2 + (i % 2) * 0.4;
        k.blob(px, py, z, 5.4, r * 2, r * 2, i % 2 ? colB : colA, { ao: 0.22, far: low });
    }
    signs.add([big('START', GOLD, 112)], 20, new T.Vector3(x, H + 10, z), true);
}
// the Storm Rush portal: a ring of cloud with lightning colours, the way into a race
function rushPortal(k, signs, low) {
    const { x, z } = HUB.rush, ry = Math.atan2(x - HUB.spawn.x, z - HUB.spawn.z) + Math.PI;
    k.disc(x, 0.9, z, 15, 0.9, 0x5a3ad8, { n: low ? 12 : 26, bevel: 0.3, topLayer: L.RADIAL, sideC: 0x2a1a78, topTile: 28, noBottom: true });
    k.torus(x, 13.5, z, 11.5, 1.6, 0x8a5aff, { up: true, ry, n: low ? 14 : 30, s: low ? 5 : 8, alt: 0x2af4ff, bands: 6 });
    k.torus(x, 13.5, z, 9.2, 0.42, 0xfff06a, { up: true, ry, n: low ? 12 : 24, s: 4, mode: 1 });
    signs.add([big('STORM RUSH', AQUA, 82)], 22, new T.Vector3(x, 30, z), true);
}
// a beach ball, an umbrella, a towel... (the little things that make it feel lived in)
function props(k, R, low) {
    const B = (x, z, s) => k.blob(x, s * 0.5, z, s, s, s, 0xffffff, { layer: L.BEACH, uvBall: true, ao: 0.16, fine: !low });
    const pts = [[38, -66, 4.2], [-44, -72, 3.4], [96, 42, 4], [-102, -38, 4.2], [24, 104, 3.2], [-88, 60, 3.6], [112, -40, 3.2]];
    for (const [x, z, s] of pts) B(x, z, s);
    if (!low) for (let i = 0; i < 16; i++) {
        const a = R() * TAU, r = HUB_R * (0.84 + R() * 0.1), x = Math.cos(a) * r, z = Math.sin(a) * r, c = [0xff5a7a, 0xffc638, 0x46e08a, 0x37b0ff][i % 4];
        k.slab(x, 0.1, z, 3.6, 0.12, 6.4, c, { ry: a, bevel: 0.05, noBottom: true, layer: L.STRIPE, topLayer: L.STRIPE, topTile: 3 });
    }
    // a big bouncy castle off to one side (the island's landmark from far away)
    const cx = -104, cz = 62, W = 30, D = 24;
    k.slab(cx, 3.2, cz, W, 3.2, D, 0x37c4ff, { ry: 0.3, bevel: 1.4, topLayer: L.PUFF, topTile: 12, sideC: 0xffc638, layer: L.PUFF, grad: 0.3, noBottom: true });
    const cs = Math.cos(0.3), sn = Math.sin(0.3), tw = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    tw.forEach(([u, v], i) => {
        const x = cx + u * cs + v * sn, z = cz - u * sn + v * cs;
        for (let j = 0; j < 3; j++) k.torus(x, 4 + j * 4.2, z, 3, 2.2, i % 2 ? 0xff4a62 : 0xc060ff, { n: low ? 8 : 14, s: low ? 4 : 7 });
        k.cyl(x, 15, z, 4.4, 0.4, 7, 0xffc638, { n: low ? 6 : 12, cap: false });
    });
    for (const [a, b, c] of [[-W / 2, -D / 2, W], [-W / 2, D / 2, W]]) {
        const u = a + c / 2, x = cx + u * cs + b * sn, z = cz - u * sn + b * cs;
        k.slab(x, 12, z, c, 8, 1.6, 0xff4a62, { ry: 0.3, bevel: 0.6, noBottom: true, layer: L.PUFF, grad: 0.3 });
    }
}
// ----- palm trees and umbrellas: instanced by square, near and far -----
function palmKit(far) {
    const k = new PKit(far ? 64 : 500, far ? 96 : 800), h = 18;
    if (far) {
        k.cyl(0, 0, 0, 0.9, 0.5, h, 0xb08858, { n: 3, cap: false });
        k.blob(0, h, 0, 16, 4.6, 16, 0x38b84a, { far: true, ao: 0.3 });
        return k.geometry();
    }
    // a slightly leaning trunk in rings
    let lx = 0, lz = 0, ly = 0;
    for (let i = 0; i < 5; i++) { const nx = lx + 0.32 * (i + 1) * 0.22, ny = ly + h / 5, r0 = 1 - i * 0.1, r1 = 0.9 - i * 0.1; k.cyl(lx, ly, lz, r0, r1, h / 5, i % 2 ? 0xb08858 : 0xc09868, { n: 6, cap: false }); lx = nx; ly = ny; }
    // the fronds: long drooping leaves
    for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + 0.2, cs = Math.cos(a), sn = Math.sin(a), Ln = 10.5, wd = 2.1, seg = 4;
        let px = lx, py = ly + 0.2, pz = lz, w0 = wd * 0.3;
        for (let j = 1; j <= seg; j++) {
            const t = j / seg, nx = lx + cs * Ln * t, nz = lz + sn * Ln * t, ny = ly + 2.5 * Math.sin(t * 2) - 4.6 * t * t, w1 = wd * Math.sin(Math.min(1, t + 0.08) * Math.PI) * 0.9 + 0.1, c = [0.2, 0.74 - 0.12 * (i % 2), 0.28];
            const sx = -sn, sz = cs;
            k.quad([px + sx * w0, py, pz + sz * w0], [px - sx * w0, py, pz - sz * w0], [nx - sx * w1, ny, nz - sz * w1], [nx + sx * w1, ny, nz + sz * w1], c, { c2: scale(c, 1.1) });
            k.quad([px - sx * w0, py - 0.02, pz - sz * w0], [px + sx * w0, py - 0.02, pz + sz * w0], [nx + sx * w1, ny - 0.02, nz + sz * w1], [nx - sx * w1, ny - 0.02, nz - sz * w1], scale(c, 0.7), {});
            px = nx; py = ny; pz = nz; w0 = w1;
        }
    }
    for (let i = 0; i < 3; i++) { const a = i * 2.1; k.blob(lx + Math.cos(a) * 0.9, ly - 0.4, lz + Math.sin(a) * 0.9, 1.1, 1.3, 1.1, 0x8a5a2a, { far: true }); }
    return k.geometry();
}
function umbrellaKit(far) {
    const k = new PKit(far ? 40 : 200, far ? 60 : 320), cA = 0xff5a7a, cB = 0xffffff;
    k.cyl(0, 0, 0, 0.16, 0.16, 7.2, 0xffffff, { n: 4, cap: false });
    const n = far ? 4 : 8;
    for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, c = i % 2 ? cA : cB;
        k.tri3([0, 8.3, 0], [Math.cos(a1) * 5, 6.4, Math.sin(a1) * 5], [Math.cos(a0) * 5, 6.4, Math.sin(a0) * 5], c);
        k.tri3([0, 8.3, 0], [Math.cos(a0) * 5, 6.4, Math.sin(a0) * 5], [Math.cos(a1) * 5, 6.4, Math.sin(a1) * 5], scale(col(c), 0.74));
    }
    return k.geometry();
}
const SQUARE = 110;
export function hubDecorate(o) {
    const extras = { boards: [], squares: [] };
    const decorate = (k, signs, R) => {
        island(k, o.low);
        const sp = HUB.spawn;
        path(k, sp.x, sp.z - 26, HUB.gate.x, HUB.gate.z + 8, 13);
        path(k, 0, 8, HUB.gear.x, HUB.gear.z, 8);
        path(k, 0, -6, HUB.eggs.x, HUB.eggs.z, 8);
        path(k, 0, 56, HUB.rush.x, HUB.rush.z, 8);
        path(k, 0, 56, HUB.trails.x, HUB.trails.z, 8);
        path(k, 0, 18, HUB.board.x, HUB.board.z, 8);
        // the landing: a broad round plaza with a star on it
        k.disc(sp.x, 0.22, sp.z, 22, 0.4, 0xfff4d8, { n: o.low ? 16 : 32, bevel: 0.15, topLayer: L.PATH, topTile: 14, noBottom: true, sideC: 0xd8c898 });
        k.disc(sp.x, 0.26, sp.z, 5, 0.1, 0xffffff, { n: 18, bevel: 0.02, topLayer: L.STAR, topTile: 10, noBottom: true });
        startGate(k, signs, o.low);
        stall(k, HUB.gear.x, HUB.gear.z, 0x37b0ff, signs, 'GEAR', AQUA, Math.atan2(-HUB.gear.x, -HUB.gear.z));
        stall(k, HUB.eggs.x, HUB.eggs.z, 0xc060ff, signs, 'BUDDIES', PINK, Math.atan2(-HUB.eggs.x, -HUB.eggs.z));
        stall(k, HUB.trails.x, HUB.trails.z, 0x46e08a, signs, 'TRAILS', LIME, Math.atan2(-HUB.trails.x, -HUB.trails.z));
        // eggs on the counter of the Buddies stall, ribbons on the Trails stall
        const eggC = [0x5ad8ff, 0xff9ad8, 0xc85aff, 0xe8a838, 0xa8e8ff], ea = Math.atan2(-HUB.eggs.x, -HUB.eggs.z), ec = Math.cos(ea), es = Math.sin(ea);
        eggC.forEach((c, i) => { const u = (i - 2) * 3.6, x = HUB.eggs.x + u * ec + 3 * es, z = HUB.eggs.z - u * es + 3 * ec; k.blob(x, 7.1, z, 2.4, 3.1, 2.4, c, { ao: 0.2, fine: !o.low }); });
        const ta = Math.atan2(-HUB.trails.x, -HUB.trails.z), tc = Math.cos(ta), ts = Math.sin(ta), trC = [0xff5a9a, 0xffd23a, 0x5affb0, 0x3ab4ff, 0xb45aff];
        trC.forEach((c, i) => { const u = (i - 2) * 3.8, x = HUB.trails.x + u * tc + 3 * ts, z = HUB.trails.z - u * ts + 3 * tc; k.quad([x - 0.7 * tc, 11, z + 0.7 * ts], [x + 0.7 * tc, 11, z - 0.7 * ts], [x + 0.7 * tc, 6.4, z - 0.7 * ts], [x - 0.7 * tc, 6.4, z + 0.7 * ts], c, {}); k.quad([x + 0.7 * tc, 11, z - 0.7 * ts], [x - 0.7 * tc, 11, z + 0.7 * ts], [x - 0.7 * tc, 6.4, z + 0.7 * ts], [x + 0.7 * tc, 6.4, z - 0.7 * ts], c, {}); });
        rushPortal(k, signs, o.low);
        props(k, R, o.low);
        // the Leaderboards' frame
        for (const b of [HUB.board, HUB.ranks]) {
            const ry = Math.atan2(HUB.spawn.x - b.x, HUB.spawn.z - b.z), cs = Math.cos(ry), sn = Math.sin(ry);
            for (const a of [-12.6, 12.6]) { const x = b.x + a * cs, z = b.z - a * sn; k.cyl(x, 0, z, 0.5, 0.42, 26, 0xffffff, { n: 6 }); }
        }
        extras.R = R;
    };
    const after = (group, camera) => {
        void camera;
        // the rows
        [[HUB.ranks, 'Run Ranks'], [HUB.board, 'Fastest Runs']].forEach(([b, title]) => {
            const B = boardTexture(title), ry = Math.atan2(HUB.spawn.x - b.x, HUB.spawn.z - b.z);
            B.fixed = b === HUB.ranks;
            if (B.fixed) drawBoard(B, TIME_RANKS.map((r, i) => ({ n: r.r, v: r.mins === Infinity ? 'over ' + TIME_RANKS[i - 1].mins + ' min' : 'under ' + r.mins + ' min', c: r.color })));
            else drawBoard(B, []);
            const m = new T.Mesh(new T.PlaneGeometry(24, 24), new T.MeshBasicMaterial({ map: B.t, toneMapped: false, transparent: true, alphaTest: 0.4, side: T.DoubleSide }));
            m.position.set(b.x, 14, b.z);
            m.rotation.y = ry;
            m.matrixAutoUpdate = false; m.updateMatrix();
            group.add(m);
            extras.boards.push(B);
        });
        // the palms and umbrellas: per square of the map, near and far versions
        const low = o.low, R = extras.R, kinds = [{ near: palmKit(false), far: palmKit(true), n: low ? 26 : 46, r0: 0.6, r1: 0.96, s: [0.9, 1.5], clear: 28 }, { near: umbrellaKit(false), far: umbrellaKit(true), n: low ? 6 : 16, r0: 0.86, r1: 1.02, s: [0.9, 1.1], clear: 12 }];
        const spots = [[HUB.spawn.x, HUB.spawn.z, 30], [HUB.gate.x, HUB.gate.z, 30], [HUB.gear.x, HUB.gear.z, 24], [HUB.eggs.x, HUB.eggs.z, 24], [HUB.trails.x, HUB.trails.z, 24], [HUB.rush.x, HUB.rush.z, 26], [HUB.board.x, HUB.board.z, 20], [HUB.ranks.x, HUB.ranks.z, 20], [-104, 62, 34]];
        const mat = tileMat('instanced'), M = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
        for (const K of kinds) {
            const by = new Map();
            for (let i = 0; i < K.n; i++) {
                const a = R() * TAU, r = HUB_R * (K.r0 + R() * (K.r1 - K.r0)), x = Math.cos(a) * r, z = Math.sin(a) * r;
                if (spots.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr) || Math.abs(x) < 9) continue;
                const key = Math.floor(x / SQUARE) + ',' + Math.floor(z / SQUARE);
                if (!by.has(key)) by.set(key, []);
                by.get(key).push({ x, z, s: K.s[0] + R() * (K.s[1] - K.s[0]), ry: R() * TAU });
            }
            for (const list of by.values()) {
                const mk = (g) => {
                    const m = new T.InstancedMesh(g, mat, list.length);
                    list.forEach((t, i) => m.setMatrixAt(i, M.compose(V.set(t.x, 0, t.z), Q.setFromAxisAngle(Y, t.ry), S.setScalar(t.s))));
                    m.instanceMatrix.needsUpdate = true;
                    m.castShadow = !low; m.receiveShadow = false;
                    m.frustumCulled = true;
                    m.computeBoundingSphere();
                    m.renderOrder = -1;
                    group.add(m);
                    return m;
                };
                const near = mk(K.near), far = mk(K.far), cx = list.reduce((v, t) => v + t.x, 0) / list.length, cz = list.reduce((v, t) => v + t.z, 0) / list.length;
                near.visible = true; far.visible = false;
                extras.squares.push({ near, far, cx, cz });
            }
        }
    };
    extras.setBoards = (m) => { if (extras.boards[1]) drawBoard(extras.boards[1], m.time, (v) => clockMs(v)); };
    // near or far, a few times a second
    extras.updateLod = (px, py, pz) => { for (const s of extras.squares) { const d = Math.hypot(s.cx - px, py * 0.6, s.cz - pz), near = d < 190; if (s.near.visible !== near) { s.near.visible = near; s.far.visible = !near; } } };
    extras.warmAll = (on) => { for (const s of extras.squares) { s.near.visible = true; s.far.visible = !!on; } };
    // the prompts: walk up to them
    prompts.length = 0;
    prompts.push({ pos: new T.Vector3(HUB.eggs.x, 3, HUB.eggs.z), r: 16, label: () => 'Open an egg', act: () => o.open('eggs'), on: o.onHub });
    prompts.push({ pos: new T.Vector3(HUB.gear.x, 3, HUB.gear.z), r: 16, label: () => 'Get gear', act: () => o.open('gear'), on: o.onHub });
    prompts.push({ pos: new T.Vector3(HUB.trails.x, 3, HUB.trails.z), r: 16, label: () => 'Pick a trail', act: () => o.open('eggs', 'trails'), on: o.onHub });
    prompts.push({ pos: new T.Vector3(HUB.rush.x, 3, HUB.rush.z), r: 17, label: () => 'Join a Storm Rush', act: () => o.rush(), on: o.onHub });
    return { decorate, after, extras };
}
// rows that float: a title, and a dark pill for each row; only when the rows changed
function boardTexture(title) { const c = document.createElement('canvas'); c.width = 512; c.height = 512; return { c, t: texFrom(c), title, key: '' }; }
function drawBoard(B, rows, fmt) {
    const key = JSON.stringify(rows || []);
    if (key === B.key) return;
    B.key = key;
    const x = B.c.getContext('2d'), W = 512, list = (rows || []).slice(0, 8);
    x.clearRect(0, 0, W, W);
    x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.textAlign = 'center';
    fitFont(x, B.title, W - 20, 56, 700, 'Fredoka, sans-serif', 0);
    x.lineWidth = 9; x.strokeStyle = '#2a1a00'; x.strokeText(B.title, W / 2, 36); x.fillStyle = '#ffd23a'; x.fillText(B.title, W / 2, 36);
    list.forEach((r, i) => {
        const y = 76 + i * 54;
        x.fillStyle = 'rgba(22, 22, 28, 0.92)';
        x.beginPath(); x.roundRect(14, y, W - 28, 46, 14); x.fill();
        x.textAlign = 'left';
        const name = (i + 1) + '. ' + r.n;
        fitFont(x, name, W - 190, 30, 600, 'Fredoka, sans-serif', 0);
        x.fillStyle = '#ffffff'; x.fillText(name, 30, y + 24);
        x.textAlign = 'right'; x.font = '600 30px Fredoka, sans-serif'; x.fillStyle = r.c || '#ffffff'; x.fillText(fmt ? fmt(r.v) : String(r.v), W - 30, y + 24);
    });
    if (!list.length) { x.fillStyle = 'rgba(22, 22, 28, 0.92)'; x.beginPath(); x.roundRect(14, 76, W - 28, 46, 14); x.fill(); x.textAlign = 'center'; x.font = '600 30px Fredoka, sans-serif'; x.fillStyle = '#ffffff'; x.fillText('Be the first!', W / 2, 100); }
    B.t.needsUpdate = true;
}
void WHITE_S;
