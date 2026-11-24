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
  // building footprint to the outer wall faces (outdoor rooms excluded), used for setbacks and façades
  const ind = rooms.filter(m => m.type !== "outdoor"), e = (G.extT || 0.25) / 2;
  const footprint = ind.length ? {x0: Math.min(...ind.map(m => m.box.x0)) - e, y0: Math.min(...ind.map(m => m.box.y0)) - e, x1: Math.max(...ind.map(m => m.box.x1)) + e, y1: Math.max(...ind.map(m => m.box.y1)) + e} : null;
  const facadeOf = c => { const f = footprint; const d = {N: Math.abs(c.y - f.y0), S: Math.abs(c.y - f.y1), W: Math.abs(c.x - f.x0), E: Math.abs(c.x - f.x1)}; return Object.keys(d).sort((p, q) => d[p] - d[q])[0]; };
  const isOpenKitchen = m => doors.some(d => d.style === "opening" && (d.a === m || d.b === m) && [d.a, d.b].some(r => r && r !== m && ["living", "dining", "hall"].includes(r.type)));
  const has = ks => fixtures.some(f => ks.includes(f.kind));
  const layer = {fire: has(["smoke", "smoke_sounder", "heat", "facp", "av_outdoor"]), vent: has(["exhaust", "hood", "fresh_air"]), services: has(["water_tank", "pump"])};
  return {doc, G, rooms, roomAt, indoor, doors, windows, windowsOf, sideOf, fixtures, leaves, ga, cond, footprint, facadeOf, isOpenKitchen, layer};
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
const boxDist = (c, b) => Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1));
// a design layer the plan does not have yet: not a failure, just not checkable
const noLayer = what => ({status: "NOT CHECKABLE", items: [], needs: [what]});
// rooms whose data is missing make the rule NOT CHECKABLE, unless something already fails
function withMissing(res, missing, what) {
  if (!missing.length) return res;
  const need = `${what} for ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ` +${missing.length - 6} more` : ""}`;
  if (res.status === "FAIL") return Object.assign(res, {note: `Also missing ${need}.`});
  return Object.assign(res, {status: "NOT CHECKABLE", needs: [need]});
}
// clear opening of an operable window (opening size, frame not deducted)
function escapeClear(w, p) {
  const op = w.o.op, hGiven = (w.o.given || []).includes("h");
  const cw = op === "sliding" ? w.w / 2 : (op === "casement" || op === "hung") ? w.w : 0;
  const ch = op === "hung" ? w.h / 2 : (op === "casement" || op === "sliding") ? w.h : 0;
  const ok = hGiven && cw >= p.min_w - EPS && ch >= p.min_h - EPS && cw * ch >= p.min_area - EPS && w.sill <= p.max_bottom + EPS;
  return {ok, desc: `${mm(cw)} × ${mm(ch)} = ${(Math.round(cw * ch * 100) / 100)} m² (${op}${hGiven ? "" : ", height not given"})`};
}

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
        if (o === fx || o.room !== fx.room || (p.ignore || []).includes(o.kind) || o.def.mount) continue;   // floor drains, ceiling and wall-mounted items are not obstructions
        const pts = o.corners.map(q => local(fx, q, G)), [l0, l1] = range(pts.map(q => q.l)), [d0, d1] = range(pts.map(q => q.d));
        if (Math.min(d1, fx.hd) - Math.max(d0, -fx.hd) <= 0.001) continue;     // not beside this fixture
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
        if (Math.min(l1, fx.hw) - Math.max(l0, -fx.hw) <= 0.001 || d1 <= fx.hd + 0.001) return Infinity;
        return Math.max(0, d0 - fx.hd);
      };
      for (const o of M.fixtures) { if (o === fx || o.room !== fx.room || (p.ignore || []).includes(o.kind) || o.def.mount) continue; const g = inFront(o.corners); if (g < fix) { fix = g; fixName = o.label; } }
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
      // "above sinks": a sink or basin in the same room within near_dist (a basin behind the wall does not count)
      for (const o of M.fixtures) if (p.near_kinds.includes(o.kind) && o.room === fx.room && M.G.dist(o.c, fx.c) < p.near_dist) bad.push(`above / next to ${o.label}`);
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

  /* ---------- v0.5 rules on designed data (spec fields and new fixture kinds) ---------- */
  kitchen_manoeuvre(M, p) {
    const out = [], missing = [];
    for (const m of M.rooms.filter(m => m.type === "kitchen")) {
      const cs = M.G.counterRects(m.r); if (!cs.length) { missing.push(m.name); continue; }
      const b = m.clear;
      for (const c of cs) {
        let gap, opp = "wall";
        const facing = {N: "S", S: "N", W: "E", E: "W"}[c.side];
        const others = cs.filter(o => o.side === facing && (c.side === "N" || c.side === "S" ? Math.min(o.x1, c.x1) - Math.max(o.x0, c.x0) > 0.01 : Math.min(o.y1, c.y1) - Math.max(o.y0, c.y0) > 0.01));
        if (c.side === "N") { gap = b.y1 - c.y1; for (const o of others) if (o.y0 - c.y1 < gap) { gap = o.y0 - c.y1; opp = "opposite counter"; } }
        if (c.side === "S") { gap = c.y0 - b.y0; for (const o of others) if (c.y0 - o.y1 < gap) { gap = c.y0 - o.y1; opp = "opposite counter"; } }
        if (c.side === "W") { gap = b.x1 - c.x1; for (const o of others) if (o.x0 - c.x1 < gap) { gap = o.x0 - c.x1; opp = "opposite counter"; } }
        if (c.side === "E") { gap = c.x0 - b.x0; for (const o of others) if (c.x0 - o.x1 < gap) { gap = c.x0 - o.x1; opp = "opposite counter"; } }
        out.push(item(gap >= p.min - EPS, [m.id], `${m.name} ${c.side} counter`, `${fmt(gap)} m to ${opp}`, `≥ ${p.min} m`));
      }
    }
    return withMissing(verdict(out), missing, "kitchen counters");
  },

  ceiling_heights(M, p) {
    const out = [], missing = [];
    for (const m of M.rooms.filter(m => m.type !== "outdoor")) {
      if (!m.r.ceil_set) { missing.push(m.name); continue; }
      const hab = p.habitable_types.includes(m.type), lim = hab ? p.habitable : p.other;
      out.push(item(m.r.ceil >= lim - EPS, [m.id], m.name, `${fmt(m.r.ceil)} m`, `≥ ${lim} m${hab ? " (living / bedroom)" : ""}`));
    }
    return withMissing(verdict(out), missing, "designed ceiling height");
  },

  glazing_ratio(M, p) {
    const out = [], missing = [], defGlass = M.doc.glass;
    for (const m of M.rooms.filter(m => p.types.includes(m.type) && (p.staff === undefined || m.staff === p.staff))) {
      const ops = M.windowsOf(m).concat(M.doors.filter(d => d.o.glazed && (d.a === m || d.b === m)));
      if (ops.some(o => !(o.o.given || []).includes("h") && o.type === "window") || ops.some(o => (o.o.glass ?? defGlass) === undefined)) { missing.push(m.name); continue; }
      const net = ops.reduce((s, o) => s + o.w * o.h * (o.o.glass ?? defGlass), 0), ratio = net / m.area;
      out.push(item(ratio >= p.min_ratio - 1e-6, [m.id], m.name, `${Math.round(ratio * 1000) / 10}% (${fmt(net)} m² net glazing / ${m2(m.area)})`, `≥ ${p.min_ratio * 100}%`));
    }
    return withMissing(verdict(out), missing, "window height and net glazing ratio (glass)");
  },

  window_sill(M, p) {
    const out = [], missing = [];
    for (const w of M.windows) {
      const room = w.a && w.a.type !== "outdoor" ? w.a : w.b; const nm = room ? room.name : "?";
      if (!(w.o.given || []).includes("sill")) { missing.push(nm); continue; }
      out.push(item(w.sill >= p.min - EPS, [w.id], `Window in ${nm}`, mm(w.sill), `≥ ${mm(p.min)}`));
    }
    return withMissing(verdict(out), [...new Set(missing)], "designed window sill height");
  },

  window_operator(M, p) {
    const ws = M.windows.filter(w => (w.o.given || []).includes("operator_h"));
    if (!ws.length) return {status: "N/A", items: [], note: "No windows with mechanical opening means declared (give operator_h for those that have them)."};
    return verdict(ws.map(w => item(w.o.operator_h >= p.min - EPS && w.o.operator_h <= p.max + EPS, [w.id], "Window operator", mm(w.o.operator_h), `${mm(p.min)}–${mm(p.max)}`)));
  },

  building_height(M, p) {
    if (M.doc.building_h === undefined) return {status: "NOT CHECKABLE", items: [], needs: ["building height (building_h)"]};
    return verdict([item(M.doc.building_h <= p.max + EPS, [], "Building", `${fmt(M.doc.building_h)} m`, `≤ ${p.max} m`)]);
  },

  setbacks(M, p) {
    const plot = M.doc.plot; if (!plot) return {status: "NOT CHECKABLE", items: [], needs: ["plot boundary with road / sikka sides"]};
    const fp = M.footprint, type = M.doc.building_type || "villa", def = p.defaults[type] || p.defaults.villa;
    const dist = {N: fp.y0 - plot.y, S: plot.y + plot.d - fp.y1, W: fp.x0 - plot.x, E: plot.x + plot.w - fp.x1};
    const usedDefault = [];
    const out = ["N", "E", "S", "W"].map(s => {
      const cat = plot.road.includes(s) ? "road" : plot.sikka.includes(s) ? "sikka" : "neighbour";
      let lim = plot.setbacks && plot.setbacks[cat]; if (lim === undefined) { lim = def[cat]; usedDefault.push(cat); }
      return item(dist[s] >= lim - EPS, [], `${s} side (${cat})`, `${fmt(dist[s])} m from the outer wall face`, `≥ ${lim} m`);
    });
    const r = verdict(out);
    if (usedDefault.length) r.note = `Setbacks for ${[...new Set(usedDefault)].join(", ")} taken from DBC Table K.1 (${type}) because the plot gives none (pack assumption).`;
    return r;
  },

  party_wall(M, p) {
    const t = M.doc.building_type;
    if (!t) return {status: "NOT CHECKABLE", items: [], needs: ["building type (villa / townhouse)"]};
    if (t !== "townhouse") return {status: "N/A", items: [], note: "Detached villa: no party wall."};
    if (M.doc.party_wall_h === undefined) return {status: "NOT CHECKABLE", items: [], needs: ["party wall fire rating in hours (party_wall_h)"]};
    const lim = M.doc.sprinklered ? p.sprinklered : p.default;
    return verdict([item(M.doc.party_wall_h >= lim, [], "Party wall", `${M.doc.party_wall_h} h`, `≥ ${lim} h${M.doc.sprinklered ? " (sprinklered)" : ""}`)]);
  },

  detection_system(M, p) {
    if (!M.layer.fire) return noLayer("fire detection layer (detectors and panel)");
    const det = M.fixtures.filter(f => p.detectors.includes(f.kind)), panel = M.fixtures.filter(f => f.kind === "facp");
    return verdict([item(det.length > 0 && panel.length > 0, det.concat(panel).map(f => f.id), "Villa", `${det.length} detector(s), ${panel.length} panel(s)`, "smoke detection system with a panel")]);
  },

  detectors_by_room(M, p) {
    if (!M.layer.fire) return noLayer("fire detection layer (detectors and panel)");
    const out = [];
    for (const [type, kinds] of Object.entries(p.rooms)) for (const m of M.rooms.filter(m => m.type === type)) {
      const has = M.fixtures.filter(f => f.room === m && kinds.includes(f.kind));
      out.push(item(has.length > 0, [m.id].concat(has.map(f => f.id)), m.name, has.length ? has.map(f => f.label).join(", ") : "none", kinds.map(k => k.replace("_", " + ")).join(" or ")));
    }
    return verdict(out);
  },

  kitchen_detector(M, p) {
    if (!M.layer.fire) return noLayer("fire detection layer (detectors and panel)");
    const kit = M.rooms.filter(m => m.type === "kitchen" && (p.open ? M.isOpenKitchen(m) : !M.isOpenKitchen(m)));
    if (!kit.length) return {status: "N/A", items: [], note: p.open ? "No open kitchen." : "No closed kitchen."};
    return verdict(kit.map(m => {
      const heat = M.fixtures.filter(f => f.room === m && p.kitchen_kinds.includes(f.kind));
      if (!p.open) return item(heat.length > 0, [m.id], m.name, heat.length ? heat.map(f => f.label).join(", ") : "no heat detector", "heat detector (or listed kitchen detector)");
      // open kitchen: heat detector in the kitchen and a smoke detector >= 3 m from the counter in the adjoining living room
      const living = M.doors.filter(d => d.style === "opening" && (d.a === m || d.b === m)).map(d => d.a === m ? d.b : d.a).filter(r => r && p.living_types.includes(r.type));
      const counters = M.G.counterRects(m.r).map(c => ({x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2, box: c}));
      const ref = counters.length ? counters : M.fixtures.filter(f => f.room === m && p.counter_kinds.includes(f.kind)).map(f => ({x: f.c.x, y: f.c.y}));
      const sm = M.fixtures.filter(f => living.includes(f.room) && p.smoke_kinds.includes(f.kind));
      const far = sm.filter(f => ref.every(r => r.box ? boxDist(f.c, r.box) >= p.min_dist - EPS : M.G.dist(f.c, r) >= p.min_dist - EPS));
      return item(heat.length > 0 && far.length > 0, [m.id], m.name, `${heat.length} heat detector(s); ${far.length} smoke detector(s) ≥ ${p.min_dist} m from the counter in ${living.map(r => r.name).join(", ") || "no adjoining living room"}`,
        `heat detector + smoke detector ≥ ${p.min_dist} m from the counter`, counters.length ? undefined : "distance measured from the sink / range (no counters in the plan)");
    }));
  },

  facp_location(M) {
    if (!M.layer.fire) return noLayer("fire detection layer (detectors and panel)");
    const panels = M.fixtures.filter(f => f.kind === "facp");
    if (!panels.length) return verdict([item(false, [], "Fire alarm panel", "none", "panel near the front door")]);
    const entrances = M.doors.filter(d => d.toOutside && d.style !== "garage" && M.indoor(d.into || d.a || d.b));
    const entRooms = new Set(entrances.flatMap(d => [d.a, d.b]).filter(M.indoor));
    const fx = panels[0], near = entRooms.has(fx.room), dd = Math.min(...entrances.map(d => M.G.dist(d.g.c, fx.c)));
    if (near) return verdict([item(true, [fx.id], `Panel in ${fx.room.name}`, `${fmt(dd)} m from an entrance door`, "near the front door")]);
    return {status: "NOT CHECKABLE", by: "reviewer", items: [item(false, [fx.id], `Panel in ${fx.room ? fx.room.name : "?"}`, `${fmt(dd)} m from the nearest entrance door, not in an entrance room`, "near the front door")],
            note: "\"Near the front door\" has no number in the code; the reviewer judges this placement."};
  },

  av_outdoor(M) {
    if (!M.layer.fire) return noLayer("fire detection layer (detectors and panel)");
    const av = M.fixtures.filter(f => f.kind === "av_outdoor");
    if (!av.length) return verdict([item(false, [], "Outdoor AV device", "none", "visible from the approach road")]);
    const plot = M.doc.plot; if (!plot) return {status: "NOT CHECKABLE", items: [], needs: ["road side of the plot (plot.road)"]};
    return verdict(av.map(f => { const s = M.facadeOf(f.c); return item(plot.road.includes(s), [f.id], "Outdoor AV device", `on the ${s} façade`, `façade facing the road (${plot.road.join(", ") || "none given"})`); }));
  },

  flag_true(M, p) {
    const v = M.doc[p.field];
    if (v === undefined) return {status: "NOT CHECKABLE", items: [], needs: [p.needs]};
    return verdict([item(v === true, [], p.label, v ? "yes" : "no", "yes")]);
  },

  escape_secondary(M, p) {
    if (M.doc.sprinklered === true) return {status: "PASS", items: [], note: "Villa is sprinkler protected: no secondary means required."};
    const out = [], missing = [];
    for (const m of M.rooms.filter(m => p.types.includes(m.type))) {
      const direct = M.doors.some(d => d.toOutside && d.style !== "garage" && (d.a === m || d.b === m));
      if (direct) { out.push(item(true, [m.id], m.name, "door directly to the outside", "secondary means of escape")); continue; }
      const ws = M.windowsOf(m);
      if (ws.some(w => !w.o.op || (w.o.op !== "fixed" && !(w.o.given || []).includes("h")))) { missing.push(m.name); continue; }
      const best = ws.map(w => escapeClear(w, p)).find(e => e.ok);
      out.push(item(!!best, [m.id], m.name, best ? `escape window ${best.desc}` : (ws.length ? "no operable window large enough" : "no window"), "door to outside or an escape window (F-10)",
        best ? "window opening size; frame not deducted" : undefined));
    }
    return withMissing(verdict(out), missing, "window operation type (op)");
  },

  escape_window(M, p) {
    const out = [];
    for (const m of M.rooms.filter(m => p.types.includes(m.type))) {
      const ws = M.windowsOf(m).filter(w => w.o.op && w.o.op !== "fixed");
      if (!ws.length) continue;
      const e = ws.map(w => escapeClear(w, p)), best = e.find(x => x.ok) || e[0];
      out.push(item(!!e.find(x => x.ok), [m.id], m.name, best.desc, `≥ ${mm(p.min_w)} wide, ≥ ${mm(p.min_h)} high, ≥ ${p.min_area} m², bottom ≤ ${p.max_bottom} m`, "window opening size; frame not deducted"));
    }
    if (!out.length) return {status: "NOT CHECKABLE", items: [], needs: ["operable windows with their operation type (op)"]};
    return verdict(out);
  },

  extinguisher_kitchen(M) {
    if (!M.layer.fire && !M.fixtures.some(f => f.kind === "extinguisher")) return noLayer("fire safety layer (extinguisher)");
    return verdict(M.rooms.filter(m => m.type === "kitchen").map(m => {
      const ex = M.fixtures.filter(f => f.room === m && f.kind === "extinguisher");
      const doorD = ex.length ? Math.min(...M.doors.filter(d => d.a === m || d.b === m).map(d => M.G.dist(d.g.c, ex[0].c))) : null;
      return item(ex.length > 0, [m.id], m.name, ex.length ? `extinguisher ${fmt(doorD)} m from a kitchen door` : "none", "extinguisher inside the kitchen next to the exit door");
    }));
  },

  water_tank(M, p) {
    const t = M.fixtures.filter(f => f.kind === "water_tank");
    if (!t.length) return M.layer.services ? verdict([item(false, [], "Water tank", "none", "cold water storage tank")]) : noLayer("water services layer (tank, pump)");
    return verdict(t.map(f => {
      const ok = f.room && f.room.type !== "outdoor" && !p.unconditioned_types.includes(f.room.type);
      return item(ok, [f.id], `Tank in ${f.room ? f.room.name : "outside"}`, `${f.room ? f.room.type : "outside"}${f.f.litres ? `, ${f.f.litres} l` : ""}`, "inside a conditioned space, not exposed outdoors",
        f.f.litres ? "capacity must cover 24 h demand (DEWA); check the sizing" : "no capacity given");
    }));
  },

  db_height(M, p) {
    const dbs = M.fixtures.filter(f => f.kind === "panel");
    if (!dbs.length || dbs.some(f => f.f.top_h === undefined)) return {status: "NOT CHECKABLE", items: [], needs: ["DB mounting height to the top (top_h)"]};
    return verdict(dbs.map(f => item(f.f.top_h <= p.max + EPS, [f.id], "DB", `top at ${fmt(f.f.top_h)} m`, `≤ ${p.max} m`)));
  },

  fresh_air(M, p) {
    if (!M.layer.vent) return noLayer("ventilation layer (exhaust fans, hoods, fresh-air unit)");
    const fa = M.fixtures.filter(f => f.kind === "fresh_air"), nbr = Math.max(1, M.rooms.filter(m => m.type === "bedroom").length);
    const q = p.a * M.cond + p.b * (nbr + 1);
    if (!fa.length) return verdict([item(false, [], "Fresh air", "no fresh-air unit", `${Math.round(q)} L/s mechanical outdoor air`)]);
    if (fa.some(f => f.f.lps === undefined)) return {status: "NOT CHECKABLE", items: [], needs: ["fresh-air unit airflow (lps)"]};
    const sum = fa.reduce((s, f) => s + f.f.lps, 0);
    return verdict([item(sum >= q - 0.5, fa.map(f => f.id), "Fresh-air unit(s)", `${sum} L/s`, `≥ ${Math.round(q)} L/s = ${p.a} × ${m2(M.cond)} + ${p.b} × (${nbr} + 1)`)]);
  },

  mech_ventilation_present(M) {
    if (!M.layer.vent) return noLayer("ventilation layer (exhaust fans, hoods, fresh-air unit)");
    const fa = M.fixtures.filter(f => f.kind === "fresh_air");
    return verdict([item(fa.length > 0, fa.map(f => f.id), "Mechanical ventilation", fa.length ? "fresh-air unit provided" : "none: relies on windows", "mechanical outdoor air")]);
  },

  local_exhaust(M, p) {
    if (!M.layer.vent) return noLayer("ventilation layer (exhaust fans, hoods, fresh-air unit)");
    return verdict(M.rooms.filter(m => p.types.includes(m.type)).map(m => {
      const ex = M.fixtures.filter(f => f.room === m && (f.kind === "exhaust" || (m.type === "kitchen" && f.kind === "hood")));
      return item(ex.length > 0, [m.id].concat(ex.map(f => f.id)), m.name, ex.length ? ex.map(f => f.label).join(", ") : "no exhaust", m.type === "kitchen" ? "range hood or exhaust fan" : "exhaust fan");
    }));
  },

  exhaust_rates(M, p) {
    if (!M.layer.vent) return noLayer("ventilation layer (exhaust fans, hoods, fresh-air unit)");
    const units = M.fixtures.filter(f => (f.kind === "exhaust" || f.kind === "hood") && f.room && (f.room.type === "bathroom" || f.room.type === "kitchen"));
    const missing = units.filter(f => f.f.lps === undefined || !f.f.mode).map(f => `${f.label} in ${f.room.name}`);
    const mine = units.filter(f => f.f.mode === p.mode && f.f.lps !== undefined);
    const out = mine.map(f => {
      const r = f.room, vol = r.area * (r.r.ceil || 2.7), ach = l => Math.round(l * vol * 1000 / 3600);
      let lim, txt;
      if (r.type === "bathroom") { lim = p.bathroom; txt = `${lim} L/s (bathroom)`; }
      else if (p.mode === "continuous") { lim = ach(p.kitchen_ach); txt = `${p.kitchen_ach} ach = ${lim} L/s (enclosed kitchen)`; }
      else if (f.kind === "hood") { lim = p.kitchen_hood; txt = `${lim} L/s (vented range hood)`; }
      else { lim = Math.min(p.kitchen_fan, ach(p.kitchen_ach)); txt = `${p.kitchen_fan} L/s or ${p.kitchen_ach} ach = ${lim} L/s (kitchen fan)`; }
      return item(f.f.lps >= lim - 0.5, [f.id], `${f.label} in ${r.name}`, `${f.f.lps} L/s ${p.mode}`, `≥ ${txt}`);
    });
    if (!out.length && !missing.length) return {status: "N/A", items: [], note: `No ${p.mode} exhaust units.`};
    return withMissing(verdict(out), missing, "exhaust airflow (lps) and mode (demand / continuous)");
  },

  lpg_location(M) {
    const gas = M.doc.gas || "electric";
    if (gas !== "lpg") return {status: "N/A", items: [], note: M.doc.gas ? `Gas: ${gas}.` : "Assumed all-electric (pack default): no LPG on site."};
    const cyl = M.fixtures.filter(f => f.kind === "lpg");
    if (!cyl.length) return verdict([item(false, [], "LPG", "LPG declared but no cylinder location", "cylinders outdoors")]);
    return verdict(cyl.map(f => item(!f.room || f.room.type === "outdoor", [f.id], "LPG cylinders", f.room && f.room.type !== "outdoor" ? `inside ${f.room.name}` : "outdoors", "not indoors")));
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

/* values the engine uses while placing fixtures, taken from the same rules the checker applies */
function placementRules(pack, rulesDir) {
  rulesDir = rulesDir || path.join(__dirname, "..", "rules");
  const {rules} = loadPack(pack, rulesDir);
  const one = m => rules.find(r => r.measure === m);
  const side = one("fixture_side_clearance"), front = one("fixture_front_clearance"), fd = one("floor_drain_wet_rooms");
  const out = {};
  if (side && front) out.clear = {kinds: side.params.kinds, to_side: side.params.to_side, to_adjacent: side.params.to_adjacent,
    to_wall: front.params.to_wall, to_fixture: front.params.to_fixture, ignore: side.params.ignore || [], ref: `${side.id}/${front.id} ${side.clause.split(" ")[0]}`};
  if (fd) out.drains = {wet_types: fd.params.wet_types, wet_kinds: fd.params.wet_kinds, ref: `${fd.id} ${fd.clause}`};
  return out;
}

module.exports = {run, toMarkdown, loadPack, placementRules, MEASURES, STATUS_ORDER};
