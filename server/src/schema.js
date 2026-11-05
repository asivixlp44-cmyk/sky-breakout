import { schema, t } from '@colyseus/schema';

// Public, synced to every client: the server's clock, the queue, and everyone on this server (players and bots): who they are,
// which race they're in. Where they are goes in snapshots to the people who can see them ('snaps', stamped with server time:
// other clients smooth them on that timeline). Private progress (quests...) goes only to its owner in "profile".
export const PlayerState = schema({
    name: t.string().default(''),
    pid: t.uint8().default(0),
    bot: t.boolean().default(false),
    ctx: t.string().default(''),      // the Storm Rush they're in ('' on the long run)
    lv: t.uint16().default(1),
    wins: t.uint32().default(0),      // Breakouts: the badge on their name
    stage: t.uint8().default(0),      // how far along the long run, for the Players list
    coins: t.uint32().default(0),
    trail: t.string().default(''),
    team: t.string().default(''),     // their buddies
    av: t.string().default(''),       // packed Bloxity avatar (equipped ids + proportions)
    prog: t.float32().default(0),     // how far along the race, 0..1
    place: t.uint8().default(0),      // in their race, from 1
    st: t.uint8().default(0),         // 0 racing, 1 finished, 2 out (the storm got them)
}, 'PlayerState');

export const GameState = schema({
    now: t.float64().default(0),      // the server's clock, every patch
    queueN: t.uint8().default(0),     // how many have joined the next Storm Rush
    queueEnd: t.float64().default(0), // when it starts (an invitation to everyone, or someone pressed Rush)
    players: t.map(PlayerState),
}, 'GameState');
