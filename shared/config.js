// Sky Breakout: the game's data and formulas, shared by the client and the server.
// The loop: one long sky obby of 135 stages through nine worlds, harder all the way, a checkpoint at the start of every stage. Reach the Breakout Balloon at
// the end, claim your Star and run it again for bigger pay. Now and then a Storm Rush: everyone on the same course with the storm rolling
// up behind them. Coins buy gear, buddies and trails; Stars (one a Breakout) buy the best trails; Gems skip a stage that beat you.
// Everything is bought with what you earn in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // Storm Rush: how many racers (bots fill the empty places), how long the queue waits for others on this server
    racers: 8, queueSecs: 9, soloQueueSecs: 2.2, getReadySecs: 6, joinLateSecs: 1.5, resultsSecs: 14,
    // the invitation to everyone on the server: how often, how long it stays up
    inviteEvery: 180, inviteSecs: 30,
    // moving: run speed, gravity, the fastest fall, a jump's power; on the Cloud Cape; with Feather Fall; up a ladder; how far a fall goes before you're back at your checkpoint
    walk: 22, grav: 110, fallMax: 150, hopV: 22, power: 60, airGrip: 9, glideFall: 7, moonK: 0.55, climb: 13, fallKill: 56,
    // the bots running the course when it's quiet (one leaves per player who joins)
    hubBots: 3,
    // what a skip costs
    skipGems: 3,
};

// ----- jump power -> height (studs) -----
export const jumpH = (p) => Math.max(0, p) * Math.max(0, p) / 392;
export const jumpV = (p) => Math.sqrt(2 * CFG.grav * jumpH(p));

// ----- the worlds: every 15 stages of the long run, and one Storm Rush map each -----
export const WORLDS = [
    { id: 'bay', name: 'Bounce Bay', mood: 'bay', icon: '🏖️', text: 'Pool toys and paddling rings over a turquoise lagoon' },
    { id: 'candy', name: 'Candy Clouds', mood: 'candy', icon: '🍬', text: 'Wafers, gumdrops and pink sugar sky' },
    { id: 'ruins', name: 'Emerald Ruins', mood: 'ruins', icon: '🌿', text: 'Mossy temples and crumbling bridges above the jungle' },
    { id: 'neon', name: 'Neon Arcade', mood: 'neon', icon: '🕹️', text: 'A dusk of glowing grids and blinking lights' },
    { id: 'gear', name: 'Clockwork Yard', mood: 'gear', icon: '⚙️', text: 'Brass gears, pistons and swinging hammers' },
    { id: 'frost', name: 'Frost Peaks', mood: 'frost', icon: '❄️', text: 'Slippery ice under a blue dusk and the aurora' },
    { id: 'magma', name: 'Ember Rift', mood: 'magma', icon: '🌋', text: 'Black rock, pumping pistons and jets of flame over a lava sea' },
    { id: 'orbit', name: 'Starfall Orbit', mood: 'orbit', icon: '🪐', text: 'Platforms in orbit round little planets, out among the stars', storm: 0.85 },
    { id: 'crown', name: 'Sunfire Crown', mood: 'crown', icon: '👑', text: 'Gold and fire, the last climb to the balloon' },
];
export const STAGES_PER_WORLD = 15;
export const STAGES = WORLDS.length * STAGES_PER_WORLD;
export const worldOfStage = (i) => Math.min(WORLDS.length - 1, Math.floor(Math.max(0, i) / STAGES_PER_WORLD));
// how hard a stage of the long run is: climbing all the way, gentle for the first stages, well past 1 (the top an obstacle's numbers were first made for) by the end
export const stageD = (i) => 0.05 + 1.35 * Math.pow(Math.max(0, i) / (STAGES - 1), 0.8);
// a stage that beat you costs more to skip the further on it is
export const skipCost = (i) => CFG.skipGems + 2 * Math.floor(Math.max(0, i) / STAGES_PER_WORLD);

// ----- Storm Rush: length and difficulty grow with you. t: seconds since GO. (A map where you have to wait for things gets a slower storm: a world's storm) -----
export const RUSH_TIERS = [
    { lv: 1, stages: 6, d: 0.08, k: 0.85 }, { lv: 3, stages: 8, d: 0.22, k: 0.92 }, { lv: 6, stages: 10, d: 0.38, k: 1 },
    { lv: 10, stages: 12, d: 0.55, k: 1.08 }, { lv: 15, stages: 15, d: 0.75, k: 1.16 }, { lv: 22, stages: 18, d: 1, k: 1.25 }, { lv: 30, stages: 20, d: 1.22, k: 1.3 },
];
export const rushTier = (lv) => { let t = 0; for (let i = 0; i < RUSH_TIERS.length; i++) if ((lv || 1) >= RUSH_TIERS[i].lv) t = i; return t; };
export const STORM = { head: 12, v0: 4.2, acc: 0.05, vMax: 15, back: 28 };
// how far along the course the storm has come (studs)
export function stormS(t, k) {
    const x = Math.max(0, t - STORM.head), v0 = STORM.v0 * (k || 1), a = STORM.acc * (k || 1), tMax = (STORM.vMax - v0) / a;
    if (x <= tMax) return -STORM.back + v0 * x + 0.5 * a * x * x;
    return -STORM.back + v0 * tMax + 0.5 * a * tMax * tMax + STORM.vMax * (x - tMax);
}
// what it pays: how far you got (0..1), your place, how long the course was
const PLACE_K = [1, 0.8, 0.65, 0.54, 0.45, 0.38, 0.32, 0.28];
export const placeK = (place) => PLACE_K[Math.min(PLACE_K.length - 1, Math.max(0, place))];
export const rushCoins = (fr, place, stages) => Math.round((40 + 34 * (stages || 6) * Math.min(1, fr)) * placeK(place));
export const rushXp = (fr, place, stages) => Math.round((30 + 16 * (stages || 6) * Math.min(1, fr)) * (0.55 + 0.45 * placeK(place)));
export const rushGems = (place) => (place === 0 ? 3 : place === 1 ? 1 : 0);

// ----- the long run: every stage you reach for the first time this run pays; a Breakout pays a lot, more every time -----
export const lapK = (laps) => 1 + Math.min(40, laps || 0) * 0.25;
export const stageCoins = (i, laps) => Math.round((8 + i * 1.1) * lapK(laps));
export const stageXp = (i) => 12 + i * 2;
export const breakoutReward = (laps) => ({ coins: 1500 + 400 * Math.min(40, laps), gems: 25 + Math.min(25, laps * 4), stars: 1, xp: 1200 + 200 * Math.min(40, laps) });
// your rank for a whole run, by time
export const TIME_RANKS = [{ r: 'S', mins: 30, color: '#ffd028' }, { r: 'A', mins: 50, color: '#ff5a5a' }, { r: 'B', mins: 90, color: '#46ec50' }, { r: 'C', mins: 180, color: '#3ab4ff' }, { r: 'D', mins: Infinity, color: '#b45aff' }];
export const rankOfTime = (ms) => { for (const x of TIME_RANKS) if (ms < x.mins * 60000) return x; return TIME_RANKS[TIME_RANKS.length - 1]; };

// ----- levels -----
export const xpNeed = (lv) => Math.round(50 * Math.pow(Math.max(1, lv), 1.25) + 10);
export const upLevel = (p, id) => (p.ups && p.ups[id]) || 0;
export const walkOf = (p) => CFG.walk * (1 + 0.04 * upLevel(p, 'shoes'));
export const powerOf = (p) => CFG.power * (1 + 0.025 * upLevel(p, 'boots'));
export const hasDouble = (p) => upLevel(p, 'double') > 0;
export const hasMoon = (p) => upLevel(p, 'moon') > 0;
export const hasCarpet = (p) => upLevel(p, 'carpet') > 0;
export const petBonus = (p) => { let m = 0; for (const id of p.team || []) { const k = petById[id]; if (k) m += k.bonus; } return m; };
export const teamSize = () => 3;
// your Coins from stages and races: your buddies
export const coinMult = (p) => 1 + petBonus(p);

// ----- gear, for Coins -----
export const UPGRADES = [
    { id: 'shoes', name: 'Wind Shoes', ic: 'shoe', text: 'Run 4% faster, every level', base: 90, grow: 2.1, max: 5, lv: 1, color: '#3ad8ff' },
    { id: 'boots', name: 'Spring Boots', ic: 'spring', text: 'Jump a little higher, every level', base: 120, grow: 2.1, max: 5, lv: 1, color: '#ffc21e' },
    { id: 'double', name: 'Twin Hop', ic: 'wing', text: 'Jump again in the air', base: 300, grow: 1, max: 1, lv: 1, color: '#46ec50' },
    { id: 'moon', name: 'Feather Fall', ic: 'moon', text: 'Huge floaty jumps (tap to turn it on and off)', base: 900, grow: 1, max: 1, lv: 1, color: '#7a8aff' },
    { id: 'carpet', name: 'Cloud Cape', ic: 'carpet', text: 'Hold JUMP in the air to glide', base: 2200, grow: 1, max: 1, lv: 1, color: '#ff5ac8' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));

// ----- trails: a ribbon behind you. Coins for the first ones, Stars from Breakouts for the best -----
export const TRAILS = [
    { id: 'none', name: 'No Trail', coins: 0, lv: 1, color: 0xffffff },
    { id: 'mint', name: 'Seafoam', coins: 80, lv: 1, color: 0x5affb0 },
    { id: 'sun', name: 'Lemon Drop', coins: 160, lv: 2, color: 0xffd23a },
    { id: 'rose', name: 'Bubblegum', coins: 260, lv: 3, color: 0xff5a9a },
    { id: 'sky', name: 'Kite String', coins: 380, lv: 4, color: 0x3ab4ff },
    { id: 'violet', name: 'Grape Fizz', coins: 560, lv: 6, color: 0xb45aff },
    { id: 'ember', name: 'Hot Sauce', coins: 800, lv: 8, color: 0xff6a1a },
    { id: 'ice', name: 'Snow Cone', coins: 1200, lv: 10, color: 0xa8f0ff },
    { id: 'lime', name: 'Sour Lime', stars: 1, lv: 1, color: 0xb0ff2a },
    { id: 'coral', name: 'Coral Reef', stars: 1, lv: 1, color: 0xff7a6a },
    { id: 'neon', name: 'Arcade Pink', stars: 2, lv: 1, color: 0xff2ae0 },
    { id: 'brass', name: 'Brass Spark', stars: 2, lv: 1, color: 0xe8a838 },
    { id: 'aurora', name: 'Aurora', stars: 3, lv: 1, color: 0x5affc8 },
    { id: 'gold', name: 'Pure Gold', stars: 4, lv: 1, color: 0xffc21e },
    { id: 'vine', name: 'Jungle Vine', coins: 1800, lv: 12, color: 0x3ad05a },
    { id: 'molten', name: 'Molten', stars: 4, lv: 1, color: 0xff5a1a },
    { id: 'comet', name: 'Comet Tail', stars: 5, lv: 1, color: 0xb8c8ff },
    { id: 'rainbow', name: 'Rainbow Run', stars: 6, lv: 1, color: 0xffffff, rainbow: true },
];
export const trailById = lookup(Object.fromEntries(TRAILS.map((t) => [t.id, t])));

// ----- buddies: little creatures out of eggs, following you; each adds to the Coins you get -----
export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' },
    legendary: { name: 'Legendary', color: '#ffc42a' }, mythic: { name: 'Mythic', color: '#ff4a8a' },
});
// shape: 0 chick, 1 bunny, 2 fox, 3 bat
const pet = (id, name, shape, color, bonus, rarity) => ({ id, name, shape, color, bonus, rarity });
export const PETS = [
    pet('splash', 'Splash', 0, 0x6ad8ff, 0.04, 'common'), pet('sandy', 'Sandy', 1, 0xf0dcae, 0.05, 'common'), pet('coral', 'Coral', 2, 0xff8a6a, 0.08, 'rare'), pet('skipper', 'Skipper', 3, 0x3a7ad0, 0.14, 'epic'),
    pet('fizz', 'Fizz', 0, 0xff9ad8, 0.07, 'common'), pet('nougat', 'Nougat', 1, 0xe8c8a0, 0.09, 'common'), pet('taffy', 'Taffy', 2, 0xffb0c8, 0.14, 'rare'), pet('licorice', 'Licorice', 3, 0x4a2a5a, 0.24, 'epic'),
    pet('pixel', 'Pixel', 0, 0x5affe0, 0.12, 'common'), pet('joystick', 'Joystick', 1, 0xc85aff, 0.15, 'common'), pet('glitchy', 'Glitchy', 2, 0xff3ac8, 0.24, 'rare'), pet('arcadia', 'Arcadia', 3, 0x3affd8, 0.45, 'legendary'),
    pet('cog', 'Cog', 0, 0xd8a848, 0.22, 'common'), pet('rivet', 'Rivet', 1, 0x9aa0a8, 0.26, 'common'), pet('piston', 'Piston', 2, 0xc87a3a, 0.42, 'rare'), pet('tick', 'Tick-Tock', 3, 0xffc21e, 0.8, 'legendary'),
    pet('sprout', 'Sprout', 0, 0x8ad04a, 0.16, 'common'), pet('thicket', 'Thicket', 1, 0x3a9a4a, 0.19, 'common'), pet('idol', 'Idol', 2, 0xc8b878, 0.32, 'rare'), pet('vinewing', 'Vinewing', 3, 0x1a7a5a, 0.6, 'legendary'),
    pet('flurry', 'Flurry', 0, 0xffffff, 0.4, 'common'), pet('frosty', 'Frosty', 1, 0xc8e8ff, 0.5, 'rare'), pet('polar', 'Polar', 2, 0xe8f6ff, 0.8, 'epic'), pet('sunny', 'Sunfire', 3, 0xff8a1a, 1.6, 'mythic'),
    pet('cinder', 'Cinder', 0, 0xff6a2a, 0.65, 'common'), pet('ash', 'Ash', 1, 0x6a5a58, 0.8, 'rare'), pet('scoria', 'Scoria', 2, 0xd8481a, 1.3, 'epic'), pet('emberwing', 'Emberwing', 3, 0xffa020, 2.4, 'mythic'),
    pet('nova', 'Nova', 0, 0xf0f0ff, 1, 'common'), pet('lunar', 'Lunar', 1, 0xb8c0e8, 1.2, 'rare'), pet('quasar', 'Quasar', 2, 0x8a5aff, 2, 'epic'), pet('stardust', 'Stardust', 3, 0x3affd8, 3.6, 'mythic'),
];
export const petById = lookup(Object.fromEntries(PETS.map((k) => [k.id, k])));
const eggOf = (ids, odds) => ids.map((id, i) => ({ id, w: odds[i] }));
export const EGGS = [
    { id: 'beach', name: 'Beach Egg', coins: 120, lv: 1, color: 0x5ad8ff, pets: eggOf(['splash', 'sandy', 'coral', 'skipper'], [52, 32, 13, 3]) },
    { id: 'sugar', name: 'Sugar Egg', coins: 360, lv: 3, color: 0xff9ad8, pets: eggOf(['fizz', 'nougat', 'taffy', 'licorice'], [52, 32, 13, 3]) },
    { id: 'arcade', name: 'Arcade Egg', coins: 900, lv: 6, color: 0xc85aff, pets: eggOf(['pixel', 'joystick', 'glitchy', 'arcadia'], [55, 32, 12, 1]) },
    { id: 'moss', name: 'Moss Egg', coins: 1400, lv: 8, color: 0x5ac05a, pets: eggOf(['sprout', 'thicket', 'idol', 'vinewing'], [55, 32, 12, 1]) },
    { id: 'brass', name: 'Brass Egg', coins: 2200, lv: 10, color: 0xe8a838, pets: eggOf(['cog', 'rivet', 'piston', 'tick'], [55, 32, 12, 1]) },
    { id: 'glacier', name: 'Glacier Egg', coins: 5500, lv: 15, color: 0xa8e8ff, pets: eggOf(['flurry', 'frosty', 'polar', 'sunny'], [58, 30, 11.5, 0.5]) },
    { id: 'lava', name: 'Lava Egg', coins: 11000, lv: 20, color: 0xff6a2a, pets: eggOf(['cinder', 'ash', 'scoria', 'emberwing'], [58, 30, 11.5, 0.5]) },
    { id: 'comet', name: 'Comet Egg', coins: 22000, lv: 26, color: 0xa8b8ff, pets: eggOf(['nova', 'lunar', 'quasar', 'stardust'], [58, 30, 11.5, 0.5]) },
];
export const eggById = lookup(Object.fromEntries(EGGS.map((c) => [c.id, c])));
// every buddy of an egg found: Gems, once
export const INDEX_GEMS = [8, 15, 25, 30, 40, 70, 100, 140];

// ----- daily tasks -----
export const TASKS = lookup({
    stages: { text: 'Reach New Stages', icon: '🚩', n: 10, gems: 5, coins: 50 },
    rush: { text: 'Join a Storm Rush', icon: '🌩️', n: 2, gems: 6, coins: 60 },
    podium: { text: 'Finish in the Top 3', icon: '🏆', n: 1, gems: 6, coins: 80 },
    combo: { text: 'Clear 3 Stages Without Falling', icon: '🔥', n: 1, gems: 5, coins: 60 },
    gear: { text: 'Upgrade Your Gear', icon: '👟', n: 1, gems: 5, coins: 50 },
    eggs: { text: 'Open Eggs', icon: '🥚', n: 2, gems: 5, coins: 40 },
    best: { text: 'Beat Your Best Stage', icon: '📈', n: 1, gems: 5, coins: 60 },
});
const TASK_POOL = ['rush', 'podium', 'combo', 'gear', 'eggs', 'best'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['stages'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal -----
export const QUESTS = [
    { kind: 'bestStage', n: 2, text: 'Reach Stage 2', coins: 30 },
    { kind: 'bestStage', n: 5, text: 'Reach Stage 5', coins: 50 },
    { kind: 'gearUps', n: 1, text: 'Buy any gear', coins: 40 },
    { kind: 'races', n: 1, text: 'Join a Storm Rush', gems: 3 },
    { kind: 'bestStage', n: 10, text: 'Reach Stage 10', coins: 100 },
    { kind: 'hatched', n: 1, text: 'Open an egg', coins: 60 },
    { kind: 'bestStage', n: 15, text: 'Finish Bounce Bay: reach Stage 15', coins: 150 },
    { kind: 'lv', n: 3, text: 'Reach Level 3', coins: 100 },
    { kind: 'double', n: 1, text: 'Get Twin Hop', gems: 5 },
    { kind: 'podiums', n: 1, text: 'Finish a Storm Rush in the top 3', gems: 6 },
    { kind: 'trails', n: 1, text: 'Buy a trail', coins: 80 },
    { kind: 'bestStage', n: 22, text: 'Reach Stage 22', coins: 200 },
    { kind: 'wins', n: 1, text: 'Win a Storm Rush', gems: 8 },
    { kind: 'bestStage', n: 30, text: 'Finish Candy Clouds: reach Stage 30', gems: 8 },
    { kind: 'moon', n: 1, text: 'Get Feather Fall', coins: 200 },
    { kind: 'lv', n: 8, text: 'Reach Level 8', gems: 10 },
    { kind: 'bestStage', n: 45, text: 'Finish Emerald Ruins: reach Stage 45', coins: 600 },
    { kind: 'hatched', n: 5, text: 'Open 5 eggs', gems: 8 },
    { kind: 'carpet', n: 1, text: 'Get the Cloud Cape', coins: 400 },
    { kind: 'bestStage', n: 60, text: 'Finish Neon Arcade: reach Stage 60', gems: 15 },
    { kind: 'wins', n: 5, text: 'Win 5 Storm Rushes', gems: 15 },
    { kind: 'bestStage', n: 75, text: 'Finish Clockwork Yard: reach Stage 75', coins: 1500 },
    { kind: 'lv', n: 15, text: 'Reach Level 15', gems: 15 },
    { kind: 'bestStage', n: 90, text: 'Finish Frost Peaks: reach Stage 90', gems: 25 },
    { kind: 'bestStage', n: 105, text: 'Finish Ember Rift: reach Stage 105', coins: 3000 },
    { kind: 'bestStage', n: 120, text: 'Finish Starfall Orbit: reach Stage 120', gems: 35 },
    { kind: 'laps', n: 1, text: 'Reach the Breakout Balloon', gems: 50 },
    { kind: 'lv', n: 25, text: 'Reach Level 25', gems: 30 },
    { kind: 'laps', n: 3, text: 'Break out 3 times', gems: 60 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes -----
export const DAILY = [
    { coins: 100 }, { coins: 120 }, { gems: 5 }, { coins: 160 }, { coins: 200 }, { gems: 9 }, { coins: 400, gems: 20 },
];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session)
export const GIFTS = [
    { min: 2, coins: 50 }, { min: 5, gems: 5 }, { min: 9, coins: 90 }, { min: 14, gems: 6 }, { min: 20, coins: 220 }, { min: 30, gems: 12 }, { min: 45, coins: 500, gems: 15 },
];
export const CODES = lookup({
    SKY: { coins: 100 }, BREAKOUT: { gems: 5 }, BALLOON: { coins: 250 }, BLOXITY: { coins: 150 }, LEGION: { gems: 5 }, STORM: { coins: 120 },
});
// HTML: a Coin is drawn (class "cc"), Gems are 💎, Stars ⭐
export function rewardText(r, plain) {
    return [r.coins ? fmtComma(r.coins) + (plain ? ' Coins' : ' <i class="cc"></i>') : '', r.xp ? fmtComma(r.xp) + ' XP' : '', r.gems ? r.gems + ' 💎' : '', r.stars ? r.stars + ' ⭐' : ''].filter(Boolean).join(' + ');
}

// a badge on your name, by Breakouts
export const RANKS = [{ wins: 0, name: 'Runner', icon: '🎈' }, { wins: 1, name: 'Escapee', icon: '🥉' }, { wins: 3, name: 'Sky Rat', icon: '🥈' }, { wins: 8, name: 'Cloud Walker', icon: '🥇' }, { wins: 20, name: 'Skybreaker', icon: '💠' }, { wins: 50, name: 'Legend', icon: '👑' }];
export const rankOf = (wins) => { let r = RANKS[0]; for (const x of RANKS) if ((wins || 0) >= x.wins) r = x; return r; };

export const BOT_NAMES = [
    'LedgeLarry', 'SkyHopper', 'CloudNia', 'NoFallFay', 'xXObbyXx', 'BalloonBea', 'StepTwice', 'HopKing', 'WobblyWes', 'CliffNotes',
    'UpUpAndy', 'GapJumper', 'SlipperySam', 'BounceBoo', 'TrussTom', 'RailRider', 'SwiftKai', 'DizzyDev', 'PeakyPaz', 'TurnLeftLou',
    'MossyMo', 'FlipFlop', 'AirAmy', 'VaultVic', 'RunRunRae', 'StarChaser', 'KiteFlyer', 'LongJumpLee', 'SpinDodge', 'HammerTime',
];
// how good the bots are: top speed x, seconds of dithering, slips on jumps
export const BOT_SKILL = [
    { speed: [0.84, 0.92], dither: 0.14, slip: 0.2 },
    { speed: [0.88, 0.97], dither: 0.08, slip: 0.12 },
    { speed: [0.92, 1], dither: 0.04, slip: 0.06 },
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100) + u[i];
}
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0');
}
export const clockMs = (ms) => { const s = Math.floor(ms / 1000), c = Math.floor((ms % 1000) / 10); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.' + String(c).padStart(2, '0'); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
