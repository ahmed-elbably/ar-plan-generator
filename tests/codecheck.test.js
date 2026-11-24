// Run with:  node --test tests/*.test.js   (Node 18+; plain `node --test` also finds it)
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), os = require("os"), {execFileSync} = require("child_process");

const ROOT = path.join(__dirname, "..");
const ENGINE = path.join(ROOT, "plugins", "ar-plan-generator", "scripts", "arplan.js");
const RULES = path.join(ROOT, "plugins", "ar-plan-generator", "rules");
const cc = require(path.join(ROOT, "plugins", "ar-plan-generator", "scripts", "codecheck.js"));

function codecheck(planFile) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-cc-"));
  execFileSync(process.execPath, [ENGINE, "codecheck", planFile, "--pack", "dubai", "--out", out, "--name", "t"]);
  return JSON.parse(fs.readFileSync(path.join(out, "t.codecheck.json"), "utf8"));
}
// build a spec, then check it. packOnBuild=false keeps the plan as written (planted violations survive);
// packOnBuild=true lets the engine apply the pack's placement rules (clearances, floor drains) while building.
function buildAndCheck(spec, packOnBuild) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-b-")), f = path.join(dir, "s.spec.json");
  fs.writeFileSync(f, JSON.stringify(spec));
  const args = [ENGINE, "build", f, "--out", dir, "--name", "t"].concat(packOnBuild ? ["--pack", "dubai"] : []);
  const summary = JSON.parse(execFileSync(process.execPath, args, {encoding: "utf8"}));
  const rep = packOnBuild ? JSON.parse(fs.readFileSync(path.join(dir, "t.codecheck.json"), "utf8")) : codecheck(path.join(dir, "t.plan.json"));
  return Object.assign(rep, {summary});
}
const byId = rep => Object.fromEntries(rep.results.map(r => [r.id, r]));

test("rule pack loads: unique ids, known measures, every id in the rule list", () => {
  const {rules} = cc.loadPack("dubai", RULES);
  const known = new Set([...Object.keys(cc.MEASURES), "needs_data", "reviewer", "out_of_scope"]);
  const list = fs.readFileSync(path.join(ROOT, "docs", "code-check-rule-list.md"), "utf8");
  for (const r of rules) {
    assert.ok(known.has(r.measure), `${r.id}: unknown measure ${r.measure}`);
    assert.ok(r.clause && r.requirement && r.title, `${r.id}: clause, title and requirement are required`);
    assert.ok(list.includes(`| ${r.id} |`), `${r.id} is missing from docs/code-check-rule-list.md`);
  }
  assert.equal(rules.length, 64);
});

test("example UAE villa (v0.5 spec, built with --pack dubai): no fails, known gaps", () => {
  const R = byId(codecheck(path.join(ROOT, "examples", "uae-villa-4br", "uae-villa-4br.plan.json")));
  const fails = Object.values(R).filter(r => r.status === "FAIL" || r.status === "ADVISE").map(r => r.id);
  assert.deepEqual(fails, []);
  assert.equal(R["K-06"].items.length, 26);                          // every leaf door checked
  assert.equal(R["P-01"].items.length, 8);                           // 8 wet rooms, each with a floor drain
  assert.equal(R["K-23"].items.length, 13);                          // 6 WCs + 7 basins
  // the spec gives design data; the engine generated detectors, panel, AV, extinguisher, hood, fans, fresh air and the electrical layer
  for (const id of ["K-01", "K-02", "K-03", "K-04", "K-05", "K-06", "K-07", "K-08", "K-09", "K-12", "K-13", "K-14", "K-15", "K-20", "K-21", "K-22", "K-23", "P-01",
                    "F-01", "F-02", "F-03", "F-05", "F-06", "F-07", "F-08", "F-09", "F-09b", "F-10", "F-13", "F-14", "E-01",
                    "E-03", "E-04", "E-05", "E-06", "E-07", "E-08", "E-09", "E-10", "V-01", "V-02", "V-03", "V-05"]) assert.equal(R[id].status, "PASS", id);
  const nc = Object.values(R).filter(r => r.status === "NOT CHECKABLE").map(r => r.id).sort();
  assert.deepEqual(nc, ["E-02", "F-12", "K-16", "K-17", "K-24", "P-02", "P-03", "V-06", "V-07"]);   // DB height and tank are design choices; the rest reviewer / multi-building
  assert.equal(R["F-15"].status, "N/A");
});

test("example spec built without a pack: v0.4 behaviour (no drains added, no code check)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-np-"));
  const out = JSON.parse(execFileSync(process.execPath, [ENGINE, "build", path.join(ROOT, "examples", "uae-villa-4br", "uae-villa-4br.spec.json"), "--out", dir, "--name", "t"], {encoding: "utf8"}));
  assert.equal(out.codecheck, undefined);
  assert.ok(!out.builder_notes.some(n => /Floor drain added/.test(n)));
  const plan = JSON.parse(fs.readFileSync(path.join(dir, "t.plan.json"), "utf8"));
  assert.equal(plan.fixtures.filter(f => f.kind === "fd").length, 0);
});

/* traps: values exactly at a limit must pass (clear sizes measured inside wall faces) */
test("traps at the limit pass; just below fails", () => {
  const M = {rooms: [], doors: []};
  const room = (name, type, cw, cd) => ({id: name, name, type, staff: /maid/i.test(name), cw, cd, area: cw * cd, minDim: Math.min(cw, cd)});
  M.rooms = [room("Bed at limit", "bedroom", 3.0, 3.5), room("Bed short", "bedroom", 2.99, 3.6),
             room("Maid at limit", "bedroom", 2.1, 2.62), room("Hall at limit", "hall", 1.0, 6), room("Hall narrow", "hall", 0.99, 6)];
  const k01 = cc.MEASURES.room_min_area_dim(M, {types: ["bedroom"], staff: false, min_area: 10.5, min_dim: 3.0});
  assert.deepEqual(k01.items.map(i => i.ok), [true, false]);
  const k02 = cc.MEASURES.room_min_area_dim(M, {types: ["bedroom"], staff: true, min_area: 5.5, min_dim: 2.1});
  assert.deepEqual(k02.items.map(i => i.ok), [true]);
  const k13 = cc.MEASURES.corridor_min_width(M, {min_width: 1.0});
  assert.deepEqual(k13.items.map(i => i.ok), [true, false]);
  const bath = {type: "bathroom", name: "Bath"}, bed = {type: "bedroom", name: "Bed"};
  M.doors = [{id: "d1", style: "swing", w: 0.915, a: bed, b: null, into: bed}, {id: "d2", style: "swing", w: 0.91, a: bed, b: null, into: bed},
             {id: "d3", style: "swing", w: 0.71, a: bath, b: bed, into: bath}, {id: "d4", style: "garage", w: 0.5, a: bed, b: null}];
  const k06 = cc.MEASURES.door_min_width(M, {general: 0.915, bathroom: 0.71, styles: ["swing", "sliding", "opening"]});
  assert.deepEqual(k06.items.map(i => i.ok), [true, false, true]);   // vehicle door not checked
});

/* planted violations in a small built villa */
const PLANTED = {
    project: "Planted", rooms: [
      {name: "Hall", type: "hall", x: 0, y: 0, w: 0.95, d: 8},
      {name: "Bedroom", type: "bedroom", x: 0.95, y: 0, w: 3.0, d: 3.4},
      {name: "Maid room", type: "bedroom", x: 0.95, y: 3.4, w: 2.0, d: 2.6},
      {name: "Kitchen", type: "kitchen", x: 0.95, y: 6, w: 3.0, d: 2},
      {name: "Bath", type: "bathroom", x: 3.95, y: 0, w: 2, d: 2.5}],
    doors: [{from: "OUTSIDE", to: "Hall", w: 1.0, side: "W"}, {from: "Hall", to: "Bedroom", w: 0.85},
            {from: "Hall", to: "Maid room", w: 0.9}, {from: "Hall", to: "Kitchen", w: 0.95}, {from: "Bedroom", to: "Bath", w: 0.7}],
    windows: [{room: "Bedroom", side: "N", w: 1.2}, {room: "Maid room", side: "S", w: 0.8}, {room: "Kitchen", side: "S", w: 1}],
    fixtures: [{kind: "wc", room: "Bath", side: "N"}, {kind: "basin", room: "Bath", side: "E"}, {kind: "shower", room: "Bath", side: "S"},
               {kind: "sink", room: "Kitchen", side: "N"}, {kind: "panel", room: "Kitchen", side: "E"}, {kind: "wh", room: "Kitchen", side: "W"}]
};

test("planted violations are caught", () => {
  const R = byId(buildAndCheck(PLANTED, false));
  const failed = id => R[id].items.filter(i => !i.ok).map(i => i.label);
  assert.equal(R["K-13"].status, "FAIL");                                         // 0.95 m hall (minus walls)
  assert.ok(failed("K-01").includes("Bedroom"));                                  // clear area below 10.5 m2
  assert.ok(failed("K-02").includes("Maid room"));                                // clear width below 2.1 m
  assert.ok(failed("K-06").some(l => /Bedroom$/.test(l)));                        // 0.85 m door
  assert.ok(failed("K-06").some(l => /Bath$/.test(l)));                           // 0.70 m bathroom door
  assert.ok(failed("E-01").some(l => /Kitchen/.test(l)));                         // DB in the kitchen
  assert.deepEqual(failed("P-01").sort(), ["Bath", "Kitchen"]);                   // no floor drains
});

test("build --pack dubai repairs placement but never overrides the spec", () => {
  const rep = buildAndCheck(PLANTED, true), R = byId(rep), notes = rep.summary.builder_notes;
  assert.equal(R["P-01"].status, "PASS");                                         // drains added by the engine...
  assert.ok(notes.includes("Floor drain added in Bath (P-01 K.10.3.2.3)"));       // ...and reported
  assert.equal(R["K-06"].status, "FAIL");                                         // explicit door widths are kept
  assert.equal(R["E-01"].status, "FAIL");                                         // DB room is the spec's choice
  // WC / basin clearances: either met, or the engine reports that the room cannot meet them
  // (the note may name the blocking fixture, e.g. a shower that had no legal spot, rather than the WC / basin)
  for (const id of ["K-22", "K-23"]) for (const i of R[id].items.filter(x => !x.ok)) {
    const room = i.label.split(" in ")[1];
    assert.ok(notes.some(n => n.includes(` in ${room}: no position keeps`) || n.includes(` in ${room} could not clear`)), `${id} ${i.label} failed silently`);
  }
});

/* ---------- v0.5 design data: full villa, round trip, planted violations ---------- */
const FULL = path.join(ROOT, "tests", "fixtures", "dubai-villa-full.spec.json");
const fullSpec = () => JSON.parse(fs.readFileSync(FULL, "utf8"));

test("full-data villa: every checkable rule passes; only phase 4/5 and multi-building gaps remain", () => {
  const rep = buildAndCheck(fullSpec(), true), R = byId(rep);
  assert.equal(rep.summary.clashes, 0);
  assert.deepEqual(Object.values(R).filter(r => r.status === "FAIL" || r.status === "ADVISE").map(r => r.id), []);
  const nc = Object.values(R).filter(r => r.status === "NOT CHECKABLE").map(r => r.id).sort();
  assert.deepEqual(nc, ["F-12", "K-16", "K-17", "K-24", "P-02", "V-06", "V-07"]);                 // reviewer (phase 5) and multi-building only
  for (const id of ["K-04", "K-05", "K-07", "K-08", "K-09", "K-14", "K-15", "F-01", "F-02", "F-03", "F-05", "F-06", "F-07", "F-09b", "F-10", "F-14", "P-03", "E-02",
                    "E-03", "E-04", "E-05", "E-06", "E-07", "E-08", "E-09", "E-10", "V-01", "V-02", "V-03", "V-05"])
    assert.equal(R[id].status, "PASS", id);
});

test("plan -> spec -> plan keeps every v0.5 field (same rule statuses)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-rt-"));
  execFileSync(process.execPath, [ENGINE, "build", FULL, "--out", dir, "--name", "a", "--pack", "dubai"]);
  const spec = execFileSync(process.execPath, [ENGINE, "to-spec", path.join(dir, "a.plan.json")], {encoding: "utf8"});
  const s = JSON.parse(spec);
  assert.equal(s.plot.road[0], "N"); assert.equal(s.hassantuk, true); assert.equal(s.glass, 0.75);
  assert.ok(s.rooms.find(r => r.name === "Kitchen").counters.length === 2);
  assert.ok(s.windows.every(w => w.sill !== undefined && w.op));
  assert.ok(s.fixtures.some(f => f.kind === "fresh_air" && f.lps === 75 && f.mode === "continuous"));
  const a = byId(JSON.parse(fs.readFileSync(path.join(dir, "a.codecheck.json"), "utf8")));
  const b = byId(buildAndCheck(s, true));
  for (const id of Object.keys(a)) assert.equal(b[id].status, a[id].status, id);
});

test("planted v0.5 violations are caught, one rule each", () => {
  const plant = (fn) => { const s = fullSpec(); fn(s); return byId(buildAndCheck(s, true)); };
  const room = (s, n) => s.rooms.find(r => r.name === n);
  const fx = (s, k, rm) => s.fixtures.find(f => f.kind === k && (!rm || f.room === rm));
  const cases = {
    "K-04": s => room(s, "Kitchen").counters.push({side: "S", from: 0, to: 0.5, depth: 3.6}),   // 1.1 m between counters
    "K-05": s => { room(s, "Bedroom 3").ceiling_h = 2.6; },
    "K-07": s => { s.windows.find(w => w.room === "Bedroom 3").w = 1.0; },
    "K-09": s => { s.windows.find(w => w.room === "Bedroom 2").sill = 0.8; },
    "K-14": s => { s.building_h = 17; },
    "K-15": s => { s.plot.y = -2; s.plot.d = 22; },                                               // road setback 1.875 m
    "F-02": s => { s.generate = {devices: false}; s.fixtures.splice(s.fixtures.indexOf(fx(s, "smoke_sounder", "Bedroom 2")), 1); },   // generator off, else it fills the gap
    "F-07": s => { s.hassantuk = false; },
    "F-15": s => { s.gas = "lpg"; },                                                              // LPG declared, no cylinders
    "P-03": s => { Object.assign(fx(s, "water_tank"), {room: "Garage", side: "W"}); },
    "E-02": s => { fx(s, "panel").top_h = 2.1; },
    "V-01": s => { fx(s, "fresh_air").lps = 40; },
    "V-03": s => { fx(s, "exhaust", "Bath 2").lps = 15; }
  };
  for (const [id, fn] of Object.entries(cases)) {
    const R = plant(fn);
    assert.equal(R[id].status, "FAIL", `${id} not caught`);
    const others = Object.values(R).filter(r => r.status === "FAIL" && r.id !== id).map(r => r.id);
    assert.deepEqual(others, [], `${id} also tripped ${others}`);
  }
});

/* ---------- phase 4: generators ---------- */
test("generators keep what the spec placed and never duplicate it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-gen-"));
  execFileSync(process.execPath, [ENGINE, "build", FULL, "--out", dir, "--name", "g", "--pack", "dubai"]);
  const plan = JSON.parse(fs.readFileSync(path.join(dir, "g.plan.json"), "utf8"));
  const inRoom = (name, kind) => { const r = plan.rooms.find(x => x.name === name), xs = r.pts.map(p => p.x), ys = r.pts.map(p => p.y);
    return plan.fixtures.filter(f => f.kind === kind && f.x >= Math.min(...xs) && f.x <= Math.max(...xs) && f.y >= Math.min(...ys) && f.y <= Math.max(...ys)); };
  assert.equal(inRoom("Majlis", "smoke").length, 1);                     // hand-placed, not doubled
  assert.equal(plan.fixtures.filter(f => f.kind === "fresh_air").length, 1);
  assert.ok(plan.fixtures.filter(f => f.kind === "smoke").every(f => !f.auto));   // full spec placed all detectors itself
  assert.ok(plan.fixtures.filter(f => f.kind === "socket").every(f => f.auto && f.circuit));
  const spec = JSON.parse(execFileSync(process.execPath, [ENGINE, "to-spec", path.join(dir, "g.plan.json")], {encoding: "utf8"}));
  assert.equal(spec.fixtures.filter(f => f.kind === "socket").length, 0);        // generated items are not written back
});

test("planted electrical violations are caught, one rule each", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-el-"));
  execFileSync(process.execPath, [ENGINE, "build", FULL, "--out", dir, "--name", "e", "--pack", "dubai"]);
  const base = fs.readFileSync(path.join(dir, "e.plan.json"), "utf8");
  const plant = fn => { const p = JSON.parse(base); fn(p); const f = path.join(dir, "m.plan.json"); fs.writeFileSync(f, JSON.stringify(p)); return byId(codecheck(f)); };
  const room = (p, n) => { const r = p.rooms.find(x => x.name === n), xs = r.pts.map(q => q.x), ys = r.pts.map(q => q.y); return {x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)}; };
  const kind = (p, k) => p.fixtures.find(f => f.kind === k);
  const sockCircuit = p => p.circuits.find(c => c.load === "sockets");
  const cases = {
    "E-03": p => { const b = room(p, "Bath 2"); p.fixtures.push({id: "fx-bath", kind: "socket", x: (b.x0 + b.x1) / 2, y: b.y0 + 0.2, rot: 0, h_mount: 0.45}); },
    "E-04": p => { p.fixtures.find(f => f.kind === "socket" && !f.worktop).h_mount = 0.3; },
    "E-05": p => { const s = kind(p, "sink"), k = p.fixtures.find(f => f.worktop); k.x = s.x + 0.5; k.y = s.y - 0.3; },
    "E-06": p => { const c = sockCircuit(p), extra = p.fixtures.filter(f => f.kind === "socket" && !c.items.includes(f.id) && f.circuit && p.circuits.find(x => x.id === f.circuit).load === "sockets")[0]; c.items.push(extra.id); },
    "E-07": p => { p.fixtures = p.fixtures.filter(f => f.kind !== "cooker_switch"); },
    "E-08": p => { const wh = kind(p, "wh"), sw = p.fixtures.find(f => f.serves === wh.id); sw.x += 3; },
    "E-09": p => { const ac = kind(p, "ahu"); p.circuits.find(c => c.items.includes(ac.id)).breaker = 16; },
    "E-10": p => { sockCircuit(p).rcd_ma = 100; }
  };
  for (const [id, fn] of Object.entries(cases)) {
    const R = plant(fn);
    assert.equal(R[id].status, "FAIL", `${id} not caught`);
    const others = Object.values(R).filter(r => r.status === "FAIL" && r.id !== id).map(r => r.id);
    assert.deepEqual(others, [], `${id} also tripped ${others}`);
  }
});
