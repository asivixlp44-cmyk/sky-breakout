// The two store covers (1920x1080, 800x800), rendered from the game itself at High: a runner mid-leap on the course, the rest of it climbing away over
// the lagoon behind them, with the title over it in the game's own lettering. Run: node tests/covers.mjs [stage]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, ROOT } from './lib.mjs';

const STAGE = +(process.argv[2] ?? 6);
await startServer(2933, { QA: '1' });
await startVite();
const browser = await launch();
const dir = path.join(ROOT, 'covers');
fs.mkdirSync(dir, { recursive: true });
const TITLE = (big) => `<div id="ctitle" style="position:fixed;left:0;right:0;top:${big ? '3.5%' : '4.5%'};z-index:99;text-align:center;font-family:'Luckiest Guy',sans-serif;line-height:.92;color:#fff;letter-spacing:.02em;text-shadow:0 .09em 0 #0c2a5e,.05em 0 0 #0c2a5e,-.05em 0 0 #0c2a5e,0 -.05em 0 #0c2a5e,.05em .05em 0 #0c2a5e,-.05em .05em 0 #0c2a5e,.05em -.05em 0 #0c2a5e,-.05em -.05em 0 #0c2a5e,0 0 .5em rgba(255,226,74,.7);font-size:${big ? '184px' : '122px'}">SKY <span style="color:#ffd22a">BREAKOUT</span></div>`;
const HIDE = () => { window.__qa.hud(false); for (const s of ['#hud', '#toasts', '#bigText', '#popup', '#lvlUp', '#card', '#count', '#touch', '#raceHud', '#flyLayer']) { const e = document.querySelector(s); if (e) e.style.display = 'none'; } };
// behind and a little to one side of the runner, low, looking on up the course
const photo = (page, o) => qa(page, (o) => {
    const q = window.__qa;
    q.P.photo = (cam) => {
        const b = q.P.b, ry = q.world().facing(q.P.cp), fx = Math.sin(ry), fz = Math.cos(ry), rx = fz, rz = -fx;
        cam.position.set(b.x - fx * o.back + rx * o.side, b.y + o.h, b.z - fz * o.back + rz * o.side);
        cam.lookAt(b.x + fx * o.ahead - rx * o.side * 0.2, b.y + o.lh, b.z + fz * o.ahead - rz * o.side * 0.2);
        if (cam.fov !== o.fov) { cam.fov = o.fov; cam.updateProjectionMatrix(); }
    };
}, o);
try {
    for (const [w, h, name, cam] of [
        [1920, 1080, 'cover-1920x1080.png', { back: 12, side: 7, h: 4.2, ahead: 30, lh: 6, fov: 60 }],
        [800, 800, 'cover-800x800.png', { back: 12, side: 5, h: 4.4, ahead: 30, lh: 8, fov: 68 }],
    ]) {
        const page = await open(browser, 'http://localhost:5495/', { w, h, dpr: 1, q: 'high', uid: 'cover' + w + Date.now() });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.give({ coins: 90000, lv: 20, stars: 10 }); window.__qa.send('trail', { id: 'rainbow' }); window.__qa.hatch('beach', 3); });
        await sleep(1800);
        await qa(page, () => { window.__qa.close(); window.__qa.send('equipbest', {}); });
        await sleep(2500);
        await qa(page, HIDE);
        await qa(page, (s) => { const q = window.__qa; q.close(); q.P.pilot = null; q.toStage(s); }, STAGE);
        await sleep(800);
        await qa(page, () => { window.__qa.close(); window.__qa.auto(); });
        await photo(page, cam);
        await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); }, TITLE(w > 1000));
        // in the air, on the way up
        await sleep(1200);
        await page.waitForFunction(() => { const b = window.__qa.P.b; return !b.onGround && b.vy > 2; }, { timeout: 15000, polling: 16 }).catch(() => {});
        await page.screenshot({ path: path.join(dir, name), type: 'png' });
        console.log('wrote', name, page.errors);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
