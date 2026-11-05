// The pilot: runs the course on the same physics as everyone else, from the route the course was built with. The server's bots use it
// (a skill: slower, dithering, slipping up now and then), and so does the game's QA autopilot and the headless test that proves every
// stage can be beaten. It looks ahead on the shared clock to time what moves.
import { CFG, jumpV } from './config.js';
import { MK, TAU } from './course.js';

export function newPilot(skill) {
    return { i: 0, skill: skill || { speed: 1, dither: 0, slip: 0 }, plan: null, pauseT: 0, stuckT: 0, jumpCool: 0, jit: 0, jitI: -1, done: false, bestI: -1, wait: 0 };
}
export function resetPilot(pl, i) { pl.i = i || 0; pl.plan = null; pl.pauseT = 0.1 + Math.random() * 0.4; pl.stuckT = 0; pl.done = false; pl.jitI = -1; pl.bestI = -1; pl.wait = 0; pl.dash = null; }

const inp = { mx: 0, mz: 0, jump: false, hold: true, speed: 1, respawn: false, power: CFG.power };
const fut = { x: 0, y: 0, z: 0 };
function steer(b, x, z, slow) {
    const dx = x - b.x, dz = z - b.z, l = Math.hypot(dx, dz);
    if (l < 1e-3) { inp.mx = 0; inp.mz = 0; return 0; }
    const k = slow ? Math.min(1, l / slow) : 1;
    inp.mx = dx / l * k; inp.mz = dz / l * k;
    return l;
}
// how long a jump's in the air, landing dy above where it left
function airTime(dy, g) {
    const v = jumpV(CFG.power), G = CFG.grav * (g || 1), q = v * v - 2 * G * Math.max(0, dy);
    return (v + Math.sqrt(Math.max(0, q))) / G;
}
// is the straight way from here to there free of everything that moves and hurts, for as long as it takes to cross it?
function clear(c, x0, z0, y, x1, z1, speed, t0) {
    const d = Math.hypot(x1 - x0, z1 - z0), T = d / speed;
    if (T <= 0) return true;
    const l = c.near(x0, z0), l2 = c.near((x0 + x1) / 2, (z0 + z1) / 2), l3 = c.near(x1, z1), seen = hazards;
    seen.length = 0;
    for (const L of [l, l2, l3]) if (L) for (let i = 0; i < L.length; i++) { const p = L[i]; if ((p.lethal || p.knock || (p.mv && p.noFloor)) && p.mv && seen.indexOf(p) < 0) seen.push(p); }
    if (!seen.length) return true;
    const step = 0.08, n = Math.ceil((T + 0.35) / step);
    for (let q = 0; q <= n; q++) {
        const t = t0 + q * step, f = Math.min(1, (q * step) / T), x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
        for (let i = 0; i < seen.length; i++) if (hitsAt(seen[i], x, y, z, t)) return false;
    }
    return true;
}
const hazards = [];
function hitsAt(p, x, y, z, t) {
    const m = p.mv;
    let px = p.x0, pz = p.z0, top = p.top0, ca = p.ca, sa = p.sa, hx = p.hx + 1.9, hz = p.hz + 1.9;
    if (m.k === MK.BLINK) { const f = t / m.P + m.ph; if (f - Math.floor(f) >= m.duty) return false; }
    else if (m.k === MK.SLIDE) { const a = TAU * (t / m.P + m.ph), s = Math.sin(a), co = Math.cos(a); px += m.ax * s + m.bx * co; pz += m.az * s + m.bz * co; top += m.ay * s; }
    else if (m.k === MK.SPIN) { const a = p.ry0 + TAU * (t / m.P + m.ph) * m.dir; ca = Math.cos(a); sa = Math.sin(a); }
    else { const a = m.amp * Math.sin(TAU * (t / m.P + m.ph)), s = Math.sin(a), co = Math.cos(a); px = m.px + m.dx * s * m.len; pz = m.pz + m.dz * s * m.len; top = m.py - co * m.len + p.h / 2; }
    if (y >= top + 0.2 || y + 5 <= top - p.h) return false;
    const dx = x - px, dz = z - pz, lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
    return Math.abs(lx) < hx && Math.abs(lz) < hz;
}

// One step's input. Sets inp.respawn when it wants to go back to its checkpoint.
export function pilotStep(pl, b, c, time, dt, power) {
    inp.jump = false; inp.hold = true; inp.mx = 0; inp.mz = 0; inp.respawn = false; inp.power = power || CFG.power;
    const sk = pl.skill, route = c.route, speed = CFG.walk * sk.speed;
    inp.speed = sk.speed;
    pl.jumpCool -= dt;
    if (pl.i >= route.length) { pl.done = true; return inp; }
    const n = route[pl.i];
    // no headway for too long: back to the checkpoint
    if (pl.i > pl.bestI) { pl.bestI = pl.i; pl.stuckT = 0; } else if (!pl.waiting) pl.stuckT += dt;
    if (pl.stuckT > 14) { pl.stuckT = 0; inp.respawn = true; return inp; }
    if (pl.stuckT > 6 && b.onGround && pl.jumpCool <= 0) { inp.jump = true; pl.jumpCool = 0.8; }
    pl.waiting = false;
    // a jump on its way: steer for where it lands
    if (pl.plan) {
        const P = pl.plan;
        P.age += dt;
        let tx = P.tx, tz = P.tz;
        if (P.part !== undefined) { const p = c.parts[P.part]; c.pose(p); tx = p.x; tz = p.z; }
        steer(b, tx, tz, 3);
        if (P.slip) { inp.mx *= 0.75; inp.mz *= 0.75; }
        // down (a bounce pad throws you straight back up: that's down too)
        if ((b.onGround || b.vy > 50) && P.age > 0.12) { pl.plan = null; pl.i++; }
        else if (P.age > 5) { pl.plan = null; pl.i++; }
        return inp;
    }
    // dithering: now and then a slow bot stops for a moment
    if (sk.dither && pl.pauseT <= 0 && Math.random() < sk.dither * dt) pl.pauseT = 0.2 + Math.random() * 0.5;
    if (pl.pauseT > 0) { pl.pauseT -= dt; return inp; }
    const slipNow = () => { if (pl.jitI !== pl.i) { pl.jitI = pl.i; pl.jit = sk.slip && Math.random() < sk.slip ? 1 : 0; } return pl.jit; };
    switch (n.k) {
        case 'r': {
            const d = steer(b, n.x, n.z);
            if (d < 1.9 && Math.abs(b.y - n.y) < 8) pl.i++;
            else if (b.onGround && b.y < n.y - 1.5 && d < 7 && pl.jumpCool <= 0) { inp.jump = true; pl.jumpCool = 0.3; }
            break;
        }
        case 'j': {
            const d = steer(b, n.x, n.z);
            if ((d < 1.3 || (d < 3.5 && Math.hypot(n.tx - b.x, n.tz - b.z) < Math.hypot(n.tx - n.x, n.tz - n.z))) && b.onGround && pl.jumpCool <= 0) {
                inp.jump = true; steer(b, n.tx, n.tz); pl.plan = { tx: n.tx, tz: n.tz, age: 0, slip: slipNow() }; pl.jumpCool = 0.2;
            }
            break;
        }
        case 'g': {
            // to the line, then across when the way is clear
            const d = steer(b, n.x, n.z, 1.5);
            // (a low bar: no need to wait, just hop it as it comes)
            if (n.hop && d < 1.8) { pl.i++; pl.dash = { x: n.tx, z: n.tz, hop: true }; break; }
            if (d < 1.4 && b.onGround) {
                if (clear(c, n.x, n.z, b.y, n.tx, n.tz, speed * 0.92, time)) { pl.i++; pl.dash = { x: n.tx, z: n.tz }; }
                else { inp.mx = 0; inp.mz = 0; pl.waiting = true; }
            }
            break;
        }
        case 'b': {
            // a tile that comes and goes: leave when it'll be there all through the landing, and for a moment after
            const p = c.parts[n.p], d = steer(b, n.x, n.z, 1.5), T = airTime(n.ty - b.y) + 0.12, t = time + T, ok = c.onAt(p, t - 0.4) && c.onAt(p, t - 0.2) && c.onAt(p, t) && c.onAt(p, t + n.stay);
            if (d < 1.4 && b.onGround) {
                if (ok && pl.jumpCool <= 0) { inp.jump = true; steer(b, n.tx, n.tz); pl.plan = { tx: n.tx, tz: n.tz, age: 0, slip: slipNow() }; pl.jumpCool = 0.2; }
                else { inp.mx = 0; inp.mz = 0; pl.waiting = true; }
            }
            break;
        }
        case 'm': {
            // onto something that moves: wait until it's coming within reach. From another mover: ride that until then
            let px = n.x, pz = n.z;
            const p = c.parts[n.p], T = airTime(0) * 0.92;
            c.futureOf(p, time + T, fut);
            if (n.from !== undefined) {
                // to the edge of the one you're on nearest the next
                const f = c.parts[n.from];
                c.pose(f);
                const lx = fut.x - f.x, lz = fut.z - f.z, ll = Math.hypot(lx, lz) || 1, e = (f.r || f.hx) * 0.55;
                px = f.x + lx / ll * e; pz = f.z + lz / ll * e;
            }
            const d = steer(b, px, pz, 1.5);
            // (reaching its near edge will do)
            const gap = Math.hypot(fut.x - b.x, fut.z - b.z) - (p.r || p.hx) * 0.75, reach = speed * T * 0.86, up = fut.y - b.y;
            if (d < 1.6 && b.onGround) {
                if (gap <= reach && up <= 6 && up >= -14 && pl.jumpCool <= 0) { inp.jump = true; steer(b, fut.x, fut.z); pl.plan = { part: n.p, tx: fut.x, tz: fut.z, age: 0, slip: slipNow() }; pl.jumpCool = 0.2; }
                else { if (n.from === undefined) { inp.mx = 0; inp.mz = 0; } pl.waiting = true; }
            }
            break;
        }
        case 'x': {
            // ride it (stand in the middle) until what's next is within reach
            const p = c.parts[n.p];
            c.pose(p);
            steer(b, p.x, p.z, 2);
            pl.waiting = true;
            const T = airTime(Math.max(0, n.ty - b.y)), gap = Math.hypot(n.tx - b.x, n.tz - b.z) - 2.6, up = n.ty - b.y, reach = speed * T * 0.82;
            if (b.onGround && b.ground === p && gap <= reach && up <= 6.5 && pl.jumpCool <= 0) { inp.jump = true; steer(b, n.tx, n.tz); pl.plan = { tx: n.tx, tz: n.tz, age: 0 }; pl.jumpCool = 0.2; }
            break;
        }
        case 'l': {
            // up a ladder, and off at the top
            if (b.y >= n.top - 0.2 || (b.y >= n.top - 0.6 && !b.climb)) { steer(b, n.tx, n.tz); if (Math.hypot(n.tx - b.x, n.tz - b.z) < 2.4) pl.i++; } else steer(b, n.x + (n.tx - n.x) * 0.2, n.z + (n.tz - n.z) * 0.2);
            break;
        }
        case 'a': {
            // already in the air (a bounce): steer for where it lands
            steer(b, n.tx, n.tz, 3);
            if ((b.onGround || b.vy > 50) && Math.abs(b.y - n.ty) < 3 && Math.hypot(n.tx - b.x, n.tz - b.z) < 7) pl.i++;
            else if (Math.hypot(n.tx - b.x, n.tz - b.z) < 2 && b.y < n.ty - 8) pl.stuckT += 4 * dt;
            break;
        }
        default: pl.i++;
    }
    // across the guarded stretch: flat out
    if (pl.dash) {
        const D = pl.dash, d = steer(b, D.x, D.z);
        if (D.hop && b.onGround && pl.jumpCool <= 0 && !clear(c, b.x, b.z, b.y, b.x + inp.mx * speed * 0.2, b.z + inp.mz * speed * 0.2, speed, time)) { inp.jump = true; pl.jumpCool = 0.5; }
        if (d < 1.6) pl.dash = null;
    }
    return inp;
}
