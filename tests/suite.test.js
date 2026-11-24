// The planted-violation suite (tests/suite): every plant caught, no false alarms, every trap passes, every rule covered.
// Print the scorecard with:  node tests/suite/score.js
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {score} = require("./suite/score");

test("planted-violation suite: 100% caught, 0 false alarms, traps pass, full coverage", () => {
  const s = score();
  for (const r of s.rows) {
    assert.deepEqual(r.missed, [], `${r.fixture}: missed ${r.missed}`);
    assert.deepEqual(r.falseAlarms, [], `${r.fixture}: false alarms ${r.falseAlarms}`);
  }
  assert.deepEqual(s.traps.failed, [], `traps failed: ${s.traps.failed}`);
  assert.deepEqual(s.traps.falseAlarms, [], `traps false alarms: ${s.traps.falseAlarms}`);
  assert.deepEqual(s.uncovered, [], `rules never planted: ${s.uncovered}`);
  assert.ok(s.planted >= 30, `only ${s.planted} plants`);
});
