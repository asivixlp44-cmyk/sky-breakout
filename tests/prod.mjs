// The production build with real input only: no QA hooks, the keyboard, mouse and touch as a player uses them, the game's own words on
// screen as the only way to know what happened. Run: npm run build, then node tests/prod.mjs
import { startServer, stopAll, launch, open, sleep, shot } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const num = async (page, sel) => { const t = await text(page, sel); const n = parseFloat(t.replace(/,/g, '')); return /K$/.test(t) ? n * 1000 : /M$/.test(t) ? n * 1e6 : n; };
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).catch(() => false);
const opened = (page) => page.$eval('#modal', (e) => !e.hidden);
async function waitFor(fn, secs) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await fn(); if (v) return v; await sleep(150); } return null; }
const stageOf = async (page) => parseInt((await text(page, '#progTxt')).replace(/[^\d/]/g, ''), 10) || 0;

await startServer(2933, {});
const browser = await launch();
try {
    console.log('--- desktop, keyboard and mouse');
    const url = 'http://localhost:2933/';
    const page = await open(browser, url, { w: 1280, h: 720, uid: 'prod' + Date.now() });
    console.log('  load + join', page.loadSecs, 's');
    check(await page.evaluate(() => !window.__qa), 'no QA hooks in the build');
    check(await visible(page, '#hud') && await visible(page, '#topBtns'), 'no start menu: straight in the world, the HUD up');
    check(/Home Island/.test(await text(page, '#progTxt')), 'a new player lands on the home island');
    // the daily reward offers itself; claim it with its button
    await waitFor(() => opened(page), 4);
    check(await opened(page) && /Ready to claim/.test(await text(page, '#modal')), 'the daily reward pops up: ready to claim');
    await page.click('#modal [data-act="daily"]'); await sleep(500);
    check(/Come back tomorrow/.test(await text(page, '#modal')), 'and is claimed by its button');
    check(await num(page, '#coinVal') >= 50, 'the Coins: ' + await text(page, '#coinVal'));
    await page.click('#modal [data-close]'); await sleep(300);
    // through the Start Gate and on: W held, a hop every so often, R when you've fallen behind, just as someone would
    await page.keyboard.down('KeyW');
    await sleep(800);
    const ranHud = await page.evaluate(() => document.body.classList.contains('running'));
    check(ranHud, 'running: the menu steps aside');
    const t0 = Date.now();
    let started = false, seen = false, stage = 0;
    while (Date.now() - t0 < 45000) {
        await page.keyboard.down('Space'); await sleep(300); await page.keyboard.up('Space');
        await sleep(420);
        if ((await text(page, '#timerTxt')) !== '00:00') started = true;
        stage = Math.max(stage, await stageOf(page));
        if (await visible(page, '#cpWord')) seen = true;
        if (seen && stage >= 2) break;
    }
    await page.keyboard.up('KeyW');
    await shot(page, 'prod-run');
    check(started, 'holding W: through the gate to Stage 1, the clock runs: ' + await text(page, '#timerTxt'));
    check(stage >= 1 && seen, 'the bar says which stage: ' + stage + ', and a checkpoint says so');
    // (you may have let go in mid-air: down first, then a moment standing still)
    check(!!(await waitFor(() => page.evaluate(() => !document.body.classList.contains('running')), 5)), 'stopped: the menu comes back');
    await shot(page, 'prod-stopped');
    // every menu button opens its panel
    for (const [sel, word] of [['#bQuests', 'Quests'], ['#bEggs', 'Avatar'], ['#bGear', 'Gear'], ['#bSettings', 'Options'], ['#coinBox', 'Leaderboards'], ['#pwDouble', 'Gear'], ['#starBox', 'Avatar']]) {
        await page.click(sel); await sleep(250);
        const h = await page.$eval('#modal h2', (e) => e.textContent).catch(() => '');
        check(h.includes(word), sel + ' opens ' + word);
        await page.click('#modal [data-close]'); await sleep(180);
    }
    // the daily reward and the free gifts, from Quests
    for (const [k, word] of [['daily', 'Daily'], ['gifts', 'FREE Gifts']]) {
        await page.click('#bQuests'); await sleep(250);
        await page.click('#modal [data-act="open"][data-k="' + k + '"]'); await sleep(250);
        const h = await page.$eval('#modal h2', (e) => e.textContent).catch(() => '');
        check(h.includes(word), 'Quests opens ' + word);
        await page.click('#modal [data-close]'); await sleep(180);
    }
    // a typed code
    await page.click('#bSettings'); await sleep(250);
    await page.type('#codeIn', 'balloon');
    await page.click('#modal [data-act="code"]');
    const coded = await waitFor(async () => /redeemed/i.test(await text(page, '#toasts')), 3);
    check(!!coded, 'a code typed in: ' + (await text(page, '#toasts')));
    await page.click('#modal [data-close]'); await sleep(200);
    // buying gear with the Coins you earned
    await page.click('#bGear'); await sleep(250);
    const before = await num(page, '#coinVal');
    await page.click('#modal [data-act="upgrade"][data-id="shoes"]');
    await sleep(700);
    const after = await num(page, '#coinVal');
    check(after < before, 'Wind Shoes bought: Coins ' + before + ' → ' + after);
    await sleep(300);
    if (await opened(page)) { await page.click('#modal [data-close]'); await sleep(200); }
    // Rush: the queue, a Storm Rush, the storm
    await page.click('#bPlay');
    const qTxt = await waitFor(async () => (await visible(page, '#queueBox')) && text(page, '#queueTxt'), 2);
    check(/1 \/ 8/.test(String(qTxt)), 'Rush: the queue, how many found: "' + qTxt + '"');
    await shot(page, 'prod-queue');
    const inrace = await waitFor(() => page.evaluate(() => document.body.classList.contains('inrace')), 12);
    check(!!inrace, 'then a Storm Rush: bots fill the empty places');
    const card = await waitFor(async () => (await visible(page, '#card')) && text(page, '#cardS'), 3);
    check(/Storm Rush/.test(String(card)), 'the card says what: ' + card);
    const count = await waitFor(async () => { const t = await text(page, '#count'); return /GO/.test(t) && t; }, 14);
    check(!!count, 'the countdown: GO!');
    // standing still: the storm gets you
    await shot(page, 'prod-race');
    const res = await waitFor(() => page.$eval('#modal', (e) => !e.hidden && /Storm Rush/.test(e.textContent)), 170);
    check(!!res, 'stand still and the storm gets you; the results come up');
    await shot(page, 'prod-results');
    check(/XP/.test(await text(page, '#modal')), 'with what it paid');
    await page.click('#modal [data-act="camp"]');
    const home = await waitFor(async () => (await page.evaluate(() => !document.body.classList.contains('inrace'))) && visible(page, '#topBtns'), 6);
    check(!!home, 'Back to My Run by its button');
    check(/Stage/.test(await text(page, '#progTxt')), 'back on your stage: ' + await text(page, '#progTxt'));
    const errs = page.errors;
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 3)));
    await page.close();

    console.log('--- what the game tells Bloxity (an SDK stand-in)');
    const STUB = 'window.__log = []; window.Legion = { SDK: { init() { window.__log.push("init"); }, portal: { isEmbeddedInLegion() { return false; } }, game: { loadingStep() {}, updateRoom(r) { window.__log.push("room:" + (r ? "yes" : "no")); }, loadingEnd() { window.__log.push("loadingEnd"); window.__startHidden = document.querySelector("#start").hidden; } } } };';
    const sdkPage = await open(browser, url, { w: 1280, h: 720, uid: 'prodsdk' + Date.now(), sdkStub: STUB });
    await sleep(800);
    const lg = await sdkPage.evaluate(() => window.__log);
    check(lg.filter((x) => x === 'loadingEnd').length === 1, 'loadingEnd() is called once: ' + lg.join(', '));
    check(lg.indexOf('room:yes') >= 0 && lg.indexOf('room:yes') < lg.indexOf('loadingEnd'), 'after it has joined a server, with no menu in between');
    check(await sdkPage.evaluate(() => window.__startHidden === true), 'with the loading screen already gone');
    check(sdkPage.errors.length === 0, 'no console errors: ' + JSON.stringify(sdkPage.errors.slice(0, 4)));
    await sdkPage.close();

    console.log('--- a portrait phone, touch only');
    const ph = await open(browser, url, { w: 390, h: 844, dpr: 2, touch: true, q: 'low', uid: 'prodph' + Date.now() });
    await sleep(1600);
    if (await opened(ph)) { const x = await ph.$eval('#modal [data-close]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await ph.touchscreen.tap(x.x, x.y); await sleep(300); }
    check(await visible(ph, '#stick') && await visible(ph, '#jumpBtn'), 'the stick and JUMP are up');
    const box = await ph.$eval('#stick', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    const jb = await ph.$eval('#jumpBtn', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    // both thumbs, as a player's: the stick held forward, JUMP tapped with the other all the while
    const thumb = await ph.touchscreen.touchStart(box.x, box.y);
    await thumb.move(box.x, box.y - box.w * 0.45);
    for (let i = 0; i < 22; i++) { await sleep(620); const other = await ph.touchscreen.touchStart(jb.x, jb.y); await sleep(60); await other.end(); }
    await shot(ph, 'prod-phone-run');
    const held = await ph.$eval('#knob', (e) => e.style.transform);
    await thumb.end();
    check(/-\d/.test(held), 'the stick stays held while the other thumb taps JUMP: ' + held);
    check((await text(ph, '#timerTxt')) !== '00:00', 'both thumbs take you to Stage 1: ' + await text(ph, '#timerTxt') + ', ' + await text(ph, '#progTxt'));
    await sleep(900);
    const pb = await ph.$eval('#bPlay', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await ph.touchscreen.tap(pb.x, pb.y);
    check(!!(await waitFor(() => visible(ph, '#queueBox'), 2)), 'Rush by touch: the queue');
    check(!!(await waitFor(() => ph.evaluate(() => document.body.classList.contains('inrace')), 14)), 'and a Storm Rush');
    await shot(ph, 'prod-phone-race');
    check(ph.errors.length === 0, 'no console errors: ' + JSON.stringify(ph.errors.slice(0, 3)));
    await ph.close();
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
