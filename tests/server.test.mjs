// The whole loop and its guards, headless: starts its own server (QA=1, a temporary data folder) and plays it over the network as real
// clients do (the shared physics and pilot sending real moves): the stages, the Coins, a skip, the balloon, a Storm Rush. Run: node tests/server.test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { CFG, UPGRADES, upgradeCost, EGGS, TRAILS, trailById, CODES, QUESTS, GIFTS, xpNeed, stageCoins, breakoutReward, RUSH_TIERS, rushTier, STAGES, stormS } from '../shared/config.js';
import { mainCourse, raceCourse, HUB, courseClock } from '../shared/course.js';
import { newBody, stepBody, EV } from '../shared/physics.js';
import { newPilot, pilotStep, resetPilot } from '../shared/pilot.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 2997, URL_ = 'http://localhost:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, what) { if (cond) { pass++; console.log('  ok  ' + what); } else { fail++; console.log('FAIL  ' + what); } }

class Tester {
    constructor(name) { this.name = name; this.msgs = {}; this.p = {}; this.x = 0; this.z = HUB.spawn.z; this.y = 0; this.snaps = 0; }
    async join(extra) {
        const c = new Client(URL_);
        this.room = await c.joinOrCreate('obby', { uid: 'test_' + this.name, name: this.name, ...(extra || {}) });
        const R = this.room;
        for (const t of ['hello', 'pong', 'toast', 'broke', 'code', 'boards', 'reward', 'levelup', 'warped', 'bought', 'hatched', 'taskdone', 'questdone', 'toastreward', 'authed', 'emote', 'chat', 'queued', 'match', 'home', 'stage', 'world', 'runstart', 'skipped', 'balloon', 'breakout', 'finished', 'results', 'out', 'caught', 'rushcp', 'snaps']) R.onMessage(t, (m) => { (this.msgs[t] || (this.msgs[t] = [])).push(m); if (t === 'snaps' && this.msgs.snaps.length > 3) this.msgs.snaps.shift(); });
        R.onMessage('profile', (m) => { Object.assign(this.p, m); });
        R.onMessage('lite', (m) => { Object.assign(this.p, m); });
        R.onMessage('snap', (m) => { this.snaps++; this.x = m.x; this.y = m.y; this.z = m.z; });
        R.onMessage('home', (m) => { this.x = m.x; this.y = m.y; this.z = m.z; });
        await this.wait(() => this.p.now);
        const h = this.last('hello');
        this.x = h.x; this.y = h.y; this.z = h.z;
        return this;
    }
    send(t, m) { this.room.send(t, m || {}); }
    async wait(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms ?? 5000)) { const v = fn(); if (v) return v; await sleep(15); } return null; }
    got(t) { return (this.msgs[t] || []).length; }
    last(t) { const l = this.msgs[t]; return l && l[l.length - 1]; }
    clear(t) { this.msgs[t] = []; }
    move(x, y, z, a, ts) { this.x = x; this.y = y; this.z = z; this.send('move', { x, y, z, ry: 0, a: a ?? 1, ts: ts ?? Date.now() }); }
    async tp(x, y, z) { this.send('qa', { tp: [x, y, z] }); this.x = x; this.z = z; this.y = y; await sleep(60); this.move(x, y, z, 2); await sleep(60); this.snaps = 0; }
    me() { return this.room.state.players.get(this.room.sessionId); }
    leave() { return this.room.leave(); }
}
// runs like a real client: the shared physics and pilot, real moves at 15 a second, until told to stop
async function runner(T, c, from, opts) {
    opts = opts || {};
    const b = newBody(from.x, from.y, from.z), P = newPilot({ speed: 1, dither: 0, slip: 0 });
    resetPilot(P, opts.route ?? 0);
    P.pauseT = 0;
    const end = Date.now() + (opts.secs || 60) * 1000;
    let lastSent = 0, last = Date.now(), cp = opts.cp ?? -1;
    while (Date.now() < end) {
        await sleep(16);
        const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000), t = courseClock(now);
        last = now;
        c.setTime(t, dt);
        if (opts.stopAt && opts.stopAt(b, cp)) break;
        const hold = opts.startAt && now < opts.startAt, inp = hold ? { mx: 0, mz: 0, jump: false, hold: true } : pilotStep(P, b, c, t, dt);
        const ev = stepBody(b, { mx: inp.mx, mz: inp.mz, jump: inp.jump, hold: inp.hold, power: CFG.power, speed: inp.speed || 1 }, dt, c);
        if (b.onGround) { const pad = c.padAt(b.x, b.y, b.z, cp + 1, 2); if (pad > cp) cp = pad; }
        if (ev === EV.LETHAL || inp.respawn) { T.send('respawn', {}); const r = c.respawnOf(cp); b.x = r.x; b.y = r.y; b.z = r.z; b.vx = b.vy = b.vz = 0; b.ex = b.ez = 0; b.onGround = false; b.ground = null; b.fromY = r.y; resetPilot(P, c.routeOf(cp)); P.pauseT = 0; await sleep(120); }
        if (now - lastSent >= 66) { lastSent = now; T.move(+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), b.climb ? 4 : !b.onGround ? 2 : 1, now); }
    }
    // (the last move, where it stopped, gets there too)
    T.move(+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), b.onGround ? 1 : 2);
    return { b, cp };
}

const srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), QA: '1', DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => process.stderr.write(d));
for (let i = 0; i < 120; i++) { try { const r = await fetch(URL_ + '/health'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(100); }
const main = mainCourse();

try {
    console.log('A new player');
    const A = await new Tester('Ann').join();
    ok(A.p.coins === 0 && A.p.gems === 0 && A.p.stars === 0, 'starts with nothing');
    ok(A.p.stage === 0 && A.p.lv === 1, 'on no stage yet, at Level 1');
    ok(Math.hypot(A.x - HUB.spawn.x, A.z - HUB.spawn.z) < 8, 'lands on the home island');
    await A.wait(() => A.got('boards'));
    ok(A.got('boards') >= 1, 'gets the leaderboards');
    A.send('ping', { c: 42 });
    const pg = await A.wait(() => A.last('pong'));
    ok(pg && pg.c === 42 && pg.s > 0, 'ping comes back with the server\'s clock');
    await A.wait(() => A.got('snaps'));
    const sn = A.last('snaps');
    ok(sn && sn.t > 0 && sn.l.length >= 7, 'snapshots stamped with server time');
    let bots = 0;
    A.room.state.players.forEach((p) => { if (p.bot) bots++; });
    ok(bots === CFG.hubBots - 1, 'a few bots on the course when it\'s quiet, one fewer per player');

    console.log('The guards');
    await A.tp(HUB.spawn.x, 0, HUB.spawn.z);
    A.move(HUB.spawn.x + 400, 0, HUB.spawn.z, 1);
    await A.wait(() => A.snaps > 0, 1500);
    ok(A.snaps > 0, 'too far in one move: put back');
    await A.tp(0, 0, 0);
    await sleep(350);
    A.move(0, 60, 0, 2);
    await A.wait(() => A.snaps > 0, 1500);
    ok(A.snaps > 0, 'too high from the ground: put back');
    await A.tp(0, 0, 0);
    // running far too fast for five seconds, in moves each small enough to pass on its own
    {
        let x = -60, snapped = false;
        await A.tp(x, 0, 0);
        const t0 = Date.now();
        while (Date.now() - t0 < 5600 && !snapped) { x += 5.2; if (x > 60) x = -60 + (x - 60); A.move(x, 0, 0, 1); await sleep(66); if (A.snaps > 0) snapped = true; }
        ok(snapped, 'a speed hack: put back');
    }
    // standing on nothing, out over the sea
    {
        const g = main.cps[0];
        await A.tp(g.x + 60, g.y + 1, g.z);
        A.snaps = 0;
        let i = 0;
        while (i++ < 12 && !A.snaps) { A.move(g.x + 60, g.y + 1, g.z, 0); await sleep(70); }
        ok(A.snaps > 0, 'standing on nothing: put back');
    }

    console.log('The stages, by really running them');
    await A.tp(0, 0.2, HUB.gate.z - 20);
    A.clear('stage');
    const coins0 = A.p.coins;
    const R1 = await runner(A, main, { x: 0, y: 0.2, z: HUB.gate.z - 20 }, { route: 1, secs: 50, stopAt: (b, cp) => cp >= 2 });
    ok(R1.cp >= 2, 'the shared physics reaches Stage 3 on its own');
    await A.wait(() => A.got('stage') >= 3, 2000);
    ok(A.got('stage') >= 3 && A.msgs.stage[0].i === 0, 'each checkpoint is announced, from Stage 1');
    ok(A.got('runstart') === 1, 'the run\'s clock starts at Stage 1');
    await A.wait(() => A.p.coins > coins0, 1000);
    ok(A.p.coins >= coins0 + stageCoins(0, 0) + stageCoins(1, 0), 'stages pay Coins');
    ok(A.p.stage >= 3 && A.p.bestStage >= 3, 'your stage and best stage are saved');
    // not twice
    {
        const n = A.got('stage'), c = A.p.coins, g = main.cps[0];
        await A.tp(g.x, g.y + 0.1, g.z);
        A.move(g.x, g.y, g.z, 0);
        await sleep(200);
        ok(A.got('stage') === n && A.p.coins === c, 'a checkpoint you\'ve passed pays nothing again');
    }
    // a pad a long way ahead: nobody gets there from here
    {
        const n = A.got('stage'), g = main.cps[20];
        await A.tp(g.x, g.y + 0.1, g.z);
        A.move(g.x, g.y, g.z, 0);
        await sleep(200);
        ok(A.got('stage') === n && A.p.stage < 10, 'a checkpoint far ahead doesn\'t count');
    }
    // standing near a pad but not on it
    {
        const i = A.p.stage, g = main.cps[i], n = A.got('stage');
        await A.tp(g.x + g.hw + 8, g.y + 0.2, g.z);
        A.move(g.x + g.hw + 8, g.y + 0.2, g.z, 2);
        await sleep(150);
        ok(A.got('stage') === n, 'near a checkpoint isn\'t on it');
    }
    // the deadly tiles, stood on: not really there
    {
        const k = main.parts.find((p) => p.look === 'kill');
        await A.tp(k.x, k.top, k.z);
        A.snaps = 0;
        let i = 0;
        while (i++ < 12 && !A.snaps) { A.move(k.x, k.top, k.z, 0); await sleep(70); }
        ok(A.snaps > 0, 'standing on a deadly tile: put back');
    }

    console.log('Skipping, warping');
    A.send('qa', { gems: 20 });
    await A.wait(() => A.p.gems >= 20);
    {
        const g0 = A.p.gems, s0 = A.p.stage;
        A.clear('skipped');
        A.send('skip');
        await A.wait(() => A.got('skipped'));
        ok(A.got('skipped') === 1 && A.last('skipped').i === s0, 'a skip takes you to the next stage');
        await A.wait(() => A.p.gems === g0 - CFG.skipGems);
        ok(A.p.gems === g0 - CFG.skipGems && A.p.stage === s0 + 1, 'and costs Gems');
    }
    {
        const B = await new Tester('Bea').join();
        B.send('skip');
        await B.wait(() => B.got('broke'));
        ok(B.got('broke') === 1 && B.p.stage === 0, 'no Gems, no skip');
        await B.leave();
    }
    A.clear('warped');
    await sleep(550);
    A.send('warp', { to: 'home' });
    await A.wait(() => A.got('warped'));
    ok(A.last('warped') && Math.hypot(A.last('warped').x - HUB.spawn.x, A.last('warped').z - HUB.spawn.z) < 8, 'home goes to the island');
    await sleep(550);
    A.send('warp', { to: 'last' });
    await A.wait(() => A.got('warped') >= 2);
    ok(A.got('warped') >= 2 && Math.hypot(A.last('warped').x - main.cps[A.p.stage - 1].x, A.last('warped').z - main.cps[A.p.stage - 1].z) < 2, 'last goes back to your stage');

    console.log('The balloon');
    A.send('claim');
    await sleep(150);
    ok(A.got('breakout') === 0, 'no claiming it from anywhere else');
    {
        const last = main.cps[main.cps.length - 1], f = main.finish;
        A.send('qa', { stage: STAGES, coins: 0 });
        await sleep(80);
        await A.tp(last.x, last.y + 0.1, last.z);
        const R = await runner(A, main, { x: last.x, y: last.y + 0.1, z: last.z }, { route: main.routeOf(last.i), cp: last.i, secs: 40, stopAt: (b) => main.atFinish(b.x, b.y, b.z) && b.onGround });
        for (let i = 0; i < 3; i++) { A.move(+R.b.x.toFixed(2), +R.b.y.toFixed(2), +R.b.z.toFixed(2), 0); await sleep(70); }
        await A.wait(() => A.got('balloon'), 2000);
        ok(A.last('balloon') && A.last('balloon').on, 'at the balloon: it\'s offered');
        const c0 = A.p.coins, st0 = A.p.stars, g0 = A.p.gems, R0 = breakoutReward(A.p.laps);
        A.send('claim');
        await A.wait(() => A.got('breakout'));
        const bo = A.last('breakout');
        ok(bo && bo.laps === 1, 'a Breakout!');
        await A.wait(() => A.p.laps === 1);
        ok(A.p.stars === st0 + 1 && A.p.gems === g0 + R0.gems && A.p.coins === c0 + R0.coins, 'pays Coins, Gems and a Star');
        ok(A.p.stage === 0 && A.p.laps === 1, 'and you start again from Stage 1');
        ok(stageCoins(5, 1) > stageCoins(5, 0), 'for bigger pay');
        A.send('claim');
        await sleep(150);
        ok(A.got('breakout') === 1, 'only once');
        A.x = bo.x; A.y = 0.2; A.z = bo.z;
    }

    console.log('Spending');
    A.send('qa', { coins: 20000, stars: 10 });
    await A.wait(() => A.p.coins >= 20000);
    {
        const u = UPGRADES[0], c0 = A.p.coins;
        A.send('upgrade', { id: u.id });
        await A.wait(() => A.p.ups && A.p.ups[u.id] === 1);
        ok(A.p.ups[u.id] === 1 && A.p.coins === c0 - upgradeCost(u, 0), 'gear costs Coins');
        const dbl = UPGRADES.find((x) => x.id === 'double');
        A.send('upgrade', { id: dbl.id });
        await A.wait(() => A.p.ups.double === 1);
        A.clear('bought');
        A.send('upgrade', { id: dbl.id });
        await sleep(120);
        ok(A.got('bought') === 0, 'one-off gear only once');
        const t = TRAILS.find((x) => x.coins > 0);
        A.send('trail', { id: t.id });
        await A.wait(() => A.p.trail === t.id);
        ok(A.p.trail === t.id && A.p.trails[t.id], 'a trail for Coins');
        const ts = TRAILS.find((x) => x.stars), s0 = A.p.stars;
        A.send('trail', { id: ts.id });
        await A.wait(() => A.p.trail === ts.id);
        ok(A.p.trail === ts.id && A.p.stars === s0 - trailById[ts.id].stars, 'a trail for Stars');
        A.send('hatch', { c: EGGS[0].id, n: 3 });
        await A.wait(() => A.got('hatched'));
        ok(A.last('hatched').out.length === 3 && A.p.team.length > 0, 'eggs hatch, buddies join your team');
        const lock = EGGS[EGGS.length - 1];
        A.clear('hatched');
        A.send('hatch', { c: lock.id });
        await sleep(120);
        ok(A.got('hatched') === 0, 'an egg above your level stays shut');
    }

    console.log('Rewards, once each');
    {
        const code = Object.keys(CODES)[0], c0 = A.p.coins;
        A.send('code', { code });
        await A.wait(() => A.got('code'));
        ok(A.last('code').ok, 'a code works');
        A.clear('code');
        A.send('code', { code });
        await A.wait(() => A.got('code'));
        ok(!A.last('code').ok, 'not twice');
        A.clear('code');
        A.send('code', { code: 'NOPE' });
        await A.wait(() => A.got('code'));
        ok(!A.last('code').ok, 'a wrong code doesn\'t');
        void c0;
        A.clear('reward');
        A.send('daily');
        await A.wait(() => A.got('reward'));
        ok(A.got('reward') === 1, 'the daily reward');
        A.send('daily');
        await sleep(120);
        ok(A.got('reward') === 1, 'once a day');
        A.clear('reward');
        A.send('gift', { i: 0 });
        await sleep(120);
        ok(A.got('reward') === 0, 'a gift isn\'t early');
        A.send('qa', { playSecs: GIFTS[0].min * 60 });
        await sleep(80);
        A.send('gift', { i: 0 });
        await A.wait(() => A.got('reward'));
        ok(A.got('reward') === 1, 'a gift on time');
        A.send('gift', { i: 0 });
        await sleep(120);
        ok(A.got('reward') === 1, 'once');
    }
    console.log('Quests and tasks');
    {
        A.send('qa', { tasks: 1 });
        await sleep(100);
        const list = A.p.jq.list;
        ok(list.length === 3, 'three daily tasks');
        A.clear('reward');
        A.send('tclaim', { i: 0 });
        await A.wait(() => A.got('reward'));
        ok(A.got('reward') === 1, 'a finished task pays');
        A.send('tclaim', { i: 0 });
        await sleep(100);
        ok(A.got('reward') === 1, 'once');
        const qi = A.p.qi;
        A.send('qclaim');
        await sleep(120);
        ok(A.p.qi === qi + 1 || QUESTS[qi].n > 0, 'a done quest moves on');
    }

    console.log('The queue and a Storm Rush');
    const C = await new Tester('Cal').join();
    const D = await new Tester('Dee').join();
    A.clear('match'); C.clear('match'); D.clear('match');
    C.send('queue', { on: true });
    await C.wait(() => C.got('queued'));
    await sleep(120);
    ok(C.room.state.queueN >= 1, 'the queue shows who\'s been found');
    D.send('queue', { on: true });
    await D.wait(() => D.room.state.queueN >= 2, 2000);
    ok(D.room.state.queueN === 2, 'and counts up');
    await D.wait(() => D.got('match') && C.got('match'), 12000);
    const mc = C.last('match'), md = D.last('match');
    ok(mc && md && mc.id === md.id, 'everyone at about the same time goes into the same race');
    const mcN = () => { let n = 0; C.room.state.players.forEach((p) => { if (p.ctx === mc.id) n++; }); return n; };
    await sleep(100);
    ok(mcN() === CFG.racers, 'bots fill only the empty places');
    let realIn = 0;
    C.room.state.players.forEach((p) => { if (p.ctx === mc.id && !p.bot) realIn++; });
    ok(realIn === 2, 'the real ones are really in it');
    // someone pressing PLAY while it's still getting ready takes a bot's place
    A.send('queue', { on: true });
    await A.wait(() => A.got('match'), 3000);
    ok(A.last('match') && A.last('match').id === mc.id, 'a late player joins a race that hasn\'t really started');
    await sleep(100);
    ok(mcN() === CFG.racers, 'in a bot\'s place');
    const rc = raceCourse(mc.world, mc.tier);
    ok(mc.tier === rushTier(1) && rc.cps.length === RUSH_TIERS[mc.tier].stages, 'the course is as long as a new player\'s level says');
    ok(raceCourse(0, 5).cps.length > raceCourse(0, 0).cps.length, 'and longer and harder further up');
    // over the line before GO
    {
        const sp = rc.startSpot(mc.spot);
        C.x = sp.x; C.y = sp.y; C.z = sp.z;
        await sleep(60);
        C.snaps = 0;
        // walking it, a step at a time
        for (let z = sp.z + 5; z < sp.z + 40 && !C.snaps && Date.now() < mc.t0 - 300; z += 5) { C.move(sp.x, sp.y, z, 1); await sleep(160); }
        ok(C.snaps > 0, 'over the line before GO: put back');
    }
    // the player who leaves is taken over by a bot, under their name
    D.leave();
    await sleep(250);
    {
        let found = null;
        C.room.state.players.forEach((p) => { if (p.name === 'Dee') found = p; });
        ok(found && found.bot && found.ctx === mc.id, 'a bot carries on for a player who leaves');
    }
    await A.wait(() => Date.now() > mc.t0 + 200, 9000);
    // Cal runs it for real; Ann stands still until the storm comes
    const sp = rc.startSpot(mc.spot);
    const tA = A.last('match');
    { const a = rc.startSpot(tA.spot); A.x = a.x; A.y = a.y; A.z = a.z; }
    const standing = (async () => { const t0 = Date.now(); while (Date.now() - t0 < 150000 && !A.got('out') && !A.got('results')) { A.move(A.x, A.y, A.z, 0); await sleep(250); } })();
    const R2 = await runner(C, rc, sp, { route: 0, secs: 130, stopAt: () => C.got('finished') || C.got('out') || C.got('results') });
    ok(C.got('finished') >= 1, 'running it for real gets you to the finish');
    ok(R2.cp >= rc.cps.length - 1, 'through every stage');
    await A.wait(() => A.got('out'), 80000);
    ok(A.got('out') >= 1, 'whoever stands still, the storm gets');
    ok(stormS(30, 1) > stormS(10, 1) && stormS(60, 1.2) > stormS(60, 1), 'it comes faster and faster, faster for the bigger levels');
    await C.wait(() => C.got('results'), 60000);
    await standing;
    const res = C.last('results');
    ok(res && res.me.coins > 0 && res.rows.length === CFG.racers, 'results for everyone, and Coins');
    ok(res && res.me.finished, 'you\'re marked as finished');
    const resA = await A.wait(() => A.last('results'), 3000);
    ok(resA && res.me.coins > resA.me.coins, 'running it pays more than standing still');
    ok(C.p.races === 1, 'it counts as a race');
    C.clear('home');
    C.send('leave');
    await C.wait(() => C.got('home') && C.me().ctx === '', 4000);
    ok(C.got('home') === 1 && C.me().ctx === '', 'back from the race to where you were');
    await A.leave();
    await C.leave();

    console.log('The save');
    await sleep(600);
    const A2 = await new Tester('Ann').join();
    ok(A2.p.laps === 1 && A2.p.stars >= 1 && A2.p.ups[UPGRADES[0].id] === 1, 'coming back: Breakouts, Stars and gear are all still there');
    const B2 = await new Tester('Eve').join();
    B2.send('qa', { stage: 12 });
    await sleep(600);
    await B2.leave();
    await sleep(300);
    const B3 = await new Tester('Eve').join();
    const h = B3.last('hello');
    ok(B3.p.stage === 12 && Math.hypot(h.x - main.cps[11].x, h.z - main.cps[11].z) < 2, 'and you land on your last checkpoint');
    await B3.leave();
    await A2.leave();
    void xpNeed;
} catch (e) {
    fail++;
    console.log('FAIL  threw: ' + (e && e.stack || e));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
srv.kill();
process.exit(fail ? 1 : 0);
