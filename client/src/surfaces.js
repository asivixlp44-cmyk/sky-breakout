// The look of everything in the sky: one array of tiles painted on canvases at load, and one matte material that reads a layer per vertex,
// so a whole course of many surfaces is one draw. Lit, glowing and scrolling (belts) are all this one shader, chosen per vertex. What moves
// is moved here too, in the vertex shader, from a table of movers: the platforms, the bars, the hammers and the blinking tiles cost the
// frame nothing but this, and they run on the same clock as the physics.
import { T, START_QUALITY } from './engine.js';
import { CU } from './clock.js';

// the layers
const NAMES = ['PLAIN', 'STRIPE', 'CHECK', 'ARROW', 'PUFF', 'PLANK', 'BRICK', 'GRID', 'CANDY', 'WAFER', 'RIVET', 'COG', 'ICE', 'SNOW', 'GOLD', 'SAND', 'GRASS', 'ROCK', 'HAZARD', 'KILL', 'BELT', 'PAD', 'RADIAL', 'LADDER', 'STAIR', 'RAINBOW', 'BEACH', 'PATH', 'CLOUD', 'NEON', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'STAR', 'SAFE', 'CHEV', 'CRACK', 'MOSS', 'LAVA', 'HULL'];
export const L = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const LAYERS = NAMES.length;
// how many studs one tile covers by default
export const TILE = 12;
// vertex modes (aFx.y): GLOW unlit; DECAL the tile's own colours where it has any, the vertex colour where it's clear; 10 and up scroll their tile along v, (mode - 10) a quarter-tile a second
export const FX = { LIT: 0, GLOW: 1, DECAL: 2 };
const N = START_QUALITY === 'low' ? 64 : 128;

// ----- painted tiles: each draws in a square of side S (a canvas 2d) -----
function painter() {
    const R = (() => { let s = 91; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const fill = (x, c) => { x.fillStyle = c; x.fillRect(0, 0, N, N); };
    const seams = (x, n, c, w) => { x.fillStyle = c; const st = N / n; for (let i = 0; i <= n; i++) { x.fillRect(i * st - w / 2, 0, w, N); x.fillRect(0, i * st - w / 2, N, w); } };
    const digit = (x, d) => {
        x.font = `700 ${N * 0.86}px "Fredoka", "Arial Rounded MT Bold", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineJoin = 'round'; x.lineWidth = N * 0.13; x.strokeStyle = '#14103a'; x.strokeText(String(d), N / 2, N * 0.54);
        x.fillStyle = '#fff6a0'; x.fillText(String(d), N / 2, N * 0.54);
    };
    const P = {
        PLAIN: (x) => fill(x, '#ffffff'),
        // pale bands, for anything long
        STRIPE: (x) => { fill(x, '#ffffff'); x.fillStyle = 'rgba(30,40,80,0.13)'; for (let i = 0; i < 4; i += 2) x.fillRect(0, i * N / 4, N, N / 4); },
        CHECK: (x) => { fill(x, '#ffffff'); x.fillStyle = 'rgba(30,40,80,0.12)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * N / 4, j * N / 4, N / 4, N / 4); },
        // a chevron pointing along +v, on a soft ground
        ARROW: (x) => {
            fill(x, '#ffffff');
            x.fillStyle = 'rgba(30,40,80,0.08)'; x.fillRect(0, 0, N * 0.04, N); x.fillRect(N * 0.96, 0, N * 0.04, N);
            x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = N * 0.14; x.strokeStyle = 'rgba(255,255,255,1)';
            x.beginPath(); x.moveTo(N * 0.22, N * 0.72); x.lineTo(N * 0.5, N * 0.28); x.lineTo(N * 0.78, N * 0.72); x.stroke();
            x.lineWidth = N * 0.07; x.strokeStyle = 'rgba(30,40,80,0.22)'; x.beginPath(); x.moveTo(N * 0.22, N * 0.78); x.lineTo(N * 0.5, N * 0.34); x.lineTo(N * 0.78, N * 0.78); x.stroke();
        },
        // an inflated panel: seams with a soft pillow between them
        PUFF: (x) => {
            fill(x, '#f0f0f4');
            for (let i = 0; i < 2; i++) { const g = x.createLinearGradient(i * N / 2, 0, (i + 1) * N / 2, 0); g.addColorStop(0, 'rgba(20,30,70,0.2)'); g.addColorStop(0.28, 'rgba(255,255,255,0.65)'); g.addColorStop(0.6, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(20,30,70,0.26)'); x.fillStyle = g; x.fillRect(i * N / 2, 0, N / 2, N); }
        },
        PLANK: (x) => {
            fill(x, '#e8c896');
            for (let i = 0; i < 4; i++) { x.fillStyle = ['#e2bd86', '#edd0a0', '#d9b27c', '#e8c690'][i]; x.fillRect(0, i * N / 4 + 1, N, N / 4 - 2); x.fillStyle = 'rgba(90,50,20,0.55)'; x.fillRect(0, i * N / 4, N, Math.max(1, N / 64)); x.fillRect((i * 37 % 8) * N / 8, i * N / 4, Math.max(1, N / 64), N / 4); }
            x.strokeStyle = 'rgba(120,70,30,0.16)'; for (let i = 0; i < 24; i++) { const y = R() * N, a = R() * N; x.beginPath(); x.moveTo(a, y); x.lineTo(a + 8 + R() * N * 0.35, y + (R() - 0.5) * 2); x.stroke(); }
        },
        BRICK: (x) => {
            fill(x, '#b09080');
            const rows = 4, cols = 2;
            for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) {
                const w = N / cols, h = N / rows, o = r % 2 ? w / 2 : 0, g = 150 + R() * 70;
                x.fillStyle = `rgb(${g + 60},${g + 20},${g})`;
                x.fillRect(c * w + o + N / 64, r * h + N / 64, w - N / 32, h - N / 32);
            }
        },
        // a glowing grid on the dark
        GRID: (x) => { fill(x, '#141038'); const st = N / 4; x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(1, N / 56); for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * st, 0); x.lineTo(i * st, N); x.moveTo(0, i * st); x.lineTo(N, i * st); x.stroke(); } x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(st, st, st, st); x.fillRect(st * 2.2, st * 2.2, st * 0.8, st * 0.8); },
        // swirled candy stripes, slanted
        CANDY: (x) => { fill(x, '#ffffff'); x.fillStyle = 'rgba(255,255,255,0.5)'; x.save(); x.translate(N / 2, N / 2); x.rotate(Math.PI / 4); x.fillStyle = 'rgba(40,20,60,0.2)'; const w = N * 0.354; for (let i = -4; i < 4; i += 2) x.fillRect(i * w, -N, w, N * 2); x.restore(); },
        // a wafer: a fine waffle of squares
        WAFER: (x) => { fill(x, '#f4f0e8'); const n = 6, st = N / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = 'rgba(120,70,40,0.2)'; x.fillRect(i * st + st * 0.14, j * st + st * 0.14, st * 0.72, st * 0.72); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(i * st + st * 0.14, j * st + st * 0.14, st * 0.72, st * 0.12); } },
        // riveted plates
        RIVET: (x) => { fill(x, '#e8e8ec'); seams(x, 2, 'rgba(30,30,40,0.35)', Math.max(1, N / 48)); for (const [a, b] of [[0.12, 0.12], [0.38, 0.12], [0.12, 0.38], [0.38, 0.38], [0.62, 0.12], [0.88, 0.12], [0.62, 0.38], [0.88, 0.38], [0.12, 0.62], [0.38, 0.62], [0.12, 0.88], [0.38, 0.88], [0.62, 0.62], [0.88, 0.62], [0.62, 0.88], [0.88, 0.88]]) { x.fillStyle = 'rgba(40,30,20,0.4)'; x.beginPath(); x.arc(a * N, b * N + 1, N * 0.028, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(a * N - 0.5, b * N - 0.5, N * 0.02, 0, 7); x.fill(); } },
        COG: (x) => { fill(x, '#ffffff'); x.fillStyle = 'rgba(30,30,40,0.22)'; x.save(); x.translate(N / 2, N / 2); for (let i = 0; i < 8; i++) { x.rotate(Math.PI / 4); x.fillRect(-N * 0.07, -N * 0.46, N * 0.14, N * 0.92); } x.restore(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(N / 2, N / 2, N * 0.3, 0, 7); x.fill(); x.fillStyle = 'rgba(30,30,40,0.3)'; x.beginPath(); x.arc(N / 2, N / 2, N * 0.1, 0, 7); x.fill(); },
        ICE: (x) => { fill(x, '#e4f6ff'); x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = Math.max(1, N / 80); for (let i = 0; i < 9; i++) { let a = R() * N, b = R() * N; x.beginPath(); x.moveTo(a, b); for (let j = 0; j < 4; j++) { a += (R() - 0.5) * N * 0.3; b += (R() - 0.5) * N * 0.3; x.lineTo(a, b); } x.stroke(); } x.fillStyle = 'rgba(120,190,240,0.2)'; for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(R() * N, R() * N, N * (0.04 + R() * 0.1), 0, 7); x.fill(); } },
        SNOW: (x) => { fill(x, '#fafcff'); x.fillStyle = 'rgba(140,180,220,0.2)'; for (let i = 0; i < 26; i++) { x.beginPath(); x.ellipse(R() * N, R() * N, N * 0.03, N * 0.015, 0, 0, 7); x.fill(); } },
        GOLD: (x) => { const g = x.createLinearGradient(0, 0, N, N); g.addColorStop(0, '#ffe88a'); g.addColorStop(0.5, '#ffca3a'); g.addColorStop(1, '#ffdf72'); x.fillStyle = g; x.fillRect(0, 0, N, N); x.fillStyle = 'rgba(255,255,255,0.5)'; x.save(); x.translate(N / 2, N / 2); x.rotate(Math.PI / 4); x.fillRect(-N, -N * 0.5, N * 2, N * 0.1); x.fillRect(-N, N * 0.2, N * 2, N * 0.06); x.restore(); },
        SAND: (x) => { fill(x, '#f7e8c0'); for (let i = 0; i < 100; i++) { x.fillStyle = R() < 0.5 ? 'rgba(190,150,90,0.26)' : 'rgba(255,255,240,0.5)'; x.fillRect(R() * N, R() * N, N / 64 + R() * N / 40, N / 64); } },
        GRASS: (x) => { fill(x, '#7ad04a'); for (let i = 0; i < 90; i++) { x.fillStyle = R() < 0.5 ? 'rgba(60,160,50,0.6)' : 'rgba(170,240,100,0.5)'; x.fillRect(R() * N, R() * N, N / 56, N / 24 + R() * N / 18); } },
        ROCK: (x) => { fill(x, '#bfb8b0'); for (let i = 0; i < 30; i++) { x.fillStyle = R() < 0.5 ? 'rgba(80,70,70,0.14)' : 'rgba(255,255,255,0.22)'; x.beginPath(); x.ellipse(R() * N, R() * N, N * (0.03 + R() * 0.1), N * (0.02 + R() * 0.05), R() * 3, 0, 7); x.fill(); } },
        // black and yellow bands
        HAZARD: (x) => { fill(x, '#ffd21e'); x.save(); x.translate(N / 2, N / 2); x.rotate(Math.PI / 4); x.fillStyle = '#17141e'; const w = N * 0.354; for (let i = -4; i < 4; i += 2) x.fillRect(i * w, -N, w, N * 2); x.restore(); },
        // a deadly tile: hot red with a pale cross
        KILL: (x) => { fill(x, '#ff2438'); const g = x.createRadialGradient(N / 2, N / 2, N * 0.05, N / 2, N / 2, N * 0.7); g.addColorStop(0, '#ff8a4a'); g.addColorStop(1, '#d4082a'); x.fillStyle = g; x.fillRect(0, 0, N, N); x.strokeStyle = '#ffe8d8'; x.lineWidth = N * 0.12; x.lineCap = 'round'; x.beginPath(); x.moveTo(N * 0.28, N * 0.28); x.lineTo(N * 0.72, N * 0.72); x.moveTo(N * 0.72, N * 0.28); x.lineTo(N * 0.28, N * 0.72); x.stroke(); },
        // a conveyor: bright chevrons on rubber
        BELT: (x) => { fill(x, '#343848'); x.lineCap = 'butt'; x.lineJoin = 'miter'; x.lineWidth = N * 0.12; x.strokeStyle = '#ffd21e'; for (let i = -1; i < 3; i++) { const y = i * N / 2; x.beginPath(); x.moveTo(N * 0.14, y + N * 0.42); x.lineTo(N * 0.5, y + N * 0.12); x.lineTo(N * 0.86, y + N * 0.42); x.stroke(); } x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(0, 0, N * 0.05, N); x.fillRect(N * 0.95, 0, N * 0.05, N); },
        // a checkpoint: a soft square with a ring on it
        PAD: (x) => { fill(x, '#ffffff'); x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = N * 0.1; x.beginPath(); x.arc(N / 2, N / 2, N * 0.33, 0, 7); x.stroke(); x.strokeStyle = 'rgba(20,30,70,0.16)'; x.lineWidth = N * 0.025; x.beginPath(); x.arc(N / 2, N / 2, N * 0.45, 0, 7); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.14)'; x.beginPath(); x.arc(N / 2, N / 2, N * 0.34, 0, 7); x.fill(); },
        // wedges round the middle (a disc shows it's turning)
        RADIAL: (x) => { fill(x, '#ffffff'); x.save(); x.translate(N / 2, N / 2); for (let i = 0; i < 8; i += 2) { x.fillStyle = 'rgba(30,40,80,0.16)'; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, N, i * Math.PI / 4, (i + 1) * Math.PI / 4); x.closePath(); x.fill(); } x.restore(); },
        // rungs (a cut-out would be a second material: on a dark ground they read just as well)
        LADDER: (x) => { fill(x, '#2a2840'); x.fillStyle = '#ffffff'; x.fillRect(N * 0.08, 0, N * 0.14, N); x.fillRect(N * 0.78, 0, N * 0.14, N); for (let i = 0; i < 4; i++) x.fillRect(0.1 * N, (i + 0.35) * N / 4, N * 0.8, N * 0.07); },
        // a stair's tread: a light nosing, a shadow behind it
        STAIR: (x) => { const g = x.createLinearGradient(0, 0, 0, N); g.addColorStop(0, '#d8dcec'); g.addColorStop(0.16, '#ffffff'); g.addColorStop(0.86, '#ffffff'); g.addColorStop(1, '#a8acc4'); x.fillStyle = g; x.fillRect(0, 0, N, N); },
        // the bands of a rainbow, in their own colours
        RAINBOW: (x) => { const C = ['#ff3a5a', '#ff8a2a', '#ffd92a', '#4ae04a', '#2ab4ff', '#8a5aff']; C.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * N / 6, 0, N / 6 + 1, N); }); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, 0, N, N * 0.12); },
        // a beach ball's wedges
        BEACH: (x) => { const C = ['#ff4a5a', '#ffffff', '#ffd22a', '#ffffff', '#2ab4ff', '#ffffff', '#3adc6a', '#ffffff']; x.save(); x.translate(N / 2, N / 2); C.forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, N, i * Math.PI / 4, (i + 1) * Math.PI / 4); x.closePath(); x.fill(); }); x.restore(); },
        // the island's paths: rounded paving
        PATH: (x) => { fill(x, '#dcc9a0'); const rows = 3; for (let r = 0; r < rows; r++) for (let c = -1; c < 4; c++) { const w = N / 3, h = N / rows, o = r % 2 ? w / 2 : 0, g = 195 + R() * 40; x.fillStyle = `rgb(${g + 18},${g + 6},${g - 26})`; x.beginPath(); x.roundRect(c * w + o + N / 48, r * h + N / 48, w - N / 24, h - N / 24, N / 28); x.fill(); } },
        CLOUD: (x) => { fill(x, '#ffffff'); for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(190,210,240,0.14)'; x.beginPath(); x.arc(R() * N, R() * N, N * (0.05 + R() * 0.14), 0, 7); x.fill(); } },
        // a neon tube's face
        NEON: (x) => { const g = x.createLinearGradient(0, 0, N, 0); g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, 'rgba(255,255,255,0.6)'); x.fillStyle = g; x.fillRect(0, 0, N, N); },
        STAR: (x) => { fill(x, '#ffffff'); x.fillStyle = '#ffc21e'; x.strokeStyle = '#7a4a00'; x.lineWidth = N * 0.04; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? N * 0.2 : N * 0.44, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke(); },
        // the way across a floor of deadly tiles
        SAFE: (x) => { fill(x, '#ffffff'); x.fillStyle = 'rgba(40,180,90,0.16)'; x.fillRect(N * 0.06, N * 0.06, N * 0.88, N * 0.88); x.lineWidth = N * 0.05; x.strokeStyle = 'rgba(30,120,70,0.5)'; x.strokeRect(N * 0.06, N * 0.06, N * 0.88, N * 0.88); },
    };
    // old stone, cracked right across: this one's going to go
    P.CRACK = (x) => { fill(x, '#e4e0d4'); x.lineCap = 'round'; x.strokeStyle = 'rgba(40,30,20,0.6)'; x.lineWidth = Math.max(1, N / 36); for (let i = 0; i < 5; i++) { let a = R() * N, b = R() * N; x.beginPath(); x.moveTo(a, b); for (let j = 0; j < 4; j++) { a += (R() - 0.5) * N * 0.5; b += (R() - 0.5) * N * 0.5; x.lineTo(a, b); } x.stroke(); } x.strokeStyle = 'rgba(30,25,20,0.32)'; x.lineWidth = N / 20; x.strokeRect(0, 0, N, N); };
    // temple blocks with moss growing over them
    P.MOSS = (x) => { fill(x, '#d8d4c0'); seams(x, 2, 'rgba(50,50,30,0.42)', Math.max(1, N / 40)); for (let i = 0; i < 26; i++) { x.fillStyle = R() < 0.6 ? 'rgba(70,150,60,0.42)' : 'rgba(120,190,80,0.3)'; x.beginPath(); x.ellipse(R() * N, R() * N, N * (0.04 + R() * 0.1), N * (0.03 + R() * 0.06), R() * 3, 0, 7); x.fill(); } };
    // black rock with the fire showing through (drawn on white: the colours are its own)
    P.LAVA = (x) => { fill(x, '#463a3c'); for (let i = 0; i < 16; i++) { x.fillStyle = R() < 0.5 ? 'rgba(20,14,16,0.32)' : 'rgba(120,100,100,0.16)'; x.beginPath(); x.ellipse(R() * N, R() * N, N * (0.05 + R() * 0.12), N * (0.03 + R() * 0.07), R() * 3, 0, 7); x.fill(); } x.lineCap = 'round'; x.lineJoin = 'round'; for (let i = 0; i < 4; i++) { let a = R() * N, b = R() * N; const pts = [[a, b]]; for (let j = 0; j < 4; j++) { a += (R() - 0.5) * N * 0.55; b += (R() - 0.5) * N * 0.55; pts.push([a, b]); } for (const [w, c] of [[N / 22, '#ff5a1a'], [N / 56, '#ffd24a']]) { x.lineWidth = Math.max(1, w); x.strokeStyle = c; x.beginPath(); pts.forEach((q, j) => (j ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.stroke(); } } };
    // a ship's hull: panel lines and a little light
    P.HULL = (x) => { fill(x, '#f0f2fa'); seams(x, 2, 'rgba(20,30,70,0.45)', Math.max(1, N / 36)); x.fillStyle = 'rgba(20,30,70,0.1)'; x.fillRect(N * 0.08, N * 0.08, N * 0.34, N * 0.34); x.fillRect(N * 0.58, N * 0.58, N * 0.34, N * 0.34); x.fillStyle = 'rgba(40,220,200,0.85)'; x.fillRect(N * 0.6, N * 0.16, N * 0.28, N * 0.05); x.fillRect(N * 0.12, N * 0.7, N * 0.28, N * 0.05); };
    // the way on: a bold chevron on nothing at all (it's drawn as a decal)
    P.CHEV = (x) => { x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = N * 0.26; x.strokeStyle = '#14103a'; x.beginPath(); x.moveTo(N * 0.2, N * 0.76); x.lineTo(N * 0.5, N * 0.34); x.lineTo(N * 0.8, N * 0.76); x.stroke(); x.lineWidth = N * 0.14; x.strokeStyle = '#ffffff'; x.beginPath(); x.moveTo(N * 0.2, N * 0.76); x.lineTo(N * 0.5, N * 0.34); x.lineTo(N * 0.8, N * 0.76); x.stroke(); };
    for (let d = 0; d < 10; d++) P['D' + d] = (x) => digit(x, d);
    return P;
}

let tiles = null;
export function tileTexture() {
    if (tiles) return tiles;
    const P = painter(), c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true }), data = new Uint8Array(N * N * 4 * LAYERS);
    NAMES.forEach((n, l) => {
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, N, N);
        (P[n] || P.PLAIN)(x);
        data.set(x.getImageData(0, 0, N, N).data, l * N * N * 4);
    });
    tiles = new T.DataArrayTexture(data, N, N, LAYERS);
    tiles.format = T.RGBAFormat; tiles.type = T.UnsignedByteType;
    tiles.wrapS = tiles.wrapT = T.RepeatWrapping;
    tiles.magFilter = T.LinearFilter; tiles.minFilter = T.LinearMipmapLinearFilter; tiles.generateMipmaps = true;
    tiles.anisotropy = START_QUALITY === 'low' ? 1 : 4;
    tiles.colorSpace = T.SRGBColorSpace;
    tiles.needsUpdate = true;
    return tiles;
}

// ----- the movers: three rows of numbers per mover, one table for the course on screen -----
const MAX_MOVERS = 1024;
const movData = new Float32Array(MAX_MOVERS * 3 * 4);
const movTex = new T.DataTexture(movData, 3, MAX_MOVERS, T.RGBAFormat, T.FloatType);
movTex.minFilter = movTex.magFilter = T.NearestFilter;
movTex.generateMipmaps = false;
movTex.needsUpdate = true;
// the course's clock (the physics' clock, exactly)
export const uClock = { value: 0 };
// kind: 0 slide, 1 spin (cx, cz), 2 blink (duty, cx, cy, cz), 3 swing (pivot), 4 slow spin of a far thing
export function setMovers(list) {
    movData.fill(0);
    for (let i = 0; i < list.length && i < MAX_MOVERS - 1; i++) {
        const m = list[i], o = (i + 1) * 12;
        movData.set(m, o);
    }
    movTex.needsUpdate = true;
}

const MOVE_GLSL = `
attribute float aMi; uniform highp sampler2D uMov; uniform float uClock; varying float vWarn;
vec3 moveIt(vec3 p, inout vec3 n) {
    vWarn = 0.0;
    if (aMi < 0.5) return p;
    int i = int(aMi + 0.5);
    vec4 a = texelFetch(uMov, ivec2(0, i), 0), b = texelFetch(uMov, ivec2(1, i), 0), c = texelFetch(uMov, ivec2(2, i), 0);
    float k = a.w, th = 6.2831853 * (uClock / b.x + b.y);
    if (k < 0.5) return p + a.xyz * sin(th) + vec3(c.x, 0.0, c.z) * cos(th);
    if (k < 1.5) {
        // round its own centre, about the vertical
        float cs = cos(th * b.z), sn = sin(th * b.z);
        vec2 d = p.xz - c.xz;
        n = vec3(n.x * cs + n.z * sn, n.y, -n.x * sn + n.z * cs);
        return vec3(c.x + d.x * cs + d.y * sn, p.y, c.z - d.x * sn + d.y * cs);
    }
    if (k < 2.5) {
        // there for part of its cycle, flashing just before it goes
        float f = fract(uClock / b.x + b.y);
        if (f >= b.z) return c.xyz;
        vWarn = smoothstep(b.z - 0.22, b.z - 0.02, f) * (0.5 + 0.5 * sin(f * 90.0));
        return p;
    }
    // swinging from its pivot, across the way
    float ang = a.x * sin(th), cs = cos(ang), sn = sin(ang);
    vec3 d = p - c.xyz;
    vec2 axis = vec2(a.y, a.z);
    float along = dot(d.xz, axis);
    float ny = d.y * cs + along * sn, na = along * cs - d.y * sn;
    return vec3(c.x + (d.x - axis.x * along) + axis.x * na, c.y + ny, c.z + (d.z - axis.y * along) + axis.y * na);
}`;

function make(key) {
    const m = new T.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uTiles = { value: tileTexture() };
        sh.uniforms.uNow = CU.uNow;
        sh.uniforms.uMov = { value: movTex };
        sh.uniforms.uClock = uClock;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 aFx; uniform float uNow; varying vec3 vT; varying float vGlow; varying float vDecal;${MOVE_GLSL}`).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec3 movedPos = moveIt(vec3(position), objectNormal);`).replace('#include <begin_vertex>', `#include <begin_vertex>
vT = vec3(uv, aFx.x); vGlow = aFx.y > 0.5 && aFx.y < 1.5 ? 1.0 : 0.0; vDecal = aFx.y > 1.5 && aFx.y < 2.5 ? 1.0 : 0.0;
if (aFx.y >= 9.5) vT.y -= uNow * (aFx.y - 10.0) * 0.25;
transformed = movedPos;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform highp sampler2DArray uTiles; varying vec3 vT; varying float vGlow; varying float vWarn; varying float vDecal;`).replace('#include <color_fragment>', `#include <color_fragment>
vec4 txl = texture(uTiles, vT);
diffuseColor.rgb = vDecal > 0.5 ? mix(diffuseColor.rgb, txl.rgb, txl.a) : diffuseColor.rgb * txl.rgb;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.75), vWarn * 0.75);`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * (vGlow + (1.0 - vGlow) * 0.3);
diffuseColor.rgb *= 1.0 - vGlow;`);
    };
    m.customProgramCacheKey = () => key;
    return m;
}
// one material a kind of mesh: going from one kind to another between draws, three.js works a material's shader out afresh every frame, only to land on the same programs
const mats = {};
export const tileMat = (kind = 'plain') => mats[kind] || (mats[kind] = make('sky-tile'));
// the shadows of what moves move too
let depth = null;
export function depthMat() {
    if (depth) return depth;
    depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
        sh.uniforms.uMov = { value: movTex };
        sh.uniforms.uClock = uClock;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
${MOVE_GLSL.replace('varying float vWarn;', 'float vWarn;')}`).replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec3 nn = vec3(0.0, 1.0, 0.0); transformed = moveIt(transformed, nn); }`);
    };
    depth.customProgramCacheKey = () => 'sky-depth';
    return depth;
}
// the course's far picture: its stages drawn in detail near you are left out, here in the vertex shader, with no buffer touched. Their ranges are in uHole
export const holes = [new T.Vector2(-1, -1), new T.Vector2(-1, -1), new T.Vector2(-1, -1), new T.Vector2(-1, -1)];
let farM = null;
export function farMat() {
    if (farM) return farM;
    farM = new T.MeshLambertMaterial({ vertexColors: true });
    farM.onBeforeCompile = (sh) => {
        sh.uniforms.uHole = { value: holes };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aChunk; uniform vec2 uHole[4];`).replace('#include <project_vertex>', `#include <project_vertex>
for (int i = 0; i < 4; i++) if (aChunk >= uHole[i].x && aChunk <= uHole[i].y) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * 0.3;`);
    };
    farM.customProgramCacheKey = () => 'sky-far';
    return farM;
}
