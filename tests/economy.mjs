// A simulated typical first session, for the pacing: running the stages at a real player's pace (falls, stops, looking about; the later stages take longer),
// a Storm Rush now and then, quests claimed when done, gifts claimed on time, spending in the order a new player might. Numbers move a little between
// runs. It's a simulation, not a person's session. Run: node tests/economy.mjs [minutes]
import { CFG, UPGRADES, upgradeCost, TRAILS, EGGS, QUESTS, GIFTS, DAILY, RUSH_TIERS, rushTier, stageCoins, stageXp, rushCoins, rushXp, rushGems, xpNeed, coinMult, breakoutReward, STAGES, STAGES_PER_WORLD } from '../shared/config.js';

const MINS = +(process.argv[2] ?? 60);
const p = { lv: 1, xp: 0, coins: 0, gems: 0, stars: 0, ups: {}, team: [], pets: {}, trails: {}, races: 0, wins: 0, podiums: 0, hatched: 0, upgrades: 0, bestStage: 0, laps: 0, checkpoints: 0, qi: 0 };
let t = 0, stage = 0, giftI = 0, nextRush = 200, stageT = 0;
const log = (w) => console.log(String(Math.floor(t / 60)).padStart(3) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '  ' + w);
const addXp = (n) => { p.xp += n; while (p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; log('Level ' + p.lv); } };
const qv = (k) => (k === 'double' || k === 'moon' || k === 'carpet' ? (p.ups[k] ? 1 : 0) : k === 'trails' ? Object.keys(p.trails).length : k === 'gearUps' ? p.upgrades : p[k] || 0);
function quests() { while (p.qi < QUESTS.length && qv(QUESTS[p.qi].kind) >= QUESTS[p.qi].n) { const Q = QUESTS[p.qi]; log('quest: ' + Q.text + (Q.coins ? ' (+' + Q.coins + ' Coins)' : '') + (Q.gems ? ' (+' + Q.gems + ' Gems)' : '')); p.coins += Q.coins || 0; p.gems += Q.gems || 0; p.qi++; } }
function shop() {
    for (let go = 0; go < 4; go++) {
        const opts = [];
        for (const u of UPGRADES) { const n = p.ups[u.id] || 0; if (n < u.max) opts.push({ k: 'up', u, n, c: upgradeCost(u, n) * 0.7, real: upgradeCost(u, n) }); }
        for (const tr of TRAILS) if (tr.coins && !p.trails[tr.id] && p.lv >= tr.lv) { opts.push({ k: 'tr', tr, c: tr.coins * 1.5, real: tr.coins }); break; }
        for (const e of EGGS) if (p.lv >= e.lv && p.hatched < 2 + EGGS.indexOf(e) * 2) opts.push({ k: 'egg', e, c: e.coins, real: e.coins });
        opts.sort((a, b) => a.c - b.c);
        const o = opts[0];
        if (!o || p.coins < o.real) return;
        p.coins -= o.real;
        if (o.k === 'up') { p.ups[o.u.id] = o.n + 1; p.upgrades++; log('buys ' + o.u.name + (o.u.max > 1 ? ' Lv ' + (o.n + 1) : '')); }
        else if (o.k === 'tr') { p.trails[o.tr.id] = 1; log('buys the ' + o.tr.name + ' trail'); }
        else { p.hatched++; log('opens a ' + o.e.name); }
    }
}
p.coins += DAILY[0].coins || 0;
log('the daily reward: +' + (DAILY[0].coins || 0) + ' Coins');
while (t < MINS * 60) {
    while (giftI < GIFTS.length && t >= GIFTS[giftI].min * 60) { const g = GIFTS[giftI++]; p.coins += g.coins || 0; p.gems += g.gems || 0; log('FREE gift at ' + g.min + ' min'); }
    shop(); quests();
    if (t >= nextRush) {
        // a Storm Rush: how far you get and where you come grows a little with practice
        const T = RUSH_TIERS[rushTier(p.lv)], secs = T.stages * (9 + Math.random() * 5), place = Math.max(0, Math.min(7, Math.round(3.5 - p.races * 0.25 + Math.random() * 3 - 1.5))), fr = Math.min(1, 0.55 + Math.random() * 0.3 + p.races * 0.04);
        const got = Math.round(rushCoins(fr, place, T.stages) * coinMult(p));
        t += CFG.queueSecs + CFG.getReadySecs + secs + 8;
        p.coins += got; addXp(rushXp(fr, place, T.stages)); p.gems += rushGems(place);
        p.races++; if (place === 0) p.wins++; if (place < 3) p.podiums++;
        log('Storm Rush: ' + T.stages + ' stages, place ' + (place + 1) + ', +' + got + ' Coins');
        nextRush = t + CFG.inviteEvery * (0.6 + Math.random() * 0.6);
        continue;
    }
    // a slice of running: each stage takes a person several tries, more as the course gets harder; gear helps a little
    const dt = 5;
    t += dt; stageT += dt;
    const needs = (14 + stage * 1.1 + Math.random() * 18) * (1 - Math.min(0.25, (p.upgrades || 0) * 0.02));
    if (stageT >= needs) {
        stageT = 0;
        p.coins += Math.round(stageCoins(stage, p.laps) * coinMult(p));
        addXp(stage + 1 > p.bestStage ? stageXp(stage) : Math.round(stageXp(stage) * 0.5));
        p.bestStage = Math.max(p.bestStage, stage + 1);
        p.checkpoints++;
        stage++;
        if (stage % STAGES_PER_WORLD === 0 && stage < STAGES) log('reaches Stage ' + (stage + 1));
        if (stage >= STAGES) {
            const R = breakoutReward(p.laps);
            p.coins += R.coins; p.gems += R.gems; p.stars += R.stars; addXp(R.xp); p.laps++; stage = 0;
            log('BREAKOUT #' + p.laps + ': +' + R.coins + ' Coins, +' + R.gems + ' Gems, a Star');
        }
    }
}
log('after ' + MINS + ' min: Level ' + p.lv + ', best stage ' + p.bestStage + ', ' + p.laps + ' Breakouts, ' + p.races + ' Storm Rushes (' + p.wins + ' won), ' + Math.floor(p.coins) + ' Coins, ' + p.gems + ' Gems, ' + p.stars + ' Stars, ' + Object.keys(p.ups).length + ' gear, ' + Object.keys(p.trails).length + ' trails, ' + p.hatched + ' eggs, quest ' + p.qi + ' / ' + QUESTS.length);
process.exit(0);
