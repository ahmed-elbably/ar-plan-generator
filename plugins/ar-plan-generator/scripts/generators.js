/*
 * AR Plan generators: devices the code prescribes, placed by the engine when a rule pack is active (build --pack).
 *
 *   devices(ctx)    → spec fixture entries for detectors, fire alarm panel, outdoor AV device, kitchen extinguisher,
 *                     range hood, exhaust fans and the fresh-air unit (placed by the engine like any spec fixture)
 *   electrical(ctx) → sockets, shaver outlets, DP switches, cooker control switches (with coordinates) and the
 *                     circuit schedule, generated after the other fixtures are placed
 *
 * Code values come from the rule pack (rule params); counts and positions the code leaves open come from the
 * pack's "generator" block, which is labelled as layout defaults. Anything a spec already provides in a room is
 * kept, and nothing is generated twice. Every generated item carries auto: true.
 */
"use strict";

const SIDES = ["N", "E", "S", "W"];
const ceil5 = v => Math.ceil(v / 5) * 5;

/* side of a room box a point lies on, and its fraction along that side */
function sideAndAt(box, c) {
  const d = {N: Math.abs(c.y - box.y0), S: Math.abs(c.y - box.y1), W: Math.abs(c.x - box.x0), E: Math.abs(c.x - box.x1)};
  const s = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
  const at = s === "N" || s === "S" ? (c.x - box.x0) / (box.x1 - box.x0) : (c.y - box.y0) / (box.y1 - box.y0);
  return {side: s, at: Math.max(0, Math.min(1, at))};
}

/* ---------- fire, ventilation devices (spec entries, placed by the engine) ---------- */
function devices(ctx) {
  const {rooms, doors, spec, rules, conv, plot, cond} = ctx;
  const items = [], notes = [];
  const has = (room, kinds) => spec.some(f => f.room === room.name && kinds.includes(f.kind)) || items.some(f => f.room === room.name && kinds.includes(f.kind));
  const hasAny = kinds => spec.some(f => kinds.includes(f.kind)) || items.some(f => kinds.includes(f.kind));
  const add = (o, why) => { items.push(Object.assign({auto: true}, o)); if (why) notes.push(why); };
  const doorsOf = r => doors.filter(d => d.a === r || d.b === r);
  const isOpenKitchen = r => doorsOf(r).some(d => d.style === "opening" && [d.a, d.b].some(o => o && o !== r && ["living", "dining", "hall"].includes(o.type)));
  // the front door: a door straight to the outside (not into a terrace or other outdoor room), widest first
  const street = d => d.toOutside && d.style !== "garage" && (!d.a || !d.b);
  const entrance = doors.filter(street).sort((a, b) => b.w - a.w)[0] || doors.filter(d => d.toOutside && d.style !== "garage").sort((a, b) => b.w - a.w)[0];
  const entranceRoom = entrance ? [entrance.a, entrance.b].find(r => r && r.type !== "outdoor") || null : null;

  // F-02 detectors by room type; F-03 / F-04 kitchens
  const det = rules.detectors || {};
  for (const r of rooms) {
    const kinds = det[r.type]; if (!kinds || has(r, kinds)) continue;
    let pos;
    // the living room an open kitchen opens into: keep its smoke detector >= min_dist from the kitchen
    const openK = rooms.find(k => k.type === "kitchen" && isOpenKitchen(k) && doorsOf(k).some(d => d.a === r || d.b === r));
    if (openK && rules.openKitchen) {
      let best = null;
      for (const fx of [0.15, 0.3, 0.5, 0.7, 0.85]) for (const fy of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const c = {x: r.clear.x0 + (r.clear.x1 - r.clear.x0) * fx, y: r.clear.y0 + (r.clear.y1 - r.clear.y0) * fy};
        const k = openK.box, dd = Math.hypot(Math.max(k.x0 - c.x, 0, c.x - k.x1), Math.max(k.y0 - c.y, 0, c.y - k.y1));
        if (!best || dd > best.d) best = {d: dd, pos: [fx, fy]};
      }
      pos = best.pos;
      if (best.d < rules.openKitchen.min_dist) notes.push(`Smoke detector in ${r.name}: the room has no point ${rules.openKitchen.min_dist} m from the open kitchen`);
    }
    add(Object.assign({kind: kinds[0], room: r.name}, pos ? {pos} : {}));
  }
  for (const r of rooms.filter(r => r.type === "kitchen")) if (!has(r, ["heat"])) add({kind: "heat", room: r.name});

  if (hasAny(["smoke", "smoke_sounder", "heat"])) {
    // F-05 panel near the front door; F-06 outdoor AV device on the road façade
    if (!hasAny(["facp"]) && entranceRoom) {
      const sa = sideAndAt(entranceRoom.box, entrance.c);
      add({kind: "facp", room: entranceRoom.name, side: sa.side, at: Math.min(0.95, sa.at + 0.2)});
    }
    if (!hasAny(["av_outdoor"])) {
      const roadSide = plot && plot.road && plot.road[0];
      const onSide = (r, s) => r.ext[s] > 0.5;
      let room = null, side = roadSide;
      if (roadSide) room = (entranceRoom && onSide(entranceRoom, roadSide)) ? entranceRoom : rooms.find(r => r.type !== "outdoor" && onSide(r, roadSide));
      if (!room && entranceRoom) { room = entranceRoom; side = sideAndAt(entranceRoom.box, entrance.c).side; notes.push("Outdoor AV device put on the entrance façade: the plan gives no road side"); }
      if (room) add({kind: "av_outdoor", room: room.name, side, at: 0.85});
    }
  }

  // F-14 extinguisher in each kitchen, by the door
  for (const r of rooms.filter(r => r.type === "kitchen")) {
    if (has(r, ["extinguisher"])) continue;
    const d = doorsOf(r).sort((a, b) => b.w - a.w)[0];
    const sa = d ? sideAndAt(r.box, d.c) : {side: "S", at: 0.2};
    add({kind: "extinguisher", room: r.name, side: sa.side, at: sa.at > 0.5 ? sa.at - 0.2 : sa.at + 0.2});
  }

  // V-02 / V-03 local exhaust: bathrooms and WCs a fan, kitchens a hood over the range (or a fan)
  const ex = rules.exhaust;
  if (ex) for (const r of rooms) {
    if (r.type === "bathroom" && !has(r, ["exhaust"])) add({kind: "exhaust", room: r.name, lps: ex.bathroom, mode: "demand"});
    if (r.type === "kitchen" && !has(r, ["exhaust", "hood"])) {
      r.ceil = r.r.ceil;
      const range = spec.find(f => f.room === r.name && f.kind === "range");
      if (range) add({kind: "hood", room: r.name, side: range.side || "N", at: range.at !== undefined ? range.at : 0.5, lps: ex.kitchen_hood, mode: "demand"});
      else { const vol = r.area * (r.ceil || 2.7); add({kind: "exhaust", room: r.name, lps: ceil5(Math.min(ex.kitchen_fan, ex.kitchen_ach * vol * 1000 / 3600)), mode: "demand"}); }
    }
  }

  // V-01 fresh-air unit sized by ASHRAE 62.2 Eq. 4-1b
  const fa = rules.freshAir;
  if (fa && !hasAny(["fresh_air"])) {
    const nbr = Math.max(1, rooms.filter(r => r.type === "bedroom").length), q = ceil5(fa.a * cond + fa.b * (nbr + 1));
    const order = (conv.fresh_air_room_order || ["mech"]).flatMap(t => rooms.filter(r => r.type === t)), room = order[0];
    if (room) add({kind: "fresh_air", room: room.name, side: "N", lps: q, mode: "continuous", alt_rooms: order.slice(1).map(r => r.name)}, `Fresh-air unit ${q} L/s (ASHRAE 62.2 Eq. 4-1b)`);
    else notes.push("No mech, laundry, garage or store room for the fresh-air unit: add one");
  }
  return {items, notes};
}

/* ---------- electrical layer (after placement) ---------- */
function electrical(ctx) {
  const {G, rooms, doors, fixtures, rules, conv, uid} = ctx;
  const {P, add, sub, mul, dist} = G;
  const out = [], notes = [], circuits = [];
  const H = rules.heights, worktop = conv.worktop_h || 0.9;
  const def = k => G.FIX[k];

  // a point on a room's inside wall face: side s, lateral t (m from the side's start), facing into the room
  const ROT = {N: 0, S: 180, W: 270, E: 90}, IN = {N: P(0, 1), S: P(0, -1), W: P(1, 0), E: P(-1, 0)};
  const onWall = (r, s, t, off) => {
    const b = r.clear, base = s === "N" ? P(b.x0 + t, b.y0) : s === "S" ? P(b.x0 + t, b.y1) : s === "W" ? P(b.x0, b.y0 + t) : P(b.x1, b.y0 + t);
    return {c: add(base, mul(IN[s], off === undefined ? 0.04 : off)), rot: ROT[s]};
  };
  const sideLen = (r, s) => s === "N" || s === "S" ? r.clear.x1 - r.clear.x0 : r.clear.y1 - r.clear.y0;
  const lat = (r, s, p) => s === "N" || s === "S" ? p.x - r.clear.x0 : p.y - r.clear.y0;
  // lateral intervals on a side that must stay free: door openings (+0.15), tall or wet fixtures against that wall
  const TALL = ["fridge", "wh", "ahu", "fresh_air", "water_tank", "shower", "tub", "range", "sink", "washer", "dryer", "dw", "pump", "facp", "panel"];
  const doorBlocked = (r, s) => {
    const iv = [];
    for (const d of doors) {
      if (d.a !== r && d.b !== r) continue;
      const sa = sideAndAt(r.box, d.c); if (sa.side !== s) continue;
      const t0 = lat(r, s, d.p0), t1 = lat(r, s, d.p1); iv.push([Math.min(t0, t1) - 0.15, Math.max(t0, t1) + 0.15]);
    }
    return iv;
  };
  const blocked = (r, s) => {
    const iv = [];
    for (const d of doors) {
      if (d.a !== r && d.b !== r) continue;
      const sa = sideAndAt(r.box, d.c); if (sa.side !== s) continue;
      const t0 = lat(r, s, d.p0), t1 = lat(r, s, d.p1); iv.push([Math.min(t0, t1) - 0.15, Math.max(t0, t1) + 0.15]);
    }
    for (const f of fixtures) {
      if (f.room !== r || !TALL.includes(f.kind)) continue;
      const sa = sideAndAt(r.clear, f.c); if (sa.side !== s) continue;
      const w = def(f.kind).w, t = lat(r, s, f.c); iv.push([t - w / 2 - 0.1, t + w / 2 + 0.1]);
    }
    return iv;
  };
  const free = (r, s, t, extra) => t > 0.25 && t < sideLen(r, s) - 0.25 && !blocked(r, s).concat(extra || []).some(([a, b]) => t > a && t < b);
  const push = (o) => { const f = Object.assign({id: uid("f"), auto: true}, o); out.push(f); return f; };

  // general sockets: n per room type, spread along the free wall length
  const perRoom = conv.sockets_per_room || {};
  const general = [];
  for (const r of rooms) {
    if (r.type === "outdoor") continue;
    let n = perRoom[r.type] !== undefined ? perRoom[r.type] : perRoom.other || 0;
    if (r.type === "hall" && Math.max(r.cw, r.cd) < (conv.hall_min_length || 0)) n = 0;
    if (!n) continue;
    const slots = [];
    for (const s of SIDES) { const L = sideLen(r, s); for (let t = 0.3; t <= L - 0.3; t += 0.1) if (free(r, s, t)) slots.push({s, t}); }
    if (!slots.length) { notes.push(`No free wall for sockets in ${r.name}`); continue; }
    const placed = [];
    for (let k = 0; k < n; k++) {
      const sl = slots[Math.min(slots.length - 1, Math.floor((k + 0.5) * slots.length / n))];
      const w = onWall(r, sl.s, sl.t);
      placed.push(push({kind: "socket", x: w.c.x, y: w.c.y, rot: w.rot, h_mount: H.socket_h, room_id: r.id}));
    }
    general.push({room: r, items: placed});
  }

  // kitchen: counter sockets every spacing, 300 mm clear of the sink, never over the hob; fridge and dishwasher sockets
  const kitchenItems = [];
  for (const r of rooms.filter(r => r.type === "kitchen")) {
    const sinks = fixtures.filter(f => f.room === r && f.kind === "sink"), ranges = fixtures.filter(f => f.room === r && f.kind === "range");
    let runs = G.counterRects(r.r).map(c => ({s: c.side, t0: lat(r, c.side, P(c.x0, c.y0)), t1: lat(r, c.side, P(c.x1, c.y1))}));
    if (!runs.length) runs = fixtures.filter(f => f.room === r && ["sink", "range", "dw"].includes(f.kind)).map(f => {
      const s = sideAndAt(r.clear, f.c).side, t = lat(r, s, f.c); return {s, t0: t - 0.9, t1: t + 0.9};
    });
    for (const run of runs) {
      const L = sideLen(r, run.s);
      for (let t = Math.max(0.3, run.t0 + 0.3); t <= Math.min(L - 0.3, run.t1 - 0.3) + 1e-9; t += conv.kitchen_socket_spacing || 1.2) {
        let tt = t, ok = false;
        for (const dt of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45]) {
          tt = t + dt; const w = onWall(r, run.s, tt), pt = w.c;
          const nearSink = sinks.some(f => boxDist(pt, cornersBox(f)) < rules.sink_clear);
          const overHob = ranges.some(f => sideAndAt(r.clear, f.c).side === run.s && Math.abs(lat(r, run.s, f.c) - tt) < def("range").w / 2 + 0.05);
          const inDoor = doorBlocked(r, run.s).some(([a, b]) => tt > a && tt < b);
          if (!nearSink && !overHob && !inDoor && tt > 0.2 && tt < L - 0.2) { ok = true; break; }
        }
        if (!ok) continue;
        const w = onWall(r, run.s, tt);
        kitchenItems.push(push({kind: "socket", x: w.c.x, y: w.c.y, rot: w.rot, h_mount: worktop + H.worktop_offset, worktop: true, room_id: r.id}));
      }
    }
    for (const f of fixtures.filter(f => f.room === r && (f.kind === "fridge" || f.kind === "dw"))) {
      const s = sideAndAt(r.clear, f.c).side, w = onWall(r, s, lat(r, s, f.c));
      kitchenItems.push(push({kind: "socket", x: w.c.x, y: w.c.y, rot: w.rot, h_mount: H.socket_h, serves: f.id, room_id: r.id}));
    }
  }

  // bathrooms: a shaver outlet beside each basin (BS EN 61558), never a 13 A socket
  const shavers = [];
  for (const f of fixtures.filter(f => f.kind === "basin" && f.room && f.room.type === "bathroom")) {
    const r = f.room, s = sideAndAt(r.clear, f.c).side, t = lat(r, s, f.c);
    for (const dt of [0.45, -0.45, 0.6, -0.6]) if (t + dt > 0.15 && t + dt < sideLen(r, s) - 0.15) {
      const w = onWall(r, s, t + dt); shavers.push(push({kind: "shaver", x: w.c.x, y: w.c.y, rot: w.rot, h_mount: H.switch_h, serves: f.id, room_id: r.id})); break;
    }
  }

  // switches beside an appliance: back to its wall, then sideways past its edge
  const beside = (f, gap, extra) => {
    const d = def(f.kind), a = f.rot * Math.PI / 180, u = P(Math.cos(a), Math.sin(a)), fr = P(-Math.sin(a), Math.cos(a));
    const wallPt = sub(f.c, mul(fr, d.h / 2 + (d.outdoor ? 0.25 : 0.01)));
    for (const sgn of [1, -1]) for (const ex of [0, 0.15, 0.3]) {
      const c = add(add(wallPt, mul(u, sgn * (d.w / 2 + gap + ex))), mul(fr, 0.04));
      if (!out.concat(fixtures).some(o => o !== f && o.c && dist(o.c, c) < 0.12)) return {c, rot: f.rot};
    }
    return {c: add(add(wallPt, mul(u, d.w / 2 + gap)), mul(fr, 0.04)), rot: f.rot};
  };
  const dedicated = [];
  for (const f of fixtures) {
    if (f.kind === "range") { const p = beside(f, 0.3); dedicated.push({f, load: "cooker", sw: push({kind: "cooker_switch", x: p.c.x, y: p.c.y, rot: p.rot, h_mount: H.switch_h, serves: f.id})}); }
    if (["washer", "ahu", "acu", "fresh_air", "pump"].includes(f.kind)) {
      const p = beside(f, 0.15);
      dedicated.push({f, load: {washer: "washer", ahu: "ahu", acu: "ac", fresh_air: "fresh_air", pump: "pump"}[f.kind],
        sw: push({kind: "switch_dp", x: p.c.x, y: p.c.y, rot: p.rot, h_mount: H.switch_h, serves: f.id, outdoor: f.kind === "acu" || undefined})});
    }
    if (f.kind === "wh") {
      let p;
      if (f.room && f.room.type === "bathroom") {
        // water heater in a bathroom: switch immediately outside the room, beside its door
        const d = doors.find(d => d.a === f.room || d.b === f.room), other = d && (d.a === f.room ? d.b : d.a);
        if (d && other) { const s = sideAndAt(other.box, d.c).side, t = lat(other, s, d.p1) + 0.25; const w = onWall(other, s, t); p = {c: w.c, rot: w.rot}; }
        else notes.push(`Water heater in ${f.room.name}: no door to put its switch outside the room`);
      }
      p = p || beside(f, 0.15);
      dedicated.push({f, load: "water_heater", sw: push({kind: "switch_dp", x: p.c.x, y: p.c.y, rot: p.rot, h_mount: H.switch_h, serves: f.id})});
    }
  }

  // outdoor rooms: an IP55 socket on the building wall facing them
  const outdoor = [];
  for (const r of rooms.filter(r => r.type === "outdoor")) {
    if (!(perRoom.outdoor > 0)) break;
    const b = r.box, cands = [
      {s: "N", y: b.y0, n: P(0, 1)}, {s: "S", y: b.y1, n: P(0, -1)}, {s: "W", x: b.x0, n: P(1, 0)}, {s: "E", x: b.x1, n: P(-1, 0)}];
    for (const cd of cands) {
      const mid = cd.y !== undefined ? P((b.x0 + b.x1) / 2 + 0.6, cd.y) : P(cd.x, (b.y0 + b.y1) / 2 + 0.6);
      const inner = rooms.find(o => o.type !== "outdoor" && G.pointInPoly(sub(mid, mul(cd.n, 0.2)), o.r.pts));
      if (!inner) continue;
      const c = add(mid, mul(cd.n, inner.t[{N: "S", S: "N", W: "E", E: "W"}[cd.s]] / 2 + 0.04));
      outdoor.push(push({kind: "socket_ip55", x: c.x, y: c.y, rot: ROT[cd.s], h_mount: H.socket_h, room_id: r.id})); break;
    }
  }

  /* circuit schedule: sockets on radials of at most radial_max points (a twin socket counts twice);
     every appliance on its own circuit; RCD ratings from Table K.46 */
  const C = rules.circuits, rcd = rules.rcd, tw = C.twin_points;
  let cn = 0; const cid = () => "C" + String(++cn).padStart(2, "0");
  const linked = (ra, rb) => doors.some(d => (d.a && d.a.id === ra && d.b && d.b.id === rb) || (d.b && d.b.id === ra && d.a && d.a.id === rb));
  // socket circuits: radial (5 points, 20 A) or ring (10 points, 30 A), per the pack generator setting; kitchens stay radial
  const radials = (items, load, label, allowRing) => {
    const ring = allowRing && conv.socket_circuit === "ring";
    let cur = null, lastRoom = null;
    for (const it of items) {
      const pts = it.kind === "socket" || it.kind === "socket_ip55" ? tw : 1;
      const jump = cur && lastRoom && it.room_id !== lastRoom && !linked(lastRoom, it.room_id);
      lastRoom = it.room_id;
      if (!cur || jump || cur.points + pts > (ring ? C.ring_max : C.radial_max)) { cur = {id: cid(), label: `${label}`, kind: ring ? "ring" : "radial", breaker: ring ? C.ring_breaker : C.radial_breaker, cable_mm2: null, rcd_ma: rcd[load], load, points: 0, items: [], rooms: []}; circuits.push(cur); }
      cur.points += pts; cur.items.push(it.id); it.circuit = cur.id;
      const rn = (rooms.find(r => r.id === it.room_id) || {}).name; if (rn && !cur.rooms.includes(rn)) cur.rooms.push(rn);
    }
  };
  radials(general.flatMap(g => g.items), "sockets", "Sockets", true);
  radials(kitchenItems, "kitchen_sockets", "Kitchen sockets");
  radials(outdoor, "outdoor_sockets", "Outdoor sockets");
  for (const d of dedicated) {
    const ac = d.load === "ac" || d.load === "ahu";
    const where = d.f.room ? d.f.room.name : (d.f.kind === "acu" ? "outside, " + sideAndAt(ctx.footprint || {x0: 0, y0: 0, x1: 1, y1: 1}, d.f.c).side + " façade" : "outside");
    const c = {id: cid(), label: `${def(d.f.kind).label} (${where})`, kind: "dedicated",
      breaker: ac ? rules.ac.min_breaker : null, cable_mm2: ac ? rules.ac.min_cable : null, rcd_ma: rcd[d.load], load: d.load, points: 1, items: [d.f.id, d.sw.id], rooms: d.f.room ? [d.f.room.name] : []};
    if (!ac) c.note = "breaker and cable sized to the appliance load";
    else c.note = "minimum per DBC K.9.1.13.7; size to the unit's load";
    circuits.push(c); d.sw.circuit = c.id; (d.f.f || d.f).circuit = c.id;
  }
  if (shavers.length) { const c = {id: cid(), label: "Shaver outlets (lighting circuit)", kind: "lighting", breaker: 16, cable_mm2: null, rcd_ma: rcd.lighting, load: "lighting", points: shavers.length, items: shavers.map(s => s.id), rooms: [...new Set(shavers.map(s => (rooms.find(r => r.id === s.room_id) || {}).name))]};
    circuits.push(c); shavers.forEach(s => s.circuit = c.id); }
  for (const f of out) delete f.room_id;
  return {fixtures: out, circuits, notes};
}

/* small geometry helpers (fixtures are codecheck model fixtures: c, rot, corners, def) */
const cornersBox = f => ({x0: Math.min(...f.corners.map(p => p.x)), y0: Math.min(...f.corners.map(p => p.y)), x1: Math.max(...f.corners.map(p => p.x)), y1: Math.max(...f.corners.map(p => p.y))});
const boxDist = (c, b) => Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1));

module.exports = {devices, electrical, sideAndAt};
