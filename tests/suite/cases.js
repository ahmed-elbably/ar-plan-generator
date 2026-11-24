/*
 * Planted-violation suite for the Dubai pack (build plan, phase 6).
 *
 * Each fixture starts from a base spec, plants several violations at once in different parts of the house,
 * and lists the rules that must FAIL. Everything else must not fail: any other FAIL is a false alarm.
 * The trap fixture sets values exactly at their limits; those rules must PASS.
 *
 *   spec(s)  edits the spec before building (with --pack dubai unless pack: false)
 *   plan(p)  edits the built plan.json before the code check (for engine-generated layers)
 */
"use strict";
const fs = require("fs"), path = require("path");
const FULL = path.join(__dirname, "..", "fixtures", "dubai-villa-full.spec.json");
const full = () => JSON.parse(fs.readFileSync(FULL, "utf8"));
const room = (s, n) => s.rooms.find(r => r.name === n);
const door = (s, from, to) => s.doors.find(d => d.from === from && d.to === to);
const fx = (s, k, r) => s.fixtures.find(f => f.kind === k && (!r || f.room === r));
const drop = (s, pred) => { s.fixtures = s.fixtures.filter(f => !pred(f)); };
const win = (s, r) => s.windows.find(w => w.room === r);

// a small house where most room and door rules are broken (built without the pack, so nothing is repaired)
const SMALL = {
  project: "Planted small house", rooms: [
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

const FIXTURES = [
  {name: "1 small house: rooms, doors, drains, DB", base: () => JSON.parse(JSON.stringify(SMALL)), pack: false,
   planted: {"K-01": "bedroom 2.88 m clear, under 3.0 m and 10.5 m2", "K-02": "maid room 1.88 m clear, under 2.1 m",
             "K-03": "kitchen 1.75 m clear, under 1.8 m", "K-06": "0.85 m bedroom door and 0.70 m bath door", "K-13": "0.95 m hall, 0.765 m clear",
             "F-13": "the same hall is under the fire code's 915 mm", "K-22": "basin 215 mm from the shower (no pack, no clearance placement)", "K-23": "door leaf swings 30 mm in front of the WC",
             "E-01": "DB in the kitchen", "P-01": "no floor drains in bath and kitchen"}},

  {name: "2 villa: kitchen, heights, daylight, sills, plot, garage", base: full,
   spec: s => {
     room(s, "Kitchen").counters.push({side: "S", from: 0, to: 0.5, depth: 3.6});        // 1.1 m between counters
     room(s, "Bedroom 3").ceiling_h = 2.6;                                               // bedroom under 2.7 m
     win(s, "Master bedroom").w = 1.0; s.windows.filter(w => w.room === "Master bedroom")[1].w = 0.8;   // ~4% net glazing
     win(s, "Bedroom 2").sill = 0.8;                                                     // sill under 900 mm
     s.building_h = 16.5;
     s.plot.y = -2; s.plot.d = 22;                                                       // road setback 1.875 m
     room(s, "Garage").w = 5.8;                                                          // 5.615 m clear, under 6.0 m
   },
   planted: {"K-04": "1.1 m between counters", "K-05": "Bedroom 3 at 2.6 m", "K-07": "Master bedroom glazing ~5%",
             "K-09": "Bedroom 2 sill 0.8 m", "K-14": "16.5 m building", "K-15": "1.875 m road setback", "K-20": "garage 5.615 m long"}},

  {name: "3 villa: fire detection and alarm (generator off)", base: full,
   spec: s => {
     s.generate = {devices: false};
     drop(s, f => f.kind === "smoke_sounder" && f.room === "Bedroom 2");
     drop(s, f => f.kind === "heat");
     drop(s, f => f.kind === "facp");
     Object.assign(fx(s, "av_outdoor"), {room: "Bedroom 3", side: "S"});                // AV on the garden facade
     s.hassantuk = false;
     drop(s, f => f.kind === "extinguisher");
   },
   planted: {"F-01": "no fire alarm panel", "F-02": "Bedroom 2 has no detector", "F-03": "closed kitchen has no heat detector",
             "F-05": "no panel near the front door", "F-06": "AV device on the S facade, road is N", "F-07": "hassantuk false",
             "F-14": "no kitchen extinguisher"}},

  {name: "4 villa: escape, gas, water", base: full,
   spec: s => {
     s.doors.splice(s.doors.indexOf(door(s, "Dressing 4", "Bedroom 4")), 1);             // Bedroom 4 cut off
     Object.assign(win(s, "Bedroom 2"), {op: "sliding", w: 0.9, h: 0.6});               // 0.45 x 0.6 escape opening
     s.gas = "lpg";                                                                      // LPG with no cylinder location
     Object.assign(fx(s, "water_tank"), {room: "Garage", side: "W"});                    // tank in an unconditioned room
     drop(s, f => f.kind === "wh");                                                      // no hot water
   },
   planted: {"F-09": "Bedroom 4 has no door route out", "F-10": "Bedroom 2 escape window 0.45 x 0.6 m",
             "F-09b": "Bedroom 2 has no usable secondary escape", "K-07": "Bedroom 2 glazing 2%",
             "F-15": "LPG declared, no cylinders", "P-03": "tank in the garage", "P-04": "no water heater"}},

  {name: "5 villa: ventilation, and a large floor with one exit", base: full,
   spec: s => {
     s.generate = {devices: false};
     fx(s, "fresh_air").lps = 40;                                                        // under the ASHRAE 62.2 rate
     drop(s, f => f.kind === "exhaust" && f.room === "Bath 3");                          // bathroom without exhaust
     fx(s, "exhaust", "Bath 2").lps = 15;                                                // demand fan under 25 L/s
     Object.assign(fx(s, "exhaust", "Bath 4"), {lps: 5, mode: "continuous"});             // continuous fan under 10 L/s
     s.rooms.push({name: "Gym", type: "other", x: -9, y: 0, w: 6, d: 6});                  // a separate gym: GA over 400 m2
     s.plot.x = -12.5; s.plot.w = 43.5;
     s.doors.splice(s.doors.indexOf(door(s, "Family living & dining", "Terrace")), 1);  // one exit left
   },
   planted: {"V-01": "40 L/s fresh air", "V-02": "Bath 3 has no exhaust", "V-03": "Bath 2 fan 15 L/s",
             "V-04": "Bath 4 continuous fan 5 L/s", "F-11": "GA over 400 m2 with one exit", "K-07": "living room loses its glazed door"}},

  {name: "6 villa: electrical layer", base: full,
   plan: p => {
     const k = n => { const r = p.rooms.find(x => x.name === n), xs = r.pts.map(q => q.x), ys = r.pts.map(q => q.y); return {x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys)}; };
     const b = k("Bath 2"); p.fixtures.push({id: "f-planted-bath-socket", kind: "socket", x: (b.x0 + b.x1) / 2, y: b.y0 + 0.2, rot: 0, h_mount: 0.45});
     p.fixtures.find(f => f.kind === "socket" && !f.worktop && f.serves === undefined).h_mount = 0.3;
     const sink = p.fixtures.find(f => f.kind === "sink"), ks = p.fixtures.find(f => f.worktop); ks.x = sink.x + 0.5; ks.y = sink.y - 0.3;
     const c1 = p.circuits.find(c => c.load === "sockets"), extra = p.fixtures.find(f => f.kind === "socket" && f.circuit && f.circuit !== c1.id && p.circuits.find(c => c.id === f.circuit).load === "sockets"); c1.items.push(extra.id);
     p.fixtures = p.fixtures.filter(f => f.kind !== "cooker_switch");
     const wh = p.fixtures.find(f => f.kind === "wh"); p.fixtures.find(f => f.serves === wh.id).x += 3;
     const ahu = p.fixtures.find(f => f.kind === "ahu"); p.circuits.find(c => c.items.includes(ahu.id)).breaker = 16;
     c1.rcd_ma = 100;
     p.fixtures.find(f => f.kind === "panel").top_h = 2.1;
   },
   planted: {"E-02": "DB top at 2.1 m", "E-03": "13 A socket in Bath 2", "E-04": "socket at 300 mm", "E-05": "counter socket 0.1 m from the sink",
             "E-06": "6 points on a 5-point radial", "E-07": "no cooker control unit", "E-08": "water heater switch 3 m away",
             "E-09": "AHU on a 16 A breaker", "E-10": "socket radial on 100 mA"}},
  {name: "7 villa: staff room, views, townhouse, open kitchen, sanitary set, mechanical air", base: full,
   spec: s => {
     s.generate = {devices: false};
     win(s, "Maid room").h = 0.8;                                                        // 6% net glazing in the staff room
     win(s, "Bedroom 4").operator_h = 1.7;                                               // winder above 1.5 m
     s.windows = s.windows.filter(w => w.room !== "Majlis");                             // majlis with no window at all
     drop(s, f => f.kind === "shower" || f.kind === "tub");                              // no shower or bath anywhere
     Object.assign(s, {building_type: "townhouse", party_wall_h: 1});                    // 1 h party wall, not sprinklered
     door(s, "Family corridor", "Kitchen").style = "opening";                            // open kitchen onto the corridor
     room(s, "Kitchen").counters.push({side: "S", from: 0.1, to: 0.9, depth: 0.6});      // counter next to the corridor detector
     drop(s, f => f.kind === "fresh_air");                                               // no mechanical outdoor air
   },
   planted: {"K-08": "maid room glazing 6%", "K-10": "window operator at 1.7 m", "K-12": "majlis has no window",
             "K-07": "majlis glazing 0%", "F-09b": "majlis has no secondary escape", "K-21": "no shower or bath",
             "K-25": "1 h party wall", "F-04": "corridor detector under 3 m from the counter", "V-05": "no fresh-air unit", "V-01": "no fresh air"}},
  {name: "8 villa: values just below the limit", base: full,
   spec: s => {
     door(s, "Lobby", "Majlis").w = 0.91;                                                // 5 mm under 915
     room(s, "Bedroom 3").ceiling_h = 2.69;                                              // 10 mm under 2.7 m
     win(s, "Bedroom 2").sill = 0.89;                                                    // 10 mm under 900
     s.building_h = 16.05;                                                               // 50 mm over 16 m
     s.plot.y = -3.115;                                                                  // road setback 2.990 m
     fx(s, "exhaust", "Bath 2").lps = 24.9;                                              // 0.1 L/s under 25
     fx(s, "panel").top_h = 2.01;                                                        // 10 mm over 2.0 m
   },
   planted: {"K-06": "0.910 m door", "K-05": "2.69 m bedroom", "K-09": "0.89 m sill", "K-14": "16.05 m", "K-15": "2.99 m road setback",
             "V-03": "24.9 L/s bathroom fan", "E-02": "DB top 2.01 m"}}
];

// values exactly at their limits: every listed rule must PASS and nothing may fail
const TRAPS = {
  name: "traps: values exactly at the limit", base: full,
  spec: s => {
    door(s, "Lobby", "Majlis").w = 0.915;                       // K-06 entry door 915 mm
    door(s, "Bedroom 4", "Bath 4").w = 0.71;                    // K-06 bathroom door 710 mm
    room(s, "Bedroom 3").ceiling_h = 2.7;                       // K-05 habitable 2.7 m
    room(s, "Pantry").ceiling_h = 2.3;                          // K-05 other 2.3 m
    for (const w of s.windows) if (w.sill === undefined || w.sill >= 0.9) w.sill = 0.9;   // K-09 sills 900 mm
    s.building_h = 16;                                          // K-14 16 m
    s.plot.y = -3.125;                                          // K-15 road setback 3.000 m from the outer wall face
    room(s, "Kitchen").counters.push({side: "S", from: 0, to: 0.5, depth: 3.515});        // K-04 1.200 m between counters
    fx(s, "exhaust", "Bath 2").lps = 25;                        // V-03 bathroom 25 L/s
    fx(s, "hood").lps = 50;                                     // V-03 hood 50 L/s
    fx(s, "panel").top_h = 2.0;                                 // E-02 DB top 2.0 m
  },
  pass: ["K-04", "K-05", "K-06", "K-09", "K-14", "K-15", "V-03", "E-02"],
  values: 12                                                    // 915 / 710 mm doors, 2.7 / 2.3 m ceilings, 900 mm sills, 16 m, 3.0 m setback, 1.2 m counters, 25 / 50 L/s, 2.0 m DB
};

module.exports = {FIXTURES, TRAPS};
