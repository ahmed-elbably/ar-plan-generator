/*
 * AR Plan code check: runs an authority rule pack (rules/<pack>.json) against a plan document.
 *
 * Values live in the rule files; this module only knows how to measure. Every rule ends in one of:
 *   PASS · FAIL · ADVISE (a "should" rule that fails) · NOT CHECKABLE (data missing, or left to the reviewer)
 *   · N/A (nothing in the plan it applies to) · OUT OF SCOPE
 * Missing data never passes.
 *
 * Used by arplan.js:  require("./codecheck").run(doc, geom, {pack, rulesDir})
 * `geom` supplies the engine's geometry helpers (see arplan.js codecheckGeom()).
 */
"use strict";
const fs = require("fs"), path = require("path");

const EPS = 1e-4;                      // 0.1 mm: absorbs floating-point noise only, so values exactly at a limit pass
const STAFF_RE = /\b(maid|driver|nanny|staff|servant|housekeeper|guard)\b/i;
const STATUS_ORDER = ["FAIL", "ADVISE", "NOT CHECKABLE", "PASS", "N/A", "OUT OF SCOPE"];

function loadPack(pack, rulesDir) {
  const manifestFile = path.join(rulesDir, pack + ".json");
  if (!fs.existsSync(manifestFile)) throw new Error(`Unknown rule pack "${pack}" (no ${manifestFile})`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const rules = [];
  for (const a of manifest.authorities) {
    const f = JSON.parse(fs.readFileSync(path.join(rulesDir, a.file), "utf8"));
    for (const r of f.rules) rules.push(Object.assign({pack: f.pack}, r));
  }
  const seen = new Set();
  for (const r of rules) { if (seen.has(r.id)) throw new Error(`Duplicate rule id ${r.id} in pack ${pack}`); seen.add(r.id); }
  return {manifest, rules};
}

/* ---------- plan model: rooms with clear boxes, doors with their two sides, fixtures with frames ---------- */
function buildModel(doc, G) {
  const {P, add, sub, mul, dot, dist, pointInPoly, boxOf, openingGeom, FIX} = G;
  const SIDE_EDGES = b => ({N: [P(b.x0, b.y0), P(b.x1, b.y0)], S: [P(b.x0, b.y1), P(b.x1, b.y1)],
                            W: [P(b.x0, b.y0), P(b.x0, b.y1)], E: [P(b.x1, b.y0), P(b.x1, b.y1)]});
  // thickness of the walls along one room edge (max over the collinear walls that overlap it)
  const edgeWalls = (a, b) => {
    const d = G.norm(sub(b, a)), L = dist(a, b), out = [];
    for (const w of doc.walls) {
      if (Math.abs(G.cross(d, sub(w.a, a))) > 0.03 || Math.abs(G.cross(d, sub(w.b, a))) > 0.03) continue;
      let t0 = dot(sub(w.a, a), d), t1 = dot(sub(w.b, a), d); if (t0 > t1) [t0, t1] = [t1, t0];
      if (Math.min(L, t1) - Math.max(0, t0) > 0.05) out.push(w);
    }
    return out;
  };
  const rooms = doc.rooms.map(r => {
    const box = boxOf(r.pts), edges = SIDE_EDGES(box), t = {}, ext = {};
    for (const s of Object.keys(edges)) {
      const ws = edgeWalls(edges[s][0], edges[s][1]);
      t[s] = ws.reduce((m, w) => Math.max(m, w.t), 0);
      ext[s] = ws.filter(w => w.kind === "ext").reduce((m, w) => m + G.wallLen(w), 0);
    }
    const clear = {x0: box.x0 + t.W / 2, x1: box.x1 - t.E / 2, y0: box.y0 + t.N / 2, y1: box.y1 - t.S / 2};
    const cw = clear.x1 - clear.x0, cd = clear.y1 - clear.y0;
    return {r, id: r.id, name: r.name, type: r.type, staff: STAFF_RE.test(r.name), box, clear, t, ext,
            cw, cd, area: cw * cd, minDim: Math.min(cw, cd), boxArea: (box.x1 - box.x0) * (box.y1 - box.y0)};
  });
  const roomAt = p => rooms.find(m => pointInPoly(p, m.r.pts)) || null;
  const indoor = m => m && m.type !== "outdoor";

  const openings = doc.openings.map(o => {
    const g = openingGeom(o); if (!g) return null;
    const off = g.w.t / 2 + 0.2;
    const a = roomAt(add(g.c, mul(g.n, off))), b = roomAt(sub(g.c, mul(g.n, off)));
    const into = o.side === 1 ? a : b, other = o.side === 1 ? b : a;
    return {o, g, id: o.id, type: o.type, style: o.style, w: o.w, h: o.h, sill: o.sill, a, b, into, other,
            toOutside: !indoor(a) || !indoor(b)};
  }).filter(Boolean);
  const doors = openings.filter(x => x.type === "door"), windows = openings.filter(x => x.type === "window");
  const windowsOf = m => windows.filter(x => x.a === m || x.b === m);
  // side of the room box a window sits on
  const sideOf = (m, c) => {
    const b = m.box, d = {N: Math.abs(c.y - b.y0), S: Math.abs(c.y - b.y1), W: Math.abs(c.x - b.x0), E: Math.abs(c.x - b.x1)};
    return Object.keys(d).sort((p, q) => d[p] - d[q])[0];
  };

  const fixtures = doc.fixtures.map(f => {
    const def = FIX[f.kind]; if (!def) return null;
    const rad = (f.rot || 0) * Math.PI / 180, u = P(Math.cos(rad), Math.sin(rad)), fr = P(-Math.sin(rad), Math.cos(rad));
    const c = P(f.x, f.y), hw = def.w / 2, hd = def.h / 2;
    const corners = [add(add(c, mul(u, hw)), mul(fr, hd)), add(sub(c, mul(u, hw)), mul(fr, hd)),
                     sub(sub(c, mul(u, hw)), mul(fr, hd)), sub(add(c, mul(u, hw)), mul(fr, hd))];
    return {f, id: f.id, kind: f.kind, def, c, u, fr, hw, hd, corners, room: roomAt(c), label: def.label};
  }).filter(Boolean);

  // swing door leaves as rectangles on the side they open into
  const leaves = doors.filter(d => d.style === "swing").map(d => {
    const {g, o} = d, sn = mul(g.n, o.side), t = g.w.t / 2;
    const pts = [add(g.p0, mul(sn, t)), add(g.p1, mul(sn, t)), add(g.p0, mul(sn, t + o.w)), add(g.p1, mul(sn, t + o.w))];
    return {door: d, pts, room: d.into};
  });

  // gross area per DBC K.5.2.6: inside the exterior wall faces, incl. interior walls
  let ga = 0, cond = 0;
  for (const m of rooms) {
    if (m.type === "outdoor") continue;
    let a = m.boxArea;
    for (const s of ["N", "S", "E", "W"]) {
      const L = (s === "N" || s === "S") ? m.box.x1 - m.box.x0 : m.box.y1 - m.box.y0;
      if (m.ext[s] > 0.05) a -= Math.min(L, m.ext[s]) * (m.t[s] / 2);
    }
    ga += a; if (m.type !== "garage") cond += a;
  }
  return {doc, G, rooms, roomAt, indoor, doors, windows, windowsOf, sideOf, fixtures, leaves, ga, cond};
}

/* ---------- small helpers ---------- */
const fmt = v => (Math.round(v * 1000) / 1000).toString();
const m2 = v => (Math.round(v * 10) / 10).toFixed(1) + " m²";
const mm = v => Math.round(v * 1000) + " mm";
const item = (ok, ids, label, value, limit, note) => ({ok, element_ids: ids, label, value, limit, note});
function verdict(items, emptyNote) {
  if (!items.length) return {status: "N/A", items, note: emptyNote || "Nothing in the plan this rule applies to."};
  return {status: items.every(i => i.ok) ? "PASS" : "FAIL", items};
}
// project a point into a fixture's local frame: lateral (along the wall) and depth (out from the wall)
const local = (fx, p, G) => ({l: G.dot(G.sub(p, fx.c), fx.u), d: G.dot(G.sub(p, fx.c), fx.fr)});
const range = vals => [Math.min(...vals), Math.max(...vals)];
// distance from the fixture centre along +dir / -dir to the room's clear box
function rayToBox(c, dir, b) {
  let t = Infinity;
  if (dir.x > 0.5) t = b.x1 - c.x; else if (dir.x < -0.5) t = c.x - b.x0;
  else if (dir.y > 0.5) t = b.y1 - c.y; else if (dir.y < -0.5) t = c.y - b.y0;
  return t;
}
const neg = v => ({x: -v.x, y: -v.y});

/* ---------- measure functions ---------- */
const MEASURES = {
  room_min_area_dim(M, p) {
    const cands = M.rooms.filter(m => p.types.includes(m.type) && (p.staff === undefined || m.staff === p.staff));
    return verdict(cands.map(m => item(m.area >= p.min_area - EPS && m.minDim >= p.min_dim - EPS, [m.id], m.name,
      `${m2(m.area)}, ${fmt(m.cw)} × ${fmt(m.cd)} m clear`, `≥ ${p.min_area} m², ≥ ${p.min_dim} m`)));
  },

  door_min_width(M, p) {
    const cands = M.doors.filter(d => p.styles.includes(d.style));
    return verdict(cands.map(d => {
      const bath = [d.a, d.b].some(m => m && m.type === "bathroom");
      const lim = bath ? p.bathroom : p.general;
      const names = [d.other ? d.other.name : "Outside", d.into ? d.into.name : "Outside"].join(" → ");
      return item(d.w >= lim - EPS, [d.id], `Door ${names}`, mm(d.w), `≥ ${mm(lim)}${bath ? " (bathroom / toilet)" : ""}`);
    }));
  },

  room_depth_ratio(M, p) {
    const out = [];
    for (const m of M.rooms.filter(m => p.types.includes(m.type))) {
      const sides = [...new Set(M.windowsOf(m).map(w => M.sideOf(m, w.g.c)))];
      if (!sides.length) continue;                         // no window at all: K-12 reports it
      if (sides.length > 1) { out.push(item(true, [m.id], m.name, `windows on ${sides.join(" + ")}`, "≤ 3 × window-wall width")); continue; }
      const s = sides[0], width = (s === "N" || s === "S") ? m.cw : m.cd, depth = (s === "N" || s === "S") ? m.cd : m.cw;
      out.push(item(depth <= p.max_ratio * width + EPS, [m.id], m.name,
        `depth ${fmt(depth)} m, window wall ${fmt(width)} m (${s})`, `depth ≤ ${p.max_ratio} × ${fmt(width)} = ${fmt(p.max_ratio * width)} m`));
    }
    return verdict(out);
  },

  habitable_has_window(M, p) {
    return verdict(M.rooms.filter(m => p.types.includes(m.type)).map(m => {
      const n = M.windowsOf(m).length;
      return item(n > 0, [m.id], m.name, n ? `${n} window(s)` : "no window", "≥ 1 window to outdoors");
    }));
  },

  corridor_min_width(M, p) {
    return verdict(M.rooms.filter(m => m.type === "hall").map(m =>
      item(m.minDim >= p.min_width - EPS, [m.id], m.name, `${fmt(m.minDim)} m clear`, `≥ ${p.min_width} m`)));
  },

  parking_bays(M, p) {
    const g = M.rooms.filter(m => m.type === "garage");
    if (!g.length) return {status: "NOT CHECKABLE", items: [], needs: ["open parking bays on the plot (no garage in the plan)"]};
    const bays = g.reduce((s, m) => s + (Math.min(m.cw, m.cd) >= 6.0 - EPS ? 2 : 1), 0);
    return verdict([item(bays >= p.min_bays, g.map(m => m.id), g.map(m => m.name).join(", "), `${bays} bay(s) in garage`, `≥ ${p.min_bays} bay`)]);
  },

  garage_min_dims(M, p) {
    return verdict(M.rooms.filter(m => m.type === "garage").map(m => {
      const s = Math.min(m.cw, m.cd), l = Math.max(m.cw, m.cd);
      const dbl = s >= p.double_enclosed[0] - EPS && l >= p.double_enclosed[1] - EPS;
      const sgl = s >= p.single_enclosed[0] - EPS && l >= p.single_enclosed[1] - EPS;
      return item(dbl || sgl, [m.id], m.name, `${fmt(s)} × ${fmt(l)} m clear${dbl ? " (double)" : sgl ? " (single)" : ""}`,
        `≥ ${p.single_enclosed.join(" × ")} m single, ≥ ${p.double_enclosed.join(" × ")} m double`);
    }));
  },

  villa_sanitary_set(M) {
    const has = k => M.fixtures.some(f => k.includes(f.kind));
    const missing = [["wc", ["wc"]], ["wash basin", ["basin"]], ["bath or shower", ["tub", "shower"]]].filter(([, k]) => !has(k)).map(([n]) => n);
    return verdict([item(!missing.length, [], "Villa", missing.length ? "missing: " + missing.join(", ") : "WC, basin and shower/bath present", "WC + basin + bath or shower")]);
  },

  fixture_side_clearance(M, p) {
    const G = M.G, out = [];
    for (const fx of M.fixtures.filter(f => p.kinds.includes(f.kind))) {
      if (!fx.room) { out.push(item(false, [fx.id], fx.label, "not inside a room", "")); continue; }
      const b = fx.room.clear;
      let plus = rayToBox(fx.c, fx.u, b), minus = rayToBox(fx.c, neg(fx.u), b), what = {plus: "wall", minus: "wall"};
      let adj = Infinity, adjName = "";
      for (const o of M.fixtures) {
        if (o === fx || o.room !== fx.room) continue;
        const pts = o.corners.map(q => local(fx, q, G)), [l0, l1] = range(pts.map(q => q.l)), [d0, d1] = range(pts.map(q => q.d));
        if (Math.min(d1, fx.hd) - Math.max(d0, -fx.hd) <= 0.01) continue;     // not beside this fixture
        if (p.kinds.includes(o.kind)) {                                       // adjacent WC / basin: centre to centre
          const cc = Math.abs(local(fx, o.c, G).l); if (cc < adj) { adj = cc; adjName = o.label; }
        } else if (l0 >= 0 && l0 < plus) { plus = l0; what.plus = o.label; }
        else if (l1 <= 0 && -l1 < minus) { minus = -l1; what.minus = o.label; }
        else if (l0 < 0 && l1 > 0) { plus = 0; what.plus = o.label + " (overlap)"; }
      }
      const side = Math.min(plus, minus), sideWhat = plus <= minus ? what.plus : what.minus;
      const ok = side >= p.to_side - EPS && adj >= p.to_adjacent - EPS;
      const val = `${mm(side)} to ${sideWhat}` + (adj < Infinity ? `; ${mm(adj)} to centre of ${adjName}` : "");
      out.push(item(ok, [fx.id, fx.room.id], `${fx.label} in ${fx.room.name}`, val, `≥ ${mm(p.to_side)} side, ≥ ${mm(p.to_adjacent)} to adjacent fixture centre`));
    }
    return verdict(out);
  },

  fixture_front_clearance(M, p) {
    const G = M.G, out = [];
    for (const fx of M.fixtures.filter(f => p.kinds.includes(f.kind))) {
      if (!fx.room) { out.push(item(false, [fx.id], fx.label, "not inside a room", "")); continue; }
      let wall = rayToBox(fx.c, fx.fr, fx.room.clear) - fx.hd, fix = Infinity, fixName = "", door = Infinity;
      const inFront = pts => {
        const q = pts.map(x => local(fx, x, G)), [l0, l1] = range(q.map(x => x.l)), [d0, d1] = range(q.map(x => x.d));
        if (Math.min(l1, fx.hw) - Math.max(l0, -fx.hw) <= 0.01 || d1 <= fx.hd + 0.001) return Infinity;
        return Math.max(0, d0 - fx.hd);
      };
      for (const o of M.fixtures) { if (o === fx || o.room !== fx.room) continue; const g = inFront(o.corners); if (g < fix) { fix = g; fixName = o.label; } }
      for (const lf of M.leaves) { if (lf.room !== fx.room) continue; door = Math.min(door, inFront(lf.pts)); }
      const wallOrDoor = Math.min(wall, door), wd = door < wall ? "door leaf" : "wall";
      const ok = wallOrDoor >= p.to_wall - EPS && fix >= p.to_fixture - EPS;
      const val = `${mm(wallOrDoor)} to ${wd}` + (fix < Infinity ? `; ${mm(fix)} to ${fixName}` : "");
      out.push(item(ok, [fx.id, fx.room.id], `${fx.label} in ${fx.room.name}`, val, `≥ ${mm(p.to_wall)} to wall / door leaf, ≥ ${mm(p.to_fixture)} to opposite fixture`));
    }
    return verdict(out);
  },

  floor_drain_wet_rooms(M, p) {
    const wet = M.rooms.filter(m => m.type !== "outdoor" &&
      (p.wet_types.includes(m.type) || M.fixtures.some(f => f.room === m && p.wet_kinds.includes(f.kind))));
    return verdict(wet.map(m => {
      const n = M.fixtures.filter(f => f.room === m && f.kind === "fd").length;
      return item(n > 0, [m.id], m.name, n ? `${n} floor drain(s)` : "no floor drain", "≥ 1 floor drain");
    }));
  },

  db_forbidden_rooms(M, p) {
    const dbs = M.fixtures.filter(f => f.kind === "panel");
    if (!dbs.length) return {status: "NOT CHECKABLE", items: [], needs: ["distribution board (DB) location"]};
    return verdict(dbs.map(fx => {
      const r = fx.room, bad = [];
      if (!r) bad.push("not inside a room");
      else if (p.forbidden_types.includes(r.type)) bad.push(`${r.type === "laundry" ? "laundry (wet location)" : r.type === "closet" ? "store room / closet" : r.type} not allowed`);
      if (r && r.staff) bad.push("bedroom (staff) not allowed");
      for (const o of M.fixtures) if (p.near_kinds.includes(o.kind) && M.G.dist(o.c, fx.c) < p.near_dist) bad.push(`next to ${o.label}`);
      return item(!bad.length, [fx.id].concat(r ? [r.id] : []), `DB${r ? " in " + r.name : ""}`, bad.length ? bad.join("; ") : `${r.name} (${r.type})`, "not in bath, wet area, bedroom, kitchen, store, above sink");
    }));
  },

  sprinkler_threshold(M, p) {
    const req = M.ga > p.max_ga_without;
    if (!req) return {status: "PASS", items: [item(true, [], "Ground floor", `GA ${m2(M.ga)}`, `sprinklers only above ${p.max_ga_without} m²`)], note: "Sprinklers and hose reels not required."};
    return {status: "NOT CHECKABLE", items: [item(false, [], "Ground floor", `GA ${m2(M.ga)}`, `> ${p.max_ga_without} m² → sprinklers in every room + hose reels`)],
            needs: ["sprinkler and hose reel layout"]};
  },

  escape_primary(M, p) {
    // breadth-first search from the outside through every door opening
    const reach = new Set(), viaGarageOnly = new Set();
    const walk = allowGarage => {
      const seen = new Set(), q = [];
      for (const d of M.doors) if (d.toOutside && (allowGarage || d.style !== "garage")) for (const m of [d.a, d.b]) if (M.indoor(m) && !seen.has(m)) { seen.add(m); q.push(m); }
      while (q.length) { const m = q.shift(); for (const d of M.doors) { if (!allowGarage && d.style === "garage") continue; if (d.a !== m && d.b !== m) continue; const o = d.a === m ? d.b : d.a; if (M.indoor(o) && !seen.has(o)) { seen.add(o); q.push(o); } } }
      return seen;
    };
    const all = walk(true), noVeh = walk(false);
    for (const m of all) { reach.add(m); if (!noVeh.has(m)) viaGarageOnly.add(m); }
    return verdict(M.rooms.filter(m => p.types.includes(m.type)).map(m =>
      item(reach.has(m), [m.id], m.name, reach.has(m) ? (viaGarageOnly.has(m) ? "reaches outside only through the garage vehicle door" : "door route to outside") : "no door route to outside",
        "primary means of escape to outside", viaGarageOnly.has(m) ? "check with the reviewer" : undefined)));
  },

  two_exits_over_area(M, p) {
    if (M.ga <= p.area) return {status: "N/A", items: [item(true, [], "Floor", `GA ${m2(M.ga)}`, `rule applies above ${p.area} m²`)], note: `Floor area is not above ${p.area} m².`};
    const exits = M.doors.filter(d => d.toOutside && d.style !== "garage");
    let far = 0; for (const a of exits) for (const b of exits) far = Math.max(far, M.G.dist(a.g.c, b.g.c));
    return verdict([item(exits.length >= 2, exits.map(d => d.id), "Exits to outside",
      `${exits.length} exit(s)${exits.length >= 2 ? `, up to ${fmt(far)} m apart` : ""} (GA ${m2(M.ga)})`, "≥ 2 remote primary exits",
      exits.length >= 2 ? "remoteness is judged by the reviewer" : undefined)]);
  },

  fixture_present(M, p) {
    const n = M.fixtures.filter(f => p.kinds.includes(f.kind)).length;
    return Object.assign(verdict([item(n > 0, [], p.kinds.join(", "), n ? `${n} present` : "none", "≥ 1")]), p.note ? {note: p.note} : {});
  },

  gas_rule(M, p) {
    const gas = M.doc.gas || p.default_gas;
    if (gas === "electric") return {status: "N/A", items: [], note: M.doc.gas ? "Plan is all-electric." : "Assumed all-electric (pack default): no LPG on site."};
    return {status: "NOT CHECKABLE", items: [], needs: ["LPG cylinder location"]};
  },

  /* estimates shown with NOT CHECKABLE rules: never a pass */
  glazing_ratio_estimate(M, p) {
    const rows = M.rooms.filter(m => p.types.includes(m.type) && (p.staff === undefined || m.staff === p.staff)).map(m => {
      const a = M.windowsOf(m).reduce((s, w) => s + w.w * (w.h || 0), 0);
      return `${m.name} ${Math.round(100 * a / m.area)}%`;
    });
    return `Estimate with the engine's default window height (1.2 m, gross opening, not net glazing; target ${p.min_ratio * 100}%): ${rows.join(", ") || "no rooms"}.`;
  },
  ventilation_rate_estimate(M, p) {
    const nbr = Math.max(1, M.rooms.filter(m => m.type === "bedroom").length);
    const q = p.a * M.cond + p.b * (nbr + 1);
    return `Required Qtot ≈ ${p.a} × ${m2(M.cond)} + ${p.b} × (${nbr} + 1) = ${Math.round(q)} L/s (conditioned area, ${nbr} bedrooms incl. staff).`;
  }
};

/* ---------- run a pack ---------- */
function run(doc, G, {pack = "dubai", rulesDir} = {}) {
  rulesDir = rulesDir || path.join(__dirname, "..", "rules");
  const {manifest, rules} = loadPack(pack, rulesDir);
  const M = buildModel(doc, G);
  const results = rules.map(r => {
    const base = {id: r.id, pack: r.pack, clause: r.clause, page: r.page, title: r.title, requirement: r.requirement,
                  level: r.level, verified: r.verified !== false, engine: r.engine};
    let res;
    if (r.measure === "needs_data") res = {status: "NOT CHECKABLE", items: [], needs: r.needs || []};
    else if (r.measure === "reviewer") res = {status: "NOT CHECKABLE", items: [], by: "reviewer", note: "Left to the reviewer agent."};
    else if (r.measure === "out_of_scope") res = {status: "OUT OF SCOPE", items: [], note: r.note};
    else if (MEASURES[r.measure]) res = MEASURES[r.measure](M, r.params || {});
    else throw new Error(`Rule ${r.id}: unknown measure "${r.measure}"`);
    if (r.estimate && MEASURES[r.estimate.measure]) res.estimate = MEASURES[r.estimate.measure](M, r.estimate.params || {});
    if (res.status === "FAIL" && r.level === "should") res.status = "ADVISE";
    return Object.assign(base, res);
  });
  const summary = {}; for (const s of STATUS_ORDER) summary[s] = results.filter(x => x.status === s).length;
  return {pack, title: manifest.title, authorities: manifest.authorities, assumptions: manifest.assumptions,
          project: doc.project, level: doc.level, gross_area_m2: Math.round(M.ga * 10) / 10, summary, results};
}

/* ---------- Markdown report ---------- */
function toMarkdown(rep) {
  const L = [], ref = r => `${r.clause}${r.page ? `, p.${r.page}` : ""}${r.verified ? "" : " · **unverified**"}`;
  L.push(`# Code check — ${rep.title}`, "", `${rep.project} · ${rep.level} · GA ${rep.gross_area_m2} m²`, "");
  L.push("| " + STATUS_ORDER.join(" | ") + " |", "|" + STATUS_ORDER.map(() => "---").join("|") + "|", "| " + STATUS_ORDER.map(s => rep.summary[s]).join(" | ") + " |", "");
  L.push("**Rule packs:** " + rep.authorities.map(a => `${a.document} (${a.edition})`).join(" · "), "");
  L.push("**Assumptions:**", ...rep.assumptions.map(a => "- " + a), "");
  const by = s => rep.results.filter(r => r.status === s);
  const detail = (r, onlyBad) => {
    L.push(`### ${r.id} ${r.title} — ${ref(r)}`, "", r.requirement, "");
    const its = onlyBad ? r.items.filter(i => !i.ok) : r.items;
    for (const i of its) L.push(`- ${i.ok ? "✓" : "✗"} **${i.label}**: ${i.value} (needs ${i.limit})${i.note ? ` — ${i.note}` : ""}`);
    if (r.note) L.push(`- ${r.note}`);
    L.push("");
  };
  if (by("FAIL").length) { L.push("## Fails", ""); by("FAIL").forEach(r => detail(r, true)); }
  if (by("ADVISE").length) { L.push("## Advisories (\"should\" rules)", ""); by("ADVISE").forEach(r => detail(r, true)); }
  const nc = by("NOT CHECKABLE").filter(r => r.by !== "reviewer"), rv = by("NOT CHECKABLE").filter(r => r.by === "reviewer");
  if (nc.length) {
    L.push("## Not checkable (data missing)", "");
    for (const r of nc) {
      L.push(`- **${r.id} ${r.title}** (${ref(r)}): needs ${(r.needs || []).join(", ") || "more data"}.`);
      for (const i of r.items) L.push(`  - ${i.label}: ${i.value} (${i.limit})`);
      if (r.estimate) L.push(`  - ${r.estimate}`);
    }
    L.push("");
  }
  if (rv.length) { L.push("## Left to the reviewer", "", ...rv.map(r => `- **${r.id} ${r.title}** (${ref(r)}): ${r.requirement}`), ""); }
  if (by("PASS").length) {
    L.push("## Passed", "");
    for (const r of by("PASS")) L.push(`- **${r.id} ${r.title}** (${ref(r)}): ${r.items.length} checked${r.note ? ` — ${r.note}` : ""}` +
      r.items.filter(i => i.note).map(i => `; note: ${i.label} ${i.note}`).join(""));
    L.push("");
  }
  if (by("N/A").length) { L.push("## Not applicable", "", ...by("N/A").map(r => `- **${r.id} ${r.title}**: ${r.note || ""}`), ""); }
  if (by("OUT OF SCOPE").length) { L.push("## Out of scope", "", ...by("OUT OF SCOPE").map(r => `- **${r.id} ${r.title}**: ${r.note || ""}`), ""); }
  return L.join("\n");
}

module.exports = {run, toMarkdown, loadPack, MEASURES, STATUS_ORDER};
