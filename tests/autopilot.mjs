// Browser runs with the autopilot: the controls (one press of SPACE is one jump), the long run with the stages paying, a full Storm Rush on every map;
// no snaps, no console errors. Run: node tests/autopilot.mjs [full] (full: the whole long run, Stage 1 to the balloon, about 16 minutes)
import { startServer, startVite, stopAll, launch, open, qa, sleep, shot } from './lib.mjs';
import { WORLDS, STAGES, STAGES_PER_WORLD } from '../shared/config.js';

const FULL = process.argv[2] === 'full', ONLY = process.argv[3];
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
await startServer(2933, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5495/', { w: 1280, h: 720, q: 'medium', uid: 'auto' + Date.now() });
    console.log('loaded in', page.loadSecs, 's');
    await qa(page, () => window.__qa.noWatch(true));
    await sleep(1800);
    await qa(page, () => window.__qa.close());
    await sleep(500);

    console.log('--- the controls');
    const j = await qa(page, async () => {
        const q = window.__qa, P = q.P; let jumps = 0, was = true;
        const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
        q.jump();
        for (let i = 0; i < 60; i++) { const on = P.b.onGround; if (was && !on) jumps++; was = on; await sleep2(16); }
        return jumps;
    });
    check(j === 1, 'one press of JUMP: one jump (' + j + ')');
    const held = await qa(page, async () => { const q = window.__qa, x0 = q.P.b.x, z0 = q.P.b.z; q.key('KeyW', true); await new Promise((r) => setTimeout(r, 700)); q.key('KeyW', false); return Math.hypot(q.P.b.x - x0, q.P.b.z - z0); });
    check(held > 8, 'W runs forward: ' + held.toFixed(1) + ' studs in 0.7 s');
    const sz = await qa(page, () => window.__qa.sizes());
    check(sz.over === 0, 'every stage fits its slot: the biggest is ' + sz.nv + ' of ' + sz.CAPV + ' vertices, ' + sz.ni + ' of ' + sz.CAPI + ' indices');

    if (ONLY !== 'maps') {
        console.log('--- the long run, ' + (FULL ? 'from Stage 1 to the balloon' : 'the first stages'));
        const goal = FULL ? STAGES : 12, t0 = Date.now();
        await qa(page, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
        let last = -1, stuckAt = Date.now(), s;
        for (;;) {
            await sleep(1000);
            s = await qa(page, () => window.__qa.state());
            if (s.cp > last) { last = s.cp; stuckAt = Date.now(); }
            if (s.cp + 1 >= goal && (!FULL || s.balloon)) break;
            if (Date.now() - stuckAt > 90000) break;
            if (Math.floor((Date.now() - t0) / 60000) !== Math.floor((Date.now() - t0 - 1000) / 60000)) console.log('      ' + Math.round((Date.now() - t0) / 60000) + ' min: stage ' + (s.cp + 1) + ', ' + s.respawns + ' falls, FPS ' + (await qa(page, () => window.__qa.perf().fps)));
        }
        check(s.cp + 1 >= goal, 'ran to Stage ' + (s.cp + 1) + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s (' + s.respawns + ' falls, ' + s.hits + ' knocks)');
        check(s.stage >= s.cp, 'the server agrees: stage ' + s.stage + ', ' + s.coins + ' Coins, Level ' + s.lv);
        check(s.snaps === 0, 'no snaps in all of that: ' + s.snaps);
        await shot(page, 'auto-run');
        if (FULL) {
            check(s.balloon, 'the balloon is offered at the end');
            await qa(page, () => window.__qa.actions.claim());
            await sleep(1500);
            const r = await qa(page, () => window.__qa.state());
            check(r.laps === 1 && r.stars === 1 && r.stage === 0, 'a Breakout: a Star, and back to the island');
            await shot(page, 'auto-breakout');
            await qa(page, () => window.__qa.close());
        }
        await qa(page, () => window.__qa.auto(false));
        await sleep(600);
        // each world's first stages, by the same pilot, on the real server
        if (!FULL) {
            for (let w = 1; w < WORLDS.length; w++) {
                const from = w * STAGES_PER_WORLD, to = from + 4;
                await qa(page, (i) => { const q = window.__qa; q.close(); q.P.pilot = null; q.toStage(i); }, from);
                await sleep(700);
                await qa(page, () => { window.__qa.close(); window.__qa.auto(); });
                await page.waitForFunction((n) => window.__qa.state().cp >= n, { timeout: 150000, polling: 300 }, to).catch(() => {});
                const r = await qa(page, () => window.__qa.state());
                check(r.cp >= to, WORLDS[w].name + ': through stage ' + (to + 1) + ' (' + r.respawns + ' falls so far)');
                await shot(page, 'auto-w' + w);
                await qa(page, () => window.__qa.auto(false));
            }
            check((await qa(page, () => window.__qa.state().snaps)) === 0, 'still no snaps');
        }
    }

    console.log('--- a full Storm Rush on every map');
    for (let w = 0; w < WORLDS.length; w++) {
        await qa(page, () => { window.__qa.close(); window.__qa.auto(false); });
        await sleep(400);
        // (a bigger level on every other map: longer and harder courses too)
        await qa(page, (l) => window.__qa.give({ lv: l }), [1, 3, 6, 10, 15, 22][w]);
        await sleep(200);
        await qa(page, (m) => window.__qa.play(m), w);
        await page.waitForFunction(() => { const q = window.__qa.state(); return q.inRace && q.t > 0.2; }, { timeout: 40000, polling: 200 });
        const info = await qa(page, () => { const q = window.__qa.state(); return { world: q.world, stages: q.stages }; });
        check(info.world === w, 'map ' + WORLDS[w].name + ', ' + info.stages + ' stages');
        await qa(page, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
        const t1 = Date.now();
        await page.waitForFunction(() => { const q = window.__qa.state(); return q.finished || q.out || q.results || !q.inRace; }, { timeout: 420000, polling: 500 }).catch(() => {});
        const r = await qa(page, () => window.__qa.state());
        check(r.finished, 'finished in ' + ((Date.now() - t1) / 1000).toFixed(0) + ' s, place ' + r.place + ', ' + r.respawns + ' falls');
        await shot(page, 'auto-rush' + w);
        await page.waitForFunction(() => window.__qa.state().results, { timeout: 120000, polling: 400 }).catch(() => {});
        check((await qa(page, () => window.__qa.state().results)), 'the results come up');
        check((await qa(page, () => window.__qa.state().snaps)) === 0, 'no snaps');
        await qa(page, () => window.__qa.leave());
        await page.waitForFunction(() => !window.__qa.state().inRace, { timeout: 25000, polling: 200 });
        await sleep(600);
    }
    const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
