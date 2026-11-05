// Every course can be beaten: the pilot runs the long run and every Storm Rush map at every tier on the shared physics, headless, at full speed and at the slowest bot's speed.
// On a Storm Rush map the full-speed pilot also has to stay ahead of the storm all the way: a race has to be winnable, not just finishable.
import { mainCourse, raceCourse, courseClock } from '../shared/course.js';
import { newBody, stepBody, EV } from '../shared/physics.js';
import { newPilot, pilotStep, resetPilot } from '../shared/pilot.js';
import { CFG, WORLDS, RUSH_TIERS, stormS } from '../shared/config.js';

const SPEEDS = (process.argv[2] || '1,0.84').split(',').map(Number);
const DT = 1 / 60;
function run(c, speed, verbose, k) {
    const sp = c.main ? c.respawnOf(-1) : c.startSpot(1), b = newBody(sp.x, sp.y, sp.z), pl = newPilot({ speed, dither: 0, slip: 0 });
    resetPilot(pl, 0); pl.pauseT = 0;
    let t = 7, cp = -1, deaths = 0, simT = 0, stuck = 0, caught = -1;
    // (START=i: from checkpoint i, to look into one stage)
    if (process.env.START && c.main) { cp = +process.env.START; const s = c.respawnOf(cp); b.x = s.x; b.y = s.y; b.z = s.z; b.fromY = s.y; resetPilot(pl, c.routeOf(cp)); pl.pauseT = 0; }
    const perCp = {}, MAX = 60 * 60 * (c.main ? 120 : 15);
    for (let f = 0; f < MAX; f++) {
        t += DT; simT += DT;
        c.setTime(courseClock(t * 1000), DT);
        const P = pilotStep(pl, b, c, t % 120, DT);
        const ev = stepBody(b, { mx: P.mx, mz: P.mz, jump: P.jump, hold: P.hold, power: CFG.power, speed: P.speed }, DT, c);
        const pad = c.padAt(b.x, b.y, b.z, cp + 1, 2);
        if (pad > cp) { cp = pad; }
        if (k && caught < 0 && c.sAt(cp, b.x, b.y, b.z) < stormS(simT, k)) caught = cp;
        if (c.atFinish(b.x, b.y, b.z) && cp >= c.cps.length - 1) return { ok: true, secs: simT, deaths, stuck, perCp, caught };
        if (ev === EV.LETHAL || P.respawn) {
            if (P.respawn) stuck++; else deaths++;
            perCp[cp] = (perCp[cp] || 0) + 1;
            if (verbose) console.log('   back at', cp, ev === EV.LETHAL ? 'died' : 'stuck', 'at', b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1), 'route', pl.i, c.route[pl.i] && c.route[pl.i].k);
            if (perCp[cp] > 25) return { ok: false, secs: simT, deaths, stuck, perCp, caught, at: cp, why: 'stage ' + (cp + 2) + ' can\'t be beaten (route ' + pl.i + ' ' + (c.route[pl.i] && c.route[pl.i].k) + ')' };
            const s = c.respawnOf(cp);
            b.x = s.x; b.y = s.y; b.z = s.z; b.vx = b.vy = b.vz = 0; b.ex = b.ez = 0; b.onGround = false; b.ground = null; b.fromY = s.y; b.safeT = 0.5;
            resetPilot(pl, c.routeOf(cp));
        }
        if (pl.done) return { ok: false, secs: simT, deaths, stuck, perCp, caught, why: 'route ended at cp ' + cp + ' at ' + [b.x, b.y, b.z].map((v) => v.toFixed(1)) };
    }
    return { ok: false, secs: simT, deaths, stuck, perCp, caught, why: 'timed out at cp ' + cp + ' route ' + pl.i + ' ' + (c.route[pl.i] && c.route[pl.i].k) };
}
let fails = 0;
const report = (name, c, sp, k) => {
    const r = run(c, sp, !!process.env.VERBOSE, k);
    const stormed = k && sp >= 1 && r.caught >= 0;
    if (!r.ok || stormed) fails++;
    const worst = Object.entries(r.perCp).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([q, v]) => '#' + (+q + 2) + '×' + v).join(' ');
    console.log((r.ok && !stormed ? 'ok  ' : 'FAIL') + ' ' + name + ' x' + sp + ': ' + (r.secs / 60).toFixed(1) + ' min, ' + r.deaths + ' falls, ' + r.stuck + ' stuck, ' + c.cps.length + ' stages, ' + c.parts.length + ' parts, ' + c.total.toFixed(0) + ' studs' + (worst ? ', worst ' + worst : '') + (r.caught >= 0 ? ', the storm caught it at stage ' + (r.caught + 2) : '') + (r.why ? ' -- ' + r.why : ''));
    return r;
};
const only = process.argv[3] || '';
for (const sp of SPEEDS) {
    if (!only || only === 'main') report('long run', mainCourse(), sp);
    if (only !== 'main') for (let w = 0; w < WORLDS.length; w++) for (let t = 0; t < RUSH_TIERS.length; t++) report(WORLDS[w].id + ' tier ' + t, raceCourse(w, t), sp, RUSH_TIERS[t].k * (WORLDS[w].storm || 1));
}
if (!only || only === 'main') { const c = mainCourse(); console.log('the long run: ' + c.movers.length + ' movers, top at y ' + c.finish.y.toFixed(0) + ', ends at x ' + c.finish.x.toFixed(0) + ' z ' + c.finish.z.toFixed(0) + ', ' + c.chunks + ' pieces'); }
console.log(fails ? fails + ' FAILED' : 'every course beaten');
process.exit(fails ? 1 : 0);
