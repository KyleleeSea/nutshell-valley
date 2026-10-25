// Nutshell Valley simulation. Runs in Node (server.js) or in the browser (the hosting player's tab).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./defs.js'));
  else root.SIM = factory(root.DEFS);
})(typeof self !== 'undefined' ? self : this, function (DEFS) {
'use strict';
const TICK_MS = 50;
const SNAPSHOT_MS = 100;
const SAVE_MS = 15000;
const WALK_SPEED = 2.6; // tiles per second
const MAX_PLAYERS = 2;  // a den is shared by exactly two squirrels

const { NEEDS, DECAY, OBJECTS, SOCIAL, WALLPAPERS } = DEFS;
const wkey = (x, y, side) => x + ',' + y + ',' + side;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const key = (x, y) => x + ',' + y;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function randomToken() {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes); else for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Public squirrel id derived from the secret token (FNV-1a, two rounds).
function hashToken(token) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < token.length; i++) { const c = token.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ c, 0x27d4eb2f) >>> 0; }
  return 's' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0').slice(0, 4);
}
function sanitizeName(n) {
  if (typeof n !== 'string') return null;
  n = n.replace(/[^\p{L}\p{N} _'.-]/gu, '').trim().slice(0, 16);
  return n || null;
}
function sanitizeLook(l) {
  if (!l || typeof l !== 'object') return null;
  const fur = clamp(l.fur | 0, 0, DEFS.FURS.length - 1);
  const tail = DEFS.TAILS.some(t => t[0] === l.tail) ? l.tail : 'fluffy';
  const acc = DEFS.ACCESSORIES.some(a => a[0] === l.acc) ? l.acc : 'none';
  return { fur, tail, acc };
}
function sanitizeRoom(r) {
  if (typeof r !== 'string') return 'oakhaven';
  r = r.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return r || 'oakhaven';
}

class Room {
  constructor(name, opts) {
    this.name = name; this.opts = opts || {};
    this.w = DEFS.WORLD.w; this.h = DEFS.WORLD.h;
    this.ground = DEFS.makeGround(this.w, this.h);
    this.objects = new Map();
    this.walls = new Map();     // wkey -> {x,y,side,kind,paper}
    this.profiles = {};        // token -> saved squirrel
    this.squirrels = new Map(); // id -> live squirrel
    this.clients = new Set();
    this.nextObjId = 1;
    this.time = 8 * 60; this.day = 1;
    this.acorns = DEFS.START_ACORNS; // shared household wallet
    this.bond = 10;                   // friendship between the two squirrels
    this.dirty = false;
    this.load();
    if (this.objects.size === 0) this.populateDefault();
    this.rebuildBlocked();
  }

  load() {
    try {
      const d = this.opts.load ? this.opts.load() : null;
      if (!d) return;
      for (const o of d.objects || []) if (OBJECTS[o.type]) this.objects.set(o.id, o);
      for (const wl of d.walls || []) this.walls.set(wkey(wl.x, wl.y, wl.side), wl);
      this.profiles = d.profiles || {};
      this.nextObjId = d.nextObjId || 1;
      this.time = d.time ?? this.time; this.day = d.day ?? 1;
      this.acorns = d.acorns ?? this.acorns; this.bond = d.bond ?? this.bond;
    } catch { /* fresh room */ }
  }

  save() {
    if (this.opts.save) this.opts.save(this.exportState());
    this.dirty = false;
  }
  exportState() {
    for (const sq of this.squirrels.values()) this.profiles[sq.id] = this.profileOf(sq);
    return { objects: [...this.objects.values()], walls: [...this.walls.values()], profiles: this.profiles, nextObjId: this.nextObjId, time: this.time, day: this.day, acorns: this.acorns, bond: this.bond };
  }
  // Run the simulation on a timer (used by the browser host and the Node server alike).
  start() {
    if (this.timer) return;
    let last = Date.now(), sinceSnap = 0, sinceSave = 0;
    this.timer = setInterval(() => {
      const now = Date.now(); const dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (this.clients.size) this.tick(dt);
      sinceSnap += dt * 1000; sinceSave += dt * 1000;
      if (sinceSnap >= SNAPSHOT_MS) { sinceSnap = 0; if (this.clients.size) this.broadcast(this.snapshot()); }
      if (sinceSave >= SAVE_MS) { sinceSave = 0; if (this.dirty || this.clients.size) this.save(); }
    }, TICK_MS);
  }
  stop() { clearInterval(this.timer); this.timer = null; this.save(); }
  // Entry point for a transport: the first message must be a join.
  handleRaw(client, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (!client.joined) { if (msg.t === 'join') this.join(client, msg); return; }
    this.handle(client, msg);
  }

  populateDefault() {
    for (const wl of DEFS.DEFAULT_WALLS) this.walls.set(wkey(wl.x, wl.y, wl.side), { ...wl });
    for (const k of DEFS.DEFAULT_WALL_KINDS) { const wl = this.walls.get(wkey(k.x, k.y, k.side)); if (wl) wl.kind = k.kind; }
    for (const [type, x, y, fixed, rot] of DEFS.DEFAULT_LOT) {
      if (!this.canPlace(type, x, y, rot || 0)) continue;
      const o = { id: this.nextObjId++, type, x, y, rot: rot || 0, owner: null };
      if (fixed) o.fixed = true;
      this.objects.set(o.id, o);
    }
    this.dirty = true;
  }

  // ---- geometry ----
  footprint(o) {
    const def = OBJECTS[o.type];
    const w = o.rot % 2 ? def.h : def.w, h = o.rot % 2 ? def.w : def.h;
    const tiles = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) tiles.push({ x: o.x + dx, y: o.y + dy });
    return tiles;
  }
  objCenter(o) {
    const def = OBJECTS[o.type];
    const w = o.rot % 2 ? def.h : def.w, h = o.rot % 2 ? def.w : def.h;
    return { x: o.x + w / 2, y: o.y + h / 2 };
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  canPlace(type, x, y, rot) {
    const def = OBJECTS[type]; if (!def) return false;
    const tiles = this.footprint({ type, x, y, rot });
    for (const t of tiles) {
      if (!this.inBounds(t.x, t.y)) return false;
      const g = this.ground[t.y][t.x];
      if (g === 'w' || g === 'r') return false;
      if (!def.floor) for (const q of tiles) if (Math.abs(q.x - t.x) + Math.abs(q.y - t.y) === 1 && this.wallBetween(t.x, t.y, q.x, q.y)) return false;
    }
    for (const o of this.objects.values()) {
      const odef = OBJECTS[o.type];
      if (!!odef.floor !== !!def.floor) continue; // floors and furniture may overlap
      for (const t of this.footprint(o)) if (tiles.some(q => q.x === t.x && q.y === t.y)) return false;
    }
    return true;
  }
  rebuildBlocked() {
    this.blocked = Array.from({ length: this.h }, (_, y) => this.ground[y].map(t => t === 'w'));
    for (const o of this.objects.values()) {
      if (OBJECTS[o.type].floor) continue;
      for (const t of this.footprint(o)) if (this.inBounds(t.x, t.y)) this.blocked[t.y][t.x] = true;
    }
    this.rerouteAll();
  }
  walkable(x, y) { return this.inBounds(x, y) && !this.blocked[y][x]; }
  // A wall (not a door) on the edge between two orthogonally adjacent tiles.
  wallBetween(x, y, nx, ny) {
    let wl = null;
    if (ny === y - 1 && nx === x) wl = this.walls.get(wkey(x, y, 'n'));
    else if (ny === y + 1 && nx === x) wl = this.walls.get(wkey(x, y + 1, 'n'));
    else if (nx === x - 1 && ny === y) wl = this.walls.get(wkey(x, y, 'w'));
    else if (nx === x + 1 && ny === y) wl = this.walls.get(wkey(x + 1, y, 'w'));
    return !!(wl && wl.kind !== 'door');
  }
  canStep(x, y, dx, dy) {
    const nx = x + dx, ny = y + dy;
    if (!this.walkable(nx, ny)) return false;
    if (dx && dy) return this.canStep(x, y, dx, 0) && this.canStep(x + dx, y, 0, dy) && this.canStep(x, y, 0, dy) && this.canStep(x, y + dy, dx, 0);
    return !this.wallBetween(x, y, nx, ny);
  }
  wallCuts(seg) { // would this wall segment slice through an object's footprint?
    const a = { x: seg.x, y: seg.y }, b = seg.side === 'n' ? { x: seg.x, y: seg.y - 1 } : { x: seg.x - 1, y: seg.y };
    for (const o of this.objects.values()) {
      if (OBJECTS[o.type].floor) continue;
      const tiles = this.footprint(o);
      if (tiles.some(t => t.x === a.x && t.y === a.y) && tiles.some(t => t.x === b.x && t.y === b.y)) return true;
    }
    return false;
  }
  rerouteAll() {
    for (const sq of this.squirrels.values()) {
      if (!sq.path.length || !sq.goals) continue;
      const p = this.findPath(sq.x, sq.y, sq.goals);
      if (p) sq.path = p; else { sq.path = []; sq.plan = null; }
    }
  }
  randomWalkable() {
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * this.w), y = Math.floor(Math.random() * this.h);
      if (this.walkable(x, y)) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  // BFS over the grid (8 directions, no corner cutting). Returns waypoints at tile centers.
  findPath(fx, fy, goals) {
    const sx = clamp(Math.floor(fx), 0, this.w - 1), sy = clamp(Math.floor(fy), 0, this.h - 1);
    if (goals.has(key(sx, sy))) return [];
    const prev = new Map(); const start = key(sx, sy); prev.set(start, null);
    const queue = [[sx, sy]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!this.canStep(x, y, dx, dy)) continue;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        prev.set(k, key(x, y));
        if (goals.has(k)) {
          const out = []; let cur = k;
          while (cur && cur !== start) { const [cx, cy] = cur.split(',').map(Number); out.push({ x: cx + 0.5, y: cy + 0.5 }); cur = prev.get(cur); }
          return out.reverse();
        }
        queue.push([nx, ny]);
      }
    }
    return null;
  }
  approachTiles(o) {
    const def = OBJECTS[o.type];
    const tiles = this.footprint(o);
    const goals = new Set();
    if (def.floor) { for (const t of tiles) if (this.walkable(t.x, t.y)) goals.add(key(t.x, t.y)); return goals; }
    for (const t of tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = t.x + dx, ny = t.y + dy;
      if (this.walkable(nx, ny) && !this.wallBetween(t.x, t.y, nx, ny)) goals.add(key(nx, ny));
    }
    return goals;
  }
  usersOf(objId) {
    const out = [];
    for (const sq of this.squirrels.values()) {
      if ((sq.action && sq.action.kind === 'object' && sq.action.objId === objId) || (sq.plan && sq.plan.kind === 'object' && sq.plan.objId === objId)) out.push(sq);
    }
    return out;
  }

  // ---- squirrels ----
  createSquirrel(token, name, look) {
    const id = hashToken(token);
    const spawn = this.randomWalkable();
    const needs = {}; for (const n of NEEDS) needs[n] = 70 + Math.random() * 30;
    return {
      id, token, name, look, x: spawn.x + 0.5, y: spawn.y + 0.5, dir: 0.8, moving: false,
      path: [], goals: null, plan: null, action: null, needs,
      skills: { foraging: 0, music: 0, charisma: 0, hustle: 0 }, freeWill: true,
      idleT: 0, aiCooldown: 2, say: null, sayUntil: 0, accident: false,
    };
  }
  profileOf(sq) {
    return { id: sq.id, name: sq.name, look: sq.look, needs: sq.needs, skills: sq.skills, freeWill: sq.freeWill, x: sq.x, y: sq.y };
  }
  restore(token) {
    const p = this.profiles[hashToken(token)];
    const sq = this.createSquirrel(token, p.name, p.look);
    Object.assign(sq.needs, p.needs || {});
    Object.assign(sq.skills, p.skills || {});
    sq.freeWill = p.freeWill ?? true;
    if (typeof p.x === 'number' && this.walkable(Math.floor(p.x), Math.floor(p.y))) { sq.x = p.x; sq.y = p.y; }
    return sq;
  }
  toastTo(sq, text) { for (const c of this.clients) if (c.sqId === sq.id) c.send({ t: 'toast', text }); }
  broadcast(msg, except) { for (const c of this.clients) if (c !== except) c.send(msg); }
  fx(sq, text) { this.broadcast({ t: 'fx', x: sq.x, y: sq.y, text }); }
  publicObjects() { return [...this.objects.values()]; }
  sendObjects() { this.dirty = true; this.broadcast({ t: 'objects', objects: this.publicObjects() }); }

  join(ws, msg) {
    const tokenOk = typeof msg.token === 'string' && /^[a-f0-9]{24}$/.test(msg.token);
    let token = tokenOk ? msg.token : null;
    const name = sanitizeName(msg.name); const look = sanitizeLook(msg.look);
    let sq = null;
    if (token) {
      for (const s of this.squirrels.values()) if (s.token === token) sq = s; // already live (another tab)
      if (!sq && this.profiles[hashToken(token)]) sq = this.restore(token);
    }
    const others = [...this.squirrels.values()].filter(s => s !== sq);
    if (others.length >= MAX_PLAYERS) {
      ws.send({ t: 'full', text: `This den already has two squirrels (${others.map(s => s.name).join(' & ')}). Pick another den name.` });
      return ws.close();
    }
    if (sq) {
      for (const c of this.clients) if (c.sqId === sq.id) { c.send({ t: 'error', text: 'You opened the park in another tab.' }); c.sqId = null; c.close(); }
      if (name) sq.name = name; if (look) sq.look = look;
    } else {
      token = randomToken();
      sq = this.createSquirrel(token, name || 'Nutmeg', look || DEFS.defaultLook());
    }
    this.squirrels.set(sq.id, sq);
    ws.sqId = sq.id; ws.room = this; ws.joined = true; this.clients.add(ws);
    ws.send({ t: 'welcome', id: sq.id, token, room: this.name, world: { w: this.w, h: this.h, ground: this.ground }, objects: this.publicObjects(), walls: [...this.walls.values()], time: this.time, day: this.day });
    this.broadcast({ t: 'toast', text: `${sq.name} scampered into the park!` }, ws);
    this.broadcast({ t: 'sys', text: `${sq.name} joined.` });
    this.dirty = true;
  }

  leave(ws) {
    this.clients.delete(ws);
    if (!ws.sqId) return;
    ws.joined = false;
    const sq = this.squirrels.get(ws.sqId);
    if (!sq) return;
    if ([...this.clients].some(c => c.sqId === sq.id)) return;
    this.cancel(sq);
    this.profiles[sq.id] = this.profileOf(sq);
    this.squirrels.delete(sq.id);
    this.broadcast({ t: 'sys', text: `${sq.name} left.` });
    this.dirty = true;
  }

  // ---- commands ----
  handle(ws, msg) {
    const sq = this.squirrels.get(ws.sqId);
    if (!sq) return;
    switch (msg.t) {
      case 'move': {
        const x = Math.floor(+msg.x), y = Math.floor(+msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.goTo(sq, x, y);
        break;
      }
      case 'interact': this.goUse(sq, msg.objId | 0, String(msg.actionId), false); break;
      case 'social': {
        const tg = this.squirrels.get(String(msg.targetId));
        if (!tg || tg === sq || !SOCIAL[msg.actionId]) return;
        this.goSocial(sq, tg, msg.actionId, 0);
        break;
      }
      case 'build': this.build(sq, msg); break;
      case 'sell': this.sell(sq, msg.objId | 0); break;
      case 'wall': this.buildWalls(sq, msg); break;
      case 'wallset': this.setWall(sq, msg); break;
      case 'floor': this.layFloor(sq, msg); break;
      case 'cancel': this.cancel(sq); sq.aiCooldown = 8; break;
      case 'chat': {
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
        if (!text) return;
        sq.say = text; sq.sayUntil = Date.now() + 6000;
        this.broadcast({ t: 'chat', id: sq.id, name: sq.name, text });
        break;
      }
      case 'freewill': sq.freeWill = !!msg.on; break;
      case 'look': {
        const name = sanitizeName(msg.name), look = sanitizeLook(msg.look);
        if (name) sq.name = name; if (look) sq.look = look;
        this.dirty = true;
        break;
      }
    }
  }

  cancel(sq) {
    sq.path = []; sq.goals = null; sq.plan = null;
    const a = sq.action; sq.action = null;
    if (a && a.kind === 'social' && a.targetReceiving) {
      const tg = this.squirrels.get(a.targetId);
      if (tg && tg.action && tg.action.kind === 'receive' && tg.action.fromId === sq.id) tg.action = null;
    }
  }

  goTo(sq, x, y, auto) {
    if (!this.walkable(x, y)) {
      // find nearest walkable tile
      let best = null, bd = Infinity;
      for (let yy = 0; yy < this.h; yy++) for (let xx = 0; xx < this.w; xx++) {
        if (!this.walkable(xx, yy)) continue;
        const d = (xx - x) ** 2 + (yy - y) ** 2;
        if (d < bd) { bd = d; best = { x: xx, y: yy }; }
      }
      if (!best || bd > 4) { if (!auto) this.toastTo(sq, "Can't scamper there."); return false; }
      x = best.x; y = best.y;
    }
    const goals = new Set([key(x, y)]);
    const p = this.findPath(sq.x, sq.y, goals);
    if (!p) { if (!auto) this.toastTo(sq, "No way to get there."); return false; }
    this.cancel(sq);
    sq.path = p; sq.goals = goals;
    if (!auto) sq.aiCooldown = 6;
    return true;
  }

  goUse(sq, objId, actionId, auto) {
    const obj = this.objects.get(objId); if (!obj) return false;
    const def = OBJECTS[obj.type];
    const act = (def.actions || []).find(a => a.id === actionId); if (!act) return false;
    const users = this.usersOf(objId).filter(s => s !== sq);
    if (users.length >= (def.cap || 1)) { if (!auto) this.toastTo(sq, `${def.name} is already taken.`); return false; }
    if (act.cost && this.acorns < act.cost) { if (!auto) this.toastTo(sq, `You need ${act.cost} acorns for that.`); return false; }
    const goals = this.approachTiles(obj);
    if (!goals.size) { if (!auto) this.toastTo(sq, `Can't reach the ${def.name}.`); return false; }
    const p = this.findPath(sq.x, sq.y, goals);
    if (!p) { if (!auto) this.toastTo(sq, `No path to the ${def.name}.`); return false; }
    this.cancel(sq);
    sq.path = p; sq.goals = goals; sq.plan = { kind: 'object', objId, actionId };
    if (!auto) sq.aiCooldown = 6;
    return true;
  }

  goSocial(sq, tg, actionId, tries, auto) {
    const act = SOCIAL[actionId];
    if (act.cost && this.acorns < act.cost) { if (!auto) this.toastTo(sq, `You need ${act.cost} acorns for that.`); return false; }
    const tx = Math.floor(tg.x), ty = Math.floor(tg.y);
    const goals = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.walkable(tx + dx, ty + dy)) goals.add(key(tx + dx, ty + dy));
    if (!goals.size) return false;
    const p = this.findPath(sq.x, sq.y, goals);
    if (!p) { if (!auto) this.toastTo(sq, `Can't reach ${tg.name}.`); return false; }
    this.cancel(sq);
    sq.path = p; sq.goals = goals; sq.plan = { kind: 'social', targetId: tg.id, actionId, tries, auto };
    if (!auto) sq.aiCooldown = 6;
    return true;
  }

  build(sq, msg) {
    const def = OBJECTS[msg.type]; if (!def) return;
    const x = msg.x | 0, y = msg.y | 0, rot = (msg.rot | 0) & 3;
    if (!this.canPlace(msg.type, x, y, rot)) return this.toastTo(sq, "Can't place that there.");
    if (this.acorns < def.cost) return this.toastTo(sq, `You need ${def.cost} acorns for a ${def.name}.`);
    this.acorns -= def.cost;
    const o = { id: this.nextObjId++, type: msg.type, x, y, rot, owner: sq.id };
    this.objects.set(o.id, o);
    this.rebuildBlocked();
    this.sendObjects();
    if (!def.floor) this.broadcast({ t: 'toast', text: `${sq.name} placed a ${def.name}.` });
  }

  sendWalls() { this.dirty = true; this.broadcast({ t: 'walls', walls: [...this.walls.values()] }); }
  validSeg(m) {
    const x = m.x | 0, y = m.y | 0, side = m.side === 'w' ? 'w' : m.side === 'n' ? 'n' : null;
    if (!side || x < 0 || y < 0 || x > this.w || y > this.h) return null;
    const a = this.inBounds(x, y) && this.ground[y][x] !== 'r' && this.ground[y][x] !== 'w' && this.ground[y][x] !== 's';
    const bx = side === 'n' ? x : x - 1, by = side === 'n' ? y - 1 : y;
    const b = this.inBounds(bx, by) && this.ground[by][bx] !== 'r' && this.ground[by][bx] !== 'w' && this.ground[by][bx] !== 's';
    if (!a && !b) return null;
    if (side === 'n' && x >= this.w) return null;
    if (side === 'w' && y >= this.h) return null;
    return { x, y, side };
  }
  buildWalls(sq, msg) {
    if (!Array.isArray(msg.segs) || msg.segs.length > 64) return;
    if (msg.remove) {
      let refund = 0;
      for (const m of msg.segs) { const seg = this.validSeg(m); if (!seg) continue; const k = wkey(seg.x, seg.y, seg.side); if (this.walls.delete(k)) refund += DEFS.WALL_REFUND; }
      if (!refund) return;
      this.acorns += refund; this.fx(sq, `+${refund} 🌰`); this.rerouteAll(); this.sendWalls();
      return;
    }
    const segs = [];
    for (const m of msg.segs) { const seg = this.validSeg(m); if (!seg) continue; if (this.walls.has(wkey(seg.x, seg.y, seg.side))) continue; if (this.wallCuts(seg)) continue; segs.push(seg); }
    if (!segs.length) return this.toastTo(sq, "Can't build a wall there.");
    const cost = segs.length * DEFS.WALL_COST;
    if (this.acorns < cost) return this.toastTo(sq, `You need ${cost} acorns for that wall.`);
    this.acorns -= cost;
    const paper = WALLPAPERS[msg.paper] ? msg.paper : 'plaster';
    for (const seg of segs) this.walls.set(wkey(seg.x, seg.y, seg.side), { ...seg, kind: 'wall', paper });
    this.rerouteAll(); this.sendWalls();
  }
  setWall(sq, msg) {
    const seg = this.validSeg(msg); if (!seg) return;
    const wl = this.walls.get(wkey(seg.x, seg.y, seg.side)); if (!wl) return this.toastTo(sq, 'There is no wall there.');
    if (msg.paper) {
      if (!WALLPAPERS[msg.paper]) return;
      if (wl.paper === msg.paper) return;
      if (this.acorns < DEFS.PAPER_COST) return this.toastTo(sq, `You need ${DEFS.PAPER_COST} acorns for wallpaper.`);
      this.acorns -= DEFS.PAPER_COST; wl.paper = msg.paper; this.sendWalls(); return;
    }
    const kind = msg.kind === 'door' ? 'door' : msg.kind === 'window' ? 'window' : msg.kind === 'wall' ? 'wall' : null;
    if (!kind || wl.kind === kind) return;
    const cost = kind === 'door' ? DEFS.DOOR_COST : kind === 'window' ? DEFS.WINDOW_COST : 0;
    if (this.acorns < cost) return this.toastTo(sq, `You need ${cost} acorns for that.`);
    this.acorns -= cost; wl.kind = kind; this.rerouteAll(); this.sendWalls();
  }
  layFloor(sq, msg) {
    const def = OBJECTS[msg.type]; if (!def || !def.floor || !Array.isArray(msg.tiles) || msg.tiles.length > 200) return;
    const todo = [];
    for (const t of msg.tiles) {
      const x = t.x | 0, y = t.y | 0;
      if (!this.inBounds(x, y) || this.ground[y][x] === 'w' || this.ground[y][x] === 'r') continue;
      const existing = [...this.objects.values()].find(o => OBJECTS[o.type].floor && o.x === x && o.y === y);
      if (existing && existing.type === msg.type) continue;
      todo.push({ x, y, existing });
    }
    if (!todo.length) return;
    const cost = todo.length * def.cost;
    if (this.acorns < cost) return this.toastTo(sq, `You need ${cost} acorns for that flooring.`);
    this.acorns -= cost;
    for (const t of todo) { if (t.existing) this.objects.delete(t.existing.id); this.objects.set(this.nextObjId, { id: this.nextObjId++, type: msg.type, x: t.x, y: t.y, rot: 0, owner: sq.id }); }
    this.sendObjects();
  }

  sell(sq, objId) {
    const o = this.objects.get(objId); if (!o) return;
    const def = OBJECTS[o.type];
    if (o.fixed) return this.toastTo(sq, `The ${def.name} belongs to the park.`);
    const refund = Math.round(def.cost * 0.6);
    for (const s of this.squirrels.values()) {
      if ((s.action && s.action.kind === 'object' && s.action.objId === objId) || (s.plan && s.plan.kind === 'object' && s.plan.objId === objId)) this.cancel(s);
    }
    this.objects.delete(objId);
    this.acorns += refund;
    this.rebuildBlocked();
    this.sendObjects();
    this.fx(sq, `+${refund} 🌰`);
    if (!def.floor) this.broadcast({ t: 'toast', text: `${sq.name} sold a ${def.name}.` });
  }

  // ---- simulation ----
  tick(dt) {
    this.time += dt * DEFS.GAME_MIN_PER_SEC;
    if (this.time >= 1440) { this.time -= 1440; this.day++; this.broadcast({ t: 'toast', text: `☀️ Day ${this.day} dawns over the park.` }); }
    for (const sq of this.squirrels.values()) this.tickSquirrel(sq, dt);
    if (this.squirrels.size === 2) this.bond = clamp(this.bond - 0.003 * dt, 0, 100);
  }

  tickSquirrel(sq, dt) {
    const a = sq.action;
    for (const n of NEEDS) {
      let r = DECAY[n];
      if (a && a.fx && a.fx[n] > 0) r = 0;
      if (n === 'energy' && sq.needs.hunger <= 0) r *= 2.5;
      if (n === 'comfort' && a && (a.anim === 'sit' || a.anim === 'sleep')) r = 0;
      sq.needs[n] = clamp(sq.needs[n] - r * dt, 0, 100);
    }
    if (sq.needs.bladder <= 0.01 && !sq.accident) {
      sq.accident = true;
      sq.needs.bladder = 100; sq.needs.hygiene = clamp(sq.needs.hygiene - 45, 0, 100); sq.needs.fun = clamp(sq.needs.fun - 25, 0, 100);
      this.fx(sq, '💦😳');
      this.broadcast({ t: 'toast', text: `${sq.name} had a little accident.` });
    } else if (sq.needs.bladder > 20) sq.accident = false;

    if (sq.say && Date.now() > sq.sayUntil) sq.say = null;

    if (sq.path.length) this.moveAlong(sq, dt);
    else { sq.moving = false; if (sq.plan) this.arrive(sq); }

    if (sq.action) this.progressAction(sq, dt);

    if (!sq.action && !sq.path.length && !sq.plan) {
      sq.idleT += dt;
      sq.aiCooldown -= dt;
      if (sq.freeWill && sq.idleT > 3 && sq.aiCooldown <= 0) { this.autonomy(sq); sq.aiCooldown = 3 + Math.random() * 3; }
    } else sq.idleT = 0;
  }

  moveAlong(sq, dt) {
    let remaining = WALK_SPEED * dt;
    while (remaining > 0 && sq.path.length) {
      const wp = sq.path[0];
      const dx = wp.x - sq.x, dy = wp.y - sq.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) sq.dir = Math.atan2(dy, dx);
      if (d <= remaining) { sq.x = wp.x; sq.y = wp.y; remaining -= d; sq.path.shift(); }
      else { sq.x += dx / d * remaining; sq.y += dy / d * remaining; remaining = 0; }
    }
    sq.moving = sq.path.length > 0;
    if (!sq.moving) sq.goals = null;
  }

  arrive(sq) {
    const plan = sq.plan; sq.plan = null;
    if (plan.kind === 'object') {
      const obj = this.objects.get(plan.objId); if (!obj) return;
      const def = OBJECTS[obj.type];
      const act = def.actions.find(x => x.id === plan.actionId); if (!act) return;
      if (this.usersOf(obj.id).filter(s => s !== sq).length >= (def.cap || 1)) { this.toastTo(sq, `${def.name} is busy.`); return; }
      if (act.cost && this.acorns < act.cost) { this.toastTo(sq, 'Not enough acorns.'); return; }
      if (act.cost) this.acorns -= act.cost;
      const c = this.objCenter(obj);
      sq.dir = Math.atan2(c.y - sq.y, c.x - sq.x);
      sq.action = { kind: 'object', objId: obj.id, actionId: act.id, label: act.label, emoji: act.emoji, anim: act.anim, fx: act.fx || {}, dur: act.dur, t: 0, acorns: act.acorns, skill: act.skill, skillAmt: act.skillAmt };
    } else if (plan.kind === 'social') {
      const tg = this.squirrels.get(plan.targetId); if (!tg) return;
      const d = Math.hypot(tg.x - sq.x, tg.y - sq.y);
      if (d > 2.3) { if (plan.tries < 3) this.goSocial(sq, tg, plan.actionId, plan.tries + 1, plan.auto); return; }
      const act = SOCIAL[plan.actionId];
      if (act.cost && this.acorns < act.cost) { this.toastTo(sq, 'Not enough acorns.'); return; }
      if (act.cost) this.acorns -= act.cost;
      sq.dir = Math.atan2(tg.y - sq.y, tg.x - sq.x);
      const receiving = !tg.action && !tg.path.length;
      sq.action = { kind: 'social', targetId: tg.id, actionId: plan.actionId, label: `${act.label} with ${tg.name}`, emoji: act.emoji, anim: act.anim, fx: act.fx || {}, tfx: act.tfx || {}, dur: act.dur, t: 0, skill: act.skill, give: act.give, targetReceiving: receiving };
      if (receiving) {
        tg.plan = null; tg.dir = Math.atan2(sq.y - tg.y, sq.x - tg.x);
        tg.action = { kind: 'receive', fromId: sq.id, label: `${act.label} with ${sq.name}`, emoji: act.emoji, anim: act.anim, fx: act.tfx || {}, dur: act.dur, t: 0 };
      }
    }
  }

  progressAction(sq, dt) {
    const a = sq.action;
    const step = Math.min(dt, Math.max(0, a.dur - a.t)) / a.dur;
    a.t += dt;
    for (const n in a.fx) sq.needs[n] = clamp(sq.needs[n] + a.fx[n] * step, 0, 100);
    if (a.kind === 'object' && !this.objects.has(a.objId)) { sq.action = null; return; }
    if (a.kind === 'social' && !this.squirrels.has(a.targetId)) { sq.action = null; return; }
    if (a.kind === 'receive') {
      const from = this.squirrels.get(a.fromId);
      if (!from || !from.action || from.action.kind !== 'social' || from.action.targetId !== sq.id) { sq.action = null; return; }
    }
    if (a.t >= a.dur) this.finishAction(sq);
  }

  finishAction(sq) {
    const a = sq.action; sq.action = null;
    if (a.kind === 'object') {
      if (a.acorns) {
        const n = typeof a.acorns === 'number' ? a.acorns : Math.round(a.acorns.base + a.acorns.perSkill * (sq.skills[a.skill] || 0) + Math.random() * a.acorns.rand);
        this.acorns += n; this.fx(sq, `+${n} 🌰`);
      } else this.fx(sq, a.emoji);
      if (a.skill) this.gainSkill(sq, a.skill, a.skillAmt || 0.34);
    } else if (a.kind === 'social') {
      const tg = this.squirrels.get(a.targetId);
      if (tg) {
        if (!a.targetReceiving) for (const n in a.tfx) tg.needs[n] = clamp(tg.needs[n] + a.tfx[n], 0, 100);
        if (a.give) { this.acorns += a.give; this.fx(tg, `+${a.give} 🌰`); } else this.fx(tg, a.emoji);
        if (tg.action && tg.action.kind === 'receive' && tg.action.fromId === sq.id) tg.action = null;
      }
      this.fx(sq, a.emoji);
      if (a.skill) this.gainSkill(sq, a.skill, 0.25);
      this.addBond(SOCIAL[a.actionId].bond || 5);
    }
    if (a.kind === 'object') {
      const partner = this.partnerOf(sq);
      if (partner && partner.action && partner.action.kind === 'object' && partner.action.objId === a.objId) { this.addBond(3); this.fx(sq, '💞'); }
    }
    sq.idleT = 0; sq.aiCooldown = 1.5;
  }

  partnerOf(sq) { for (const s of this.squirrels.values()) if (s !== sq) return s; return null; }
  bondLevel(v) { let lvl = DEFS.BOND_LEVELS[0]; for (const l of DEFS.BOND_LEVELS) if (v >= l[0]) lvl = l; return lvl; }
  addBond(amt) {
    const before = this.bondLevel(this.bond);
    this.bond = clamp(this.bond + amt, 0, 100);
    const after = this.bondLevel(this.bond);
    if (after !== before && amt > 0) this.broadcast({ t: 'toast', text: `💞 Your squirrels are now ${after[1]}!` });
    this.dirty = true;
  }

  gainSkill(sq, skill, amt) {
    const before = Math.floor(sq.skills[skill] || 0);
    sq.skills[skill] = clamp((sq.skills[skill] || 0) + amt, 0, 10);
    if (Math.floor(sq.skills[skill]) > before) {
      this.broadcast({ t: 'toast', text: `🎓 ${sq.name} reached ${DEFS.SKILLS[skill]} level ${Math.floor(sq.skills[skill])}!` });
      this.fx(sq, '🎓');
    }
  }

  autonomy(sq) {
    const sorted = NEEDS.map(n => [n, sq.needs[n]]).sort((a, b) => a[1] - b[1]);
    const [need, val] = sorted[0];
    if (val < 55) {
      let best = null, bestScore = -Infinity;
      for (const obj of this.objects.values()) {
        const def = OBJECTS[obj.type];
        for (const act of def.actions || []) {
          const gain = (act.fx || {})[need] || 0; if (gain <= 0) continue;
          if (act.cost && this.acorns < act.cost + 20) continue;
          if (act.acorns && this.acorns > 400) continue;
          if (this.usersOf(obj.id).filter(s => s !== sq).length >= (def.cap || 1)) continue;
          const c = this.objCenter(obj);
          const score = gain - Math.hypot(c.x - sq.x, c.y - sq.y) * 1.5 + Math.random() * 6;
          if (score > bestScore) { bestScore = score; best = { obj, act }; }
        }
      }
      if (best && this.goUse(sq, best.obj.id, best.act.id, true)) return;
      if (need === 'social') {
        const others = [...this.squirrels.values()].filter(s => s !== sq);
        if (others.length && this.goSocial(sq, pick(others), pick(['chat', 'joke', 'nuzzle']), 0, true)) return;
      }
    }
    // Low on acorns? Go earn some.
    if (this.acorns < 20 && Math.random() < 0.5) {
      for (const obj of this.objects.values()) if (obj.type === 'exchange' && this.goUse(sq, obj.id, 'work', true)) return;
      for (const obj of this.objects.values()) if (obj.type === 'oak' && this.goUse(sq, obj.id, 'forage', true)) return;
    }
    if (Math.random() < 0.3) { const t = this.randomWalkable(); this.goTo(sq, t.x, t.y, true); }
  }

  snapshot() {
    const squirrels = [];
    for (const sq of this.squirrels.values()) {
      const needs = {}; for (const n of NEEDS) needs[n] = Math.round(sq.needs[n]);
      const skills = {}; for (const k in sq.skills) skills[k] = Math.round(sq.skills[k] * 10) / 10;
      const a = sq.action;
      squirrels.push({
        id: sq.id, name: sq.name, look: sq.look, x: +sq.x.toFixed(2), y: +sq.y.toFixed(2), dir: +sq.dir.toFixed(2), mv: sq.moving ? 1 : 0,
        needs, skills, say: sq.say, fw: sq.freeWill ? 1 : 0,
        act: a ? { label: a.label, emoji: a.emoji, anim: a.anim, p: +(a.t / a.dur).toFixed(2), objId: a.objId, targetId: a.targetId || a.fromId } : null,
        going: sq.plan ? (sq.plan.kind === 'object' ? (OBJECTS[this.objects.get(sq.plan.objId)?.type]?.actions.find(x => x.id === sq.plan.actionId)?.label || '') : SOCIAL[sq.plan.actionId].label) : (sq.path.length ? 'Scampering' : ''),
      });
    }
    return { t: 'state', time: Math.round(this.time), day: this.day, acorns: this.acorns, bond: Math.round(this.bond), bondLabel: this.bondLevel(this.bond)[1], squirrels };
  }
}


return { Room, sanitizeRoom, sanitizeName, sanitizeLook, randomToken, hashToken, MAX_PLAYERS };
});
