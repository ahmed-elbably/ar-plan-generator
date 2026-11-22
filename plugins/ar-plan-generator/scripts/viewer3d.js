/*
 * AR Plan 3D viewer: turns an AR Plan Studio / AR Plan Generator plan into a 3D model in the browser.
 * Needs three.js r128 (THREE global) and its OrbitControls (THREE.OrbitControls).
 *   const view = AR3D.mount(containerElement, plan, {intro: true});
 *   view.dispose();
 * Plan coordinates: metres, x east, y south. Three.js: x = plan x, z = plan y, y = up.
 */
(function(){
  "use strict";
  const ROOM_COL={bedroom:"#8FA7D6",bathroom:"#76BFC6",kitchen:"#E2B163",living:"#AFC688",dining:"#CDB98A",laundry:"#9FB3C4",garage:"#BEBEB5",hall:"#D8D1BE",closet:"#C4B3D9",mech:"#D49E9A",office:"#98C4A4",outdoor:"#A9D19E",other:"#CFCFCF"};
  const FIX={wc:[0.45,0.70],basin:[0.55,0.45],sink:[0.80,0.55],shower:[0.90,0.90],tub:[1.70,0.75],washer:[0.65,0.65],dryer:[0.65,0.65],dw:[0.60,0.60],range:[0.75,0.65],fridge:[0.80,0.75],wh:[0.60,0.60],ahu:[0.80,0.80],acu:[0.90,0.90],panel:[0.40,0.15],fd:[0.20,0.20]};
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function geomHelpers(plan){
    const walls=plan.walls||[];
    const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const segD=(p,a,b)=>{const ax=b.x-a.x,ay=b.y-a.y,L2=ax*ax+ay*ay||1e-12;let t=((p.x-a.x)*ax+(p.y-a.y)*ay)/L2;t=clamp(t,0,1);return Math.hypot(p.x-(a.x+ax*t),p.y-(a.y+ay*t));};
    const joined=(pt,self)=>walls.some(w=>w.id!==self.id&&(d(pt,w.a)<1e-3||d(pt,w.b)<1e-3||segD(pt,w.a,w.b)<1e-3));
    return {joined};
  }

  function textTexture(THREE,lines,color){
    const c=document.createElement("canvas");c.width=512;c.height=160;const g=c.getContext("2d");
    g.clearRect(0,0,c.width,c.height);g.textAlign="center";g.textBaseline="middle";g.fillStyle=color||"#1B1D1A";
    g.font="600 46px 'IBM Plex Sans', Arial, sans-serif";g.fillText(lines[0],256,58,500);
    if(lines[1]){g.font="400 34px 'IBM Plex Mono', monospace";g.fillStyle="#4B4F48";g.fillText(lines[1],256,114,500);}
    const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t;
  }

  function buildModel(THREE,plan,clip){
    const H=geomHelpers(plan);
    const root=new THREE.Group(),floors=new THREE.Group(),walls=new THREE.Group(),opens=new THREE.Group(),fixes=new THREE.Group(),labels=new THREE.Group();
    root.add(floors,walls,opens,fixes,labels);
    const M=(o)=>new THREE.MeshStandardMaterial(Object.assign({roughness:.85,metalness:0,clippingPlanes:clip},o));
    const matExt=M({color:new THREE.Color(0xE9E4D8).convertSRGBToLinear()}),matInt=M({color:new THREE.Color(0xF6F3EC).convertSRGBToLinear()}),matCap=new THREE.MeshBasicMaterial({color:0x2A2C28,clippingPlanes:clip});
    const matGlass=M({color:0x9CC7E8,transparent:true,opacity:.35,roughness:.1,metalness:.1,depthWrite:false});
    const matDoor=M({color:0xB98A5E,roughness:.7}),matWhite=M({color:0xFFFFFF,roughness:.35}),matSteel=M({color:0xC9CDD1,roughness:.4,metalness:.3});
    const matDark=M({color:0x45484A,roughness:.6}),matEquip=M({color:0xE7E3DA,roughness:.6});
    const box=(w,h,d,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.castShadow=true;m.receiveShadow=true;return m;};
    // floors per room
    for(const r of plan.rooms||[]){
      const shape=new THREE.Shape(r.pts.map(p=>new THREE.Vector2(p.x,-p.y)));
      const g=new THREE.ExtrudeGeometry(shape,{depth:0.08,bevelEnabled:false});
      const col=new THREE.Color(ROOM_COL[r.type]||ROOM_COL.other).lerp(new THREE.Color(0xFFFFFF),0.12).convertSRGBToLinear();
      const m=new THREE.Mesh(g,M({color:col}));m.rotation.x=-Math.PI/2;m.position.y=-0.08;m.receiveShadow=true;floors.add(m);
      // label lying on the floor
      let A=0;const P=r.pts;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];A+=a.x*b.y-b.x*a.y;}A=Math.abs(A/2);
      let cx=0,cy=0;P.forEach(p=>{cx+=p.x;cy+=p.y;});cx/=P.length;cy/=P.length;
      const xs=P.map(p=>p.x),ys=P.map(p=>p.y);const rw=Math.max(...xs)-Math.min(...xs),rh=Math.max(...ys)-Math.min(...ys);
      const lw=Math.min(rw*0.85,Math.max(1.4,Math.sqrt(A)*0.75));const tex=textTexture(THREE,[r.name.toUpperCase(),(plan.units==="ft"?Math.round(A*10.7639)+" sf":A.toFixed(1)+" m²")]);
      const lab=new THREE.Mesh(new THREE.PlaneGeometry(lw,lw*160/512),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
      lab.rotation.x=-Math.PI/2;lab.position.set(cx,0.02,cy);if(rh<lw*0.32)lab.scale.setScalar(0.7);labels.add(lab);
    }
    // walls cut around openings
    const ops=plan.openings||[];
    const wallList=(plan.walls||[]).slice().sort((a,b)=>((a.a.y+a.b.y)-(b.a.y+b.b.y))||((a.a.x+a.b.x)-(b.a.x+b.b.x)));
    for(const w of wallList){
      const dx=w.b.x-w.a.x,dy=w.b.y-w.a.y,L=Math.hypot(dx,dy);if(L<0.01)continue;const ux=dx/L,uy=dy/L;
      const hgt=w.h||3,t=w.t||0.15;const ea=H.joined(w.a,w)?t/2:0,eb=H.joined(w.b,w)?t/2:0;
      const mat=w.kind==="ext"?matExt:matInt;const grp=new THREE.Group();grp.userData.h=hgt;
      const piece=(s,e,y0,y1)=>{if(e-s<0.005||y1-y0<0.005)return;const m=box(e-s,y1-y0,t,mat);const mid=(s+e)/2;m.position.set(w.a.x+ux*mid,(y0+y1)/2,w.a.y+uy*mid);m.rotation.y=-Math.atan2(dy,dx);grp.add(m);
        const cap=new THREE.Mesh(new THREE.PlaneGeometry(e-s,t),matCap);cap.rotation.set(-Math.PI/2,0,-Math.atan2(dy,dx));cap.position.set(w.a.x+ux*mid,y1+0.002,w.a.y+uy*mid);if(y1>=hgt-1e-6)grp.add(cap);};
      const cuts=ops.filter(o=>o.wall===w.id).sort((a,b)=>a.pos-b.pos);
      let cur=-ea;
      for(const o of cuts){const s=o.pos-o.w/2,e=o.pos+o.w/2;piece(cur,s,0,hgt);
        if(o.type==="window"){const sill=o.sill||0.9,top=Math.min(hgt,sill+(o.h||1.2));piece(s,e,0,sill);piece(s,e,top,hgt);}
        else{const top=Math.min(hgt,o.h||2.1);piece(s,e,top,hgt);}
        cur=Math.max(cur,e);}
      piece(cur,L+eb,0,hgt);
      walls.add(grp);
    }
    // doors and windows
    for(const o of ops){
      const w=(plan.walls||[]).find(x=>x.id===o.wall);if(!w)continue;
      const dx=w.b.x-w.a.x,dy=w.b.y-w.a.y,L=Math.hypot(dx,dy);const ux=dx/L,uy=dy/L,nx=-uy,ny=ux,t=w.t||0.15,ang=-Math.atan2(dy,dx);
      const cx=w.a.x+ux*o.pos,cy=w.a.y+uy*o.pos;const g=new THREE.Group();
      if(o.type==="window"){const sill=o.sill||0.9,hh=o.h||1.2;const p=box(o.w,hh,0.03,matGlass);p.castShadow=false;p.position.set(cx,sill+hh/2,cy);p.rotation.y=ang;g.add(p);
        const fr=box(o.w,0.05,t,matWhite);fr.position.set(cx,sill+0.025,cy);fr.rotation.y=ang;g.add(fr);}
      else if(o.style==="swing"){const s=o.side||1,hinge=o.hinge?o.pos+o.w/2:o.pos-o.w/2;const hx=w.a.x+ux*hinge+nx*s*t/2,hy=w.a.y+uy*hinge+ny*s*t/2;
        const leaf=box(0.045,Math.min(2.05,(o.h||2.1)-0.03),o.w,matDoor);leaf.position.set(hx+nx*s*o.w/2,leaf.geometry.parameters.height/2,hy+ny*s*o.w/2);leaf.rotation.y=ang;g.add(leaf);}
      else if(o.style==="sliding"){const half=o.w/2+0.04;for(const k of [-1,1]){const lf=box(half,2.05,0.04,matGlass);const off=k*(o.w/4);lf.position.set(cx+ux*off+nx*k*t*0.18,1.025,cy+uy*off+ny*k*t*0.18);lf.rotation.y=ang;g.add(lf);}}
      else if(o.style==="garage"){const p=box(o.w,(o.h||2.4),0.06,matSteel);p.position.set(cx,(o.h||2.4)/2,cy);p.rotation.y=ang;g.add(p);}
      g.userData.kind=o.type;opens.add(g);
    }
    // fixtures as simple proxies
    for(const f of plan.fixtures||[]){
      const dm=FIX[f.kind]||[0.5,0.5],fw=dm[0],fd=dm[1];const g=new THREE.Group();
      const add=(m,x,y,z)=>{m.position.set(x,y,z);g.add(m);return m;};
      switch(f.kind){
        case "wc":add(box(fw,0.75,fd*0.28,matWhite),0,0.375,-fd/2+fd*0.14);{const b=new THREE.Mesh(new THREE.CylinderGeometry(fw*0.42,fw*0.36,0.4,24),matWhite);b.scale.z=1.25;b.castShadow=true;add(b,0,0.2,fd*0.12);}break;
        case "basin":add(box(fw,0.82,fd,matEquip),0,0.41,0);add(box(fw*0.7,0.04,fd*0.6,matWhite),0,0.84,0.02);break;
        case "sink":add(box(fw,0.88,fd,matEquip),0,0.44,0);add(box(fw*0.8,0.03,fd*0.7,matSteel),0,0.895,0);break;
        case "shower":add(box(fw,0.06,fd,matWhite),0,0.03,0);{const gl=box(fw,2.0,0.02,matGlass);gl.castShadow=false;add(gl,0,1.0,fd/2);}break;
        case "tub":add(box(fw,0.55,fd,matWhite),0,0.275,0);break;
        case "washer":case "dryer":case "dw":add(box(fw,0.85,fd,matWhite),0,0.425,0);break;
        case "range":add(box(fw,0.9,fd,matSteel),0,0.45,0);add(box(fw*0.95,0.02,fd*0.9,matDark),0,0.91,0);break;
        case "fridge":add(box(fw,1.8,fd,matSteel),0,0.9,0);break;
        case "wh":{const c=new THREE.Mesh(new THREE.CylinderGeometry(fw/2,fw/2,1.5,24),matWhite);c.castShadow=true;add(c,0,0.75,0);}break;
        case "ahu":add(box(fw,1.3,fd,matEquip),0,0.65,0);break;
        case "acu":add(box(fw,0.8,fd,matSteel),0,0.4,0);{const fan=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.02,24),matDark);add(fan,0,0.81,0);}break;
        case "panel":add(box(fw,0.6,fd,matDark),0,1.5,0);break;
        case "fd":{const c=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.01,16),matSteel);add(c,0,0.005,0);}break;
        default:add(box(fw,0.8,fd,matEquip),0,0.4,0);
      }
      g.position.set(f.x,0,f.y);g.rotation.y=-(f.rot||0)*Math.PI/180;fixes.add(g);
    }
    return {root,floors,walls,opens,fixes,labels};
  }

  function mount(el,plan,opts){
    opts=opts||{};const THREE=window.THREE;if(!THREE||!THREE.OrbitControls)throw new Error("three.js and OrbitControls must be loaded first");
    el.classList.add("ar3d");if(getComputedStyle(el).position==="static")el.style.position="relative";
    const ui=document.createElement("div");ui.className="ar3d-ui";
    ui.innerHTML='<div class="ar3d-card ar3d-info"><div class="ar3d-eb"></div><div class="ar3d-t"></div><div class="ar3d-s"></div></div>'+
      '<div class="ar3d-card ar3d-ctrl" role="group" aria-label="3D view controls"><button data-a="replay">Replay</button><button data-a="plan">Plan</button><button data-a="iso" aria-pressed="true">3D</button><button data-a="cut" aria-pressed="false">Cut at 1.2 m</button><button data-a="fix" aria-pressed="true">Fixtures</button></div>'+
      '<div class="ar3d-hint">Drag to orbit · right-drag to pan · wheel to zoom</div>';
    el.appendChild(ui);
    ui.querySelector(".ar3d-eb").textContent=(plan.project||"Plan");ui.querySelector(".ar3d-t").textContent=(plan.level||"Level 1")+" · 3D model";
    ui.querySelector(".ar3d-s").textContent=opts.summary||"";if(!opts.summary)ui.querySelector(".ar3d-s").remove();
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:!!opts.preserve});
    renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled=true;renderer.outputEncoding=THREE.sRGBEncoding;renderer.setClearColor(0xEFEDE7,1);
    el.insertBefore(renderer.domElement,ui);renderer.domElement.className="ar3d-canvas";
    const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xEFEDE7,80,200);
    const camera=new THREE.PerspectiveCamera(35,1,0.1,500);
    const clipPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),100);
    const model=buildModel(THREE,plan,[clipPlane]);scene.add(model.root);
    // bounds
    const bb=new THREE.Box3().setFromObject(model.floors);if(bb.isEmpty())bb.setFromObject(model.root);
    const ctr=bb.getCenter(new THREE.Vector3()),size=bb.getSize(new THREE.Vector3());const span=Math.max(size.x,size.z,4);const radius=Math.max(3,Math.hypot(size.x,size.z)/2);
    ctr.y=0;
    // ground + lights
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(span*8,span*8),new THREE.MeshStandardMaterial({color:0xE9E6DE,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(ctr.x,-0.09,ctr.z);ground.receiveShadow=true;scene.add(ground);
    scene.add(new THREE.HemisphereLight(0xFFFFFF,0xD8D2C4,0.75));
    const sun=new THREE.DirectionalLight(0xFFF6E8,0.85);sun.position.set(ctr.x-span*0.6,span*1.1,ctr.z-span*0.8);sun.target.position.copy(ctr);scene.add(sun,sun.target);
    sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);const sc=sun.shadow.camera;sc.left=-span;sc.right=span;sc.top=span;sc.bottom=-span;sc.near=1;sc.far=span*4;sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.02;
    const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.copy(ctr);controls.enableDamping=true;controls.dampingFactor=0.08;controls.maxPolarAngle=Math.PI*0.495;controls.minDistance=2;controls.maxDistance=span*5;
    let dist=radius/Math.sin(camera.fov*Math.PI/360)*1.08;
    const posFor=(polar,azim,k)=>{const D=dist*(k||1);return new THREE.Vector3(ctr.x+D*Math.sin(polar)*Math.sin(azim),D*Math.cos(polar),ctr.z+D*Math.sin(polar)*Math.cos(azim));};
    let PLAN=posFor(0.0001,0),ISO=posFor(0.9,-0.55,0.95);
    let anim=null,raf=0,disposed=false;
    const wallGroups=model.walls.children,fixGroups=model.fixes.children,opGroups=model.opens.children;
    function setProgress(k){ // 0 = flat plan, 1 = full 3D
      wallGroups.forEach((g,i)=>{const d=i/Math.max(1,wallGroups.length)*0.45;const p=ease(clamp((k-0.25-d)/0.35,0,1));g.scale.y=Math.max(0.002,p);g.visible=p>0||k<0.25;});
      opGroups.forEach(g=>{const p=clamp((k-0.7)/0.15,0,1);g.visible=p>0;g.scale.y=Math.max(0.002,p);});
      fixGroups.forEach((g,i)=>{const d=i/Math.max(1,fixGroups.length)*0.12;const p=ease(clamp((k-0.8-d)/0.12,0,1));g.visible=p>0;g.position.y=(1-p)*2.5;});
    }
    function fly(to,ms,done){const from=camera.position.clone();const t0=performance.now();anim={step:now=>{const k=clamp((now-t0)/ms,0,1),e=ease(k);camera.position.lerpVectors(from,to,e);camera.lookAt(controls.target);if(k>=1){anim=null;done&&done();}}};}
    function intro(){
      controls.target.copy(ctr);camera.position.copy(PLAN);camera.lookAt(ctr);setProgress(0);
      const reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
      if(reduce||opts.intro===false){setProgress(1);camera.position.copy(ISO);camera.lookAt(ctr);return;}
      const T=4200,t0=performance.now();
      anim={step:now=>{const k=clamp((now-t0)/T,0,1);setProgress(k);const c=ease(clamp((k-0.08)/0.6,0,1));camera.position.lerpVectors(PLAN,ISO,c);camera.lookAt(ctr);if(k>=1)anim=null;}};
    }
    function resize(){const w=el.clientWidth||800,h=el.clientHeight||600;renderer.setSize(w,h,false);renderer.domElement.style.width=w+"px";renderer.domElement.style.height=h+"px";camera.aspect=w/h;camera.updateProjectionMatrix();
      const hf=Math.tan(camera.fov*Math.PI/360),fitV=radius/hf,fitH=radius/(hf*camera.aspect);dist=Math.max(fitV,fitH)*1.05;PLAN=posFor(0.0001,0);ISO=posFor(0.9,-0.55,0.95);}
    const ro=new ResizeObserver(resize);ro.observe(el);resize();
    let paused=false;
    function loop(now){if(disposed||paused)return;raf=requestAnimationFrame(loop);if(anim)anim.step(now);else controls.update();renderer.render(scene,camera);}
    raf=requestAnimationFrame(loop);
    const btn=a=>ui.querySelector(`[data-a="${a}"]`);
    ui.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const a=b.dataset.a;
      if(a==="replay")intro();
      if(a==="plan"){btn("plan").setAttribute("aria-pressed","true");btn("iso").setAttribute("aria-pressed","false");setProgress(1);fly(PLAN,900);}
      if(a==="iso"){btn("iso").setAttribute("aria-pressed","true");btn("plan").setAttribute("aria-pressed","false");setProgress(1);fly(ISO,900);}
      if(a==="cut"){const on=b.getAttribute("aria-pressed")!=="true";b.setAttribute("aria-pressed",String(on));clipPlane.constant=on?1.2:100;}
      if(a==="fix"){const on=b.getAttribute("aria-pressed")!=="true";b.setAttribute("aria-pressed",String(on));model.fixes.visible=on;}
    });
    intro();
    return {
      replay:intro,
      pause:()=>{anim=null;cancelAnimationFrame(raf);raf=0;paused=true;},
      snapshot:()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL("image/png");},
      setProgress:k=>{anim=null;setProgress(k);const c=ease(clamp((k-0.08)/0.6,0,1));camera.position.lerpVectors(PLAN,ISO,c);camera.lookAt(ctr);renderer.render(scene,camera);},
      // scripted shots for video: model build state and camera on a sphere around the plan centre
      setModel:k=>{anim=null;setProgress(k);renderer.render(scene,camera);},
      setView:(polar,azim,distK)=>{anim=null;camera.position.copy(posFor(polar,azim,distK||1));controls.target.copy(ctr);camera.lookAt(ctr);renderer.render(scene,camera);},
      isoAngles:{polar:0.9,azim:-0.55,distK:0.95},
      counts:{walls:wallGroups.length,openings:opGroups.length,fixtures:fixGroups.length,rooms:(plan.rooms||[]).length},
      dispose:()=>{disposed=true;cancelAnimationFrame(raf);ro.disconnect();controls.dispose();renderer.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.map)m.map.dispose();m.dispose();});}});el.innerHTML="";el.classList.remove("ar3d");}
    };
  }
  const CSS=`.ar3d{overflow:hidden;background:#EFEDE7}
.ar3d-canvas{position:absolute;inset:0;display:block;touch-action:none}
.ar3d-ui{position:absolute;inset:0;pointer-events:none;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:#1B1D1A}
.ar3d-card{position:absolute;background:#fff;border:1px solid #DCD9D1;border-radius:10px;box-shadow:0 6px 24px rgba(27,29,26,.08);pointer-events:auto}
.ar3d-info{left:16px;top:16px;padding:10px 14px;max-width:calc(100% - 32px)}
.ar3d-eb{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6B6F68}
.ar3d-t{font-weight:600;font-size:15px;margin-top:2px}
.ar3d-s{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;color:#6B6F68;margin-top:2px}
.ar3d-ctrl{right:16px;bottom:16px;padding:6px;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 32px)}
.ar3d-ctrl button{font:inherit;font-size:12.5px;border:1px solid #DCD9D1;background:#fff;border-radius:6px;padding:5px 11px;cursor:pointer;color:#1B1D1A}
.ar3d-ctrl button[aria-pressed="true"]{background:#1B1D1A;color:#fff;border-color:#1B1D1A}
.ar3d-ctrl button:focus-visible{outline:2px solid #1F5FBF;outline-offset:1px}
.ar3d-hint{position:absolute;left:16px;bottom:18px;font-size:11.5px;color:#6B6F68}
@media (max-width:640px){.ar3d-hint{display:none}}`;
  function injectCss(){if(document.getElementById("ar3d-css"))return;const s=document.createElement("style");s.id="ar3d-css";s.textContent=CSS;document.head.appendChild(s);}
  window.AR3D={mount:(el,plan,o)=>{injectCss();return mount(el,plan,o);},CSS};
})();
