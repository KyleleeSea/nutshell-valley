(() => {
'use strict';
const { NEEDS, NEED_LABELS, NEED_ICONS, OBJECTS, SOCIAL, FURS, TAILS, ACCESSORIES, CATEGORIES, BUILD_TABS, SKILLS, WALLPAPERS, FLOORS } = DEFS;
const TW = 64, TH = 32, WALL_UP = 58, WALL_DOWN = 12;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const canvas = $('game'), ctx = canvas.getContext('2d');
// ?guest keeps this tab's identity in sessionStorage so two tabs in one browser can be the two squirrels.
const store = new URLSearchParams(location.search).has('guest') ? sessionStorage : localStorage;

const S = {
  connected: false, isHost: false, full: false, meId: null, token: store.getItem('nv_token') || null,
  room: 'oakhaven', world: null, objects: [], walls: [], wallMap: new Map(), sqs: new Map(),
  time: 480, day: 1, acorns: 0, bond: 0, bondLabel: 'Strangers',
  mode: 'live', wallsMode: 'auto',
  buy: { cat: 'seating', type: null, rot: 0, sell: false },
  bld: { tab: 'walls', tool: 'wall', paper: 'plaster', floor: 'f_hardwood', type: null, rot: 0, drag: null },
  hover: { tile: null, obj: null, sq: null, wall: null }, particles: [], profile: null, centered: false,
};
const cam = { x: 0, y: 0, zoom: 1.15 };
const mouse = { x: -1, y: -1, down: false, dragging: false, sx: 0, sy: 0, lx: 0, ly: 0, button: 0 };
const keys = new Set();
let W = 0, H = 0;
const nightCv = document.createElement('canvas'), nctx = nightCv.getContext('2d');
const HEIGHTS = { oak: 140, sapling: 70, feeder: 80, hammock: 50, swing: 90, lantern: 72, exchange: 78, piano: 56, tv: 44, birdbath: 44, fridge: 60, bookshelf: 56, floorlamp: 70, shower: 70, computer: 44, easel: 60, mirror: 56, mailbox: 44 };
const NAMES = ['Nutmeg', 'Hazel', 'Pip', 'Chestnut', 'Maple', 'Biscuit', 'Pecan', 'Clover', 'Juniper', 'Fig', 'Walnut', 'Acorn', 'Peanut', 'Sorrel'];
const wkey = (x, y, side) => x + ',' + y + ',' + side;

// ---------- geometry ----------
const toScreen = (wx, wy) => ({ x: (wx - wy) * TW / 2 * cam.zoom + cam.x, y: (wx + wy) * TH / 2 * cam.zoom + cam.y });
function toWorld(sx, sy) { const a = (sx - cam.x) / (TW / 2 * cam.zoom), b = (sy - cam.y) / (TH / 2 * cam.zoom); return { x: (a + b) / 2, y: (b - a) / 2 }; }
function centerOn(wx, wy) { cam.x = W / 2 - (wx - wy) * TW / 2 * cam.zoom; cam.y = H / 2 - 60 - (wx + wy) * TH / 2 * cam.zoom; }
function fp(o) { const d = OBJECTS[o.type]; return { w: o.rot % 2 ? d.h : d.w, h: o.rot % 2 ? d.w : d.h }; }
const iso = (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 }); // base-unit iso (zoom applied by ctx)
function resize() {
  const dpr = window.devicePixelRatio || 1; W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); nightCv.width = W; nightCv.height = H;
}
window.addEventListener('resize', resize); resize();

// ---------- drawing helpers ----------
function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function ellO(c, x, y, rx, ry, fill, stroke) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); } }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function tri(c, x1, y1, x2, y2, x3, y3) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function poly(c, pts, fill, stroke) { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
function shadow(c, rx, ry) { c.fillStyle = 'rgba(0,0,0,.2)'; ell(c, 0, 0, rx, ry); }
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = clamp(((n >> 16) & 255) * f, 0, 255), g = clamp(((n >> 8) & 255) * f, 0, 255), b = clamp((n & 255) * f, 0, 255); return `rgb(${r | 0},${g | 0},${b | 0})`; }
function acornShape(c, x, y, s, body, cap) {
  c.fillStyle = body || '#b57a3a'; ell(c, x, y, 4.2 * s, 5 * s);
  c.fillStyle = cap || '#6b4423'; c.beginPath(); c.ellipse(x, y - 3 * s, 4.8 * s, 2.6 * s, 0, Math.PI, 0); c.fill(); rr(c, x - 0.8 * s, y - 7.5 * s, 1.6 * s, 3 * s, 0.6 * s);
}
// Iso box centred on origin: w tiles along x, d tiles along y, h px tall. Faces: top, left (P3-P2), right (P2-P1).
function box(c, w, d, h, col, opts) {
  const o = opts || {}; const P0 = iso(-w / 2, -d / 2), P1 = iso(w / 2, -d / 2), P2 = iso(w / 2, d / 2), P3 = iso(-w / 2, d / 2);
  const up = p => ({ x: p.x, y: p.y - h }); const ol = o.outline || 'rgba(0,0,0,.35)'; c.lineWidth = 1;
  poly(c, [P3, P2, up(P2), up(P3)], o.left || shade(col, 0.72), ol);
  poly(c, [P2, P1, up(P1), up(P2)], o.right || shade(col, 0.88), ol);
  poly(c, [up(P0), up(P1), up(P2), up(P3)], o.top || shade(col, 1.08), ol);
  return { P0, P1, P2, P3, up };
}
// A sub-rectangle on the right face (P2->P1) or left face (P3->P2): u along the edge 0..1, v height px.
function facePatch(c, w, d, face, u0, u1, v0, v1, fill, stroke) {
  const P1 = iso(w / 2, -d / 2), P2 = iso(w / 2, d / 2), P3 = iso(-w / 2, d / 2);
  const A = face === 'right' ? P2 : P3, B = face === 'right' ? P1 : P2;
  const L = t => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
  const a = L(u0), b = L(u1);
  poly(c, [{ x: a.x, y: a.y - v0 }, { x: b.x, y: b.y - v0 }, { x: b.x, y: b.y - v1 }, { x: a.x, y: a.y - v1 }], fill, stroke);
}
function moodOf(needs) { const w = { hunger: 1.2, energy: 1.1, fun: 1, social: 1, hygiene: .8, bladder: 1, comfort: .8 }; let s = 0, t = 0; for (const n of NEEDS) { s += (needs[n] || 0) * w[n]; t += w[n]; } return s / t; }
const moodColor = m => `hsl(${Math.round(m * 1.2)}, 72%, 48%)`;
const moodWord = m => m > 85 ? 'Ecstatic' : m > 65 ? 'Happy' : m > 45 ? 'Fine' : m > 25 ? 'Grumpy' : 'Miserable';

// ---------- squirrel (upright, Sims-style sprite) ----------
function drawSquirrel(c, look, o) {
  const f = FURS[look.fur] || FURS[0];
  const t = o.t || 0, anim = o.anim || '', walking = !!o.walking, alpha = o.alpha ?? 1;
  c.save(); c.globalAlpha = alpha; c.scale(o.flip ? -1 : 1, 1); c.lineJoin = 'round';
  const ol = shade(f.dark, 0.7);
  if (anim === 'sleep') { c.translate(-10, -6); c.rotate(-1.25); }
  let bob = walking ? Math.abs(Math.sin(t * 13)) * 2.2 : Math.sin(t * 2) * 0.5, lift = 0, sit = 0;
  if (anim === 'sit') sit = 6;
  if (anim === 'play' || anim === 'dance') lift = Math.abs(Math.sin(t * 8)) * 9;
  if (anim === 'climb' || anim === 'climbsleep') lift = 50 + Math.sin(t * 1.5) * 2;
  c.translate(0, -bob - lift + sit);
  if (anim === 'dance') c.rotate(Math.sin(t * 6) * 0.14);
  if (anim === 'music' || anim === 'talk' || anim === 'read') c.rotate(Math.sin(t * 3) * 0.04);
  if (anim === 'groom') c.rotate(Math.sin(t * 9) * 0.06);
  // tail: lobed bushy curve behind the body
  const tw = look.tail === 'extra' ? 1.3 : look.tail === 'sleek' ? 0.6 : 1;
  c.save(); c.translate(-3, -6); c.rotate(Math.sin(t * (walking ? 9 : 2.4)) * 0.08);
  const lobes = [[0, -2, 7], [-9, -12, 9], [-14, -25, 10], [-13, -38, 10], [-6, -48, 9], [3, -52, 6.5]];
  for (const [x, y, r] of lobes) { c.fillStyle = ol; circ(c, x, y, r * tw + 1.2); }
  for (const [x, y, r] of lobes) { c.fillStyle = f.fur; circ(c, x, y, r * tw); }
  for (const [x, y, r] of lobes.slice(1, 5)) { c.fillStyle = f.belly; c.globalAlpha = alpha * 0.5; circ(c, x + 2, y - 1, r * tw * 0.45); c.globalAlpha = alpha; }
  c.strokeStyle = ol; c.lineWidth = 1; c.lineCap = 'round'; for (const [x, y, r] of lobes.slice(1, 5)) line(c, x - r * tw * 0.9, y - 2, x - r * tw * 1.25, y - 5);
  c.restore();
  // feet
  const sw = walking ? Math.sin(t * 13) * 3 : 0;
  ellO(c, -4.5, -1.5 - (sit ? 1 : 0) + (walking ? Math.max(0, sw) * -0.4 : 0), 4.6, 2.6, f.dark, ol); ellO(c, 4.5, -1.5 - (sit ? 1 : 0) + (walking ? Math.max(0, -sw) * -0.4 : 0), 4.6, 2.6, f.dark, ol);
  // body (plump)
  ellO(c, 0, -14 + sit * 0.2, 9, 10 - sit * 0.2, f.fur, ol);
  ellO(c, 1, -12.5 + sit * 0.2, 5.6, 7, f.belly);
  // arms
  const armY = -16 + sit * 0.2;
  if (anim === 'eat') { ellO(c, 5, -19, 2.6, 4, f.dark, ol); ellO(c, -1, -21 + Math.sin(t * 6), 2.6, 4, f.dark, ol); acornShape(c, 3, -24 + Math.sin(t * 6), 0.9); }
  else if (anim === 'work' || anim === 'read' || anim === 'music') { ellO(c, 7, armY - 2 + Math.sin(t * 10) * 1.5, 4.5, 2.6, f.dark, ol); ellO(c, -7, armY - 2 + Math.cos(t * 10) * 1.5, 4.5, 2.6, f.dark, ol); if (anim === 'read') { c.fillStyle = '#f4ead2'; rr(c, 1, -27, 10, 8, 1); c.strokeStyle = '#8a7250'; line(c, 6, -27, 6, -19); } }
  else if (anim === 'talk') { ellO(c, 9.5, armY - 4 + Math.sin(t * 5) * 2, 2.8, 4.5, f.dark, ol); ellO(c, -9.5, armY + 1, 2.8, 4.5, f.dark, ol); }
  else { ellO(c, -9.5, armY + (walking ? sw : 0) * 0.5, 2.8, 5, f.dark, ol); ellO(c, 9.5, armY - (walking ? sw : 0) * 0.5, 2.8, 5, f.dark, ol); }
  // head: big, sits on the body with no neck
  const hy = -31 + sit * 0.2;
  c.fillStyle = f.fur; c.strokeStyle = ol; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-9.5, hy - 2); c.lineTo(-8.5, hy - 19); c.lineTo(-2, hy - 8); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(9.5, hy - 2); c.lineTo(8.5, hy - 19); c.lineTo(2, hy - 8); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = f.belly; tri(c, -8, hy - 4, -7.6, hy - 15, -3.5, hy - 7.5); tri(c, 8, hy - 4, 7.6, hy - 15, 3.5, hy - 7.5);
  ellO(c, 0, hy, 10.5, 9.5, f.fur, ol);
  ellO(c, 0, hy + 3.5, 5.8, 4.6, f.belly, 'rgba(0,0,0,.12)');
  ellO(c, -7.5, hy + 2.5, 2.6, 1.8, 'rgba(255,140,140,.35)'); ellO(c, 7.5, hy + 2.5, 2.6, 1.8, 'rgba(255,140,140,.35)');
  const asleep = anim === 'sleep' || anim === 'climbsleep';
  const ex = 1;
  if (asleep) { c.strokeStyle = '#222'; c.lineWidth = 1.3; line(c, -6 + ex, hy - 1.5, -2.5 + ex, hy - 1.5); line(c, 2.5 + ex, hy - 1.5, 6 + ex, hy - 1.5); }
  else { c.fillStyle = '#1a1a1a'; circ(c, -4.2 + ex, hy - 1.8, 2); circ(c, 4.2 + ex, hy - 1.8, 2); c.fillStyle = '#fff'; circ(c, -3.6 + ex, hy - 2.5, 0.8); circ(c, 4.8 + ex, hy - 2.5, 0.8); }
  c.fillStyle = '#3a2a22'; ell(c, ex, hy + 1.6, 1.9, 1.3);
  c.strokeStyle = 'rgba(58,42,34,.6)'; c.lineWidth = 0.8; line(c, ex, hy + 2.8, ex, hy + 4.5);
  if (anim === 'talk') { c.strokeStyle = '#3a2a22'; c.lineWidth = 1; c.beginPath(); c.arc(ex, hy + 5, 1.8, 0.1, Math.PI - 0.1); c.stroke(); }
  drawAcc(c, look.acc, hy);
  c.restore();
}
function drawAcc(c, acc, hy) {
  switch (acc) {
    case 'bow': c.fillStyle = '#e04f6a'; tri(c, -7, hy - 13, -14, hy - 18, -13, hy - 8); tri(c, -7, hy - 13, -2, hy - 19, -1, hy - 10); c.fillStyle = '#b63a52'; circ(c, -7, hy - 13, 1.9); break;
    case 'tophat': c.fillStyle = '#222'; rr(c, -12, hy - 10, 24, 2.5, 1); rr(c, -7.5, hy - 23, 15, 13, 1.5); c.fillStyle = '#c33'; rr(c, -7.5, hy - 12.5, 15, 2.4, 0.5); break;
    case 'glasses': c.strokeStyle = '#222'; c.lineWidth = 1.1; c.beginPath(); c.arc(-3.2, hy - 1.8, 3.6, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(5.2, hy - 1.8, 3.6, 0, Math.PI * 2); c.stroke(); line(c, 0.4, hy - 1.8, 1.6, hy - 1.8); c.fillStyle = 'rgba(160,220,255,.35)'; circ(c, -3.2, hy - 1.8, 3.6); circ(c, 5.2, hy - 1.8, 3.6); break;
    case 'scarf': c.fillStyle = '#d9534f'; rr(c, -9.5, hy + 8.5, 19, 4.5, 2); rr(c, 3, hy + 11, 4.5, 10, 1.5); c.fillStyle = '#f5c344'; rr(c, -9.5, hy + 10.3, 19, 1.2, 0.5); break;
    case 'flower': c.fillStyle = '#ff85b3'; for (let i = 0; i < 5; i++) circ(c, -7 + Math.cos(i / 5 * Math.PI * 2) * 3, hy - 13 + Math.sin(i / 5 * Math.PI * 2) * 3, 2); c.fillStyle = '#ffd166'; circ(c, -7, hy - 13, 1.6); break;
    case 'crown': c.fillStyle = '#f5c344'; c.beginPath(); c.moveTo(-6, hy - 9); c.lineTo(-6, hy - 17); c.lineTo(-3, hy - 13); c.lineTo(0, hy - 19); c.lineTo(3, hy - 13); c.lineTo(6, hy - 17); c.lineTo(6, hy - 9); c.closePath(); c.fill(); c.fillStyle = '#e0483f'; circ(c, 0, hy - 12, 1.3); break;
  }
}
function drawPlumbob(c, mood, t) {
  const col = mood > 60 ? '#35d357' : mood > 35 ? '#e4d43a' : '#e0453a';
  const sx = Math.cos(t * 1.9); c.save(); c.scale(Math.max(0.2, Math.abs(sx)), 1);
  const light = sx > 0 ? shade(col, 1.25) : shade(col, 0.8), dark = sx > 0 ? shade(col, 0.8) : shade(col, 1.25);
  c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.35)';
  poly(c, [{ x: 0, y: -16 }, { x: -8, y: 0 }, { x: 0, y: 16 }], light, c.strokeStyle); poly(c, [{ x: 0, y: -16 }, { x: 8, y: 0 }, { x: 0, y: 16 }], dark, c.strokeStyle);
  c.restore();
}

// ---------- objects ----------
function blob(c, x, y, r, col) { c.fillStyle = col; circ(c, x, y, r); }
function drawObject(c, type, rot, t, o) {
  const inUse = o && o.inUse;
  c.save(); if (rot === 2 || rot === 3) c.scale(-1, 1);
  switch (type) {
    case 'oak': {
      shadow(c, 48, 22);
      c.fillStyle = '#5d3b1f'; c.beginPath(); c.moveTo(-14, 2); c.quadraticCurveTo(-8, -20, -9, -70); c.lineTo(9, -70); c.quadraticCurveTo(8, -20, 16, 2); c.closePath(); c.fill();
      c.fillStyle = '#44290f'; c.beginPath(); c.moveTo(2, -70); c.lineTo(9, -70); c.quadraticCurveTo(8, -20, 16, 2); c.lineTo(6, 2); c.closePath(); c.fill();
      c.save(); c.translate(0, -70); c.rotate(Math.sin(t * 0.8) * 0.012);
      blob(c, -36, -12, 32, '#3b7f36'); blob(c, 36, -16, 34, '#3b7f36'); blob(c, 0, -28, 48, '#469341'); blob(c, -16, -50, 32, '#54a84b'); blob(c, 20, -46, 30, '#5db352');
      blob(c, -22, -40, 12, 'rgba(255,255,255,.1)'); blob(c, 14, -60, 9, 'rgba(255,255,255,.12)');
      for (const [ax, ay] of [[-30, -4], [26, -8], [8, -40], [-8, -14], [40, -30]]) acornShape(c, ax, ay, 0.8);
      c.restore(); break;
    }
    case 'sapling': shadow(c, 14, 7); c.fillStyle = '#6b4423'; rr(c, -2.5, -36, 5, 37, 2); blob(c, 0, -46, 17, '#4e9c45'); blob(c, -10, -36, 10, '#469341'); blob(c, 10, -38, 11, '#5db352'); break;
    case 'berrybush': shadow(c, 20, 9); blob(c, -9, -12, 14, '#2f6d2c'); blob(c, 9, -12, 14, '#3b7f36'); blob(c, 0, -20, 15, '#469341'); c.fillStyle = '#6d3fb0'; for (const [x, y] of [[-10, -8], [4, -22], [12, -6], [-2, -14], [8, -16], [-14, -18]]) circ(c, x, y, 2.4); break;
    case 'bush': shadow(c, 20, 9); blob(c, -10, -12, 15, '#2f6d2c'); blob(c, 10, -13, 15, '#2f6d2c'); blob(c, 0, -24, 16, '#3b7f36'); blob(c, 0, -10, 13, '#469341'); break;
    case 'feeder': shadow(c, 12, 6); c.fillStyle = '#6b4423'; rr(c, -2.5, -56, 5, 57, 1); c.fillStyle = '#c49a6c'; rr(c, -14, -70, 28, 16, 2); c.fillStyle = '#8b5a2b'; tri(c, -17, -70, 0, -84, 17, -70); c.fillStyle = '#f3d27a'; for (let i = -10; i <= 10; i += 5) circ(c, i, -56, 1.6); break;
    case 'picnic': {
      shadow(c, 54, 26); c.fillStyle = '#6b4423'; for (const [x, y] of [[-28, -6], [28, -6], [-6, -36], [6, -36]]) rr(c, x - 2.5, y - 22, 5, 24, 1);
      poly(c, [{ x: -54, y: -28 }, { x: 0, y: -56 }, { x: 54, y: -28 }, { x: 0, y: 0 }], '#c9534a', 'rgba(0,0,0,.3)');
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; for (let i = 1; i < 6; i++) { line(c, -54 + i * 9, -28 - i * 4.5, i * 9, -4.5 * i); line(c, -i * 9, -4.5 * i, 54 - i * 9, -28 - i * 4.5); }
      acornShape(c, -6, -34, 1); acornShape(c, 8, -28, 1); break;
    }
    case 'nest': shadow(c, 24, 11); c.fillStyle = '#7a5a36'; ell(c, 0, -8, 23, 12); c.fillStyle = '#4a3420'; ell(c, 0, -10, 16, 7.5); c.strokeStyle = '#a07a4a'; c.lineWidth = 1.2; for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; line(c, Math.cos(a) * 14, -8 + Math.sin(a) * 7, Math.cos(a) * 25, -9 + Math.sin(a) * 13); } break;
    case 'burrow': shadow(c, 48, 22); c.fillStyle = '#8a6a46'; ell(c, 0, -8, 46, 22); c.fillStyle = '#a07e58'; ell(c, -8, -14, 26, 10); c.fillStyle = '#241a10'; ell(c, -4, -9, 17, 11); break;
    case 'hammock': shadow(c, 50, 14); c.fillStyle = '#6b4423'; rr(c, -46, -44, 6, 45, 2); rr(c, 40, -44, 6, 45, 2); c.strokeStyle = '#5aa64c'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(-30, -30); c.quadraticCurveTo(0, -4, 30, -30); c.stroke(); break;
    case 'birdbath': shadow(c, 16, 7); c.fillStyle = '#8d8d96'; ell(c, 0, -1, 14, 6); rr(c, -5, -32, 10, 31, 2); c.fillStyle = '#a3a3ad'; ell(c, 0, -33, 23, 9); c.fillStyle = '#6fb3e0'; ell(c, 0, -34, 18, 6.5); break;
    case 'dustpatch': shadow(c, 26, 12); c.fillStyle = '#c8b48a'; ell(c, 0, -1, 28, 13); c.fillStyle = '#dccba3'; ell(c, -6, -3, 12, 5); break;
    case 'log': shadow(c, 46, 14); c.fillStyle = '#8b5a2b'; rr(c, -40, -24, 80, 22, 11); c.fillStyle = '#6b4423'; rr(c, -40, -12, 80, 10, 5); c.fillStyle = '#c49a6c'; ell(c, -40, -13, 8, 11); break;
    case 'mossbed': shadow(c, 24, 11); c.fillStyle = '#5fae55'; ell(c, 0, -5, 24, 12); c.fillStyle = '#7cc46f'; ell(c, -5, -8, 12, 5); break;
    case 'rock': shadow(c, 20, 9); poly(c, [{ x: -20, y: -2 }, { x: -14, y: -20 }, { x: 2, y: -28 }, { x: 18, y: -16 }, { x: 20, y: -2 }], '#8e8e94', 'rgba(0,0,0,.3)'); poly(c, [{ x: -14, y: -20 }, { x: 2, y: -28 }, { x: 6, y: -16 }, { x: -8, y: -10 }], '#a7a7ae'); blob(c, -8, -4, 6, '#5fae55'); break;
    case 'swing': { shadow(c, 44, 20); c.strokeStyle = '#6b4423'; c.lineWidth = 6; c.lineCap = 'round'; line(c, -48, 0, -32, -80); line(c, -16, 0, -32, -80); line(c, 48, 0, 32, -80); line(c, 16, 0, 32, -80); line(c, -32, -80, 32, -80); const sw = inUse ? Math.sin(t * 2.5) * 0.3 : Math.sin(t * 1.2) * 0.05; c.save(); c.translate(0, -80); c.rotate(sw); c.strokeStyle = '#d6c08a'; c.lineWidth = 2; line(c, 0, 0, 0, 44); c.strokeStyle = '#2a2a2a'; c.lineWidth = 7; c.beginPath(); c.ellipse(0, 54, 14, 10, 0, 0, Math.PI * 2); c.stroke(); c.restore(); break; }
    case 'piano': box(c, 1.9, 0.8, 50, '#6b4a2a'); facePatch(c, 1.9, 0.8, 'right', 0.08, 0.92, 22, 30, '#fff7e8', 'rgba(0,0,0,.3)'); for (let i = 0; i < 9; i++) facePatch(c, 1.9, 0.8, 'right', 0.1 + i * 0.09, 0.14 + i * 0.09, 25, 30, '#222'); break;
    case 'mushrooms': shadow(c, 50, 24); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.4, x = Math.cos(a) * 42, y = Math.sin(a) * 20; c.fillStyle = '#f1e7d0'; rr(c, x - 3.5, y - 15, 7, 15, 2); c.fillStyle = '#c8402f'; ell(c, x, y - 15, 10, 6.5); c.fillStyle = '#fff'; circ(c, x - 4, y - 17, 1.8); circ(c, x + 3, y - 15, 1.6); } break;
    case 'exchange': box(c, 1.9, 0.9, 30, '#8b5a2b'); c.fillStyle = '#6b4423'; rr(c, -40, -78, 5, 48, 1); rr(c, 35, -78, 5, 48, 1); c.fillStyle = '#f4e4c1'; rr(c, -30, -76, 60, 26, 4); c.fillStyle = '#7a4a12'; c.font = 'bold 12px Trebuchet MS, sans-serif'; c.textAlign = 'center'; c.fillText('NUT EXCHANGE', 0, -58); for (const [x, y] of [[-26, -38], [-18, -40], [26, -38], [18, -40]]) acornShape(c, x, y, 0.85); break;
    case 'lantern': { shadow(c, 10, 5); c.fillStyle = '#4a3a2a'; rr(c, -2, -52, 4, 53, 1); c.fillStyle = '#3a2f22'; rr(c, 5, -50, 14, 18, 3); const glow = 0.75 + Math.sin(t * 3) * 0.15; c.fillStyle = `rgba(255,211,107,${glow})`; rr(c, 7, -48, 10, 14, 2); c.fillStyle = `rgba(255,236,160,${glow})`; for (let i = 0; i < 3; i++) circ(c, 12 + Math.sin(t * 2 + i * 2) * 14, -44 + Math.cos(t * 1.7 + i) * 10, 1.4); break; }
    case 'flowers': { shadow(c, 16, 7); c.strokeStyle = '#4b9444'; c.lineWidth = 1.5; const cols = ['#ff7eb6', '#ffd166', '#9b5de5', '#fff', '#ff9f1c']; for (let i = 0; i < 5; i++) { const x = -14 + i * 7, h = 14 + (i % 3) * 5; line(c, x, 0, x + Math.sin(t + i) * 1.5, -h); c.fillStyle = cols[i]; circ(c, x + Math.sin(t + i) * 1.5, -h, 4); c.fillStyle = '#f5c344'; circ(c, x + Math.sin(t + i) * 1.5, -h, 1.6); } break; }
    // ---- indoor furniture ----
    case 'couch': { box(c, 1.9, 0.5, 14, '#6b8f5a'); c.save(); c.translate(...Object.values(iso(0, -0.22))); box(c, 1.9, 0.3, 32, '#6b8f5a'); c.restore(); c.save(); c.translate(...Object.values(iso(-0.85, 0))); box(c, 0.2, 0.75, 22, '#5d7d4e'); c.restore(); c.save(); c.translate(...Object.values(iso(0.85, 0))); box(c, 0.2, 0.75, 22, '#5d7d4e'); c.restore(); facePatch(c, 1.9, 0.5, 'top', 0, 0, 0, 0); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; const m = iso(0, 0.2); line(c, m.x - 8, m.y - 14 - 4, m.x + 8, m.y - 14 + 4); break; }
    case 'armchair': box(c, 0.8, 0.6, 14, '#a8553f'); c.save(); c.translate(...Object.values(iso(0, -0.25))); box(c, 0.8, 0.25, 30, '#a8553f'); c.restore(); c.save(); c.translate(...Object.values(iso(-0.33, 0.05))); box(c, 0.16, 0.6, 22, '#8e4634'); c.restore(); c.save(); c.translate(...Object.values(iso(0.33, 0.05))); box(c, 0.16, 0.6, 22, '#8e4634'); c.restore(); break;
    case 'stool': shadow(c, 12, 6); c.fillStyle = '#f1e7d0'; rr(c, -5, -18, 10, 18, 3); ellO(c, 0, -19, 16, 8, '#c8402f', 'rgba(0,0,0,.3)'); c.fillStyle = '#fff'; circ(c, -6, -21, 2.4); circ(c, 5, -19, 2); break;
    case 'counter': box(c, 0.9, 0.9, 26, '#a97b50', { top: '#e8e4dc' }); facePatch(c, 0.9, 0.9, 'right', 0.15, 0.85, 14, 22, 'rgba(0,0,0,.08)', 'rgba(0,0,0,.3)'); c.fillStyle = '#ddd'; const kn = iso(0.45, 0.1); rr(c, kn.x - 1.5, kn.y - 19, 3, 2, 1); break;
    case 'endtable': box(c, 0.6, 0.6, 20, '#8b5a2b', { top: '#c49a6c' }); break;
    case 'dining': { for (const [x, y] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]) { c.save(); c.translate(...Object.values(iso(x, y))); c.fillStyle = '#6b4423'; rr(c, -2, -26, 4, 26, 1); c.restore(); } for (const [x, y] of [[0, -0.85], [0.85, 0], [0, 0.85], [-0.85, 0]]) { c.save(); c.translate(...Object.values(iso(x, y))); box(c, 0.35, 0.35, 14, '#8b5a2b'); c.restore(); } c.save(); c.translate(0, -26); box(c, 1.3, 1.3, 4, '#c49a6c', { top: '#f4ead2' }); c.restore(); acornShape(c, -8, -34, 1); c.fillStyle = '#c9534a'; ell(c, 10, -31, 8, 4); break; }
    case 'bookshelf': { box(c, 0.9, 0.45, 48, '#7a5230'); const cols = ['#c9534a', '#3b6fa0', '#5aa64c', '#e0a83a', '#9b5de5', '#f4ead2']; for (let s = 0; s < 3; s++) { facePatch(c, 0.9, 0.45, 'right', 0.06, 0.94, 6 + s * 14, 7 + s * 14, '#5a3a1e'); for (let b = 0; b < 6; b++) facePatch(c, 0.9, 0.45, 'right', 0.08 + b * 0.14, 0.2 + b * 0.14, 7 + s * 14, 17 + s * 14 - (b % 2) * 2, cols[(b + s) % 6], 'rgba(0,0,0,.25)'); } break; }
    case 'fern': shadow(c, 12, 6); box(c, 0.4, 0.4, 12, '#b5623a'); c.strokeStyle = '#3b7f36'; c.lineWidth = 3; c.lineCap = 'round'; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.4; c.beginPath(); c.moveTo(0, -12); c.quadraticCurveTo(Math.cos(a) * 20, -12 + Math.sin(a) * 22 - 6, Math.cos(a) * 30, -12 + Math.sin(a) * 26 + 6); c.stroke(); } break;
    case 'sculpture': box(c, 0.5, 0.5, 26, '#9a9aa5', { top: '#c5c5cf' }); acornShape(c, 0, -36, 2.4, '#c98b3f', '#6b4423'); break;
    case 'gnome': shadow(c, 9, 4); c.fillStyle = '#3b6fa0'; rr(c, -6, -18, 12, 18, 3); c.fillStyle = '#f1d7b8'; circ(c, 0, -22, 5); c.fillStyle = '#fff'; ell(c, 0, -17, 5, 4); c.fillStyle = '#c8402f'; tri(c, -6, -25, 6, -25, 0, -40); break;
    case 'tv': { box(c, 0.7, 0.45, 22, '#2a2f38'); facePatch(c, 0.7, 0.45, 'right', 0.08, 0.92, 3, 19, `rgb(${40 + (inUse ? 40 : 0)},${60 + (inUse ? 110 + Math.sin(t * 7) * 30 : 20)},${90 + (inUse ? 120 : 30)})`, 'rgba(0,0,0,.4)'); c.strokeStyle = '#555'; c.lineWidth = 1.5; line(c, 0, -22, -8, -36); line(c, 0, -22, 9, -34); break; }
    case 'stereo': { box(c, 0.6, 0.45, 20, '#333840'); facePatch(c, 0.6, 0.45, 'right', 0.1, 0.9, 12, 17, '#111', 'rgba(0,0,0,.4)'); const p = iso(0.3, 0.1); ellO(c, p.x - 6, p.y - 7, 3.5, 3.5, '#666', '#111'); ellO(c, p.x + 5, p.y - 5, 3.5, 3.5, '#666', '#111'); if (inUse) { c.fillStyle = '#fff'; c.font = 'bold 10px sans-serif'; c.fillText('♪', -12 + Math.sin(t * 4) * 4, -30 - (t * 10 % 12)); c.fillText('♫', 10, -34 - ((t * 10 + 6) % 12)); } break; }
    case 'computer': { box(c, 0.9, 0.6, 22, '#a97b50', { top: '#c49a6c' }); c.save(); c.translate(...Object.values(iso(0, -0.15))); c.translate(0, -22); box(c, 0.45, 0.12, 16, '#2a2f38'); facePatch(c, 0.45, 0.12, 'right', 0.08, 0.92, 2, 14, inUse ? `rgb(90,${160 + Math.sin(t * 9) * 30},220)` : '#3a4556'); c.restore(); const k = iso(0.1, 0.18); c.fillStyle = '#e8e4dc'; rr(c, k.x - 8, k.y - 24, 16, 4, 1); break; }
    case 'phone': box(c, 0.35, 0.35, 8, '#c8402f'); c.fillStyle = '#9aa'; const ph = iso(0, 0); rr(c, ph.x - 7, ph.y - 13, 14, 4, 2); c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(ph.x + 7, ph.y - 11); c.quadraticCurveTo(ph.x + 14, ph.y - 4, ph.x + 8, ph.y - 2); c.stroke(); break;
    case 'fridge': box(c, 0.8, 0.8, 54, '#e9edf0', { left: '#c9d1d8', right: '#dfe5ea', top: '#f4f6f8' }); facePatch(c, 0.8, 0.8, 'right', 0, 1, 32, 33, '#aab2ba'); facePatch(c, 0.8, 0.8, 'right', 0.82, 0.88, 10, 28, '#9aa2aa'); facePatch(c, 0.8, 0.8, 'right', 0.82, 0.88, 36, 48, '#9aa2aa'); break;
    case 'stove': box(c, 0.85, 0.85, 28, '#d8dadc', { top: '#3a3a3a' }); c.fillStyle = '#222'; for (const [x, y] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) { const p = iso(x, y); ell(c, p.x, p.y - 28, 7, 3.5); if (inUse) { c.fillStyle = `rgba(255,${100 + Math.sin(t * 20 + x * 5) * 40},40,.9)`; ell(c, p.x, p.y - 28, 5, 2.5); c.fillStyle = '#222'; } } facePatch(c, 0.85, 0.85, 'right', 0.1, 0.9, 6, 20, '#444', 'rgba(0,0,0,.3)'); facePatch(c, 0.85, 0.85, 'right', 0.2, 0.8, 10, 16, '#2a2a2a'); break;
    case 'espresso': box(c, 0.5, 0.5, 16, '#444a52'); c.fillStyle = '#f4ead2'; const cp = iso(0.1, 0.25); rr(c, cp.x - 4, cp.y - 10, 8, 6, 1); if (inUse) { c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; line(c, cp.x, cp.y - 12, cp.x + 2, cp.y - 18); } break;
    case 'toilet': { c.save(); c.translate(...Object.values(iso(0, -0.2))); box(c, 0.5, 0.25, 32, '#f2f4f5', { left: '#cfd5d9', right: '#e3e8eb' }); c.restore(); c.save(); c.translate(...Object.values(iso(0, 0.12))); box(c, 0.5, 0.55, 16, '#f2f4f5', { left: '#cfd5d9', right: '#e3e8eb' }); const p = iso(0, 0); ellO(c, p.x, p.y - 17, 14, 7, '#fff', 'rgba(0,0,0,.3)'); ellO(c, p.x, p.y - 17, 8, 4, '#9fcfe8'); c.restore(); break; }
    case 'sink': box(c, 0.4, 0.4, 24, '#f2f4f5', { left: '#cfd5d9', right: '#e3e8eb' }); ellO(c, 0, -26, 15, 7.5, '#fff', 'rgba(0,0,0,.3)'); ellO(c, 0, -26, 9, 4.5, '#9fcfe8'); c.strokeStyle = '#9aa'; c.lineWidth = 2; line(c, -8, -30, -8, -40); line(c, -8, -40, -2, -40); break;
    case 'shower': { box(c, 0.9, 0.9, 4, '#dfe5ea'); const P1 = iso(0.45, -0.45), P2 = iso(0.45, 0.45), P3 = iso(-0.45, 0.45), P0 = iso(-0.45, -0.45); poly(c, [P0, P1, { x: P1.x, y: P1.y - 66 }, { x: P0.x, y: P0.y - 66 }], 'rgba(170,205,230,.3)', 'rgba(255,255,255,.7)'); poly(c, [P0, P3, { x: P3.x, y: P3.y - 66 }, { x: P0.x, y: P0.y - 66 }], 'rgba(170,205,230,.3)', 'rgba(255,255,255,.7)'); c.strokeStyle = '#9aa'; c.lineWidth = 3; line(c, P0.x, P0.y - 60, P0.x + 10, P0.y - 56); c.fillStyle = '#9aa'; ell(c, P0.x + 12, P0.y - 55, 5, 2.5); if (inUse) { c.strokeStyle = 'rgba(160,210,255,.8)'; c.lineWidth = 1; for (let i = 0; i < 6; i++) { const yy = ((t * 60 + i * 9) % 50); line(c, P0.x + 8 + i * 2, P0.y - 52 + yy, P0.x + 8 + i * 2, P0.y - 46 + yy); } } break; }
    case 'tub': box(c, 1.9, 0.9, 18, '#f2f4f5', { left: '#cfd5d9', right: '#e3e8eb' }); c.save(); c.translate(0, -18); poly(c, [iso(-0.8, -0.3), iso(0.8, -0.3), iso(0.8, 0.3), iso(-0.8, 0.3)], '#9fcfe8', 'rgba(0,0,0,.2)'); c.restore(); if (inUse) { c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 5; i++) circ(c, -20 + i * 10 + Math.sin(t * 3 + i) * 3, -22 + Math.cos(t * 2 + i) * 2, 3); } break;
    case 'floorlamp': shadow(c, 9, 4); c.fillStyle = '#4a3a2a'; ell(c, 0, -1, 9, 4); rr(c, -1.5, -58, 3, 58, 1); poly(c, [{ x: -14, y: -58 }, { x: 14, y: -58 }, { x: 9, y: -76 }, { x: -9, y: -76 }], '#f4e4c1', 'rgba(0,0,0,.3)'); c.fillStyle = 'rgba(255,220,130,.35)'; ell(c, 0, -58, 14, 4); break;
    case 'tablelamp': c.save(); c.translate(...Object.values(iso(0, 0))); c.fillStyle = '#7a5230'; rr(c, -5, -20, 10, 20, 2); poly(c, [{ x: -10, y: -34 }, { x: 10, y: -34 }, { x: 7, y: -46 }, { x: -7, y: -46 }], '#f4e4c1', 'rgba(0,0,0,.3)'); c.fillStyle = '#4a3a2a'; rr(c, -1, -34, 2, 14, 1); c.restore(); break;
    case 'bed': case 'doublebed': { const w = type === 'bed' ? 0.9 : 1.9; box(c, w, 1.9, 12, '#8b5a2b'); c.save(); c.translate(0, -12); box(c, w - 0.05, 1.85, 8, '#f4f0e6', { outline: 'rgba(0,0,0,.2)' }); c.translate(0, -8); poly(c, [iso(-w / 2, -0.2), iso(w / 2, -0.2), iso(w / 2, 0.92), iso(-w / 2, 0.92)], '#6b8fb5', 'rgba(0,0,0,.25)'); poly(c, [iso(-w / 2, -0.2), iso(w / 2, -0.2), iso(w / 2, -0.05), iso(-w / 2, -0.05)], '#f8f8f4'); for (const px of type === 'bed' ? [0] : [-0.45, 0.45]) { const p = iso(px, -0.6); ellO(c, p.x, p.y - 3, 13, 6, '#fff', 'rgba(0,0,0,.25)'); } c.restore(); c.save(); c.translate(...Object.values(iso(0, -0.95))); box(c, w, 0.1, 30, '#8b5a2b'); c.restore(); break; }
    case 'easel': shadow(c, 14, 6); c.strokeStyle = '#8b5a2b'; c.lineWidth = 3; line(c, -12, 0, -4, -58); line(c, 12, 0, 4, -58); line(c, 0, -20, 0, -62); c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.fillRect(-16, -52, 32, 26); c.strokeRect(-16, -52, 32, 26); blob(c, -6, -42, 5, '#5aa64c'); blob(c, 6, -36, 6, '#3b6fa0'); blob(c, 2, -46, 3, '#e0a83a'); break;
    case 'mirror': shadow(c, 12, 5); c.strokeStyle = '#8b5a2b'; c.lineWidth = 3; line(c, -8, 0, 0, -12); line(c, 8, 0, 0, -12); ellO(c, 0, -36, 14, 24, '#c9d7e2', '#8b5a2b'); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.8)'; line(c, -6, -50, -10, -30); break;
    case 'mailbox': shadow(c, 8, 4); c.fillStyle = '#6b4423'; rr(c, -2, -28, 4, 28, 1); c.save(); c.translate(0, -28); box(c, 0.35, 0.6, 14, '#8a8f96', { top: '#b5bac0' }); c.restore(); c.fillStyle = '#c8402f'; rr(c, 8, -44, 3, 10, 1); break;
    case 'trashcan': shadow(c, 11, 5); c.fillStyle = '#7d8289'; rr(c, -9, -26, 18, 26, 3); ellO(c, 0, -26, 10, 4.5, '#9aa0a7', 'rgba(0,0,0,.3)'); c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1; line(c, -5, -22, -5, -4); line(c, 3, -22, 3, -4); break;
    default: box(c, 0.8, 0.8, 24, '#999');
  }
  c.restore();
}
const FLOOR_COLORS = { f_hardwood: '#b7804a', f_darkwood: '#7a4f2e', f_checker: '#f0efe8', f_stone: '#8f9398', f_lino: '#efe6cf', f_carpet_red: '#9c3b3b', f_carpet_blue: '#4e6a9a', f_carpet_green: '#5f8a5a', f_path: '#b9ad95', f_deck: '#b0804e' };
function drawFloorPattern(c, type, seed) { // in base units, origin = tile centre, clipped to diamond by the caller
  const col = FLOOR_COLORS[type] || '#aaa';
  poly(c, [iso(-0.5, -0.5), iso(0.5, -0.5), iso(0.5, 0.5), iso(-0.5, 0.5)], col);
  c.lineWidth = 1;
  if (type === 'f_hardwood' || type === 'f_darkwood' || type === 'f_deck') {
    c.strokeStyle = 'rgba(0,0,0,.22)'; const along = type === 'f_deck' ? 'y' : 'x';
    for (let i = 1; i < 4; i++) { const k = -0.5 + i / 4; const a = along === 'x' ? iso(-0.5, k) : iso(k, -0.5), b = along === 'x' ? iso(0.5, k) : iso(k, 0.5); line(c, a.x, a.y, b.x, b.y); }
    const j = (seed * 7) % 4; const k = -0.5 + (j + 0.5) / 4; const a = along === 'x' ? iso(k, -0.5 + (seed % 3) / 4) : iso(-0.5 + (seed % 3) / 4, k); const b = along === 'x' ? iso(k, -0.5 + (seed % 3) / 4 + 0.25) : iso(-0.5 + (seed % 3) / 4 + 0.25, k); line(c, a.x, a.y, b.x, b.y);
  } else if (type === 'f_checker') {
    poly(c, [iso(-0.5, -0.5), iso(0, -0.5), iso(0, 0), iso(-0.5, 0)], '#2b2b30'); poly(c, [iso(0, 0), iso(0.5, 0), iso(0.5, 0.5), iso(0, 0.5)], '#2b2b30');
  } else if (type === 'f_stone') {
    c.strokeStyle = 'rgba(0,0,0,.25)'; const a = iso(0, -0.5), b = iso(0, 0.5), d = iso(-0.5, 0), e = iso(0.5, 0); line(c, a.x, a.y, b.x, b.y); line(c, d.x, d.y, e.x, e.y); c.fillStyle = 'rgba(255,255,255,.08)'; ell(c, (seed % 5 - 2) * 4, (seed % 3 - 1) * 3, 8, 4);
  } else if (type === 'f_lino') { c.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < 4; i++) circ(c, (i - 1.5) * 10, (i % 2) * 6 - 3, 1.2); }
  else if (type.startsWith('f_carpet')) { c.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 6; i++) ell(c, Math.sin(seed + i * 2.1) * 20, Math.cos(seed * 1.3 + i) * 9, 3, 1.5); }
  else if (type === 'f_path') { c.fillStyle = '#9b8f78'; for (let i = 0; i < 7; i++) { const a = seed * 13.7 + i * 2.3; ell(c, Math.cos(a) * 18, Math.sin(a) * 8, 3.5, 2.2); } }
  c.strokeStyle = 'rgba(0,0,0,.12)'; poly(c, [iso(-0.5, -0.5), iso(0.5, -0.5), iso(0.5, 0.5), iso(-0.5, 0.5)], null, c.strokeStyle);
}
function footprintPts(x, y, w, h) { return [toScreen(x, y), toScreen(x + w, y), toScreen(x + w, y + h), toScreen(x, y + h)]; }
function strokeDiamond(c, pts, stroke, fill) { c.lineWidth = 2; poly(c, pts, fill, stroke); }

// ---------- walls ----------
function wallEnds(wl) { return wl.side === 'n' ? [toScreen(wl.x, wl.y), toScreen(wl.x + 1, wl.y)] : [toScreen(wl.x, wl.y), toScreen(wl.x, wl.y + 1)]; }
function wallShort(wl, me) {
  if (S.wallsMode === 'up') return false; if (S.wallsMode === 'down') return true;
  if (!me) return false;
  const depth = wl.x + wl.y + 0.5, md = me.rx + me.ry;
  if (depth < md - 0.3) return false;
  const [a, b] = wallEnds(wl); const mx = (a.x + b.x) / 2; const p = toScreen(me.rx, me.ry);
  return Math.abs(mx - p.x) < 170 * cam.zoom && (a.y + b.y) / 2 < p.y + 120 * cam.zoom;
}
function drawWall(c, wl, short, ghost) {
  const z = cam.zoom, h = (short ? WALL_DOWN : WALL_UP) * z; const [A, B] = wallEnds(wl);
  const wp = WALLPAPERS[wl.paper] || WALLPAPERS.plaster; const base = wp.color; const faceCol = wl.side === 'n' ? shade(base, 1.0) : shade(base, 0.82);
  const face = [A, B, { x: B.x, y: B.y - h }, { x: A.x, y: A.y - h }];
  c.save(); if (ghost) c.globalAlpha = 0.55;
  // top cap (thickness)
  const th = 3 * z; poly(c, [{ x: A.x - th, y: A.y - h - th * 0.5 }, { x: B.x - th, y: B.y - h - th * 0.5 }, { x: B.x, y: B.y - h }, { x: A.x, y: A.y - h }], '#f6f3ec', 'rgba(0,0,0,.35)');
  poly(c, face, ghost ? '#7fe36b' : faceCol, 'rgba(0,0,0,.35)');
  if (!ghost && !short) { // wallpaper pattern
    c.save(); c.beginPath(); c.moveTo(face[0].x, face[0].y); for (let i = 1; i < 4; i++) c.lineTo(face[i].x, face[i].y); c.closePath(); c.clip();
    c.strokeStyle = wl.side === 'n' ? wp.accent : shade(wp.accent, 0.82); c.lineWidth = 1.2 * z; c.fillStyle = c.strokeStyle;
    const L = u => ({ x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u });
    if (wp.pattern === 'stripes') for (let u = 0.1; u < 1; u += 0.2) { const p = L(u); line(c, p.x, p.y, p.x, p.y - h); }
    if (wp.pattern === 'wood') for (let v = 0.2; v < 1; v += 0.2) line(c, A.x, A.y - h * v, B.x, B.y - h * v);
    if (wp.pattern === 'dots') for (let u = 0.15; u < 1; u += 0.3) for (let v = 0.2; v < 1; v += 0.3) { const p = L(u + (v > 0.4 && v < 0.7 ? 0.15 : 0)); circ(c, p.x, p.y - h * v, 1.6 * z); }
    if (wp.pattern === 'brick') { for (let v = 0.15; v < 1; v += 0.17) line(c, A.x, A.y - h * v, B.x, B.y - h * v); for (let v = 0, r = 0; v < 1; v += 0.17, r++) for (let u = (r % 2) * 0.17; u < 1; u += 0.34) { const p = L(u); line(c, p.x, p.y - h * v, p.x, p.y - h * (v + 0.17)); } }
    // baseboard
    c.fillStyle = 'rgba(0,0,0,.12)'; poly(c, [A, B, { x: B.x, y: B.y - 4 * z }, { x: A.x, y: A.y - 4 * z }], c.fillStyle);
    c.restore();
  }
  const L = u => ({ x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u });
  if (wl.kind === 'door') {
    const a = L(0.14), b = L(0.86); const dh = short ? h : h * 0.82;
    poly(c, [a, b, { x: b.x, y: b.y - dh }, { x: a.x, y: a.y - dh }], short ? 'rgba(90,60,30,.55)' : '#7a4a22', 'rgba(0,0,0,.45)');
    if (!short) { const i = L(0.2), j = L(0.8); poly(c, [{ x: i.x, y: i.y - dh * 0.1 }, { x: j.x, y: j.y - dh * 0.1 }, { x: j.x, y: j.y - dh * 0.9 }, { x: i.x, y: i.y - dh * 0.9 }], null, 'rgba(0,0,0,.25)'); const k = L(0.74); c.fillStyle = '#f5c344'; circ(c, k.x, k.y - dh * 0.45, 1.8 * z); }
  } else if (wl.kind === 'window' && !short) {
    const a = L(0.18), b = L(0.82); poly(c, [{ x: a.x, y: a.y - h * 0.35 }, { x: b.x, y: b.y - h * 0.35 }, { x: b.x, y: b.y - h * 0.82 }, { x: a.x, y: a.y - h * 0.82 }], 'rgba(170,215,245,.9)', '#fff');
    const m = L(0.5); c.strokeStyle = '#fff'; c.lineWidth = 1.5 * z; line(c, m.x, m.y - h * 0.35, m.x, m.y - h * 0.82); line(c, a.x, a.y - h * 0.585, b.x, b.y - h * 0.585);
  }
  c.restore();
}

// ---------- rendering ----------
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
function nightAlpha(h) { if (h >= 7 && h <= 18) return 0; if (h > 18 && h < 21) return (h - 18) / 3 * 0.62; if (h >= 21 || h < 5) return 0.62; return (7 - h) / 2 * 0.62; }
let lastFrame = performance.now();
function frame(now) { const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now; update(dt); draw(now / 1000); requestAnimationFrame(frame); }
function update(dt) {
  const sp = 520 * dt;
  if (!chatFocused()) {
    if (keys.has('a') || keys.has('arrowleft')) cam.x += sp; if (keys.has('d') || keys.has('arrowright')) cam.x -= sp;
    if (keys.has('w') || keys.has('arrowup')) cam.y += sp; if (keys.has('s') || keys.has('arrowdown')) cam.y -= sp;
  }
  for (const sq of S.sqs.values()) {
    if (sq.rx === undefined || Math.hypot(sq.x - sq.rx, sq.y - sq.ry) > 3) { sq.rx = sq.x; sq.ry = sq.y; }
    const k = Math.min(1, dt * 10); sq.rx += (sq.x - sq.rx) * k; sq.ry += (sq.y - sq.ry) * k; sq.animT = (sq.animT || 0) + dt;
  }
  for (const p of S.particles) p.t += dt; S.particles = S.particles.filter(p => p.t < 1.8);
  computeHover();
}
function draw(t) {
  const c = ctx; c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#355c38'); g.addColorStop(1, '#223d25'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (!S.world) return;
  const { w, h, ground } = S.world, z = cam.zoom; const me = S.sqs.get(S.meId);
  const floorAt = new Map(); for (const o of S.objects) if (OBJECTS[o.type].floor) floorAt.set(o.x + ',' + o.y, o);
  // ground
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = toScreen(x + 0.5, y + 0.5);
    if (p.x < -TW * z || p.x > W + TW * z || p.y < -TH * z || p.y > H + TH * z) continue;
    const g0 = ground[y][x], hw = TW / 2 * z, hh = TH / 2 * z, r = hash(x, y);
    const fl = floorAt.get(x + ',' + y);
    if (fl) { c.save(); c.translate(p.x, p.y); c.scale(z, z); drawFloorPattern(c, fl.type, fl.id); c.restore(); continue; }
    c.beginPath(); c.moveTo(p.x, p.y - hh); c.lineTo(p.x + hw, p.y); c.lineTo(p.x, p.y + hh); c.lineTo(p.x - hw, p.y); c.closePath();
    if (g0 === 'w') { const s = Math.sin(t * 1.5 + x * 0.8 + y * 1.1) * 0.5 + 0.5; c.fillStyle = `rgb(${80 + s * 20},${150 + s * 25},${210 + s * 20})`; }
    else if (g0 === 's') c.fillStyle = r > 0.5 ? '#cfcfca' : '#c6c6c1';
    else if (g0 === 'r') c.fillStyle = r > 0.5 ? '#4b4c52' : '#47484e';
    else c.fillStyle = r > 0.66 ? '#6db35c' : r > 0.33 ? '#68ad57' : '#64a853';
    c.fill();
    if (S.mode !== 'live') { c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1; c.stroke(); }
    if (g0 === 's') { c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1; c.stroke(); }
    if (g0 === 'r' && y === h - 1) { c.strokeStyle = '#e2c04a'; c.lineWidth = 2 * z; c.setLineDash([10 * z, 10 * z]); line(c, p.x - hw, p.y, p.x, p.y - hh); c.setLineDash([]); }
    if (g0 === 'g' && r > 0.74) { c.fillStyle = 'rgba(40,110,40,.3)'; ell(c, p.x + (r - 0.85) * 60 * z, p.y + (r - 0.87) * 20 * z, 4 * z, 2 * z); }
  }
  // hover highlight
  if (S.mode === 'live' && S.hover.obj && !OBJECTS[S.hover.obj.type].floor) { const f = fp(S.hover.obj); strokeDiamond(c, footprintPts(S.hover.obj.x, S.hover.obj.y, f.w, f.h), 'rgba(255,230,120,.95)', 'rgba(255,230,120,.18)'); }
  if (S.mode === 'live' && S.hover.tile && !S.hover.obj && !S.hover.sq) strokeDiamond(c, footprintPts(S.hover.tile.x, S.hover.tile.y, 1, 1), 'rgba(255,255,255,.5)');
  // floor ghost
  const drag = S.bld.drag;
  if (S.mode === 'build' && S.bld.tool === 'floor' && (drag || S.hover.tile)) {
    const tiles = drag ? dragTiles(drag) : [S.hover.tile];
    for (const tl of tiles) { const p = toScreen(tl.x + 0.5, tl.y + 0.5); c.save(); c.globalAlpha = 0.7; c.translate(p.x, p.y); c.scale(z, z); drawFloorPattern(c, S.bld.floor, 1); c.restore(); }
  }
  // entities: objects, squirrels, walls
  const ents = [];
  for (const o of S.objects) { if (OBJECTS[o.type].floor) continue; const f = fp(o); ents.push({ kind: 'o', o, depth: o.x + o.y + f.w + f.h - 1 }); }
  for (const sq of S.sqs.values()) { sq.place = placeSquirrel(sq); ents.push({ kind: 's', sq, depth: sq.place.depth }); }
  for (const wl of S.walls) ents.push({ kind: 'w', wl, depth: wl.x + wl.y + 0.5 });
  if (S.mode === 'build' && drag && (S.bld.tool === 'wall' || S.bld.tool === 'unwall')) for (const seg of dragSegs(drag)) ents.push({ kind: 'gw', wl: { ...seg, paper: S.bld.paper, kind: 'wall' }, depth: seg.x + seg.y + 0.5 });
  ents.sort((a, b) => a.depth - b.depth);
  const inUse = new Set(); for (const sq of S.sqs.values()) if (sq.act && sq.act.objId) inUse.add(sq.act.objId);
  for (const e of ents) {
    if (e.kind === 'o') { const f = fp(e.o); const p = toScreen(e.o.x + f.w / 2, e.o.y + f.h / 2); c.save(); c.translate(p.x, p.y); c.scale(z, z); drawObject(c, e.o.type, e.o.rot, t, { inUse: inUse.has(e.o.id) }); c.restore(); }
    else if (e.kind === 's') drawSquirrelWorld(c, e.sq, t);
    else if (e.kind === 'w') drawWall(c, e.wl, wallShort(e.wl, me), false);
    else drawWall(c, e.wl, true, true);
  }
  // wall-tool hover highlight / object ghost
  if (S.mode === 'build' && S.hover.wall && ['door', 'window', 'plainwall', 'paper', 'bulldoze'].includes(S.bld.tool)) {
    const [A, B] = wallEnds(S.hover.wall); const hgt = (wallShort(S.hover.wall, me) ? WALL_DOWN : WALL_UP) * z;
    poly(c, [A, B, { x: B.x, y: B.y - hgt }, { x: A.x, y: A.y - hgt }], S.bld.tool === 'bulldoze' ? 'rgba(255,90,90,.35)' : 'rgba(120,255,120,.35)', '#fff');
  }
  const ghostType = S.mode === 'buy' && !S.buy.sell ? S.buy.type : (S.mode === 'build' && S.bld.tool === 'garden' ? S.bld.type : null);
  const ghostRot = S.mode === 'buy' ? S.buy.rot : S.bld.rot;
  if (ghostType && S.hover.tile) {
    const def = OBJECTS[ghostType]; const f = { w: ghostRot % 2 ? def.h : def.w, h: ghostRot % 2 ? def.w : def.h };
    const ok = canPlaceClient(ghostType, S.hover.tile.x, S.hover.tile.y, ghostRot);
    strokeDiamond(c, footprintPts(S.hover.tile.x, S.hover.tile.y, f.w, f.h), ok ? 'rgba(120,255,120,.9)' : 'rgba(255,90,90,.9)', ok ? 'rgba(120,255,120,.25)' : 'rgba(255,90,90,.25)');
    const p = toScreen(S.hover.tile.x + f.w / 2, S.hover.tile.y + f.h / 2);
    c.save(); c.globalAlpha = 0.65; c.translate(p.x, p.y); c.scale(z, z); drawObject(c, ghostType, ghostRot, t, {}); c.restore();
  }
  if (((S.mode === 'buy' && S.buy.sell) || (S.mode === 'build' && S.bld.tool === 'bulldoze')) && S.hover.obj) { const f = fp(S.hover.obj); strokeDiamond(c, footprintPts(S.hover.obj.x, S.hover.obj.y, f.w, f.h), 'rgba(255,90,90,.95)', 'rgba(255,90,90,.25)'); }
  for (const sq of S.sqs.values()) drawSquirrelOverlay(c, sq, t);
  // night
  const hour = S.time / 60, na = nightAlpha(hour);
  const warm = Math.max(0, 1 - Math.abs(hour - 18.6) / 1.4) * 0.2 + Math.max(0, 1 - Math.abs(hour - 6.2) / 1.4) * 0.16;
  if (warm > 0) { c.fillStyle = `rgba(255,140,60,${warm})`; c.fillRect(0, 0, W, H); }
  if (na > 0) {
    nctx.clearRect(0, 0, W, H); nctx.fillStyle = `rgba(12,20,56,${na})`; nctx.fillRect(0, 0, W, H); nctx.globalCompositeOperation = 'destination-out';
    for (const o of S.objects) {
      if (!OBJECTS[o.type].light) continue; const f = fp(o); const p = toScreen(o.x + f.w / 2, o.y + f.h / 2);
      const r = (o.type === 'tv' || o.type === 'computer' ? 70 : 120) * z; const gr = nctx.createRadialGradient(p.x, p.y - 30 * z, 0, p.x, p.y - 30 * z, r); gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      nctx.fillStyle = gr; nctx.fillRect(p.x - r, p.y - 30 * z - r, r * 2, r * 2);
    }
    nctx.globalCompositeOperation = 'source-over'; c.drawImage(nightCv, 0, 0);
  }
  for (const p of S.particles) {
    const sp = toScreen(p.x, p.y); const a = 1 - p.t / 1.8;
    c.globalAlpha = a; c.font = `bold ${16 * z}px Trebuchet MS, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.4)'; c.fillStyle = '#fff';
    const y = sp.y - 60 * z - p.t * 34 * z; c.strokeText(p.text, sp.x, y); c.fillText(p.text, sp.x, y); c.globalAlpha = 1;
  }
}
function facingLeft(dir) { return (Math.cos(dir) - Math.sin(dir)) < 0; }
const SEAT_LIFT = { couch: 12, armchair: 12, stool: 14, log: 16, toilet: 14, mossbed: 4, rock: 16, bed: 20, doublebed: 20, hammock: 30, burrow: 4, nest: 6, tub: 10 };
// Where to draw a squirrel: on top of the furniture it is sitting or lying on, else at its feet.
function placeSquirrel(sq) {
  const a = sq.act;
  if (a && a.objId && (a.anim === 'sit' || a.anim === 'sleep' || a.anim === 'groom')) {
    const o = S.objects.find(x => x.id === a.objId);
    if (o && SEAT_LIFT[o.type] != null) {
      const f = fp(o); const users = [...S.sqs.values()].filter(s => s.act && s.act.objId === o.id).sort((p, q) => p.id < q.id ? -1 : 1);
      const idx = users.indexOf(sq), n = users.length; const along = n > 1 ? (idx / (n - 1) - 0.5) * 0.9 : 0;
      const x = o.x + f.w / 2 + (f.w >= f.h ? along * (f.w - 0.5) : 0), y = o.y + f.h / 2 + (f.h > f.w ? along * (f.h - 0.5) : 0);
      return { x, y, lift: SEAT_LIFT[o.type], depth: o.x + o.y + f.w + f.h - 1 + 0.01 };
    }
  }
  return { x: sq.rx, y: sq.ry, lift: 0, depth: sq.rx + sq.ry + 0.001 };
}
function drawSquirrelWorld(c, sq, t) {
  const pl = sq.place || placeSquirrel(sq); const p = toScreen(pl.x, pl.y), z = cam.zoom; const anim = sq.act ? sq.act.anim : '';
  c.save(); c.translate(p.x, p.y - pl.lift * z); c.scale(z * 0.95, z * 0.95); if (!pl.lift) shadow(c, 10, 5);
  drawSquirrel(c, sq.look, { t: sq.animT, walking: !!sq.mv, anim, flip: facingLeft(sq.dir), alpha: anim === 'hide' ? 0.25 : 1 });
  c.restore();
}
function drawSquirrelOverlay(c, sq, t) {
  const pl = sq.place || placeSquirrel(sq); const p = toScreen(pl.x, pl.y), z = cam.zoom, isMe = sq.id === S.meId;
  const lift = ((sq.act && (sq.act.anim === 'climb' || sq.act.anim === 'climbsleep')) ? 50 : 0) + pl.lift;
  const top = p.y - (58 + lift) * z;
  c.font = `bold ${12 * z}px Trebuchet MS, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3 * z; c.strokeStyle = 'rgba(0,0,0,.5)'; c.fillStyle = isMe ? '#9fe870' : '#fff';
  c.strokeText(sq.name, p.x, p.y + 16 * z); c.fillText(sq.name, p.x, p.y + 16 * z);
  const bobY = Math.sin(t * 3) * 3 * z;
  if (isMe) { c.save(); c.translate(p.x, top - 22 * z + bobY); c.scale(z, z); drawPlumbob(c, moodOf(sq.needs), t); c.restore(); }
  if (sq.act) {
    c.font = `${15 * z}px sans-serif`; c.fillText(sq.act.emoji, p.x + (isMe ? 18 : 0) * z, top - (isMe ? 10 : 6) * z + bobY * 0.5);
    const bw = 34 * z; c.fillStyle = 'rgba(0,0,0,.4)'; rr(c, p.x - bw / 2, top, bw, 4 * z, 2 * z); c.fillStyle = '#7fe36b'; rr(c, p.x - bw / 2, top, bw * clamp(sq.act.p, 0, 1), 4 * z, 2 * z);
    if (sq.act.anim === 'sleep' || sq.act.anim === 'climbsleep') { c.fillStyle = 'rgba(255,255,255,.9)'; c.font = `bold ${11 * z}px Trebuchet MS`; const k = (t * 0.8) % 1; c.globalAlpha = 1 - k; c.fillText('z', p.x + (10 + k * 10) * z, top - (k * 18) * z); c.globalAlpha = 1; }
  }
  if (sq.say) {
    c.font = `bold ${12 * z}px Trebuchet MS, sans-serif`; const txt = sq.say.length > 40 ? sq.say.slice(0, 38) + '…' : sq.say; const tw = Math.min(c.measureText(txt).width, 220 * z) + 16 * z, bh = 22 * z;
    const bx = p.x - tw / 2, by = top - (isMe ? 48 : 30) * z - bh;
    c.fillStyle = 'rgba(255,255,255,.95)'; rr(c, bx, by, tw, bh, 8 * z); tri(c, p.x - 5 * z, by + bh - 1, p.x + 5 * z, by + bh - 1, p.x, by + bh + 6 * z);
    c.fillStyle = '#1d2b3a'; c.textAlign = 'center'; c.fillText(txt, p.x, by + bh * 0.68, tw - 10 * z);
  }
}

// ---------- hover / hit testing ----------
function nearestWall(mx, my, existingOnly) {
  if (!S.hover.tile) return null; const z = cam.zoom; let best = null, bd = 22 * z;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const side of ['n', 'w']) {
    const x = S.hover.tile.x + dx, y = S.hover.tile.y + dy; const wl = S.wallMap.get(wkey(x, y, side));
    if (existingOnly && !wl) continue;
    const seg = wl || { x, y, side }; const [A, B] = wallEnds(seg); const hgt = (wl && !wallShort(wl, S.sqs.get(S.meId)) ? WALL_UP : WALL_DOWN) * z;
    const mxp = (A.x + B.x) / 2, myp = (A.y + B.y) / 2 - hgt / 2; const d = Math.hypot(mx - mxp, (my - myp) * 0.8);
    if (d < bd) { bd = d; best = seg; }
  }
  return best;
}
function computeHover() {
  S.hover = { tile: null, obj: null, sq: null, wall: null };
  if (!S.world || mouse.x < 0) return;
  const wpos = toWorld(mouse.x, mouse.y); const tx = Math.floor(wpos.x), ty = Math.floor(wpos.y);
  if (tx >= 0 && ty >= 0 && tx < S.world.w && ty < S.world.h) S.hover.tile = { x: tx, y: ty };
  const z = cam.zoom;
  if (S.mode === 'live') {
    let best = null, bd = -Infinity;
    for (const sq of S.sqs.values()) { const pl = sq.place || placeSquirrel(sq); const p = toScreen(pl.x, pl.y - 0); p.y -= pl.lift * z; const lift = (sq.act && sq.act.anim.startsWith('climb')) ? 50 * z : 0; if (Math.abs(mouse.x - p.x) < 17 * z && mouse.y < p.y + 6 * z && mouse.y > p.y - 62 * z - lift) { const d = sq.rx + sq.ry; if (d > bd) { bd = d; best = sq; } } }
    if (best) { S.hover.sq = best; canvas.style.cursor = 'pointer'; return; }
  }
  if (S.mode === 'build' && ['door', 'window', 'plainwall', 'paper', 'bulldoze'].includes(S.bld.tool)) S.hover.wall = nearestWall(mouse.x, mouse.y, true);
  let obj = null, od = -Infinity;
  const wantFloors = (S.mode === 'buy' && S.buy.sell) || (S.mode === 'build' && S.bld.tool === 'bulldoze');
  for (const o of S.objects) {
    const def = OBJECTS[o.type]; const f = fp(o);
    const onTile = S.hover.tile && S.hover.tile.x >= o.x && S.hover.tile.x < o.x + f.w && S.hover.tile.y >= o.y && S.hover.tile.y < o.y + f.h;
    let hit = onTile && (!def.floor || wantFloors);
    if (!hit && !def.floor) { const p = toScreen(o.x + f.w / 2, o.y + f.h / 2); const hgt = (HEIGHTS[o.type] || 40) * z; hit = Math.abs(mouse.x - p.x) < f.w * 26 * z && mouse.y > p.y - hgt && mouse.y < p.y + f.h * 8 * z; }
    if (hit) { const d = o.x + o.y + f.w + f.h + (def.floor ? -100 : 0) + (onTile ? 50 : 0); if (d > od) { od = d; obj = o; } }
  }
  if (S.hover.wall && S.mode === 'build' && S.bld.tool !== 'bulldoze') obj = null;
  S.hover.obj = obj;
  canvas.style.cursor = (obj && (S.mode !== 'live' || OBJECTS[obj.type].actions.length)) || S.hover.wall ? 'pointer' : (S.mode === 'build' ? 'crosshair' : 'default');
}
function canPlaceClient(type, x, y, rot) {
  const def = OBJECTS[type]; const w = rot % 2 ? def.h : def.w, h = rot % 2 ? def.w : def.h; const tiles = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const tx = x + dx, ty = y + dy; tiles.push({ x: tx, y: ty });
    if (tx < 0 || ty < 0 || tx >= S.world.w || ty >= S.world.h || 'wr'.includes(S.world.ground[ty][tx])) return false;
    for (const o of S.objects) { const od = OBJECTS[o.type]; if (!!od.floor !== !!def.floor) continue; const f = fp(o); if (tx >= o.x && tx < o.x + f.w && ty >= o.y && ty < o.y + f.h) return false; }
  }
  if (!def.floor) for (const a of tiles) for (const b of tiles) if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 && wallBetween(a.x, a.y, b.x, b.y)) return false;
  return true;
}
function wallBetween(x, y, nx, ny) {
  let wl = null;
  if (ny === y - 1) wl = S.wallMap.get(wkey(x, y, 'n')); else if (ny === y + 1) wl = S.wallMap.get(wkey(x, y + 1, 'n')); else if (nx === x - 1) wl = S.wallMap.get(wkey(x, y, 'w')); else if (nx === x + 1) wl = S.wallMap.get(wkey(x + 1, y, 'w'));
  return !!(wl && wl.kind !== 'door');
}
function dragSegs(d) {
  const ax = Math.round(d.sx), ay = Math.round(d.sy), bx = Math.round(d.cx), by = Math.round(d.cy);
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) return DEFS.wallRun(ax, ay, bx, ay); return DEFS.wallRun(ax, ay, ax, by);
}
function dragTiles(d) {
  const x0 = Math.min(Math.floor(d.sx), Math.floor(d.cx)), x1 = Math.max(Math.floor(d.sx), Math.floor(d.cx)), y0 = Math.min(Math.floor(d.sy), Math.floor(d.cy)), y1 = Math.max(Math.floor(d.sy), Math.floor(d.cy));
  const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < S.world.w && y < S.world.h) out.push({ x, y }); return out.slice(0, 200);
}

// ---------- input ----------
const dragTool = () => S.mode === 'build' && ['wall', 'unwall', 'floor'].includes(S.bld.tool);
canvas.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (S.bld.drag) { const w = toWorld(e.clientX, e.clientY); S.bld.drag.cx = w.x; S.bld.drag.cy = w.y; return; }
  if (mouse.down) { const dx = e.clientX - mouse.sx, dy = e.clientY - mouse.sy; if (mouse.dragging || Math.hypot(dx, dy) > 5) { mouse.dragging = true; cam.x += e.clientX - mouse.lx; cam.y += e.clientY - mouse.ly; } mouse.lx = e.clientX; mouse.ly = e.clientY; }
});
canvas.addEventListener('mouseleave', () => { mouse.x = -1; mouse.down = false; S.bld.drag = null; });
canvas.addEventListener('mousedown', e => {
  closeMenu(); mouse.button = e.button;
  if (e.button === 0 && dragTool() && S.world) { const w = toWorld(e.clientX, e.clientY); S.bld.drag = { sx: w.x, sy: w.y, cx: w.x, cy: w.y }; return; }
  mouse.down = true; mouse.dragging = false; mouse.sx = mouse.lx = e.clientX; mouse.sy = mouse.ly = e.clientY;
});
canvas.addEventListener('mouseup', e => {
  if (S.bld.drag && e.button === 0) { const d = S.bld.drag; S.bld.drag = null; finishDrag(d); return; }
  const wasDrag = mouse.dragging; mouse.down = false; mouse.dragging = false;
  if (wasDrag) return;
  if (e.button === 2) { if (S.mode === 'buy') { S.buy.type = null; S.buy.sell = false; refreshCatalog(); } else if (S.mode === 'build') { S.bld.type = null; refreshCatalog(); } else send({ t: 'cancel' }); return; }
  if (e.button === 0) onClick(e.clientX, e.clientY);
});
function finishDrag(d) {
  if (S.bld.tool === 'floor') { const tiles = dragTiles(d); if (tiles.length) send({ t: 'floor', type: S.bld.floor, tiles }); }
  else { const segs = dragSegs(d); if (segs.length) send({ t: 'wall', segs: segs.map(({ x, y, side }) => ({ x, y, side })), remove: S.bld.tool === 'unwall', paper: S.bld.paper }); }
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); const before = toWorld(e.clientX, e.clientY); cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.55, 2.4); const after = toScreen(before.x, before.y); cam.x += e.clientX - after.x; cam.y += e.clientY - after.y; }, { passive: false });
window.addEventListener('keydown', e => {
  if (chatFocused()) { if (e.key === 'Escape') $('chatInput').blur(); return; }
  if (!S.world) return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (k === 'b') setMode(S.mode === 'build' ? 'live' : 'build'); if (k === 'u') setMode(S.mode === 'buy' ? 'live' : 'buy'); if (k === 'l') setMode('live');
  if (k === 'r') { S.buy.rot = (S.buy.rot + 1) & 3; S.bld.rot = (S.bld.rot + 1) & 3; }
  if (k === 'h') cycleWalls();
  if (k === 'escape') { closeMenu(); S.buy.type = null; S.buy.sell = false; S.bld.type = null; S.bld.drag = null; refreshCatalog(); }
  if (k === 'enter') { e.preventDefault(); $('chatInput').focus(); }
  if (k === 'f') { const me = S.sqs.get(S.meId); if (me) centerOn(me.rx, me.ry); }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
const chatFocused = () => ['chatInput', 'casName', 'casRoom'].includes(document.activeElement && document.activeElement.id);

function onClick(mx, my) {
  if (!S.world) return;
  mouse.x = mx; mouse.y = my; computeHover();
  const me = S.sqs.get(S.meId);
  if (S.mode === 'buy') {
    if (S.buy.sell) { if (S.hover.obj) send({ t: 'sell', objId: S.hover.obj.id }); return; }
    if (S.buy.type && S.hover.tile) send({ t: 'build', type: S.buy.type, x: S.hover.tile.x, y: S.hover.tile.y, rot: S.buy.rot });
    return;
  }
  if (S.mode === 'build') {
    const tool = S.bld.tool;
    if (tool === 'garden') { if (S.bld.type && S.hover.tile) send({ t: 'build', type: S.bld.type, x: S.hover.tile.x, y: S.hover.tile.y, rot: S.bld.rot }); return; }
    if (tool === 'bulldoze') { if (S.hover.obj) send({ t: 'sell', objId: S.hover.obj.id }); else if (S.hover.wall) send({ t: 'wall', segs: [{ x: S.hover.wall.x, y: S.hover.wall.y, side: S.hover.wall.side }], remove: true }); return; }
    if (S.hover.wall) {
      const w = { x: S.hover.wall.x, y: S.hover.wall.y, side: S.hover.wall.side };
      if (tool === 'door') send({ t: 'wallset', ...w, kind: 'door' }); if (tool === 'window') send({ t: 'wallset', ...w, kind: 'window' }); if (tool === 'plainwall') send({ t: 'wallset', ...w, kind: 'wall' }); if (tool === 'paper') send({ t: 'wallset', ...w, paper: S.bld.paper });
    }
    return;
  }
  if (S.hover.sq) {
    const sq = S.hover.sq;
    if (sq.id === S.meId) openMenu(mx, my, `${sq.name} (you)`, [{ label: 'Stop what I\'m doing', emoji: '✋', run: () => send({ t: 'cancel' }) }, { label: 'Change appearance', emoji: '✎', run: openCAS }]);
    else openMenu(mx, my, sq.name, Object.entries(SOCIAL).map(([id, a]) => ({ label: a.label, emoji: a.emoji, run: () => send({ t: 'social', targetId: sq.id, actionId: id }) })));
    return;
  }
  if (S.hover.obj) {
    const def = OBJECTS[S.hover.obj.type];
    if (def.actions.length) {
      const items = def.actions.map(a => ({ label: a.label, emoji: a.emoji, cost: a.cost, run: () => send({ t: 'interact', objId: S.hover.obj.id, actionId: a.id }) }));
      const users = [...S.sqs.values()].filter(s => s.act && s.act.objId === S.hover.obj.id);
      openMenu(mx, my, def.name + (users.length ? ` · ${users.map(u => u.name).join(', ')}` : ''), items); return;
    }
  }
  if (S.hover.tile && me) send({ t: 'move', x: S.hover.tile.x, y: S.hover.tile.y });
}

// ---------- menu / toasts / chat ----------
function openMenu(x, y, title, items) {
  const m = $('menu'); m.innerHTML = ''; const h = document.createElement('div'); h.className = 'title'; h.textContent = title; m.appendChild(h);
  for (const it of items) { const b = document.createElement('button'); b.innerHTML = `<span>${it.emoji || ''} ${it.label}</span>` + (it.cost ? `<span class="cost">${it.cost} 🌰</span>` : ''); b.onclick = () => { closeMenu(); it.run(); }; m.appendChild(b); }
  m.classList.remove('hidden'); const r = m.getBoundingClientRect(); m.style.left = clamp(x + 8, 4, W - r.width - 4) + 'px'; m.style.top = clamp(y - 10, 4, H - r.height - 4) + 'px';
}
function closeMenu() { $('menu').classList.add('hidden'); }
function toast(text) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = text; $('toasts').appendChild(d); setTimeout(() => d.classList.add('out'), 3600); setTimeout(() => d.remove(), 4100); chatLine(text, true); }
function chatLine(text, sys, name) {
  const log = $('chatLog'); const d = document.createElement('div');
  if (sys) { d.className = 'sys'; d.textContent = text; } else { const b = document.createElement('b'); b.textContent = name + ': '; d.appendChild(b); d.appendChild(document.createTextNode(text)); }
  log.appendChild(d); while (log.children.length > 80) log.firstChild.remove(); log.scrollTop = log.scrollHeight;
}
$('chatForm').addEventListener('submit', e => { e.preventDefault(); const v = $('chatInput').value.trim(); if (v) send({ t: 'chat', text: v }); $('chatInput').value = ''; $('chatInput').blur(); });

// ---------- modes & catalog ----------
function setMode(m) {
  S.mode = m; closeMenu(); S.bld.drag = null;
  for (const id of ['live', 'buy', 'build']) $(id + 'Btn').classList.toggle('active', m === id);
  $('catalog').classList.toggle('hidden', m === 'live');
  if (m !== 'buy') { S.buy.type = null; S.buy.sell = false; }
  if (m !== 'build') S.bld.type = null;
  refreshCatalog();
}
for (const id of ['live', 'buy', 'build']) $(id + 'Btn').onclick = () => setMode(id);
function cycleWalls() { S.wallsMode = S.wallsMode === 'auto' ? 'up' : S.wallsMode === 'up' ? 'down' : 'auto'; $('wallsBtn').textContent = { auto: '🧱 Walls: cutaway', up: '🧱 Walls: up', down: '🧱 Walls: down' }[S.wallsMode]; }
$('wallsBtn').onclick = cycleWalls;
const iconCache = new Map();
function iconFor(type) {
  if (iconCache.has(type)) return iconCache.get(type);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d');
  const def = OBJECTS[type]; const hgt = HEIGHTS[type] || 40; const s = Math.min(1.1, 100 / (hgt + 20), 110 / (Math.max(def.w, def.h) * 64));
  c.translate(64, 128 - 14); c.scale(s, s);
  if (def.floor) { c.scale(1.6, 1.6); drawFloorPattern(c, type, 3); } else drawObject(c, type, 0, 0.5, {});
  iconCache.set(type, cv); return cv;
}
function itemCell(label, cost, active, onclick, drawIcon) {
  const d = document.createElement('div'); d.className = 'catItem' + (active ? ' active' : '') + (cost > S.acorns ? ' poor' : '');
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; drawIcon(cv.getContext('2d')); d.appendChild(cv);
  d.insertAdjacentHTML('beforeend', `<div class="nm">${label}</div>` + (cost != null ? `<div class="cost">${cost} 🌰</div>` : ''));
  d.onclick = onclick; return d;
}
function refreshCatalog() {
  const tabs = $('catTabs'), items = $('catItems'), hint = $('catHint'); tabs.innerHTML = ''; items.innerHTML = '';
  if (S.mode === 'buy') {
    for (const [id, icon, label] of CATEGORIES) { const b = document.createElement('button'); b.innerHTML = `<span>${icon}</span>${label}`; b.className = id === S.buy.cat ? 'active' : ''; b.onclick = () => { S.buy.cat = id; refreshCatalog(); }; tabs.appendChild(b); }
    for (const [type, def] of Object.entries(OBJECTS)) { if (def.cat !== S.buy.cat) continue; const d = itemCell(def.name, def.cost, S.buy.type === type, () => { S.buy.type = type; S.buy.sell = false; refreshCatalog(); }, c => c.drawImage(iconFor(type), 0, 0)); d.title = (def.actions || []).map(a => a.label).join(', ') || 'Decorative'; items.appendChild(d); }
    const sell = document.createElement('button'); sell.className = 'toolBtn' + (S.buy.sell ? ' active' : ''); sell.textContent = '💰 Sell (60% back)'; sell.onclick = () => { S.buy.sell = !S.buy.sell; S.buy.type = null; refreshCatalog(); }; tabs.appendChild(sell);
    hint.textContent = 'Click to place · R rotate · Esc cancel · right-click to stop · drag to pan · wheel to zoom';
  } else if (S.mode === 'build') {
    for (const [id, icon, label] of BUILD_TABS) { const b = document.createElement('button'); b.innerHTML = `<span>${icon}</span>${label}`; b.className = id === S.bld.tab ? 'active' : ''; b.onclick = () => { S.bld.tab = id; S.bld.tool = { walls: 'wall', doors: 'door', paper: 'paper', floors: 'floor', garden: 'garden', tools: 'bulldoze' }[id]; S.bld.type = null; refreshCatalog(); }; tabs.appendChild(b); }
    const tool = (id, label, cost, drawIcon) => items.appendChild(itemCell(label, cost, S.bld.tool === id, () => { S.bld.tool = id; refreshCatalog(); }, drawIcon));
    const txtIcon = (txt) => c => { c.font = '64px sans-serif'; c.textAlign = 'center'; c.fillText(txt, 64, 90); };
    if (S.bld.tab === 'walls') {
      tool('wall', 'Wall (drag)', DEFS.WALL_COST, c => { c.translate(64, 100); drawWallIcon(c, S.bld.paper); }); tool('unwall', 'Remove wall (drag)', null, txtIcon('🧹'));
      hint.textContent = `Drag along the grid to build a wall · ${DEFS.WALL_COST} 🌰 per segment, built in the selected wallpaper`;
    } else if (S.bld.tab === 'doors') {
      tool('door', 'Door', DEFS.DOOR_COST, txtIcon('🚪')); tool('window', 'Window', DEFS.WINDOW_COST, txtIcon('🪟')); tool('plainwall', 'Fill in (plain wall)', 0, txtIcon('🧱'));
      hint.textContent = 'Click a wall segment to put a door or window in it';
    } else if (S.bld.tab === 'paper') {
      for (const [id, wp] of Object.entries(WALLPAPERS)) items.appendChild(itemCell(wp.name, DEFS.PAPER_COST, S.bld.paper === id, () => { S.bld.paper = id; S.bld.tool = 'paper'; refreshCatalog(); }, c => { c.translate(64, 100); drawWallIcon(c, id); }));
      hint.textContent = `Pick a wallpaper, then click walls to paint them · ${DEFS.PAPER_COST} 🌰 per segment`;
    } else if (S.bld.tab === 'floors') {
      for (const id of FLOORS) items.appendChild(itemCell(OBJECTS[id].name, OBJECTS[id].cost, S.bld.floor === id, () => { S.bld.floor = id; S.bld.tool = 'floor'; refreshCatalog(); }, c => c.drawImage(iconFor(id), 0, 0)));
      hint.textContent = 'Pick a floor, then drag a rectangle to lay it · price is per tile';
    } else if (S.bld.tab === 'garden') {
      for (const [type, def] of Object.entries(OBJECTS)) { if (!def.garden) continue; items.appendChild(itemCell(def.name, def.cost, S.bld.type === type, () => { S.bld.type = type; S.bld.tool = 'garden'; refreshCatalog(); }, c => c.drawImage(iconFor(type), 0, 0))); }
      hint.textContent = 'Click to plant · R rotate';
    } else {
      tool('bulldoze', 'Bulldoze', null, txtIcon('🚜'));
      hint.textContent = 'Click objects, floors or walls to remove them (objects refund 60%)';
    }
  }
}
function drawWallIcon(c, paper) { const wp = WALLPAPERS[paper]; const s = 1.4; c.scale(s, s); poly(c, [{ x: -30, y: 0 }, { x: 30, y: -16 }, { x: 30, y: -56 }, { x: -30, y: -40 }], wp.color, 'rgba(0,0,0,.4)'); c.strokeStyle = wp.accent; c.lineWidth = 1.5; if (wp.pattern === 'stripes') for (let x = -24; x < 30; x += 10) line(c, x, -(x + 30) * 16 / 60, x, -(x + 30) * 16 / 60 - 40); if (wp.pattern === 'wood' || wp.pattern === 'brick') for (let v = 8; v < 40; v += 8) line(c, -30, -v, 30, -16 - v); if (wp.pattern === 'dots') { c.fillStyle = wp.accent; for (let x = -22; x < 30; x += 12) for (let v = 10; v < 40; v += 12) circ(c, x, -v - (x + 30) * 16 / 60, 2); } }

// ---------- HUD ----------
function buildNeeds(container) { container.innerHTML = ''; for (const n of NEEDS) { const d = document.createElement('div'); d.className = 'need'; d.innerHTML = `<span class="nl">${NEED_LABELS[n]}</span><div class="bar"><i></i></div>`; d.dataset.need = n; d.title = NEED_LABELS[n]; container.appendChild(d); } }
buildNeeds($('meNeeds')); buildNeeds($('partnerNeeds'));
function fillNeeds(container, needs) { for (const d of container.children) { const v = needs[d.dataset.need] ?? 0; const i = d.querySelector('i'); i.style.width = v + '%'; i.style.backgroundColor = moodColor(v); } }
function fmtClock(min) { const h = Math.floor(min / 60), m = Math.floor(min % 60); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
function describe(sq) { return sq.act ? sq.act.label : (sq.going ? (sq.going === 'Scampering' ? 'Scampering about' : 'Going to ' + sq.going.toLowerCase()) : (sq.fw ? 'Idle · free will' : 'Idle')); }
function drawPortrait(cv, sq, t) { const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); c.save(); c.translate(cv.width / 2, cv.height - 8); const s = cv.width / 62; c.scale(s, s); drawSquirrel(c, sq.look, { t, anim: sq.act && sq.act.anim !== 'sleep' ? sq.act.anim : '', walking: !!sq.mv }); c.restore(); }
function updateHUD() {
  const me = S.sqs.get(S.meId); if (!me) return;
  const partner = [...S.sqs.values()].find(s => s.id !== S.meId);
  $('clock').textContent = fmtClock(S.time); $('dayLabel').textContent = `Day ${S.day}`; $('acorns').textContent = S.acorns.toLocaleString();
  $('bondFill').style.width = S.bond + '%'; $('bondLabel').textContent = S.bondLabel;
  $('household').textContent = partner ? `The ${me.name} & ${partner.name} den` : `The ${me.name} den`;
  $('meName').textContent = me.name; const m = moodOf(me.needs); $('meMood').textContent = moodWord(m); $('meMood').style.color = moodColor(m); $('meDoing').textContent = describe(me); fillNeeds($('meNeeds'), me.needs);
  $('meSkills').innerHTML = Object.entries(SKILLS).map(([k, l]) => { const v = me.skills[k] || 0; return `<span title="${l} ${v.toFixed(1)}"><b>${l.split(' ')[0]}</b>${Math.floor(v)}</span>`; }).join('');
  if ($('freeWill').checked !== !!me.fw && document.activeElement !== $('freeWill')) $('freeWill').checked = !!me.fw;
  drawPortrait($('mePortrait'), me, performance.now() / 1000);
  $('partnerWait').classList.toggle('hidden', !!partner); $('partnerBody').classList.toggle('hidden', !partner);
  if (partner) { $('partnerName').textContent = partner.name; const pm = moodOf(partner.needs); $('partnerMood').textContent = moodWord(pm); $('partnerMood').style.color = moodColor(pm); $('partnerDoing').textContent = describe(partner); fillNeeds($('partnerNeeds'), partner.needs); drawPortrait($('partnerPortrait'), partner, performance.now() / 1000); }
  $('plumbobIcon').style.background = moodColor(m);
}
setInterval(updateHUD, 150);
setInterval(() => { if (S.mode !== 'live') for (const d of $('catItems').children) { const cost = d.querySelector('.cost'); if (cost) d.classList.toggle('poor', parseInt(cost.textContent) > S.acorns); } }, 1000);
$('freeWill').onchange = e => send({ t: 'freewill', on: e.target.checked });
$('findPartner').onclick = () => { const p = [...S.sqs.values()].find(s => s.id !== S.meId); if (p) centerOn(p.rx, p.ry); };
$('findMe').onclick = () => { const me = S.sqs.get(S.meId); if (me) centerOn(me.rx, me.ry); };
$('editMe').onclick = openCAS;
function inviteLink() { return `${location.origin}${location.pathname}?room=${encodeURIComponent(S.room)}`; }
for (const id of ['inviteBtn', 'inviteBtn2']) $(id).onclick = async () => { try { await navigator.clipboard.writeText(inviteLink()); toast('Invite link copied! Send it to your den-mate.'); } catch { prompt('Copy this link:', inviteLink()); } };

// ---------- network: peer-to-peer over WebRTC (PeerJS signalling, no game server) ----------
// The first player to open a den claims the peer id for that den and hosts the simulation in their tab.
// The second player's claim fails ("id taken"), so they connect to the host as a guest.
const PEER_PREFIX = 'nutshell-valley-';
const PEER_OPTS = { debug: 0 };
const denKey = () => 'nv_den_' + S.room;
let net = null, peer = null, hostRoom = null, last = null, retryTimer = null;
function send(msg) { if (net) net.send(msg); }
function setStatus(text) { const el = $('status'); if (text) { el.classList.remove('hidden'); el.textContent = text; } else el.classList.add('hidden'); }
function joinMsg() { return { t: 'join', room: S.room, token: S.token, name: S.profile.name, look: S.profile.look }; }
function teardown() {
  clearTimeout(retryTimer);
  if (net) { try { net.close(); } catch {} net = null; }
  if (hostRoom) { try { hostRoom.stop(); } catch {} hostRoom = null; }
  if (peer) { try { peer.destroy(); } catch {} peer = null; }
  S.connected = false; S.isHost = false;
}
function connect() {
  teardown();
  if (typeof Peer === 'undefined') { setStatus('Could not load the peer-to-peer library. Check your connection and reload.'); return; }
  setStatus('Opening the den…');
  const p = new Peer(PEER_PREFIX + S.room, PEER_OPTS); peer = p;
  p.on('open', () => { if (peer === p) becomeHost(p); });
  p.on('error', err => {
    if (peer !== p) return;
    if (err.type === 'unavailable-id') { joinAsGuest(); return; }
    setStatus('Signalling trouble (' + err.type + ')… retrying'); retryTimer = setTimeout(connect, 3000);
  });
}
function becomeHost(p) {
  const room = new SIM.Room(S.room, {
    load: () => { try { return JSON.parse(localStorage.getItem(denKey())); } catch { return null; } },
    save: d => { try { localStorage.setItem(denKey(), JSON.stringify(d)); } catch {} },
  });
  hostRoom = room; S.isHost = true;
  const local = { send: msg => handle(msg), close() {}, sqId: null, joined: false };
  net = { send: msg => room.handleRaw(local, msg), close: () => room.leave(local) };
  room.start();
  p.on('connection', conn => {
    const client = { send: msg => { if (conn.open) conn.send(msg); }, close: () => conn.close(), sqId: null, joined: false };
    conn.on('data', msg => room.handleRaw(client, msg));
    conn.on('close', () => room.leave(client));
    conn.on('error', () => room.leave(client));
  });
  p.on('disconnected', () => { if (peer === p && !p.destroyed) setTimeout(() => { try { p.reconnect(); } catch {} }, 1000); });
  S.connected = true; net.send(joinMsg());
}
function joinAsGuest() {
  if (peer) { try { peer.destroy(); } catch {} }
  setStatus('Joining your den-mate…');
  const p = new Peer(undefined, PEER_OPTS); peer = p;
  p.on('open', () => {
    if (peer !== p) return;
    const conn = p.connect(PEER_PREFIX + S.room, { reliable: true });
    let opened = false;
    conn.on('open', () => { opened = true; net = { send: msg => conn.send(msg), close: () => conn.close() }; S.connected = true; net.send(joinMsg()); });
    conn.on('data', handle);
    conn.on('close', () => { if (peer === p && !S.full) onHostLost(); });
    conn.on('error', () => { if (peer === p && !S.full) onHostLost(); });
    setTimeout(() => { if (!opened && peer === p && !S.full) { setStatus('Could not reach the host… retrying'); retryTimer = setTimeout(connect, 2000); } }, 12000);
  });
  p.on('error', err => { if (peer !== p || S.full) return; if (err.type === 'peer-unavailable') { retryTimer = setTimeout(connect, 1500); return; } setStatus('Connection trouble (' + err.type + ')… retrying'); retryTimer = setTimeout(connect, 3000); });
}
function onHostLost() {
  saveLastKnown();
  toast('Your den-mate was hosting and left — you are taking over the den.');
  retryTimer = setTimeout(connect, 1200);
}
// The guest keeps a copy of the den so it can host from where things left off.
function saveLastKnown() {
  if (S.isHost || !last || !last.objects) return;
  try { localStorage.setItem(denKey(), JSON.stringify(last)); } catch {}
}
setInterval(saveLastKnown, 10000);
window.addEventListener('beforeunload', () => { if (hostRoom) hostRoom.save(); else saveLastKnown(); });
function handle(m) {
  switch (m.t) {
    case 'welcome':
      S.meId = m.id; S.token = m.token; store.setItem('nv_token', m.token); S.room = m.room; S.world = m.world; setObjects(m.objects); setWalls(m.walls || []); S.time = m.time; S.day = m.day;
      last = { objects: m.objects, walls: m.walls || [], time: m.time, day: m.day, acorns: S.acorns, bond: S.bond, profiles: {}, nextObjId: Math.max(0, ...m.objects.map(o => o.id)) + 1 };
      $('roomName').textContent = m.room; $('roomCode').textContent = m.room; setStatus(null); S.centered = false;
      $('netBadge').textContent = S.isHost ? 'P2P · you are hosting this den' : 'P2P · connected to your den-mate';
      chatLine(`Welcome to the ${m.room} lot. Click the ground to walk, click furniture to use it, click your den-mate to socialise.`, true);
      centerOn(8, 7);
      break;
    case 'state': {
      S.time = m.time; S.day = m.day; S.acorns = m.acorns; S.bond = m.bond; S.bondLabel = m.bondLabel; const seen = new Set();
      for (const s of m.squirrels) { seen.add(s.id); const cur = S.sqs.get(s.id); if (cur) Object.assign(cur, s); else S.sqs.set(s.id, { ...s, rx: s.x, ry: s.y, animT: Math.random() * 10 }); }
      for (const id of [...S.sqs.keys()]) if (!seen.has(id)) S.sqs.delete(id);
      if (last) { last.time = m.time; last.day = m.day; last.acorns = m.acorns; last.bond = m.bond; for (const s of m.squirrels) last.profiles[s.id] = { id: s.id, name: s.name, look: s.look, needs: s.needs, skills: s.skills, freeWill: !!s.fw, x: s.x, y: s.y }; }
      break;
    }
    case 'objects': setObjects(m.objects); if (last) last.objects = m.objects; break;
    case 'walls': setWalls(m.walls); if (last) last.walls = m.walls; break;
    case 'toast': toast(m.text); break;
    case 'sys': chatLine(m.text, true); break;
    case 'chat': chatLine(m.text, false, m.name); break;
    case 'fx': S.particles.push({ x: m.x, y: m.y, text: m.text, t: 0 }); break;
    case 'error': toast(m.text); break;
    case 'full': S.full = true; setStatus(null); teardown(); S.full = true; openCAS(m.text); break;
  }
}
function setObjects(list) { S.objects = list; }
function setWalls(list) { S.walls = list; S.wallMap = new Map(list.map(w => [wkey(w.x, w.y, w.side), w])); }

// ---------- Create-a-Squirrel ----------
const cas = { look: DEFS.defaultLook(), t: 0 };
function openCAS(error) {
  const p = S.profile || loadProfile(); cas.look = { ...p.look }; $('casName').value = p.name; $('casRoom').value = S.room || p.room || 'oakhaven';
  $('casRoom').disabled = !!(S.connected && !S.full); $('casError').classList.toggle('hidden', !error); $('casError').textContent = error || '';
  $('casGo').textContent = S.connected && !S.full ? 'Save changes' : 'Move in!'; renderCASControls(); $('cas').classList.remove('hidden');
}
function loadProfile() { try { const p = JSON.parse(store.getItem('nv_profile')); if (p && p.look) return p; } catch {} return { name: NAMES[Math.floor(Math.random() * NAMES.length)], look: { fur: Math.floor(Math.random() * FURS.length), tail: 'fluffy', acc: 'none' } }; }
function renderCASControls() {
  const fur = $('casFur'); fur.innerHTML = ''; FURS.forEach((f, i) => { const d = document.createElement('div'); d.className = 'swatch' + (cas.look.fur === i ? ' active' : ''); d.style.background = `linear-gradient(135deg, ${f.fur} 55%, ${f.belly})`; d.title = f.name; d.onclick = () => { cas.look.fur = i; renderCASControls(); }; fur.appendChild(d); });
  for (const [elId, list, key] of [['casTail', TAILS, 'tail'], ['casAcc', ACCESSORIES, 'acc']]) { const el = $(elId); el.innerHTML = ''; for (const [id, label] of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (cas.look[key] === id ? ' active' : ''); b.textContent = label; b.onclick = () => { cas.look[key] = id; renderCASControls(); }; el.appendChild(b); } }
}
function casPreviewLoop() {
  if (!$('cas').classList.contains('hidden')) { const cv = $('casPreview'), c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); cas.t += 1 / 60; c.save(); c.translate(cv.width / 2, cv.height - 30); c.scale(3.4, 3.4); shadow(c, 10, 5); drawSquirrel(c, cas.look, { t: cas.t }); c.translate(0, -78 + Math.sin(cas.t * 3) * 2); c.scale(0.7, 0.7); drawPlumbob(c, 90, cas.t); c.restore(); }
  requestAnimationFrame(casPreviewLoop);
}
$('casGo').onclick = () => {
  const name = $('casName').value.trim().slice(0, 16) || 'Nutmeg';
  const room = ($('casRoom').value || 'oakhaven').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'oakhaven';
  S.profile = { name, look: { ...cas.look }, room }; store.setItem('nv_profile', JSON.stringify(S.profile)); $('cas').classList.add('hidden');
  if (S.connected && !S.full) { send({ t: 'look', name, look: S.profile.look }); return; }
  S.full = false; S.room = room; const url = new URL(location.href); url.searchParams.set('room', room); history.replaceState(null, '', url);
  connect();
};

// ---------- boot ----------
(function boot() { const params = new URLSearchParams(location.search); const p = loadProfile(); S.profile = p; S.room = params.get('room') || p.room || 'oakhaven'; openCAS(); casPreviewLoop(); requestAnimationFrame(frame); })();
})();
