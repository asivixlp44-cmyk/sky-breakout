// The courses: a long sky obby of 135 stages through nine worlds, and the shorter Storm Rush maps. Both sides build the same course from the
// same numbers: the client draws it and moves you on it, the server runs its bots on it and checks where you say you are.
// A course is a list of parts: boxes turned about the vertical (a slope when y0 and y1 differ), round discs, and what makes them obstacles:
// moving, spinning, blinking, swinging, deadly, bouncy, slippery. Everything that moves is a pure function of one clock, so the
// client's picture (moved in the vertex shader), its physics and the server's bots all agree with no messages at all.
import { rngFrom, clamp, STAGES, STAGES_PER_WORLD, WORLDS, RUSH_TIERS, worldOfStage, stageD } from './config.js';

export const TAU = Math.PI * 2;
export const RB = 1, PH = 5;      // a body's radius and height
export const SEA_Y = -6;
export const HUB_R = 160;         // the home island
const CELL = 24;
// the clock everything moves by: it wraps every two minutes, and every period below divides that exactly, so nothing ever jumps
export const WRAP = 120;
export const courseClock = (ms) => (ms % (WRAP * 1000)) / 1000;
export const HUB = {
    spawn: { x: 0, z: -40 }, yaw: 0,                 // looking along the way to the Start Gate
    gate: { x: 0, z: 118 },
    board: { x: -62, z: 26 }, ranks: { x: -78, z: 0 },
    eggs: { x: 74, z: -6 }, gear: { x: 66, z: 44 }, trails: { x: -52, z: 74 }, rush: { x: 46, z: 88 },
};

// ----- what's standing where: the parts -----
const fract = (v) => v - Math.floor(v);
const lerp = (a, b, k) => a + (b - a) * k;
const MK = { SLIDE: 0, SPIN: 1, BLINK: 2, SWING: 3 };
export { MK };

export class Course {
    constructor(id, world) {
        this.id = id; this.world = world;
        this.parts = []; this.cps = []; this.route = []; this.deco = []; this.movers = []; this.signs = [];
        this.chunks = 1;                // how many pieces it's drawn in (one per stage, and the start)
        this.grid = new Map();
        this.time = 0; this.prevTime = 0; this.tick = 0;
        this.seaY = SEA_Y; this.total = 1; this.main = false;
        this.start = null; this.finish = null;
        this.hubR = 0;
    }
    setTime(t, dt) { this.prevTime = t - (dt || 0); this.time = t; this.tick++; }
    // where a moving part is right now (at most once a tick, and only the ones someone's near)
    pose(p) {
        if (p.tk === this.tick) return;
        p.tk = this.tick;
        const m = p.mv, t = this.time;
        if (m.k === MK.SLIDE) {
            const a = TAU * (t / m.P + m.ph), s = Math.sin(a), co = Math.cos(a);
            p.x = p.x0 + m.ax * s + m.bx * co; p.z = p.z0 + m.az * s + m.bz * co;
            const dy = m.ay * s;
            p.top = p.top0 + dy;
            if (p.y1 !== undefined) { p.y0 = p.y00 + dy; p.y1 = p.y10 + dy; }
        } else if (m.k === MK.SPIN) {
            const a = p.ry0 + TAU * (t / m.P + m.ph) * m.dir;
            p.ca = Math.cos(a); p.sa = Math.sin(a);
        } else if (m.k === MK.BLINK) {
            p.on = fract(t / m.P + m.ph) < m.duty;
        } else {
            const a = m.amp * Math.sin(TAU * (t / m.P + m.ph)), s = Math.sin(a), co = Math.cos(a);
            p.x = m.px + m.dx * s * m.len; p.z = m.pz + m.dz * s * m.len; p.top = m.py - co * m.len + p.h / 2;
        }
    }
    // is a blinking part there at time t?
    onAt(p, t) { const m = p.mv; return !m || m.k !== MK.BLINK || fract(t / m.P + m.ph) < m.duty; }
    // where a sliding part will be at time t (the pilot looks ahead)
    futureOf(p, t, out) {
        const m = p.mv;
        out.x = p.x0; out.z = p.z0; out.y = p.top0;
        if (m && m.k === MK.SLIDE) { const a = TAU * (t / m.P + m.ph), s = Math.sin(a), co = Math.cos(a); out.x += m.ax * s + m.bx * co; out.z += m.az * s + m.bz * co; out.y += m.ay * s; }
        return out;
    }
    near(x, z) { return this.grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))); }
    index() {
        for (const p of this.parts) {
            let ex = Math.abs(p.hx * p.ca) + Math.abs(p.hz * p.sa), ez = Math.abs(p.hx * p.sa) + Math.abs(p.hz * p.ca);
            if (p.r) ex = ez = p.r;
            let x0 = p.x, z0 = p.z, xr = ex, zr = ez;
            const m = p.mv;
            if (m) {
                if (m.k === MK.SLIDE) { xr += Math.abs(m.ax) + Math.abs(m.bx); zr += Math.abs(m.az) + Math.abs(m.bz); }
                else if (m.k === MK.SPIN) { xr = zr = Math.hypot(p.hx, p.hz); if (p.r) xr = zr = p.r; }
                else if (m.k === MK.SWING) { x0 = m.px; z0 = m.pz; xr = Math.abs(m.dx) * m.len * Math.sin(Math.min(1.5, m.amp)) + ex; zr = Math.abs(m.dz) * m.len * Math.sin(Math.min(1.5, m.amp)) + ez; }
            }
            const pad = RB + 1, i0 = Math.floor((x0 - xr - pad) / CELL), i1 = Math.floor((x0 + xr + pad) / CELL), j0 = Math.floor((z0 - zr - pad) / CELL), j1 = Math.floor((z0 + zr + pad) / CELL);
            for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
                const k = cellKey(i, j);
                let l = this.grid.get(k);
                if (!l) { l = []; this.grid.set(k, l); }
                l.push(p);
            }
        }
        this.tuneFinish();
    }
    tuneFinish() { if (this.finish) this.total = this.finish.s; }
    // the top of a part at this point (slopes), or -Infinity if the point isn't over it
    topAt(p, x, z, m) {
        m = m || 0;
        const dx = x - p.x, dz = z - p.z;
        if (p.r) { if (dx * dx + dz * dz > (p.r + m) * (p.r + m)) return -Infinity; return p.top; }
        const lx = dx * p.ca - dz * p.sa, lz = dx * p.sa + dz * p.ca;
        if (lx > p.hx + m || lx < -p.hx - m || lz > p.hz + m || lz < -p.hz - m) return -Infinity;
        if (p.y1 !== undefined) { const f = clamp((lz + p.hz) / (2 * p.hz), 0, 1); return p.y0 + (p.y1 - p.y0) * f; }
        return p.top;
    }
    // the highest thing under (x, y, z) a body could stand on; -Infinity when nothing's there. Far from a mover, its whole sweep counts (the server's lenient: your clock isn't quite its clock)
    groundBelow(x, y, z, reach, sweep) {
        const l = this.near(x, z);
        let best = -Infinity;
        if (!l) return best;
        for (let i = 0; i < l.length; i++) {
            const p = l[i];
            if (p.noFloor || p.lethal || p.knock || p.ladder) continue;
            if (p.mv) {
                if (sweep) {
                    const m = p.mv;
                    if (m.k === MK.SLIDE) {
                        const ax = Math.abs(m.ax) + Math.abs(m.bx), az = Math.abs(m.az) + Math.abs(m.bz), ay = Math.abs(m.ay);
                        if (Math.abs(x - p.x0) > ax + Math.max(p.hx, p.hz, p.r || 0) + 3 || Math.abs(z - p.z0) > az + Math.max(p.hx, p.hz, p.r || 0) + 3) continue;
                        const top = p.top0 + (m.ay ? clamp(y - p.top0, -ay, ay) : 0);
                        if (top <= y + (reach ?? 0.5) && top > best) best = top;
                        continue;
                    }
                    if (m.k === MK.BLINK) { const top = this.topAt(p, x, z, RB + 1); if (top <= y + (reach ?? 0.5) && top > best) best = top; continue; }
                }
                this.pose(p);
                if (p.on === false) continue;
            }
            const top = this.topAt(p, x, z, RB);
            if (top <= y + (reach ?? 0.5) && top > best) best = top;
        }
        return best;
    }
    // is this spot inside something solid? (the camera's ray asks)
    solidAt(x, y, z) {
        const l = this.near(x, z);
        if (!l) return false;
        for (let i = 0; i < l.length; i++) {
            const p = l[i];
            if (p.noCam || p.noFloor) continue;
            if (p.mv) continue;
            const top = this.topAt(p, x, z);
            if (top === -Infinity) continue;
            if (y < top && y > top - p.h) return true;
        }
        return false;
    }
    // where you come back from checkpoint i (-1: the start)
    respawnOf(i) {
        if (i < 0 || !this.cps.length) return { x: this.start.x, y: this.start.y + 0.2, z: this.start.z, ry: this.start.ry, s: 0 };
        const c = this.cps[clamp(i, 0, this.cps.length - 1)];
        return { x: c.x, y: c.y + 0.2, z: c.z, ry: c.ry, s: c.s };
    }
    // the place on a race's start line (spot from 0), or the start of the long run
    startSpot(spot) {
        const b = this.start, sp = spot || 0, col = sp % 4, row = sp >> 2, lat = (col - 1.5) * 5, back = row * 6;
        return { x: b.x + b.rx * lat - b.fx * back, y: b.y + 0.2, z: b.z + b.rz * lat - b.fz * back, ry: b.ry, s: 0 };
    }
    // how far along: i is the last checkpoint you've touched
    sAt(i, x, y, z) {
        const a = i >= 0 ? this.cps[i] : this.start, b = i + 1 < this.cps.length ? this.cps[i + 1] : this.finish;
        if (!a || !b) return this.total;
        const sa = i >= 0 ? a.s : 0, dx = b.x - a.x, dz = b.z - a.z, dy = (b.y - a.y) * 0.4, l2 = dx * dx + dz * dz + dy * dy, f = l2 > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz + (y - a.y) * 0.4 * dy) / l2, 0, 1) : 0;
        return sa + (b.s - sa) * f;
    }
    // the point at a distance along the course, and which way it's heading there (the storm)
    pointAt(s, out) {
        const n = this.cps.length, st = this.start;
        let ax = st.x, ay = st.y, az = st.z, as = 0, bx, by, bz, bs;
        for (let i = 0; i <= n; i++) {
            const c = i < n ? this.cps[i] : this.finish;
            bx = c.x; by = c.y; bz = c.z; bs = c.s;
            if (s <= bs || i === n) break;
            ax = bx; ay = by; az = bz; as = bs;
        }
        const f = bs > as ? clamp((s - as) / (bs - as), -2, 1) : 0;
        out.x = ax + (bx - ax) * f; out.y = ay + (by - ay) * f; out.z = az + (bz - az) * f;
        out.ry = Math.atan2(bx - ax, bz - az);
        return out;
    }
    // the first route node of checkpoint i
    routeOf(i) { return i < 0 ? 0 : this.cps[clamp(i, 0, this.cps.length - 1)].routeI; }
    facing(i) { return i < 0 ? this.start.ry : this.cps[clamp(i, 0, this.cps.length - 1)].ry; }
    // the checkpoint pad you're standing on, within a few of the one you last touched
    padAt(x, y, z, from, ahead) {
        const a = Math.max(0, from), b = Math.min(this.cps.length - 1, from + (ahead ?? 3));
        for (let i = b; i >= a; i--) {
            const c = this.cps[i];
            if (Math.abs(x - c.x) <= c.hw + 1.5 && Math.abs(z - c.z) <= c.hw + 1.5 && Math.abs(y - c.y) <= 5) return i;
        }
        return -1;
    }
    atFinish(x, y, z) { const f = this.finish; return f && Math.hypot(x - f.x, z - f.z) <= f.r && Math.abs(y - f.y) <= 6; }
}
const cellKey = (i, j) => (i + 8192) * 16384 + (j + 8192);

// ----- building a course: a cursor walking through the sky -----
class Builder {
    constructor(c, seed, world) {
        this.c = c; this.R = rngFrom(seed); this.x = 0; this.y = 0; this.z = 0; this.h = 0; this.world = world; this.chunk = 0;
        this.turnTo(0);
    }
    turnTo(h) { this.h = (h + 4) % 4; this.ry = this.h * TAU / 4; this.fx = Math.round(Math.sin(this.ry)); this.fz = Math.round(Math.cos(this.ry)); this.rx = this.fz; this.rz = -this.fx; }
    wx(u, v) { return this.x + this.fx * u + this.rx * v; }
    wz(u, v) { return this.z + this.fz * u + this.rz * v; }
    adv(u, v) { this.x = this.wx(u, v || 0); this.z = this.wz(u, v || 0); }
    // o: u, v (centre), y (its top; y1: the top at its far end, a slope), w (across), l (along), h (thick), rot, look, tone, and what makes it an obstacle
    part(o) {
        const c = this.c, ry = this.ry + (o.rot || 0), x = this.wx(o.u || 0, o.v || 0), z = this.wz(o.u || 0, o.v || 0);
        const p = {
            id: c.parts.length, x, z, x0: x, z0: z, top: o.y, top0: o.y, h: o.h ?? 2.5, hx: (o.w || 1) / 2, hz: (o.l || 1) / 2, r: o.r || 0, ry, ry0: ry, ca: Math.cos(ry), sa: Math.sin(ry),
            look: o.look || 'deck', tone: o.tone || 0, chunk: this.chunk, world: this.world, tk: -1, on: true,
        };
        if (o.y1 !== undefined) { p.y0 = o.y; p.y1 = o.y1; p.y00 = o.y; p.y10 = o.y1; p.top = Math.max(o.y, o.y1); p.top0 = p.top; }
        for (const k of ['lethal', 'knock', 'bounce', 'ice', 'noCam', 'noFloor', 'ladder', 'decoOnly', 'small', 'steps', 'tones', 'label', 'noRail']) if (o[k] !== undefined) p[k] = o[k];
        if (o.boost) p.boost = [this.fx * o.boost, this.rx * 0 + this.fz * o.boost];
        if (o.belt) p.belt = [this.fx * o.belt[0] + this.rx * (o.belt[1] || 0), this.fz * o.belt[0] + this.rz * (o.belt[1] || 0)];
        if (o.mv) {
            const m = o.mv;
            if (m.k === MK.SLIDE) p.mv = { k: m.k, ax: this.fx * (m.u || 0) + this.rx * (m.v || 0), ay: m.y || 0, az: this.fz * (m.u || 0) + this.rz * (m.v || 0), bx: this.fx * (m.cu || 0) + this.rx * (m.cv || 0), bz: this.fz * (m.cu || 0) + this.rz * (m.cv || 0), P: m.P, ph: m.ph || 0 };
            else if (m.k === MK.SPIN) p.mv = { k: m.k, P: m.P, ph: m.ph || 0, dir: m.dir || 1 };
            else if (m.k === MK.BLINK) p.mv = { k: m.k, P: m.P, ph: m.ph || 0, duty: m.duty };
            else p.mv = { k: m.k, P: m.P, ph: m.ph || 0, amp: m.amp, px: x, py: m.py, pz: z, len: m.len, dx: this.rx, dz: this.rz };
            p.mi = c.movers.push(p);
        }
        c.parts.push(p);
        return p;
    }
    // a thing to look at, nothing to stand on: o: kind, u, v, y, s (size), ...
    deco(o) {
        const c = this.c;
        const d = { ...o, x: this.wx(o.u || 0, o.v || 0), y: o.y ?? this.y, z: this.wz(o.u || 0, o.v || 0), ry: this.ry + (o.rot || 0), chunk: this.chunk, world: this.world };
        delete d.u; delete d.v;
        c.deco.push(d);
        return d;
    }
    // route nodes, in the frame's coordinates
    run(u, v, y) { this.c.route.push({ k: 'r', x: this.wx(u, v), z: this.wz(u, v), y: y ?? this.y }); }
    jump(u, v, y, tu, tv, ty) { this.c.route.push({ k: 'j', x: this.wx(u, v), z: this.wz(u, v), y: y ?? this.y, tx: this.wx(tu, tv), tz: this.wz(tu, tv), ty }); }
    guarded(u, v, tu, tv, hop) { this.c.route.push({ k: 'g', x: this.wx(u, v), z: this.wz(u, v), y: this.y, tx: this.wx(tu, tv), tz: this.wz(tu, tv), hop: !!hop }); }
    board(p, u, v) { this.c.route.push({ k: 'm', p: p.id, x: this.wx(u, v), z: this.wz(u, v), y: this.y }); }
    off(p, tu, tv, ty) { this.c.route.push({ k: 'x', p: p.id, tx: this.wx(tu, tv), tz: this.wz(tu, tv), ty }); }
    blinkTo(p, u, v, y, tu, tv, ty, stay) { this.c.route.push({ k: 'b', p: p.id, x: this.wx(u, v), z: this.wz(u, v), y, tx: this.wx(tu, tv), tz: this.wz(tu, tv), ty, stay: stay ?? 0.45 }); }
    ladderUp(u, v, top, tu, tv) { this.c.route.push({ k: 'l', x: this.wx(u, v), z: this.wz(u, v), top, tx: this.wx(tu, tv), tz: this.wz(tu, tv) }); }
    air(tu, tv, ty) { this.c.route.push({ k: 'a', tx: this.wx(tu, tv), tz: this.wz(tu, tv), ty }); }
    // a checkpoint pad here: the stage starts on it. dir: which way the course goes on from it
    pad(i, turn) {
        const c = this.c, hw = 8, x = this.wx(hw, 0), z = this.wz(hw, 0), last = c.cps[c.cps.length - 1];
        this.part({ u: hw, y: this.y, w: hw * 2, l: hw * 2, h: 3.5, look: 'pad', tone: i });
        const ax = last ? last.x : c.start.x, ay = last ? last.y : c.start.y, az = last ? last.z : c.start.z;
        const s = (last ? last.s : 0) + Math.hypot(x - ax, (this.y - ay), z - az);
        c.route.push({ k: 'r', x, z, y: this.y, cp: c.cps.length });
        // out of the pad, by whichever side the course goes on
        this.x = x; this.z = z;
        if (turn) this.turnTo(this.h + turn);
        c.parts[c.parts.length - 1].exit = this.ry;
        const cp = { i: c.cps.length, x, y: this.y, z, hw, s, ry: this.ry, routeI: c.route.length - 1, world: this.world, chunk: this.chunk };
        c.cps.push(cp);
        this.adv(hw);
        return cp;
    }
}

// ----- the obstacles. Each starts at the cursor (standing, the course going on ahead), ends at the far edge of what it built.
// d is how hard: about 0 on the first stage, 1 is the top their numbers were first made for, 1.4 the very end of the run. Past 1 there's more of everything,
// narrower and quicker; each number has a limit, so that a run and a jump can still do it (a full jump clears about 18 studs on the flat) -----
const dn = (d) => Math.min(d, 1.5);    // what a count grows with
const hop = (b, g, dy) => { // a gap to whatever the next stage's pad is: leave the cursor beyond it
    const y0 = b.y;
    b.jump(-1, 0, y0, g + 3, 0, y0 + (dy || 0));
    b.adv(g); b.y += dy || 0;
};
const OB = {
    // round pads across a gap, a little to either side, a little higher
    steps(b, d, skin) {
        const R = b.R, n = 4 + Math.round(dn(d) * 3), rr = Math.max(2.8, lerp(5, 3, d)), g = Math.min(10.4, lerp(5.5, 9.5, d)), wide = 2 + Math.min(d, 0.8) * 6;
        let cu = 0, cv = 0, cy = b.y, r0 = 1;
        for (let i = 0; i < n; i++) {
            const dv = (R() - 0.5) * 2 * wide, dy = R() < 0.5 ? 1.2 : 0, nv = clamp(cv + dv, -9, 9), gap = g * (0.92 + R() * 0.16), u = cu + r0 + gap + rr, ny = cy + dy;
            const p = b.part({ u, v: nv, y: ny, r: rr, h: 2.4, look: skin === 'donut' ? 'donut' : 'disc', tone: i });
            void p;
            const l = Math.hypot(u - cu, nv - cv) || 1, kx = (u - cu) / l, kv = (nv - cv) / l;
            b.jump(cu + kx * (r0 - 0.8), cv + kv * (r0 - 0.8), cy, u, nv, ny);
            cu = u; cv = nv; cy = ny; r0 = rr;
        }
        b.jump(cu + r0 - 1.2, cv * 0.8, cy, cu + r0 + g + 3, 0, cy);
        b.adv(cu + r0 + g); b.y = cy;
    },
    donut(b, d) { OB.steps(b, d, 'donut'); },
    // a broad stair up in bands of colour (a slope underfoot, steps to the eye)
    stairs(b, d) {
        const rise = Math.min(32, lerp(12, 26, d)), l = rise * 1.7, w = Math.max(6, lerp(14, 8, d));
        b.part({ u: l / 2, y: b.y, y1: b.y + rise, w, l, h: 3, look: 'stairs', steps: Math.round(rise / 1.4) });
        b.run(l + 0.5, 0, b.y + rise);
        b.adv(l); b.y += rise;
    },
    // round and round a great stack of rings
    spiral(b, d) {
        const Rr = 15, w = Math.max(5.2, lerp(9, 6.5, d)), rise = Math.min(44, lerp(24, 36, d)), n = 22;
        // (a run-up, so the great stack stands clear of whatever came before)
        b.part({ u: 7, y: b.y, w: w + 2, l: 14, h: 2.2, look: 'deck', tone: 1 });
        b.run(13, 0, b.y);
        b.adv(14);
        const y0 = b.y, cu = 0, cv = Rr;
        b.part({ u: cu, v: cv, y: y0 + rise + 10, r: Rr - w / 2 - 0.6, h: rise + 16, look: 'column' });
        for (let i = 0; i < n; i++) {
            const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2, u = Rr * Math.sin(am), v = cv - Rr * Math.cos(am), l = TAU * Rr / n + 0.9;
            b.part({ u, v, rot: am, w, l, y: y0 + rise * (i - 0.03) / n, y1: y0 + rise * (i + 1.03) / n, h: 2.2, look: 'spiralStep', tone: i });
            b.run(Rr * Math.sin(a1), cv - Rr * Math.cos(a1), y0 + rise * (i + 1) / n);
        }
        b.y = y0 + rise;
        b.part({ u: 7, y: b.y, w: w + 2, l: 14, h: 2.2, look: 'deck', tone: 1 });
        b.run(13, 0, b.y);
        b.adv(14);
    },
    // a thin beam, with corners
    zig(b, d) {
        const w = Math.max(2.2, lerp(4.6, 2.6, d)), n = 3 + Math.round(dn(d) * 2), a = lerp(14, 12, Math.min(d, 1)), s = 11;
        let cu = 0, cv = 0, sign = b.R() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) {
            b.part({ u: cu + a / 2, v: cv, y: b.y, w, l: a + w, h: 1.6, look: 'beam', tone: i });
            b.run(cu + a, cv, b.y);
            cu += a;
            if (i < n - 1) { b.part({ u: cu, v: cv + sign * s / 2, y: b.y, w: s + w, l: w, h: 1.6, look: 'beam', tone: i + 3 }); b.run(cu, cv + sign * s, b.y); cv += sign * s; sign = -sign; }
        }
        b.part({ u: cu + 5, v: cv * 0.5, y: b.y, w: Math.abs(cv) + 6, l: 8, h: 1.6, look: 'beam', tone: 1 });
        b.run(cu + 4, cv, b.y);
        b.run(cu + 8, 0, b.y);
        b.adv(cu + 9);
    },
    // platforms sliding from side to side over a gap
    sliders(b, d) {
        const n = 1 + Math.round(dn(d) * 2), g = d > 1 ? 6 : 5, W = Math.max(7, lerp(11, 8, d)), A = Math.min(11, lerp(6, 10, d)), P = d > 1.1 ? 4 : d > 0.6 ? 5 : 6;
        let cu = 0;
        let prev = null;
        for (let i = 0; i < n; i++) {
            const u = cu + g + W / 2, ph = i % 2 ? 0.5 : 0;
            const p = b.part({ u, v: 0, y: b.y, w: W, l: W, h: 1.8, look: 'mover', tone: i, mv: { k: MK.SLIDE, v: A, P, ph } });
            b.board(p, -1, 0);
            if (prev) b.c.route[b.c.route.length - 1].from = prev.id;
            prev = p; cu = u + W / 2;
        }
        b.off(prev, cu + g + 3, 0, b.y);
        b.adv(cu + g);
    },
    // up on a lift; further on, up on one lift and straight onto the next as they pass
    elevator(b, d) {
        const n = d > 0.9 ? 2 : 1, rise = Math.min(26, lerp(14, 22, d)), W = Math.max(8, lerp(12, 9, d)), g = lerp(5, 7, Math.min(d, 1)), P = d > 1.1 ? 6 : 8;
        let cu = 0, prev = null;
        for (let i = 0; i < n; i++) {
            const u = cu + g + W / 2, p = b.part({ u, y: b.y + rise / 2, w: W, l: W, h: 2, look: 'lift', tone: i, mv: { k: MK.SLIDE, y: rise / 2 - 0.2, P, ph: i % 2 ? 0.75 : 0.25 } });
            b.deco({ kind: 'lift', u, v: 0, y: b.y - 6, h: rise + 14, w: W });
            b.board(p, -1, 0);
            if (prev) b.c.route[b.c.route.length - 1].from = prev.id;
            prev = p; cu = u + W / 2; b.y += rise;
        }
        b.off(prev, cu + g + 3, 0, b.y);
        b.adv(cu + g);
    },
    // tiles that come and go, by turns
    blink(b, d) {
        const n = 4 + Math.round(dn(d) * 2), W = Math.max(5.6, lerp(9, 7, d)), g = lerp(3.5, 5, Math.min(d, 1.4)), P = d > 1.1 ? 2.5 : d > 0.6 ? 3 : 4;
        let cu = 0, prevU = -1, prevW = 0;
        for (let i = 0; i < n; i++) {
            const u = cu + g + W / 2, p = b.part({ u, y: b.y, w: W, l: W, h: 1.2, look: 'blink', tone: i % 2, mv: { k: MK.BLINK, P, ph: i % 2 ? 0.5 : 0, duty: 0.68 } });
            b.blinkTo(p, i ? prevU + prevW / 2 - 1.2 : -1, 0, b.y, u, 0, b.y);
            prevU = u; prevW = W; cu = u + W / 2;
        }
        b.jump(cu - 1.2, 0, b.y, cu + 7 + 3, 0, b.y);
        b.adv(cu + 7);
    },
    // a bridge of old stones, dropping away one after another behind you: keep going
    crumble(b, d) {
        const n = 6 + Math.round(dn(d) * 3), W = Math.max(5.6, lerp(9, 6.5, d)), g = lerp(1.5, 3.5, Math.min(d, 1.3)), P = d > 1.1 ? 4 : 5, k = Math.max(1, lerp(1.4, 1, d)) / P;
        let cu = 0, prevU = -1, prevW = 0;
        for (let i = 0; i < n; i++) {
            const u = cu + g + W / 2, p = b.part({ u, y: b.y, w: W, l: W, h: 1.8, look: 'crumble', tone: i, mv: { k: MK.BLINK, P, ph: fract(-i * k), duty: 0.74 } });
            b.blinkTo(p, i ? prevU + prevW / 2 - 1.2 : -1, 0, b.y, u, 0, b.y, 0.9);
            prevU = u; prevW = W; cu = u + W / 2;
        }
        b.jump(cu - 1.2, 0, b.y, cu + 6 + 3, 0, b.y);
        b.adv(cu + 6);
    },
    // a conveyor running against you
    belt(b, d) {
        const l = Math.min(58, lerp(30, 52, d)), w = Math.max(6.5, lerp(12, 8, d)), sp = Math.min(13, lerp(5, 12, d));
        b.part({ u: l / 2, y: b.y, w, l, h: 2.2, look: 'belt', belt: [-sp, 0], tone: 0 });
        b.run(l, 0, b.y);
        b.adv(l);
    },
    // a narrow way of conveyors that throw you off the side, to one side and then the other
    sideBelt(b, d) {
        const n = 3 + Math.round(dn(d) * 2), S = 14, w = Math.max(7, lerp(12, 8, d)), sp = Math.min(11, lerp(5, 10, d));
        for (let i = 0; i < n; i++) {
            const sg = i % 2 ? 1 : -1;
            b.part({ u: S * (i + 0.5), y: b.y, w: S, l: w, h: 2.2, look: 'belt', rot: sg > 0 ? -Math.PI / 2 : Math.PI / 2, belt: [0, sg * sp], noRail: 1 });
            for (let q = 1; q <= 4; q++) b.run(S * (i + q / 4), -sg * 0.8, b.y);
        }
        b.adv(S * n);
    },
    // a broad disc with a bar going round: time it, or hop it. Further on, two bars
    sweep(b, d) {
        const rr = 18, two = d > 1, P = two ? (d > 1.25 ? 5 : 6) : d > 0.65 ? 5 : d > 0.3 ? 6 : 8, ch = 9, u = rr + 3, dir = b.R() < 0.5 ? 1 : -1;
        b.part({ u: 2, y: b.y, w: 22, l: 6, h: 2.4, look: 'deck', tone: 1 });
        b.part({ u, y: b.y, r: rr, h: 2.8, look: 'disc', tone: 2 });
        b.part({ u, y: b.y + 3.2, r: 2.4, h: 3.2, look: 'hub', tone: 0, noCam: true });
        b.part({ u, y: b.y + 3, w: 1.8, l: 2 * rr - 1, h: 2.2, look: 'bar', knock: 1, noCam: true, noFloor: true, mv: { k: MK.SPIN, P, dir } });
        if (two) b.part({ u, y: b.y + 3, rot: Math.PI / 2, w: 1.8, l: 2 * rr - 1, h: 2.2, look: 'bar', knock: 1, noCam: true, noFloor: true, mv: { k: MK.SPIN, P, dir } });
        b.part({ u: u + rr + 1, y: b.y, w: 22, l: 6, h: 2.4, look: 'deck', tone: 1 });
        b.run(1, ch, b.y);
        b.guarded(4, ch, u + rr - 1, ch, true);
        b.run(u + rr + 2, 0, b.y);
        b.adv(u + rr + 4);
    },
    // a walkway with hammers swinging across it
    hammers(b, d) {
        const n = 2 + Math.round(dn(d) * 2), gapU = 14, w = d > 1 ? Math.max(6, lerp(8, 6, (d - 1) / 0.4)) : 8, l = 8 + n * gapU, fast = d > 1.1;
        b.part({ u: l / 2, y: b.y, w, l, h: 2.4, look: 'deck', tone: 1 });
        for (let i = 0; i < n; i++) {
            const u = 8 + i * gapU, len = 12, py = b.y + 14;
            b.part({ u, y: py - len + 1.6, w: 3.4, l: 3.6, h: 3.4, look: 'hammer', knock: 1, noCam: true, noFloor: true, mv: { k: MK.SWING, amp: Math.min(1.1, lerp(0.8, 1, d)), P: i % 2 ? (fast ? 3 : 4) : (fast ? 2.4 : 3), ph: i * 0.37, py, len } });
            b.deco({ kind: 'gantry', u, v: 0, y: b.y, h: 15, w: w + 12 });
            b.guarded(u - 4.6, 0, u + 4.6, 0, false);
        }
        b.run(l, 0, b.y);
        b.adv(l);
    },
    // curtains of light, on and off: run through while they're off
    lasers(b, d) {
        const n = 3 + Math.round(dn(d) * 2), gapU = lerp(11, 9, clamp(d - 0.5, 0, 1)), w = 9, l = 7 + n * gapU, fast = d > 1.1;
        b.part({ u: l / 2, y: b.y, w, l, h: 2, look: 'deck', tone: 1 });
        for (let i = 0; i < n; i++) {
            const u = 7 + i * gapU;
            b.part({ u, y: b.y + 8, w: w + 1, l: 0.9, h: 8, look: 'laser', lethal: 1, noCam: true, noFloor: true, mv: { k: MK.BLINK, P: i % 2 ? (fast ? 2 : 3) : (fast ? 3 : 4), ph: i * 0.31, duty: Math.min(0.62, lerp(0.4, 0.55, d)) } });
            b.deco({ kind: 'laserPosts', u, v: 0, y: b.y, w: w + 1 });
            b.guarded(u - 3, 0, u + 3, 0, false);
        }
        b.run(l, 0, b.y);
        b.adv(l);
    },
    // a broad deck with rows of flame jets: most of each row burns on and off, the way past it swaps from side to side. Further on, every third row burns right across
    flames(b, d) {
        const n = 3 + Math.round(dn(d) * 2), gapU = lerp(13, 10.5, Math.min(d, 1)), w = 14, lane = Math.max(4.6, lerp(7, 4.8, d)), l = 8 + n * gapU, P = d > 1.1 ? 2.5 : d > 0.6 ? 3 : 4, duty = Math.min(0.78, lerp(0.5, 0.72, d));
        b.part({ u: l / 2, y: b.y, w, l, h: 2.4, look: 'deck', tone: 0 });
        for (let i = 0; i < n; i++) {
            const u = 6 + i * gapU, side = i % 2 ? 1 : -1, across = d > 0.8 && i % 3 === 2, fw = across ? w : w - lane, v = across ? 0 : -side * lane / 2, free = side * (w - lane) / 2;
            b.part({ u, v, y: b.y + 7, w: fw, l: 1.5, h: 7, look: 'flame', lethal: 1, noCam: true, noFloor: true, mv: { k: MK.BLINK, P, ph: i * 0.31, duty: across ? 0.5 : duty } });
            if (across) b.guarded(u - 3, 0, u + 3, 0, false);
            else { b.run(u - 3.4, free, b.y); b.run(u + 3.4, free, b.y); }
        }
        b.run(l, 0, b.y);
        b.adv(l);
    },
    // a floor of tiles, some of them deadly: the safe way is the bright one
    killTiles(b, d) {
        const cols = 5, rows = 6 + Math.round(dn(d) * 4), S = d > 1 ? 5.2 : 6, R = b.R;
        let at = 2;
        for (let j = 0; j < rows; j++) {
            const nx = clamp(at + (R() < 0.5 ? -1 : 1), 0, cols - 1), lo = Math.min(at, nx), hi = Math.max(at, nx);
            for (let i = 0; i < cols; i++) {
                const safe = i >= lo && i <= hi, u = (j + 0.5) * S, v = (i - 2) * S;
                if (!safe && (i + j) % 7 === 0) continue;
                b.part({ u, v, y: b.y, w: S - 0.15, l: S - 0.15, h: 1.6, look: safe ? 'tile' : 'kill', tone: j % 2, lethal: safe ? undefined : 1, small: 1 });
            }
            b.run(u0(j, S), (at - 2) * S, b.y);
            if (nx !== at) b.run(u0(j, S), (nx - 2) * S, b.y);
            at = nx;
        }
        b.run(rows * S + 1.5, (at - 2) * S, b.y);
        b.run(rows * S + 4, 0, b.y);
        b.part({ u: rows * S + 3, v: 0, y: b.y, w: cols * S, l: 6, h: 1.6, look: 'deck', tone: 1 });
        b.adv(rows * S + 6);
    },
    // up a ladder on a truss tower
    ladder(b, d) {
        const rise = Math.min(30, lerp(14, 26, d)), W = 7, y0 = b.y;
        b.part({ u: 6, y: y0, w: 14, l: 12, h: 2.4, look: 'deck', tone: 1 });
        b.part({ u: 12 + W / 2, y: y0 + rise, w: W, l: W, h: rise + 6, look: 'truss', tone: 0 });
        b.part({ u: 12 - 0.6, y: y0 + rise + 0.4, w: 5, l: 1.6, h: rise + 2.4, look: 'ladder', ladder: 1, noCam: true, noFloor: true });
        b.part({ u: 12 + W + 7, y: y0 + rise, w: Math.max(9, lerp(18, 10, d)), l: 14, h: 2.4, look: 'deck', tone: 0 });
        b.ladderUp(10.4, 0, y0 + rise, 12 + W + 2, 0);
        b.y = y0 + rise;
        b.adv(12 + W + 14);
    },
    // bouncy pads, each higher than the last
    bounce(b, d) {
        const n = 2 + Math.round(dn(d)), g = Math.min(10.5, lerp(6, 9, d)), dy = 7;
        let cu = 0, r0 = 0, y = b.y;
        for (let i = 0; i < n; i++) {
            const rr = Math.max(3.8, lerp(5, 4.2, d)), u = cu + r0 + g + rr;
            b.part({ u, y, r: rr, h: 2, look: 'bouncer', bounce: 60, tone: i });
            if (i === 0) b.jump(-1, 0, y, u, 0, y); else b.air(u, 0, y);
            cu = u; r0 = rr; y += dy;
        }
        const u = cu + r0 + g + 8;
        b.part({ u, y, w: 18, l: 16, h: 2.4, look: 'deck', tone: 1 });
        b.air(u, 0, y);
        b.y = y;
        b.adv(u + 8);
    },
    // a long slide down, with a leap off the lip
    slide(b, d) {
        const drop = Math.min(28, lerp(12, 22, d)), l = drop * 3.4, w = Math.max(8, lerp(11, 9, d)), y0 = b.y;
        b.part({ u: l / 2, y: y0, y1: y0 - drop, w, l, h: 2.4, look: 'slide', ice: 1 });
        b.part({ u: l + 4, y: y0 - drop + 0.8, w, l: 8, h: 2.4, look: 'deck', tone: 1, boost: 16 });
        b.run(l + 6, 0, y0 - drop + 0.8);
        b.y = y0 - drop + 0.8;
        b.adv(l + 8);
        hop(b, Math.min(13, lerp(9, 12, d)), 0);
    },
    // a long tunnel of hoops, with hurdles
    tunnel(b, d) {
        const n = 2 + Math.round(dn(d) * 2), gapU = 15, l = 10 + n * gapU, W = 14, H = 15, y = b.y;
        b.part({ u: l / 2, y, w: W, l, h: 2, look: 'tunnelFloor' });
        b.part({ u: l / 2, v: -W / 2 - 0.5, y: y + H, w: 1, l, h: H, look: 'tunnelWall' });
        b.part({ u: l / 2, v: W / 2 + 0.5, y: y + H, w: 1, l, h: H, look: 'tunnelWall' });
        b.part({ u: l / 2, y: y + H + 1, w: W + 2, l, h: 1, look: 'tunnelRoof' });
        for (let i = 0; i <= Math.floor(l / 5); i++) b.deco({ kind: 'hoop', u: i * 5, v: 0, y, w: W + 2, h: H + 1, i });
        for (let i = 0; i < n; i++) {
            const u = 10 + i * gapU, hh = Math.min(5.2, 3.2 + d * 1.4);
            b.part({ u, y: y + hh, w: W, l: 2.4, h: hh, look: 'hurdle', tone: i });
            b.run(u - 6, 0, y);
            b.jump(u - 3.6, 0, y, u + 4.8, 0, y);
        }
        b.run(l, 0, y);
        b.adv(l);
    },
    // great stone rollers trundling up and down a walkway: hop them as they come, or be thrown off
    rollers(b, d) {
        const n = 1 + Math.round(dn(d) * 2), S = lerp(30, 26, Math.min(d, 1)), w = Math.max(8, lerp(11, 9, d)), l = 6 + n * S, A = S / 2 - 4, P = d > 1.1 ? 3 : d > 0.6 ? 4 : 5, hh = 3.2;
        b.part({ u: l / 2, y: b.y, w, l, h: 2.4, look: 'deck', tone: 1 });
        for (let i = 0; i < n; i++) {
            const u = 6 + (i + 0.5) * S;
            b.part({ u, y: b.y + hh, w: w - 0.6, l: 3.4, h: hh, look: 'roller', tone: i, knock: 1, noCam: true, noFloor: true, mv: { k: MK.SLIDE, u: A, P, ph: i * 0.37 } });
            b.guarded(u - S / 2, 0, u + S / 2, 0, true);
        }
        b.run(l, 0, b.y);
        b.adv(l);
    },
    // two doors, or three, or four: one's real. Behind the others, a drop that sends you back
    doors(b, d) {
        const n = d > 1.05 ? 4 : d > 0.55 ? 3 : 2, W = 7, wall = 4, tot = n * W + (n + 1) * wall, depth = 12, R = b.R, y = b.y, good = Math.floor(R() * n);
        b.part({ u: 7, y, w: tot + 2, l: 14, h: 2.4, look: 'deck', tone: 1 });
        for (let i = 0; i <= n; i++) {
            const v = -tot / 2 + wall / 2 + i * (W + wall);
            b.part({ u: 15, v, y: y + 14, w: wall, l: 2, h: 14, look: 'doorWall', tone: i });
        }
        b.part({ u: 15, y: y + 18, w: tot, l: 2, h: 4, look: 'doorWall', tone: 2 });
        for (let i = 0; i < n; i++) {
            const v = -tot / 2 + wall + W / 2 + i * (W + wall);
            b.deco({ kind: 'door', u: 15, v, y, w: W, good: i === good });
            if (i === good) continue;
            b.part({ u: 16 + depth / 2, v, y: y + 0.4, w: W + 2, l: depth, h: 3, look: 'trap', lethal: 1, noCam: true });
        }
        const gv = -tot / 2 + wall + W / 2 + good * (W + wall);
        b.part({ u: 16 + depth / 2, v: gv, y, w: W + 1, l: depth, h: 2, look: 'deck', tone: 0 });
        b.part({ u: 16 + depth + 3, v: gv / 2, y, w: Math.abs(gv) + 10, l: 6, h: 2, look: 'deck', tone: 1 });
        b.run(12, gv, y);
        b.run(16 + depth + 1, gv, y);
        b.run(16 + depth + 4, 0, y);
        b.adv(16 + depth + 6);
    },
    // spinning discs
    spinners(b, d) {
        const n = 2 + Math.round(dn(d) * 2), rr = Math.max(5.8, lerp(9, 7, d)), g = Math.min(8, lerp(5.5, 7.5, d)), P = d > 1.1 ? 5 : d > 0.5 ? 6 : 8;
        let cu = 0, r0 = 0;
        for (let i = 0; i < n; i++) {
            const u = cu + r0 + g + rr;
            b.part({ u, y: b.y, r: rr, h: 2.2, look: 'spinner', tone: i, mv: { k: MK.SPIN, P, dir: i % 2 ? 1 : -1 } });
            b.jump(i ? cu + 1.5 : -1, 0, b.y, u, 0, b.y);
            cu = u; r0 = rr;
        }
        b.jump(cu + 1.5, 0, b.y, cu + r0 + g + 3, 0, b.y);
        b.adv(cu + r0 + g);
    },
    // a slippery run
    ice(b, d) {
        const l = Math.min(72, lerp(36, 60, d)), w = Math.max(5.6, lerp(11, 7, d)), n = 2 + Math.round(dn(d) * 2);
        b.part({ u: l / 2, y: b.y, w, l, h: 2.4, look: 'iceDeck', ice: 1 });
        for (let i = 0; i < n; i++) b.deco({ kind: 'crystal', u: (i + 0.5) * l / n, v: (i % 2 ? 1 : -1) * (w / 2 + 3), y: b.y - 1, s: 3 + (i % 3) });
        b.run(l + 0.5, 0, b.y);
        b.adv(l);
    },
    // thin pillars going up like stairs
    pillars(b, d) {
        const n = 4 + Math.round(dn(d) * 2), S = Math.max(3.8, lerp(6.5, 4.6, d)), g = Math.min(9.4, lerp(5, 8, d)), dy = Math.min(4.6, lerp(2.5, 4, d)), R = b.R;
        let cu = 0, cv = 0, y = b.y, h0 = 0;
        for (let i = 0; i < n; i++) {
            const nv = clamp(cv + (R() - 0.5) * 8, -7, 7), u = cu + h0 + g + S / 2, ny = y + dy;
            b.part({ u, v: nv, y: ny, w: S, l: S, h: 26, look: 'pillar', tone: i });
            b.jump(cu + (i ? h0 - 1.2 : -1), cv, y, u, nv, ny);
            cu = u; cv = nv; y = ny; h0 = S / 2;
        }
        b.jump(cu + h0 - 1, cv, y, cu + h0 + g + 3, 0, y);
        b.y = y;
        b.adv(cu + h0 + g);
    },
    // pistons pumping up and down by turns: jump from one to the next as they pass
    pistons(b, d) {
        const n = 3 + Math.round(dn(d) * 2), S = Math.max(5.4, lerp(8.5, 6.5, d)), g = lerp(4.5, 6.5, Math.min(d, 1.2)), A = Math.min(7.5, lerp(3, 6.5, d)), P = d > 1.1 ? 4 : d > 0.6 ? 5 : 6;
        let cu = 0, prev = null;
        for (let i = 0; i < n; i++) {
            const u = cu + g + S / 2, p = b.part({ u, y: b.y, w: S, l: S, h: 5, look: 'piston', tone: i, mv: { k: MK.SLIDE, y: A, P, ph: i % 2 ? 0.5 : 0 } });
            b.board(p, -1, 0);
            if (prev) b.c.route[b.c.route.length - 1].from = prev.id;
            prev = p; cu = u + S / 2;
        }
        b.off(prev, cu + g + 3, 0, b.y);
        b.adv(cu + g);
    },
    // platforms in orbit round a little planet: board one as it comes by, ride it round, leap off at the far side. Further on, two rings and fewer platforms
    orbiters(b, d) {
        const rings = d > 0.85 ? 2 : 1, Ro = lerp(13, 16, Math.min(d, 1)), r = Math.max(4.4, lerp(6.5, 4.8, d)), count = d > 0.9 ? 3 : 4, P = d > 1.1 ? 8 : d > 0.6 ? 10 : 12, g = 4.5;
        for (let q = 0; q < rings; q++) {
            const u = g + r + Ro, dir = q % 2 ? 1 : -1;
            let first = null;
            for (let j = 0; j < count; j++) {
                const p = b.part({ u, r, y: b.y, h: 2, look: 'orbiter', tone: j, mv: { k: MK.SLIDE, u: Ro, cv: Ro * dir, P, ph: j / count } });
                first = first || p;
            }
            b.deco({ kind: 'orbitCore', u, v: 0, y: b.y - 1, s: Ro * 0.42 });
            b.board(first, -1, 0);
            b.off(first, u + Ro + r + g + 3, 0, b.y);
            b.adv(u + Ro + r + g);
            if (q < rings - 1) { b.part({ u: 5, y: b.y, w: 14, l: 10, h: 2.4, look: 'deck', tone: 1 }); b.run(7, 0, b.y); b.adv(10); }
        }
    },
    // little rocks drifting about in space: from one to the next, wherever they've got to
    drift(b, d) {
        const R = b.R, n = 4 + Math.round(dn(d) * 2), r = Math.max(3.6, lerp(5.5, 3.8, d)), g = lerp(5, 7.6, Math.min(d, 1.2)), A = lerp(2, 5, Math.min(d, 1.2)), PS = d > 1.1 ? [5, 6, 4] : d > 0.6 ? [6, 8, 5] : [8, 10, 6];
        let cu = 0, cv = 0, r0 = 0, prev = null;
        for (let i = 0; i < n; i++) {
            const nv = i === n - 1 ? clamp(cv * 0.4, -4, 4) : clamp(cv + (R() - 0.5) * 7, -6, 6), u = cu + r0 + g + r;
            const p = b.part({ u, v: nv, r, y: b.y, h: 2.4, look: 'asteroid', tone: i, mv: { k: MK.SLIDE, v: A * (i % 2 ? 1 : -1), y: 1.2, P: PS[i % PS.length], ph: R() } });
            b.board(p, -1, 0);
            if (prev) b.c.route[b.c.route.length - 1].from = prev.id;
            prev = p; cu = u; cv = nv; r0 = r;
        }
        b.off(prev, cu + r0 + g + 3, clamp(cv, -5, 5), b.y);
        b.adv(cu + r0 + g);
    },
    // walls sliding across the walkway: they push you off
    pushers(b, d) {
        const n = 2 + Math.round(dn(d) * 2), gapU = 14, w = 11, l = 8 + n * gapU, fast = d > 1.1;
        b.part({ u: l / 2, y: b.y, w, l, h: 2.4, look: 'deck', tone: 1 });
        for (let i = 0; i < n; i++) {
            const u = 8 + i * gapU, P = i % 2 ? (fast ? 3 : 4) : (fast ? 4 : 5);
            b.part({ u, v: 0, y: b.y + 7, w: 8, l: 4.5, h: 7, look: 'pusher', tone: i, noCam: true, noFloor: true, mv: { k: MK.SLIDE, v: 11, P, ph: i * 0.29 } });
            b.guarded(u - 5, 0, u + 5, 0, false);
        }
        b.run(l, 0, b.y);
        b.adv(l);
    },
};
const u0 = (j, S) => (j + 0.5) * S;

// which obstacles each world likes, in the order you meet them; the long run goes through its world's list as it is, a Storm Rush map takes as many as it needs.
// Several together make a gauntlet, a world's last stage: one after another with nowhere to save between them
const LISTS = {
    bay: ['stairs', 'steps', 'zig', 'bounce', 'sliders', 'belt', 'steps', 'spinners', 'doors', 'blink', 'zig', 'sliders', 'bounce', 'spiral', ['steps', 'sliders']],
    candy: ['donut', 'stairs', 'zig', 'slide', 'blink', 'donut', 'sliders', 'tunnel', 'pillars', 'bounce', 'crumble', 'spinners', 'donut', 'spiral', ['donut', 'blink', 'zig']],
    ruins: ['crumble', 'stairs', 'rollers', 'pillars', 'steps', 'ladder', 'crumble', 'tunnel', 'rollers', 'doors', 'sliders', 'pistons', 'crumble', 'spiral', ['rollers', 'crumble', 'pillars']],
    neon: ['lasers', 'blink', 'killTiles', 'sliders', 'tunnel', 'zig', 'lasers', 'pushers', 'pillars', 'doors', 'crumble', 'killTiles', 'lasers', 'blink', ['lasers', 'sliders', 'killTiles']],
    gear: ['hammers', 'ladder', 'spinners', 'pushers', 'sideBelt', 'elevator', 'sweep', 'belt', 'hammers', 'pillars', 'pistons', 'sideBelt', 'ladder', 'sweep', ['hammers', 'sideBelt', 'pushers']],
    frost: ['ice', 'steps', 'slide', 'sliders', 'sweep', 'pillars', 'ice', 'bounce', 'elevator', 'sideBelt', 'blink', 'crumble', 'ice', 'spiral', ['ice', 'sweep', 'pillars']],
    magma: ['pistons', 'flames', 'steps', 'rollers', 'flames', 'crumble', 'hammers', 'pistons', 'slide', 'killTiles', 'flames', 'pillars', 'sideBelt', 'pistons', ['flames', 'pistons', 'hammers']],
    orbit: ['orbiters', 'drift', 'lasers', 'bounce', 'orbiters', 'blink', 'drift', 'pushers', 'elevator', 'orbiters', 'pillars', 'drift', 'sweep', 'orbiters', ['drift', 'orbiters', 'lasers']],
    crown: ['stairs', 'hammers', 'lasers', 'killTiles', 'flames', 'sweep', 'orbiters', 'ladder', 'pushers', 'blink', 'rollers', 'pistons', 'drift', 'pillars', ['hammers', 'lasers', 'orbiters', 'pillars']],
};
// a stage's obstacle, or a gauntlet of them (each drawn as a piece of its own)
function buildStage(b, kind, d, nextChunk) {
    if (!Array.isArray(kind)) { OB[kind](b, d); return; }
    kind.forEach((k, j) => {
        if (j) { b.part({ u: 5, y: b.y, w: 14, l: 10, h: 2.4, look: 'deck', tone: 1 }); b.run(7, 0, b.y); b.adv(10); b.chunk = nextChunk(); }
        OB[k](b, d);
    });
}

// a course's scenery along the way: big things to look at, none of them in the way
function dressStage(b, kind, i, R) {
    const side = i % 2 ? 1 : -1, W = WORLDS[b.world].id;
    const near = { bay: ['ring', 'ball', 'duck'], candy: ['lolly', 'gumdrop', 'cane'], neon: ['screen', 'neonRing', 'cabinet'], gear: ['gear', 'gear', 'chimney'], frost: ['crystal', 'iceberg', 'crystal'], crown: ['flame', 'crownSpire', 'ring'], ruins: ['totem', 'jungleTree', 'ruinArch'], magma: ['volcano', 'lavaRock', 'chimney'], orbit: ['planet', 'satellite', 'rockDrift'] }[W];
    const k0 = near[Math.floor(R() * near.length)], k1 = near[Math.floor(R() * near.length)];
    b.deco({ kind: k0, u: 8 + R() * 30, v: side * (32 + R() * 22), y: b.y - 14 - R() * 16, s: 9 + R() * 8, far: 1, spin: R() < 0.5 });
    if (R() < 0.7) b.deco({ kind: k1, u: 8 + R() * 20, v: -side * (42 + R() * 30), y: b.y - 28 - R() * 20, s: 12 + R() * 10, far: 1, spin: R() < 0.5 });
    if (i % 3 === 0) b.deco({ kind: 'puff', u: R() * 30, v: side * (26 + R() * 40), y: b.y - 16 - R() * 16, s: 10 + R() * 10 });
    void kind;
}

// ----- the long run -----
function buildMain() {
    const c = new Course('main', 0);
    c.main = true;
    c.hubR = HUB_R;
    const b = new Builder(c, 20240, 0), R = rngFrom(4404);
    // the home island: one great disc to stand on; everything on it is drawn by hub.js
    b.x = 0; b.z = 0; b.y = 0;
    b.part({ x: 0, u: 0, v: 0, y: 0, r: HUB_R, h: 40, look: 'hub_ground', noCam: true });
    // what stands on it, to bump into (hub.js draws them); the bouncy castle bounces
    for (const sg of [-1, 1]) b.part({ u: HUB.gate.z, v: sg * 19, y: 26, r: 6, h: 26, look: 'solid' });
    for (const [px, pz] of [[HUB.gear.x, HUB.gear.z], [HUB.eggs.x, HUB.eggs.z], [HUB.trails.x, HUB.trails.z]]) b.part({ u: pz, v: px, y: 8, r: 6, h: 8, look: 'solid' });
    b.part({ u: 62, v: -104, y: 3.4, r: 15, h: 3.4, look: 'solid', bounce: 56 });
    c.start = { x: HUB.spawn.x, y: 0, z: HUB.spawn.z, ry: 0, fx: 0, fz: 1, rx: 1, rz: 0 };
    b.x = 0; b.z = HUB_R - 2; b.y = 0;
    c.route.push({ k: 'r', x: 0, z: 40, y: 0 }, { k: 'r', x: 0, z: HUB_R - 2, y: 0 });
    // the Start Gate's causeway down to the first stage
    b.part({ u: 8, y: 0, w: 18, l: 18, h: 3, look: 'deck', tone: 1 });
    b.run(16, 0, 0);
    b.adv(17);
    b.y = 0;
    // the turns: three stages on, three across, three on, three back: a long zigzag that never meets itself
    const TURNS = [0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, 1];
    let ck = 0;
    const nextChunk = () => ++ck;
    for (let i = 0; i < STAGES; i++) {
        const w = worldOfStage(i), list = LISTS[WORLDS[w].id];
        b.world = w; b.chunk = nextChunk();
        const turn = TURNS[i % TURNS.length], kind = list[i % list.length];
        if (i && i % STAGES_PER_WORLD === 0) { // a world's gate
            b.deco({ kind: 'worldGate', u: 2, v: 0, y: b.y, w: 26, world: w });
            c.signs.push({ text: WORLDS[w].name, world: w, x: b.wx(2, 0), y: b.y + 21, z: b.wz(2, 0), size: 20 });
        }
        b.pad(i, turn);
        dressStage(b, kind, i, R);
        buildStage(b, kind, stageD(i), nextChunk);
        // up a bit between stages, a platform's height, so the course climbs into the sky as you go
        b.y += 1.5;
    }
    // the end: the Breakout Balloon's island
    b.chunk = nextChunk(); b.world = WORLDS.length - 1;
    b.part({ u: 24, y: b.y, r: 24, h: 8, look: 'summit' });
    const fx = b.wx(24, 0), fz = b.wz(24, 0), last = c.cps[c.cps.length - 1];
    b.run(24, 0, b.y);
    c.finish = { x: fx, y: b.y, z: fz, r: 8, s: last.s + Math.hypot(fx - last.x, b.y - last.y, fz - last.z) };
    b.deco({ kind: 'balloon', u: 24, v: 0, y: b.y, s: 1 });
    c.chunks = ck + 1;
    c.index();
    return c;
}

// ----- a Storm Rush map: a world's obstacles, as long and as hard as the tier -----
function buildRace(world, tier) {
    const T = RUSH_TIERS[tier], c = new Course('r' + world + '.' + tier, world), b = new Builder(c, 7301 + world * 97 + tier * 13, world), R = rngFrom(9100 + world * 31 + tier);
    // the start deck, wide enough for eight
    b.x = 0; b.z = 0; b.y = 40; b.chunk = 0;
    b.part({ u: 0, y: 40, w: 30, l: 26, h: 4, look: 'startDeck' });
    b.deco({ kind: 'worldGate', u: 13, v: 0, y: 40, w: 26, world });
    c.start = { x: 0, y: 40, z: 0, ry: 0, fx: 0, fz: 1, rx: 1, rz: 0 };
    c.route.push({ k: 'r', x: 0, z: 13, y: 40 });
    c.barrierZ = 13;
    b.adv(13);
    const list = LISTS[WORLDS[world].id], TURNS = [0, 1, 0, -1, 0, -1, 0, 1];
    let ck = 0;
    const nextChunk = () => ++ck;
    for (let i = 0; i < T.stages; i++) {
        b.chunk = nextChunk();
        const turn = TURNS[i % TURNS.length], kind = list[(i + tier) % list.length];
        b.pad(i, turn);
        dressStage(b, kind, i, R);
        buildStage(b, kind, T.d + i / T.stages * 0.12, nextChunk);
        b.y += 1;
    }
    b.chunk = nextChunk();
    b.part({ u: 18, y: b.y, r: 18, h: 6, look: 'summit' });
    const fx = b.wx(18, 0), fz = b.wz(18, 0), last = c.cps[c.cps.length - 1];
    b.run(18, 0, b.y);
    c.finish = { x: fx, y: b.y, z: fz, r: 9, s: last.s + Math.hypot(fx - last.x, b.y - last.y, fz - last.z) };
    b.deco({ kind: 'finishArch', u: 18, v: 0, y: b.y });
    c.chunks = ck + 1;
    c.index();
    return c;
}

// the courses are built once on each side, on the first asking
const cache = new Map();
export function mainCourse() { let c = cache.get('main'); if (!c) { c = buildMain(); cache.set('main', c); } return c; }
export function raceCourse(world, tier) {
    const k = world + '.' + tier;
    let c = cache.get(k);
    if (!c) { c = buildRace(world, tier); cache.set(k, c); }
    return c;
}
// a server's own copy for a live match: the same parts, its own clock
export function freshRace(world, tier) { return buildRace(world, tier); }
