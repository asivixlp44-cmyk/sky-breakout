import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, updateSky, SUN_DIRECTION, GPU_NAME, setMood, updateEffects, billboard, prompts, moodFog,
} from './engine.js';
import { S, actions, net, prof } from './state.js';
import { CU, setEpoch, rel } from './clock.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, setVolume, audioSuspended, setMusicMode, setMusicIntensity, toggleMusic, playAsmr, prerenderMusic, allowLiveMusic } from './audio.js';
import { buildAsmr } from './asmr.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar } from './avatar.js';
import { pad, pollGamepad } from './gamepad.js';
import * as FX from './fx.js';
import { render, updateFx, setQuality, getQuality, autoQualityAllowed, shadowDue, setResScale, getResScale, fxWarmGroup, fxShowAll, updateAmbient, setSpeedLines, confetti, screenConfetti } from './fx.js';
import { buildCourseView, seaU } from './world.js';
import { tileTexture, uClock } from './surfaces.js';
import { hubDecorate } from './hub.js';
import { installIcons } from './icons.js';
import * as SH from './shadows.js';
import { beginCrowd, endCrowd, crowdWarm } from './crowd.js';
import { Char, pumpAvatars, avatarsPending } from './chars.js';
import { Track, pingSend, onPong, pingEvery } from './smooth.js';
import {
    toast, bigText, popup, notEnough, animateCounters, bump, updateHud, openPanel, panelIs, refreshPanels, closeTop, anyPopup, codeResult, warmPanels, levelUp, measureHud, flyCoins,
    showHatch, hatchOpen, closeHatch, countText, showCard, hideCard, raceReset, raceDot, raceInfo, showResults, closeResults, playersList, showBalloon, closeBalloon, showBreakout,
} from './ui.js';
import { CFG, TASKS, WORLDS, STAGES, petById, dailyStatus, clamp, xpNeed, walkOf, powerOf, hasDouble, hasMoon, hasCarpet, stormS, clockMs, clock, worldOfStage, skipCost } from '../../shared/config.js';
import { newBody, stepBody, EV } from '../../shared/physics.js';
import { mainCourse, raceCourse, courseClock, HUB, HUB_R, TAU } from '../../shared/course.js';
import { newPilot, pilotStep, resetPilot } from '../../shared/pilot.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => new Promise((r) => setTimeout(r, 0));
const RND = Math.random;
const lerpA = (a, b2, k) => { let d = (b2 - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

// =====================================================================================
// What's on screen: the long run, or a race's course
// =====================================================================================
let view = null, world = null, mainView = null, raceView = null, raceKey = '', hubBits = null, switching = false, worldNow = -1;
function buildMainView() {
    const low = getQuality() === 'low', G = mainCourse();
    hubBits = hubDecorate({ course: G, low, open: (k, t) => openPanel(k, t), rush: () => startQueue(), onHub: () => !match });
    mainView = buildCourseView(G, { low, decorate: hubBits.decorate, extras: hubBits.extras });
    hubBits.after(mainView.group, camera);
    view = mainView; world = G;
    scene.add(mainView.group);
    view.activate();
    applyWorld(0, true);
}
// a race's course: one at a time, kept in case the next race is on the same one
function raceViewFor(w, tier) {
    const key = w + '.' + tier;
    if (raceKey === key && raceView) return raceView;
    if (raceView) raceView.dispose();
    raceKey = key;
    raceView = buildCourseView(raceCourse(w, tier), { low: getQuality() === 'low' });
    return raceView;
}
function showView(v) {
    if (view === v) return;
    if (view) { view.group.visible = false; if (view.group.parent) scene.remove(view.group); }
    view = v; world = v.c;
    scene.add(v.group);
    v.group.visible = true;
    v.activate();
}
// each world has its sky and sea
const SEA = { bay: [0x18b4e8, 0x6ae4f4], candy: [0xf48ac8, 0xffc4e4], neon: [0x1c1068, 0x5a2ac0], gear: [0x2a8ab0, 0xe8b888], frost: [0x2a5a9a, 0x8ac0e8], crown: [0xc85a4a, 0xffb86a], ruins: [0x1a8a6a, 0x5ae0a0], magma: [0xc8380a, 0xffa020], orbit: [0x060824, 0x2a1a6a] };
const seaWantA = new T.Color(0x18b4e8), seaWantS = new T.Color(0x6ae4f4), seaWantH = new T.Color(0xc8ecff);
let seaK = 1;
function applyWorld(w, now) {
    if (w === worldNow) return;
    worldNow = w;
    const id = WORLDS[w].id, s = SEA[id];
    setMood(id, now);
    seaWantA.set(s[0]); seaWantS.set(s[1]); seaWantH.copy(moodFog(id));
    seaK = now ? 1 : 0;
    if (now) { seaU.uA.value.copy(seaWantA); seaU.uS.value.copy(seaWantS); seaU.uH.value.copy(seaWantH); }
    ambNow = AMB[id] || AMB.bay;
}
function updateSea(dt) {
    if (seaK >= 1) return;
    seaK = Math.min(1, seaK + dt * 0.9);
    const k = seaK >= 1 ? 1 : Math.min(1, dt * 3);
    seaU.uA.value.lerp(seaWantA, k); seaU.uS.value.lerp(seaWantS, k); seaU.uH.value.lerp(seaWantH, k);
}

// =====================================================================================
// You: the shared physics (shared/physics.js) on your screen, every frame
// =====================================================================================
const P = {
    b: newBody(HUB.spawn.x, 0, HUB.spawn.z), facing: 0, moving: false,
    jumpPress: -9, lastJump: -9, minVy: 0, stride: 0, lastStride: 0, auto: null, pilot: null, frozen: false, snaps: 0, groundY: 0, cp: -1, finished: false, out: false, hits: 0, respawns: 0,
    bestS: 0, knocked: false, climbT0: 0, climbEnd: 0, moonOn: false,
};
let me = null, localAvatarReq = 0, match = null, queued = false;
function buildMe() {
    if (me) me.dispose();
    me = new Char({ name: S.name, lv: S.lv, wins: S.laps, noLabel: true });
    setupLocalAvatar();
}
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !me) { a.dispose(); return; }
    me.wear(a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (me && me.blox && av) { me.blox.setProportions(av.proportions); me.blox.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
function teleport(x, y, z, yaw) {
    const b = P.b;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.ex = b.ez = 0; b.onGround = false; b.ground = null; b.fromY = y; b.knockT = 0;
    camSnap = true;
    if (view) view.prepareAt(x, y, z);
    if (yaw !== undefined) { P.facing = yaw; cam.yaw = yaw + Math.PI; }
    if (me && me.trail) me.trail.reset();
    sendMove(true);
}
const courseTime = () => courseClock(net.now());
function panOf(x, z) {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    return clamp((dx * rx + dz * rz) / 40, -0.8, 0.8);
}
// what the ground under you sounds like
const SOUND = { bay: 'wood', candy: 'grass', neon: 'stone', gear: 'stone', frost: 'snow', crown: 'stone', ruins: 'stone', magma: 'stone', orbit: 'stone' };
function stepSound(g) {
    if (!g) return 'grass';
    if (g.look === 'hub_ground') return P.b.x * P.b.x + P.b.z * P.b.z > (HUB_R * 0.78) ** 2 ? 'sand' : 'grass';
    if (g.ice) return 'snow';
    return SOUND[WORLDS[g.world || 0].id] || 'grass';
}
// back to your checkpoint: a fall, a trap, or you asked
function doRespawn(why) {
    if (P.out || P.finished || switching) return;
    const c = world, b = P.b;
    if (why === 'fall') { playAsmr('splash', 0.3, 1.5); FX.poofFx(b); } else if (why === 'trap') { playAsmr('sizzle', 0.6, 1.1); FX.poofFx(b); } else sfx('whoosh');
    P.respawns++;
    net.send('respawn', {});
    if (match && match.phase0) { const sp = c.startSpot(match.spot); teleport(sp.x, sp.y, sp.z, sp.ry); return; }
    const sp = P.cp >= 0 || !c.main ? c.respawnOf(P.cp) : { x: HUB.spawn.x, y: 0.2, z: HUB.spawn.z, ry: 0 };
    teleport(sp.x, sp.y, sp.z, sp.ry);
    b.safeT = 1.2;
    const f = $('#fade');
    f.style.transition = 'none'; f.style.opacity = 0.75; requestAnimationFrame(() => { f.style.transition = ''; f.style.opacity = 0; });
    if (P.pilot) resetPilot(P.pilot, c.routeOf(P.cp));
    sfx('respawn');
}
const stepInp = { mx: 0, mz: 0, jump: false, hold: false, power: 60, double: false, glide: false, speed: 1, gravity: 1 };
const meSt = { x: 0, y: 0, z: 0, ry: 0, snapRy: true, air: false, moving: false, speed: 0, vy: 0, jump: false, airJump: false, knocked: false, ground: 0, sprint: false, climb: false, glide: false };
function updateMe(dt) {
    const t = clockT, b = P.b, c = world, ct = courseTime();
    c.setTime(ct, dt);
    uClock.value = ct;
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.6 * dt * camSens;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.7 * dt * camSens, -0.5, 1.3);
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * f + rx * r, mz = fz * f + rz * r;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    let hold = !!(keys.Space || touchJump || (pad.held && pad.held.has('A')));
    let pressed = t - P.jumpPress < 0.15;
    const gravity = P.moonOn && hasMoon(S) ? CFG.moonK : 1, speedK = walkOf(S) / CFG.walk;
    // the QA autopilot drives instead
    if (P.auto) {
        P.auto(dt, ct);
        const a = P.autoInp;
        mx = a.mx; mz = a.mz; hold = a.hold; pressed = a.jump;
    }
    P.frozen = anyPopup() || switching || P.out;
    if (P.frozen && !P.auto) { mx = 0; mz = 0; pressed = false; hold = false; }
    P.moving = mx * mx + mz * mz > 0.01;
    // holding JUMP keeps jumping
    if (!P.auto && hold && b.onGround && !pressed && t - P.lastJump > 0.12) pressed = true;
    stepInp.mx = mx; stepInp.mz = mz; stepInp.jump = pressed; stepInp.hold = hold; stepInp.power = powerOf(S); stepInp.double = hasDouble(S); stepInp.glide = hasCarpet(S); stepInp.speed = speedK; stepInp.gravity = gravity;
    if (!b.onGround) P.minVy = Math.min(P.minVy, b.vy);
    const ev = P.out ? 0 : stepBody(b, stepInp, dt, c);
    // the line before GO
    if (match && match.phase0 && c.barrierZ !== undefined && b.z > c.start.z + c.barrierZ - 1.4) { b.z = c.start.z + c.barrierZ - 1.4; if (b.vz > 0) b.vz = 0; }
    if (ev === EV.JUMP) {
        P.jumpPress = -9; P.lastJump = t;
        me.stretch(0.6);
        playAsmr('jump', 0.32, 1 + RND() * 0.1);
        P.minVy = 0;
        fovKick = 2.2;
    } else if (ev === EV.AIRJUMP) {
        P.jumpPress = -9;
        playAsmr('jump2', 0.34, 1.1 + RND() * 0.1);
        FX.ring(FX.tmpV.set(b.x, b.y + 0.4, b.z), 0xffffff, 5, 0.35);
        me.stretch(0.5);
        P.minVy = 0;
        fovKick = 3;
    } else if (ev === EV.BOUNCE) {
        me.stretch(1);
        playAsmr('jump2', 0.5, 0.75);
        FX.ring(FX.tmpV.set(b.x, b.y + 0.4, b.z), 0xfff06a, 7, 0.4);
        fovKick = 5;
        P.minVy = 0;
    } else if (ev === EV.KNOCK) {
        P.hits++;
        me.squash(0.8);
        playAsmr('land', 0.8, 0.7);
        shake = Math.max(shake, 0.32);
        FX.popSpark(FX.tmpV.set(b.x, b.y + 2.5, b.z), 0xffe24a);
        P.minVy = 0;
    } else if (ev === EV.LAND) {
        const k = clamp(-P.minVy / 60, 0.2, 1.4);
        me.squash(k);
        playAsmr('land', 0.26 + k * 0.3, 1 + RND() * 0.1);
        playAsmr(stepSound(b.ground), 0.6, 0.85);
        if (k > 0.55) { FX.dust(FX.tmpV.set(b.x, b.y + 0.2, b.z), 8, k, DUST); shake = Math.max(shake, 0.08 * k); }
        if (k > 1.05 && P.moving && Math.hypot(b.vx, b.vz) > 12) me.roll();
        P.minVy = 0;
    } else if (ev === EV.LETHAL) { doRespawn(b.y < c.seaY || b.y < b.fromY - CFG.fallKill ? 'fall' : 'trap'); return; }
    P.knocked = b.knockT > 0;
    if (P.moving) P.facing = lerpA(P.facing, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
    // footsteps, a little dust at a run; rungs on a ladder
    if (P.moving && (b.onGround || b.climb)) {
        P.stride += dt * speedK * CFG.walk / 7.4;
        if (Math.floor(P.stride) !== P.lastStride) {
            P.lastStride = Math.floor(P.stride);
            playAsmr(b.climb ? 'wood' : stepSound(b.ground), 0.42, 0.96 + RND() * 0.1);
            if (!b.climb && getQuality() !== 'low') FX.dust(FX.tmpV.set(b.x, b.y + 0.15, b.z), 1, 0.25, DUST);
        }
    }
    if (me) {
        meSt.x = b.x; meSt.y = b.y; meSt.z = b.z; meSt.ry = P.facing; meSt.air = !b.onGround && !b.climb; meSt.moving = (P.moving && b.onGround) || (b.climb && b.vy > 0); meSt.speed = b.climb ? 9 : Math.hypot(b.vx, b.vz); meSt.vy = b.vy;
        meSt.jump = ev === EV.JUMP; meSt.airJump = ev === EV.AIRJUMP; meSt.knocked = P.knocked; meSt.ground = b.y; meSt.climb = b.climb; meSt.glide = b.glide;
        me.update(dt, t, meSt);
    }
    sendMove(false);
}
const DUST = 0xd8c8a0;
// ----- the guide: chevrons on the ground, flowing from you to what to do next -----
const GUIDE_N = 12;
let guide = null, guideOn = false;
const guideM = new T.Matrix4(), guideQ = new T.Quaternion(), guideV = new V3(), guideS = new V3(1, 1, 1), guideUp = new V3(0, 1, 0);
function guideMesh() {
    const s = new T.Shape();
    s.moveTo(-2.2, -1); s.lineTo(0, 0.8); s.lineTo(2.2, -1); s.lineTo(2.2, 0.2); s.lineTo(0, 2); s.lineTo(-2.2, 0.2); s.closePath();
    const g = new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }), GUIDE_N);
    m.frustumCulled = false; m.renderOrder = 2; m.count = 0;
    scene.add(m);
    return m;
}
function guideTarget() {
    if (match || P.b.y > 4 || queued || !world || !world.main || P.b.z > HUB.gate.z) return null;
    return { x: HUB.gate.x, z: HUB.gate.z };
}
function updateGuide(t) {
    if (!guide) guide = guideMesh();
    const b = P.b;
    const g = !switching && !anyPopup() ? guideTarget() : null;
    if (!g) { if (guideOn) { guideOn = false; guide.count = 0; guide.visible = false; } return; }
    const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz);
    if (d < 7) { guide.count = 0; guide.visible = false; guideOn = false; return; }
    guideOn = true; guide.visible = true;
    const ux = dx / d, uz = dz / d, gap = 6, off = (t * 11) % gap;
    guideQ.setFromAxisAngle(guideUp, Math.atan2(ux, uz) + Math.PI);
    let n = 0;
    for (let i = 0; i < GUIDE_N; i++) {
        const s = 3 + i * gap + off;
        if (s > d - 2) break;
        const fade = Math.min(1, (d - 2 - s) / 3) * Math.min(1, (s - 1) / 2);
        guide.setMatrixAt(n++, guideM.compose(guideV.set(b.x + ux * s, 0.48, b.z + uz * s), guideQ, guideS.setScalar(Math.max(0.05, fade))));
    }
    guide.count = n;
    guide.instanceMatrix.needsUpdate = true;
}

// =====================================================================================
// The camera: close behind you (drag to turn, wheel / pinch to zoom); as you run it eases round to look along the way on
// =====================================================================================
const cam = { yaw: Math.PI, pitch: 0.3, dist: isTouch ? 15 : 14 };
let camD = 17, camSens = 1, camSnap = true, shake = 0, fovKick = 0, camFollow = storageGet('sb1_camfollow') !== '0', dragAt = -9;
actions.camFollow = () => camFollow;
actions.toggleCam = () => { camFollow = !camFollow; storageSet('sb1_camfollow', camFollow ? '1' : '0'); };
const dirV = new V3(), pivotV = new V3(), backV = new V3(), camPos = new V3(), lookV = new V3();
let pivotY = 5;
function lookDir(out) { const p = cam.pitch, cp = Math.cos(p); return out.set(-Math.sin(cam.yaw) * cp, -Math.sin(p), -Math.cos(cam.yaw) * cp); }
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 200);
}
// how far back the camera can go before something solid is in the way
function rayHit(o, d, maxT) {
    const c = world;
    for (let s = 3; s < maxT; s += 2) if (c.solidAt(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s)) return s - 1.4;
    return maxT;
}
function updateCamera(dt) {
    const b = P.b, portrait = innerWidth < innerHeight, c = world;
    // running along: when you're not steering the view yourself it eases round to look the way the course goes
    if (camFollow && clockT - dragAt > 1.4 && P.moving && !P.knocked && !b.climb && !anyPopup() && (P.cp >= 0 || !c.main) && !P.autoCam) {
        const want = c.facing(P.cp) + Math.PI;
        let dy = (want - cam.yaw) % TAU; if (dy > Math.PI) dy -= TAU; if (dy < -Math.PI) dy += TAU;
        if (Math.abs(dy) < 2.6) cam.yaw += dy * (1 - Math.exp(-dt * 1.5));
    }
    lookDir(dirV);
    const gy = b.y + 4.3;
    if (camSnap || (pivotV.x - b.x) ** 2 + (pivotV.z - b.z) ** 2 > 900) { pivotV.set(b.x, gy, b.z); pivotY = gy; camSnap = false; }
    else {
        const kx = 1 - Math.exp(-dt * 16);
        pivotV.x += (b.x - pivotV.x) * kx; pivotV.z += (b.z - pivotV.z) * kx;
        pivotY += (gy - pivotY) * (1 - Math.exp(-dt * (b.onGround ? 10 : 6)));
        pivotV.y = pivotY;
    }
    backV.copy(dirV).negate();
    if (b.onGround) P.groundY = b.y;
    let lim = cam.dist + (portrait ? 3 : 0) + Math.min(6, Math.max(0, b.y - P.groundY) * 0.08);
    lim = Math.min(lim, rayHit(pivotV, backV, lim + 1) - 0.8);
    lim = Math.max(2, lim);
    camD = lim < camD ? lim : camD + (lim - camD) * (1 - Math.exp(-dt * 4));
    camPos.copy(pivotV).addScaledVector(backV, camD);
    // never under the island
    if (c.main && camPos.y < 0.9 && camPos.x * camPos.x + camPos.z * camPos.z < HUB_R * HUB_R) camPos.y = 0.9;
    camera.position.copy(camPos);
    lookV.copy(camPos).addScaledVector(dirV, 30);
    camera.lookAt(lookV);
    if (shake > 0.001) { const s = shake * shake * 0.8; camera.position.x += (RND() * 2 - 1) * s; camera.position.y += (RND() * 2 - 1) * s; shake = Math.max(0, shake - dt * 2.4); }
    // every takeoff widens the view a touch, easing back
    fovKick = Math.max(0, fovKick - dt * 9);
    const want = (portrait ? 84 : 70) + fovKick;
    if (Math.abs(camera.fov - want) > 0.01) { camera.fov += (want - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
    if (P.photo) P.photo(camera); // the covers' camera (tests/covers.mjs)
    camera.updateMatrixWorld();
    if (me) me.root.visible = camD > 2.2 && !P.out;
}

// =====================================================================================
// Input
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0 };
let running = false, touchJump = false;
actions.onPanel = () => { for (const k in keys) keys[k] = false; touchJump = false; };
function toggleMoon() {
    if (!hasMoon(S)) { openPanel('gear'); return; }
    P.moonOn = !P.moonOn;
    $('#pwMoon').classList.toggle('on', P.moonOn);
    toast(P.moonOn ? '🪶 Feather Fall on' : 'Feather Fall off', '#c8d0ff');
}
actions.toggleMoon = toggleMoon;
function actPress() { if (hasMoon(S)) toggleMoon(); }
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running) return;
    if (e.code === 'Escape' && !e.repeat) { if (closeTop()) return; if (BX.isEmbedded()) BX.showPortalMenu(); else openPanel('settings'); return; }
    keys[e.code] = true;
    if (e.repeat || anyPopup()) return;
    if (e.code === 'Space') P.jumpPress = clockT;
    if (e.code === 'KeyE') { if (activePrompt) usePrompt(); }
    if (e.code === 'KeyX') toggleMoon();
    if (e.code === 'KeyR') backToCheckpoint();
    if (e.code === 'KeyQ') openPanel('quests');
    if (e.code === 'KeyP') openPanel('eggs');
    if (e.code === 'KeyU') openPanel('gear');
    if (e.code === 'Enter' && !match) { if (queued) cancelQueue(); else startQueue(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touchJump = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const drags = new Map();
let pinchD = 0;
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, at: performance.now() });
    if (drags.size === 2) { const [a, b] = [...drags.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
    if (drags.size === 2) {
        const [a, b] = [...drags.values()], nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.dist = clamp(cam.dist * pinchD / Math.max(20, nd), 5, 44);
        pinchD = nd;
    } else if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        cam.yaw -= (e.clientX - d.x) * k;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.5, 1.3);
        dragAt = clockT;
    }
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => { drags.delete(e.pointerId); if (drags.size < 2) pinchD = 0; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 5, 44); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null, rect = null;
    const set = (e) => {
        const r = rect;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; rect = stick.getBoundingClientRect(); stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn'), ab = $('#actBtn');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); P.jumpPress = clockT; touchJump = true; jb.classList.add('on'); });
    const jEnd = () => { touchJump = false; jb.classList.remove('on'); };
    jb.addEventListener('pointerup', jEnd); jb.addEventListener('pointercancel', jEnd);
    ab.addEventListener('pointerdown', (e) => { e.preventDefault(); ab.setPointerCapture(e.pointerId); ab.classList.add('on'); actPress(); });
    const aEnd = () => { ab.classList.remove('on'); };
    ab.addEventListener('pointerup', aEnd); ab.addEventListener('pointercancel', aEnd);
})();

// ----- proximity prompts (the stalls, the portal) -----
let activePrompt = null;
const pv = new V3();
function updatePrompt() {
    let best = null, bd = 1e9;
    const b = P.b;
    if (!anyPopup() && b.y < 6 && !match && world && world.main) for (const p of prompts) { if (p.on && !p.on()) continue; const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z); if (d < p.r && d < bd) { bd = d; best = p; } }
    activePrompt = best;
    const el = $('#promptBtn');
    if (!best) { if (!el.hidden) el.hidden = true; return; }
    pv.copy(best.pos).setY(best.pos.y + 6).project(camera);
    if (pv.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    const lbl = best.label();
    if ($('#promptTxt').textContent !== lbl) $('#promptTxt').textContent = lbl;
    el.style.transform = `translate(${((pv.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - pv.y) / 2 * innerHeight).toFixed(0)}px) translate(-50%, -110%)`;
}
function usePrompt() { if (activePrompt) { sfx('click'); activePrompt.act(); } }
$('#promptBtn').addEventListener('click', usePrompt);

// ----- controller -----
function padButtons() {
    if (!pad.connected || !running) return;
    if (pad.pressed.has('BACK') || pad.pressed.has('START')) { if (!closeTop()) openPanel('settings'); return; }
    if (anyPopup()) { if (pad.pressed.has('B')) closeTop(); return; }
    if (pad.pressed.has('A')) P.jumpPress = clockT;
    if (pad.pressed.has('X')) { if (activePrompt) usePrompt(); else actPress(); }
    if (pad.pressed.has('Y')) openPanel('quests');
    if (pad.pressed.has('LB')) openPanel('eggs');
    if (pad.pressed.has('RB')) openPanel('gear');
}

// =====================================================================================
// Everyone else you can see (smoothed on the server's clock)
// =====================================================================================
const remotes = new Map(), byPid = new Map();
const smp = { x: 0, y: 0, z: 0, ry: 0, a: 0, speed: 0 };
class Remote {
    constructor(p, id) {
        this.id = id; this.p = p; this.pid = p.pid;
        this.char = new Char({ name: p.name, lv: p.lv, wins: p.wins });
        this.char.setAvatar(p.av);
        this.char.setVisible(false);
        this.av = p.av; this.track = new Track(); this.air = false; this.prevY = 0; this.vy = 0; this.minVy = 0; this.seen = false; this.px = 0; this.pz = 0;
    }
    update(dt, t, now) {
        const p = this.p;
        if (switching || !this.track.sample(now - this.track.delayFor(dt), smp, dt)) { this.char.setVisible(false); return; }
        const climb = smp.a === 4, knocked = smp.a === 3, air = smp.a === 2 || knocked, vy = dt > 0 ? (smp.y - this.prevY) / dt : 0;
        this.vy += (vy - this.vy) * Math.min(1, dt * 12);
        if (air) this.minVy = Math.min(this.minVy, this.vy);
        if (this.air && !air) { this.char.squash(clamp(-this.minVy / 60, 0.2, 1)); this.minVy = 0; landAt(smp.x, smp.y, smp.z); }
        if (!this.air && air && this.vy > 3) this.char.stretch(0.5);
        this.air = air; this.prevY = smp.y;
        if (p.av !== this.av) { this.av = p.av; this.char.setAvatar(p.av); }
        // right by the camera a passing racer would fill the screen: not drawn until they're a step away
        const d2 = camera.position.distanceToSquared(FX.tmpV.set(smp.x, smp.y, smp.z)), near = d2 < 260 * 260 && d2 > (this.char.shown ? 64 : 100) && p.st !== 2;
        this.char.setVisible(near);
        this.x = smp.x; this.y = smp.y; this.z = smp.z;
        if (near) {
            const far = d2 > 110 * 110;
            if (!far) { this.char.setLabel(p.name, p.lv, p.wins); this.char.setTeam(p.team); this.char.setTrail(p.trail); }
            this.char.update(dt, t, { x: smp.x, y: smp.y, z: smp.z, ry: smp.ry, air, moving: smp.a === 1 || climb || smp.speed > 2, speed: climb ? 9 : smp.speed, vy: this.vy, far, knocked, ground: smp.y, climb });
        }
    }
    dispose() { this.char.dispose(); byPid.delete(this.pid); }
}
function landAt(x, y, z) {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    if (d < 70) playAsmr('land', 0.22 * (1 - d / 70), 1, panOf(x, z));
}
// who you can see: everyone on the long run, or in your race (a few times a second)
let rosterT = 0;
const seenIds = new Set();
function updateRoster() {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    const ctx = match ? match.id : '';
    seenIds.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            if (S.name !== p.name) { S.name = p.name; if (me) me.setLabel(S.name, S.lv, S.laps); }
            P.pid = p.pid; P.pub = p;
            return;
        }
        if (p.ctx !== ctx) return;
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) { r = new Remote(p, id); remotes.set(id, r); byPid.set(p.pid, r); }
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
}
function onSnaps(m) {
    const l = m.l, t0 = m.t;
    for (let i = 0; i + 6 < l.length; i += 7) {
        const r = byPid.get(l[i]);
        if (r) r.track.push(t0 - l[i + 6], l[i + 1] / 20, l[i + 2] / 20, l[i + 3] / 20, l[i + 4] / 100, l[i + 5]);
    }
}
function updateRemotes(dt, t) {
    rosterT -= dt;
    if (rosterT <= 0) { rosterT = 0.25; updateRoster(); }
    const now = net.now();
    for (const r of remotes.values()) r.update(dt, t, now);
}

// =====================================================================================
// The queue and the race
// =====================================================================================
function startQueue() {
    if (match || queued || switching) return;
    net.send('queue', { on: true, world: qaWorld });
    setQueued(true);
}
let qaWorld;
function cancelQueue() { net.send('queue', { on: false }); setQueued(false); }
function setQueued(on) {
    queued = on;
    document.body.classList.toggle('queued', on);
    const d = $('#queueDots');
    if (on && !d.children.length) d.innerHTML = '<i></i>'.repeat(CFG.racers);
    queueShown = '';
    updateQueue();
}
let queueShown = '', dismissed = 0;
function updateQueue() {
    if (!net.room || !net.room.state) return;
    const st = net.room.state, end = st.queueEnd || 0, leftMs = end - net.now(), open = !match && !switching && (queued || (leftMs > 0 && dismissed !== end)), box = $('#queueBox');
    if (box.hidden === open) box.hidden = !open;
    if (!open) return;
    const n = clamp(st.queueN || (queued ? 1 : 0), 0, CFG.racers), left = Math.max(0, Math.ceil(leftMs / 1000));
    const key = n + '|' + left + '|' + queued;
    if (key === queueShown) return;
    queueShown = key;
    const dots = $('#queueDots').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < n);
    $('#queueLeft').textContent = left > 0 ? 'Starts in ' + clock(left) : 'Here we go!';
    $('#queueTxt').textContent = queued ? n + ' / ' + CFG.racers + ' racers found' : 'Your stage is saved. Race for Coins!';
    $('#bQueueJoin').textContent = queued ? 'Joined ✓ (' + n + ')' : 'Join (' + n + ')';
    $('#bQueueOff').textContent = queued ? 'Leave' : 'Dismiss';
}
async function enterRace(m) {
    switching = true;
    setQueued(false);
    closeTop(); closeTop();
    closeBalloon();
    holdFpsWatch(4);
    await fadeOut();
    try {
        const v = raceViewFor(m.world, m.tier);
        showView(v);
        const c = v.c;
        match = { ...m, c, phase0: true, lastCount: 99, place: m.spot + 1 };
        P.cp = -1; P.finished = false; P.out = false; P.bestS = 0;
        v.setBarrier(true);
        v.padsFrom(0);
        const sp = c.startSpot(m.spot);
        c.setTime(courseTime(), 0.016);
        applyWorld(m.world, true);
        teleport(sp.x, sp.y, sp.z, sp.ry);
        document.body.classList.add('inrace');
        document.body.classList.remove('running');
        runningNow = false;
        raceReset(m.size);
        $('#bBack').hidden = true;
        for (const r of remotes.values()) r.dispose();
        remotes.clear();
        updateRoster();
        stormOn(true);
        const t0 = performance.now();
        while (avatarsPending() && performance.now() - t0 < 1400) { pumpAvatars(); await sleep(16); }
    } catch (e) { console.error('[race]', e); noteError('[race] ' + (e && e.message)); }
    switching = false;
    fadeIn();
    showCard('🌩️ ' + WORLDS[m.world].name, 'Storm Rush · ' + match.c.cps.length + ' stages', 'Stay ahead of the storm! First to the finish wins.');
    setMusicMode('climb');
    setMusicIntensity(2);
    camSnap = true;
    if (P.pilot) resetPilot(P.pilot, 0);
}
function setupAct() {
    const ab = $('#actBtn'), on = hasMoon(S);
    ab.hidden = !on;
    if (on) ab.textContent = 'FLOAT';
}
async function exitRace(m) {
    switching = true;
    closeResults();
    holdFpsWatch(4);
    await fadeOut();
    match = null;
    stormOn(false);
    document.body.classList.remove('inrace');
    hideCard();
    $('#bBack').hidden = true;
    $('#magmaEdge').style.opacity = 0;
    edgeShown = 0;
    showView(mainView);
    P.cp = (S.stage || 0) - 1; P.finished = false; P.out = false;
    view.padsFrom(S.stage || 0);
    applyWorld(worldOfStage(Math.max(0, P.cp)), true);
    teleport(m.x, m.y ?? 0.2, m.z, m.ry ?? 0);
    setupAct();
    for (const r of remotes.values()) r.dispose();
    remotes.clear();
    updateRoster();
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 800) { pumpAvatars(); await sleep(16); } }
    switching = false;
    fadeIn();
    setMusicMode(P.cp >= 0 ? 'climb' : 'plaza');
    setMusicIntensity(1);
    if (P.pilot) resetPilot(P.pilot, world.routeOf(P.cp));
    if (m.again) setQueued(true); else if (offerDaily.done !== true) setTimeout(offerDaily, 1500);
}
actions.playAgain = () => net.send('leave', { again: true });
actions.leaveRace = () => net.send('leave', {});
function backToCheckpoint() {
    if (P.finished || P.out || switching) return;
    if (!match && P.cp < 0 && P.b.y < 3 && P.b.y > -1) return;
    doRespawn('asked');
}
// ----- the storm: a towering wall of cloud and lightning rolling along the course behind you; the edge of the screen goes dark as it gets close -----
let stormMesh = null;
const stormPt = { x: 0, y: 0, z: 0, ry: 0 };
function stormOn(on) {
    if (on && !stormMesh) {
        const m = new T.ShaderMaterial({
            transparent: true, depthWrite: false, side: T.DoubleSide, fog: false,
            uniforms: { uNow: CU.uNow },
            vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `uniform float uNow; varying vec2 vU;
                float n2(vec2 p) { return sin(p.x * 3.1 + sin(p.y * 2.3 + uNow * 0.7) * 1.4) * sin(p.y * 2.7 - uNow * 0.5 + sin(p.x * 1.9) * 1.6); }
                void main() {
                    vec2 p = vU * vec2(7.0, 6.0);
                    float c = n2(p) * 0.5 + n2(p * 2.1 + 3.0) * 0.28 + n2(p * 4.3 + 7.0) * 0.14;
                    vec3 col = mix(vec3(0.10, 0.07, 0.26), vec3(0.42, 0.28, 0.72), smoothstep(-0.6, 0.7, c));
                    // lightning: now and then, a pale flash in the cloud
                    float f = step(0.93, fract(sin(floor(uNow * 3.0) * 12.9898) * 43758.5453));
                    col += f * vec3(0.55, 0.6, 1.0) * smoothstep(0.1, 0.5, c + 0.3);
                    float e = smoothstep(0.0, 0.12, vU.x) * smoothstep(1.0, 0.88, vU.x) * smoothstep(0.0, 0.1, vU.y) * smoothstep(1.0, 0.86, vU.y + c * 0.08);
                    gl_FragColor = vec4(col, 0.94 * e);
                    #include <colorspace_fragment>
                }`,
        });
        stormMesh = new T.Mesh(new T.PlaneGeometry(240, 200), m);
        stormMesh.frustumCulled = false; stormMesh.renderOrder = 5;
        scene.add(stormMesh);
    }
    if (stormMesh) stormMesh.visible = on;
}
let raceT = 0, edgeShown = 0;
function updateRace(dt) {
    const m = match, c = world, t = (net.now() - m.t0) / 1000;
    // 3, 2, 1, GO
    if (t < 0) {
        const n = Math.ceil(-t);
        if (n !== m.lastCount) {
            m.lastCount = n;
            if (n <= 3) { countText(String(n), n === 1 ? '#ff9a8a' : n === 2 ? '#ffe24a' : '#ffffff'); sfx('beep'); }
        }
    } else if (m.phase0) {
        m.phase0 = false;
        countText('GO!', '#7dff6b');
        sfx('go');
        hideCard();
        view.setBarrier(false);
        shake = Math.max(shake, 0.12);
        FX.ring(FX.tmpV.set(P.b.x, P.b.y + 0.4, P.b.z), 0x7dff6b, 8, 0.45);
    }
    const ss = stormS(Math.max(0, t), m.k);
    c.pointAt(ss, stormPt);
    stormMesh.position.set(stormPt.x, stormPt.y + 40, stormPt.z);
    stormMesh.rotation.y = stormPt.ry;
    const myS = c.sAt(P.cp, P.b.x, P.b.y, P.b.z), gap = myS - ss, k = gap < 60 ? clamp(1 - gap / 60, 0, 1) : 0, K = Math.round(k * 10) / 10;
    if (K !== edgeShown) { edgeShown = K; $('#magmaEdge').style.opacity = K; }
    raceT -= dt;
    if (raceT > 0) return;
    raceT = 0.2;
    // everyone's dot, your place, the clock
    const room = net.room, tot = c.total;
    P.bestS = Math.max(P.bestS, myS);
    let i = 0, place = m.place, alive = 0;
    if (room && room.state && room.state.players) {
        room.state.players.forEach((p) => { if (p.ctx === m.id && p.st !== 2) alive++; });
        room.state.players.forEach((p, id) => {
            if (p.ctx !== m.id) return;
            if (id === room.sessionId) { place = p.place || place; raceDot(i++, clamp(P.bestS / tot, 0, 1), true, true, p.st === 2); } else raceDot(i++, clamp(p.prog, 0, 1), false, !p.bot, p.st === 2);
        });
    }
    m.place = place;
    raceInfo(place, Math.max(0, t), alive, clamp(P.bestS / tot, 0, 1));
    if (P.pub && P.pub.st === 2 && !P.out) P.out = true;
}
// the long run: which stage, how far through it, the clock, the menu when you stop, who's here
let runT = 0, stillT = 0, ranT = 0, runningNow = false, playersT = 0, stageShown = -2, fillShown = -1;
function updateRun(dt) {
    // running: the bar and nothing else in your way; stopped: the menu
    const c = world, b = P.b, moving = P.moving || !b.onGround;
    if (moving) { ranT += dt; stillT = 0; } else { stillT += dt; ranT = 0; }
    const run = (runningNow && stillT < 0.45) || ranT > 0.3;
    if (run !== runningNow) { runningNow = run; document.body.classList.toggle('running', run); }
    runT -= dt;
    if (runT > 0) return;
    runT = 0.2;
    if (hubBits) hubBits.extras.updateLod(b.x, b.y, b.z);
    const stage = P.cp + 1;
    if (stage !== stageShown) {
        stageShown = stage;
        $('#progTxt').textContent = stage > 0 ? 'Stage ' + stage + ' / ' + STAGES : 'Home Island';
        $('#bSkip').hidden = stage <= 0 || stage >= STAGES;
        $('#skipTxt').textContent = 'Skip · ' + skipCost(stage) + ' 💎';
        $('#bHome').hidden = stage <= 0;
    }
    const f = Math.floor(clamp(c.sAt(P.cp, b.x, b.y, b.z) / c.total, 0, 1) * 1000) / 1000;
    if (f !== fillShown) { fillShown = f; $('#progFill').style.transform = 'scaleX(' + f + ')'; }
    // on the island with a run going: the quick way back to it
    const onIsland = c.main && b.y < 4 && P.cp >= 0 && Math.hypot(b.x, b.z) < HUB_R + 10;
    if ($('#bLast').hidden === onIsland) $('#bLast').hidden = !onIsland;
    if (onIsland) { const tx = 'Back to Stage ' + stage; if ($('#bLast').textContent !== tx) $('#bLast').textContent = tx; }
    if (onIsland && b.z > HUB.gate.z && !switching && !anyPopup()) net.send('warp', { to: 'last' });
    // the clock: from Stage 1, until the balloon
    const secs = P.climbT0 ? ((P.climbEnd || net.now()) - P.climbT0) / 1000 : 0, tx = clock(secs);
    if (S.climbShown !== tx) { S.climbShown = tx; $('#timerTxt').textContent = tx; }
    // the sky follows the world you're in; the island has its own
    if (c.main) applyWorld(P.cp >= 0 && !onIsland ? c.cps[P.cp].world : 0, false);
    playersT -= 0.2;
    if (playersT <= 0 && net.room && net.room.state && net.room.state.players) {
        playersT = 1;
        const rows = [];
        net.room.state.players.forEach((p, id) => { if (p.ctx === '') rows.push({ n: p.name, c: id === net.room.sessionId ? S.coins : p.coins, g: id === net.room.sessionId ? (S.bestStage || 0) : p.stage, l: p.lv, me: id === net.room.sessionId }); });
        rows.sort((a2, b2) => (b2.me ? 1 : 0) - (a2.me ? 1 : 0) || b2.g - a2.g);
        playersList(rows.slice(0, 9));
    }
}

// =====================================================================================
// HUD buttons
// =====================================================================================
// (the button lets go of the keyboard: SPACE jumps, it never presses the last button clicked again)
const bind = (sel, fn) => $(sel).addEventListener('click', (e) => { sfx('click'); e.currentTarget.blur(); fn(); });
bind('#bEggs', () => openPanel('eggs'));
bind('#bQuests', () => openPanel('quests'));
bind('#bGear', () => openPanel('gear'));
bind('#bSettings', () => openPanel('settings'));
bind('#coinBox', () => openPanel('boards'));
bind('#gemsBox', () => openPanel('boards'));
bind('#starBox', () => openPanel('eggs', 'trails'));
bind('#bMusic', () => toggleMusic());
bind('#bPlay', () => startQueue());
bind('#bQueueJoin', () => { if (queued) return; startQueue(); });
bind('#bQueueOff', () => { if (queued) cancelQueue(); else { dismissed = net.room.state.queueEnd; updateQueue(); } });
bind('#pwDouble', () => { if (!hasDouble(S)) openPanel('gear'); else toast('Press JUMP again in the air', '#7dff6b'); });
bind('#pwMoon', () => toggleMoon());
bind('#pwCarpet', () => { if (!hasCarpet(S)) openPanel('gear'); else toast('Hold JUMP in the air to glide', '#ffb0e8'); });
bind('#bPlayersX', () => { $('#players').classList.remove('open'); $('#players').hidden = true; $('#bPlayersShow').hidden = false; });
bind('#bPlayersShow', () => { $('#players').hidden = false; $('#players').classList.add('open'); $('#bPlayersShow').hidden = true; });
if (innerWidth < innerHeight) { $('#bPlayersShow').hidden = false; $('#players').hidden = true; }
bind('#bBack', () => backToCheckpoint());
bind('#bLeave', () => net.send('leave', {}));
bind('#bSkip', () => { if (!match && P.cp + 1 < STAGES) net.send('skip', {}); });
bind('#bHome', () => { if (!match) net.send('warp', { to: 'home' }); });
bind('#bLast', () => { if (!match) net.send('warp', { to: 'last' }); });
function fadeOut() { $('#fade').style.opacity = 1; return sleep(260); }
function fadeIn() { $('#fade').style.opacity = 0; }
let showFps = false;
actions.fpsOn = () => showFps;
actions.toggleFps = () => { showFps = !showFps; $('#fps').hidden = !showFps; };
let boards = { laps: [], wins: [], time: [] };
actions.boards = () => boards;
actions.goCamp = () => { if (match) net.send('leave', {}); else net.send('warp', { to: 'home' }); };
actions.toggleMusic = () => toggleMusic();
actions.claim = () => net.send('claim', {});
let hatchWant = null, hatchAuto = false;
actions.hatch = (c, n) => { hatchWant = { c, n }; net.send('hatch', { c, n }); };
actions.onHatched = (out) => {
    screenConfetti(40);
    const best = out.slice().sort((a, b) => petById[b.id].bonus - petById[a.id].bonus)[0], k = petById[best.id];
    if (k.rarity === 'legendary' || k.rarity === 'mythic') { sfx('rankup'); screenConfetti(90); }
    if (me) FX.sparkleColumn(P.b, k.color);
};
actions.afterHatch = () => { if (hatchAuto && hatchWant) net.send('hatch', hatchWant); };
addEventListener('resize', () => measureHud());

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2933` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) loadingText('Waking up a server…');
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        loadingText('Waking up a server…');
        const until = Date.now() + 60000;
        while (Date.now() < until) { await sleep(2000); if (await serverUp(url)) break; }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    if (switching) return;
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const b = P.b;
    const a = P.knocked ? 3 : b.climb ? 4 : !b.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    m.ts = Math.round(net.now());
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('sb1_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); storageSet('sb1_uid', uid); }
    return uid;
}
function reconcile(m) {
    if (m.coins !== undefined) S.coins = m.coins;
    delete m.coins; delete m.ack;
}
let gotProfile = false, lastGems = 0, joinSpot = null;
async function connect(name, endpoint) {
    const url = endpoint || await serverEndpoint();
    const client = new Client(url);
    const id = BX.identity();
    const room = await client.joinOrCreate('obby', { uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()), save: storageGet('sb1_save') || '' });
    net.room = room;
    net.bloxity = false;
    BX.updateRoom(room.roomId);
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); setEpoch(m.now); net.bloxity = !!m.bloxity; if (m.x !== undefined) joinSpot = m; pingSend(); });
    room.onMessage('pong', onPong);
    room.onMessage('profile', (m) => {
        const first = !gotProfile;
        if (m.save) storageSet('sb1_save', m.save);
        delete m.now;
        const coinsBefore = S.coins;
        reconcile(m);
        Object.assign(S, m);
        S.profileAt = Date.now();
        gotProfile = true;
        if (!first && m.gems > lastGems) { bump('#gemsBox'); sfx('gem'); }
        if (!first && S.coins > coinsBefore + 0.5) bump('#coinBox');
        lastGems = m.gems;
        if (me) { me.setLabel(S.name, S.lv, S.laps); me.setTeam((S.team || []).join(',')); me.setTrail(S.trail); }
        if (!match) P.cp = (S.stage || 0) - 1;
        setupAct();
        refreshPanels();
        updateHud();
    });
    // while racing: only what changes then, four times a second
    room.onMessage('lite', (m) => {
        reconcile(m);
        S.totalCoins = m.totalCoins; S.xp = m.xp; S.lv = m.lv; S.need = m.need; S.gems = m.gems;
        if (m.qv !== undefined) S.qv = m.qv;
        S.profileAt = S.profileAt || Date.now();
        updateHud();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('toastreward', (m) => { toast(m.text, '#7dff6b'); sfx('gem'); });
    room.onMessage('broke', (m) => notEnough(m));
    room.onMessage('code', (m) => codeResult(m));
    room.onMessage('boards', (m) => { boards = m; if (hubBits) hubBits.extras.setBoards(m); if (panelIs('boards')) refreshPanels(); });
    room.onMessage('reward', (m) => { popup(m.gems && !m.coins ? '💎' : '🎁', m.why || 'Reward!', m.text, '#ffe24a', true); sfx('reward'); confetti(P.b); if (m.coins) flyCoins(Math.min(30, m.coins)); });
    room.onMessage('levelup', (m) => {
        const was = S.lv;
        S.lv = m.lv; S.need = xpNeed(m.lv); S.xp = 0;
        sfx('levelup');
        levelUp(was, m.lv);
        if (me) { FX.sparkleColumn(P.b, 0x5ac8ff); me.setLabel(S.name, S.lv, S.laps); }
        updateHud();
    });
    room.onMessage('snaps', onSnaps);
    room.onMessage('queued', (m) => { if (!match) setQueued(!!m.on); });
    room.onMessage('match', (m) => enterRace(m));
    room.onMessage('home', (m) => exitRace(m));
    // ----- a race -----
    room.onMessage('rushcp', (m) => {
        P.cp = Math.max(P.cp, m.i);
        if (view) view.padTouch(m.i);
        sfx('checkpoint');
        const sp = world.cps[m.i];
        if (sp) FX.sparkleColumn(FX.tmpV.set(sp.x, sp.y, sp.z), 0x7dff6b);
    });
    room.onMessage('finished', (m) => {
        P.finished = true;
        sfx('win');
        bigText(m.n === 1 ? 'YOU WON THE RUSH!' : 'YOU MADE IT!', '#ffe24a');
        screenConfetti(140);
        confetti(P.b);
    });
    room.onMessage('out', () => { P.out = true; bigText('THE STORM GOT YOU!', '#c8a8ff'); playAsmr('sizzle', 0.8, 0.9); FX.poofFx(P.b); });
    room.onMessage('caught', (m) => { const r = byPid.get(m.p); if (r && r.x !== undefined) { FX.poofFx(FX.tmpV.set(r.x, r.y, r.z)); playAsmr('sizzle', 0.35, 1.1, panOf(r.x, r.z)); } });
    room.onMessage('results', (m) => {
        const until = Date.now() + CFG.resultsSecs * 1000;
        setMusicIntensity(1);
        if (m.me.coins > 0) flyCoins(Math.min(40, m.me.coins));
        setTimeout(() => { if (match && !switching) showResults(m, S.name, until); }, 900);
    });
    // ----- the long run -----
    room.onMessage('runstart', () => { P.climbT0 = net.now(); P.climbEnd = 0; view.padsFrom(0); });
    // a checkpoint: Coins, and it's where you come back to now
    room.onMessage('stage', (m) => {
        P.cp = Math.max(P.cp, m.i);
        S.stage = m.i + 1;
        if (m.first) S.bestStage = Math.max(S.bestStage || 0, m.i + 1);
        view.padTouch(m.i);
        sfx('checkpoint');
        const sp = world.cps[m.i];
        if (sp) FX.sparkleColumn(FX.tmpV.set(sp.x, sp.y, sp.z), 0xffd23a);
        // the Coins fly to the counter, which shows for a moment even as you run
        flyCoins(Math.min(8, m.coins));
        document.body.classList.add('coinflash');
        clearTimeout(padCoinT); padCoinT = setTimeout(() => document.body.classList.remove('coinflash'), 2600);
        cpWord('Stage ' + (m.i + 1) + '!');
        updateHud();
    });
    room.onMessage('world', (m) => {
        if (m.w === 0) return;
        const W = WORLDS[m.w];
        sfx('rankup');
        bigText(W.icon + ' ' + W.name.toUpperCase(), '#ffe24a');
        toast(W.text, '#ffffff');
        screenConfetti(50);
    });
    room.onMessage('balloon', (m) => { if (m.on) showBalloon(); else closeBalloon(); });
    room.onMessage('breakout', (m) => breakoutAt(m));
    room.onMessage('skipped', (m) => { sfx('whoosh'); P.cp = m.i; S.stage = m.i + 1; view.padTouch(m.i); warpTo(m); toast('✈️ Skipped to Stage ' + (m.i + 1), '#7dff6b'); });
    room.onMessage('warped', (m) => warpTo(m));
    room.onMessage('bought', (m) => {
        sfx('buy');
        screenConfetti(60);
        if (m.what === 'upgrade') {
            // (it's yours from now: the profile that says so is on its way)
            S.ups = { ...S.ups, [m.id]: m.n };
            setupAct();
            if (m.id === 'double' || m.id === 'moon' || m.id === 'carpet') popup('⭐', 'GOT IT!', m.id === 'double' ? 'Press JUMP again in the air' : m.id === 'moon' ? (isTouch ? 'Tap FLOAT to turn it on' : 'Press X, or tap Feather Fall, to turn it on') : 'Hold JUMP in the air to glide', '#7dff6b');
            if (m.id === 'moon' && !P.moonOn) toggleMoon();
            updateHud();
        }
    });
    room.onMessage('hatched', (m) => showHatch(m.c, m.out));
    room.onMessage('taskdone', (m) => { sfx('task'); toast('✅ Daily task done! Claim it in Quests', '#7dff6b'); });
    room.onMessage('questdone', () => { sfx('task'); toast('🎯 Quest complete! Claim it in Quests', '#7dff6b'); updateHud(); });
    room.onMessage('authed', (m) => { S.name = m.name; });
    room.onMessage('snap', (m) => { P.snaps++; teleport(m.x, m.y, m.z); });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r && r.char.blox) playEmoteOn(r.char.blox, m.id); });
    room.onMessage('chat', (m) => { const r = remotes.get(m.s); if (r) chatBubble(r.char.root, m.text); else if (m.s === room.sessionId && me) chatBubble(me.root, m.text); });
    room.onLeave((code) => {
        if (code === 4000) { $('#connectErr').textContent = 'You joined from somewhere else.'; }
        else $('#connectErr').textContent = 'Lost the connection to the server.';
        $('#start').hidden = false; $('#connectErr').hidden = false; $('#retryBtn').hidden = false; $('#loading').textContent = '';
        running = false;
    });
    return room;
}
// the balloon carries you home: a Star, a big word, and a new run with bigger pay
async function breakoutAt(m) {
    closeBalloon();
    switching = true;
    sfx('win');
    screenConfetti(160);
    FX.fireworks(FX.tmpV.set(P.b.x, P.b.y + 8, P.b.z), 8);
    await fadeOut();
    switching = false;
    P.cp = -1; P.climbT0 = 0; P.climbEnd = 0; S.climbShown = ''; $('#timerTxt').textContent = '00:00';
    view.padsFrom(0);
    teleport(m.x, 0.2, m.z, HUB.yaw);
    applyWorld(0, true);
    setMusicMode('plaza');
    fadeIn();
    showBreakout(m);
    if (m.reward.coins) flyCoins(30);
    FX.sparkleColumn(P.b, 0xffd23a);
}
// a quick way round: behind a short fade
async function warpTo(m) {
    switching = true;
    await fadeOut();
    switching = false;
    teleport(m.x, m.y ?? 0.2, m.z, m.ry ?? 0);
    if (!match) P.cp = (S.stage || 0) - 1;
    if (world.main) applyWorld(P.b.y > 4 && P.cp >= 0 ? world.cps[P.cp].world : 0, true);
    setMusicMode(P.b.y > 4 ? 'climb' : 'plaza');
    fadeIn();
    FX.sparkleColumn(P.b, 0x7dff6b);
    if (P.pilot) resetPilot(P.pilot, world.routeOf(P.cp));
}
let padCoinT = 0;
function cpWord(text) { const el = $('#cpWord'); el.textContent = text; el.hidden = false; el.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go'))); clearTimeout(cpWord.t); cpWord.t = setTimeout(() => { el.hidden = true; }, 2300); }
// the daily reward pops up on the ground, as you arrive
function offerDaily() {
    if (!running || !P.b.onGround || anyPopup() || offerDaily.done || match) return;
    if (!dailyStatus(S.daily, net.now()).can) return;
    offerDaily.done = true;
    openPanel('daily');
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const lb = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 11, 0), group);
    group.userData.bubbleLbl = lb;
    setTimeout(() => { if (group.userData.bubbleLbl === lb) { group.remove(lb); lb.material.map.dispose(); group.userData.bubbleLbl = null; } }, 5000);
}

// =====================================================================================
// Every frame
// =====================================================================================
let clockT = 0, slowT = 0, pingT = 0, metaT = 20, qT = 0, songUp = false;
function update(dt) {
    clockT += dt;
    const t = clockT;
    CU.uNow.value = rel(net.now());
    pumpAvatars();
    beginCrowd();
    if (world) updateMe(dt);
    updatePrompt();
    updateRemotes(dt, t);
    updateGuide(t);
    contactShadows();
    endCrowd(dt);
    updateEffects(dt);
    updateFx(dt);
    animateCounters(dt);
    if (match) updateRace(dt); else updateRun(dt);
    updateSea(dt);
    qT -= dt;
    if (qT <= 0) { qT = 0.25; updateQueue(); }
    slowT -= dt;
    if (slowT <= 0) { slowT = 1; updateHud(); }
    // the easy song on the island, the driving one out on the course
    if (!match) { const up = P.b.y > 6; if (up !== songUp) { songUp = up; setMusicMode(up ? 'climb' : 'plaza'); } }
    pingT -= dt;
    if (pingT <= 0) { pingT = pingEvery(); pingSend(); }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
// the contact shadows (Low quality)
function contactShadows() {
    SH.shadowsOn(getQuality() === 'low');
    SH.begin();
    const b = P.b;
    if (world) {
        const g = world.groundBelow(b.x, b.y + 0.3, b.z);
        if (g > -1e6) SH.add(b.x, g, b.z, b.y - g, 3);
        for (const r of remotes.values()) if (r.x !== undefined && r.char.shown) { const g2 = world.groundBelow(r.x, r.y + 0.3, r.z); if (g2 > -1e6) SH.add(r.x, g2, r.z, r.y - g2, 3); }
    }
    SH.end();
}
// what drifts in the air, world by world: bubbles, sugar, sparks, grit, snow, embers
const AMB = {
    bay: { color: 0xffffff, dir: 0.25, snow: false }, candy: { color: 0xffc0e8, dir: -0.4, snow: true }, neon: { color: 0x5af4ff, dir: 0.4, snow: false },
    gear: { color: 0xffd890, dir: 0.3, snow: false }, frost: { color: 0xffffff, dir: -0.65, snow: true }, crown: { color: 0xffa83a, dir: 1.1, snow: false },
};
let ambNow = AMB.bay;
function updateCameraAll(dt) {
    updateCamera(dt);
    const t = clockT;
    if (shadowDue()) snapShadow(FX.tmpV.set(P.b.x, P.b.y, P.b.z));
    if (view) view.update(dt, courseTime(), camera, renderer.shadowMap.enabled ? sun.shadow.camera : null, P.b.x, P.b.y, P.b.z);
    updateSky(camera.position, t, dt);
    updateAmbient(camera.position, t, ambNow);
    setSpeedLines(0, dt);
}

// ----- play stats: how the game runs on this device and any error it hit -----
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0, lastFps = 60;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k); errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('pagehide', () => { if (running) sendMeta(); });
let gpuNameCache = null;
function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = GPU_NAME.slice(0, 90) + (renderer.getContext().getContextAttributes().antialias ? '' : ' (no AA)');
    return gpuNameCache;
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) { metaFirst = false; Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 }); }
    net.send('meta', m);
}

// ----- the smoothness watch (every half second): the resolution adapts first, then the quality -----
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0, holdUntil: 0, lows: 0 };
// a new course builds things for a moment: the watcher looks away for a few seconds
function holdFpsWatch(secs) { fpsWatch.holdUntil = fpsWatch.t + (secs || 4); fpsWatch.avg = Math.max(fpsWatch.avg, 58); }
let watchOff = false;
function watchFps(fps) {
    if (!running || document.hidden || watchOff) return;
    const w = fpsWatch;
    w.t += 0.5;
    // a single stall (one slow half-second) doesn't count: only two in a row do
    w.lows = fps < 45 ? w.lows + 1 : 0;
    if (w.lows === 1 && fps < 45) return;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3 || w.t < w.holdUntil) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    // high frame rates first: below 54 a 60 Hz screen is already missing frames
    if (w.avg < 54 && w.t > w.cpuUntil && scale > 0.56) {
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 45 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Even frame pacing: on a fast screen (120 Hz and up) a frame that misses the refresh waits for the next one, so
// a game running between half and full rate shows frames of uneven length (a stutter, though the FPS is high).
// When most frames miss and some don't, it draws every other refresh instead: an even 72 on a 144 Hz screen.
const ivs = [];
let refreshMs = 0, paceN = 0, strikes = 0, pacedAt = 0, paced = false, trial = false;
function noteInterval(ms) { if (ms > 2 && ms < 60 && ivs.length < 400) ivs.push(ms); }
function paceFrames() {
    if (!running || document.hidden || isTouch) return;
    const now = performance.now();
    if (paced) { if (now - pacedAt > 30000) { paced = false; skipOdd = false; trial = true; ivs.length = 0; } return; }
    if (ivs.length < 200) return;
    paceN++;
    const s = ivs.slice().sort((a, b) => a - b), p10 = s[Math.floor(s.length * 0.1)];
    refreshMs = refreshMs ? Math.min(refreshMs, p10) : p10;
    const late = s.filter((v) => v > refreshMs * 1.5).length / s.length;
    ivs.length = 0;
    const uneven = refreshMs < 9 && late > 0.25 && late < 0.9;
    strikes = uneven ? strikes + 1 : 0;
    if ((trial && uneven) || (paceN > 3 && strikes >= 2 && fpsWatch.t >= fpsWatch.holdUntil)) {
        paced = true; skipOdd = true; pacedAt = now; strikes = 0;
        console.info('[pace] every other refresh (' + Math.round(500 / refreshMs) + ' FPS), ' + Math.round(late * 100) + '% of frames were late');
    }
    trial = false;
}
const perf = { n: 0, sum: 0, max: 0, last: 0 };
const spikes = [], slowParts = [];
let secAvg = {};
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, skipOdd = false, oddFrame = false;
let rafN = 0;
function frame(now) {
    requestAnimationFrame(frame);
    rafN++;
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    if (lastFrame && !skipOdd) noteInterval(now - lastFrame);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        // drawing every other refresh only makes sense on a fast screen keeping up: if the refreshes themselves are slow, draw them all
        if (skipOdd && rafN / fpsAcc < 95) { skipOdd = false; paced = false; pacedAt = 0; }
        rafN = 0;
        paceFrames();
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    if (lastFrame && now - lastFrame > 45 && spikes.length < 60) spikes.push({ at: Math.round(now), ms: Math.round(now - lastFrame), work: +perf.last.toFixed(1), res: getResScale() });
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running) {
        const w0 = performance.now();
        try {
            prof.start();
            update(dt);
            prof.mark('update');
            updateCameraAll(dt);
            prof.mark('camera+sky');
            render();
            prof.mark('render');
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w); perf.last = w;
        for (let i = 0; i < prof.parts.length; i += 2) secAvg[prof.parts[i]] = (secAvg[prof.parts[i]] || 0) + prof.parts[i + 1];
        secAvg.n = (secAvg.n || 0) + 1;
        if (w > 50 && slowParts.length < 20) { const o = {}; for (let i = 0; i < prof.parts.length; i += 2) o[prof.parts[i]] = +(o[prof.parts[i]] || 0) + +prof.parts[i + 1].toFixed(1); slowParts.push({ at: Math.round(now), ms: Math.round(w), calls: renderer.info.render.calls, prog: renderer.info.programs.length, ...o }); }
    }
}

// =====================================================================================
// Boot: build everything behind the loading screen, join, play (no start menu)
// =====================================================================================
function loadingText(t) { $('#loading').textContent = t; }
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('sb1_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => { const t0 = performance.now(); (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })(); });
}
async function play() {
    if (joining || running) return;
    joining = true;
    $('#connectErr').hidden = true; $('#retryBtn').hidden = true;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a server…');
        $('#loadBar').style.width = '92%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        const t0 = performance.now();
        while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        $('#connectErr').hidden = false;
        $('#connectErr').textContent = 'Could not reach the game server. Check your connection and try again.';
        $('#retryBtn').hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    running = true;
    S.joinedAt = Date.now();
    if (!me) buildMe();
    me.setTeam((S.team || []).join(','));
    me.setTrail(S.trail);
    P.cp = (S.stage || 0) - 1;
    view.padsFrom(S.stage || 0);
    // where the server says you are: your last checkpoint, or, new, the island
    const js = joinSpot || { x: HUB.spawn.x, y: 0.2, z: HUB.spawn.z, ry: 0 };
    uClock.value = courseTime();
    world.setTime(uClock.value, 0.016);
    applyWorld(P.cp >= 0 ? world.cps[P.cp].world : 0, true);
    teleport(js.x, (js.y || 0) + 0.2, js.z, js.ry || 0);
    setupAct();
    loadingText('Almost there…');
    $('#loadBar').style.width = '100%';
    await primeFrames();
    // everyone's avatar made behind the loading screen too
    updateRoster();
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 2000) { pumpAvatars(); await sleep(30); } }
    fpsAcc = 0; fpsFrames = 0;
    // the music is never played note by note (~100 audio nodes a second): until a song's first loop is rendered it
    // waits in silence (only a browser that can't render loops at all plays it live)
    allowLiveMusic(typeof OfflineAudioContext === 'undefined');
    startMusic();
    setMusicMode(P.cp >= 0 ? 'climb' : 'plaza');
    $('#start').hidden = true;
    $('#start').style.opacity = '';
    $('#hud').hidden = false;
    measureHud();
    updateHud();
    // the daily reward, straight away; what there is to say waits until that's out of the way
    setTimeout(greet, 700);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
}
async function primeFrames() {
    $('#start').style.opacity = '0.985';
    $('#hud').hidden = false;
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* compiles on first use */ }
    for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
    const gl = renderer.getContext();
    if (!gl.fenceSync) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const t0 = performance.now();
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 1500) await sleep(15);
    gl.deleteSync(sync);
}
function greet() {
    offerDaily();
    if (anyPopup()) { setTimeout(greet, 300); return; }
    showTips();
    setTimeout(() => { if (audioSuspended()) toast('🔊 Tap anywhere for sound!', '#7de8ff'); }, 3000);
}
function showTips() {
    if (isTouch) return;
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = k('WASD', 'Move') + k('Space', 'Jump') + k('Drag', 'Camera') + k('Enter', 'Storm Rush') + k('R', 'Back to checkpoint');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 12000);
    setTimeout(() => { el.hidden = true; }, 12900);
}
function unlockAudioOnGesture() {
    const unlock = () => { resumeAudio(); if (!audioSuspended()) for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) removeEventListener(ev, unlock, true); };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true)));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) backToCheckpoint(); }
        else if (event === 'open_daily') openPanel('daily');
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { if (me) playEmoteOn(me.blox, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
// The HUD's words and emoji painted for a few frames behind the loading screen, in the fonts and sizes
// the game uses: the first time a glyph (an emoji above all, on Windows) is drawn costs a long pause.
async function warmHudText() {
    const lines = [['🛒📋🔄✨📅🌈🌍⚙️🎁💎🥚🪙🟡🦘🏖️🍬🌿🌋🪐🕹️❄️👟📈🪶✈️🎈', 2.3], ['🔊🔇🏆🔥🎯✅⭐🚩🏁👑🌙🌩️', 1.8], ['🥉🥈🥇💠🔒⏱💬👋', 1.4], ['💰🎟️🚫🎉⬆️✓✕−+', 2.6]];
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px;opacity:0.01;pointer-events:none;z-index:1';
    d.innerHTML = lines.map(([em, s]) => `<div style="font-size:${s}rem;white-space:nowrap">${em}</div>`).join('')
        + [['var(--chunky)', 3, 400, 'o'], ['var(--chunky)', 2, 400, 'o'], ['var(--font)', 2.3, 700, 'o'], ['var(--font)', 1.1, 700, 'o1']]
            .map(([f, s, w, c]) => `<div class="${c}" style="font-family:${f};font-size:${s}rem;font-weight:${w};white-space:nowrap">Level Up! Coins Stage Checkpoint! (→) GO! Quests Rush Avatar Gear Music Options Players Skip 0123456789 % st nd rd th K M B</div>`).join('');
    document.body.appendChild(d);
    for (let i = 0; i < 3; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 150); });
    d.remove();
    // and once in a canvas (name tags, chat bubbles and signs are drawn there)
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 140;
    const cx = cv.getContext('2d');
    for (const px of [40, 44, 52, 70, 76]) { cx.font = '700 ' + px + 'px Fredoka, "Arial Rounded MT Bold", sans-serif'; cx.fillText('💬🎈🥉🥈🥇💠💎👑🔒🏆✓ Lv. 0123456789 Coins Wins', 4, 100); }
}
async function prepareWorld() {
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.08);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('400 40px "Luckiest Guy"')]), sleep(2500)]); } catch (e) { /* fallback font */ }
    await warmHudText();
    step('Pumping up the castles…', 0.18);
    tileTexture();
    await pause();
    buildMainView();
    SH.initShadows();
    await pause();
    step('Tuning the springs…', 0.36);
    await buildAsmr(pause);
    prerenderMusic();
    // every HUD screen and panel painted once, invisibly (the browser compiles how to draw them now)
    step('Hanging the flags…', 0.55);
    {
        const hud = $('#hud');
        hud.hidden = false; hud.classList.add('warmui');
        measureHud();
        const endPanels = warmPanels();
        for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
        endPanels();
        hud.classList.remove('warmui'); hud.hidden = true;
    }
    // the warm-up: every shader the game uses (the course, the traps, the crowd, every effect) compiled and drawn once now, not in play
    step('Warming up the sky…', 0.75);
    // (a name over a head, a "+5": their shader too)
    const blank = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    blank.needsUpdate = true;
    const extras = [fxWarmGroup(), new T.Sprite(new T.SpriteMaterial({ map: blank, transparent: true, depthWrite: false, toneMapped: false }))];
    for (const g of extras) { g.position.set(0, -200, 0); scene.add(g); }
    crowdWarm();
    if (!guide) { guide = guideMesh(); guide.count = 1; guide.setMatrixAt(0, guideM.makeTranslation(0, -200, 0)); guide.instanceMatrix.needsUpdate = true; }
    mainView.prepareAt(HUB.spawn.x, 0, HUB.spawn.z);
    mainView.warm(true);
    hubBits.extras.warmAll(true);
    stormOn(true);
    try {
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) { a.root.position.set(0, -200, 10); a.update(1 / 60, { t: 0 }); scene.add(a.root); extras.push(a.root); }
    } catch (e) { /* the avatar's shaders compile when it first shows */ }
    fxShowAll(true);
    camera.position.set(HUB.spawn.x, 30, HUB.spawn.z - 40); camera.lookAt(0, 30, 100); camera.updateMatrixWorld();
    gpuName();
    mainView.update(0, courseClock(Date.now()), camera, null, HUB.spawn.x, 0, HUB.spawn.z);
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* later */ }
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    render();
    for (const o of culled) o.frustumCulled = true;
    await pause();
    fxShowAll(false);
    for (const g of extras) scene.remove(g);
    mainView.warm(false);
    hubBits.extras.warmAll(false);
    stormOn(false);
    beginCrowd(); endCrowd(0);
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
async function boot() {
    installIcons();
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#retryBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// =====================================================================================
// QA: the autopilot runs the course on the bots' pilot, the same input and physics as you
// =====================================================================================
function autoStep(dt, ct) {
    const out = P.autoInp || (P.autoInp = { mx: 0, mz: 0, jump: false, hold: true });
    out.mx = 0; out.mz = 0; out.jump = false; out.hold = true;
    if (!world || switching || anyPopup() || P.finished || P.out) return;
    if (match && match.phase0) return;
    if (!P.pilot) { P.pilot = newPilot({ speed: walkOf(S) / CFG.walk, dither: 0, slip: 0 }); resetPilot(P.pilot, world.routeOf(P.cp)); P.pilot.pauseT = 0; }
    const a = pilotStep(P.pilot, P.b, world, ct, dt, powerOf(S));
    if (a.respawn) { doRespawn('asked'); return; }
    out.mx = a.mx; out.mz = a.mz; out.jump = a.jump; out.hold = a.hold;
}
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, renderer: () => renderer, audio: () => audioDebug(), actions, view: () => view, world: () => world,
        state: () => ({ x: +P.b.x.toFixed(2), y: +P.b.y.toFixed(2), z: +P.b.z.toFixed(2), onGround: P.b.onGround, coins: S.coins, gems: S.gems, stars: S.stars, lv: S.lv, xp: S.xp, races: S.races, wins: S.wins, cp: P.cp, stage: S.stage, bestStage: S.bestStage, laps: S.laps, snaps: P.snaps, hits: P.hits, respawns: P.respawns, programs: renderer.info.programs.length, q: getQuality(), others: remotes.size, qi: S.qi, inRace: !!match, t: match ? +((net.now() - match.t0) / 1000).toFixed(1) : 0, finished: P.finished, out: P.out, queued, place: match ? match.place : 0, world: match ? match.world : -1, s: world ? +world.sAt(P.cp, P.b.x, P.b.y, P.b.z).toFixed(1) : 0, total: world ? world.total : 0, stages: world ? world.cps.length : 0, results: panelIs('results'), balloon: panelIs('balloon'), peers: [...remotes.values()].filter((r) => !r.p.bot).length }),
        auto: (on) => { P.auto = on === false ? null : autoStep; P.autoCam = on !== false; if (on === false) P.pilot = null; },
        play: (w) => { qaWorld = w; startQueue(); },
        queueOff: () => cancelQueue(),
        again: () => actions.playAgain(),
        leave: () => actions.leaveRace(),
        key: (code, down) => { keys[code] = !!down; if (down && code === 'Space') P.jumpPress = clockT; },
        jump: () => { P.jumpPress = clockT; },
        teleport: (x, y, z, yaw) => { net.send('qa', { tp: [x, y, z] }); teleport(x, y, z, yaw); },
        // to the start of stage i (from 0) of the course on screen
        toStage: (i) => { const c = world, sp = c.respawnOf(i); if (c.main) net.send('qa', { stage: i + 1, tp: [sp.x, sp.y, sp.z] }); else net.send('qa', { tp: [sp.x, sp.y, sp.z] }); P.cp = i; teleport(sp.x, sp.y, sp.z, sp.ry); if (P.pilot) resetPilot(P.pilot, c.routeOf(i)); return { x: sp.x, y: sp.y, z: sp.z }; },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
        quality: (q) => setQuality(q),
        give: (o) => net.send('qa', o),
        send: (type, m) => net.send(type, m || {}),
        panel: (k, tab) => openPanel(k, tab),
        close: () => { let n = 0; while (closeTop() && n < 9) n++; return n; },
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, paced: skipOdd }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        diag: () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: renderer.getPixelRatio(), programs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
        errors: () => [...errSeen],
        noWatch: (on) => { watchOff = on === undefined ? true : !!on; },
        hud: (on) => { $('#hud').style.display = on ? '' : 'none'; $('#touch').style.display = on ? '' : 'none'; },
        mood: (m) => setMood(m, true),
        world2: (w) => applyWorld(w, true),
        sizes: () => mainView.sizes(),
        msg: { toast, popup, cpWord, showCard, hideCard, bigText, levelUp },
        res: (k) => setResScale(k),
        gpu: () => gpuName(),
        spikes: () => spikes.splice(0),
        slow: () => slowParts.splice(0),
        sections: () => { const n = secAvg.n || 1, o = {}; for (const k in secAvg) if (k !== 'n') o[k] = +(secAvg[k] / n).toFixed(2); secAvg = {}; return o; },
        avatars: () => avatarsPending(),
        hatch: (c, n) => net.send('hatch', { c, n: n || 1 }),
        hatchAuto: (on) => { hatchAuto = !!on; },
        hatchOpen, closeHatch,
        remotes: () => remotes,
        delay: () => { let most = 0; for (const r of remotes.values()) most = Math.max(most, r.track.delay); return most; },
        flips: () => (view ? view.flips() : 0),
        loadSecs: () => loadSecs,
    };
}
void clockMs; void refreshPanels; void hatchAuto;
