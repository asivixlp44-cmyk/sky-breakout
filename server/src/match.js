// One Storm Rush on this server: up to 8 racers on one course, the storm rolling up behind them, faster and faster. First to the finish
// wins; whoever the storm catches is out. The phases: get ready (players can still take a bot's place), the race, results. Humans run on
// their own screens and send where they are; the server checks it, runs the bots, decides who the storm has caught and pays out. A player
// who leaves is taken over by a bot where they stood. The course comes from the lowest level here: longer and harder as you level.
import { PlayerState } from './schema.js';
import { CFG, WORLDS, BOT_NAMES, BOT_SKILL, RUSH_TIERS, rushTier, stormS, rushCoins, rushXp, rushGems, coinMult, TRAILS, PETS, clamp } from '../../shared/config.js';
import { raceCourse, courseClock } from '../../shared/course.js';
import { newBody, stepBody, EV } from '../../shared/physics.js';
import { newPilot, pilotStep, resetPilot } from '../../shared/pilot.js';
import { checkMove, initGuard, sendTo, gravityOf } from './guard.js';

export const PH = { READY: 0, RACE: 1, RESULTS: 2 };
const rnd = (a, b) => a + Math.random() * (b - a);
export const botAvatar = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
const botSkill = (sk) => ({ speed: rnd(sk.speed[0], sk.speed[1]), dither: sk.dither, slip: sk.slip });

// who stands where on the line: the middle lanes first (players, then bots), the front row before the back
const SEATS = [1, 2, 5, 6, 0, 3, 4, 7];

export class Match {
    constructor(room, id, humans, world) {
        this.room = room; this.id = id;
        this.world = world;
        // harder as the lowest level here goes up
        this.tier = rushTier(Math.min(...humans.map((s) => s.profile.lv)));
        this.k = RUSH_TIERS[this.tier].k * (WORLDS[world].storm || 1);
        this.stages = RUSH_TIERS[this.tier].stages;
        this.c = raceCourse(world, this.tier);
        const now = Date.now();
        this.t0 = now + CFG.getReadySecs * 1000;
        this.phase = PH.READY;
        this.racers = new Map();
        this.size = Math.max(CFG.racers, humans.length);
        this.posT = 0; this.ended = false; this.resultsAt = 0; this.botN = 0; this.outN = 0; this.endAt = 0; this.finN = 0;
        humans.forEach((s, i) => this.addHuman(s, SEATS[i], now));
        const used = new Set(humans.map((s) => s.profile.name));
        for (let i = humans.length; i < this.size; i++) this.addBot(SEATS[i], used, now);
    }
    get time() { return (Date.now() - this.t0) / 1000; }
    info(s) { return { id: this.id, t0: this.t0, size: this.size, k: this.k, world: this.world, tier: this.tier, spot: s ? this.racerOf(s).spot : 0 }; }

    // ----- racers -----
    newRacer(key, pl, spot, bot) {
        const r = { key, pl, spot, bot, s: null, cp: -1, sNow: 0, best: 0, finished: false, out: false, outAt: 0, place: 0, time: 0, falls: 0, finN: 0, body: null, pilot: null, dead: 0, ry: 0, a: 0 };
        this.racers.set(key, r);
        return r;
    }
    addHuman(s, spot, now) {
        const r = this.newRacer(s.id, s.player, spot, false);
        r.s = s; s.match = this;
        const sp = this.c.startSpot(spot);
        s.player.ctx = this.id; s.player.prog = 0; s.player.place = spot + 1; s.player.st = 0;
        initGuard(s, sp.x, sp.y, sp.z, now);
        s.spot = sp;
        return r;
    }
    addBot(spot, used) {
        let name;
        for (let k = 0; k < 20 && (!name || used.has(name)); k++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + (k > 12 ? k : '');
        used.add(name);
        const key = this.id + 'b' + (++this.botN), pl = new PlayerState(), sp = this.c.startSpot(spot);
        Object.assign(pl, { name, bot: true, pid: this.room.freePid(), ctx: this.id, lv: Math.floor(rnd(1, 24)), wins: Math.floor(rnd(0, 12)), place: spot + 1, coins: Math.floor(rnd(60, 3000)) });
        if (Math.random() < 0.45) pl.trail = TRAILS[1 + Math.floor(Math.random() * (TRAILS.length - 1))].id;
        if (Math.random() < 0.5) pl.team = PETS[Math.floor(Math.random() * PETS.length)].id;
        pl.av = botAvatar();
        this.room.state.players.set(key, pl);
        const r = this.newRacer(key, pl, spot, true);
        r.body = newBody(sp.x, sp.y, sp.z);
        r.pilot = newPilot(botSkill(BOT_SKILL[Math.floor(Math.random() * BOT_SKILL.length)]));
        r.ry = sp.ry;
        // the start: not everyone's quick off the line
        r.startDelay = rnd(0.05, 0.5);
        return r;
    }
    racerOf(s) { return this.racers.get(s.id); }
    // a bot's place a late player can take
    canJoin(now) {
        if (this.phase > PH.RACE || now > this.t0 + CFG.joinLateSecs * 1000) return 0;
        let n = 0;
        for (const r of this.racers.values()) if (r.bot && !r.tookOver) n++;
        return n;
    }
    joinLate(s, now) {
        // the bot in the best lane gives up its place (and its spot on the line)
        let pick = null;
        for (const r of this.racers.values()) if (r.bot && !r.tookOver && (!pick || SEATS.indexOf(r.spot) < SEATS.indexOf(pick.spot))) pick = r;
        if (!pick) return false;
        this.room.state.players.delete(pick.key);
        this.racers.delete(pick.key);
        this.addHuman(s, pick.spot, now);
        return true;
    }
    humans() { const a = []; for (const r of this.racers.values()) if (!r.bot) a.push(r); return a; }
    // a player's gone: a bot carries on from where they were, under their name
    humanLeft(s) {
        const r = this.racers.get(s.id);
        if (!r) return;
        this.racers.delete(s.id);
        if (this.phase === PH.RESULTS || this.ended) return;
        const key = this.id + 'b' + (++this.botN), pl = new PlayerState();
        Object.assign(pl, { name: r.pl.name, bot: true, pid: this.room.freePid(), ctx: this.id, lv: r.pl.lv, wins: r.pl.wins, trail: r.pl.trail, team: r.pl.team, av: r.pl.av, prog: r.pl.prog, place: r.pl.place, st: r.pl.st, coins: r.pl.coins });
        this.room.state.players.set(key, pl);
        const L = s.last, nr = this.newRacer(key, pl, r.spot, true);
        Object.assign(nr, { cp: r.cp, sNow: r.sNow, best: r.best, finished: r.finished, out: r.out, outAt: r.outAt, place: r.place, time: r.time, finN: r.finN, tookOver: true, startDelay: 0 });
        nr.body = newBody(L.x, L.y, L.z);
        nr.body.onGround = false;
        nr.pilot = newPilot(botSkill(BOT_SKILL[1]));
        // on from the last checkpoint's route
        resetPilot(nr.pilot, this.c.routeOf(r.cp));
    }

    // ----- a human's move -----
    move(s, m, now) {
        const r = this.racers.get(s.id), c = this.c;
        if (!r) return;
        const L = s.last;
        if (s.homeAt) { if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 8) return; s.homeAt = 0; }
        const why = checkMove(s, c, m, now, gravityOf(s.profile));
        // over the line before GO
        const st = c.start, ahead = (m.x - st.x) * st.fx + (m.z - st.z) * st.fz, before = this.phase === PH.READY && now < this.t0 - 100;
        if (why || (before && ahead > 15)) { this.room.snapBack(s, why || 'early', now); return; }
        L.x = m.x; L.y = m.y; L.z = m.z;
        this.room.setPublic(s, m, now);
        if (r.finished || r.out) return;
        this.track(r, m.x, m.y, m.z, m.a === 0 || m.a === 1, now);
    }
    // which checkpoint, how far along, the finish
    track(r, x, y, z, ground, now) {
        const c = this.c;
        // (hopping across a checkpoint counts: a moment on the ground can fall between two moves)
        const pad = c.padAt(x, y, z, r.cp + 1, 2);
        if (pad > r.cp) { r.cp = pad; if (r.s) this.room.sendTo(r.s, 'rushcp', { i: pad }); }
        void ground;
        const sn = c.sAt(r.cp, x, y, z);
        r.sNow = sn;
        if (sn > r.best) r.best = sn;
        if (this.phase !== PH.READY && r.cp >= c.cps.length - 1 && c.atFinish(x, y, z)) this.finish(r, now);
    }
    // back to your checkpoint (a fall, a trap, or you asked); before the race, your place on the line
    respawn(s, now) {
        const r = this.racers.get(s.id);
        if (!r || r.out || r.finished) return;
        r.falls++;
        if (this.phase === PH.READY) { const sp = this.c.startSpot(r.spot); sendTo(s, sp.x, sp.y, sp.z, now); return; }
        const b = this.c.respawnOf(r.cp);
        sendTo(s, b.x, b.y, b.z, now);
    }
    finish(r, now) {
        if (r.finished || r.out) return;
        r.finished = true;
        r.finN = ++this.finN;
        r.time = Math.max(0, now - this.t0);
        r.pl.st = 1; r.pl.prog = 1;
        if (r.s) this.room.sendTo(r.s, 'finished', { time: r.time, n: r.finN });
    }

    // ----- 20 times a second -----
    update(now, dt) {
        const t = (now - this.t0) / 1000, c = this.c;
        c.setTime(courseClock(now), dt);
        if (this.phase === PH.READY && now >= this.t0) this.phase = PH.RACE;
        for (const r of this.racers.values()) if (r.bot) this.driveBot(r, t, dt, now);
        if (this.phase === PH.RACE) this.stormTick(t, now);
        this.posT -= dt;
        if (this.posT <= 0) { this.posT = 0.25; this.positions(); }
        if (this.phase === PH.RACE) {
            const hs = this.humans(), left = hs.filter((r) => !r.finished && !r.out).length;
            // everyone real is done: wind it up quickly
            if (hs.length && !left && !this.endAt) this.endAt = now + 1800;
            if (this.endAt && now >= this.endAt) this.results(now);
            // nobody real left at all
            if (!hs.length) this.ended = true;
        } else if (this.phase === PH.RESULTS) {
            if (now >= this.resultsAt) this.ended = true;
        }
    }
    stormTick(t, now) {
        const s = stormS(t, this.k);
        let left = 0;
        for (const r of this.racers.values()) {
            if (r.finished || r.out) continue;
            if (r.sNow < s) {
                r.out = true; r.outAt = now; r.pl.st = 2;
                this.room.broadcastTo(this.id, 'caught', { p: r.pl.pid });
                if (r.s) this.room.sendTo(r.s, 'out', { why: 'storm', secs: t });
            } else left++;
        }
        if (!left) this.results(now);
    }
    // the finished by when, the running by how far, the caught: the last caught first
    positions() {
        const list = [...this.racers.values()];
        list.sort((a, b) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished) return a.finN - b.finN;
            if (a.out !== b.out) return a.out ? 1 : -1;
            if (a.out) return b.outAt - a.outAt;
            return b.sNow - a.sNow;
        });
        const tot = this.c.total;
        list.forEach((r, i) => {
            if (r.pl.place !== i + 1) r.pl.place = i + 1;
            const pr = r.finished ? 1 : clamp(r.best / tot, 0, 1);
            if (Math.abs(pr - r.pl.prog) > 0.001) r.pl.prog = pr;
        });
    }
    // ----- the bots -----
    driveBot(r, t, dt, now) {
        const c = this.c, b = r.body;
        if (r.dead > 0) { r.dead -= dt; return; }
        if (r.out) return;
        if (r.finished) { this.pubBot(r, now); return; }
        if (this.phase === PH.READY || t < (r.startDelay || 0)) {
            // on the line: jiggling about with nerves
            r.idleT = (r.idleT || 0) - dt;
            const inp = { mx: 0, mz: 0, jump: false, hold: true, power: CFG.power };
            if (r.idleT <= 0) { r.idleT = rnd(1, 3); inp.jump = Math.random() < 0.35; }
            stepBody(b, inp, dt, c);
            r.ry = c.start.ry;
            this.pubBot(r, now);
            return;
        }
        const P = pilotStep(r.pilot, b, c, c.time, dt);
        const ev = stepBody(b, { mx: P.mx, mz: P.mz, jump: P.jump, hold: P.hold, power: CFG.power, speed: P.speed }, dt, c);
        if (Math.abs(b.vx) + Math.abs(b.vz) > 1) r.ry = Math.atan2(b.vx, b.vz);
        this.track(r, b.x, b.y, b.z, b.onGround, now);
        if (ev === EV.LETHAL || P.respawn) {
            const sp = c.respawnOf(r.cp);
            b.x = sp.x; b.y = sp.y; b.z = sp.z; b.vx = b.vy = b.vz = 0; b.ex = b.ez = 0; b.onGround = false; b.ground = null; b.fromY = sp.y; b.safeT = 0.5;
            resetPilot(r.pilot, c.routeOf(r.cp));
            r.dead = 0.5;
        }
        this.pubBot(r, now);
    }
    pubBot(r, now) {
        const b = r.body;
        r.x = b.x; r.y = b.y; r.z = b.z; r.t = now;
        r.a = b.knockT > 0 ? 3 : b.climb ? 4 : !b.onGround ? 2 : Math.abs(b.vx) + Math.abs(b.vz) > 2 ? 1 : 0;
    }
    // ----- the results: places, Coins, XP -----
    results(now) {
        if (this.phase === PH.RESULTS) return;
        this.phase = PH.RESULTS;
        this.resultsAt = now + CFG.resultsSecs * 1000;
        this.positions();
        const list = [...this.racers.values()].sort((a, b) => a.pl.place - b.pl.place), tot = this.c.total;
        const secsOf = (r) => (r.finished ? r.time : r.outAt ? r.outAt - this.t0 : now - this.t0) / 1000;
        const rows = list.map((r) => ({ n: r.pl.name, bot: r.bot, p: r.pl.place, t: Math.round(secsOf(r) * 10) / 10, f: r.finished, out: r.out, pr: Math.round(clamp(r.best / tot, 0, 1) * 1000) / 10, pid: r.pl.pid }));
        for (const r of list) {
            if (!r.s) continue;
            const s = r.s, p = s.profile, place = r.pl.place - 1, fr = r.finished ? 1 : clamp(r.best / tot, 0, 1), secs = secsOf(r);
            const got = Math.round(rushCoins(fr, place, this.stages) * coinMult(p)), xp = rushXp(fr, place, this.stages), gems = rushGems(place);
            p.races = (p.races || 0) + 1;
            this.room.task(s, 'rush', 1);
            if (place < 3) { p.podiums = (p.podiums || 0) + 1; this.room.task(s, 'podium', 1); }
            if (place === 0) p.wins = (p.wins || 0) + 1;
            p.gems += gems;
            s.stats.races++;
            if (place === 0) s.stats.wins++;
            this.room.addCoins(s, got);
            this.room.addXp(s, xp);
            this.room.sendTo(s, 'results', { rows, me: { place, finished: r.finished, out: r.out, secs, coins: got, xp, gems, pct: Math.round(fr * 1000) / 10, stages: this.stages } });
            this.room.changed(s);
        }
    }
    dispose() {
        for (const r of this.racers.values()) if (r.bot) this.room.state.players.delete(r.key);
        this.racers.clear();
    }
}
