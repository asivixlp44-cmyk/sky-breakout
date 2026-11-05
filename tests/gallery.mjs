// Pictures along the long run: one from the air over the first stage of each obstacle, and from behind you on it.
// node gallery.mjs [from-stage] [to-stage]; OUT_DIR says where they go.
import { startServer, startVite, launch, open, shot, sleep, stopAll, OUT, qa } from './lib.mjs';
const a = +process.argv[2] || 0, z = +process.argv[3] || 134, by = +process.argv[4] || 1, q = process.env.Q || 'high';
await startServer(2933, { QA: '1' });
await startVite();
const b = await launch();
const p = await open(b, 'http://localhost:5495/', { w: 960, h: 540, q, uid: 'gal' + Date.now() });
await sleep(1200);
await qa(p, () => { window.__qa.close(); window.__qa.hud(false); });
for (let s = a; s <= z; s += by) {
    await qa(p, (i) => {
        const Q = window.__qa, W = Q.world();
        Q.close(); Q.toStage(i); Q.world2(W.cps[i].world);
        // from high behind the checkpoint, looking on along the stage
        Q.look(W.cps[i].ry + Math.PI, 0.55, 34);
    }, s);
    await sleep(900);
    await qa(p, () => window.__qa.close());
    await sleep(250);
    await shot(p, 'gal-' + String(s + 1).padStart(2, '0'));
}
console.log('errors', JSON.stringify(p.errors.slice(0, 6)), OUT);
await b.close();
stopAll();
process.exit(0);
