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
function buildAndCheck(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-b-")), f = path.join(dir, "s.spec.json");
  fs.writeFileSync(f, JSON.stringify(spec));
  execFileSync(process.execPath, [ENGINE, "build", f, "--out", dir, "--name", "t", "--pack", "dubai"]);
  return JSON.parse(fs.readFileSync(path.join(dir, "t.codecheck.json"), "utf8"));
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

test("example UAE villa: known fails, passes and gaps", () => {
  const R = byId(codecheck(path.join(ROOT, "examples", "uae-villa-4br", "uae-villa-4br.plan.json")));
  const fails = Object.values(R).filter(r => r.status === "FAIL").map(r => r.id).sort();
  assert.deepEqual(fails, ["K-06", "K-20", "K-22", "K-23", "P-01"]);
  assert.equal(R["K-06"].items.filter(i => !i.ok).length, 16);     // 0.8 / 0.9 m doors, 0.7 m maid bath door
  assert.equal(R["P-01"].items.filter(i => !i.ok).length, 8);      // no floor drains anywhere
  for (const id of ["K-01", "K-02", "K-03", "K-12", "K-13", "K-21", "F-08", "F-09", "F-13", "E-01"]) assert.equal(R[id].status, "PASS", id);
  for (const id of ["K-05", "K-07", "F-01", "E-03", "V-01"]) assert.equal(R[id].status, "NOT CHECKABLE", id);
  assert.equal(R["F-15"].status, "N/A");
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
test("planted violations are caught", () => {
  const spec = {
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
  const R = byId(buildAndCheck(spec));
  const failed = id => R[id].items.filter(i => !i.ok).map(i => i.label);
  assert.equal(R["K-13"].status, "FAIL");                                         // 0.95 m hall (minus walls)
  assert.ok(failed("K-01").includes("Bedroom"));                                  // clear area below 10.5 m2
  assert.ok(failed("K-02").includes("Maid room"));                                // clear width below 2.1 m
  assert.ok(failed("K-06").some(l => /Bedroom$/.test(l)));                        // 0.85 m door
  assert.ok(failed("K-06").some(l => /Bath$/.test(l)));                           // 0.70 m bathroom door
  assert.ok(failed("E-01").some(l => /Kitchen/.test(l)));                         // DB in the kitchen
  assert.deepEqual(failed("P-01").sort(), ["Bath", "Kitchen"]);                   // no floor drains
});
