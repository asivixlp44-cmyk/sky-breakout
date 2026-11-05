// A course on screen. The near stages are drawn in full from the course's parts, each stage one slot of a single batch (one draw, each slot culled on its
// own, built a little a frame so nothing hitches); the whole course also exists as one plain far mesh, so you can always see where you're going, and
// the stages drawn in detail are left out of it in the vertex shader. Everything that moves is moved in the vertex shader from the movers' table.
import { T, scene } from './engine.js';
import { CU } from './clock.js';
import { PKit, TAU, col, scale, WHITE } from './kit.js';
import { L, TILE, FX, tileMat, depthMat, farMat, holes, setMovers } from './surfaces.js';
import { Signs, big, GOLD, WHITE as WHITE_S, AQUA, PINK, RED, LIME } from './signs.js';
import { MK, HUB_R, SEA_Y } from '../../shared/course.js';
import { WORLDS } from '../../shared/config.js';

// ----- each world's palette -----
const SK = {
    bay: { deck: [0xffc638, 0x37c4ff], deckL: [L.STRIPE, L.PUFF], side: [0xfff0c8, 0xd8f4ff], tones: [0xff5068, 0xffc638, 0x46e08a, 0x37b0ff, 0xc060ff, 0xff8a38], pad: 0xff4a62, padSide: 0xffffff, mover: 0x2ad8c0, wall: 0xff7a5a, beam: 0xffffff, stem: 0xf8f8ff, under: 0x0a2a60, prop: 0xff5a7a },
    candy: { deck: [0xff9ad0, 0xfff0d8], deckL: [L.WAFER, L.WAFER], side: [0xffe0ef, 0xf2d0a8], tones: [0xff5aa8, 0xffd0e8, 0x98e4ff, 0xffe08a, 0xb4f0a8, 0xd0a8ff], pad: 0xff4aa0, padSide: 0xffeef8, mover: 0xb48aff, wall: 0xff8ac0, beam: 0xffe8f4, stem: 0xfff4fa, under: 0x8a3a70, prop: 0xff6ab0 },
    neon: { deck: [0x2a1c78, 0x1a1050], deckL: [L.GRID, L.GRID], side: [0x20165c, 0x160e40], tones: [0xff2ae0, 0x2af4ff, 0xfff02a, 0x7aff4a, 0xff5a2a, 0x8a5aff], pad: 0x20e8f0, padSide: 0x1a1464, mover: 0xff2ae0, wall: 0x2a1c78, beam: 0x2af4ff, stem: 0x2a1c78, under: 0x06041c, prop: 0xff2ae0, glow: 1 },
    gear: { deck: [0xc8964a, 0x70747e], deckL: [L.RIVET, L.RIVET], side: [0x8a6a3a, 0x54565e], tones: [0xd8a848, 0xc87a3a, 0x8a9098, 0xe8c878, 0x9a6a3a, 0x6a9098], pad: 0xe89a28, padSide: 0xf4d8a0, mover: 0xd8a848, wall: 0x6a6e78, beam: 0xc8a060, stem: 0x54565e, under: 0x2a2018, prop: 0xc88a3a },
    frost: { deck: [0xe4f6ff, 0x9ad0f4], deckL: [L.SNOW, L.ICE], side: [0xc8e8fa, 0x7ab8e4], tones: [0x8ad8ff, 0xc8f0ff, 0x5ab0f0, 0xffffff, 0xa8c8ff, 0x7ae8e0], pad: 0x2ab4f0, padSide: 0xe8f8ff, mover: 0x7ae0f0, wall: 0x9ad0f4, beam: 0xd8f0ff, stem: 0xa8d8f4, under: 0x2a4a80, prop: 0x8ad8ff },
    ruins: { deck: [0xcfc8a8, 0x9ab878], deckL: [L.MOSS, L.MOSS], side: [0x8a8468, 0x5a7a48], tones: [0x6abf5a, 0xd8c88a, 0x3a9a7a, 0xc8a860, 0x8ad04a, 0x5ab0a0], pad: 0x2ab06a, padSide: 0xe8e0c0, mover: 0x58c8a0, wall: 0x9a9070, beam: 0xe0d8a8, stem: 0x8a8468, under: 0x2a3a20, prop: 0x4aa05a },
    magma: { deck: [0xffffff, 0x8a6a5a], deckL: [L.LAVA, L.ROCK], side: [0x3a2a2a, 0x46322c], tones: [0xff5a1a, 0xffa020, 0xd83a1a, 0xffd04a, 0xb85a3a, 0xff7a3a], pad: 0xff5a1a, padSide: 0x3a2a28, mover: 0xff8a2a, wall: 0x5a3a34, beam: 0xffc04a, stem: 0x3a2a28, under: 0x1a0a08, prop: 0xff5a1a },
    orbit: { deck: [0x8a98d8, 0xd8dcf0], deckL: [L.HULL, L.HULL], side: [0x3a4478, 0x8a94b8], tones: [0x6a7aff, 0x3affd8, 0xff5ac8, 0xe8ecff, 0xffd84a, 0x8a5aff], pad: 0x3affd8, padSide: 0x3a4478, mover: 0x7a8aff, wall: 0x4a5488, beam: 0xe8ecff, stem: 0x3a4478, under: 0x06081c, prop: 0x6a7aff },
    crown: { deck: [0xffc838, 0xfff0d0], deckL: [L.GOLD, L.CHECK], side: [0xe89a28, 0xe8d0a0], tones: [0xff5a2a, 0xffc838, 0xff8a2a, 0xffe88a, 0xd83a5a, 0xff3a5a], pad: 0xff3a2a, padSide: 0xffe8c8, mover: 0xff8a2a, wall: 0xd83a5a, beam: 0xfff0d0, stem: 0xc88a3a, under: 0x5a1a0a, prop: 0xff5a2a },
};
// a world's far-off islands (top, its tile, sides, trees or none) and its clouds
const ISLE = {
    bay: [0x7ad04a, L.GRASS, 0xc8a878, 0x4ac05a], candy: [0xffb4dc, L.WAFER, 0xf2d0a8, 0xff7ab8], ruins: [0x7ad04a, L.GRASS, 0x9a9070, 0x2a9a4a],
    neon: [0x3a2c98, L.GRID, 0x20165c, 0], gear: [0xc8964a, L.RIVET, 0x70747e, 0], frost: [0xf4faff, L.SNOW, 0x9ad0f4, 0xb8e4f4],
    magma: [0xffffff, L.LAVA, 0x2a2020, 0], orbit: [0x9a9ab8, L.ROCK, 0x5a5a78, 0], crown: [0xffc838, L.GOLD, 0xc88a3a, 0xff7a3a],
};
const CLOUD = { neon: 0x6a4ad0, magma: 0x6a4a44, orbit: 0x4a3a9a };
const skinOf = (w) => SK[WORLDS[Math.max(0, Math.min(WORLDS.length - 1, w))].id];
export { skinOf };

// ----- the parts -----
function drawPart(k, p, low) {
    const s = skinOf(p.world), W = p.hx * 2, Lg = p.hz * 2, y = p.top, ry = p.ry0;
    k.mi = p.mi || 0;
    const tone = (t) => s.tones[((t % s.tones.length) + s.tones.length) % s.tones.length];
    const glow = s.glow ? FX.GLOW : 0;
    switch (p.look) {
        case 'hub_ground': case 'solid': break; // hub.js draws the island and what's on it
        case 'pad': {
            const c = s.pad, side = s.padSide;
            k.slab(p.x, y, p.z, W, p.h, Lg, c, { ry, bevel: 0.7, sideC: side, topLayer: L.PAD, topUv: [0, 1, 1, 0], grad: 0.5 });
            // the number on the floor, read from the way you came
            const num = String(p.tone + 1), cs = Math.cos(ry), sn = Math.sin(ry), dw = num.length > 2 ? 4.2 : 5.2, at = (a, d) => [p.x + a * cs + d * sn, p.z - a * sn + d * cs];
            const py = y + 0.05;
            // (the first digit on the left as you look at it, and a little in from the middle: you stand there)
            const mc = col(c), fwd = 3.4;
            for (let i = 0; i < num.length; i++) { const a = at(((num.length - 1) / 2 - i) * dw * 0.8, fwd); k.decal(a[0], py, a[1], dw, dw * 1.1, mc, L['D' + num[i]], ry, { mode: FX.DECAL }); }
            // the way on, at the edge you leave by
            if (p.exit !== undefined) { const ca = Math.cos(p.exit), sa = Math.sin(p.exit), ax = p.x + sa * (Lg / 2 - 2.6), az = p.z + ca * (Lg / 2 - 2.6); k.decal(ax, y + 0.06, az, 4.6, 3.6, col(c), L.CHEV, p.exit, { mode: FX.DECAL }); }
            // a little flag at the corner
            const f = at(W / 2 - 1.1, -Lg / 2 + 1.1);
            k.cyl(f[0], y, f[1], 0.16, 0.13, 8, 0xffffff, { n: 5, cap: false });
            k.quad([f[0], y + 8, f[1]], [f[0] + cs * 3.4, y + 7, f[1] - sn * 3.4], [f[0] + cs * 3.4, y + 6.2, f[1] - sn * 3.4], [f[0], y + 5.4, f[1]], s.pad, { mode: glow });
            k.quad([f[0], y + 5.4, f[1]], [f[0] + cs * 3.4, y + 6.2, f[1] - sn * 3.4], [f[0] + cs * 3.4, y + 7, f[1] - sn * 3.4], [f[0], y + 8, f[1]], s.pad, { mode: glow });
            break;
        }
        case 'deck': {
            const t = p.tone % 2;
            k.slab(p.x, y, p.z, W, p.h, Lg, s.deck[t], { ry, bevel: 0.55, sideC: s.side[t], topLayer: s.deckL[t], topTile: s.deckL[t] === L.STRIPE ? 8 : 8, tile: 12, mode: glow });
            break;
        }
        case 'startDeck':
            k.slab(p.x, y, p.z, W, p.h, Lg, s.deck[0], { ry, bevel: 0.9, sideC: s.side[0], topLayer: L.CHECK, topTile: 10, mode: glow });
            break;
        case 'disc':
            k.disc(p.x, y, p.z, p.r, p.h, tone(p.tone), { n: low ? 12 : 20, bevel: 0.6, topLayer: L.RADIAL, mode: glow, sideC: scale(col(tone(p.tone)), 0.86), topTile: p.r * 2 });
            break;
        case 'donut':
            k.disc(p.x, y, p.z, p.r, p.h, tone(p.tone), { n: low ? 12 : 20, bevel: 0.9, topLayer: L.CANDY, topTile: 8, grad: 0.2, r1: p.r * 0.86 });
            if (!low) k.torus(p.x, y - 0.5, p.z, p.r - 0.6, 0.72, 0xfff4e0, { n: 14, s: 5, alt: 0xff6aa8, bands: 7 });
            break;
        case 'beam':
            k.slab(p.x, y, p.z, W, p.h, Lg, s.tones[p.tone % s.tones.length], { ry, bevel: 0.35, sideC: s.beam, topLayer: L.STRIPE, topTile: 6, grad: 0.3, mode: glow });
            break;
        case 'stairs': {
            // bands of colour, each its own step
            const n = p.steps, st = Lg / n, cs = Math.cos(ry), sn = Math.sin(ry);
            for (let i = 0; i < n; i++) {
                const d = -p.hz + (i + 0.5) * st, x = p.x + d * sn, z = p.z + d * cs, yt = p.y0 + (p.y1 - p.y0) * ((i + 0.8) / n), c = tone(i);
                k.slab(x, yt, z, W, 1.3 + (p.y1 - p.y0) / n * 1.5, st + 0.02, c, { ry, bevel: low ? 0.01 : 0.14, topLayer: L.STAIR, topUv: [0, 0, 1, 1], grad: 0.35, noBottom: i > 0, mode: glow });
            }
            // the rails
            if (!low) for (const a of [-p.hx - 0.4, p.hx + 0.4]) {
                const ax = p.x + a * cs - p.hz * sn, az = p.z - a * sn - p.hz * cs, bx = p.x + a * cs + p.hz * sn, bz = p.z - a * sn + p.hz * cs;
                k.tube([ax, p.y0 + 1.6, az], [bx, p.y1 + 1.6, bz], 0.22, s.beam, { n: 4 });
                k.tube([ax, p.y0 - 1, az], [ax, p.y0 + 1.6, az], 0.18, s.beam, { n: 4 });
                k.tube([bx, p.y1 - 1, bz], [bx, p.y1 + 1.6, bz], 0.18, s.beam, { n: 4 });
            }
            break;
        }
        case 'spiralStep':
            k.slab(p.x, p.y0, p.z, W, p.h, Lg, tone(p.tone), { ry, yb: p.y1, bevel: 0.14, sideC: scale(col(tone(p.tone)), 0.88), topLayer: L.STAIR, topUv: [0, 0, 1, 1], grad: 0.4, mode: glow });
            break;
        case 'column': {
            // a stack of fat rings (the world's colours) round a plain core
            const H = p.h, y0 = y - H;
            k.cyl(p.x, y0, p.z, p.r - 0.8, p.r - 0.8, H, s.stem, { n: low ? 8 : 14, cap: true });
            const nR = Math.floor(H / 5);
            for (let i = 0; i < (low ? Math.ceil(nR / 2) : nR); i++) {
                const yy = y0 + (i + 0.5) * H / (low ? Math.ceil(nR / 2) : nR);
                k.torus(p.x, yy, p.z, p.r - 1.5, low ? 1.6 : 2.1, tone(i), { n: low ? 9 : 16, s: low ? 4 : 7, flatten: 1.05 });
            }
            break;
        }
        case 'mover':
            k.slab(p.x, y, p.z, W, p.h, Lg, s.mover, { ry, bevel: 0.6, sideC: scale(col(s.mover), 0.82), topLayer: L.ARROW, topUv: [0, 1, 1, 0], mode: glow });
            break;
        case 'lift':
            k.slab(p.x, y, p.z, W, p.h, Lg, s.mover, { ry, bevel: 0.6, sideC: scale(col(s.mover), 0.82), topLayer: L.HAZARD, topTile: 6 });
            break;
        case 'blink':
            k.slab(p.x, y, p.z, W, p.h, Lg, tone(p.tone * 2 + 1), { ry, bevel: 0.3, topLayer: L.CHECK, topTile: W, grad: 0.28, mode: s.glow ? FX.GLOW : 0 });
            break;
        case 'belt': {
            k.slab(p.x, y - 0.02, p.z, W, p.h, Lg, 0x54586c, { ry, bevel: 0.2, sideC: 0x3a3e50, noBottom: false });
            const cs = Math.cos(ry), sn = Math.sin(ry), sp = Math.hypot(p.belt[0], p.belt[1]), bl = [[-W / 2, Lg / 2], [W / 2, Lg / 2], [W / 2, -Lg / 2], [-W / 2, -Lg / 2]].map(([a, d]) => [p.x + a * cs + d * sn, y + 0.04, p.z - a * sn + d * cs]);
            // the chevrons run against you (one tile is 6 studs here)
            const mode = 10 + Math.max(1, Math.round(sp / 6 * 4)), vlen = Lg / 6, q = k.nv;
            k.v(bl[0][0], bl[0][1], bl[0][2], 0, 1, 0, WHITE, 0, vlen, L.BELT, mode);
            k.v(bl[1][0], bl[1][1], bl[1][2], 0, 1, 0, WHITE, W / 8, vlen, L.BELT, mode);
            k.v(bl[2][0], bl[2][1], bl[2][2], 0, 1, 0, WHITE, W / 8, 0, L.BELT, mode);
            k.v(bl[3][0], bl[3][1], bl[3][2], 0, 1, 0, WHITE, 0, 0, L.BELT, mode);
            k.qi(q, q + 1, q + 2, q + 3);
            // the rollers at each end
            for (const d of [-Lg / 2, Lg / 2]) { const x = p.x + d * sn, z = p.z + d * cs; k.box(x, y - 0.7, z, W + 0.8, 1.4, 1.2, 0x2a2c38, { ry }); }
            // low rails
            if (!low && !p.noRail) for (const a of [-W / 2 - 0.2, W / 2 + 0.2]) k.box(p.x + a * cs, y + 0.25, p.z - a * sn, 0.5, 0.7, Lg, s.deck[0], { ry });
            break;
        }
        case 'hub':
            k.cyl(p.x, y - p.h, p.z, p.r, p.r * 0.9, p.h, s.wall, { n: 12, capLayer: L.COG });
            break;
        case 'bar': {
            // a padded bar, striped so you can see it coming
            k.box(p.x, y - p.h / 2, p.z, W, p.h, Lg, 0xffd21e, { ry, layer: L.HAZARD, tile: 5, mode: 0 });
            k.mi = 0;
            break;
        }
        case 'hammer': {
            // the head, the arm up to the pivot: swings as one
            const m = p.mv, px = m.px, pz = m.pz, py = m.py, cs = Math.cos(ry), sn = Math.sin(ry);
            void cs; void sn;
            k.slab(p.x, y, p.z, W * 1.3, p.h, Lg, s.wall, { ry, bevel: 0.5, topLayer: L.RIVET, sideC: scale(col(s.wall), 0.9), grad: 0.2 });
            k.tube([px, py, pz], [px, y, pz], 0.42, 0x3a3a48, { n: 6 });
            k.disc(px, py + 0.5, pz, 0.9, 1, 0xffd21e, { n: 8, bevel: 0.1 });
            break;
        }
        case 'laser': {
            // a curtain of light: a bright beam across, thinner ones under it
            const cs = Math.cos(ry), sn = Math.sin(ry), bot = y - p.h;
            for (let i = 0; i < 4; i++) {
                const yy = bot + 1 + i * 2, a = p.hx;
                k.tube([p.x - a * cs, yy, p.z + a * sn], [p.x + a * cs, yy, p.z - a * sn], i % 2 ? 0.12 : 0.17, 0xff3050, { n: 4, mode: FX.GLOW });
            }
            k.quad([p.x - p.hx * cs, bot, p.z + p.hx * sn], [p.x + p.hx * cs, bot, p.z - p.hx * sn], [p.x + p.hx * cs, y, p.z - p.hx * sn], [p.x - p.hx * cs, y, p.z + p.hx * sn], [1, 0.24, 0.32], { mode: FX.GLOW });
            break;
        }
        case 'tile':
            k.slab(p.x, y, p.z, W, p.h, Lg, s.deck[p.tone % 2 ? 1 : 0], { ry, bevel: 0.14, topLayer: L.SAFE, topUv: [0, 0, 1, 1], grad: 0.3, mode: glow, noBottom: true });
            break;
        case 'kill':
            k.slab(p.x, y - 0.06, p.z, W, p.h, Lg, 0xffffff, { ry, bevel: 0.1, sideC: 0xb80824, topLayer: L.KILL, topUv: [0, 0, 1, 1], grad: 0.3, mode: FX.GLOW, noBottom: true });
            break;
        case 'trap': break;  // what's behind a wrong door looks like nothing at all
        case 'truss': {
            // a lattice tower: four posts, bands, crossed braces; solid to the feet, airy to the eye
            const H = p.h, y0 = y - H, a = p.hx, cs = Math.cos(ry), sn = Math.sin(ry), c = tone(p.tone);
            const pts = [[-a, -a], [a, -a], [a, a], [-a, a]].map(([u, v]) => [p.x + u * cs + v * sn, p.z - u * sn + v * cs]);
            k.box(p.x, y0 + H / 2, p.z, W * 0.55, H, Lg * 0.55, 0x2a2840, { ry, noTop: true });
            for (const q of pts) k.tube([q[0], y0, q[1]], [q[0], y, q[1]], 0.42, c, { n: low ? 4 : 6 });
            const bands = Math.floor(H / 5);
            for (let i = 0; i <= bands; i++) {
                const yy = y0 + i * H / bands;
                for (let e = 0; e < 4; e++) {
                    const A = pts[e], B = pts[(e + 1) % 4];
                    k.tube([A[0], yy, A[1]], [B[0], yy, B[1]], 0.26, c, { n: 3 });
                    if (!low && i < bands) { const yn = y0 + (i + 1) * H / bands; k.tube([A[0], yy, A[1]], [B[0], yn, B[1]], 0.16, scale(col(c), 0.85), { n: 3 }); }
                }
            }
            k.slab(p.x, y, p.z, W + 0.6, 0.8, Lg + 0.6, c, { ry, bevel: 0.2, topLayer: L.CHECK, topTile: 4 });
            break;
        }
        case 'ladder': {
            const H = p.h, y0 = y - H, cs = Math.cos(ry), sn = Math.sin(ry), a = p.hx, d = p.hz + 0.05;
            const cx = p.x + d * sn, cz = p.z + d * cs, RX = 2.2;
            for (const u of [-RX, RX]) { const x = cx + u * cs, z = cz - u * sn; k.tube([x, y0, z], [x, y, z], 0.26, 0xffffff, { n: 4 }); }
            for (let i = 1; i < H / 1.8; i++) { const yy = y0 + i * 1.8; k.tube([cx - RX * cs, yy, cz + RX * sn], [cx + RX * cs, yy, cz - RX * sn], 0.17, 0xffe24a, { n: 3 }); }
            void a;
            break;
        }
        case 'bouncer': {
            // a spring pad: a soft tyre round a bright skin
            k.disc(p.x, y, p.z, p.r, p.h, 0xfff06a, { n: low ? 12 : 18, topLayer: L.RADIAL, sideC: 0xff7a3a, bevel: 0.2, mode: 0, topTile: p.r * 2 });
            if (!low) k.torus(p.x, y - 0.1, p.z, p.r, 0.72, tone(p.tone), { n: 18, s: 6 });
            k.cyl(p.x, y - p.h - 4, p.z, 1, 1.4, 4, 0x7a7a88, { n: 6, cap: false });
            break;
        }
        case 'slide': {
            k.slab(p.x, p.y0, p.z, W, p.h, Lg, s.deck[1], { ry, yb: p.y1, bevel: 0.5, sideC: s.side[1], topLayer: L.ICE, topTile: 10 });
            const cs = Math.cos(ry), sn = Math.sin(ry);
            for (const a of [-W / 2, W / 2]) { const ax = p.x + a * cs - p.hz * sn, az = p.z - a * sn - p.hz * cs, bx = p.x + a * cs + p.hz * sn, bz = p.z - a * sn + p.hz * cs; k.tube([ax, p.y0 + 0.5, az], [bx, p.y1 + 0.5, bz], 0.55, s.tones[0], { n: low ? 4 : 6 }); }
            break;
        }
        case 'iceDeck':
            k.slab(p.x, y, p.z, W, p.h, Lg, 0xc8ecff, { ry, bevel: 0.6, sideC: 0x8ac4e8, topLayer: L.ICE, topTile: 10 });
            break;
        case 'tunnelFloor':
            k.slab(p.x, y, p.z, W, p.h, Lg, s.deck[0], { ry, bevel: 0.2, sideC: s.side[0], topLayer: s.deckL[0], topTile: 8, mode: glow });
            break;
        case 'tunnelWall': {
            k.box(p.x, y - p.h / 2, p.z, W, p.h, Lg, s.wall, { ry, layer: L.PLAIN, grad: 0.1, mode: glow, top: scale(col(s.wall), 0.8) });
            break;
        }
        case 'tunnelRoof':
            k.box(p.x, y - p.h / 2, p.z, W, p.h, Lg, s.wall, { ry, mode: glow, under: scale(col(s.wall), 0.75) });
            break;
        case 'hurdle':
            k.slab(p.x, y, p.z, W, p.h, Lg, tone(p.tone), { ry, bevel: 0.3, topLayer: L.HAZARD, topTile: 6, grad: 0.24, noBottom: true, mode: glow });
            break;
        case 'doorWall':
            k.box(p.x, y - p.h / 2, p.z, W, p.h, Lg, s.wall, { ry, layer: L.BRICK, tile: 10, grad: 0.2 });
            break;
        case 'spinner':
            k.disc(p.x, y, p.z, p.r, p.h, s.mover, { n: low ? 12 : 22, bevel: 0.5, topLayer: L.RADIAL, sideC: scale(col(s.mover), 0.8), topTile: p.r * 2, mode: glow });
            break;
        case 'pillar': {
            const c = tone(p.tone), H = Math.min(p.h, 18);
            k.slab(p.x, y, p.z, W, H, Lg, c, { ry, bevel: 0.3, topLayer: L.CHECK, topTile: W, grad: 0.72, noBottom: true, mode: glow });
            break;
        }
        case 'pusher':
            k.slab(p.x, y, p.z, W, p.h, Lg, s.wall, { ry, bevel: 0.5, layer: L.HAZARD, tile: 6, topLayer: L.RIVET, grad: 0.16, sideC: 0xffffff });
            break;
        case 'crumble': {
            const t = p.tone % 2;
            k.slab(p.x, y, p.z, W, p.h, Lg, s.deck[t] === 0xffffff ? 0xb8a898 : s.deck[t], { ry, bevel: 0.25, sideC: s.side[t], topLayer: L.CRACK, topUv: [0, 0, 1, 1], grad: 0.45, mode: glow });
            break;
        }
        case 'piston': {
            // a head on a rod, pumping out of a sleeve that stays put
            const c = tone(p.tone), reach = Math.abs(p.mv.ay);
            k.slab(p.x, y, p.z, W, p.h, Lg, c, { ry, bevel: 0.4, sideC: scale(col(c), 0.8), topLayer: L.RIVET, topTile: W, grad: 0.5, mode: glow });
            k.cyl(p.x, y - p.h - 20, p.z, W * 0.2, W * 0.2, 20, s.beam, { n: low ? 5 : 8, cap: false });
            k.mi = 0;
            k.cyl(p.x, y - p.h - reach - 22, p.z, W * 0.4, W * 0.34, 14, s.stem, { n: low ? 6 : 10, grad: 0.3 });
            break;
        }
        case 'flame': {
            // jets along the row, on and off; the nozzles stay put
            const cs = Math.cos(ry), sn = Math.sin(ry), bot = y - p.h, n = Math.max(2, Math.round(W / 3));
            for (let i = 0; i < n; i++) {
                const a = -W / 2 + (i + 0.5) * W / n, fx = p.x + a * cs, fz = p.z - a * sn;
                k.cyl(fx, bot, fz, W / n * 0.52, 0.25, p.h, 0xff5a12, { n: low ? 4 : 6, mode: FX.GLOW, cap: false, c0: 0xffc83a, c2: 0xff3a0a });
                if (!low) k.cyl(fx, bot, fz, W / n * 0.28, 0.12, p.h * 0.6, 0xffe88a, { n: 5, mode: FX.GLOW, cap: false, c0: 0xfff4c8, c2: 0xffb030 });
            }
            k.mi = 0;
            for (let i = 0; i < n; i++) { const a = -W / 2 + (i + 0.5) * W / n; k.disc(p.x + a * cs, bot + 0.2, p.z - a * sn, W / n * 0.42, 0.2, 0x2a2028, { n: low ? 5 : 8, bevel: 0.06, noBottom: true }); }
            break;
        }
        case 'orbiter':
            k.disc(p.x, y, p.z, p.r, p.h, s.mover, { n: low ? 10 : 18, bevel: 0.5, topLayer: L.RADIAL, sideC: scale(col(s.mover), 0.72), topTile: p.r * 2, mode: glow });
            k.cyl(p.x, y - p.h - 1.4, p.z, p.r * 0.16, p.r * 0.42, 1.4, 0x7ae8ff, { n: low ? 5 : 8, mode: FX.GLOW, cap: false });
            break;
        case 'asteroid':
            k.disc(p.x, y, p.z, p.r, p.h, 0xc8c8dc, { n: low ? 8 : 14, bevel: 0.6, topLayer: L.ROCK, topTile: p.r * 2, sideC: 0x7a7a98, r1: p.r * 0.72, grad: 0.3 });
            k.blob(p.x, y - p.h - p.r * 0.2, p.z, p.r * 1.5, p.r * 0.9, p.r * 1.5, 0x6a6a88, { far: true, ao: 0.3 });
            break;
        case 'roller': {
            // a great drum across the way, with bands so you can see it coming
            const cs = Math.cos(ry), sn = Math.sin(ry), r = p.h / 2, cy = y - r, at = (q) => [p.x + q * cs, cy, p.z - q * sn], end = at(-p.hx), end2 = at(p.hx);
            k.tube(end, end2, r, s.wall, { n: low ? 6 : 10 });
            for (const q of [-p.hx * 0.6, 0, p.hx * 0.6]) k.tube(at(q - 0.4), at(q + 0.4), r * 1.08, 0xffd21e, { n: low ? 6 : 10 });
            for (const e of [end, end2]) k.blob(e[0], cy, e[2], 0.7, r * 2, r * 2, scale(col(s.wall), 0.8), { far: true, ry, ao: 0.1 });
            break;
        }
        case 'summit':
            k.disc(p.x, y, p.z, p.r, p.h, 0xfff0c8, { n: low ? 18 : 36, bevel: 1, topLayer: L.GOLD, sideC: 0xe8b84a, topTile: 12, r1: p.r * 0.7 });
            if (!low) k.torus(p.x, y + 0.05, p.z, p.r - 1.5, 0.5, 0xffffff, { n: 36, s: 5 });
            break;
        default:
            k.slab(p.x, y, p.z, W, p.h, Lg, s.deck[0], { ry });
    }
    k.mi = 0;
}

// ----- what's there just to look at -----
const AT = (d, a, v) => [d.x + a * Math.cos(d.ry) + v * Math.sin(d.ry), d.z - a * Math.sin(d.ry) + v * Math.cos(d.ry)];
function drawDeco(k, d, low, spinId) {
    const s = skinOf(d.world), S = d.s || 10, x = d.x, y = d.y, z = d.z;
    k.mi = d.spin && spinId ? spinId(d, x, z) : 0;
    switch (d.kind) {
        case 'ring':     // a giant swim ring
            k.torus(x, y, z, S, S * 0.42, s.tones[Math.floor(S) % 6], { n: low ? 10 : 18, s: low ? 5 : 8, alt: 0xffffff, bands: 4, ry: S });
            break;
        case 'ball':
            k.blob(x, y, z, S * 1.6, S * 1.6, S * 1.6, 0xffffff, { layer: L.BEACH, uvBall: true, fine: !low, far: false, ao: 0.16 });
            break;
        case 'duck': {
            k.blob(x, y, z, S * 2.1, S * 1.3, S * 1.6, 0xffd93a, { ao: 0.22, fine: !low });
            k.blob(x + S * 0.8, y + S * 0.9, z, S, S, S, 0xffd93a, { ao: 0.22 });
            k.blob(x + S * 1.3, y + S * 0.85, z, S * 0.7, S * 0.26, S * 0.5, 0xff8a2a, { far: true });
            break;
        }
        case 'lolly':
            k.cyl(x, y - S * 1.2, z, S * 0.09, S * 0.09, S * 1.4, 0xffffff, { n: 5 });
            k.disc(x, y + S * 0.8, z, S * 0.72, S * 0.2, s.tones[Math.floor(S) % 6], { n: low ? 10 : 18, topLayer: L.CANDY, topTile: S * 0.7, bevel: 0.3 });
            break;
        case 'gumdrop':
            k.blob(x, y, z, S * 1.5, S * 1.3, S * 1.5, s.tones[Math.floor(S * 3) % 6], { ao: 0.28, fine: !low });
            break;
        case 'cane': {
            const c = 0xffffff;
            k.cyl(x, y - S, z, S * 0.28, S * 0.28, S * 2, c, { n: low ? 5 : 8, layer: L.CANDY, tile: S * 0.9 });
            k.torus(x + S * 0.65, y + S, z, S * 0.65, S * 0.28, 0xff4a7a, { n: low ? 6 : 10, s: 5, up: true, alt: 0xffffff, bands: 4 });
            break;
        }
        case 'screen': {
            k.box(x, y, z, S * 2, S * 1.3, S * 0.2, 0x1a1050, { ry: d.ry, grad: 0.1 });
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), fx = x - sn * S * 0.11, fz = z - cs * S * 0.11;
            k.quad([fx + cs * S * 0.9, y - S * 0.55, fz - sn * S * 0.9], [fx - cs * S * 0.9, y - S * 0.55, fz + sn * S * 0.9], [fx - cs * S * 0.9, y + S * 0.55, fz + sn * S * 0.9], [fx + cs * S * 0.9, y + S * 0.55, fz - sn * S * 0.9], s.tones[Math.floor(S) % 6], { layer: L.GRID, mode: FX.GLOW, uv: [0, 0, 3, 2] });
            break;
        }
        case 'neonRing':
            k.torus(x, y, z, S, S * 0.09, s.tones[Math.floor(S) % 6], { up: true, n: low ? 12 : 24, s: 4, ry: d.ry, mode: FX.GLOW });
            break;
        case 'cabinet':
            k.box(x, y, z, S * 0.9, S * 1.7, S * 0.8, 0x2a1c78, { ry: d.ry, grad: 0.3, top: 0x4a3aa8 });
            k.box(x, y + S * 0.28, z - S * 0.41, S * 0.7, S * 0.5, 0.2, s.tones[Math.floor(S * 5) % 6], { ry: d.ry, mode: FX.GLOW });
            break;
        case 'gear': {
            const c = s.tones[Math.floor(S) % 6], n = low ? 8 : 12, R = S;
            k.disc(x, y, z, R * 0.82, S * 0.36, c, { n: low ? 10 : 18, topLayer: L.RADIAL, bevel: 0.35, sideC: scale(col(c), 0.8), topTile: R * 2 });
            for (let i = 0; i < n; i++) {
                const a = i / n * TAU;
                k.box(x + Math.cos(a) * R * 0.9, y - S * 0.18, z + Math.sin(a) * R * 0.9, R * 0.3, S * 0.36, R * 0.36, c, { ry: -a + Math.PI / 2, grad: 0.3 });
            }
            k.disc(x, y + 0.2, z, R * 0.22, 0.5, 0x3a3a48, { n: 8, bevel: 0.1 });
            break;
        }
        case 'chimney':
            k.cyl(x, y - S * 2, z, S * 0.55, S * 0.38, S * 3, 0x8a5a3a, { n: low ? 6 : 10, layer: L.BRICK, tile: 10, cap: false });
            k.torus(x, y + S, z, S * 0.38, S * 0.08, 0x3a3a48, { n: 10, s: 4 });
            break;
        case 'crystal': {
            const c = s.tones[Math.floor(S) % 6], h = S * 2.6, r = S * 0.6, n = low ? 4 : 6, top = [x, y + h, z], bot = [x, y - h * 0.3, z];
            for (let i = 0; i < n; i++) {
                const a0 = i / n * TAU + S, a1 = (i + 1) / n * TAU + S, A = [x + Math.cos(a0) * r, y + h * 0.15, z + Math.sin(a0) * r], B = [x + Math.cos(a1) * r, y + h * 0.15, z + Math.sin(a1) * r];
                k.tri3(A, top, B, scale(col(c), i % 2 ? 1.04 : 0.88));
                k.tri3(A, B, bot, scale(col(c), 0.72));
            }
            break;
        }
        case 'iceberg': {
            k.blob(x, y, z, S * 2.4, S * 1.4, S * 2, 0xe8f6ff, { ao: 0.3, fine: false });
            k.blob(x + S * 0.4, y + S * 0.8, z, S * 1.2, S * 1.5, S * 1, 0xc8ecff, { ao: 0.3 });
            break;
        }
        case 'flame': {
            k.disc(x, y, z, S * 0.8, S * 0.5, 0x8a4a2a, { n: 8, bevel: 0.2, noBottom: false });
            k.blob(x, y + S * 0.5, z, S * 0.9, S * 1.6, S * 0.9, 0xff7a1a, { mode: FX.GLOW, far: low });
            k.blob(x, y + S * 0.3, z, S * 0.5, S * 0.9, S * 0.5, 0xfff06a, { mode: FX.GLOW, far: true });
            break;
        }
        case 'crownSpire':
            k.cyl(x, y - S * 1.5, z, S * 0.6, S * 0.1, S * 3, 0xffc838, { n: low ? 5 : 8, layer: L.GOLD, cap: false });
            k.blob(x, y + S * 1.6, z, S * 0.5, S * 0.5, S * 0.5, 0xff3a5a, { mode: FX.GLOW, far: true });
            break;
        case 'totem': {
            // a stack of carved stones, with bright eyes in the top one
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), o = { ry: d.ry, layer: L.MOSS, tile: S, grad: 0.25 };
            for (let i = 0; i < 3; i++) k.box(x, y - S * 0.9 + i * S * 0.86, z, S * (1 - i * 0.12), S * 0.8, S * (1 - i * 0.12), i % 2 ? s.tones[1] : s.wall, o);
            if (!low) for (const a of [-S * 0.2, S * 0.2]) k.box(x + a * cs - sn * S * 0.4, y + S * 0.86, z - a * sn - cs * S * 0.4, S * 0.16, S * 0.14, 0.3, 0xfff06a, { ry: d.ry, mode: FX.GLOW });
            break;
        }
        case 'jungleTree':
            k.cyl(x, y - S * 1.6, z, S * 0.24, S * 0.14, S * 2.2, 0x7a5a3a, { n: low ? 5 : 8, cap: false });
            k.blob(x, y + S * 0.7, z, S * 2, S * 1, S * 2, 0x2a9a4a, { ao: 0.35, fine: !low });
            k.blob(x + S * 0.5, y + S * 1.1, z - S * 0.2, S * 1.3, S * 0.8, S * 1.3, 0x4ac05a, { ao: 0.3, far: low });
            k.blob(x - S * 0.5, y + S * 0.3, z + S * 0.3, S * 1.1, S * 0.6, S * 1.1, 0x3ab050, { ao: 0.3, far: true });
            break;
        case 'ruinArch': {
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), W = S * 1.2;
            for (const a of [-W, W]) k.box(x + a * cs, y - S * 0.4, z - a * sn, S * 0.5, S * 2, S * 0.5, s.wall, { ry: d.ry, layer: L.MOSS, tile: S, grad: 0.35 });
            k.box(x, y + S * 0.7, z, W * 2 + S * 0.7, S * 0.4, S * 0.6, s.deck[0], { ry: d.ry, layer: L.MOSS, tile: S, grad: 0.2 });
            break;
        }
        case 'volcano':
            k.cyl(x, y - S * 2.2, z, S * 1.9, S * 0.42, S * 2.6, 0x4a3a38, { n: low ? 7 : 12, layer: L.ROCK, tile: S * 0.8, cap: false });
            k.disc(x, y + S * 0.42, z, S * 0.46, 0.3, 0xffa020, { n: low ? 7 : 12, mode: FX.GLOW, bevel: 0.05, noBottom: true });
            k.blob(x, y + S * 0.9, z, S * 0.7, S * 0.9, S * 0.7, 0xff6a1a, { mode: FX.GLOW, far: true });
            if (!low) k.tube([x + S * 0.42, y + S * 0.38, z], [x + S * 1.5, y - S * 1.7, z + S * 0.3], S * 0.09, 0xff7a1a, { n: 4, mode: FX.GLOW });
            break;
        case 'lavaRock':
            k.blob(x, y, z, S * 2, S * 1.3, S * 1.7, 0xffffff, { ao: 0.35, layer: L.LAVA, fine: !low });
            k.blob(x + S * 0.3, y - S * 0.5, z, S * 0.9, S * 0.5, S * 0.8, 0xff7a1a, { mode: FX.GLOW, far: true });
            break;
        case 'planet': {
            const c = s.tones[Math.floor(S) % 6];
            k.blob(x, y, z, S * 2.6, S * 2.6, S * 2.6, c, { ao: 0.5, fine: !low });
            k.torus(x, y, z, S * 2, S * 0.14, 0xe8ecff, { n: low ? 14 : 28, s: 3, flatten: 0.25, mode: FX.GLOW });
            break;
        }
        case 'satellite': {
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry);
            k.box(x, y, z, S * 0.7, S * 0.7, S, 0xc8d0e8, { ry: d.ry, layer: L.HULL, tile: S * 0.5, grad: 0.2 });
            for (const a of [-S * 1.35, S * 1.35]) k.box(x + a * cs, y, z - a * sn, S * 1.8, S * 0.06, S * 0.7, 0x4a6ae8, { ry: d.ry, layer: L.GRID, tile: S * 0.4, mode: FX.GLOW });
            break;
        }
        case 'rockDrift':
            k.blob(x, y, z, S * 1.6, S * 1.2, S * 1.4, 0x7a7a98, { ao: 0.4, fine: !low });
            k.blob(x + S * 1.3, y + S * 0.5, z - S * 0.4, S * 0.8, S * 0.6, S * 0.7, 0x6a6a88, { ao: 0.4, far: true });
            k.blob(x - S * 1.1, y - S * 0.6, z + S * 0.5, S * 0.6, S * 0.5, S * 0.6, 0x8a8aa8, { ao: 0.4, far: true });
            break;
        case 'orbitCore':
            k.blob(x, y, z, S * 2, S * 2, S * 2, s.tones[1], { ao: 0.45, fine: !low });
            if (!low) k.torus(x, y, z, S * 1.45, S * 0.1, 0xffffff, { n: 18, s: 3, flatten: 0.3, mode: FX.GLOW });
            break;
        case 'puff':
            for (let i = 0; i < (low ? 2 : 3); i++) k.blob(x + (i - 1) * S * 0.7, y + (i % 2) * S * 0.2, z, S * (1.3 - (i % 2) * 0.4), S * 0.7, S * (1 - (i % 2) * 0.2), 0xffffff, { mode: FX.GLOW, ao: 0.16, far: low });
            break;
        case 'hoop': {
            // a square rib of the tunnel, inside it, its colour stepping along
            const c = s.tones[(d.i || 0) % 6], W = d.w, H = d.h, cs = Math.cos(d.ry), sn = Math.sin(d.ry), o = { ry: d.ry, mode: s.glow ? FX.GLOW : 0 };
            k.box(x - cs * (W / 2 - 0.4), y + H / 2, z + sn * (W / 2 - 0.4), 0.9, H, 1.2, c, o);
            k.box(x + cs * (W / 2 - 0.4), y + H / 2, z - sn * (W / 2 - 0.4), 0.9, H, 1.2, c, o);
            k.box(x, y + H - 0.4, z, W, 0.9, 1.2, c, o);
            break;
        }
        case 'door': {
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), W = d.w, H = 14, c = d.good ? 0xffe24a : 0xff4a62;
            // a coloured frame, and a sign over it: a sun for the real one, a skull for a drop
            k.box(x - cs * (W / 2 - 0.2), y + H / 2, z + sn * (W / 2 - 0.2), 0.5, H, 2.4, c, { ry: d.ry });
            k.box(x + cs * (W / 2 - 0.2), y + H / 2, z - sn * (W / 2 - 0.2), 0.5, H, 2.4, c, { ry: d.ry });
            k.box(x, y + H - 0.2, z, W, 0.5, 2.4, c, { ry: d.ry });
            k.blob(x - sn * 1.3, y + 10.8, z - cs * 1.3, 3, 3, 0.8, c, { mode: FX.GLOW, far: true });
            break;
        }
        case 'gantry': {
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), W = d.w, H = d.h;
            for (const a of [-W / 2, W / 2]) { const px = x + a * cs, pz = z - a * sn; k.tube([px, y - 6, pz], [px, y + H, pz], 0.5, s.stem, { n: low ? 4 : 6 }); }
            k.tube([x - W / 2 * cs, y + H, z + W / 2 * sn], [x + W / 2 * cs, y + H, z - W / 2 * sn], 0.5, s.stem, { n: low ? 4 : 6 });
            break;
        }
        case 'laserPosts': {
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), W = d.w;
            for (const a of [-W / 2, W / 2]) { const px = x + a * cs, pz = z - a * sn; k.cyl(px, y, pz, 0.5, 0.35, 8.6, 0x3a3a48, { n: 6 }); k.blob(px, y + 8.9, pz, 1, 1, 1, 0xff3050, { mode: FX.GLOW, far: true }); }
            break;
        }
        case 'lift': {
            // the rails of a lift
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), W = d.w / 2 + 0.8;
            for (const a of [-W, W]) { const px = x + a * cs, pz = z - a * sn; k.cyl(px, y, pz, 0.45, 0.45, d.h, 0xc8c8d8, { n: 5 }); }
            break;
        }
        case 'worldGate': {
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry), W = d.w, H = 18, g = skinOf(d.world);
            for (const a of [-W / 2, W / 2]) {
                const px = x + a * cs, pz = z - a * sn;
                k.slab(px, y + H, pz, 3.6, H + 8, 3.6, g.tones[0], { ry: d.ry, bevel: 0.6, topLayer: L.CHECK, topTile: 4, grad: 0.5, mode: g.glow ? FX.GLOW : 0 });
                k.blob(px, y + H + 2.6, pz, 3.4, 5, 3.4, g.tones[1], { far: low, ao: 0.2 });
            }
            k.slab(x, y + H, z, W, 3, 3.2, g.tones[2], { ry: d.ry, bevel: 0.6, grad: 0.4, topLayer: L.CHECK, topTile: 4, mode: g.glow ? FX.GLOW : 0 });
            break;
        }
        case 'finishArch': {
            const cs = Math.cos(d.ry), sn = Math.sin(d.ry);
            k.torus(x, y, z, 11, 1.1, 0xffe24a, { up: true, ry: d.ry, n: low ? 14 : 28, s: 6, alt: 0xff4a62, bands: 6 });
            k.disc(x, y + 0.08, z, 9, 0.2, 0xffffff, { n: low ? 14 : 24, topLayer: L.CHECK, topTile: 6, bevel: 0.05, noBottom: true });
            void cs; void sn;
            break;
        }
        case 'balloon': {
            // the Breakout Balloon: stripes, ropes and a basket
            const H = 30, R = 19, cy = y + H, n = low ? 12 : 22, m = low ? 7 : 12, base = k.nv, C1 = col(0xff4a62), C2 = col(0xffe24a), C3 = col(0x37b0ff);
            for (let j = 0; j <= m; j++) {
                const v = j / m, a = (v - 0.5) * Math.PI, ry = Math.sin(a) * R * 1.12, r = Math.cos(a) * R * (1 - Math.max(0, -Math.sin(a)) * 0.62);
                for (let i = 0; i <= n; i++) {
                    const t = i / n * TAU, cs = Math.cos(t), sn = Math.sin(t), band = Math.floor(i / n * 12), c = band % 3 === 0 ? C1 : band % 3 === 1 ? C2 : C3;
                    k.v(x + cs * r, cy + ry, z + sn * r, cs * Math.cos(a), Math.sin(a), sn * Math.cos(a), scale(c, 0.78 + 0.28 * (v * 0.8 + 0.2)), i / n, v, L.PLAIN, 0);
                }
            }
            const row = n + 1;
            for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = base + j * row + i, b = a + row; k.qi(a, b, b + 1, a + 1); }
            k.slab(x, y + 6.5, z, 7, 3.2, 7, 0x9a6a3a, { layer: L.PLANK, tile: 6, bevel: 0.3, topLayer: L.PLANK, grad: 0.3 });
            const by = y + 6.5;
            for (const [a, b] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) k.tube([x + a, by, z + b], [x + a * 2.4, cy - R * 0.72, z + b * 2.4], 0.14, 0x5a4a3a, { n: 3 });
            k.disc(x, y + 0.1, z, 8, 0.2, 0xffffff, { n: low ? 14 : 24, topLayer: L.STAR, topTile: 12, bevel: 0.05, noBottom: true });
            break;
        }
    }
    k.mi = 0;
}

// ----- the far picture: every big thing, plainly -----
function addFar(k, c, low, w) {
    const chunkOf = [];
    const put = (ci, v0) => { for (let i = v0; i < k.nv; i++) chunkOf[i] = ci; };
    for (const p of c.parts) {
        if (w >= 0 && p.world !== w) continue;
        if (p.look === 'roller' || p.look === 'hub_ground' || p.look === 'solid' || p.look === 'trap' || p.look === 'laser' || p.look === 'ladder' || p.look === 'hammer' || p.look === 'bar' || p.look === 'pusher' || p.look === 'tunnelRoof') continue;
        if (p.mv && p.mv.k !== MK.SLIDE && p.look !== 'spinner') continue;
        if (low && p.small) continue;
        const v0 = k.nv, s = skinOf(p.world), W = p.hx * 2, Lg = p.hz * 2, tone = s.tones[Math.abs(p.tone | 0) % 6], yt = p.y1 !== undefined ? (p.y0 + p.y1) / 2 : p.top;
        const mode = 0;
        if (p.look === 'pad') {
            k.box(p.x, yt - p.h / 2, p.z, W, p.h, Lg, s.pad, { ry: p.ry0, top: s.pad, mode });
        } else if (p.r) {
            const col2 = p.look === 'column' ? s.stem : p.look === 'summit' ? 0xffd23a : tone;
            // (one in orbit: where it is at the start of the clock)
            const a = p.mv && p.mv.k === MK.SLIDE ? TAU * p.mv.ph : 0, ox = p.mv && p.mv.k === MK.SLIDE ? p.mv.ax * Math.sin(a) + p.mv.bx * Math.cos(a) : 0, oz = p.mv && p.mv.k === MK.SLIDE ? p.mv.az * Math.sin(a) + p.mv.bz * Math.cos(a) : 0;
            k.cyl(p.x0 + ox, yt - p.h, p.z0 + oz, p.r, p.r, p.h, col2, { n: low ? 6 : 12, mode, c2: scale(col(col2), 1.05) });
        } else if (p.y1 !== undefined) {
            k.slab(p.x, p.y0, p.z, W, p.h, Lg, tone, { ry: p.ry0, yb: p.y1, bevel: 0.01, noBottom: true });
        } else {
            const look = p.look, c0 = look === 'deck' ? s.deck[p.tone % 2] : look === 'kill' ? 0xff2438 : look === 'tile' ? s.deck[0] : look === 'mover' || look === 'lift' ? s.mover : look === 'tunnelFloor' || look === 'tunnelWall' || look === 'doorWall' ? s.wall : look === 'belt' ? 0x4a4e60 : look === 'startDeck' ? s.deck[0] : tone;
            k.box(p.x, yt - p.h / 2, p.z, W, p.h, Lg, c0, { ry: p.ry0, top: scale(col(c0), 1.06), noBottom: low });
        }
        put(p.chunk, v0);
    }
    if (!low) for (const d of c.deco) {
        if (!d.far || (w >= 0 && d.world !== w)) continue;
        const v0 = k.nv, s = skinOf(d.world), S = d.s || 10, c0 = s.prop;
        if (d.kind === 'ring' || d.kind === 'neonRing') k.blob(d.x, d.y, d.z, S * 2.4, S * 0.8, S * 2.4, s.tones[Math.floor(S) % 6], { ao: 0.24 });
        else if (d.kind === 'gear') k.cyl(d.x, d.y - S * 0.36, d.z, S, S, S * 0.36, s.tones[Math.floor(S) % 6], { n: 12 });
        else k.blob(d.x, d.y, d.z, S * 1.6, S * 1.8, S * 1.6, c0, { ao: 0.24 });
        put(d.chunk, v0);
    }
    for (const d of c.deco) {
        if (d.kind !== 'balloon' || (w >= 0 && d.world !== w)) continue;
        const v0 = k.nv;
        k.blob(d.x, d.y + 30, d.z, 38, 42, 38, 0xff4a62, { fine: false, ao: 0.2 });
        k.box(d.x, d.y + 6, d.z, 7, 3, 7, 0x9a6a3a, {});
        put(d.chunk, v0);
    }
    return chunkOf;
}
function farGeometry(c, low, w) {
    const k = new PKit(16000, 24000), chunkOf = addFar(k, c, low, w), nv = k.nv, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(k.p.slice(0, nv * 3), 3));
    g.setAttribute('normal', new T.BufferAttribute(k.n.slice(0, nv * 3), 3, true));
    g.setAttribute('color', new T.BufferAttribute(k.c.slice(0, nv * 3), 3));
    const ch = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) ch[i] = chunkOf[i] || 0;
    g.setAttribute('aChunk', new T.BufferAttribute(ch, 1));
    g.setIndex(new T.BufferAttribute(nv > 65535 ? k.i.slice(0, k.ni) : new Uint16Array(k.i.subarray(0, k.ni)), 1));
    g.computeBoundingSphere();
    return g;
}

// ----- what's around a world's stretch of the course: floating islands beside the way, never over it, and clouds -----
function addScenery(k, c, w, low, R) {
    const id = WORLDS[w].id, isle = ISLE[id], cps = c.main ? c.cps.filter((p) => p.world === w) : c.cps, big = c.main ? 1 : 2;
    for (let i = 0, made = 0; i < 30 && made < (low ? 2 : 5) * big; i++) {
        const a = cps[Math.floor(R() * cps.length)], x = a.x + (R() < 0.5 ? -1 : 1) * (240 + R() * 560), z = a.z + (R() - 0.5) * 600, sz = 44 + R() * 90, n = low ? 8 : 12, wid = 0.8 + R() * 0.4;
        let nearest = 1e9, ny = 0;
        for (const p of c.cps) { const d = Math.hypot(p.x - x, p.z - z); if (d < nearest) { nearest = d; ny = p.y; } }
        if (nearest < sz + 150 || (c.main && Math.hypot(x, z) < HUB_R + sz + 90)) continue;
        made++;
        const yy = Math.max(10, ny - 50 + R() * 90);
        k.disc(x, yy, z, sz, sz * 0.2, isle[0], { n, bevel: 2, topLayer: isle[1], topTile: 22, sideC: isle[2], layer: L.ROCK, tile: 24, grad: 0.3, r1: sz * 0.62 });
        k.cyl(x, yy - sz * 0.8, z, sz * 0.12, sz * 0.62, sz * 0.6, isle[2], { n, layer: L.ROCK, tile: 24, cap: false });
        for (let t = 0; t < (low ? 2 : 4); t++) {
            const b = R() * TAU, r = R() * sz * 0.7, h = 8 + R() * 10, tx = x + Math.cos(b) * r, tz = z + Math.sin(b) * r;
            if (isle[3]) { k.cyl(tx, yy, tz, 1.4, 1, h * 0.5, 0x8a5a3a, { n: 4 }); k.blob(tx, yy + h, tz, h * 1.3 * wid, h, h * 1.3 * wid, isle[3], { far: low, ao: 0.3 }); }
            else k.blob(tx, yy + h * 0.3, tz, h * 1.1, h * 0.8, h * wid, isle[2], { far: true, ao: 0.35 });
        }
    }
    // soft heaps, shaded under, a long way off
    const nClouds = (low ? 5 : 12) * big, cc = CLOUD[id] || 0xffffff;
    for (let i = 0; i < nClouds; i++) {
        // (off to the sides: along the way, they'd drift into the next world's sky)
        const p = cps[Math.floor(R() * cps.length)], yy = Math.max(30, p.y - 90 + R() * 300), x = p.x + (R() < 0.5 ? -1 : 1) * (200 + R() * 1100), z = p.z + (R() - 0.5) * 420, s = 16 + R() * 26;
        for (let q = 0, n = low ? 2 : 3; q < n; q++) k.blob(x + (q - 1) * s * 1.2, yy + (q % 2) * s * 0.24, z + (R() - 0.5) * s, s * (2.4 - (q % 2) * 0.6), s * 0.86, s * 1.5, cc, { mode: FX.GLOW, far: low || q === 2, ao: 0.16 });
    }
}

// ----- the sea: flat and matte, a lagoon shimmering a little, fading into the haze -----
export const seaU = { uA: { value: new T.Color(0x18b4e8) }, uS: { value: new T.Color(0x6ae4f4) }, uH: { value: new T.Color(0xc8ecff) } };
function seaMaterial() {
    return new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow, ...seaU },
        vertexShader: 'varying vec3 vP; void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }',
        fragmentShader: `uniform float uNow; uniform vec3 uA; uniform vec3 uS; uniform vec3 uH; varying vec3 vP;
            void main() {
                vec2 p = vP.xz;
                float n = sin(p.x * 0.012 + uNow * 0.15 + 2.0 * sin(p.y * 0.009)) * sin(p.y * 0.015 - uNow * 0.11 + 1.5 * sin(p.x * 0.011));
                vec3 c = mix(uA, uS, smoothstep(-0.5, 0.9, n) * 0.42);
                // little glints drifting
                vec2 q = floor(p / vec2(22.0, 9.0));
                float m = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453), tw = sin(uNow * (1.0 + m * 2.0) + m * 40.0);
                c = mix(c, vec3(1.0), step(0.94, m) * smoothstep(0.55, 1.0, tw) * 0.6);
                c = mix(c, uH, smoothstep(500.0, 2900.0, length(vP.xz - cameraPosition.xz)));
                gl_FragColor = vec4(c, 1.0);
                #include <colorspace_fragment>
            }`,
    });
}

// ----- one course's picture -----
export function buildCourseView(c, opts) {
    const low = !!opts.low, group = new T.Group(), mat = tileMat();
    let seed = 13;
    const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // what goes in which chunk
    const partsBy = [], decoBy = [], center = [];
    for (let i = 0; i < c.chunks + 1; i++) { partsBy.push([]); decoBy.push([]); center.push({ x: 0, y: 0, z: 0, n: 0 }); }
    for (const p of c.parts) { if (p.look === 'hub_ground' || p.look === 'solid') continue; partsBy[p.chunk].push(p); const C = center[p.chunk]; C.x += p.x0; C.y += p.top0; C.z += p.z0; C.n++; }
    for (const d of c.deco) decoBy[d.chunk].push(d);
    for (const C of center) if (C.n) { C.x /= C.n; C.y /= C.n; C.z /= C.n; }
    // the movers' table: what the course says moves, then the slow turning of the scenery
    const table = [];
    for (const p of c.movers) {
        const m = p.mv;
        if (m.k === MK.SLIDE) table.push([m.ax, m.ay, m.az, 0, m.P, m.ph, 0, 0, m.bx, 0, m.bz, 0]);
        else if (m.k === MK.SPIN) table.push([0, 0, 0, 1, m.P, m.ph, m.dir, 0, p.x0, 0, p.z0, 0]);
        else if (m.k === MK.BLINK) table.push([0, 0, 0, 2, m.P, m.ph, m.duty, 0, p.x0, p.top0 - p.h / 2, p.z0, 0]);
        else table.push([m.amp, m.dx, m.dz, 3, m.P, m.ph, 0, 0, m.px, m.py, m.pz, 0]);
    }
    const spinId = (d, x, z) => { if (table.length >= 1000) return 0; const P = [60, 40, 30, 24][table.length % 4]; table.push([0, 0, 0, 1, P, 0, table.length % 2 ? 1 : -1, 0, x, 0, z, 0]); return table.length; };
    for (const d of c.deco) if (d.spin) d.mi = spinId(d, d.x, d.z);
    const spinOf = (d) => d.mi || 0;
    // ----- the pool of near stages -----
    const SLOTS = low ? 9 : 13, CAPV = low ? 6500 : 11000, CAPI = low ? 10000 : 18000, BUILD_MS = low ? 1 : 1.6;
    const empty = new PKit(8, 12);
    empty.quad([0, -500, 0], [0.1, -500, 0], [0.1, -500, 0.1], [0, -500, 0.1], WHITE);
    const eg = empty.geometry(), batch = new T.BatchedMesh(SLOTS, SLOTS * CAPV, SLOTS * CAPI, tileMat('batched'));
    batch.perObjectFrustumCulled = false; batch.sortObjects = false; batch.frustumCulled = false;
    batch.customDepthMaterial = depthMat();
    const slots = [];
    for (let i = 0; i < SLOTS; i++) {
        const gid = batch.addGeometry(eg, CAPV, CAPI), inst = batch.addInstance(gid);
        batch.setVisibleAt(inst, false);
        slots.push({ gid, inst, ci: -1, sphere: new T.Sphere(), on: false, used: 0, near: false, empty: false });
    }
    eg.dispose();
    batch.castShadow = !low; batch.receiveShadow = !low;
    batch.matrixAutoUpdate = false; batch.updateMatrix();
    batch.renderOrder = -2;
    group.add(batch);
    const showSlot = (sl, on) => { batch.setVisibleAt(sl.inst, on); };
    const bySlot = new Map(), kit = new PKit(CAPV, CAPI), ATT = [['position', 'p', 3], ['normal', 'n', 3], ['color', 'c', 3], ['uv', 'u', 2], ['aFx', 'f', 2], ['aMi', 'm', 1]], G = batch.geometry;
    let built = 0, tick = 0, job = null, holesDirty = true;
    function* steps(ci) {
        for (const p of partsBy[ci]) {
            // (what moves is drawn where it rests, wherever the physics last put it)
            if (p.mv) { p.x = p.x0; p.z = p.z0; p.top = p.top0; p.tk = -1; }
            drawPart(kit, p, low);
            yield;
        }
        for (const d of decoBy[ci]) { drawDeco(kit, d, low, spinOf); yield; }
    }
    function begin(slot, ci) { kit.reset(); job = { slot, ci, it: steps(ci), up: -1 }; }
    // the chunk's bounds, then each attribute, then its index: one a frame. The slot's out of the draw until it's all there
    function copyStep() {
        const { slot, ci } = job, info = batch._geometryInfo[slot.gid], vs = info.vertexStart, nv = kit.nv, step = job.up++;
        if (step < 0) {
            if (slot.ci >= 0) bySlot.delete(slot.ci);
            slot.ci = -1; slot.near = false;
            if (slot.on) { slot.on = false; showSlot(slot, false); }
            holesDirty = true;
            if (!nv || nv > CAPV || kit.ni > CAPI) { if (nv) console.warn('[world] stage too big', ci, nv, kit.ni); slot.ci = ci; slot.empty = true; bySlot.set(ci, slot); job = null; return; }
            let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
            const p = kit.p;
            for (let i = 0, n = nv * 3; i < n; i += 3) {
                const x = p[i], y = p[i + 1], z = p[i + 2];
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
                if (z < z0) z0 = z; if (z > z1) z1 = z;
            }
            slot.sphere.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
            // (what moves can reach a little past where it's drawn)
            slot.sphere.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 24;
            return;
        }
        if (step < ATT.length) {
            const [name, key, item] = ATT[step], at = G.attributes[name];
            at.array.set(kit[key].subarray(0, nv * item), vs * item);
            at.addUpdateRange(vs * item, nv * item);
            at.needsUpdate = true;
            return;
        }
        const idx = G.index, A = idx.array, I = kit.i, is = info.indexStart, ni = kit.ni;
        for (let i = 0; i < ni; i++) A[is + i] = I[i] + vs;
        idx.addUpdateRange(is, ni);
        idx.needsUpdate = true;
        info.vertexCount = nv; info.indexCount = ni; info.start = is; info.count = ni;
        info.boundingBox = null; info.boundingSphere = null;
        batch._visibilityChanged = true;
        slot.ci = ci; slot.empty = false;
        bySlot.set(ci, slot);
        built++;
        holesDirty = true;
        job = null;
    }
    function advance(all) {
        const t0 = performance.now();
        while (job && job.it) {
            if (job.it.next().done) { job.it = null; break; }
            if (!all && performance.now() - t0 > BUILD_MS) return;
        }
        if (all) { while (job) copyStep(); } else if (job) copyStep();
    }
    // which stages should be here, nearest first
    const order = [];
    for (let i = 0; i < center.length; i++) if (center[i].n) order.push({ i, d: 0 });
    const want = [];
    function wanted(x, y, z) {
        for (const o of order) { const C = center[o.i]; o.d = (C.x - x) * (C.x - x) + (C.y - y) * (C.y - y) * 0.6 + (C.z - z) * (C.z - z); }
        order.sort((a, b) => a.d - b.d);
        want.length = 0;
        for (let i = 0; i < order.length && want.length < SLOTS; i++) want.push(order[i].i);
    }
    function freeSlot() {
        for (const sl of slots) if (sl.ci < 0) return sl;
        let best = null;
        for (const sl of slots) if (want.indexOf(sl.ci) < 0 && (!best || sl.used < best.used)) best = sl;
        return best;
    }
    // the stretches now in detail: the far picture leaves them out, and a stage off that list isn't drawn in detail
    const runs = [];
    function writeHoles() {
        holesDirty = false;
        runs.length = 0;
        for (const ci of want) { const sl = bySlot.get(ci); if (sl && !sl.empty) runs.push(ci); }
        runs.sort((a, b) => a - b);
        for (const sl of slots) sl.near = false;
        let n = 0;
        for (let i = 0; i < runs.length && n < holes.length;) {
            let e = i;
            while (e + 1 < runs.length && runs[e + 1] === runs[e] + 1) e++;
            holes[n++].set(runs[i], runs[e]);
            for (let q = i; q <= e; q++) bySlot.get(runs[q]).near = true;
            i = e + 1;
        }
        while (n < holes.length) holes[n++].set(-1, -1);
    }
    let wantT = 0;
    function stream(x, y, z, all) {
        wantT--;
        if (all || wantT <= 0) { wantT = 12; const was = want.join(); wanted(x, y, z); if (want.join() !== was) holesDirty = true; }
        for (const ci of want) { const sl = bySlot.get(ci); if (sl) sl.used = tick; }
        if (job) {
            advance(all);
            if (!all) { if (holesDirty) writeHoles(); return; }
        }
        for (const ci of want) {
            if (bySlot.has(ci)) continue;
            const f = freeSlot();
            if (!f) break;
            begin(f, ci);
            f.used = tick;
            advance(all);
            if (!all) break;
        }
        if (holesDirty) writeHoles();
    }
    // ----- the far picture -----
    // (a piece a world, so what's past the haze isn't drawn at all)
    const pieces = [];
    const addPiece = (mesh, order) => {
        mesh.matrixAutoUpdate = false; mesh.frustumCulled = true; mesh.renderOrder = order; mesh.castShadow = false;
        mesh.geometry.computeBoundingSphere();
        pieces.push(mesh);
        group.add(mesh);
    };
    for (const w of c.main ? WORLDS.map((_, i) => i) : [c.world]) {
        const far = new T.Mesh(farGeometry(c, low, c.main ? w : -1), farMat());
        far.receiveShadow = false;
        addPiece(far, -3);
        const sk = new PKit(low ? 2500 : 9000, low ? 4000 : 14000);
        addScenery(sk, c, w, low, R);
        const around = new T.Mesh(sk.geometry(), mat);
        around.receiveShadow = !low;
        addPiece(around, -1);
    }
    // ----- the island and what stands on it (only on the long run) -----
    const baseKit = new PKit(c.main ? 40000 : 6000, c.main ? 60000 : 9000);
    const signs = new Signs(2, 448, 152);
    if (opts.decorate) opts.decorate(baseKit, signs, R);
    for (const S of c.signs) signs.add([big(S.text, GOLD, 92)], S.size, new T.Vector3(S.x, S.y, S.z), true);
    const baseMesh = new T.Mesh(baseKit.geometry(), mat);
    baseMesh.receiveShadow = !low; baseMesh.castShadow = false; baseMesh.matrixAutoUpdate = false; baseMesh.frustumCulled = false; baseMesh.renderOrder = -1;
    group.add(baseMesh);
    // ----- the sea -----
    const sea = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), seaMaterial());
    sea.position.set(0, SEA_Y + 3, 0); sea.renderOrder = 1; sea.frustumCulled = false; sea.matrixAutoUpdate = false; sea.updateMatrix();
    group.add(sea);
    // ----- the rings over the checkpoints near you: gold until you've touched them, green after -----
    const padKit = new PKit(64, 96);
    padKit.torus(0, 0.28, 0, 6.3, 0.34, WHITE, { n: 16, s: 4, mode: FX.GLOW, flatten: 0.5 });
    const pads = new T.InstancedMesh(padKit.geometry(), tileMat('crowd'), 16);
    pads.frustumCulled = false; pads.count = 0; pads.castShadow = false; pads.receiveShadow = false;
    const padGold = new T.Color(1, 0.84, 0.2), padGreen = new T.Color(0.3, 1, 0.5), mm = new T.Matrix4(), qq = new T.Quaternion(), vv = new T.Vector3(), one = new T.Vector3(1, 1, 1);
    pads.setColorAt(0, padGold);
    group.add(pads);
    const padOn = new Uint8Array(c.cps.length);
    function writePads(px, py, pz) {
        let n = 0;
        for (let i = 0; i < c.cps.length && n < 16; i++) {
            const p = c.cps[i];
            if (Math.hypot(p.x - px, p.y - py, p.z - pz) > 320) continue;
            pads.setMatrixAt(n, mm.compose(vv.set(p.x, p.y, p.z), qq, one));
            pads.setColorAt(n, padOn[i] ? padGreen : padGold);
            n++;
        }
        pads.count = n; pads.visible = n > 0;
        pads.instanceMatrix.needsUpdate = true;
        if (pads.instanceColor) pads.instanceColor.needsUpdate = true;
    }
    // ----- the line a race starts from: see-through until GO -----
    let barrier = null;
    if (c.barrierZ !== undefined) {
        const bk = new PKit(8, 12), W = 15, zz = c.start.z + c.barrierZ;
        bk.quad([-W, c.start.y, zz], [W, c.start.y, zz], [W, c.start.y + 16, zz], [-W, c.start.y + 16, zz], WHITE);
        barrier = new T.Mesh(bk.geometry(), new T.MeshBasicMaterial({ color: 0x5ad8ff, transparent: true, opacity: 0.32, side: T.DoubleSide, depthWrite: false }));
        barrier.renderOrder = 3; barrier.frustumCulled = false; barrier.visible = false;
        group.add(barrier);
    }
    signs.build(group);
    // ----- culling: each stage on its own -----
    const F = new T.Frustum(), FS = new T.Frustum(), Mx = new T.Matrix4();
    let flipped = 0, padT = 0, seaX = 0, seaZ = 0;
    // what's beyond the haze isn't drawn, and the sea goes with you (it's painted by where it is, so it never looks to move)
    function pieceCull(x, y, z) {
        const reach = scene.fog.far * 0.96;
        for (const m of pieces) { const S = m.geometry.boundingSphere; m.visible = S.radius > 0 && Math.hypot(S.center.x - x, S.center.y - y, S.center.z - z) - S.radius < reach; }
        if (c.main) baseMesh.visible = Math.hypot(x, y, z) < reach + HUB_R;
        const sx = Math.round(x / 200) * 200, sz = Math.round(z / 200) * 200;
        if (sx !== seaX || sz !== seaZ) { seaX = sx; seaZ = sz; sea.position.set(sx, SEA_Y + 3, sz); sea.updateMatrix(); }
    }
    function cull(cam, shadowCam) {
        cam.updateMatrixWorld();
        F.setFromProjectionMatrix(Mx.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        if (shadowCam) FS.setFromProjectionMatrix(Mx.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse));
        for (const sl of slots) {
            if (sl.ci < 0 || sl.empty) continue;
            const vis = sl.near && (F.intersectsSphere(sl.sphere) || (!!shadowCam && FS.intersectsSphere(sl.sphere)));
            if (vis !== sl.on) { sl.on = vis; showSlot(sl, vis); flipped++; }
        }
    }
    const view = {
        c, group, signs, batch, extras: opts.extras || null, table,
        // the movers' table: yours when this course is the one on screen
        activate() { setMovers(table); },
        update(dt, time, cam, shadowCam, px, py, pz) {
            tick++;
            stream(px, py, pz, false);
            cull(cam, shadowCam);
            padT -= dt;
            if (padT <= 0) { padT = 0.5; writePads(px, py, pz); pieceCull(px, py, pz); }
            if (barrier && barrier.visible) barrier.material.opacity = 0.26 + 0.1 * Math.sin(CU.uNow.value * 4);
        },
        // everywhere near here, now (behind a fade, or when you've been sent somewhere)
        prepareAt(x, y, z) { tick++; stream(x, y, z, true); writePads(x, y, z); pieceCull(x, y, z); },
        // for the test: the biggest stage there is, drawn in full, and how many won't fit their slot
        sizes() {
            const k2 = new PKit(CAPV, CAPI);
            let nv = 0, ni = 0, over = 0;
            for (let ci = 0; ci < partsBy.length; ci++) {
                k2.reset();
                for (const p of partsBy[ci]) drawPart(k2, p, low);
                for (const d of decoBy[ci]) drawDeco(k2, d, low, spinOf);
                nv = Math.max(nv, k2.nv); ni = Math.max(ni, k2.ni);
                if (k2.nv > CAPV || k2.ni > CAPI) over++;
            }
            return { nv, ni, over, CAPV, CAPI, pieces: pieces.length, movers: table.length, farVerts: pieces.reduce((a, m) => a + m.geometry.attributes.position.count, 0) };
        },
        setBarrier(on) { if (barrier) barrier.visible = on; },
        padsFrom(n) { padOn.fill(0); for (let i = 0; i < Math.min(n, padOn.length); i++) padOn[i] = 1; padT = 0; },
        padTouch(i) { padOn[i] = 1; padT = 0; },
        flips: () => flipped,
        chunksBuilt: () => built,
        // for the warm-up: everything drawn once
        warm(on) {
            if (on) { for (const m of pieces) m.visible = true; baseMesh.visible = true; for (const sl of slots) if (sl.ci >= 0 && !sl.empty && !sl.on) { sl.on = true; showSlot(sl, true); } pads.visible = true; pads.count = Math.max(pads.count, 1); if (barrier) barrier.visible = true; return; }
            if (barrier) barrier.visible = false;
            // all of it went up with the first draw: the batch's own list of ranges to send is out of date, and would send all of it again
            for (const [name] of ATT) G.attributes[name].clearUpdateRanges();
            G.index.clearUpdateRanges();
        },
        dispose() {
            if (group.parent) group.parent.remove(group);
            batch.dispose(); for (const m of pieces) m.geometry.dispose(); baseMesh.geometry.dispose(); sea.geometry.dispose(); sea.material.dispose(); pads.geometry.dispose(); pads.dispose(); signs.dispose();
            if (barrier) { barrier.geometry.dispose(); barrier.material.dispose(); }
        },
    };
    return view;
}
void TILE; void HUB_R; void WHITE_S; void AQUA; void PINK; void RED; void LIME; void drawDeco;
