#!/usr/bin/env node
/*
 * AR Plan engine — the drawing core of AR Plan Studio, runnable from the command line.
 * Turns a room/door/window/fixture "spec" into a clean 2D architectural plan and writes
 * SVG, DXF (metres, layered), IFC4, a 3D model page, AR Plan Studio JSON and a Markdown check report.
 *
 *   node arplan.js build   <spec.json> [--out DIR] [--name NAME] [--units m|ft] [--level "Level 1"]
 *   node arplan.js to-spec <plan.json>                 (prints the editable spec of a plan)
 *   node arplan.js check   <plan.json> [--out DIR]     (prints the check report)
 *   node arplan.js export  <plan.json> [--out DIR] [--name NAME]   (SVG + DXF + report)
 *   node arplan.js 3d      <plan.json> [--out DIR] [--name NAME]   (3D model page, three.js)
 *   node arplan.js ifc     <plan.json> [--out DIR] [--name NAME]   (IFC4 for Revit / Navisworks)
 *   node arplan.js animate <plan.json> [--out DIR] [--name NAME] [--fps 24] [--frames none]
 *        (build replay page NAME.build.html + 1920x1080 frame SVGs for scripts/render-video.sh)
 *   node arplan.js codecheck <plan.json> [--pack dubai] [--out DIR] [--name NAME]
 *        (authority code check: NAME.codecheck.md + NAME.codecheck.json; see codecheck.js and rules/)
 *   build and export also accept --pack dubai to run the code check after building.
 */
"use strict";
const fs = require("fs"), path = require("path");
let doc;
const opts = {extT:0.25, intT:0.12, wallKind:"int", wallT:0.12, wallH:3.0, step:0.1, snap:true};
/* code region of the rule pack in use (--pack); only changes how readiness checks cite codes */
let codeRegion = null;
const EGRESS_REF = {default:"escape & daylight; IRC R310 in the US", dubai:"UAE FLSC Table 3.27 escape, DBC K.5.4.2 daylight"};
const SQM_TO_SF = 10.7639;
const ROOM_TYPES = {
  bedroom:{label:"Bedroom", color:"#8FA7D6"},
  bathroom:{label:"Bathroom", color:"#76BFC6"},
  kitchen:{label:"Kitchen", color:"#E2B163"},
  living:{label:"Living", color:"#AFC688"},
  dining:{label:"Dining", color:"#CDB98A"},
  laundry:{label:"Laundry", color:"#9FB3C4"},
  garage:{label:"Garage", color:"#BEBEB5"},
  hall:{label:"Hall", color:"#D8D1BE"},
  closet:{label:"Closet", color:"#C4B3D9"},
  mech:{label:"Mech / utility", color:"#D49E9A"},
  office:{label:"Office", color:"#98C4A4"},
  outdoor:{label:"Outdoor", color:"#A9D19E"},
  other:{label:"Unassigned", color:"#CFCFCF"}
};
const FIX = {
  wc:{label:"WC", w:0.45, h:0.70, svc:["water","drain"]},
  basin:{label:"Basin", w:0.55, h:0.45, svc:["water","drain"]},
  sink:{label:"Kitchen sink", w:0.80, h:0.55, svc:["water","drain"]},
  shower:{label:"Shower", w:0.90, h:0.90, svc:["water","drain"]},
  tub:{label:"Bathtub", w:1.70, h:0.75, svc:["water","drain"]},
  washer:{label:"Washer", w:0.65, h:0.65, svc:["water","drain","elec"]},
  dryer:{label:"Dryer", w:0.65, h:0.65, svc:["elec","vent"]},
  dw:{label:"Dishwasher", w:0.60, h:0.60, svc:["water","drain","elec"]},
  range:{label:"Range", w:0.75, h:0.65, svc:["elec","gas"]},
  fridge:{label:"Fridge", w:0.80, h:0.75, svc:["elec"]},
  wh:{label:"Water heater", w:0.60, h:0.60, round:true, svc:["water","gas","elec"]},
  ahu:{label:"Furnace / AHU", w:0.80, h:0.80, svc:["hvac","gas","elec"]},
  acu:{label:"AC condenser", w:0.90, h:0.90, outdoor:true, svc:["hvac","elec"]},
  panel:{label:"Elec. panel", w:0.40, h:0.15, svc:["elec"]},
  fd:{label:"Floor drain", w:0.20, h:0.20, round:true, svc:["drain"]},
  /* life safety, ventilation and services (v0.5). mount: ceiling = on the ceiling, placed in the room (pos);
     wall = wall-mounted above floor fixtures; neither collides with floor fixtures or doorways. */
  smoke:{label:"Smoke detector", w:0.15, h:0.15, round:true, mount:"ceiling", svc:["fire"]},
  smoke_sounder:{label:"Smoke detector + sounder", w:0.15, h:0.15, round:true, mount:"ceiling", svc:["fire"]},
  heat:{label:"Heat detector", w:0.15, h:0.15, round:true, mount:"ceiling", svc:["fire"]},
  exhaust:{label:"Exhaust fan", w:0.30, h:0.30, mount:"ceiling", svc:["vent","elec"]},
  facp:{label:"Fire alarm panel", w:0.40, h:0.12, mount:"wall", svc:["fire","elec"]},
  extinguisher:{label:"Fire extinguisher", w:0.20, h:0.20, round:true, mount:"wall", svc:["fire"]},
  hood:{label:"Range hood", w:0.75, h:0.50, mount:"wall", svc:["vent","elec"]},
  av_outdoor:{label:"Outdoor alarm (AV)", w:0.30, h:0.15, outdoor:true, svc:["fire"]},
  lpg:{label:"LPG cylinders", w:0.80, h:0.50, outdoor:true, svc:["gas"]},
  fresh_air:{label:"Fresh-air unit", w:0.90, h:0.60, svc:["vent","elec"]},
  water_tank:{label:"Water tank", w:1.20, h:1.20, svc:["water"]},
  pump:{label:"Water pump", w:0.50, h:0.40, svc:["water","elec"]}
};
/* fixture properties a spec may carry through to the plan (airflow L/s, ventilation mode, tank litres, DB top height m) */
const FIX_PROPS=["lps","mode","litres","top_h"];
const overFloor=k=>!!(FIX[k]&&FIX[k].mount);   // ceiling- or wall-mounted: no floor clash

function emptyDoc(){ return {format:"ar-plan", version:2, project:"Untitled house", level:"Level 1", units:"m", walls:[], openings:[], rooms:[], fixtures:[]}; }
let idc = 0;
const uid = p => p + (++idc).toString(36) + Math.random().toString(36).slice(2,6);


/* ============ geometry ============ */
const P = (x,y)=>({x,y});
const sub=(a,b)=>P(a.x-b.x,a.y-b.y), add=(a,b)=>P(a.x+b.x,a.y+b.y), mul=(a,k)=>P(a.x*k,a.y*k);
const dot=(a,b)=>a.x*b.x+a.y*b.y, cross=(a,b)=>a.x*b.y-a.y*b.x;
const vlen=a=>Math.hypot(a.x,a.y), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const norm=a=>{const l=vlen(a)||1;return P(a.x/l,a.y/l);};
const perp=a=>P(-a.y,a.x);
const r4=v=>Math.round(v*1e4)/1e4;
const rp=p=>P(r4(p.x),r4(p.y));
function segDist(p,a,b){const ab=sub(b,a);const L2=dot(ab,ab)||1e-12;let t=dot(sub(p,a),ab)/L2;t=Math.max(0,Math.min(1,t));const q=add(a,mul(ab,t));return {d:dist(p,q),t,q};}
function polyArea(pts){let s=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];s+=a.x*b.y-b.x*a.y;}return s/2;}
function polyPerim(pts){let s=0;for(let i=0;i<pts.length;i++)s+=dist(pts[i],pts[(i+1)%pts.length]);return s;}
function polyCentroid(pts){const A=polyArea(pts);if(Math.abs(A)<1e-9){const c=pts.reduce((s,p)=>add(s,p),P(0,0));return mul(c,1/pts.length);}let cx=0,cy=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];const f=a.x*b.y-b.x*a.y;cx+=(a.x+b.x)*f;cy+=(a.y+b.y)*f;}return P(cx/(6*A),cy/(6*A));}
function pointInPoly(p,pts){let ins=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x))ins=!ins;}return ins;}
function polyEdgeDist(p,pts){let m=Infinity;for(let i=0;i<pts.length;i++)m=Math.min(m,segDist(p,pts[i],pts[(i+1)%pts.length]).d);return m;}
function lineIntersect(p,d,q,e){const den=cross(d,e);if(Math.abs(den)<1e-9)return null;const t=cross(sub(q,p),e)/den;return add(p,mul(d,t));}

/* walls */
const wallById=id=>doc.walls.find(w=>w.id===id);
const wallLen=w=>dist(w.a,w.b);
const wallDir=w=>norm(sub(w.b,w.a));
const wallNormal=w=>perp(wallDir(w));
function isJoined(pt,self){for(const w of doc.walls){if(w.id===self.id)continue;if(dist(pt,w.a)<1e-3||dist(pt,w.b)<1e-3)return true;if(segDist(pt,w.a,w.b).d<1e-3)return true;}return false;}
function wallPoly(w){const d=wallDir(w),n=mul(wallNormal(w),w.t/2);const ea=isJoined(w.a,w)?w.t/2:0,eb=isJoined(w.b,w)?w.t/2:0;const a=sub(w.a,mul(d,ea)),b=add(w.b,mul(d,eb));return [add(a,n),add(b,n),sub(b,n),sub(a,n)];}
const inAnyRoom=p=>doc.rooms.some(r=>r.type!=="outdoor"&&pointInPoly(p,r.pts));

function addWallSmart(a,b,props){
  a=rp(a);b=rp(b);const L=dist(a,b);if(L<0.01)return [];
  const d=norm(sub(b,a));const iv=[];
  for(const w of doc.walls){
    if(Math.abs(cross(d,sub(w.a,a)))<2e-3&&Math.abs(cross(d,sub(w.b,a)))<2e-3){let t0=dot(sub(w.a,a),d),t1=dot(sub(w.b,a),d);if(t0>t1)[t0,t1]=[t1,t0];iv.push([t0,t1]);}
  }
  iv.sort((x,y)=>x[0]-y[0]);
  const gaps=[];let cur=0;
  for(const [s,e] of iv){if(e<=cur)continue;if(s>cur+0.01)gaps.push([cur,Math.min(s,L)]);cur=Math.max(cur,e);if(cur>=L)break;}
  if(cur<L-0.01)gaps.push([cur,L]);
  const out=[];
  for(const [g0,g1] of gaps){if(g1-g0<0.01||g0>=L)continue;const w=Object.assign({id:uid("w"),a:rp(add(a,mul(d,g0))),b:rp(add(a,mul(d,Math.min(g1,L)))),t:opts.wallT,kind:opts.wallKind,h:opts.wallH,auto:false},props);doc.walls.push(w);out.push(w);}
  return out;
}
function classifyWalls(){
  for(const w of doc.walls){
    if(!w.auto)continue;
    const m=mul(add(w.a,w.b),0.5),n=wallNormal(w),off=0.18;
    const ext=!(inAnyRoom(add(m,mul(n,off)))&&inAnyRoom(sub(m,mul(n,off))));
    w.kind=ext?"ext":"int";w.t=ext?opts.extT:opts.intT;
  }
}
function outwardNormal(w){const m=mul(add(w.a,w.b),0.5),n=wallNormal(w);return inAnyRoom(add(m,mul(n,w.t/2+0.2)))?mul(n,-1):n;}

/* openings */
function openingGeom(o){const w=wallById(o.wall);if(!w)return null;const d=wallDir(w),n=wallNormal(w);const c=add(w.a,mul(d,o.pos));const h=o.w/2;return {w,d,n,c,p0:sub(c,mul(d,h)),p1:add(c,mul(d,h))};}
function openingFits(wall,pos,w,ignoreId){const L=wallLen(wall);if(pos-w/2<0.02||pos+w/2>L-0.02)return false;return !doc.openings.some(o=>o.wall===wall.id&&o.id!==ignoreId&&Math.abs(o.pos-pos)<(o.w+w)/2+0.05);}

/* ============ units ============ */
function fmtLen(m,short){
  if(doc.units==="ft"){const inch=Math.round(m/0.0254);const f=Math.floor(Math.abs(inch)/12)*Math.sign(inch)||0,i=Math.abs(inch)%12;return (inch<0&&f===0?"-":"")+f+"'-"+i+'"';}
  return short?m.toFixed(2):m.toFixed(2)+" m";
}
function fmtLenIn(m){if(doc.units==="ft")return fmtLen(m);return (+m.toFixed(3)).toString();}
function fmtArea(a){return doc.units==="ft"?Math.round(a*SQM_TO_SF).toLocaleString()+" sf":a.toFixed(1)+" m²";}
function areaNum(a){return doc.units==="ft"?Math.round(a*SQM_TO_SF).toLocaleString():a.toFixed(1);}
const areaUnit=()=>doc.units==="ft"?"sf":"m²";
function parseLen(s){
  s=String(s).trim();if(!s)return NaN;
  if(doc.units==="ft"){
    const m=s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*"?$/);
    if(m)return (parseFloat(m[1])*12+(m[2]?parseFloat(m[2]):0))*0.0254;
    const inch=s.match(/^(\d+(?:\.\d+)?)\s*"$/);if(inch)return parseFloat(inch[1])*0.0254;
    const v=parseFloat(s);return isNaN(v)?NaN:v*0.3048;
  }
  const v=parseFloat(s.replace(",","."));return isNaN(v)?NaN:v;
}
const STEPS={m:[[0.01,"1 cm"],[0.05,"5 cm"],[0.1,"10 cm"],[0.25,"25 cm"],[0.5,"50 cm"],[1,"1 m"]],ft:[[0.0254,'1"'],[0.0762,'3"'],[0.1524,'6"'],[0.3048,"1'"],[0.6096,"2'"]]};
function fillSteps(){const el=$("#optStep");el.innerHTML=STEPS[doc.units].map(([v,l])=>`<option value="${v}">${l}</option>`).join("");if(!STEPS[doc.units].some(s=>Math.abs(s[0]-opts.step)<1e-6))opts.step=doc.units==="m"?0.1:0.1524;el.value=String(STEPS[doc.units].find(s=>Math.abs(s[0]-opts.step)<1e-6)[0]);}


function normalizeDoc(d){const o=emptyDoc();Object.assign(o,{project:d.project||o.project,level:d.level||o.level,units:d.units==="ft"?"ft":"m"},projectFields(d));
  o.walls=(d.walls||[]).filter(w=>w&&w.a&&w.b).map(w=>({id:w.id||uid("w"),a:P(+w.a.x,+w.a.y),b:P(+w.b.x,+w.b.y),t:+w.t||0.15,kind:w.kind==="ext"?"ext":"int",h:+w.h||3,auto:!!w.auto}));
  o.openings=(d.openings||[]).filter(x=>x&&x.wall).map(x=>({id:x.id||uid("o"),type:x.type==="window"?"window":"door",style:x.style||"swing",wall:x.wall,pos:+x.pos||0,w:+x.w||0.9,side:x.side===-1?-1:1,hinge:x.hinge?1:0,h:num(x.h)||(x.type==="window"?1.2:2.1),sill:num(x.sill)??(x.type==="window"?0.9:0)}));
  (d.openings||[]).filter(x=>x&&x.wall).forEach((x,i)=>{const t=o.openings[i];if(!t)return;for(const k of ["op","glass","glazed","operator_h"])if(x[k]!==undefined)t[k]=x[k];if(Array.isArray(x.given))t.given=x.given.slice();});
  o.rooms=(d.rooms||[]).filter(r=>r&&Array.isArray(r.pts)&&r.pts.length>=3).map(r=>({id:r.id||uid("r"),name:r.name||"Room",type:ROOM_TYPES[r.type]?r.type:"other",ceil:+r.ceil||2.7,pts:r.pts.map(p=>P(+p.x,+p.y)),...(r.ceil_set?{ceil_set:true}:{}),...(counterList(r.counters).length?{counters:counterList(r.counters)}:{})}));
  o.fixtures=(d.fixtures||[]).filter(f=>f&&FIX[f.kind]).map(f=>{const q={id:f.id||uid("f"),kind:f.kind,x:+f.x,y:+f.y,rot:+f.rot||0};for(const k of FIX_PROPS)if(f[k]!==undefined)q[k]=f[k];if(f.auto)q.auto=true;return q;});
  return o;}

function drawCss(gapFill){return `
.wl{fill:#1B1D1A}.wl.int{fill:#3D413B}
.gap{fill:${gapFill}}
.jamb{stroke:#1B1D1A;stroke-width:1;vector-effect:non-scaling-stroke;fill:none}
.leaf{stroke:#1B1D1A;stroke-width:1.6;vector-effect:non-scaling-stroke;fill:none}
.swing{stroke:#676B64;stroke-width:.8;stroke-dasharray:3 2;vector-effect:non-scaling-stroke;fill:none}
.win{fill:#fff;stroke:#1B1D1A;stroke-width:1;vector-effect:non-scaling-stroke}
.glass{stroke:#1B1D1A;stroke-width:.7;vector-effect:non-scaling-stroke}
.fx{fill:#fff;stroke:#1B1D1A;stroke-width:1;vector-effect:non-scaling-stroke}
.fxl{fill:none;stroke:#1B1D1A;stroke-width:.8;vector-effect:non-scaling-stroke}
.fxd{fill:#1B1D1A}
.fxf{fill:#fff;stroke:#B3261E;stroke-width:1;vector-effect:non-scaling-stroke}.fxfl{fill:none;stroke:#B3261E;stroke-width:.6;vector-effect:non-scaling-stroke}
.fxm{fill:#fff;stroke:#1F5FBF;stroke-width:1;vector-effect:non-scaling-stroke}.fxh{fill:none;stroke:#1B1D1A;stroke-width:.8;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.ctr{fill:#F3EFE6;stroke:#8A8577;stroke-width:.7;vector-effect:non-scaling-stroke}
.fxt{font-family:"IBM Plex Mono",monospace;fill:#1B1D1A;text-anchor:middle;dominant-baseline:central}
.rn{font-family:"IBM Plex Sans",Arial,sans-serif;font-weight:600;fill:#1B1D1A;text-anchor:middle;letter-spacing:.03em}
.ra{font-family:"IBM Plex Mono",monospace;fill:#4B4F48;text-anchor:middle}
.dl{stroke:#676B64;stroke-width:.8;vector-effect:non-scaling-stroke;fill:none}
.dt{font-family:"IBM Plex Mono",monospace;fill:#4B4F48;text-anchor:middle;dominant-baseline:central}
`;}

/* ============ SVG fragment builders ============ */
const pts2=pts=>pts.map(p=>`${r4(p.x)},${r4(p.y)}`).join(" ");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function fixSym(k,rot){
  const d=FIX[k],w=d.w,h=d.h,x0=-w/2,y0=-h/2;
  const R=(x,y,ww,hh,rx,c)=>`<rect class="${c||"fx"}" x="${r4(x)}" y="${r4(y)}" width="${r4(ww)}" height="${r4(hh)}" rx="${rx||0}"/>`;
  const C=(cx,cy,r,c)=>`<circle class="${c||"fx"}" cx="${r4(cx)}" cy="${r4(cy)}" r="${r4(r)}"/>`;
  const E=(cx,cy,rx,ry,c)=>`<ellipse class="${c||"fx"}" cx="${r4(cx)}" cy="${r4(cy)}" rx="${r4(rx)}" ry="${r4(ry)}"/>`;
  const L=(a,b,c,e)=>`<line class="fxl" x1="${r4(a)}" y1="${r4(b)}" x2="${r4(c)}" y2="${r4(e)}"/>`;
  const T=(t,s)=>`<text class="fxt" x="0" y="0" font-size="${s||0.13}" transform="rotate(${-(rot||0)})">${t}</text>`;
  switch(k){
    case "wc":return R(x0,y0,w,h*0.28,0.03)+E(0,y0+h*0.28+h*0.36,w*0.42,h*0.34);
    case "basin":return R(x0,y0,w,h,0.03)+E(0,0.02,w*0.34,h*0.3,"fxl");
    case "sink":return R(x0,y0,w,h,0.02)+R(x0+0.05,y0+0.08,w/2-0.075,h-0.13,0.04,"fxl")+R(0.025,y0+0.08,w/2-0.075,h-0.13,0.04,"fxl");
    case "shower":return R(x0,y0,w,h)+L(x0,y0,-x0,-y0)+L(-x0,y0,x0,-y0)+C(0,0,0.05);
    case "tub":return R(x0,y0,w,h,0.04)+R(x0+0.07,y0+0.07,w-0.14,h-0.14,0.18,"fxl")+C(-x0-0.25,0,0.04,"fxl");
    case "washer":return R(x0,y0,w,h,0.03)+C(0,0.03,Math.min(w,h)*0.3,"fxl")+T("W");
    case "dryer":return R(x0,y0,w,h,0.03)+C(0,0.03,Math.min(w,h)*0.3,"fxl")+T("D");
    case "dw":return R(x0,y0,w,h)+T("DW");
    case "range":return R(x0,y0,w,h)+C(-w/4,-h/4,0.09,"fxl")+C(w/4,-h/4,0.09,"fxl")+C(-w/4,h/4,0.09,"fxl")+C(w/4,h/4,0.09,"fxl");
    case "fridge":return R(x0,y0,w,h)+L(x0,-y0-0.07,-x0,-y0-0.07)+T("REF");
    case "wh":return C(0,0,w/2)+T("WH");
    case "ahu":return R(x0,y0,w,h)+L(x0,y0,-x0,-y0)+T("AHU",0.14);
    case "acu":return R(x0,y0,w,h,0.03)+C(0,0,0.32,"fxl")+T("AC");
    case "panel":return R(x0,y0,w,h,0,"fxd");
    case "fd":return C(0,0,0.1)+L(-0.07,-0.07,0.07,0.07)+L(-0.07,0.07,0.07,-0.07);
    case "smoke":return C(0,0,0.075,"fxf")+T("S",0.08);
    case "smoke_sounder":return C(0,0,0.075,"fxf")+C(0,0,0.11,"fxfl")+T("S",0.08);
    case "heat":return C(0,0,0.075,"fxf")+T("H",0.08);
    case "exhaust":return R(x0,y0,w,h,0,"fxm")+L(x0,y0,-x0,-y0)+L(-x0,y0,x0,-y0);
    case "facp":return R(x0,y0,w,h,0,"fxf")+T("FAP",0.07);
    case "extinguisher":return C(0,0,w/2,"fxf")+T("FE",0.07);
    case "hood":return R(x0,y0,w,h,0,"fxh")+T("HOOD",0.09);
    case "av_outdoor":return R(x0,y0,w,h,0,"fxf")+T("AV",0.08);
    case "lpg":return R(x0,y0,w,h,0.05)+T("LPG",0.12);
    case "fresh_air":return R(x0,y0,w,h,0,"fxm")+L(x0,y0,-x0,-y0)+T("FA",0.13);
    case "water_tank":return R(x0,y0,w,h)+L(x0,y0,-x0,-y0)+L(-x0,y0,x0,-y0)+T("TANK",0.16);
    case "pump":return C(0,0,0.18)+T("P",0.12);
  }
  return R(x0,y0,w,h);
}
const fixSvg=f=>`<g transform="translate(${r4(f.x)} ${r4(f.y)}) rotate(${r4(f.rot)})">${fixSym(f.kind,f.rot)}</g>`;

function openingSvg(o){
  const g=openingGeom(o);if(!g)return "";
  const {w,d,n,c,p0,p1}=g,t=w.t;const ht=mul(n,t/2+0.004);
  let s=`<polygon class="gap" points="${pts2([add(p0,ht),add(p1,ht),sub(p1,ht),sub(p0,ht)])}"/>`;
  const jamb=p=>`<line class="jamb" x1="${r4(p.x+n.x*t/2)}" y1="${r4(p.y+n.y*t/2)}" x2="${r4(p.x-n.x*t/2)}" y2="${r4(p.y-n.y*t/2)}"/>`;
  if(o.type==="window"){
    const ht2=mul(n,t/2);
    s+=`<polygon class="win" points="${pts2([add(p0,ht2),add(p1,ht2),sub(p1,ht2),sub(p0,ht2)])}"/>`;
    const k=mul(n,t*0.12);
    s+=`<line class="glass" x1="${r4(p0.x+k.x)}" y1="${r4(p0.y+k.y)}" x2="${r4(p1.x+k.x)}" y2="${r4(p1.y+k.y)}"/><line class="glass" x1="${r4(p0.x-k.x)}" y1="${r4(p0.y-k.y)}" x2="${r4(p1.x-k.x)}" y2="${r4(p1.y-k.y)}"/>`;
    return s;
  }
  s+=jamb(p0)+jamb(p1);
  const sn=mul(n,o.side);
  if(o.style==="swing"){
    const hinge=o.hinge?p1:p0,other=o.hinge?p0:p1;
    const hf=add(hinge,mul(sn,t/2)),of=add(other,mul(sn,t/2));
    const le=add(hf,mul(sn,o.w));
    const sweep=cross(sub(le,hf),sub(of,hf))>0?1:0;
    s+=`<line class="leaf" x1="${r4(hf.x)}" y1="${r4(hf.y)}" x2="${r4(le.x)}" y2="${r4(le.y)}"/>`;
    s+=`<path class="swing" d="M${r4(le.x)} ${r4(le.y)} A${r4(o.w)} ${r4(o.w)} 0 0 ${sweep} ${r4(of.x)} ${r4(of.y)}"/>`;
  }else if(o.style==="sliding"){
    const m=mul(n,t*0.18),half=o.w/2+0.04;
    const a1=p0,b1=add(p0,mul(d,half)),a2=sub(p1,mul(d,half)),b2=p1;
    s+=`<line class="leaf" x1="${r4(a1.x+m.x)}" y1="${r4(a1.y+m.y)}" x2="${r4(b1.x+m.x)}" y2="${r4(b1.y+m.y)}"/><line class="leaf" x1="${r4(a2.x-m.x)}" y1="${r4(a2.y-m.y)}" x2="${r4(b2.x-m.x)}" y2="${r4(b2.y-m.y)}"/>`;
  }else if(o.style==="garage"){
    const a=add(p0,mul(sn,t/2+0.35)),b=add(p1,mul(sn,t/2+0.35));
    s+=`<line class="swing" x1="${r4(p0.x)}" y1="${r4(p0.y)}" x2="${r4(p1.x)}" y2="${r4(p1.y)}"/><line class="swing" x1="${r4(a.x)}" y1="${r4(a.y)}" x2="${r4(b.x)}" y2="${r4(b.y)}"/>`;
  }
  return s;
}
function roomFill(r){return `<polygon points="${pts2(r.pts)}" fill="${ROOM_TYPES[r.type].color}" fill-opacity="0.3"/>`;}
function roomLabel(r){const c=polyCentroid(r.pts),A=Math.abs(polyArea(r.pts));const fs=Math.max(0.2,Math.min(0.3,Math.sqrt(A)*0.07));
  return `<text class="rn" x="${r4(c.x)}" y="${r4(c.y-fs*0.15)}" font-size="${r4(fs)}">${esc(r.name.toUpperCase())}</text><text class="ra" x="${r4(c.x)}" y="${r4(c.y+fs*0.95)}" font-size="${r4(fs*0.78)}">${fmtArea(A)}</text>`;}
function dimSvg(a,b,nOut,off,label){
  const d=norm(sub(b,a));const o=mul(nOut,off);const A=add(a,o),B=add(b,o);
  const tk=mul(norm(add(d,nOut)),0.09);
  let ang=Math.atan2(d.y,d.x)*180/Math.PI;if(ang>90.01||ang<=-90)ang+=180;
  const m=add(mul(add(A,B),0.5),mul(nOut,0.17));
  return `<line class="dl" x1="${r4(A.x)}" y1="${r4(A.y)}" x2="${r4(B.x)}" y2="${r4(B.y)}"/>`+
    `<line class="dl" x1="${r4(A.x-tk.x)}" y1="${r4(A.y-tk.y)}" x2="${r4(A.x+tk.x)}" y2="${r4(A.y+tk.y)}"/><line class="dl" x1="${r4(B.x-tk.x)}" y1="${r4(B.y-tk.y)}" x2="${r4(B.x+tk.x)}" y2="${r4(B.y+tk.y)}"/>`+
    `<text class="dt" x="${r4(m.x)}" y="${r4(m.y)}" font-size="0.19" transform="rotate(${r4(ang)} ${r4(m.x)} ${r4(m.y)})">${esc(label)}</text>`;
}
function wallDims(w){const n=outwardNormal(w);return dimSvg(w.a,w.b,n,w.t/2+0.35,fmtLen(wallLen(w)));}

let reveal=null; // build animation after AI generation: how many of each element to show
function drawingParts(){
  const R=reveal?doc.rooms.slice(0,reveal.r):doc.rooms,W=reveal?doc.walls.slice(0,reveal.w):doc.walls;
  const O=reveal?doc.openings.slice(0,reveal.o):doc.openings,F=reveal?doc.fixtures.slice(0,reveal.f):doc.fixtures;
  const rooms=R.map(roomFill).join("")+R.map(r=>counterRects(r).map(c=>`<rect class="ctr" x="${r4(c.x0)}" y="${r4(c.y0)}" width="${r4(c.x1-c.x0)}" height="${r4(c.y1-c.y0)}"/>`).join("")).join("");
  const walls=W.map(w=>`<polygon class="wl ${w.kind==="int"?"int":""}" points="${pts2(wallPoly(w))}"/>`).join("");
  const opens=O.map(openingSvg).join("");
  const fixes=F.map(fixSvg).join("");
  const labels=R.map(roomLabel).join("");
  return {rooms,walls,opens,fixes,labels};
}


function fixturesIn(r){return doc.fixtures.filter(f=>pointInPoly(P(f.x,f.y),r.pts));}
function openingsOf(r,type){return doc.openings.filter(o=>{if(type&&o.type!==type)return false;const g=openingGeom(o);return g&&polyEdgeDist(g.c,r.pts)<g.w.t/2+0.06;});}
function mepChecks(){
  const R=doc.rooms,F=doc.fixtures,list=[];
  const names=a=>a.slice(0,3).map(r=>r.name).join(", ")+(a.length>3?` +${a.length-3}`:"");
  const add=(ok,h,code,detail)=>list.push({ok,h,code,detail});
  const untyped=R.filter(r=>r.type==="other");
  add(R.length>0&&!untyped.length,R.length?`Every room has a type (${R.length} rooms)`:"Draw at least one room","drives MEP rules per space",untyped.length?"Unassigned: "+names(untyped):"");
  const noDoor=R.filter(r=>r.type!=="outdoor"&&!openingsOf(r,"door").length);
  add(R.length>0&&!noDoor.length,"Every room has a door or opening","access for runs & circuits",noDoor.length?"No door: "+names(noDoor):"");
  const beds=R.filter(r=>r.type==="bedroom"),bedsNoWin=beds.filter(r=>!openingsOf(r,"window").length);
  add(!bedsNoWin.length,`Bedrooms have a window${beds.length?` (${beds.length})`:""}`,EGRESS_REF[codeRegion]||EGRESS_REF.default,bedsNoWin.length?"Missing: "+names(bedsNoWin):"");
  const baths=R.filter(r=>r.type==="bathroom");const badBath=baths.filter(r=>{const k=fixturesIn(r).map(f=>f.kind);const wcOnly=/\b(wc|toilet|powder)\b/i.test(r.name);return !(k.includes("wc")&&k.includes("basin")&&(wcOnly||k.includes("shower")||k.includes("tub")));});
  add(baths.length>0&&!badBath.length,baths.length?`Bathrooms have WC, basin, shower/tub (${baths.length})`:"No bathroom yet","DWV + water fixture units",badBath.length?"Incomplete: "+names(badBath):"");
  const kit=R.filter(r=>r.type==="kitchen"),kitNoSink=kit.filter(r=>!fixturesIn(r).some(f=>f.kind==="sink"));
  add(kit.length>0&&!kitNoSink.length,kit.length?"Kitchen has a sink":"No kitchen yet","water, drain, DW, disposal",kitNoSink.length?"No sink: "+names(kitNoSink):"");
  add(F.some(f=>f.kind==="wh"),"Water heater placed","hot-water source","");
  add(F.some(f=>f.kind==="ahu"),"Furnace / AHU placed","duct system origin","");
  add(F.some(f=>f.kind==="panel"),"Electrical panel placed","home-run origin","");
  const stray=F.filter(f=>!FIX[f.kind].outdoor&&!R.some(r=>pointInPoly(P(f.x,f.y),r.pts)));
  add(F.length>0&&!stray.length,"Fixtures sit inside rooms","each fixture gets a room",stray.length?`${stray.length} outside: `+stray.slice(0,3).map(f=>FIX[f.kind].label).join(", "):"");
  return list;
}

const r2=v=>Math.round(v*100)/100;
const q05=v=>Math.round(v*20)/20;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SIDES={
  N:{a:b=>P(b.x0,b.y0),b:b=>P(b.x1,b.y0),n:P(0,1)},
  S:{a:b=>P(b.x0,b.y1),b:b=>P(b.x1,b.y1),n:P(0,-1)},
  W:{a:b=>P(b.x0,b.y0),b:b=>P(b.x0,b.y1),n:P(1,0)},
  E:{a:b=>P(b.x1,b.y0),b:b=>P(b.x1,b.y1),n:P(-1,0)}
};
const sideKey=s=>{const k=String(s||"").trim().toUpperCase()[0];return SIDES[k]?k:null;};
function boxOf(pts){const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return {x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};}
function wallAt(p){let best=null,bd=0.03;for(const w of doc.walls){const r=segDist(p,w.a,w.b);if(r.d<bd){bd=r.d;best=w;}}return best;}
function edgeSegs(a,b,filter){const d=norm(sub(b,a)),L=dist(a,b),segs=[];for(const w of doc.walls){if(filter&&!filter(w))continue;if(Math.abs(cross(d,sub(w.a,a)))>0.03||Math.abs(cross(d,sub(w.b,a)))>0.03)continue;let t0=dot(sub(w.a,a),d),t1=dot(sub(w.b,a),d);if(t0>t1)[t0,t1]=[t1,t0];const lo=Math.max(0,t0),hi=Math.min(L,t1);if(hi-lo>0.05)segs.push({w,lo,hi});}return {d,L,segs};}
function pickOnEdge(a,b,f,width,filter){const {d,L,segs}=edgeSegs(a,b,filter);const target=L*(Number.isFinite(f)?clamp(f,0,1):0.5);let best=null,bd=Infinity;for(const s of segs){if(s.hi-s.lo<width+0.1)continue;const t=clamp(target,s.lo+width/2+0.05,s.hi-width/2-0.05);const dd=Math.abs(t-target);if(dd<bd){bd=dd;best=add(a,mul(d,t));}}return best;}
function placeOpening(type,style,p,w,intoPt){
  const wall=wallAt(p);if(!wall)return "no wall there";
  const L=wallLen(wall);if(L<w+0.1)return "wall too short";
  const base=clamp(dot(sub(p,wall.a),wallDir(wall)),w/2+0.05,L-w/2-0.05);
  for(const dl of [0,0.3,-0.3,0.6,-0.6,0.9,-0.9,1.2,-1.2,1.6,-1.6]){
    const pp=base+dl;if(pp<w/2+0.05||pp>L-w/2-0.05)continue;
    if(!openingFits(wall,pp,w))continue;
    const c=add(wall.a,mul(wallDir(wall),pp));
    const side=intoPt?(dot(sub(intoPt,c),wallNormal(wall))>=0?1:-1):1;
    doc.openings.push({id:uid("o"),type,style,wall:wall.id,pos:r4(pp),w:r4(w),side,hinge:0,h:type==="window"?1.2:(style==="garage"?2.4:2.1),sill:type==="window"?0.9:0});
    return null;
  }
  return "no free space on that wall";
}
function sharedEdge(A,B){
  const e=0.06,c=[];
  if(Math.abs(A.x1-B.x0)<e)c.push({ax:"y",fx:A.x1,lo:Math.max(A.y0,B.y0),hi:Math.min(A.y1,B.y1)});
  if(Math.abs(A.x0-B.x1)<e)c.push({ax:"y",fx:A.x0,lo:Math.max(A.y0,B.y0),hi:Math.min(A.y1,B.y1)});
  if(Math.abs(A.y1-B.y0)<e)c.push({ax:"x",fx:A.y1,lo:Math.max(A.x0,B.x0),hi:Math.min(A.x1,B.x1)});
  if(Math.abs(A.y0-B.y1)<e)c.push({ax:"x",fx:A.y0,lo:Math.max(A.x0,B.x0),hi:Math.min(A.x1,B.x1)});
  const s=c.filter(x=>x.hi-x.lo>0.3).sort((x,y)=>(y.hi-y.lo)-(x.hi-x.lo))[0];if(!s)return null;
  return s.ax==="y"?{a:P(s.fx,s.lo),b:P(s.fx,s.hi)}:{a:P(s.lo,s.fx),b:P(s.hi,s.fx)};
}
const boxCenter=b=>P((b.x0+b.x1)/2,(b.y0+b.y1)/2);
function extSidesByLength(box){return Object.keys(SIDES).map(k=>{const S=SIDES[k];const {segs}=edgeSegs(S.a(box),S.b(box),w=>w.kind==="ext");return [k,segs.reduce((s,x)=>s+x.hi-x.lo,0)];}).filter(x=>x[1]>0.5).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);}

/* tolerate the words a model (or a person) actually uses */
const TYPE_SYN={bath:"bathroom",washroom:"bathroom",wc:"bathroom",toilet:"bathroom",ensuite:"bathroom","en-suite":"bathroom",powder:"bathroom",
  lounge:"living",majlis:"living",reception:"living",family:"living","living room":"living",sitting:"living",
  corridor:"hall",lobby:"hall",entry:"hall",entrance:"hall",foyer:"hall",passage:"hall",hallway:"hall",
  store:"closet",storage:"closet",pantry:"closet",wardrobe:"closet","walk-in":"closet",dressing:"closet",
  utility:"mech",plant:"mech",mechanical:"mech",electrical:"mech",
  study:"office",library:"office",
  balcony:"outdoor",terrace:"outdoor",patio:"outdoor",porch:"outdoor",garden:"outdoor",courtyard:"outdoor",
  maid:"bedroom",driver:"bedroom",guest:"bedroom",master:"bedroom",
  carport:"garage",parking:"garage",
  dining_room:"dining","dining room":"dining",
  laundry_room:"laundry",wash:"laundry"};
function normType(t){const k=String(t||"").trim().toLowerCase();if(ROOM_TYPES[k])return k;if(TYPE_SYN[k])return TYPE_SYN[k];for(const [s,v] of Object.entries(TYPE_SYN))if(k.includes(s))return v;for(const r of Object.keys(ROOM_TYPES))if(k.includes(r))return r;return "other";}
const FIX_SYN={toilet:"wc",lavatory:"basin",washbasin:"basin",vanity:"basin",lavabo:"basin","kitchen sink":"sink",kitchen_sink:"sink",
  bathtub:"tub",bath:"tub",shower_tray:"shower",washing_machine:"washer","washing machine":"washer",tumble_dryer:"dryer",
  dishwasher:"dw",stove:"range",cooker:"range",oven:"range",hob:"range",cooktop:"range",refrigerator:"fridge",
  water_heater:"wh","water heater":"wh",boiler:"wh",geyser:"wh",heater:"wh",
  furnace:"ahu",fcu:"ahu",air_handler:"ahu",indoor_unit:"ahu",
  condenser:"acu",ac:"acu",outdoor_unit:"acu",split_ac:"acu",
  smoke_detector:"smoke",smoke_alarm:"smoke",sounder_smoke:"smoke_sounder",smoke_detector_sounder:"smoke_sounder",heat_detector:"heat",
  extract_fan:"exhaust",exhaust_fan:"exhaust",fan:"exhaust",fire_alarm_panel:"facp",fap:"facp",fire_panel:"facp",monitoring_panel:"facp",
  fire_extinguisher:"extinguisher",range_hood:"hood",cooker_hood:"hood",kitchen_hood:"hood",av:"av_outdoor",strobe:"av_outdoor",outdoor_alarm:"av_outdoor",
  lpg_cylinder:"lpg",gas_cylinder:"lpg",fresh_air_unit:"fresh_air",fau:"fresh_air",erv:"fresh_air",tank:"water_tank",booster_pump:"pump",
  db:"panel",distribution_board:"panel",electrical_panel:"panel",breaker:"panel",floor_drain:"fd",drain:"fd"};
function normFix(k){const s=String(k||"").trim().toLowerCase();if(FIX[s])return s;const u=s.replace(/[\s-]+/g,"_");if(FIX_SYN[s])return FIX_SYN[s];if(FIX_SYN[u])return FIX_SYN[u];return null;}
const normSide=s=>{const k=String(s||"").trim().toUpperCase();const m={NORTH:"N",SOUTH:"S",EAST:"E",WEST:"W"};return sideKey(m[k]||k);};

/* spec -> drawing */
/* v0.5 project, room and opening fields: sanitised the same way from a spec or a plan.json */
const num=v=>{const n=+v;return v!==undefined&&v!==null&&v!==""&&Number.isFinite(n)?n:undefined;};
const sides=v=>(Array.isArray(v)?v:v?[v]:[]).map(normSide).filter(Boolean);
function projectFields(s){const o={};if(!s)return o;
  if(s.plot&&[s.plot.x,s.plot.y,s.plot.w,s.plot.d].every(v=>num(v)!==undefined)){const p=s.plot;
    o.plot={x:+p.x,y:+p.y,w:+p.w,d:+p.d,road:sides(p.road),sikka:sides(p.sikka)};
    if(p.setbacks&&typeof p.setbacks==="object"){o.plot.setbacks={};for(const k of ["road","neighbour","sikka"])if(num(p.setbacks[k])!==undefined)o.plot.setbacks[k]=+p.setbacks[k];}}
  if(/^(villa|townhouse)$/i.test(s.building_type||""))o.building_type=String(s.building_type).toLowerCase();
  if(/^(electric|lpg|piped)$/i.test(s.gas||""))o.gas=String(s.gas).toLowerCase();
  for(const k of ["storeys","building_h","party_wall_h"])if(num(s[k])!==undefined)o[k]=+s[k];
  for(const k of ["sprinklered","hassantuk"])if(typeof s[k]==="boolean")o[k]=s[k];
  if(num(s.glass)!==undefined)o.glass=clamp(+s.glass,0,1);   // default net glazing ratio of windows and glazed doors
  return o;}
const counterList=v=>(Array.isArray(v)?v:[]).map(c=>({side:normSide(c.side),from:clamp(num(c.from)??0,0,1),to:clamp(num(c.to)??1,0,1),depth:num(c.depth)??0.6})).filter(c=>c.side&&c.to>c.from);
const WIN_OPS=["fixed","sliding","casement","hung","tilt"];
/* window / door data the spec gave (sill, h, op, glass, glazed); "given" lists what was designed, not defaulted */
function openingFields(o,src,isWin){const given=[];
  if(isWin){if(num(src.sill)!==undefined){o.sill=+src.sill;given.push("sill");}if(num(src.h)!==undefined){o.h=+src.h;given.push("h");}
    if(WIN_OPS.includes(String(src.op||"").toLowerCase())){o.op=String(src.op).toLowerCase();given.push("op");}}
  else{if(num(src.h)!==undefined){o.h=+src.h;given.push("h");}if(src.glazed===true){o.glazed=true;given.push("glazed");}}
  if(num(src.glass)!==undefined){o.glass=clamp(+src.glass,0,1);given.push("glass");}
  if(num(src.operator_h)!==undefined){o.operator_h=+src.operator_h;given.push("operator_h");}
  if(given.length)o.given=given;return o;}

/* place (optional, from a rule pack): {clear:{kinds,to_side,to_adjacent,to_wall,to_fixture,ignore,ref}, drains:{wet_types,wet_kinds,ref}} */
function specToDoc(spec,place){
  const rep=[];const old=doc;
  const nd=emptyDoc();nd.units=old.units;nd.level=old.level;nd.project=(spec&&spec.project?String(spec.project).slice(0,60):old.project);
  Object.assign(nd,projectFields(spec));
  doc=nd;
  try{
    const byName=new Map(),boxes=new Map();
    for(const r of (Array.isArray(spec.rooms)?spec.rooms:[])){
      const x=+r.x,y=+r.y,w=+r.w,d=+(r.d!==undefined?r.d:r.h);
      if(![x,y,w,d].every(Number.isFinite)||w<0.5||d<0.5){rep.push(`Skipped room "${r.name||"?"}": missing or tiny size`);continue;}
      let name=String(r.name||"Room").trim().slice(0,40)||"Room";const base=name;let i=2;while(byName.has(name.toLowerCase()))name=`${base} ${i++}`;
      const type=normType(r.type);
      const b={x0:q05(x),y0:q05(y),x1:q05(x+w),y1:q05(y+d)};
      const ch=num(r.ceiling_h)??num(spec.ceiling_h);
      const room={id:uid("r"),name,type,ceil:ch??(type==="garage"?3:2.7),pts:[P(b.x0,b.y0),P(b.x1,b.y0),P(b.x1,b.y1),P(b.x0,b.y1)]};
      if(ch!==undefined)room.ceil_set=true;
      const ct=counterList(r.counters);if(ct.length)room.counters=ct;
      doc.rooms.push(room);byName.set(name.toLowerCase(),room);boxes.set(room.id,b);
      if(r.name&&String(r.name).trim().toLowerCase()!==name.toLowerCase())byName.set(String(r.name).trim().toLowerCase()+"#dup",room);
    }
    if(!doc.rooms.length)throw {code:"no_rooms"};
    const list=doc.rooms;
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const A=boxes.get(list[i].id),B=boxes.get(list[j].id);const ix=Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0),iy=Math.min(A.y1,B.y1)-Math.max(A.y0,B.y0);if(ix>0.05&&iy>0.05)rep.push(`${list[i].name} overlaps ${list[j].name} (${fmtArea(ix*iy)})`);}
    for(const room of list){if(room.type==="outdoor")continue;for(let k=0;k<4;k++)addWallSmart(room.pts[k],room.pts[(k+1)%4],{t:opts.intT,kind:"int",h:3,auto:true});}
    classifyWalls();
    const find=n=>{const k=String(n||"").trim().toLowerCase();if(!k)return null;if(byName.has(k))return byName.get(k);for(const [nm,r] of byName)if(nm.startsWith(k)||k.startsWith(nm))return r;return null;};
    const isOut=n=>/^(outside|exterior|outdoor|street)$/i.test(String(n||"").trim());
    let doorsOk=0,winOk=0,fixOk=0;
    for(const dr of (Array.isArray(spec.doors)?spec.doors:[])){
      const st=String(dr.style||"").toLowerCase();const style=["swing","sliding","opening","garage"].includes(st)?st:(/open|arch/.test(st)?"opening":/slid|pocket/.test(st)?"sliding":/garage|overhead|roll/.test(st)?"garage":"swing");
      const fromOut=isOut(dr.from),toOut=isOut(dr.to);
      let A=fromOut?null:find(dr.from),B=toOut?null:find(dr.to);
      // default clear widths: 0.95 m rooms (DBC Table K.4 needs >= 915 mm), 0.8 m bathrooms / WCs (>= 710 mm), 4.8 m garage
      let w=+dr.w>0?+dr.w:(style==="garage"?4.8:[A,B].some(r=>r&&r.type==="bathroom")?0.8:0.95);w=clamp(w,0.6,6);
      const label=`${dr.from||"?"} → ${dr.to||"?"}`;
      if((!fromOut&&!A)||(!toOut&&!B)){rep.push(`Door ${label}: room not found`);continue;}
      if(A&&B){
        const e=sharedEdge(boxes.get(A.id),boxes.get(B.id));
        if(!e){rep.push(`Door ${label}: rooms don't share a wall`);continue;}
        const L=dist(e.a,e.b);if(L<w+0.15){if(L<0.75){rep.push(`Door ${label}: shared wall too short`);continue;}w=L-0.15;}
        const p=pickOnEdge(e.a,e.b,+dr.at,w);if(!p){rep.push(`Door ${label}: no wall to cut`);continue;}
        const err=placeOpening("door",style,p,w,boxCenter(boxes.get(B.id)));if(err)rep.push(`Door ${label}: ${err}`);else{doorsOk++;openingFields(doc.openings[doc.openings.length-1],dr,false);}
      }else{
        const room=A||B;if(!room){rep.push(`Door ${label}: needs at least one room`);continue;}
        const box=boxes.get(room.id);const pref=normSide(dr.side);const order=[...new Set([...(pref?[pref]:[]),...extSidesByLength(box)])];
        let placed=false;
        for(const s of order){const S=SIDES[s];const p=pickOnEdge(S.a(box),S.b(box),+dr.at,w,x=>x.kind==="ext");if(!p)continue;
          const into=B?boxCenter(box):sub(p,mul(S.n,1));const err=placeOpening("door",style,p,w,into);if(!err){placed=true;doorsOk++;openingFields(doc.openings[doc.openings.length-1],dr,false);break;}}
        if(!placed)rep.push(`Door ${label}: ${room.name} has no free outside wall`);
      }
    }
    for(const wn of (Array.isArray(spec.windows)?spec.windows:[])){
      const room=find(wn.room);if(!room){rep.push(`Window in "${wn.room}": room not found`);continue;}
      const box=boxes.get(room.id);const w=clamp(+wn.w>0?+wn.w:1.2,0.4,4);const n=clamp(Math.round(+wn.count||1),1,6);
      const pref=normSide(wn.side);const ext=extSidesByLength(box);const order=[...new Set([...(pref?[pref]:[]),...ext])];
      for(let k=0;k<n;k++){
        const f=n===1&&Number.isFinite(+wn.at)?+wn.at:(k+1)/(n+1);let placed=false;
        for(const s of order){const S=SIDES[s];const p=pickOnEdge(S.a(box),S.b(box),f,w,x=>x.kind==="ext");if(!p)continue;if(!placeOpening("window","fixed",p,w,null)){placed=true;winOk++;openingFields(doc.openings[doc.openings.length-1],Object.assign({},spec.window_defaults||{},wn),true);if(pref&&s!==pref&&k===0)rep.push(`Window in ${room.name} moved from ${pref} to ${s} (${pref} is not an outside wall)`);break;}}
        if(!placed){rep.push(`Window in ${room.name}: no free outside wall`);break;}
      }
    }
    // keep-clear zones: every doorway (both sides) and every swing arc
    const zones=[],leafZones=[];const bb=pts=>({x0:Math.min(...pts.map(p=>p.x)),y0:Math.min(...pts.map(p=>p.y)),x1:Math.max(...pts.map(p=>p.x)),y1:Math.max(...pts.map(p=>p.y))});
    for(const o of doc.openings){if(o.type!=="door")continue;const g=openingGeom(o);if(!g)continue;const t=g.w.t,e=mul(g.d,0.05);
      const q0=sub(g.p0,e),q1=add(g.p1,e),m=mul(g.n,t/2+0.6);zones.push(bb([add(q0,m),add(q1,m),sub(q0,m),sub(q1,m)]));
      if(o.style==="swing"){const sn=mul(g.n,o.side);const lz=bb([add(g.p0,mul(sn,t/2)),add(g.p1,mul(sn,t/2)),add(g.p0,mul(sn,t/2+o.w)),add(g.p1,mul(sn,t/2+o.w))]);zones.push(lz);leafZones.push(lz);}}
    const placed=[];
    const ov=(A,B)=>Math.max(0,Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0))*Math.max(0,Math.min(A.y1,B.y1)-Math.max(A.y0,B.y0));
    const fbox=(def,c,rotDeg)=>{const a=rotDeg*Math.PI/180,cs=Math.abs(Math.cos(a)),sn=Math.abs(Math.sin(a));const hw=(def.w*cs+def.h*sn)/2,hh=(def.w*sn+def.h*cs)/2;return {x0:c.x-hw,y0:c.y-hh,x1:c.x+hw,y1:c.y+hh};};
    const poseAt=(def,box,s,t)=>{const S=SIDES[s];const a=S.a(box),b=S.b(box),d=norm(sub(b,a));const base=add(a,mul(d,t));const wall=wallAt(base);const wt=wall?wall.t:opts.intT;const n=S.n;let c,rot;
      if(def.outdoor){c=sub(base,mul(n,wt/2+def.h/2+0.25));rot=Math.atan2(n.x,-n.y);}else{c=add(base,mul(n,wt/2+def.h/2+0.01));rot=Math.atan2(-n.x,n.y);}
      rot=((Math.round(rot*180/Math.PI)%360)+360)%360;return {c,rot};};
    const ORDER={N:["N","E","W","S"],S:["S","W","E","N"],E:["E","S","N","W"],W:["W","N","S","E"]};
    // placement rules from the rule pack (build --pack): WC / basin clearances and floor drains
    const C=place&&place.clear;
    const isWB=k=>!!C&&C.kinds.includes(k),ignored=k=>!!C&&(C.ignore||[]).includes(k);
    const clearBox=clearBoxOf;
    // box in a fixture's frame: lateral half-width hw, depth d0..d1 measured from its centre towards its front
    const frameBox=(c,rot,hw,d0,d1)=>{const a=rot*Math.PI/180,u=P(Math.cos(a),Math.sin(a)),f=P(-Math.sin(a),Math.cos(a));
      return bb([add(add(c,mul(u,hw)),mul(f,d0)),add(sub(c,mul(u,hw)),mul(f,d0)),add(add(c,mul(u,hw)),mul(f,d1)),add(sub(c,mul(u,hw)),mul(f,d1))]);};
    const ovs=(A,B)=>Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0)>0.001&&Math.min(A.y1,B.y1)-Math.max(A.y0,B.y0)>0.001; // clearance overlap: > 1 mm both ways
    const inside=(A,B)=>A.x0>=B.x0-1e-6&&A.x1<=B.x1+1e-6&&A.y0>=B.y0-1e-6&&A.y1<=B.y1+1e-6;
    const entry=(kind,def,p,roomId)=>{const e={kind,room:roomId,c:p.c,box:fbox(def,p.c,p.rot),mount:def.mount};
      if(isWB(kind)){e.clr=frameBox(p.c,p.rot,C.to_side,-def.h/2,def.h/2);e.f60=frameBox(p.c,p.rot,def.w/2,def.h/2,def.h/2+C.to_fixture);e.f75=frameBox(p.c,p.rot,def.w/2,def.h/2,def.h/2+C.to_wall);}
      return e;};
    const legal=(e,def,strict,cb)=>{
      const mnt=def.mount||"floor";
      if(placed.some(Q=>(Q.mount||"floor")===mnt&&ov(e.box,Q.box)>0.003))return false;
      if(!def.outdoor&&!def.mount&&zones.some(Z=>ov(e.box,Z)>0.003))return false;
      if(def.mount)return true;
      if(!strict||!C||def.outdoor||ignored(e.kind))return true;
      for(const Q of placed){if(Q.room!==e.room||ignored(Q.kind)||Q.mount)continue;
        if(e.clr&&Q.clr){if(dist(e.c,Q.c)<C.to_adjacent-1e-6||ovs(e.f60,Q.box)||ovs(Q.f60,e.box))return false;}
        else if(e.clr){if(ovs(e.clr,Q.box)||ovs(e.f60,Q.box))return false;}
        else if(Q.clr){if(ovs(e.box,Q.clr)||ovs(e.box,Q.f60))return false;}}
      if(e.clr){if(!inside(e.clr,cb)||!inside(e.f75,cb))return false;if(leafZones.some(Z=>ovs(e.f75,Z)))return false;}   // K.5.7.2 b): 750 mm to a door leaf
      return true;};
    // floor drains: add one to every wet room the spec left without
    const fixList=(Array.isArray(spec.fixtures)?spec.fixtures:[]).slice();
    const D=place&&place.drains;
    if(D){for(const room of doc.rooms){if(room.type==="outdoor")continue;
      const mine=fixList.filter(fx=>find(fx.room)===room).map(fx=>normFix(fx.kind));
      if(mine.includes("fd"))continue;
      if(D.wet_types.includes(room.type)||mine.some(k=>D.wet_kinds.includes(k))){fixList.push({kind:"fd",room:room.name,side:"S",at:0.5,auto:true});rep.push(`Floor drain added in ${room.name} (${D.ref})`);}}}
    for(const fx of fixList){
      const kind=normFix(fx.kind);const def=kind&&FIX[kind];if(!def){rep.push(`Unknown fixture "${fx.kind}" skipped`);continue;}
      const room=find(fx.room);if(!room){rep.push(`${def.label}: room "${fx.room}" not found`);continue;}
      const box=boxes.get(room.id),cb=clearBox(box);const want=normSide(fx.side)||"N";const f=Number.isFinite(+fx.at)?clamp(+fx.at,0,1):0.5;
      if(def.mount==="ceiling"){
        const pos=Array.isArray(fx.pos)&&fx.pos.length===2?fx.pos.map(v=>clamp(+v||0.5,0,1)):null;
        const k=placed.filter(Q=>Q.room===room.id&&Q.mount==="ceiling").length;const longX=cb.x1-cb.x0>=cb.y1-cb.y0;
        let fxp=pos?pos[0]:0.5,fyp=pos?pos[1]:0.3;   // default off-centre so the room label stays clearif(!pos&&k){const off=(Math.ceil(k/2)*(k%2?1:-1))*0.18;if(longX)fxp=clamp(0.5+off,0.1,0.9);else fyp=clamp(0.5+off,0.1,0.9);}
        const c=P(r4(cb.x0+(cb.x1-cb.x0)*fxp),r4(cb.y0+(cb.y1-cb.y0)*fyp));
        placed.push({kind,room:room.id,c,box:fbox(def,c,0),mount:"ceiling"});
        const fo={id:uid("f"),kind,x:c.x,y:c.y,rot:0};for(const pk of FIX_PROPS)if(fx[pk]!==undefined)fo[pk]=pk==="mode"?String(fx[pk]):+fx[pk];if(fx.auto)fo.auto=true;
        doc.fixtures.push(fo);fixOk++;continue;}
      const search=strict=>{
        for(const s of (def.outdoor?[want]:ORDER[want])){
          const S=SIDES[s];const L=dist(S.a(box),S.b(box));if(L<def.w+0.16)continue;
          const lo=def.w/2+0.08,hi=L-def.w/2-0.08,t0=clamp(L*(s===want?f:0.5),lo,hi);
          const st=C?0.05:0.1,cands=[t0];for(let k=1;k*st<=L;k++)cands.push(t0+k*st,t0-k*st);
          for(const t of cands){if(t<lo-1e-9||t>hi+1e-9)continue;const p=poseAt(def,box,s,t);const e=entry(kind,def,p,room.id);
            if(!legal(e,def,strict,cb))continue;return {...p,s,e,moved:Math.abs(t-t0)>0.35};}
        }
        return null;};
      let best=search(true),relaxed=false;
      if(!best&&C&&!def.outdoor&&!ignored(kind)){best=search(false);relaxed=!!best;}
      if(!best){const S=SIDES[want];const L=dist(S.a(box),S.b(box));const p=poseAt(def,box,want,L<def.w+0.16?L/2:clamp(L*f,def.w/2+0.08,L-def.w/2-0.08));best={...p,s:want,clash:true,e:entry(kind,def,p,room.id)};}
      if(best.clash)rep.push(`${def.label} in ${room.name} could not clear doors or other fixtures`);
      else if(relaxed)rep.push(`${def.label} in ${room.name}: no position keeps the ${C.ref} clearances (${Math.round(C.to_side*1000)} mm side, ${Math.round(C.to_adjacent*1000)} mm between WC / basin centres, ${Math.round(C.to_wall*1000)} mm in front); enlarge or rearrange the room`);
      else if(best.s!==want&&!fx.auto)rep.push(`${def.label} in ${room.name} moved from ${want} to ${best.s} wall to keep ${C&&isWB(kind)?"clearances":"doors clear"}`);
      placed.push(best.e);
      const fo={id:uid("f"),kind,x:r4(best.c.x),y:r4(best.c.y),rot:best.rot};for(const pk of FIX_PROPS)if(fx[pk]!==undefined)fo[pk]=pk==="mode"?String(fx[pk]):+fx[pk];if(fx.auto)fo.auto=true;
      doc.fixtures.push(fo);fixOk++;
    }
    return {doc,rep,stats:{rooms:doc.rooms.length,doors:doorsOk,windows:winOk,fixtures:fixOk}};
  }finally{doc=old;}
}

/* kitchen / bath counters as rectangles inside the wall faces: side, from..to (0-1 along the side), depth */
function counterRects(r){if(!r.counters)return [];const cb=clearBoxOf(boxOf(r.pts)),W=cb.x1-cb.x0,H=cb.y1-cb.y0;
  return r.counters.map(c=>{const dp=c.depth;if(c.side==="N"||c.side==="S"){const x0=cb.x0+W*c.from,x1=cb.x0+W*c.to;return c.side==="N"?{x0,x1,y0:cb.y0,y1:cb.y0+dp,side:c.side}:{x0,x1,y0:cb.y1-dp,y1:cb.y1,side:c.side};}
    const y0=cb.y0+H*c.from,y1=cb.y0+H*c.to;return c.side==="W"?{y0,y1,x0:cb.x0,x1:cb.x0+dp,side:c.side}:{y0,y1,x0:cb.x1-dp,x1:cb.x1,side:c.side};});}
/* room box inside the wall faces */
function sideThick(box,s){const S=SIDES[s];return edgeSegs(S.a(box),S.b(box)).segs.reduce((m,x)=>Math.max(m,x.w.t),0);}
function clearBoxOf(box){return {x0:box.x0+sideThick(box,"W")/2,x1:box.x1-sideThick(box,"E")/2,y0:box.y0+sideThick(box,"N")/2,y1:box.y1-sideThick(box,"S")/2};}

/* drawing -> spec (for "Change this plan") */
function docToSpec(){
  const boxes=new Map(doc.rooms.map(r=>[r.id,boxOf(r.pts)]));
  const roomAt=p=>{for(let i=doc.rooms.length-1;i>=0;i--)if(pointInPoly(p,doc.rooms[i].pts))return doc.rooms[i];return null;};
  const nearestSide=(box,p)=>{let best="N",bd=Infinity,at=0.5;for(const k of Object.keys(SIDES)){const S=SIDES[k];const a=S.a(box),b=S.b(box);const r=segDist(p,a,b);if(r.d<bd){bd=r.d;best=k;at=r.t;}}return {side:best,at:r2(at)};};
  const spec=Object.assign({project:doc.project},projectFields(doc),{rooms:[],doors:[],windows:[],fixtures:[]});
  for(const r of doc.rooms){const b=boxes.get(r.id);const sr={name:r.name,type:r.type,x:r2(b.x0),y:r2(b.y0),w:r2(b.x1-b.x0),d:r2(b.y1-b.y0)};
    if(r.ceil_set)sr.ceiling_h=r.ceil;if(r.counters)sr.counters=r.counters.map(c=>({...c}));spec.rooms.push(sr);}
  const opExtra=(o,t)=>{for(const k of (o.given||[]))if(o[k]!==undefined)t[k]=o[k];return t;};
  for(const o of doc.openings){
    const g=openingGeom(o);if(!g)continue;const off=g.w.t/2+0.2;
    const rp_=roomAt(add(g.c,mul(g.n,off))),rm=roomAt(sub(g.c,mul(g.n,off)));
    if(o.type==="window"){const room=rp_||rm;if(!room)continue;const ns=nearestSide(boxes.get(room.id),g.c);spec.windows.push(opExtra(o,{room:room.name,side:ns.side,w:r2(o.w),count:1,at:ns.at}));continue;}
    let into=o.side===1?rp_:rm,other=o.side===1?rm:rp_;if(!into){into=other;other=null;}if(!into)continue;
    const d={from:other?other.name:"OUTSIDE",to:into.name,w:r2(o.w),style:o.style};
    if(other){const e=sharedEdge(boxes.get(other.id),boxes.get(into.id));if(e){const r=segDist(g.c,e.a,e.b);d.at=r2(r.t);}}
    else{const ns=nearestSide(boxes.get(into.id),g.c);d.side=ns.side;d.at=ns.at;}
    spec.doors.push(opExtra(o,d));
  }
  for(const f of doc.fixtures){
    let room=roomAt(P(f.x,f.y));
    if(!room){let bd=Infinity;for(const r of doc.rooms){const dd=polyEdgeDist(P(f.x,f.y),r.pts);if(dd<bd){bd=dd;room=r;}}}
    if(!room)continue;let sf;
    if(FIX[f.kind].mount==="ceiling"){const cb=clearBoxOf(boxes.get(room.id));sf={kind:f.kind,room:room.name,pos:[r2((f.x-cb.x0)/(cb.x1-cb.x0)),r2((f.y-cb.y0)/(cb.y1-cb.y0))]};}
    else{const ns=nearestSide(boxes.get(room.id),P(f.x,f.y));sf={kind:f.kind,room:room.name,side:ns.side,at:ns.at};}
    for(const k of FIX_PROPS)if(f[k]!==undefined)sf[k]=f[k];spec.fixtures.push(sf);
  }
  return spec;
}


function exportDoc(){
  const out=JSON.parse(JSON.stringify(doc));
  out.exported=new Date().toISOString();out.internal_units="m";
  out.rooms.forEach(r=>{const rr=doc.rooms.find(x=>x.id===r.id);r.area_m2=r4(Math.abs(polyArea(rr.pts)));});
  out.fixtures.forEach(f=>{const rr=doc.rooms.find(r=>pointInPoly(P(f.x,f.y),r.pts));f.room=rr?rr.id:null;f.services=FIX[f.kind].svc;});
  return JSON.stringify(out,null,1);
}

/* ===================== command-line layer ===================== */
/* "4 BR + maid · 5 BA + guest WC": staff rooms and WC-only rooms are listed apart, as in GCC listings */
function roomCounts(){
  const R=doc.rooms,staff=r=>/\b(maid|driver|nanny|staff|servant)\b/i.test(r.name),wcOnly=r=>/\b(wc|toilet|powder)\b/i.test(r.name);
  const br=R.filter(r=>r.type==="bedroom"&&!staff(r)).length,st=R.filter(r=>r.type==="bedroom"&&staff(r)).length;
  const ba=R.filter(r=>r.type==="bathroom"&&!wcOnly(r)&&!staff(r)).length,wc=R.filter(r=>r.type==="bathroom"&&wcOnly(r)).length;
  return `${br} BR${st?` + ${st} staff`:""} · ${ba} BA${wc?` + ${wc} WC`:""}`;
}

doc = emptyDoc();
const DEFAULT_LEVEL = "Level 1";

function summaryLine(){
  const R=doc.rooms;const cond=R.reduce((s,r)=>s+(["garage","outdoor"].includes(r.type)?0:Math.abs(polyArea(r.pts))),0);
  return `${doc.project} · ${roomCounts()} · ${fmtArea(cond)} conditioned${R.some(r=>r.type==="garage")?" · garage":""}`;
}
function bounds(){
  const xs=[],ys=[];doc.walls.forEach(w=>wallPoly(w).forEach(p=>{xs.push(p.x);ys.push(p.y);}));
  doc.rooms.forEach(r=>r.pts.forEach(p=>{xs.push(p.x);ys.push(p.y);}));doc.fixtures.forEach(f=>{xs.push(f.x);ys.push(f.y);});
  if(!xs.length)return {x0:0,y0:0,x1:10,y1:10};return {x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};
}
function toSvg(){
  const b=bounds();const m=1.6;const x0=b.x0-m,y0=b.y0-m,w=b.x1-b.x0+2*m,h=b.y1-b.y0+2*m+1.2;
  const pp=drawingParts();const dims=doc.walls.filter(q=>q.kind==="ext").map(wallDims).join("");const sc=50;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r4(x0)} ${r4(y0)} ${r4(w)} ${r4(h)}" width="${Math.round(w*sc)}" height="${Math.round(h*sc)}">
<style>${drawCss("#FFFFFF")}</style>
<rect x="${r4(x0)}" y="${r4(y0)}" width="${r4(w)}" height="${r4(h)}" fill="#FFFFFF"/>
<g>${pp.rooms}${pp.walls}${pp.opens}${pp.fixes}${pp.labels}${dims}</g>
<text class="rn" x="${r4(b.x0)}" y="${r4(b.y1+m+0.55)}" font-size="0.42" style="text-anchor:start">${esc(doc.level.toUpperCase())} · ARCHITECTURAL PLAN</text>
<text class="ra" x="${r4(b.x0)}" y="${r4(b.y1+m+1.0)}" font-size="0.26" style="text-anchor:start">${esc(summaryLine())}</text>
</svg>`;
}

/* clash checks the dashboard doesn't do: fixture vs fixture, fixture vs doorway / door swing */
function clashes(){
  const out=[];const aabb=f=>{const d=FIX[f.kind];const a=f.rot*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));const hw=(d.w*c+d.h*s)/2,hh=(d.w*s+d.h*c)/2;return {x0:f.x-hw,y0:f.y-hh,x1:f.x+hw,y1:f.y+hh};};
  const inter=(A,B)=>Math.max(0,Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0))*Math.max(0,Math.min(A.y1,B.y1)-Math.max(A.y0,B.y0));
  const roomOf=f=>{const r=doc.rooms.find(r=>pointInPoly(P(f.x,f.y),r.pts));return r?r.name:"outside";};
  const F=doc.fixtures.filter(f=>!overFloor(f.kind));
  for(let i=0;i<F.length;i++)for(let j=i+1;j<F.length;j++)if(inter(aabb(F[i]),aabb(F[j]))>0.01)out.push(`${FIX[F[i].kind].label} overlaps ${FIX[F[j].kind].label} (${roomOf(F[i])})`);
  for(const o of doc.openings){if(o.type!=="door")continue;const g=openingGeom(o);if(!g)continue;
    const m=mul(g.n,g.w.t/2+0.05);const xs=[g.p0.x+m.x,g.p0.x-m.x,g.p1.x+m.x,g.p1.x-m.x],ys=[g.p0.y+m.y,g.p0.y-m.y,g.p1.y+m.y,g.p1.y-m.y];const O={x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};
    let S=null;if(o.style==="swing"){const sn=mul(g.n,o.side);const a=add(g.p0,mul(sn,g.w.t/2)),b=add(g.p1,mul(sn,g.w.t/2+o.w));S={x0:Math.min(a.x,b.x),y0:Math.min(a.y,b.y),x1:Math.max(a.x,b.x),y1:Math.max(a.y,b.y)};}
    for(const f of F){const A=aabb(f);if(inter(O,A)>0.005)out.push(`${FIX[f.kind].label} stands in a doorway (${roomOf(f)})`);else if(S&&inter(S,A)>0.02)out.push(`Door swing hits ${FIX[f.kind].label} (${roomOf(f)})`);}
  }
  return out;
}

function reportMd(builderNotes, files){
  const R=doc.rooms;const areas=R.map(r=>Math.abs(polyArea(r.pts)));const total=areas.reduce((a,b)=>a+b,0);
  const cond=R.reduce((s,r,i)=>s+(["garage","outdoor"].includes(r.type)?0:areas[i]),0);
  const doors=doc.openings.filter(o=>o.type==="door").length,wins=doc.openings.length-doors;
  const ck=mepChecks(),ok=ck.filter(c=>c.ok).length,cl=clashes();
  const L=[];
  L.push(`# ${doc.project} — ${doc.level} floor plan`,"",summaryLine(),"");
  L.push("| Gross area | Conditioned | Rooms | Doors | Windows | Fixtures |","|---|---|---|---|---|---|",`| ${fmtArea(total)} | ${fmtArea(cond)} | ${R.length} | ${doors} | ${wins} | ${doc.fixtures.length} |`,"");
  L.push("## Room schedule","","| Room | Type | Area |","|---|---|---|");
  R.forEach((r,i)=>L.push(`| ${r.name} | ${ROOM_TYPES[r.type].label} | ${fmtArea(areas[i])} |`));
  L.push("",`## Ready for MEP — ${ok}/${ck.length}`,"");
  ck.forEach(c=>L.push(`- ${c.ok?"✓":"⚠"} ${c.h}${c.detail?` — ${c.detail}`:` (${c.code})`}`));
  L.push("","## Clashes","");
  if(cl.length)cl.forEach(x=>L.push(`- ⚠ ${x}`));else L.push("- None found (fixtures, doorways and door swings are clear).");
  if(builderNotes&&builderNotes.length){L.push("","## Builder notes","");builderNotes.forEach(x=>L.push(`- ${x}`));}
  if(files&&files.length){L.push("","## Files","");files.forEach(f=>L.push(`- ${path.basename(f)}`));}
  L.push("","Coordinates are in metres: x to the east, y to the south. DXF flips y so north is up; 1 drawing unit = 1 m.");
  return {md:L.join("\n"),ready:`${ok}/${ck.length}`,clashes:cl.length,checks:ck};
}

/* ---------- DXF (R12 ASCII, metres, layered) ---------- */
const DXF_LAYERS=[["A-WALL",7],["A-DOOR",3],["A-GLAZ",4],["A-AREA",8],["A-AREA-IDEN",2],["P-FIXT",6],["A-EQPM",30],["P-EQPM",140],["M-EQPM",5],["E-EQPM",1],["F-FIRE",10],["M-EXHT",150],["P-GAS",40],["A-CASE",9]];
const FIX_LAYER={wc:"P-FIXT",basin:"P-FIXT",sink:"P-FIXT",shower:"P-FIXT",tub:"P-FIXT",fd:"P-FIXT",washer:"A-EQPM",dryer:"A-EQPM",dw:"A-EQPM",range:"A-EQPM",fridge:"A-EQPM",wh:"P-EQPM",ahu:"M-EQPM",acu:"M-EQPM",panel:"E-EQPM",smoke:"F-FIRE",smoke_sounder:"F-FIRE",heat:"F-FIRE",facp:"F-FIRE",extinguisher:"F-FIRE",av_outdoor:"F-FIRE",exhaust:"M-EXHT",hood:"M-EXHT",fresh_air:"M-EQPM",water_tank:"P-EQPM",pump:"P-EQPM",lpg:"P-GAS"};
function fixPrims(k){
  const d=FIX[k],w=d.w,h=d.h,x0=-w/2,y0=-h/2;const R=(x,y,ww,hh)=>({t:"rect",x,y,w:ww,h:hh}),C=(cx,cy,r)=>({t:"circle",cx,cy,r}),E=(cx,cy,rx,ry)=>({t:"ellipse",cx,cy,rx,ry}),Ln=(x1,y1,x2,y2)=>({t:"line",x1,y1,x2,y2}),T=s=>({t:"text",s});
  switch(k){
    case "wc":return [R(x0,y0,w,h*0.28),E(0,y0+h*0.28+h*0.36,w*0.42,h*0.34)];
    case "basin":return [R(x0,y0,w,h),E(0,0.02,w*0.34,h*0.3)];
    case "sink":return [R(x0,y0,w,h),R(x0+0.05,y0+0.08,w/2-0.075,h-0.13),R(0.025,y0+0.08,w/2-0.075,h-0.13)];
    case "shower":return [R(x0,y0,w,h),Ln(x0,y0,-x0,-y0),Ln(-x0,y0,x0,-y0),C(0,0,0.05)];
    case "tub":return [R(x0,y0,w,h),R(x0+0.07,y0+0.07,w-0.14,h-0.14),C(-x0-0.25,0,0.04)];
    case "washer":return [R(x0,y0,w,h),C(0,0.03,Math.min(w,h)*0.3),T("W")];
    case "dryer":return [R(x0,y0,w,h),C(0,0.03,Math.min(w,h)*0.3),T("D")];
    case "dw":return [R(x0,y0,w,h),T("DW")];
    case "range":return [R(x0,y0,w,h),C(-w/4,-h/4,0.09),C(w/4,-h/4,0.09),C(-w/4,h/4,0.09),C(w/4,h/4,0.09)];
    case "fridge":return [R(x0,y0,w,h),Ln(x0,-y0-0.07,-x0,-y0-0.07),T("REF")];
    case "wh":return [C(0,0,w/2),T("WH")];
    case "ahu":return [R(x0,y0,w,h),Ln(x0,y0,-x0,-y0),T("AHU")];
    case "acu":return [R(x0,y0,w,h),C(0,0,0.32),T("AC")];
    case "panel":return [R(x0,y0,w,h),Ln(x0,y0,-x0,-y0),Ln(-x0,y0,x0,-y0),T("EP")];
    case "fd":return [C(0,0,0.1),Ln(-0.07,-0.07,0.07,0.07),Ln(-0.07,0.07,0.07,-0.07)];
    case "smoke":return [C(0,0,0.075),T("S")];
    case "smoke_sounder":return [C(0,0,0.075),C(0,0,0.11),T("S")];
    case "heat":return [C(0,0,0.075),T("H")];
    case "exhaust":return [R(x0,y0,w,h),Ln(x0,y0,-x0,-y0),Ln(-x0,y0,x0,-y0)];
    case "facp":return [R(x0,y0,w,h),T("FAP")];
    case "extinguisher":return [C(0,0,w/2),T("FE")];
    case "hood":return [R(x0,y0,w,h),T("HOOD")];
    case "av_outdoor":return [R(x0,y0,w,h),T("AV")];
    case "lpg":return [R(x0,y0,w,h),T("LPG")];
    case "fresh_air":return [R(x0,y0,w,h),Ln(x0,y0,-x0,-y0),T("FA")];
    case "water_tank":return [R(x0,y0,w,h),Ln(x0,y0,-x0,-y0),Ln(-x0,y0,x0,-y0),T("TANK")];
    case "pump":return [C(0,0,0.18),T("P")];
  }
  return [R(x0,y0,w,h)];
}
function toDxf(){
  const o=[];const g=(c,v)=>{o.push(String(c));o.push(String(v));};
  const n=v=>(Math.round(v*10000)/10000).toString();
  const enc=s=>String(s).replace(/[^\x20-\x7E]/g,ch=>"\\U+"+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,"0"));
  const Y=y=>-y;
  const line=(l,a,b)=>{g(0,"LINE");g(8,l);g(10,n(a.x));g(20,n(Y(a.y)));g(30,0);g(11,n(b.x));g(21,n(Y(b.y)));g(31,0);};
  const poly=(l,pts,closed)=>{g(0,"POLYLINE");g(8,l);g(66,1);g(10,0);g(20,0);g(30,0);g(70,closed?1:0);for(const p of pts){g(0,"VERTEX");g(8,l);g(10,n(p.x));g(20,n(Y(p.y)));g(30,0);}g(0,"SEQEND");g(8,l);};
  const circle=(l,c,r)=>{g(0,"CIRCLE");g(8,l);g(10,n(c.x));g(20,n(Y(c.y)));g(30,0);g(40,n(r));};
  const arc=(l,c,r,p1,p2)=>{const a=p=>Math.atan2(Y(p.y)-Y(c.y),p.x-c.x)*180/Math.PI;let a1=a(p1),a2=a(p2);if(((a2-a1)%360+360)%360>180){const t=a1;a1=a2;a2=t;}g(0,"ARC");g(8,l);g(10,n(c.x));g(20,n(Y(c.y)));g(30,0);g(40,n(r));g(50,n((a1+360)%360));g(51,n((a2+360)%360));};
  const text=(l,p,hgt,s,rotDeg)=>{g(0,"TEXT");g(8,l);g(10,n(p.x));g(20,n(Y(p.y)));g(30,0);g(40,n(hgt));g(1,enc(s));if(rotDeg)g(50,n(rotDeg));g(72,1);g(73,2);g(11,n(p.x));g(21,n(Y(p.y)));g(31,0);};
  // header + tables
  g(0,"SECTION");g(2,"HEADER");g(9,"$ACADVER");g(1,"AC1009");g(9,"$INSUNITS");g(70,6);g(9,"$MEASUREMENT");g(70,1);g(0,"ENDSEC");
  g(0,"SECTION");g(2,"TABLES");
  g(0,"TABLE");g(2,"LTYPE");g(70,1);g(0,"LTYPE");g(2,"CONTINUOUS");g(70,0);g(3,"Solid line");g(72,65);g(73,0);g(40,0);g(0,"ENDTAB");
  g(0,"TABLE");g(2,"LAYER");g(70,DXF_LAYERS.length);for(const [nm,col] of DXF_LAYERS){g(0,"LAYER");g(2,nm);g(70,0);g(62,col);g(6,"CONTINUOUS");}g(0,"ENDTAB");
  g(0,"ENDSEC");
  g(0,"SECTION");g(2,"ENTITIES");
  // walls, cut at openings
  for(const w of doc.walls){
    const Lw=wallLen(w),d=wallDir(w),nn=mul(wallNormal(w),w.t/2);const ea=isJoined(w.a,w)?w.t/2:0,eb=isJoined(w.b,w)?w.t/2:0;
    const cuts=doc.openings.filter(x=>x.wall===w.id).map(x=>[x.pos-x.w/2,x.pos+x.w/2]).sort((a,b)=>a[0]-b[0]);
    const segs=[];let cur=-ea;for(const [s,e] of cuts){if(s>cur+1e-6)segs.push([cur,s]);cur=Math.max(cur,e);}if(Lw+eb>cur+1e-6)segs.push([cur,Lw+eb]);
    for(const [s,e] of segs){const a=add(w.a,mul(d,s)),b=add(w.a,mul(d,e));poly("A-WALL",[add(a,nn),add(b,nn),sub(b,nn),sub(a,nn)],true);}
  }
  // openings
  for(const op of doc.openings){
    const G=openingGeom(op);if(!G)continue;const t=G.w.t,ht=mul(G.n,t/2);
    if(op.type==="window"){poly("A-GLAZ",[add(G.p0,ht),add(G.p1,ht),sub(G.p1,ht),sub(G.p0,ht)],true);const k=mul(G.n,t*0.12);line("A-GLAZ",add(G.p0,k),add(G.p1,k));line("A-GLAZ",sub(G.p0,k),sub(G.p1,k));continue;}
    line("A-DOOR",add(G.p0,ht),sub(G.p0,ht));line("A-DOOR",add(G.p1,ht),sub(G.p1,ht));
    const sn=mul(G.n,op.side);
    if(op.style==="swing"){const hinge=op.hinge?G.p1:G.p0,other=op.hinge?G.p0:G.p1;const hf=add(hinge,mul(sn,t/2)),of=add(other,mul(sn,t/2)),le=add(hf,mul(sn,op.w));line("A-DOOR",hf,le);arc("A-DOOR",hf,op.w,le,of);}
    else if(op.style==="sliding"){const m=mul(G.n,t*0.18),half=op.w/2+0.04;line("A-DOOR",add(G.p0,m),add(add(G.p0,mul(G.d,half)),m));line("A-DOOR",sub(sub(G.p1,mul(G.d,half)),m),sub(G.p1,m));}
    else if(op.style==="garage"){line("A-DOOR",G.p0,G.p1);line("A-DOOR",add(G.p0,mul(sn,t/2+0.35)),add(G.p1,mul(sn,t/2+0.35)));}
  }
  // counters
  for(const r of doc.rooms)for(const c of counterRects(r))poly("A-CASE",[P(c.x0,c.y0),P(c.x1,c.y0),P(c.x1,c.y1),P(c.x0,c.y1)],true);
  // fixtures
  for(const f of doc.fixtures){
    const L=FIX_LAYER[f.kind]||"P-FIXT";const a=f.rot*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a);const T=(x,y)=>P(f.x+x*cs-y*sn,f.y+x*sn+y*cs);
    for(const p of fixPrims(f.kind)){
      if(p.t==="rect")poly(L,[T(p.x,p.y),T(p.x+p.w,p.y),T(p.x+p.w,p.y+p.h),T(p.x,p.y+p.h)],true);
      else if(p.t==="circle")circle(L,T(p.cx,p.cy),p.r);
      else if(p.t==="ellipse"){const pts=[];for(let i=0;i<24;i++){const q=i/24*2*Math.PI;pts.push(T(p.cx+p.rx*Math.cos(q),p.cy+p.ry*Math.sin(q)));}poly(L,pts,true);}
      else if(p.t==="line")line(L,T(p.x1,p.y1),T(p.x2,p.y2));
      else if(p.t==="text")text(L,T(0,0),0.12,p.s,0);
    }
  }
  // rooms
  for(const r of doc.rooms){poly("A-AREA",r.pts,true);const c=polyCentroid(r.pts);text("A-AREA-IDEN",c,0.25,r.name.toUpperCase(),0);text("A-AREA-IDEN",P(c.x,c.y+0.38),0.18,fmtArea(Math.abs(polyArea(r.pts))),0);}
  g(0,"ENDSEC");g(0,"EOF");
  return o.join("\n")+"\n";
}


/* ===================== build replay (HTML page + video frames) ===================== */
const ANIM_CATS=[
  ["room","Rooms","#A9BC8C"],["wall","Walls","#1B1D1A"],["door","Doors","#2F8A55"],["window","Windows","#2A7FC4"],
  ["plumb","Plumbing fixtures","#7B5EA7"],["equip","MEP equipment & appliances","#C27C0E"],["anno","Dimensions","#8A8F86"]
];
const PHASE={room:"Zoning rooms",wall:"Raising walls",door:"Cutting doors",window:"Setting windows",plumb:"Placing plumbing fixtures",equip:"Placing equipment",anno:"Dimensioning"};
const PLUMB=new Set(["wc","basin","sink","shower","tub","fd"]);
function animItems(){
  const items=[];const bx=r=>boxOf(r.pts);
  const rooms=[...doc.rooms].sort((a,b)=>(bx(a).y0-bx(b).y0)||(bx(a).x0-bx(b).x0));
  const order=new Map(rooms.map((r,i)=>[r.id,i]));
  rooms.forEach(r=>items.push({c:"room",s:roomFill(r),l:roomLabel(r)}));
  const mid=w=>mul(add(w.a,w.b),0.5);
  [...doc.walls].sort((a,b)=>(mid(a).y-mid(b).y)||(mid(a).x-mid(b).x)).forEach(w=>items.push({c:"wall",s:`<polygon class="wl ${w.kind==="int"?"int":""}" points="${pts2(wallPoly(w))}"/>`}));
  const oc=o=>{const g=openingGeom(o);return g?g.c:P(0,0);};
  [...doc.openings].filter(o=>o.type==="door").sort((a,b)=>(oc(a).y-oc(b).y)||(oc(a).x-oc(b).x)).forEach(o=>items.push({c:"door",s:openingSvg(o)}));
  [...doc.openings].filter(o=>o.type==="window").sort((a,b)=>(oc(a).y-oc(b).y)||(oc(a).x-oc(b).x)).forEach(o=>items.push({c:"window",s:openingSvg(o)}));
  const roomIdx=f=>{const r=doc.rooms.find(r=>pointInPoly(P(f.x,f.y),r.pts));return r?order.get(r.id):999;};
  const fx=[...doc.fixtures].sort((a,b)=>roomIdx(a)-roomIdx(b));
  fx.filter(f=>PLUMB.has(f.kind)).forEach(f=>items.push({c:"plumb",s:fixSvg(f)}));
  fx.filter(f=>!PLUMB.has(f.kind)).forEach(f=>items.push({c:"equip",s:fixSvg(f)}));
  doc.walls.filter(w=>w.kind==="ext").forEach(w=>items.push({c:"anno",s:wallDims(w)}));
  return items;
}
function animMeta(){
  const b=bounds();const ck=mepChecks();const cl=clashes();
  return {b,checks:ck.map(c=>({ok:c.ok,h:c.h,d:c.detail||c.code})),clashes:cl.length,
    title:`${doc.level} · Architectural plan`,summary:summaryLine(),project:doc.project};
}
const jsonForScript=v=>JSON.stringify(v).replace(/</g,"\\u003c");

function animHtml(){
  const items=animItems(),m=animMeta();const b=m.b;
  const w=b.x1-b.x0,h=b.y1-b.y0;const padX=Math.max(1.2,w*0.04),padT=Math.max(1.6,h*0.1),padB=Math.max(1.6,h*0.1);
  const vb=[b.x0-padX,b.y0-padT,w+2*padX,h+padT+padB].map(r4).join(" ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.project)} build</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  /* Layout: full-bleed drafting sheet; counter card top-left, legend top-right, MEP check panel slides in when the build ends. */
  --paper:#EFEDE7;--card:#FFFFFF;--ink:#1B1D1A;--muted:#6B6F68;--line:#DCD9D1;--accent:#1F5FBF;--good:#2F8A55;--warn:#B9770E;
  --fb:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--fm:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  color-scheme:light;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--paper);color:var(--ink);font-family:var(--fb);overflow:hidden}
#plan{position:absolute;inset:0;width:100%;height:100%}
@media (min-width:1000px){#plan{left:0;right:370px;width:auto;top:110px;bottom:70px;height:auto}}
${drawCss("#EFEDE7")}
.it{opacity:0}
.it.on{opacity:1;animation:pop .5s cubic-bezier(.2,.8,.2,1) both}
.it.wallin.on{animation:rise .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes pop{from{opacity:0;transform:translateY(-0.6px) scale(1.06)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:scale(1,.2)}to{opacity:1;transform:none}}
.it{transform-box:fill-box;transform-origin:center}
.card{position:absolute;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 24px rgba(27,29,26,.08)}
.count{left:16px;top:16px;padding:12px 16px;min-width:260px}
.eyebrow{font-family:var(--fm);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.big{font-size:40px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1.1;margin-top:4px}
.big small{font-size:17px;font-weight:500;color:var(--muted);margin-left:6px}
.phase{font-size:12.5px;color:var(--muted);margin-top:2px;display:flex;gap:7px;align-items:center}
.phase i{width:7px;height:7px;border-radius:50%;background:var(--accent);display:inline-block}
.legend{right:16px;top:16px;padding:12px 14px;width:min(340px,calc(100% - 32px));display:grid;gap:6px}
.lrow{display:grid;grid-template-columns:10px 1fr 64px 52px;gap:8px;align-items:center;font-size:12px}
.lrow .sw{width:10px;height:10px;border-radius:2px}
.lrow .bar{height:4px;border-radius:2px;background:#ECEAE4;overflow:hidden}
.lrow .bar span{display:block;height:100%;width:0}
.lrow .n{font-family:var(--fm);font-size:11px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.checks{right:16px;top:var(--ctop,240px);padding:14px 16px;width:min(340px,calc(100% - 32px));max-height:calc(100% - var(--ctop,240px) - 80px);overflow:auto;display:none;flex-direction:column;gap:8px}
.checks.show{display:flex}
.checks h2{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.ck{display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:start;opacity:0;transform:translateY(4px);transition:opacity .25s,transform .25s}
.ck.on{opacity:1;transform:none}
.ck .ic{width:17px;height:17px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:700;margin-top:1px}
.ck.pass .ic{background:var(--good)}.ck.warn .ic{background:var(--warn)}
.ck .h{font-size:13px}.ck .d{font-size:11px;color:var(--muted);font-family:var(--fm)}
.verdict{font-weight:600;font-size:15px;margin-top:4px;opacity:0;transition:opacity .3s}
.verdict.on{opacity:1}.verdict.pass{color:var(--good)}.verdict.warn{color:var(--warn)}
.tb{left:16px;bottom:16px;padding:9px 14px;pointer-events:none;max-width:calc(100% - 32px)}
.tb .t{font-weight:600;font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.tb .s{font-family:var(--fm);font-size:11.5px;color:var(--muted);margin-top:2px}
.ctrl{right:16px;bottom:16px;padding:6px;display:flex;gap:6px}
.ctrl button{font:inherit;font-size:12.5px;border:1px solid var(--line);background:#fff;border-radius:6px;padding:5px 11px;cursor:pointer;color:var(--ink)}
.ctrl button[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.ctrl button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
@media (max-width:760px){.legend{display:none}.checks{top:auto;bottom:70px;left:16px;right:16px;width:auto}.big{font-size:30px}}
@media (prefers-reduced-motion:reduce){.it.on,.it.wallin.on{animation:none}.ck{transition:none}}
</style>
</head>
<body>
<svg id="plan" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-label="Floor plan being built"><g id="main"></g><g id="labels"></g></svg>
<div class="card count"><div class="eyebrow">${esc(m.project)}</div><div class="big"><span id="n">0</span><small>/ <span id="tot">0</span></small></div><div class="phase"><i></i><span>elements placed ·</span><span id="phase">Starting</span></div></div>
<div class="card legend" id="legend"></div>
<div class="card checks" id="checks"><h2>MEP check · computed from the plan</h2><div id="ckl"></div><div class="verdict" id="verdict"></div></div>
<div class="card tb"><div class="t">${esc(m.title)}</div><div class="s">${esc(m.summary)}</div></div>
<div class="card ctrl"><button id="replay">Replay</button><button id="sp1" aria-pressed="true">1×</button><button id="sp2" aria-pressed="false">2×</button></div>
<script>
"use strict";
const ITEMS=${jsonForScript(items)};
const CATS=${jsonForScript(ANIM_CATS)};
const PHASE=${jsonForScript(PHASE)};
const CHECKS=${jsonForScript(m.checks)};
const CLASHES=${m.clashes};
const NS="http://www.w3.org/2000/svg";
const main=document.getElementById("main"),labels=document.getElementById("labels");
const els=ITEMS.map(it=>{const g=document.createElementNS(NS,"g");g.setAttribute("class","it"+(it.c==="wall"?" wallin":""));g.innerHTML=it.s;main.appendChild(g);
  let l=null;if(it.l){l=document.createElementNS(NS,"g");l.setAttribute("class","it");l.innerHTML=it.l;labels.appendChild(l);}return {g,l,c:it.c};});
const used=CATS.filter(([k])=>ITEMS.some(i=>i.c===k));
const tot={};ITEMS.forEach(i=>tot[i.c]=(tot[i.c]||0)+1);
document.getElementById("legend").innerHTML=used.map(([k,l,col])=>'<div class="lrow"><span class="sw" style="background:'+col+'"></span><span>'+l+'</span><span class="bar"><span id="b_'+k+'" style="background:'+col+'"></span></span><span class="n" id="c_'+k+'">0/'+tot[k]+'</span></div>').join("");
document.getElementById("tot").textContent=ITEMS.length.toLocaleString();
document.getElementById("ckl").innerHTML=CHECKS.map(c=>'<div class="ck '+(c.ok?"pass":"warn")+'"><span class="ic">'+(c.ok?"✓":"!")+'</span><div><div class="h"></div><div class="d"></div></div></div>').join("");
document.querySelectorAll("#ckl .ck").forEach((el,i)=>{el.querySelector(".h").textContent=CHECKS[i].h;el.querySelector(".d").textContent=CHECKS[i].d;});
const okN=CHECKS.filter(c=>c.ok).length;
const V=document.getElementById("verdict");V.textContent=okN+"/"+CHECKS.length+" checks passed · "+CLASHES+" clash"+(CLASHES===1?"":"es");V.classList.add(okN===CHECKS.length&&!CLASHES?"pass":"warn");
document.getElementById("checks").style.setProperty("--ctop",(document.getElementById("legend").offsetHeight+32)+"px");
let speed=1,shown=0,raf=0,t0=0,timers=[];
const BUILD_MS=9000;
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
function setShown(n){
  for(let i=shown;i<n;i++){els[i].g.classList.add("on");if(els[i].l)els[i].l.classList.add("on");}
  shown=n;document.getElementById("n").textContent=n.toLocaleString();
  const cnt={};for(let i=0;i<n;i++)cnt[els[i].c]=(cnt[els[i].c]||0)+1;
  used.forEach(([k])=>{const c=cnt[k]||0;document.getElementById("c_"+k).textContent=c+"/"+tot[k];document.getElementById("b_"+k).style.width=(c/tot[k]*100)+"%";});
  document.getElementById("phase").textContent=n>=els.length?"Built · checking":(n?PHASE[els[Math.max(0,n-1)].c]:"Starting");
}
function showChecks(instant){
  document.getElementById("checks").classList.add("show");
  const cks=[...document.querySelectorAll("#ckl .ck")];
  if(instant){cks.forEach(c=>c.classList.add("on"));V.classList.add("on");document.getElementById("phase").textContent="Done";return;}
  cks.forEach((c,i)=>timers.push(setTimeout(()=>c.classList.add("on"),(i+1)*320/speed)));
  timers.push(setTimeout(()=>{V.classList.add("on");document.getElementById("phase").textContent="Done";},(cks.length+1)*320/speed));
}
function reset(){cancelAnimationFrame(raf);timers.forEach(clearTimeout);timers=[];shown=0;
  els.forEach(e=>{e.g.classList.remove("on");if(e.l)e.l.classList.remove("on");});
  document.querySelectorAll("#ckl .ck").forEach(c=>c.classList.remove("on"));V.classList.remove("on");document.getElementById("checks").classList.remove("show");setShown(0);}
function play(){reset();
  if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches){setShown(els.length);showChecks(true);return;}
  t0=performance.now();const step=now=>{const k=Math.min(1,(now-t0)*speed/BUILD_MS);const n=Math.round(ease(k)*els.length);if(n>shown)setShown(n);if(k<1)raf=requestAnimationFrame(step);else{setShown(els.length);showChecks(false);}};raf=requestAnimationFrame(step);}
document.getElementById("replay").addEventListener("click",play);
function setSpeed(s){speed=s;document.getElementById("sp1").setAttribute("aria-pressed",String(s===1));document.getElementById("sp2").setAttribute("aria-pressed",String(s===2));}
document.getElementById("sp1").addEventListener("click",()=>{setSpeed(1);play();});
document.getElementById("sp2").addEventListener("click",()=>{setSpeed(2);play();});
play();
</script>
</body>
</html>`;
}

/* 1920x1080 frames for the MP4: same items, cards drawn in SVG */
function animFrames(dir,fps){
  fps=fps||24;fs.mkdirSync(dir,{recursive:true});for(const f of fs.readdirSync(dir))if(/^f_\d+\.(svg|png)$/.test(f))fs.unlinkSync(path.join(dir,f));
  const items=animItems(),m=animMeta(),b=m.b;const W=1920,H=1080;
  const area={x0:60,y0:200,x1:1400,y1:1000};const bw=b.x1-b.x0,bh=b.y1-b.y0;
  const s=Math.min((area.x1-area.x0)/bw,(area.y1-area.y0)/bh);const tx=(area.x0+area.x1)/2-(b.x0+bw/2)*s,ty=(area.y0+area.y1)/2-(b.y0+bh/2)*s;
  const used=ANIM_CATS.filter(([k])=>items.some(i=>i.c===k));const tot={};items.forEach(i=>tot[i.c]=(tot[i.c]||0)+1);
  const FM='font-family="IBM Plex Mono,DejaVu Sans Mono,monospace"',FB='font-family="IBM Plex Sans,DejaVu Sans,Arial,sans-serif"';
  const okN=m.checks.filter(c=>c.ok).length;
  const frame=(n,ckShown,verdict)=>{
    const cnt={};for(let i=0;i<n;i++)cnt[items[i].c]=(cnt[items[i].c]||0)+1;
    const phase=n>=items.length?(verdict?"Done":"Built · checking"):(n?PHASE[items[n-1].c]:"Starting");
    let o=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${drawCss("#EFEDE7")}</style><rect width="${W}" height="${H}" fill="#EFEDE7"/>`;
    o+=`<g transform="translate(${r4(tx)} ${r4(ty)}) scale(${r4(s)})">`;
    for(let i=0;i<n;i++)o+=items[i].s;for(let i=0;i<n;i++)if(items[i].l)o+=items[i].l;o+=`</g>`;
    const card=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#fff" stroke="#DCD9D1"/>`;
    o+=card(40,36,470,140)+`<text x="66" y="74" ${FM} font-size="16" fill="#6B6F68" letter-spacing="1">${esc(m.project.toUpperCase())}</text>`;
    o+=`<text x="66" y="134" ${FB} font-weight="600" fill="#1B1D1A"><tspan font-size="58">${n.toLocaleString("en-US")}</tspan><tspan font-size="26" fill="#6B6F68" dx="10">/ ${items.length.toLocaleString("en-US")}</tspan></text>`;
    o+=`<circle cx="71" cy="157" r="5" fill="#1F5FBF"/><text x="84" y="163" ${FB} font-size="18" fill="#6B6F68">elements placed · ${esc(phase)}</text>`;
    const lh=40+used.length*34;o+=card(1440,36,440,lh);
    used.forEach(([k,l,col],i)=>{const y=74+i*34,c=cnt[k]||0;o+=`<rect x="1462" y="${y-12}" width="13" height="13" rx="3" fill="${col}"/><text x="1486" y="${y}" ${FB} font-size="17" fill="#1B1D1A">${esc(l.length>22?l.slice(0,21)+"…":l)}</text><rect x="1700" y="${y-7}" width="90" height="5" rx="2.5" fill="#ECEAE4"/><rect x="1700" y="${y-7}" width="${r4(90*c/tot[k])}" height="5" rx="2.5" fill="${col}"/><text x="1858" y="${y}" ${FM} font-size="15" fill="#6B6F68" text-anchor="end">${c}/${tot[k]}</text>`;});
    if(ckShown>0||verdict){const cy=36+lh+18,ch=64+ckShown*48+(verdict?44:0);o+=card(1440,cy,440,ch)+`<text x="1464" y="${cy+36}" ${FB} font-size="15" font-weight="600" fill="#6B6F68" letter-spacing="1.5">MEP CHECK · COMPUTED FROM THE PLAN</text>`;
      m.checks.slice(0,ckShown).forEach((c,i)=>{const y=cy+76+i*48,col=c.ok?"#2F8A55":"#B9770E";o+=`<circle cx="1476" cy="${y-6}" r="11" fill="${col}"/>`+(c.ok?`<path d="M1470.5 ${y-6} l4 4 l7 -8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`:`<text x="1476" y="${y-1}" ${FB} font-size="15" font-weight="700" fill="#fff" text-anchor="middle">!</text>`)+`<text x="1498" y="${y-1}" ${FB} font-size="17" fill="#1B1D1A">${esc(c.h.length>38?c.h.slice(0,37)+"…":c.h)}</text><text x="1498" y="${y+19}" ${FM} font-size="13" fill="#6B6F68">${esc(String(c.d).slice(0,44))}</text>`;});
      if(verdict){const ok=okN===m.checks.length&&!m.clashes;o+=`<text x="1464" y="${cy+ch-24}" ${FB} font-size="21" font-weight="600" fill="${ok?"#2F8A55":"#B9770E"}">${okN}/${m.checks.length} checks passed · ${m.clashes} clash${m.clashes===1?"":"es"}</text>`;}}
    o+=card(40,H-108,Math.min(1100,40+Math.max(m.title.length*13,m.summary.length*10.5)),72)+`<text x="64" y="${H-68}" ${FB} font-size="20" font-weight="600" fill="#1B1D1A" letter-spacing="1">${esc(m.title.toUpperCase())}</text><text x="64" y="${H-45}" ${FM} font-size="15" fill="#6B6F68">${esc(m.summary)}</text>`;
    return o+"</svg>";
  };
  const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  const build=Math.round(fps*8),per=Math.max(4,Math.round(fps/3)),hold=Math.round(fps*2.5);let k=0;
  const put=svg=>{k++;fs.writeFileSync(path.join(dir,`f_${String(k).padStart(4,"0")}.svg`),svg);};
  put(frame(0,0,false));
  for(let i=1;i<=build;i++)put(frame(Math.round(ease(i/build)*items.length),0,false));
  for(let i=0;i<Math.round(fps*0.5);i++)put(frame(items.length,0,false));
  for(let c=1;c<=m.checks.length;c++)for(let j=0;j<per;j++)put(frame(items.length,c,false));
  for(let i=0;i<hold;i++)put(frame(items.length,m.checks.length,true));
  return {frames:k,fps,seconds:+(k/fps).toFixed(1),elements:items.length};
}


/* ===================== 3D page ===================== */
const THREE_JS="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";
const ORBIT_JS="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js";
function html3d(){
  const viewer=fs.readFileSync(path.join(__dirname,"viewer3d.js"),"utf8");
  const plan=JSON.parse(exportDoc());
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.project)} 3D</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  /* Layout: one full-bleed 3D stage; info card top-left, view controls bottom-right. */
  --paper:#EFEDE7;--ink:#1B1D1A;--muted:#6B6F68;--line:#DCD9D1;--accent:#1F5FBF;
  --fb:"IBM Plex Sans",system-ui,sans-serif;--fm:"IBM Plex Mono",ui-monospace,monospace;color-scheme:light;
}
html,body{height:100%;margin:0;background:var(--paper);color:var(--ink);font-family:var(--fb)}
#stage{position:absolute;inset:0}
#err{position:absolute;inset:0;display:none;place-items:center;text-align:center;padding:24px;color:var(--muted);font-size:14px}
</style>
</head>
<body>
<div id="stage" aria-label="3D model of the floor plan"></div>
<div id="err">The 3D view needs WebGL and an internet connection to load three.js.</div>
<script src="${THREE_JS}"></script>
<script src="${ORBIT_JS}"></script>
<script>
${viewer}
</script>
<script>
"use strict";
const PLAN=${jsonForScript(plan)};
const REC=location.hash==="#record";
try{window.view=AR3D.mount(document.getElementById("stage"),PLAN,{summary:${jsonForScript(summaryLine())},preserve:REC,intro:!REC});if(REC)window.view.pause();}
catch(e){document.getElementById("err").style.display="grid";console.error(e);}
</script>
</body>
</html>`;
}


/* ===================== IFC4 export ===================== */
const IFC_CHARS="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuid(){const b=require("crypto").randomBytes(16);b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;let n=0n;for(const x of b)n=(n<<8n)|BigInt(x);let s="";for(let i=0;i<22;i++){s=IFC_CHARS[Number(n&63n)]+s;n>>=6n;}return s;}
const ifcNum=v=>{let s=String(Math.round(v*1e6)/1e6);if(s==="-0")s="0";if(!/[.eE]/.test(s))s+=".";return s;};
const ifcStr=v=>"'"+String(v).replace(/\\/g,"\\\\").replace(/'/g,"''").replace(/[^\x20-\x7E]/g,ch=>"\\X2\\"+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,"0")+"\\X0\\")+"'";
/* mounting height of a fixture base (m above floor): ceiling items sit under the room ceiling */
const FIX_WALL_Z={panel:1.2,facp:1.2,extinguisher:1.0,hood:1.6,av_outdoor:2.5};
function fixZ(f){const d=FIX[f.kind];if(d.mount==="ceiling"){const r=doc.rooms.find(r=>pointInPoly(P(f.x,f.y),r.pts));return (r?r.ceil:2.7)-(FIX_3D_H[f.kind]||0.05);}return FIX_WALL_Z[f.kind]||0;}
const FIX_3D_H={smoke:0.05,smoke_sounder:0.05,heat:0.05,exhaust:0.1,facp:0.5,extinguisher:0.5,hood:0.3,av_outdoor:0.2,lpg:1.2,fresh_air:0.6,water_tank:1.2,pump:0.5,wc:0.75,basin:0.85,sink:0.9,shower:0.06,tub:0.55,washer:0.85,dryer:0.85,dw:0.85,range:0.9,fridge:1.8,wh:1.5,ahu:1.3,acu:0.8,panel:0.6,fd:0.02};
const FIX_IFC={smoke:["IFCSENSOR","SMOKESENSOR"],smoke_sounder:["IFCSENSOR","SMOKESENSOR"],heat:["IFCSENSOR","HEATSENSOR"],facp:["IFCUNITARYCONTROLELEMENT","ALARMPANEL"],av_outdoor:["IFCALARM","SIREN"],
  exhaust:["IFCFAN","PROPELLORAXIAL"],hood:["IFCFAN",null],fresh_air:["IFCUNITARYEQUIPMENT","AIRHANDLER"],water_tank:["IFCTANK","STORAGE"],lpg:["IFCTANK","PRESSUREVESSEL"],pump:["IFCPUMP",null],
  wc:["IFCSANITARYTERMINAL","TOILETPAN"],basin:["IFCSANITARYTERMINAL","WASHHANDBASIN"],sink:["IFCSANITARYTERMINAL","SINK"],shower:["IFCSANITARYTERMINAL","SHOWER"],tub:["IFCSANITARYTERMINAL","BATH"],
  fd:["IFCWASTETERMINAL","FLOORTRAP"],washer:["IFCELECTRICAPPLIANCE","WASHINGMACHINE"],dryer:["IFCELECTRICAPPLIANCE","TUMBLEDRYER"],dw:["IFCELECTRICAPPLIANCE","DISHWASHER"],range:["IFCELECTRICAPPLIANCE","ELECTRICCOOKER"],
  fridge:["IFCELECTRICAPPLIANCE","REFRIGERATOR"],wh:["IFCELECTRICAPPLIANCE","FREESTANDINGWATERHEATER"],ahu:["IFCUNITARYEQUIPMENT","AIRHANDLER"],acu:["IFCUNITARYEQUIPMENT","SPLITSYSTEM"],panel:["IFCELECTRICDISTRIBUTIONBOARD","DISTRIBUTIONBOARD"]};
function toIfc(fileName){
  const L=[];let n=0;const E=s=>{n++;L.push(`#${n}=${s};`);return `#${n}`;};const N=ifcNum,S=ifcStr,G=()=>`'${ifcGuid()}'`;
  const pt3=(x,y,z)=>E(`IFCCARTESIANPOINT((${N(x)},${N(y)},${N(z)}))`);
  const origin=pt3(0,0,0),zdir=E("IFCDIRECTION((0.,0.,1.))"),xdir=E("IFCDIRECTION((1.,0.,0.))");
  const wcs=E(`IFCAXIS2PLACEMENT3D(${origin},${zdir},${xdir})`);
  const o2=E("IFCCARTESIANPOINT((0.,0.))"),p2=E(`IFCAXIS2PLACEMENT2D(${o2},$)`);
  const ctx=E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},$)`);
  const body=E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const u=[E("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"),E("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"),E("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"),E("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")];
  const units=E(`IFCUNITASSIGNMENT((${u.join(",")}))`);
  const proj=E(`IFCPROJECT(${G()},$,${S(doc.project)},$,$,$,$,(${ctx}),${units})`);
  const sitePl=E(`IFCLOCALPLACEMENT($,${wcs})`),site=E(`IFCSITE(${G()},$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bPl=E(`IFCLOCALPLACEMENT(${sitePl},${wcs})`),bldg=E(`IFCBUILDING(${G()},$,${S(doc.project)},$,$,${bPl},$,$,.ELEMENT.,$,$,$)`);
  const sPl=E(`IFCLOCALPLACEMENT(${bPl},${wcs})`),storey=E(`IFCBUILDINGSTOREY(${G()},$,${S(doc.level)},$,$,${sPl},$,$,.ELEMENT.,0.)`);
  E(`IFCRELAGGREGATES(${G()},$,$,$,${proj},(${site}))`);E(`IFCRELAGGREGATES(${G()},$,$,$,${site},(${bldg}))`);E(`IFCRELAGGREGATES(${G()},$,$,$,${bldg},(${storey}))`);
  const place=(x,y,z,ang)=>{const p=pt3(x,y,z);const d=E(`IFCDIRECTION((${N(Math.cos(ang))},${N(Math.sin(ang))},0.))`);return E(`IFCLOCALPLACEMENT(${sPl},${E(`IFCAXIS2PLACEMENT3D(${p},${zdir},${d})`)})`);};
  const rect=(lx,ly)=>E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${p2},${N(lx)},${N(ly)})`);
  const solidAt=(prof,x,y,z,h)=>E(`IFCEXTRUDEDAREASOLID(${prof},${E(`IFCAXIS2PLACEMENT3D(${pt3(x,y,z)},$,$)`)},${zdir},${N(h)})`);
  const shape=items=>E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${items.join(",")}))`)}))`);
  const polyProf=pts=>{const ps=pts.map(p=>E(`IFCCARTESIANPOINT((${N(p.x)},${N(-p.y)}))`));ps.push(ps[0]);return E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${E(`IFCPOLYLINE((${ps.join(",")}))`)})`);};
  const inStorey=[];const bySpace=new Map();
  // walls: one IfcWall per wall, one extruded solid per piece left after cutting the openings
  for(const w of doc.walls){
    const Lw=wallLen(w);if(Lw<0.01)continue;const d=wallDir(w);const ang=Math.atan2(-d.y,d.x);const hgt=w.h||3,t=w.t;
    const ea=isJoined(w.a,w)?t/2:0,eb=isJoined(w.b,w)?t/2:0;const items=[];
    const piece=(s0,e0,y0,y1)=>{if(e0-s0<0.005||y1-y0<0.005)return;items.push(solidAt(rect(e0-s0,t),(s0+e0)/2,0,y0,y1-y0));};
    const cuts=doc.openings.filter(o=>o.wall===w.id).sort((a,b)=>a.pos-b.pos);let cur=-ea;
    for(const o of cuts){const s0=o.pos-o.w/2,e0=o.pos+o.w/2;piece(cur,s0,0,hgt);
      if(o.type==="window"){const sill=o.sill||0.9,top=Math.min(hgt,sill+(o.h||1.2));piece(s0,e0,0,sill);piece(s0,e0,top,hgt);}else piece(s0,e0,Math.min(hgt,o.h||2.1),hgt);
      cur=Math.max(cur,e0);}
    piece(cur,Lw+eb,0,hgt);if(!items.length)continue;
    inStorey.push(E(`IFCWALL(${G()},$,${S(`${w.kind==="ext"?"Exterior":"Interior"} wall ${Math.round(t*1000)} mm`)},$,$,${place(w.a.x,-w.a.y,0,ang)},${shape(items)},$,.STANDARD.)`));
  }
  // doors and windows sit in the gaps of the cut walls
  for(const o of doc.openings){
    const g=openingGeom(o);if(!g)continue;const ang=Math.atan2(-g.d.y,g.d.x);
    if(o.type==="window"){const hh=o.h||1.2;inStorey.push(E(`IFCWINDOW(${G()},$,${S(`Window ${Math.round(o.w*1000)}x${Math.round(hh*1000)}`)},$,$,${place(g.c.x,-g.c.y,o.sill||0.9,ang)},${shape([solidAt(rect(o.w,0.06),0,0,0,hh)])},$,${N(hh)},${N(o.w)},.WINDOW.,$,$)`));}
    else{const hh=o.h||2.1;const label=o.style==="garage"?"Garage door":o.style==="opening"?"Opening":o.style==="sliding"?"Sliding door":"Door";
      const items=o.style==="opening"?[]:[solidAt(rect(o.w,0.05),0,0,0,hh)];
      inStorey.push(E(`IFCDOOR(${G()},$,${S(`${label} ${Math.round(o.w*1000)}x${Math.round(hh*1000)}`)},$,$,${place(g.c.x,-g.c.y,0,ang)},${items.length?shape(items):"$"},$,${N(hh)},${N(o.w)},${o.style==="garage"?".GATE.":".DOOR."},$,$)`));}
  }
  // floor slab and space per room
  const spaces=[];
  doc.rooms.forEach((r,i)=>{
    const pts=polyArea(r.pts)<0?r.pts.slice().reverse():r.pts;
    inStorey.push(E(`IFCSLAB(${G()},$,${S(`Floor slab - ${r.name}`)},$,$,${place(0,0,-0.15,0)},${shape([solidAt(polyProf(pts),0,0,0,0.15)])},$,.FLOOR.)`));
    const sp=E(`IFCSPACE(${G()},$,${S(String(i+1).padStart(3,"0"))},${S(ROOM_TYPES[r.type].label)},$,${place(0,0,0,0)},${shape([solidAt(polyProf(pts),0,0,0,r.ceil||2.7)])},${S(r.name)},.ELEMENT.,${r.type==="outdoor"?".EXTERNAL.":".INTERNAL."},$)`);
    spaces.push(sp);bySpace.set(r.id,{sp,items:[]});
  });
  if(spaces.length)E(`IFCRELAGGREGATES(${G()},$,$,$,${storey},(${spaces.join(",")}))`);
  // fixtures and MEP equipment, with their services as a property set
  for(const f of doc.fixtures){
    const def=FIX[f.kind],[cls,pt]=FIX_IFC[f.kind]||["IFCBUILDINGELEMENTPROXY",null];const a=-(f.rot||0)*Math.PI/180;const z0=fixZ(f);
    const el=E(`${cls}(${G()},$,${S(def.label)},$,$,${place(f.x,-f.y,z0,a)},${shape([solidAt(rect(def.w,def.h),0,0,0,FIX_3D_H[f.kind]||0.8)])},$,${pt?"."+pt+".":".NOTDEFINED."})`);
    const props=[E(`IFCPROPERTYSINGLEVALUE('Services',$,IFCLABEL(${S(def.svc.join(", "))}),$)`)];
    const room=doc.rooms.find(r=>pointInPoly(P(f.x,f.y),r.pts));if(room)props.push(E(`IFCPROPERTYSINGLEVALUE('Room',$,IFCLABEL(${S(room.name)}),$)`));
    E(`IFCRELDEFINESBYPROPERTIES(${G()},$,$,$,(${el}),${E(`IFCPROPERTYSET(${G()},$,'ARPlan_Fixture',$,(${props.join(",")}))`)})`);
    if(room)bySpace.get(room.id).items.push(el);else inStorey.push(el);
  }
  if(inStorey.length)E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G()},$,$,$,(${inStorey.join(",")}),${storey})`);
  for(const {sp,items} of bySpace.values())if(items.length)E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G()},$,$,$,(${items.join(",")}),${sp})`);
  const stamp=new Date().toISOString().slice(0,19);
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME(${S(fileName||"plan.ifc")},'${stamp}',('AR Plan Generator'),(''),'arplan.js','AR Plan Generator','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
${L.join("\n")}
ENDSEC;
END-ISO-10303-21;
`;
}

/* ---------- CLI ---------- */
function args(){const a=process.argv.slice(2);const o={_:[]};for(let i=0;i<a.length;i++){if(a[i].startsWith("--")){o[a[i].slice(2)]=a[i+1];i++;}else o._.push(a[i]);}return o;}
const slug=s=>String(s||"plan").normalize("NFKD").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"-").toLowerCase()||"plan";
function readJson(f){try{return JSON.parse(fs.readFileSync(f,"utf8"));}catch(e){fail(`Could not read JSON from ${f}: ${e.message}`);}}
function fail(m){process.stderr.write("ERROR: "+m+"\n");process.exit(1);}
function writeAll(dir,name,notes){
  fs.mkdirSync(dir,{recursive:true});const base=path.join(dir,name);
  const files=[base+".plan.json",base+".svg",base+".dxf",base+".ifc",base+".3d.html",base+".report.md"];
  fs.writeFileSync(files[0],exportDoc());fs.writeFileSync(files[1],toSvg());fs.writeFileSync(files[2],toDxf());
  fs.writeFileSync(files[3],toIfc(path.basename(files[3])));fs.writeFileSync(files[4],html3d());
  const rep=reportMd(notes,files);fs.writeFileSync(files[5],rep.md);
  return {files,ready:rep.ready,clashes:rep.clashes,failed_checks:rep.checks.filter(c=>!c.ok).map(c=>c.h+(c.detail?` — ${c.detail}`:""))};
}
/* geometry helpers handed to codecheck.js (it reads the current global doc through openingGeom) */
function codecheckGeom(){return {P,add,sub,mul,dot,cross,dist,norm,pointInPoly,boxOf,openingGeom,wallLen,FIX,counterRects,extT:opts.extT};}
function runCodecheck(pack,dir,name){
  const cc=require("./codecheck");let rep;
  try{rep=cc.run(doc,codecheckGeom(),{pack});}catch(e){fail(e.message);}
  fs.mkdirSync(dir,{recursive:true});const base=path.join(dir,name);
  fs.writeFileSync(base+".codecheck.json",JSON.stringify(rep,null,1));fs.writeFileSync(base+".codecheck.md",cc.toMarkdown(rep));
  return {rep,md:cc.toMarkdown(rep),files:[base+".codecheck.md",base+".codecheck.json"],
    summary:rep.summary,fails:rep.results.filter(r=>r.status==="FAIL").map(r=>`${r.id} ${r.title}: `+r.items.filter(i=>!i.ok).map(i=>`${i.label} ${i.value}`).join("; "))};
}
function main(){
  const a=args();const cmd=a._[0];
  if(a.pack)codeRegion=String(a.pack);
  if(cmd==="codecheck"){
    doc=normalizeDoc(readJson(a._[1]||fail("codecheck needs a plan file")));const name=a.name||slug(doc.project);
    const cc=runCodecheck(a.pack||"dubai",a.out||".",name);console.log(cc.md);
  }else if(cmd==="build"){
    const spec=readJson(a._[1]||fail("build needs a spec file"));
    if(a.units==="ft")doc.units="ft";doc.level=a.level||DEFAULT_LEVEL;
    let place=null;if(a.pack){try{place=require("./codecheck").placementRules(a.pack);}catch(e){fail(e.message);}}
    const built=(()=>{try{return specToDoc(spec,place);}catch(e){if(e&&e.code==="no_rooms")fail("The spec has no usable rooms (each needs name, type, x, y, w, d).");throw e;}})();
    doc=built.doc;doc.level=a.level||DEFAULT_LEVEL;if(a.units==="ft")doc.units="ft";
    const name=a.name||slug(doc.project);const res=writeAll(a.out||".",name,built.rep);
    const out={ok:true,stats:built.stats,builder_notes:built.rep,ready_for_mep:res.ready,failed_checks:res.failed_checks,clashes:res.clashes,files:res.files};
    if(a.pack){const cc=runCodecheck(a.pack,a.out||".",name);out.codecheck={pack:a.pack,summary:cc.summary,fails:cc.fails};out.files=out.files.concat(cc.files);}
    console.log(JSON.stringify(out,null,1));
  }else if(cmd==="animate"){
    doc=normalizeDoc(readJson(a._[1]||fail("animate needs a plan file")));const name=a.name||slug(doc.project);const out=a.out||".";
    fs.mkdirSync(out,{recursive:true});const html=path.join(out,name+".build.html");fs.writeFileSync(html,animHtml());
    let video=null;if(a.frames!=="none"){const fdir=path.join(out,name+"-frames");video=animFrames(fdir,+a.fps||24);video.frames_dir=fdir;video.mp4=path.join(out,name+".build.mp4");}
    console.log(JSON.stringify({ok:true,build_page:html,video},null,1));
  }else if(cmd==="3d"){
    doc=normalizeDoc(readJson(a._[1]||fail("3d needs a plan file")));const name=a.name||slug(doc.project);const out=a.out||".";
    fs.mkdirSync(out,{recursive:true});const f=path.join(out,name+".3d.html");fs.writeFileSync(f,html3d());console.log(JSON.stringify({ok:true,page_3d:f},null,1));
  }else if(cmd==="ifc"){
    doc=normalizeDoc(readJson(a._[1]||fail("ifc needs a plan file")));const name=a.name||slug(doc.project);const out=a.out||".";
    fs.mkdirSync(out,{recursive:true});const f=path.join(out,name+".ifc");fs.writeFileSync(f,toIfc(path.basename(f)));console.log(JSON.stringify({ok:true,ifc:f},null,1));
  }else if(cmd==="to-spec"){
    doc=normalizeDoc(readJson(a._[1]||fail("to-spec needs a plan file")));console.log(JSON.stringify(docToSpec(),null,1));
  }else if(cmd==="check"){
    doc=normalizeDoc(readJson(a._[1]||fail("check needs a plan file")));const rep=reportMd([],[]);
    if(a.out){fs.mkdirSync(a.out,{recursive:true});fs.writeFileSync(path.join(a.out,(a.name||slug(doc.project))+".report.md"),rep.md);}
    console.log(rep.md);
  }else if(cmd==="export"){
    doc=normalizeDoc(readJson(a._[1]||fail("export needs a plan file")));const name=a.name||slug(doc.project);
    const res=writeAll(a.out||".",name,[]);const out={ok:true,ready_for_mep:res.ready,failed_checks:res.failed_checks,clashes:res.clashes,files:res.files};
    if(a.pack){const cc=runCodecheck(a.pack,a.out||".",name);out.codecheck={pack:a.pack,summary:cc.summary,fails:cc.fails};out.files=out.files.concat(cc.files);}
    console.log(JSON.stringify(out,null,1));
  }else{
    console.log("Usage:\n  node arplan.js build <spec.json> [--out DIR] [--name NAME] [--units m|ft] [--level \"Level 1\"]\n  node arplan.js to-spec <plan.json>\n  node arplan.js check <plan.json> [--out DIR]\n  node arplan.js export <plan.json> [--out DIR] [--name NAME]\n  node arplan.js 3d <plan.json> [--out DIR] [--name NAME]\n  node arplan.js ifc <plan.json> [--out DIR] [--name NAME]\n  node arplan.js animate <plan.json> [--out DIR] [--name NAME] [--fps 24] [--frames none]\n  node arplan.js codecheck <plan.json> [--pack dubai] [--out DIR] [--name NAME]\n  (build and export also accept --pack dubai)");
    process.exit(cmd?1:0);
  }
}
main();
