// Shared game definitions: used by both server.js (CommonJS) and the browser (global DEFS).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DEFS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const NEEDS = ['hunger', 'comfort', 'hygiene', 'bladder', 'energy', 'fun', 'social'];
  const NEED_LABELS = { hunger: 'Hunger', energy: 'Energy', fun: 'Fun', social: 'Social', hygiene: 'Hygiene', bladder: 'Bladder', comfort: 'Comfort' };
  const NEED_ICONS = { hunger: '🌰', energy: '💤', fun: '🎉', social: '💬', hygiene: '🛁', bladder: '🚽', comfort: '🛋️' };
  const DECAY = { hunger: 0.075, energy: 0.05, fun: 0.065, social: 0.055, hygiene: 0.04, bladder: 0.085, comfort: 0.06 };
  const WORLD = { w: 24, h: 20 };
  const GAME_MIN_PER_SEC = 2;
  const START_ACORNS = 250;
  const WALL_COST = 10, DOOR_COST = 30, WINDOW_COST = 20, PAPER_COST = 4, WALL_REFUND = 5;

  // Buy-mode categories (Sims style)
  const CATEGORIES = [
    ['seating', '🛋️', 'Seating'], ['surfaces', '🪑', 'Surfaces'], ['decor', '🖼️', 'Decorative'], ['electronics', '📺', 'Electronics'],
    ['appliances', '🧊', 'Appliances'], ['plumbing', '🚿', 'Plumbing'], ['lighting', '💡', 'Lighting'], ['outdoor', '🌳', 'Outdoor'], ['misc', '🛏️', 'Misc'],
  ];
  const BUILD_TABS = [['walls', '🧱', 'Walls'], ['doors', '🚪', 'Doors & Windows'], ['paper', '🎨', 'Wallpaper'], ['floors', '🟫', 'Floors'], ['garden', '🌿', 'Garden'], ['tools', '🔨', 'Tools']];

  const A = (id, label, dur, anim, emoji, fx, extra) => Object.assign({ id, label, dur, anim, emoji, fx }, extra || {});
  const OBJECTS = {
    // ---- seating ----
    couch: { name: 'Mossy Loveseat', cost: 110, w: 2, h: 1, cat: 'seating', cap: 2, actions: [A('sit', 'Sit', 8, 'sit', '🛋️', { comfort: 35, energy: 6 }), A('nap', 'Nap', 12, 'sleep', '💤', { energy: 30, comfort: 10 })] },
    armchair: { name: 'Bark Armchair', cost: 60, w: 1, h: 1, cat: 'seating', cap: 1, actions: [A('sit', 'Sit', 8, 'sit', '🪑', { comfort: 32, energy: 4 })] },
    stool: { name: 'Toadstool Stool', cost: 20, w: 1, h: 1, cat: 'seating', cap: 1, actions: [A('sit', 'Sit', 6, 'sit', '🍄', { comfort: 14 })] },
    log: { name: 'Log Bench', cost: 40, w: 2, h: 1, cat: 'seating', cap: 2, actions: [A('sit', 'Sit', 8, 'sit', '🪵', { comfort: 30, energy: 5 })] },
    // ---- surfaces ----
    counter: { name: 'Kitchen Counter', cost: 40, w: 1, h: 1, cat: 'surfaces', actions: [] },
    endtable: { name: 'Stump End Table', cost: 30, w: 1, h: 1, cat: 'surfaces', actions: [] },
    dining: { name: 'Dining Set', cost: 160, w: 2, h: 2, cat: 'surfaces', cap: 4, actions: [A('feast', 'Have a meal', 10, 'eat', '🥜', { hunger: 50, social: 12, comfort: 8 }, { cost: 4 }), A('chat', 'Sit and chat', 6, 'sit', '💬', { social: 18, comfort: 10 })] },
    bookshelf: { name: 'Hollow Bookshelf', cost: 90, w: 1, h: 1, cat: 'surfaces', cap: 1, actions: [A('read', 'Read', 10, 'read', '📖', { fun: 18, comfort: 6 }, { skill: 'logic' }), A('study', 'Study', 12, 'read', '🧠', { fun: -4 }, { skill: 'logic', skillAmt: 0.6 })] },
    picnic: { name: 'Picnic Table', cost: 120, w: 2, h: 2, cat: 'outdoor', cap: 4, actions: [A('feast', 'Feast', 10, 'eat', '🥜', { hunger: 48, social: 12, comfort: 8 }, { cost: 4 }), A('chat', 'Sit and chat', 6, 'sit', '💬', { social: 18, comfort: 10 })] },
    // ---- decorative ----
    fern: { name: 'Potted Fern', cost: 35, w: 1, h: 1, cat: 'decor', actions: [] },
    sculpture: { name: 'Acorn Sculpture', cost: 120, w: 1, h: 1, cat: 'decor', cap: 2, actions: [A('admire', 'Admire', 4, 'stand', '🗿', { fun: 8, comfort: 4 })] },
    gnome: { name: 'Garden Gnome', cost: 45, w: 1, h: 1, cat: 'decor', cap: 1, actions: [A('admire', 'Admire', 3, 'stand', '🧙', { fun: 5 })] },
    flowers: { name: 'Wildflowers', cost: 15, w: 1, h: 1, cat: 'decor', garden: true, cap: 2, actions: [A('sniff', 'Sniff', 3, 'forage', '🌼', { comfort: 8, fun: 4 })] },
    rock: { name: 'Mossy Rock', cost: 20, w: 1, h: 1, cat: 'decor', garden: true, cap: 1, actions: [A('perch', 'Perch and survey', 5, 'sit', '🪨', { comfort: 14, fun: 6 })] },
    // ---- electronics ----
    tv: { name: 'Nutflix TV', cost: 140, w: 1, h: 1, cat: 'electronics', cap: 4, light: true, actions: [A('watch', 'Watch Nutflix', 10, 'sit', '📺', { fun: 30, comfort: 4, energy: -4 })] },
    stereo: { name: 'Pinecone Stereo', cost: 110, w: 1, h: 1, cat: 'electronics', cap: 4, actions: [A('dance', 'Dance', 8, 'dance', '🎶', { fun: 26, social: 12, energy: -8 }), A('listen', 'Listen', 6, 'stand', '🎧', { fun: 15 })] },
    computer: { name: 'Nutbook Computer', cost: 200, w: 1, h: 1, cat: 'electronics', cap: 1, light: true, actions: [A('games', 'Play games', 8, 'work', '🎮', { fun: 28, energy: -4 }), A('trade', 'Day-trade acorns', 12, 'work', '📈', { fun: -6 }, { acorns: { base: 15, perSkill: 5, rand: 10 }, skill: 'logic' }), A('chatonline', 'Chat online', 6, 'work', '💻', { social: 16 })] },
    phone: { name: 'Tin-Can Phone', cost: 45, w: 1, h: 1, cat: 'electronics', cap: 1, actions: [A('call', 'Call a friend', 6, 'talk', '📞', { social: 22, fun: 4 })] },
    // ---- appliances ----
    fridge: { name: 'Acorn Fridge', cost: 150, w: 1, h: 1, cat: 'appliances', cap: 1, actions: [A('snack', 'Have a snack', 5, 'eat', '🌰', { hunger: 25 }, { cost: 2 }), A('meal', 'Make a meal', 10, 'eat', '🥗', { hunger: 55 }, { cost: 6, skill: 'cooking' })] },
    stove: { name: 'Pinecone Stove', cost: 120, w: 1, h: 1, cat: 'appliances', cap: 1, actions: [A('cook', 'Cook acorn stew', 12, 'work', '🍲', { hunger: 62, fun: 4 }, { cost: 5, skill: 'cooking', skillAmt: 0.5 })] },
    espresso: { name: 'Sap Espresso Maker', cost: 60, w: 1, h: 1, cat: 'appliances', cap: 1, actions: [A('drink', 'Drink espresso', 4, 'eat', '☕', { energy: 16, bladder: -10 }, { cost: 2 })] },
    // ---- plumbing ----
    toilet: { name: 'Hollow-Log Toilet', cost: 90, w: 1, h: 1, cat: 'plumbing', cap: 1, actions: [A('relieve', 'Use', 4, 'sit', '🚽', { bladder: 90 })] },
    sink: { name: 'Birch Basin', cost: 60, w: 1, h: 1, cat: 'plumbing', cap: 1, actions: [A('wash', 'Wash paws', 4, 'groom', '🧼', { hygiene: 18 })] },
    shower: { name: 'Rainspout Shower', cost: 130, w: 1, h: 1, cat: 'plumbing', cap: 1, actions: [A('shower', 'Take a shower', 8, 'groom', '🚿', { hygiene: 65, comfort: -3 })] },
    tub: { name: 'Acorn-Cap Tub', cost: 200, w: 2, h: 1, cat: 'plumbing', cap: 1, actions: [A('soak', 'Take a bath', 12, 'groom', '🛁', { hygiene: 60, comfort: 30 })] },
    birdbath: { name: 'Birdbath', cost: 70, w: 1, h: 1, cat: 'outdoor', garden: true, cap: 1, actions: [A('splash', 'Splash around', 8, 'groom', '💦', { hygiene: 55, fun: 10, comfort: -4 })] },
    // ---- lighting ----
    floorlamp: { name: 'Twig Floor Lamp', cost: 50, w: 1, h: 1, cat: 'lighting', light: true, actions: [] },
    tablelamp: { name: 'Acorn Table Lamp', cost: 30, w: 1, h: 1, cat: 'lighting', light: true, actions: [] },
    lantern: { name: 'Firefly Lantern', cost: 30, w: 1, h: 1, cat: 'lighting', garden: true, light: true, cap: 2, actions: [A('admire', 'Watch the fireflies', 3, 'stand', '✨', { fun: 6, comfort: 4 })] },
    // ---- outdoor ----
    oak: { name: 'Great Oak', cost: 160, w: 2, h: 2, cat: 'outdoor', garden: true, cap: 3, actions: [
      A('forage', 'Forage for acorns', 8, 'forage', '🌰', { hunger: 22, fun: 6 }, { acorns: { base: 6, perSkill: 1.6, rand: 5 }, skill: 'foraging' }),
      A('climb', 'Climb', 6, 'climb', '🧗', { fun: 22, energy: -4 }), A('nap', 'Nap in the branches', 12, 'climbsleep', '💤', { energy: 35, comfort: 12 })] },
    sapling: { name: 'Sapling', cost: 40, w: 1, h: 1, cat: 'outdoor', garden: true, cap: 1, actions: [A('climb', 'Climb', 5, 'climb', '🧗', { fun: 12 })] },
    berrybush: { name: 'Berry Bush', cost: 45, w: 1, h: 1, cat: 'outdoor', garden: true, cap: 2, actions: [A('snack', 'Snack on berries', 5, 'eat', '🫐', { hunger: 20, fun: 5 })] },
    bush: { name: 'Privacy Bush', cost: 30, w: 1, h: 1, cat: 'outdoor', garden: true, cap: 1, actions: [A('relieve', 'Use the bush', 4, 'hide', '🌿', { bladder: 85 })] },
    feeder: { name: 'Bird Feeder', cost: 85, w: 1, h: 1, cat: 'outdoor', cap: 1, actions: [A('raid', 'Raid the feeder', 7, 'eat', '🌻', { hunger: 50, fun: 12, hygiene: -5 })] },
    swing: { name: 'Tire Swing', cost: 95, w: 2, h: 2, cat: 'outdoor', cap: 1, actions: [A('swing', 'Swing', 8, 'play', '🎡', { fun: 38, energy: -5 })] },
    mushrooms: { name: 'Mushroom Ring', cost: 55, w: 2, h: 2, cat: 'outdoor', garden: true, cap: 4, actions: [A('dance', 'Dance', 8, 'dance', '🍄', { fun: 26, social: 14, energy: -8, hygiene: -5 })] },
    hammock: { name: 'Leaf Hammock', cost: 90, w: 2, h: 1, cat: 'outdoor', cap: 1, actions: [A('lounge', 'Lounge', 10, 'sleep', '🍃', { comfort: 40, energy: 18, fun: 5 })] },
    burrow: { name: 'Cozy Burrow', cost: 150, w: 2, h: 1, cat: 'outdoor', cap: 2, actions: [A('sleep', 'Sleep', 20, 'sleep', '💤', { energy: 90, comfort: 30 }), A('hide', 'Hide from hawks', 5, 'hide', '🙈', { comfort: 15, fun: 6 })] },
    dustpatch: { name: 'Dust Bath', cost: 25, w: 1, h: 1, cat: 'outdoor', cap: 1, actions: [A('roll', 'Roll around', 6, 'groom', '🌪️', { hygiene: 32, fun: 10 })] },
    nest: { name: 'Twig Nest', cost: 60, w: 1, h: 1, cat: 'outdoor', cap: 1, actions: [A('sleep', 'Sleep', 20, 'sleep', '💤', { energy: 65, comfort: 15 })] },
    exchange: { name: 'Nut Exchange', cost: 200, w: 2, h: 1, cat: 'outdoor', cap: 2, actions: [A('work', 'Work a shift', 15, 'work', '💼', { fun: -14, energy: -14, hunger: -8 }, { acorns: { base: 40, perSkill: 4, rand: 10 }, skill: 'hustle' })] },
    mailbox: { name: 'Mailbox', cost: 25, w: 1, h: 1, cat: 'outdoor', cap: 1, actions: [A('mail', 'Check the mail', 3, 'stand', '📬', { fun: 3 })] },
    trashcan: { name: 'Trash Can', cost: 20, w: 1, h: 1, cat: 'outdoor', cap: 1, actions: [A('rummage', 'Rummage', 5, 'forage', '🗑️', { hunger: 12, fun: 6, hygiene: -15 })] },
    // ---- misc ----
    bed: { name: 'Walnut Bed', cost: 180, w: 1, h: 2, cat: 'misc', cap: 1, actions: [A('sleep', 'Sleep', 20, 'sleep', '💤', { energy: 85, comfort: 20 }), A('relax', 'Relax', 6, 'sleep', '🛏️', { comfort: 22, energy: 5 })] },
    doublebed: { name: 'Oak Double Bed', cost: 320, w: 2, h: 2, cat: 'misc', cap: 2, actions: [A('sleep', 'Sleep', 20, 'sleep', '💤', { energy: 90, comfort: 28 }), A('relax', 'Relax', 6, 'sleep', '🛏️', { comfort: 25, energy: 5 })] },
    mossbed: { name: 'Moss Cushion', cost: 25, w: 1, h: 1, cat: 'misc', cap: 1, actions: [A('curl', 'Curl up', 8, 'sit', '🍀', { comfort: 30, energy: 4 })] },
    easel: { name: 'Easel', cost: 150, w: 1, h: 1, cat: 'misc', cap: 1, actions: [A('paint', 'Paint', 12, 'work', '🎨', { fun: 15 }, { skill: 'creativity', acorns: { base: 8, perSkill: 6, rand: 8 } })] },
    mirror: { name: 'Puddle Mirror', cost: 70, w: 1, h: 1, cat: 'misc', cap: 1, actions: [A('practice', 'Practice charisma', 8, 'talk', '🪞', { fun: 4 }, { skill: 'charisma', skillAmt: 0.5 })] },
    piano: { name: 'Pinecone Piano', cost: 180, w: 2, h: 1, cat: 'misc', cap: 1, actions: [A('play', 'Play a tune', 10, 'music', '🎵', { fun: 26, social: 6 }, { skill: 'music' })] },
    // ---- floors (build mode) ----
    f_hardwood: { name: 'Hardwood', cost: 6, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_darkwood: { name: 'Dark Hardwood', cost: 7, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_checker: { name: 'Checker Tile', cost: 8, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_stone: { name: 'Slate Tile', cost: 6, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_lino: { name: 'Cream Lino', cost: 4, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_carpet_red: { name: 'Red Carpet', cost: 5, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_carpet_blue: { name: 'Blue Carpet', cost: 5, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_carpet_green: { name: 'Green Carpet', cost: 5, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_path: { name: 'Pebble Path', cost: 3, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
    f_deck: { name: 'Wood Deck', cost: 5, w: 1, h: 1, cat: 'floor', floor: true, actions: [] },
  };
  const FLOORS = Object.keys(OBJECTS).filter(k => OBJECTS[k].floor);

  const WALLPAPERS = {
    plaster: { name: 'Plaster', color: '#e9e3d3', accent: '#d8d0bc', pattern: 'plain' },
    stripes: { name: 'Cream Stripes', color: '#f1e8c8', accent: '#dccf9f', pattern: 'stripes' },
    sage: { name: 'Sage', color: '#b9c9a5', accent: '#a0b38a', pattern: 'plain' },
    sky: { name: 'Sky Blue', color: '#bcd5e8', accent: '#9dbfd9', pattern: 'plain' },
    rose: { name: 'Rose Dots', color: '#e8c3c8', accent: '#d39ca6', pattern: 'dots' },
    wood: { name: 'Wood Panel', color: '#a97b50', accent: '#86603a', pattern: 'wood' },
    brick: { name: 'Brick', color: '#b0624a', accent: '#8d4a36', pattern: 'brick' },
    navy: { name: 'Navy', color: '#4b5f86', accent: '#3b4c6b', pattern: 'plain' },
    sunflower: { name: 'Sunflower', color: '#f0d060', accent: '#d9b640', pattern: 'dots' },
  };

  const SOCIAL = {
    chat: { label: 'Chat', dur: 5, anim: 'talk', emoji: '💬', fx: { social: 22 }, tfx: { social: 22 }, bond: 4 },
    nuzzle: { label: 'Nuzzle', dur: 4, anim: 'talk', emoji: '💕', fx: { social: 26, comfort: 8 }, tfx: { social: 26, comfort: 8 }, skill: 'charisma', bond: 8 },
    joke: { label: 'Tell a joke', dur: 5, anim: 'talk', emoji: '😂', fx: { social: 14, fun: 10 }, tfx: { social: 14, fun: 22 }, skill: 'charisma', bond: 5 },
    tag: { label: 'Play tag', dur: 8, anim: 'play', emoji: '🏃', fx: { fun: 26, social: 14, energy: -10 }, tfx: { fun: 26, social: 14, energy: -10 }, bond: 6 },
    share: { label: 'Share a snack', dur: 3, anim: 'talk', emoji: '🎁', fx: { social: 18 }, tfx: { social: 18, hunger: 15 }, bond: 7 },
  };
  const BOND_LEVELS = [[0, 'Strangers'], [15, 'Acquaintances'], [35, 'Buddies'], [60, 'Best Nutfriends'], [85, 'Soulmates']];
  const SKILLS = { foraging: '🌰 Foraging', cooking: '🍳 Cooking', logic: '🧠 Logic', creativity: '🎨 Creativity', music: '🎵 Music', charisma: '💕 Charisma', hustle: '💼 Hustle' };

  const FURS = [
    { name: 'Gray', fur: '#8a8d93', dark: '#5e6167', belly: '#ebe6df' },
    { name: 'Red', fur: '#b85c2c', dark: '#7d3a16', belly: '#f3ddc3' },
    { name: 'Brown', fur: '#7a5230', dark: '#4f3119', belly: '#e5d2b8' },
    { name: 'Black', fur: '#34303a', dark: '#17151a', belly: '#8f8798' },
    { name: 'Cream', fur: '#e7d7b7', dark: '#b89f78', belly: '#fff7e8' },
    { name: 'Golden', fur: '#d19a3a', dark: '#8f6420', belly: '#f8e9bf' },
    { name: 'Lavender', fur: '#9f8fc9', dark: '#6a5a99', belly: '#efe9ff' },
    { name: 'Mint', fur: '#86c3a3', dark: '#4f8a6d', belly: '#eafff3' },
    { name: 'Rose', fur: '#d98aa0', dark: '#9c5168', belly: '#ffeef3' },
    { name: 'Sky', fur: '#7fb0d6', dark: '#466f92', belly: '#eaf5ff' },
  ];
  const TAILS = [['fluffy', 'Fluffy'], ['extra', 'Extra fluffy'], ['sleek', 'Sleek']];
  const ACCESSORIES = [['none', 'None'], ['bow', 'Bow'], ['tophat', 'Top hat'], ['glasses', 'Glasses'], ['scarf', 'Scarf'], ['flower', 'Flower'], ['crown', 'Crown']];
  function defaultLook() { return { fur: 0, tail: 'fluffy', acc: 'none' }; }

  // 'g' grass, 'w' water, 's' sidewalk, 'r' road
  function makeGround(w, h) {
    const g = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        let t = 'g';
        const px = (x + 0.5 - 20.5) / 2.3, py = (y + 0.5 - 3.5) / 1.6;
        if (px * px + py * py < 1) t = 'w';
        if (y === h - 3) t = 's';
        if (y >= h - 2) t = 'r';
        row.push(t);
      }
      g.push(row);
    }
    return g;
  }

  // Wall segments. side 'n' = edge between (x,y-1) and (x,y); side 'w' = edge between (x-1,y) and (x,y).
  function wallRun(x0, y0, x1, y1, paper) {
    const out = [];
    if (y0 === y1) for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x++) out.push({ x, y: y0, side: 'n', kind: 'wall', paper });
    else for (let y = Math.min(y0, y1); y < Math.max(y0, y1); y++) out.push({ x: x0, y, side: 'w', kind: 'wall', paper });
    return out;
  }
  const DEFAULT_WALLS = [
    ...wallRun(3, 3, 11, 3, 'stripes'), ...wallRun(3, 10, 11, 10, 'stripes'), ...wallRun(3, 3, 3, 10, 'stripes'), ...wallRun(11, 3, 11, 10, 'stripes'),
    ...wallRun(7, 3, 7, 10, 'sage'), ...wallRun(3, 7, 7, 7, 'sky'),
  ];
  const DEFAULT_WALL_KINDS = [
    { x: 9, y: 10, side: 'n', kind: 'door' }, { x: 7, y: 6, side: 'w', kind: 'door' }, { x: 5, y: 7, side: 'n', kind: 'door' },
    { x: 4, y: 3, side: 'n', kind: 'window' }, { x: 9, y: 3, side: 'n', kind: 'window' }, { x: 3, y: 5, side: 'w', kind: 'window' }, { x: 11, y: 5, side: 'w', kind: 'window' }, { x: 11, y: 8, side: 'w', kind: 'window' },
  ];
  function fillFloor(type, x0, y0, x1, y1) { const out = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push([type, x, y]); return out; }
  // [type, x, y, fixed, rot]
  const DEFAULT_LOT = [
    ...fillFloor('f_carpet_blue', 3, 3, 7, 7), ...fillFloor('f_checker', 3, 7, 7, 10), ...fillFloor('f_hardwood', 7, 3, 11, 10),
    ...fillFloor('f_path', 9, 10, 10, 17),
    ['bed', 3, 3], ['endtable', 4, 3], ['tablelamp', 6, 3], ['mirror', 6, 5],
    ['toilet', 3, 9], ['shower', 6, 9], ['sink', 6, 7],
    ['fridge', 10, 3], ['stove', 10, 4], ['counter', 10, 5], ['bookshelf', 7, 3], ['dining', 8, 4],
    ['couch', 7, 8], ['tv', 10, 8], ['floorlamp', 10, 9], ['phone', 7, 7],
    ['mailbox', 12, 16, true], ['trashcan', 13, 16, true], ['oak', 16, 9, true], ['exchange', 14, 3, true],
    ['bush', 1, 13], ['flowers', 12, 11], ['flowers', 13, 11], ['birdbath', 18, 6], ['lantern', 11, 12], ['rock', 2, 8], ['berrybush', 21, 9],
  ];

  return { NEEDS, NEED_LABELS, NEED_ICONS, DECAY, WORLD, GAME_MIN_PER_SEC, START_ACORNS, WALL_COST, DOOR_COST, WINDOW_COST, PAPER_COST, WALL_REFUND,
    CATEGORIES, BUILD_TABS, OBJECTS, FLOORS, WALLPAPERS, SOCIAL, BOND_LEVELS, SKILLS, FURS, TAILS, ACCESSORIES, defaultLook, makeGround, wallRun, DEFAULT_WALLS, DEFAULT_WALL_KINDS, DEFAULT_LOT };
});
