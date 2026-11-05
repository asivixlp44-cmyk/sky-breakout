// Your own movement runs on your device; the server checks every move against what's possible: how far you could have run
// (a budget earned by time, spent by moving), how high you could have got from the last ground you stood on (a bounce pad or a
// ladder near you allows for more), and whether there's anything under you when you say you're standing. Impossible moves are
// refused and you're put back.
import { CFG, jumpH, walkOf, powerOf, hasDouble, hasMoon } from '../../shared/config.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// with Feather Fall you may have it on: the most it lets you do is what's allowed
export const gravityOf = (p) => (hasMoon(p) ? CFG.moonK : 1);
export function initGuard(s, x, y, z, now) {
    s.last = { x, y, z }; s.lastAt = now; s.moveB = 6; s.win = { t: now, d: 0 }; s.airBase = y; s.strikes = 0; s.homeAt = now; s.springAt = 0;
}
// just sent somewhere: the moves still on their way from where you were are dropped until you've arrived there
export function sendTo(s, x, y, z, now) { s.last = { x, y, z }; s.lastAt = now; s.airBase = y; s.homeAt = now; s.moveB = 6; s.strikes = 0; s.win = { t: now, d: 0 }; s.springAt = 0; }

// returns null when the move is fine, else why not. c: the course; g: gravity x
export function checkMove(s, c, m, now, g) {
    if (!finite(m.x) || !finite(m.y) || !finite(m.z)) return 'bad';
    const L = s.last, p = s.profile, dt = Math.max(0, (now - s.lastAt) / 1000), dist = Math.hypot(m.x - L.x, m.z - L.z);
    s.lastAt = now;
    // run speed, with a little give
    const walk = walkOf(p), top = walk * 1.75 + 8;
    s.moveB = Math.min((s.moveB ?? top) + dt * top, top * 1.5 + 8);
    if (dist > s.moveB) return 'far';
    s.moveB -= dist;
    // over a few seconds it has to average out at a run
    s.win.d += dist;
    if (now - s.win.t > 5000) {
        const avg = s.win.d / ((now - s.win.t) / 1000);
        s.win.t = now; s.win.d = 0;
        if (avg > walk * 1.42 + 6) return 'speed';
    }
    if (m.y < c.seaY - 70) return 'deep';
    // what's near you that lifts you: a bounce pad, a ladder
    const list = c.near(m.x, m.z);
    if (list) for (let i = 0; i < list.length; i++) {
        const q = list[i];
        if (q.bounce && Math.hypot(m.x - q.x, m.z - q.z) < q.r + 8) s.springAt = now;
        else if (q.ladder && Math.hypot(m.x - q.x, m.z - q.z) < 12 && m.y <= q.top + 1 && m.y >= q.top - q.h - 1) s.airBase = Math.max(s.airBase, m.y);
    }
    // how high: from the last ground you stood on, a jump (or two), a springy pad's throw
    const grounded = m.a === 0 || m.a === 1;
    const reach = jumpH(powerOf(p)) / (g || 1) * (hasDouble(p) ? 1.75 : 1) + 3.5 + (now - s.springAt < 3000 ? 20 : 0);
    if (m.y - s.airBase > reach) return 'high';
    const gb = c.groundBelow(m.x, m.y + 0.5, m.z, 1.5, true);
    // right over some ground: that's your new base (hop from block to block and you may not be seen on the ground at all)
    if (gb > -Infinity && m.y - gb <= 3 && gb - s.airBase <= reach) s.airBase = gb;
    if (grounded) {
        // standing on nothing?
        if (m.y - gb > 3.2 || gb === -Infinity) { if (++s.strikes >= 6) { s.strikes = 0; return 'air'; } } else s.strikes = 0;
    }
    return null;
}
