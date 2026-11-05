// Moving and jumping, shared: your own character runs it on your screen every frame, the server runs it for the bots.
// A body is an upright cylinder against the course's parts: the velocity eases toward where you steer (quick on the ground, floatier in
// the air, slithering on ice), a little coyote time, steps up small ledges and catches the lip of a ledge on the way down, and a jump
// released early stops rising at a hop's speed (tap for quick hops, hold for your full power). What you stand on carries you.
import { CFG, jumpV } from './config.js';
import { RB, PH, MK, TAU } from './course.js';

export const STEP = 1.45, CATCH = 2.3;
// what stepBody says happened
export const EV = { NONE: 0, JUMP: 1, AIRJUMP: 2, LAND: 3, BOUNCE: 4, KNOCK: 5, LETHAL: 6 };

export function newBody(x, y, z) {
    return { x, y, z, vx: 0, vy: 0, vz: 0, ex: 0, ez: 0, onGround: true, ground: null, coyote: 0, rising: false, airJumps: 0, airT: 0, safeT: 0, glide: false, climb: false, knockT: 0, fromY: y, lastHit: null };
}

// after moving sideways: out of whatever you've walked into (or up onto it, if it's low enough)
function resolveH(b, w, list) {
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.ladder || p.lethal) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        if (p.knock) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        if (p.r) {
            const d2 = dx * dx + dz * dz, m = p.r + RB;
            if (d2 >= m * m || b.y >= p.top - 1e-3 || b.y + PH <= p.top - p.h) continue;
            const rise = p.top - b.y;
            if (rise <= STEP || (rise <= CATCH && b.vy <= 0)) { b.y = p.top + 1e-3; continue; }
            const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
            b.x = p.x + nx * m; b.z = p.z + nz * m;
            const vn = b.vx * nx + b.vz * nz;
            if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
            continue;
        }
        const ca = p.ca, sa = p.sa, lx = dx * ca - dz * sa, lz = dx * sa + dz * ca, ex = p.hx + RB, ez = p.hz + RB;
        if (lx >= ex || lx <= -ex || lz >= ez || lz <= -ez) continue;
        let top = p.top;
        if (p.y1 !== undefined) { const f = (lz + p.hz) / (2 * p.hz); top = p.y0 + (p.y1 - p.y0) * (f < 0 ? 0 : f > 1 ? 1 : f); }
        if (b.y >= top - 1e-3 || b.y + PH <= top - p.h) continue;
        const rise = top - b.y;
        if (rise <= STEP || (rise <= CATCH && b.vy <= 0)) { b.y = top + 1e-3; continue; }
        // the shortest way out
        const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
        if (px < pz) {
            const sg = lx >= 0 ? 1 : -1, nx = ca * sg, nz = -sa * sg;
            b.x += nx * px; b.z += nz * px;
            const vn = b.vx * nx + b.vz * nz;
            if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
        } else {
            const sg = lz >= 0 ? 1 : -1, nx = sa * sg, nz = ca * sg;
            b.x += nx * pz; b.z += nz * pz;
            const vn = b.vx * nx + b.vz * nz;
            if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
        }
    }
}
function resolveV(b, w, list, d) {
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.ladder || p.lethal || p.knock || p.noFloor) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        const top = w.topAt(p, b.x, b.z, RB);
        if (top === -Infinity) continue;
        const bot = top - p.h;
        if (b.y >= top || b.y + PH <= bot) continue;
        if (d < 0) {
            const pen = top - b.y;
            if (pen <= Math.max(STEP, -d + 0.05)) { b.y = top; if (b.vy < 0) b.vy = 0; b.onGround = true; b.ground = p; }
        } else {
            const pen = b.y + PH - bot;
            if (pen <= d + 0.05) { b.y = bot - PH - 1e-4; if (b.vy > 0) b.vy = 0; b.rising = false; }
        }
    }
}
// a little way down to the ground under you (walking down a slope stays on it)
function groundProbe(b, w, list, maxDrop) {
    let best = -Infinity, bt = null;
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.ladder || p.lethal || p.knock || p.noFloor) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        const top = w.topAt(p, b.x, b.z, RB);
        if (top === -Infinity) continue;
        if (top <= b.y + 0.02 && top >= b.y - maxDrop && top > best) { best = top; bt = p; }
    }
    if (bt) { b.y = best; b.onGround = true; b.ground = bt; if (b.vy < 0) b.vy = 0; }
}
// what you stand on carries you
function carry(b, w) {
    const g = b.ground;
    if (!g || !g.mv) return;
    const m = g.mv;
    if (m.k === MK.SLIDE) {
        const a = TAU * (w.prevTime / m.P + m.ph), c = TAU * (w.time / m.P + m.ph), d = Math.sin(c) - Math.sin(a), e = Math.cos(c) - Math.cos(a);
        b.x += m.ax * d + m.bx * e; b.z += m.az * d + m.bz * e; b.y += m.ay * d;
    } else if (m.k === MK.SPIN) {
        const da = TAU * (w.time - w.prevTime) / m.P * m.dir, cs = Math.cos(da), sn = Math.sin(da), dx = b.x - g.x0, dz = b.z - g.z0;
        b.x = g.x0 + dx * cs + dz * sn; b.z = g.z0 - dx * sn + dz * cs;
    }
}

// One step. inp: { mx, mz (where to go, length <= 1), jump (pressed this step), hold (jump still held), power (your jump power),
// double (has Twin Hop), glide (has the Cloud Cape), speed (x walk), gravity (x gravity) }. w: the course. Returns what happened (EV).
export function stepBody(b, inp, dt, w) {
    let ev = EV.NONE;
    const grav = CFG.grav * (inp.gravity ?? 1);
    carry(b, w);
    if (b.onGround) { b.coyote = 0.11; b.airJumps = 0; b.airT = 0; b.fromY = b.y; } else { b.coyote -= dt; b.airT += dt; }
    if (b.safeT > 0) b.safeT -= dt;
    if (b.knockT > 0) b.knockT -= dt;
    const g0 = b.ground;
    let list = w.near(b.x, b.z) || NONE;
    // a ladder: pushing toward it takes you up, letting go holds you, JUMP leaps off
    b.climb = false;
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.ladder) continue;
        const dx = b.x - p.x, dz = b.z - p.z, lx = dx * p.ca - dz * p.sa, lz = dx * p.sa + dz * p.ca;
        if (Math.abs(lx) > p.hx + RB * 0.3 || Math.abs(lz) > p.hz + RB * 1.5 || b.y > p.top || b.y + PH < p.top - p.h) continue;
        const fwd = -(inp.mx * p.sa + inp.mz * p.ca);   // the ladder's near face looks back along the course
        const into = -fwd;
        if (into > 0.2 || (!b.onGround && into > -0.2)) {
            b.climb = true;
            b.vy = into > 0.2 ? CFG.climb * (inp.speed > 1 ? inp.speed : 1) : 0;
            b.rising = false; b.onGround = false; b.ground = null; b.coyote = 0; b.fromY = b.y; b.airT = 0;
        }
        break;
    }
    if (inp.jump && !b.climb) {
        if (b.onGround || b.coyote > 0) { b.vy = jumpV(inp.power); b.onGround = false; b.ground = null; b.coyote = 0; b.rising = true; ev = EV.JUMP; }
        else if (inp.double && b.airJumps < 1) { b.airJumps++; b.vy = jumpV(inp.power) * 0.82; b.rising = true; ev = EV.AIRJUMP; }
    }
    // let go early: a hop
    if (b.rising && !inp.hold && b.vy > CFG.hopV) b.vy = CFG.hopV;
    if (b.vy <= 0) b.rising = false;
    if (!b.climb) b.vy = Math.max(-CFG.fallMax, b.vy - grav * dt);
    // the Cloud Cape: JUMP held on the way down
    b.glide = !!(inp.glide && inp.hold && !b.onGround && !b.climb && b.vy < -CFG.glideFall);
    if (b.glide) b.vy = -CFG.glideFall;
    const ws = CFG.walk * (inp.speed || 1);
    // the ground under you (ice lets you slither); floatier in the air; knocked flying, you can't do much
    const gr = b.onGround ? (g0 && g0.ice ? 2.8 : 30) : (b.knockT > 0 ? 1.2 : CFG.airGrip), k = Math.min(1, dt * gr), ws2 = g0 && g0.ice ? ws * 1.25 : ws;
    b.vx += (inp.mx * ws2 - b.vx) * k;
    b.vz += (inp.mz * ws2 - b.vz) * k;
    // momentum from a speed pad or a blow dies away
    const ed = Math.exp(-dt * (b.onGround ? 3.2 : 0.9));
    b.ex *= ed; b.ez *= ed;
    const belt = b.onGround && g0 && g0.belt ? g0.belt : null, vx = b.vx + b.ex + (belt ? belt[0] : 0), vz = b.vz + b.ez + (belt ? belt[1] : 0);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vz), Math.abs(b.vy)) * dt / 0.45)), sdt = dt / n;
    const wasOn = b.onGround;
    b.onGround = false; b.ground = null;
    for (let i = 0; i < n; i++) {
        b.x += vx * sdt; b.z += vz * sdt;
        list = w.near(b.x, b.z) || NONE;
        resolveH(b, w, list);
        const dy = b.vy * sdt;
        b.y += dy;
        resolveV(b, w, list, dy);
    }
    list = w.near(b.x, b.z) || NONE;
    if (!b.onGround && wasOn && b.vy <= 0) groundProbe(b, w, list, 0.9);
    else if (!b.onGround && b.vy <= 0) groundProbe(b, w, list, 0.05);
    if (b.onGround && !wasOn) ev = ev || EV.LAND;
    const G = b.ground;
    if (b.onGround && G) {
        // a springy pad throws you up; a speed pad throws you on
        if (G.bounce) { b.vy = G.bounce; b.onGround = false; b.ground = null; b.rising = false; ev = EV.BOUNCE; b.fromY = b.y; }
        else if (G.boost) { b.ex = G.boost[0]; b.ez = G.boost[1]; }
    }
    // what can hurt you: anywhere your body touches it
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.lethal && !p.knock) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        const top = p.top, bot = top - p.h;
        if (b.y >= top - 0.01 || b.y + PH <= bot) continue;
        const dx = b.x - p.x, dz = b.z - p.z, lx = dx * p.ca - dz * p.sa, lz = dx * p.sa + dz * p.ca, m = p.lethal ? -0.1 : RB;
        if (Math.abs(lx) > p.hx + m || Math.abs(lz) > p.hz + m) continue;
        if (p.lethal) { if (b.safeT <= 0) ev = EV.LETHAL; continue; }
        // a blow: away from it and up
        if (b.safeT > 0 || b.knockT > 0) continue;
        let nx = dx, nz = dz;
        const m0 = p.mv;
        if (m0 && m0.k === MK.SPIN) { const sg = m0.dir * (lz >= 0 ? 1 : -1); nx = p.ca * sg; nz = -p.sa * sg; }
        else if (m0 && m0.k === MK.SWING) { const s = Math.cos(TAU * (w.time / m0.P + m0.ph)); nx = m0.dx * (s >= 0 ? 1 : -1); nz = m0.dz * (s >= 0 ? 1 : -1); }
        const l = Math.hypot(nx, nz) || 1;
        b.ex = nx / l * 34; b.ez = nz / l * 34; b.vx *= 0.3; b.vz *= 0.3; b.vy = 26; b.onGround = false; b.ground = null; b.rising = false; b.knockT = 0.5; b.lastHit = p;
        ev = EV.KNOCK;
    }
    // a fall into the sky, or the sea
    if (b.y < w.seaY || (!b.onGround && b.y < b.fromY - CFG.fallKill)) ev = EV.LETHAL;
    return ev;
}
const NONE = [];
