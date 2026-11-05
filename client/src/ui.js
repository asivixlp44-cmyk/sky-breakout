// The HUD (which stage and the clock, who's here, your Coins, Gems and Stars, the powers, your level; in a Storm Rush: everyone's place on the bar,
// your place, the clock, how many are left), the egg reveal and every panel: gear, buddies and trails, quests, the daily reward, gifts,
// leaderboards, options, a race's results, the balloon. Prices are Coins, Gems or Stars, all earned in the game.
import { $ } from './engine.js';
import { S, net, actions } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume, playAsmr } from './audio.js';
import { setQuality, getQuality } from './fx.js';
import { petSvg } from './icons.js';
import {
    CFG, RARITIES, UPGRADES, upgradeCost, TRAILS, PETS, petById, EGGS, eggById, petBonus, teamSize, xpNeed, TIME_RANKS, STAGES, WORLDS, breakoutReward,
    TASKS, QUESTS, DAILY, dailyStatus, dayLeft, GIFTS, rewardText, clock, clockMs, fmtComma, fmt, rankOf, rankOfTime, RANKS,
} from '../../shared/config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const rar = (r) => `<span class="rar" style="color:${RARITIES[r].color}">${RARITIES[r].name}</span>`;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const CC = '<i class="cc"></i>';
// a drawn icon (icons.js) for a panel's title
const IC = (k) => '<i class="ic ic-' + k + ' pic"></i>';
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;
export const ordinal = (n) => { const j = n % 10, k = n % 100; return n + (j === 1 && k !== 11 ? 'st' : j === 2 && k !== 12 ? 'nd' : j === 3 && k !== 13 ? 'rd' : 'th'); };

// =====================================================================================
// Small things: toasts, big words, pop-ups, level ups, Coins
// =====================================================================================
// starts a CSS animation over without asking the page for its layout: the class comes back on the next frame
function replay(el) { el.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go'))); }
export function toast(text, color) {
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast o1'; el.textContent = text; el.style.color = color || '#fff';
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3300);
}
export function bigText(text, color) {
    const el = $('#bigText');
    el.textContent = text; el.style.color = color || '#ffe24a';
    el.hidden = false; replay(el);
    clearTimeout(bigText.t); bigText.t = setTimeout(() => { el.hidden = true; }, 2400);
}
// the big countdown
export function countText(text, color) {
    const el = $('#count');
    el.textContent = text; el.style.color = color || '#ffffff';
    el.hidden = false; replay(el);
    clearTimeout(countText.t); countText.t = setTimeout(() => { el.hidden = true; }, 950);
}
// the card before a race
export function showCard(t, s, e) { $('#cardT').textContent = t; $('#cardS').textContent = s; $('#cardE').textContent = e; $('#card').hidden = false; }
export function hideCard() { $('#card').hidden = true; }
// sub may hold the drawn icons (html)
export function popup(icon, title, sub, color, html) {
    const el = $('#popup');
    $('#popIc').textContent = icon; $('#popT').textContent = title; $('#popT').style.color = color || '#ffe24a';
    if (html) $('#popS').innerHTML = sub || ''; else $('#popS').textContent = sub || '';
    el.hidden = false; replay(el);
    clearTimeout(popup.t); popup.t = setTimeout(() => { el.hidden = true; }, 3000);
}
export function levelUp(lv0, lv1) {
    const el = $('#lvlUp');
    $('#lu1').textContent = `Level Up! (${lv0} → ${lv1})`;
    $('#lu2').textContent = 'Bigger prizes';
    el.hidden = false; replay(el);
    clearTimeout(levelUp.t); levelUp.t = setTimeout(() => { el.hidden = true; }, 2600);
    bump('#lvBar');
}
export function notEnough(m) {
    sfx('denied');
    const gems = m.cur === 'gems', stars = m.cur === 'stars', word = gems ? 'Gems' : stars ? 'Stars' : 'Coins';
    askConfirm(gems ? '💎' : stars ? '⭐' : '🪙', 'Not enough ' + word, `You need ${fmtComma(m.need)} more ${word} for ${esc(m.name)}.` + (gems ? '<br><small>Gems come from winning, quests, daily tasks, gifts and the daily reward.</small>' : stars ? '<br><small>Every Breakout earns a Star: reach the balloon at the end of the run.</small>' : '<br><small>Every new stage pays, and every Storm Rush pays more.</small>'),
        gems ? 'Quests' : 'OK', () => { if (gems) openPanel('quests'); });
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff7a8a'); if (m.ok) sfx('reward'); else sfx('denied'); }

// =====================================================================================
// The HUD (written only when a value changes; the bars move with transforms)
// =====================================================================================
const shown = { c: 0, g: 0, s: 0 }, shownTxt = { c: '', g: '', s: '' };
let lvFillShown = -1;
export function animateCounters(dt) {
    const kf = Math.min(1, dt * 7);
    for (const [key, v, sel, f] of [['c', S.coins, '#coinVal', fmt], ['g', S.gems, '#gemVal', fmtComma], ['s', S.stars, '#starVal', fmtComma]]) {
        const target = v || 0;
        shown[key] += (target - shown[key]) * kf;
        if (Math.abs(target - shown[key]) < 0.3) shown[key] = target;
        const txt = f(Math.round(shown[key]));
        if (txt !== shownTxt[key]) { shownTxt[key] = txt; $(sel).textContent = txt; }
    }
    const f = Math.min(1, (S.xp || 0) / (S.need || xpNeed(S.lv)));
    if (Math.abs(f - lvFillShown) > 0.002) { lvFillShown = f; $('#lvFill').style.transform = 'scaleX(' + f.toFixed(3) + ')'; put('#lvNum', fmt(Math.floor(S.xp || 0)) + '/' + fmt(S.need || xpNeed(S.lv))); }
}
// a springy pop (an animation of its own: no class toggling, so no layout read)
const POP = [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.35 }, { transform: 'scale(1)' }];
export function bump(sel) { const el = $(sel); if (el && el.animate) el.animate(POP, { duration: 420, easing: 'cubic-bezier(0.34, 1.6, 0.5, 1)' }); }
// Coins: little coins burst out of the middle of the screen and stream into the counter, each one a chime
let coinAt = null, flying = 0;
export function flyCoins(n) {
    if (!coinAt || flying > 24) return;
    const box = $('#flyLayer'), k = Math.min(10, Math.max(3, Math.round(Math.sqrt(n) * 1.6)));
    const fx = innerWidth / 2, fy = innerHeight * 0.42;
    for (let i = 0; i < k; i++) {
        const el = document.createElement('i');
        el.className = 'cc';
        box.appendChild(el);
        flying++;
        const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 80, sx = fx + Math.cos(a) * r, sy = fy + Math.sin(a) * r * 0.7;
        const at = (x, y, sc) => 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) translate(-50%,-50%) scale(' + sc + ')';
        const anim = el.animate([
            { transform: at(fx, fy, 0.2), opacity: 0 },
            { transform: at(sx, sy, 1.3), opacity: 1, offset: 0.3 },
            { transform: at(coinAt.x, coinAt.y, 0.75), opacity: 1 },
        ], { duration: 820 + i * 60, delay: i * 50, easing: 'cubic-bezier(0.45, 0, 0.65, 1)', fill: 'both' });
        anim.onfinish = () => { el.remove(); flying--; bump('#coinBox'); playAsmr('tick', 0.14, 1.5 + i * 0.06); };
    }
}
const put = (sel, v, html) => { const el = $(sel); if (html) { if (el.innerHTML !== v) el.innerHTML = v; } else if (el.textContent !== v) el.textContent = v; };
export function updateHud() {
    put('#lvCircle', String(S.lv));
    put('#lvNum', fmt(Math.floor(S.xp || 0)) + '/' + fmt(S.need || xpNeed(S.lv)));
    // the powers: yours, and on
    for (const [sel, id] of [['#pwDouble', 'double'], ['#pwMoon', 'moon'], ['#pwCarpet', 'carpet']]) {
        const own = !!(S.ups && S.ups[id]);
        $(sel).classList.toggle('own', own);
    }
    // badges: something to do. Quests holds the daily reward and the free gifts too
    const ds = dailyStatus(S.daily, net.now()), gi = GIFTS.findIndex((g, i) => !S.gifts[i]), giftReady = gi >= 0 && GIFTS[gi].min * 60 - sessionSecs() <= 0;
    const list = (S.jq && S.jq.list) || [], Q = QUESTS[S.qi];
    setBadge('#bQuests', (ds.can || giftReady || list.some((q) => !q.c && TASKS[q.k] && q.p >= TASKS[q.k].n) || (Q && (S.qv || 0) >= Q.n)) ? '!' : '');
    setBadge('#bEggs', EGGS.some((e) => S.lv >= e.lv && S.coins >= e.coins) && !S.hatched ? '!' : '');
    tickPanel();
}
// The open panel's timers, written once a second on their own: a panel rebuilt under a finger loses the tap, and a rebuild
// from the frame loop means a layout. It's rebuilt only when what it shows changes (a gift's time comes).
function tickPanel() {
    const m = $('#modal');
    if (m.hidden || !panelKind) return;
    const set = (sel, text) => { const el = m.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    if (panelKind === 'quests') { set('[data-t="day"]', 'Resets in ' + clock(dayLeft(net.now()))); set('[data-t="giftq"]', giftWord()); }
    else if (panelKind === 'daily') set('[data-t="daily"]', 'Next reward in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'gifts') {
        const secs = sessionSecs();
        for (let i = 0; i < GIFTS.length; i++) {
            if (S.gifts[i]) continue;
            const left = GIFTS[i].min * 60 - secs, b = m.querySelector('[data-act="gift"][data-i="' + i + '"]');
            if (!b) continue;
            if (left <= 0 && b.disabled) { renderPanel(); return; }
            if (left > 0) set('[data-act="gift"][data-i="' + i + '"]', clock(left));
        }
    } else if (panelKind === 'results' && results) {
        const left = Math.max(0, Math.ceil((results.until - Date.now()) / 1000));
        set('[data-t="res"]', left > 0 ? 'Back to your run in ' + left : '');
    }
}
// the next free gift, in a word
function giftWord() { const gi = GIFTS.findIndex((g, i) => !S.gifts[i]); if (gi < 0) return 'all claimed'; const left = GIFTS[gi].min * 60 - sessionSecs(); return left <= 0 ? 'CLAIM!' : clock(left); }
function setBadge(sel, text) {
    const el = $(sel);
    let b = el.querySelector('.badge');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; el.appendChild(b); }
    if (b.textContent !== text) b.textContent = text;
}
export function measureHud() {
    const w = $('#coinBox .cc').getBoundingClientRect(); if (w.width > 0) coinAt = { x: w.left + w.width / 2, y: w.top + w.height / 2 };
}
// ----- in a race -----
const dots = [];
let placeShown = 0, timeShown = '', leftShown = -1, fillShown = -1;
export function raceReset(n) {
    const box = $('#raceDots');
    box.innerHTML = '';
    dots.length = 0;
    for (let i = 0; i < n; i++) { const el = document.createElement('i'); box.appendChild(el); dots.push({ el, x: -1, k: '' }); }
    placeShown = 0; timeShown = ''; leftShown = -1; fillShown = -1;
    measureDots();
}
let raceDotsPx = 300;
function measureDots() { const w = $('#raceDots').getBoundingClientRect().width; if (w > 0) raceDotsPx = w; }
addEventListener('resize', () => { measureDots(); dots.forEach((d) => { d.x = -1; }); });
// one racer's dot (i: its slot; fr: how far up; me; real: a real player; out)
export function raceDot(i, fr, me, real, out) {
    const d = dots[i];
    if (!d) return;
    const px = Math.round(fr * raceDotsPx), k = (me ? 'me ' : '') + (real ? 'real ' : '') + (out ? 'out' : '');
    if (k !== d.k) { d.k = k; d.el.className = k; }
    if (px !== d.x) { d.x = px; d.el.style.transform = 'translateX(' + px + 'px)'; }
}
export function raceInfo(place, secs, left, fr) {
    if (place !== placeShown) { placeShown = place; $('#racePlace').innerHTML = place + '<small>' + ordinal(place).slice(String(place).length) + '</small>'; bump('#racePlace'); }
    const t = clock(Math.max(0, secs));
    if (t !== timeShown) { timeShown = t; $('#raceTime').textContent = t; }
    if (left !== leftShown) { leftShown = left; $('#raceLeft').textContent = left + ' left'; }
    const f = Math.round(fr * 400) / 400;
    if (f !== fillShown) { fillShown = f; $('#raceFill').style.transform = 'scaleX(' + f + ')'; }
}
// the Players list: written once a second, and only when it changed
let playersShown = '';
export function playersList(rows) {
    const h = rows.map((r) => '<div class="plr"><span>' + esc(r.n) + '</span><u><i class="cc"></i>' + fmt(r.c) + '</u><u><i class="gm"></i>' + fmt(r.g) + '</u><u><i class="lv"></i>' + r.l + '</u></div>').join('');
    if (h !== playersShown) { playersShown = h; $('#playersList').innerHTML = h; }
}
// =====================================================================================
// An egg opening: it shakes, it bursts, your buddy
// =====================================================================================
let hatchT = 0;
export function showHatch(eggId, out, auto) {
    const c = eggById[eggId], box = $('#hatchCaps'), H = $('#hatch');
    clearTimeout(hatchT);
    box.innerHTML = out.map(() => `<div class="hc"><div class="cap" style="--cc:${hex(c.color)}"></div></div>`).join('');
    $('#hatchOk').hidden = true;
    H.hidden = false;
    sfx('shake');
    hatchT = setTimeout(() => {
        sfx('crack');
        box.innerHTML = out.map((o) => { const k = petById[o.id]; return `<div class="hc">${o.isNew ? '<span class="newb o1">NEW!</span>' : ''}<img src="${petSvg(k)}" alt=""><b class="o">${esc(k.name)}</b><small class="o1">${rar(k.rarity)} · +${Math.round(k.bonus * 100)}% Coins</small></div>`; }).join('');
        $('#hatchOk').hidden = false;
        if (actions.onHatched) actions.onHatched(out);
        if (auto) hatchT = setTimeout(closeHatch, 1300);
    }, 720);
}
export function closeHatch() { clearTimeout(hatchT); $('#hatch').hidden = true; if (actions.afterHatch) actions.afterHatch(); }
export const hatchOpen = () => !$('#hatch').hidden;
$('#hatchOk').addEventListener('click', () => { sfx('click'); closeHatch(); });

// =====================================================================================
// Panels
// =====================================================================================
let panelKind = null, panelTab = null, panelArg = null, results = null;
export function openPanel(kind, tab) {
    panelKind = kind; panelTab = tab || null;
    if (kind === 'egg') { panelArg = tab; panelTab = null; }
    $('#modal').hidden = false;
    renderPanel();
    sfx('open');
    setMusicDuck(true);
    if (actions.onPanel) actions.onPanel(true);
}
export function closePanel() {
    if ($('#modal').hidden) return false;
    $('#modal').hidden = true; panelKind = null; renderedKind = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    setMusicDuck(false);
    if (actions.onPanel) actions.onPanel(false);
    sfx('close');
    return true;
}
export const panelIs = (k) => !$('#modal').hidden && panelKind === k;
export function refreshPanels() { if (!$('#modal').hidden) renderPanel(); }
function frame(title, icon, body, opts) {
    opts = opts || {};
    return `<div class="panel ${opts.cls || ''}"${opts.w ? ` style="width:min(${opts.w}rem,94vw)"` : ''}>
        <header><h2 class="o">${icon} ${title}</h2><div class="hx">${opts.hx || ''}<button class="btn g-red o x" data-close>✕</button></div></header>
        ${opts.tabs ? `<div class="tabs">${opts.tabs.map(([k, l]) => `<button class="tab o1${k === opts.tab ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>` : '<div></div>'}
        <div class="body">${body}</div>${opts.foot ? `<div class="foot">${opts.foot}</div>` : '<div></div>'}</div>`;
}
let renderedKind = null, renderedHtml = '';
function renderPanel() {
    const m = $('#modal');
    const again = renderedKind === panelKind && !m.hidden && m.firstElementChild;
    const html = PANELS[panelKind] ? PANELS[panelKind]() : '';
    if (again && html === renderedHtml) return;
    renderedHtml = html;
    const scroller = again && m.querySelector('.body'), keep = scroller ? scroller.scrollTop : 0;
    m.innerHTML = html;
    renderedKind = panelKind;
    // a refresh of the open panel (a timer, a new value): no pop-in again, the scroll stays where it was
    if (again && m.firstElementChild) { m.firstElementChild.classList.add('still'); const b2 = m.querySelector('.body'); if (b2 && keep) b2.scrollTop = keep; }
    const x = m.querySelector('[data-close]');
    if (x) x.onclick = () => (panelKind === 'results' ? doAct('camp', {}) : closePanel());
    m.onclick = (e) => { if (e.target === m && panelKind !== 'results') closePanel(); };
    for (const b of m.querySelectorAll('[data-tab]')) b.onclick = () => { panelTab = b.dataset.tab; sfx('click'); renderPanel(); };
    for (const b of m.querySelectorAll('[data-act]')) b.onclick = (e) => { e.stopPropagation(); doAct(b.dataset.act, b.dataset); };
    for (const b of m.querySelectorAll('[data-close2]')) b.onclick = () => { sfx('click'); closePanel(); };
    const code = m.querySelector('#codeIn');
    if (code) code.onkeydown = (e) => { if (e.key === 'Enter') doAct('code', {}); };
    for (const r of m.querySelectorAll('input[type=range]')) r.oninput = () => setVolume(r.dataset.vol, r.value / 100);
}
const petCard = (k, inTeam, count) => `<div class="card${inTeam ? ' on' : ''}">${count > 1 ? `<span class="palN o1">x${count}</span>` : ''}<div class="ci"><img src="${petSvg(k)}" alt=""></div><b class="o1">${esc(k.name)}</b><small>${rar(k.rarity)}</small><span class="palX o1">+${Math.round(k.bonus * 100)}%</span>
    ${inTeam ? `<button class="btn g-red o1" data-act="unequip" data-id="${k.id}">Take off</button>` : `<button class="btn g-green o1" data-act="equip" data-id="${k.id}">Equip</button>`}</div>`;
const PANELS = {
    gear() {
        const body = UPGRADES.map((u) => {
            const n = (S.ups && S.ups[u.id]) || 0, max = n >= u.max, cost = upgradeCost(u, n), can = !max && S.coins >= cost;
            const lvl = u.max > 1 ? ` <span style="opacity:.8;font-size:.85em">Lv ${n}/${u.max}</span>` : '';
            return `<div class="row"><div class="ri"><i class="ic ic-${u.ic}"></i></div><div class="rt"><b class="o1" style="color:${u.color}">${esc(u.name)}${lvl}</b><small>${esc(u.text)}</small></div><div class="rb"><button class="btn ${max ? 'g-grey' : can ? 'g-green' : 'g-grey'} o1" data-act="upgrade" data-id="${u.id}" ${max ? 'disabled' : ''}>${max ? (u.max > 1 ? 'Max!' : 'Yours!') : CC + ' ' + fmtComma(cost)}</button></div></div>`;
        }).join('');
        return frame('Gear', IC('shoe'), body, { w: 36, hx: `<span class="o1">${CC} ${fmtComma(S.coins)}</span>`, foot: 'Bought with the Coins you earn on the run. No gear is ever needed to beat a stage.' });
    },
    eggs() {
        const tab = panelTab || 'eggs', team = S.team || [];
        if (tab === 'trails') {
            const tb = '<div class="grid">' + TRAILS.map((t) => {
                const owned = t.id === 'none' || (S.trails && S.trails[t.id]), on = (S.trail || 'none') === t.id, locked = !owned && S.lv < t.lv;
                const can = t.stars ? (S.stars || 0) >= t.stars : S.coins >= t.coins, price = t.stars ? '⭐ ' + t.stars : CC + ' ' + fmtComma(t.coins);
                const btn = on ? '<button class="btn g-grey o1" disabled>On</button>' : owned ? `<button class="btn g-blue o1" data-act="trail" data-id="${t.id}">Wear</button>` : locked ? `<button class="btn g-grey o1" disabled>🔒 Lv ${t.lv}</button>` : `<button class="btn ${can ? 'g-green' : 'g-grey'} o1" data-act="trail" data-id="${t.id}">${price}</button>`;
                return `<div class="card${on ? ' on' : ''}"><div class="ci"><i class="sw${t.rainbow ? ' swr' : ''}" style="${t.rainbow ? '' : 'background:' + hex(t.color)}"></i></div><b class="o1">${esc(t.name)}</b>${btn}</div>`;
            }).join('') + '</div>';
            return frame('Avatar', IC('avatar'), tb, { tabs: [['eggs', 'Eggs'], ['team', 'My Buddies'], ['trails', 'Trails']], tab, hx: `<span class="o1">${CC} ${fmtComma(S.coins)} · ⭐ ${fmtComma(S.stars || 0)}</span>`, foot: 'The best trails cost Stars. Every Breakout earns one.' });
        }
        let body = '';
        if (tab === 'eggs') {
            body = EGGS.map((c) => {
                const locked = S.lv < c.lv, found = c.pets.filter((x) => (S.pets || {})[x.id] > 0).length;
                return `<div class="row"><div class="ri"><span class="hc" style="width:auto"><span class="cap" style="display:block;width:2.7rem;height:3.3rem;--cc:${hex(c.color)};animation:none;border-width:0.18rem"></span></span></div><div class="rt"><b class="o1">${esc(c.name)} ${found === c.pets.length ? '✅' : ''}</b><small>${found} / ${c.pets.length} found${S.index && S.index[c.id] ? '' : ' · find them all for Gems'}</small></div><div class="rb"><button class="btn ${locked ? 'g-grey' : 'g-green'} o1" data-act="egg" data-c="${c.id}" ${locked ? 'disabled' : ''}>${locked ? '🔒 Lv ' + c.lv : CC + ' ' + fmtComma(c.coins)}</button></div></div>`;
            }).join('');
        } else {
            const owned = PETS.filter((k) => (S.pets || {})[k.id] > 0).sort((a, b) => b.bonus - a.bonus);
            body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">Team: ${team.length} / ${teamSize(S)} · +${Math.round(petBonus(S) * 100)}% Coins <button class="btn g-blue o1" data-act="equipbest" style="margin-left:.5rem;padding:.15rem .7rem;font-size:.95rem">Equip best</button></p>`;
            body += owned.length ? '<div class="grid">' + owned.map((k) => petCard(k, team.includes(k.id), S.pets[k.id])).join('') + '</div>' : '<p class="o1" style="font-weight:700">No buddies yet. Open an egg!</p>';
        }
        return frame('Avatar', IC('avatar'), body, { tabs: [['eggs', 'Eggs'], ['team', 'My Buddies'], ['trails', 'Trails']], tab, hx: `<span class="o1">${CC} ${fmtComma(S.coins)} · ⭐ ${fmtComma(S.stars || 0)}</span>`, foot: 'Buddies follow you, and add to the Coins you get.' });
    },
    egg() {
        const c = eggById[panelArg];
        if (!c) return '';
        const total = c.pets.reduce((a, x) => a + x.w, 0);
        const odds = c.pets.map((x) => { const k = petById[x.id], got = (S.pets || {})[k.id] > 0; return `<div class="card"><div class="ci"><img src="${petSvg(k)}" alt="" class="${got ? '' : 'dim'}"></div><b class="o1">${got ? esc(k.name) : '???'}</b><small>${rar(k.rarity)}</small><span class="palX o1">+${Math.round(k.bonus * 100)}% · ${Math.round(x.w / total * 1000) / 10}%</span></div>`; }).join('');
        const can1 = S.coins >= c.coins, can3 = S.coins >= c.coins * 3;
        const body = `<div class="capOdds">${odds}</div><div class="capBtns"><button class="btn ${can1 ? 'g-green' : 'g-grey'} o" data-act="hatch" data-n="1">Open 1 · ${CC} ${fmtComma(c.coins)}</button><button class="btn ${can3 ? 'g-yellow' : 'g-grey'} o" data-act="hatch" data-n="3">Open 3 · ${CC} ${fmtComma(c.coins * 3)}</button></div>
            <p class="o1" style="margin:.6rem 0 0;text-align:center;font-weight:700">You have ${CC} ${fmtComma(S.coins)}</p>`;
        return frame(esc(c.name), IC('egg'), body, { w: 38 });
    },
    quests() {
        const Q = QUESTS[S.qi], canDaily = dailyStatus(S.daily, net.now()).can;
        let body = `<div class="qlinks"><button class="btn g-green o1" data-act="open" data-k="daily">Daily Rewards${canDaily ? ' !' : ''}</button><button class="btn g-blue o1" data-act="open" data-k="gifts">FREE Gifts · <span data-t="giftq">${giftWord()}</span></button></div>`;
        if (Q) {
            const p = Math.min(Q.n, S.qv || 0), ready = p >= Q.n;
            body += `<div class="row${ready ? ' feat' : ''}"><div class="ri"><span class="ci" style="font-size:2.4rem">🎯</span></div><div class="rt"><small style="color:#7af4ff;font-weight:700">QUEST ${S.qi + 1} / ${QUESTS.length}</small><b class="o1">${esc(Q.text)}</b><div class="prog"><i style="width:${(p / Q.n * 100).toFixed(0)}%"></i></div><em>${fmt(p)} / ${fmt(Q.n)} · Reward: ${rewardText(Q)}</em></div><div class="rb"><button class="btn ${ready ? 'g-green' : 'g-grey'} o" data-act="qclaim" ${ready ? '' : 'disabled'}>Claim</button></div></div>`;
        } else body += '<div class="row"><div class="rt"><b>🏆 Every quest done! Nobody runs like you.</b></div></div>';
        body += `<h3 style="margin:.9rem 0 .4rem">🔥 Daily Tasks <small data-t="day" style="opacity:.75;font-size:.85rem">Resets in ${clock(dayLeft(net.now()))}</small></h3>`;
        body += ((S.jq && S.jq.list) || []).map((q, i) => {
            const T = TASKS[q.k], done = q.p >= T.n;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.2rem">${T.icon}</span></div><div class="rt"><b class="o1">${esc(T.text)}</b><div class="prog"><i style="width:${Math.min(100, q.p / T.n * 100).toFixed(0)}%"></i></div><em>${fmt(q.p)} / ${fmt(T.n)} · ${rewardText(T)}</em></div><div class="rb"><button class="btn ${done && !q.c ? 'g-green' : 'g-grey'} o" data-act="tclaim" data-i="${i}" ${done && !q.c ? '' : 'disabled'}>${q.c ? 'Done ✓' : 'Claim'}</button></div></div>`;
        }).join('');
        return frame('Quests', IC('quest'), body);
    },
    daily() {
        const st = dailyStatus(S.daily, net.now());
        const ic = (r) => (r.gems && !r.coins ? '💎' : CC);
        const days = DAILY.map((r, i) => `<div class="day${i === 6 ? ' big' : ''}${i < st.day ? ' got' : ''}${i === st.day && st.can ? ' now' : ''}${i > st.day || (i === st.day && !st.can) ? ' lock' : ''}"><span>DAY ${i + 1}</span><span class="di">${i < st.day ? '✅' : ic(r)}</span><span>${rewardText(r)}</span></div>`).join('');
        const body = `<p class="dailyTop" style="color:${st.can ? '#58e04a' : '#fff'}">${st.can ? 'Ready to claim!' : 'Come back tomorrow'}</p><div class="days">${days}</div><div style="text-align:center;margin-top:1rem"><button class="btn ${st.can ? 'g-green' : 'g-grey'} o" data-act="daily" ${st.can ? '' : 'disabled'} ${st.can ? '' : 'data-t="daily"'} style="min-width:12rem;height:3rem;font-size:1.4rem">${st.can ? 'Claim Day ' + (st.day + 1) : 'Next reward in ' + clock(dayLeft(net.now()))}</button></div>`;
        return frame('Daily Rewards', IC('gift'), body, { cls: 'dailyP' });
    },
    gifts() {
        const secs = sessionSecs();
        const body = GIFTS.map((g, i) => {
            const left = g.min * 60 - secs, got = S.gifts[i];
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${got ? '✅' : '🎁'}</span></div><div class="rt"><b class="o1">${rewardText(g)}</b><small>After ${g.min} minutes of play</small></div><div class="rb"><button class="btn ${!got && left <= 0 ? 'g-green' : 'g-grey'} o" data-act="gift" data-i="${i}" ${!got && left <= 0 ? '' : 'disabled'}>${got ? 'Claimed' : left <= 0 ? 'Claim!' : clock(left)}</button></div></div>`;
        }).join('');
        return frame('FREE Gifts', IC('gift'), body, { w: 34, foot: 'Gifts unlock the longer you play this session.' });
    },
    boards() {
        const b = actions.boards ? actions.boards() : { laps: [], wins: [], time: [] };
        const col = (title, rows, f) => `<div><h3 style="margin:.2rem 0 .5rem">${title}</h3>${(rows || []).map((r, i) => `<div class="row" style="padding:.35rem .6rem;margin-bottom:.3rem"><b style="width:2rem">${['🥇', '🥈', '🥉'][i] || i + 1}</b><div class="rt"><b style="font-size:1rem">${esc(r.n)}</b></div><b>${f(r.v)}</b></div>`).join('') || '<p>Be the first!</p>'}</div>`;
        const r = rankOf(S.laps), tr = S.bestTime ? rankOfTime(S.bestTime) : null;
        const body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">You: best stage ${S.bestStage || 0} / ${STAGES} · ${S.bestTime ? 'fastest run ' + clockMs(S.bestTime) + ' (rank ' + tr.r + ')' : 'no full run yet'} · ${fmtComma(S.laps || 0)} Breakouts ${r.icon} · ${fmtComma(S.wins || 0)} Storm Rush wins</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:1rem">${col('⏱ Fastest Run', b.time, (v) => clockMs(v))}${col('🎈 Most Breakouts', b.laps, (v) => fmt(v))}${col('🌩️ Storm Rush Wins', b.wins, (v) => fmt(v))}</div><p style="margin:.7rem 0 0;font-weight:600;opacity:.85">Time ranks: ${TIME_RANKS.map((x) => x.r + (x.mins === Infinity ? ' (longer)' : ' (under ' + x.mins + ' min)')).join(' · ')}. Badges by Breakouts: ${RANKS.map((x) => x.icon + ' ' + x.wins).join(' · ')}</p>`;
        return frame('Leaderboards', '🏆', body);
    },
    settings() {
        const v = getVolumes(), q = getQuality();
        const body = `<div class="vol"><span>Graphics</span><div class="qbtns">${['low', 'medium', 'high'].map((k) => `<button class="btn g-blue o${q === k ? ' on' : ''}" data-act="quality" data-q="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
            <div class="vol"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(v.music * 100)}" data-vol="music"></div>
            <div class="vol"><span>Sounds</span><input type="range" min="0" max="100" value="${Math.round((v.asmr ?? 0.9) * 100)}" data-vol="asmr"></div>
            <div class="vol"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" data-vol="sfx"></div>
            <div class="vol"><span>Camera follows</span><div class="qbtns"><button class="btn g-grey o" data-act="camfollow">${actions.camFollow && actions.camFollow() ? 'On' : 'Off'}</button></div></div>
            <div class="vol"><span>Show FPS</span><div class="qbtns"><button class="btn g-grey o" data-act="fps">${actions.fpsOn && actions.fpsOn() ? 'On' : 'Off'}</button></div></div>
            <div class="vol"><span>Stuck?</span><div class="qbtns"><button class="btn g-blue o" data-act="home">Home island</button></div></div>
            <div class="vol"><span>Codes</span><div style="display:flex;gap:.4rem;flex:1"><input class="code" id="codeIn" maxlength="20" placeholder="Enter a code" style="flex:1;min-width:0"><button class="btn g-green o" data-act="code" style="min-width:5rem">Redeem</button></div></div>
            <p style="margin:1rem 0 0;font-weight:600;opacity:.8">${isTouch ? 'The stick moves, JUMP jumps (again in the air once you have Twin Hop). Drag to look around.' : 'WASD move · SPACE jump · R back to your checkpoint · E use · drag to look · Enter Storm Rush'}</p>`;
        return frame('Options', IC('gear'), body, { w: 36 });
    },
    results() {
        const R0 = results;
        if (!R0) return '';
        const me = R0.me, won = me.place === 0, title = won ? 'FIRST ACROSS!' : ordinal(me.place + 1) + ' PLACE';
        const sub = (me.finished ? 'You made it in ' + clock(me.secs) : me.out ? 'The storm got you after ' + clock(me.secs) : 'Out of time') + ' · ' + me.pct + '% of ' + me.stages + ' stages';
        const got = `<div class="resGot"><span class="o1">${CC} +${fmtComma(me.coins)}</span><span class="o1">⭐ +${fmtComma(me.xp)} XP</span>${me.gems ? `<span class="o1">💎 +${me.gems}</span>` : ''}</div>`;
        const rows = R0.rows.map((r) => `<div class="resRow${r.me ? ' me' : ''}"><b>${r.p}</b><span>${esc(r.n)}</span><span>${r.f ? clock(r.t) : r.pr + '%'}</span></div>`).join('');
        const left = Math.max(0, Math.ceil((R0.until - Date.now()) / 1000));
        const body = `<div class="resTop"><b class="o">${title}</b><small class="o1">${sub}</small></div>${got}${rows}<div class="resBtns"><button class="btn g-green o" data-act="again">Race Again</button><button class="btn g-blue o" data-act="camp">Back to My Run</button></div><p class="o1" data-t="res" style="margin:.4rem 0 0;text-align:center;font-weight:600;font-size:.9rem;opacity:.85">${left > 0 ? 'Back to your run in ' + left : ''}</p>`;
        return frame('Storm Rush', '🌩️', body, { w: 34 });
    },
    // the balloon at the end of the run
    balloon() {
        const R = breakoutReward(S.laps || 0);
        const body = `<div class="resTop"><b class="o">YOU MADE IT!</b><small class="o1">Climb in and break out: a Star, a big prize, and your next run pays more.</small></div><div class="resGot"><span class="o1">${CC} +${fmtComma(R.coins)}</span><span class="o1">💎 +${R.gems}</span><span class="o1">⭐ +${R.stars}</span></div><p class="o1" style="margin:.2rem 0 .4rem;text-align:center;font-weight:700">You'll start again from Stage 1.</p><div class="resBtns"><button class="btn g-green o" data-act="claim">Break Out!</button><button class="btn g-grey o" data-close2>Not Yet</button></div>`;
        return frame('The Breakout Balloon', IC('spire'), body, { w: 34 });
    },
    // and what it paid
    breakout() {
        const m = bk;
        if (!m) return '';
        const body = `<div class="resTop"><b class="o">BREAKOUT #${m.laps}!</b><small class="o1">${m.time ? 'Your run took ' + clockMs(m.time) + ' · Rank ' + m.rank : 'Run it clean, without a skip, for a time and a rank'}</small></div><div class="resGot"><span class="o1">${CC} +${fmtComma(m.reward.coins)}</span><span class="o1">💎 +${m.reward.gems}</span><span class="o1">⭐ +${m.reward.stars}</span><span class="o1">+${fmtComma(m.reward.xp)} XP</span></div><p class="o1" style="margin:.2rem 0 .4rem;text-align:center;font-weight:700">Every stage now pays ${Math.round(25 * m.laps)}% more. Stars buy the best trails.</p><div class="resBtns"><button class="btn g-yellow o" data-act="trails">Trails</button><button class="btn g-green o" data-close2>Run Again</button></div>`;
        return frame('You Broke Out!', IC('star'), body, { w: 34 });
    },
};
export function showResults(m, myName, until) {
    results = { ...m, until };
    results.rows = m.rows.map((r) => ({ ...r, me: !r.bot && r.n === myName }));
    openPanel('results');
}
export function closeResults() { if (panelIs('results')) { results = null; closePanel(); } }
// at the balloon: the offer, once each time you arrive
export function showBalloon() { openPanel('balloon'); }
export function closeBalloon() { if (panelIs('balloon')) closePanel(); }
let bk = null;
export function showBreakout(m) { bk = m; openPanel('breakout'); }

// =====================================================================================
// What the buttons do
// =====================================================================================
function doAct(act, d) {
    sfx('click');
    switch (act) {
        case 'code': { const v = ($('#codeIn') || {}).value || ''; if (v.trim()) net.send('code', { code: v.trim() }); break; }
        case 'qclaim': net.send('qclaim', {}); break;
        case 'tclaim': net.send('tclaim', { i: +d.i }); break;
        case 'daily': net.send('daily', {}); break;
        case 'gift': net.send('gift', { i: +d.i }); break;
        case 'quality': setQuality(d.q); renderPanel(); break;
        case 'fps': if (actions.toggleFps) actions.toggleFps(); renderPanel(); break;
        case 'camfollow': if (actions.toggleCam) actions.toggleCam(); renderPanel(); break;
        case 'home': closePanel(); if (actions.goCamp) actions.goCamp(); break;
        case 'upgrade': net.send('upgrade', { id: d.id }); break;
        case 'trail': net.send('trail', { id: d.id }); sfx('equip'); break;
        case 'equip': net.send('equip', { id: d.id }); sfx('equip'); break;
        case 'unequip': net.send('equip', { id: d.id, off: 1 }); break;
        case 'equipbest': net.send('equipbest', {}); sfx('equip'); break;
        case 'egg': openPanel('egg', d.c); break;
        case 'open': openPanel(d.k); break;
        case 'hatch': if (actions.hatch) actions.hatch(panelArg, +d.n); break;
        case 'claim': if (actions.claim) actions.claim(); break;
        case 'trails': openPanel('eggs', 'trails'); break;
        case 'again': results = null; closePanel(); if (actions.playAgain) actions.playAgain(); break;
        case 'camp': results = null; closePanel(); if (actions.leaveRace) actions.leaveRace(); break;
    }
}
// a yes / no question (yes may hold html: the drawn icons)
export function askConfirm(icon, title, text, yes, act) {
    const c = $('#confirm');
    c.innerHTML = `<div class="panel"><header><h2 class="o">${title}</h2><div class="hx"><button class="btn g-red o x" data-no>✕</button></div></header><div></div><div class="cbody"><span class="bi">${icon}</span><p>${text}</p><div class="btns"><button class="btn g-green o" data-yes>${yes}</button><button class="btn g-grey o" data-no>Cancel</button></div></div><div></div></div>`;
    c.hidden = false;
    for (const b of c.querySelectorAll('[data-no]')) b.onclick = () => { c.hidden = true; sfx('close'); };
    c.querySelector('[data-yes]').onclick = () => { c.hidden = true; act(); };
    c.onclick = (e) => { if (e.target === c) c.hidden = true; };
}
export function closeTop() {
    if (!$('#hatch').hidden) { closeHatch(); return true; }
    if (!$('#confirm').hidden) { $('#confirm').hidden = true; return true; }
    if (panelIs('results')) return false;
    if (closePanel()) return true;
    return false;
}
// the panels with their real content, for the loading warm-up; returns the clean-up
export function warmPanels() {
    const m = $('#modal');
    panelKind = 'daily'; panelArg = 'beach';
    bk = { laps: 1, time: 60000, rank: 'S', reward: { coins: 500, gems: 12, stars: 1, xp: 500 } };
    results = { rows: [{ n: 'Sample', p: 1, t: 12, f: false, pr: 10 }], me: { place: 0, finished: false, out: true, secs: 12, coins: 10, xp: 10, gems: 1, pct: 10, stages: 6 }, until: Date.now() };
    m.innerHTML = PANELS.daily() + PANELS.quests() + PANELS.gear() + PANELS.eggs() + PANELS.egg() + PANELS.gifts() + PANELS.boards() + PANELS.settings() + PANELS.results() + PANELS.balloon() + PANELS.breakout();
    results = null;
    m.hidden = false; m.classList.add('warmui');
    $('#confirm').innerHTML = '<div class="panel"><header><h2 class="o">Buy?</h2></header><div></div><div class="cbody"><span class="bi">🪙</span><p>Sample</p><div class="btns"><button class="btn g-green o">Yes</button></div></div><div></div></div>';
    $('#confirm').hidden = false; $('#confirm').classList.add('warmui');
    popup('⭐', 'UNLOCKED!', 'Sample', '#ffe24a'); $('#popup').classList.add('warmui');
    levelUp(1, 2); $('#lvlUp').classList.add('warmui');
    countText('3'); $('#count').classList.add('warmui');
    showCard('Storm Rush', 'Storm Rush', 'Stay ahead of the storm!'); $('#card').classList.add('warmui');
    $('#queueBox').hidden = false; $('#queueBox').classList.add('warmui');
    document.body.classList.add('inrace');
    toast('Sample', '#ffffff');
    const H = $('#hatch'), C = $('#hatchCaps');
    C.innerHTML = '<div class="hc"><div class="cap" style="--cc:#3ab4ff"></div></div><div class="hc"><img src="' + petSvg(PETS[0]) + '" alt=""><b class="o">Pip</b><small class="o1">Common</small></div>';
    H.hidden = false; H.classList.add('warmui');
    return () => {
        for (const s of ['#modal', '#confirm', '#popup', '#lvlUp', '#hatch', '#count', '#card', '#queueBox']) { $(s).classList.remove('warmui'); $(s).hidden = true; }
        document.body.classList.remove('inrace');
        m.innerHTML = ''; $('#confirm').innerHTML = ''; panelKind = null; $('#toasts').innerHTML = ''; C.innerHTML = '';
    };
}
export const anyPopup = () => !$('#confirm').hidden || !$('#modal').hidden || !$('#hatch').hidden;
void CFG; void WORLDS;
