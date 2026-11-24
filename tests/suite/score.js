#!/usr/bin/env node
/*
 * Scores the planted-violation suite:  node tests/suite/score.js [--json]
 * caught = planted rules that FAIL; missed = planted rules that do not; false alarm = any other FAIL;
 * traps must PASS. Exit code 1 unless every plant is caught, there are no false alarms and every trap passes.
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), {execFileSync} = require("child_process");
const {FIXTURES, TRAPS} = require("./cases");
const ROOT = path.join(__dirname, "..", "..");
const ENGINE = path.join(ROOT, "plugins", "ar-plan-generator", "scripts", "arplan.js");
const cc = require(path.join(ROOT, "plugins", "ar-plan-generator", "scripts", "codecheck.js"));

function runFixture(fx) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arplan-suite-"));
  const spec = fx.base(); if (fx.spec) fx.spec(spec);
  fs.writeFileSync(path.join(dir, "s.spec.json"), JSON.stringify(spec));
  execFileSync(process.execPath, [ENGINE, "build", path.join(dir, "s.spec.json"), "--out", dir, "--name", "p"].concat(fx.pack === false ? [] : ["--pack", "dubai"]));
  const planFile = path.join(dir, "p.plan.json");
  if (fx.plan) { const p = JSON.parse(fs.readFileSync(planFile, "utf8")); fx.plan(p); fs.writeFileSync(planFile, JSON.stringify(p)); }
  execFileSync(process.execPath, [ENGINE, "codecheck", planFile, "--pack", "dubai", "--out", dir, "--name", "c"]);
  return JSON.parse(fs.readFileSync(path.join(dir, "c.codecheck.json"), "utf8"));
}

function score() {
  const rows = [], allPlanted = new Set();
  for (const fx of FIXTURES) {
    const rep = runFixture(fx), st = Object.fromEntries(rep.results.map(r => [r.id, r.status]));
    const planted = Object.keys(fx.planted); planted.forEach(id => allPlanted.add(id));
    const caught = planted.filter(id => st[id] === "FAIL");
    const missed = planted.filter(id => st[id] !== "FAIL").map(id => `${id} (${st[id]})`);
    const falseAlarms = rep.results.filter(r => (r.status === "FAIL" || r.status === "ADVISE") && !planted.includes(r.id))
      .map(r => `${r.id}: ${r.items.filter(i => !i.ok).map(i => `${i.label} ${i.value}`).join("; ")}`);
    rows.push({fixture: fx.name, planted: planted.length, caught: caught.length, missed, falseAlarms});
  }
  const trep = runFixture(TRAPS), tst = Object.fromEntries(trep.results.map(r => [r.id, r.status]));
  const trapFails = TRAPS.pass.filter(id => tst[id] !== "PASS").map(id => `${id} (${tst[id]})`);
  const trapFalse = trep.results.filter(r => r.status === "FAIL" || r.status === "ADVISE").map(r => `${r.id}: ${r.items.filter(i => !i.ok).map(i => `${i.label} ${i.value}`).join("; ")}`);

  // coverage: every rule the engine can measure has at least one plant
  const {rules} = cc.loadPack("dubai", path.join(ROOT, "plugins", "ar-plan-generator", "rules"));
  // rules that cannot FAIL by design: K-19 (any garage gives >= 1 bay; no garage is NOT CHECKABLE), F-08 (over the threshold the
  // sprinkler layout is NOT CHECKABLE, never FAIL)
  const CANNOT_FAIL = ["K-19", "F-08"];
  const measurable = rules.filter(r => !["needs_data", "reviewer", "out_of_scope"].includes(r.measure) && r.level === "shall" && !CANNOT_FAIL.includes(r.id)).map(r => r.id);
  const uncovered = measurable.filter(id => !allPlanted.has(id));

  const planted = rows.reduce((s, r) => s + r.planted, 0), caught = rows.reduce((s, r) => s + r.caught, 0);
  const falseAlarms = rows.reduce((s, r) => s + r.falseAlarms.length, 0) + trapFalse.length;
  return {rows, planted, caught, falseAlarms, traps: {checked: TRAPS.pass.length, failed: trapFails, falseAlarms: trapFalse}, measurable: measurable.length, uncovered,
          perfect: caught === planted && falseAlarms === 0 && !trapFails.length};
}

if (require.main === module) {
  const s = score();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(s, null, 1)); process.exit(s.perfect ? 0 : 1); }
  console.log("| Fixture | Planted | Caught | Missed | False alarms |\n|---|---|---|---|---|");
  for (const r of s.rows) console.log(`| ${r.fixture} | ${r.planted} | ${r.caught} | ${r.missed.join(", ") || "-"} | ${r.falseAlarms.length || "-"} |`);
  console.log(`| ${TRAPS.name} | ${TRAPS.values || s.traps.checked} values on ${s.traps.checked} rules | ${s.traps.checked - s.traps.failed.length} rules pass | ${s.traps.failed.join(", ") || "-"} | ${s.traps.falseAlarms.length || "-"} |`);
  console.log(`\nCaught ${s.caught} / ${s.planted} planted violations, ${s.falseAlarms} false alarms, ${s.traps.checked - s.traps.failed.length} / ${s.traps.checked} traps pass.`);
  console.log(`Coverage: ${s.measurable - s.uncovered.length} / ${s.measurable} measurable rules planted${s.uncovered.length ? " (not planted: " + s.uncovered.join(", ") + ")" : ""}.`);
  for (const r of s.rows) for (const f of r.falseAlarms) console.log(`  false alarm in "${r.fixture}": ${f}`);
  for (const f of s.traps.falseAlarms) console.log(`  false alarm in traps: ${f}`);
  process.exit(s.perfect ? 0 : 1);
}
module.exports = {score};
