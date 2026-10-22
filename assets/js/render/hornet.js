// Procedural F/A-18E Super Hornet in Blue Angels colors.
// Body frame: +x nose, +y canopy, +z right wing. Units: feet. Origin near the CG.
import * as THREE from 'three';
import { densify, loft, surface, mirrorZ, canvasTexture, rng } from './geom.js';

export const BLUE = '#0c2a66';
export const GOLD = '#f0b429';
const BLUE_DARK = '#081d49';

// ---------- livery textures ----------
function panelLines(ctx, w, h, seed, alpha = 0.16) {
  const r = rng(seed);
  ctx.save();
  ctx.strokeStyle = `rgba(4, 12, 32, ${alpha})`;
  ctx.lineWidth = Math.max(1, w / 1400);
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (r() - 0.5) * 30, h); ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, ww = 30 + r() * 160, hh = 20 + r() * 90;
    ctx.strokeRect(x, y, ww, hh);
  }
  ctx.fillStyle = `rgba(4, 12, 32, ${alpha * 0.9})`;
  for (let i = 0; i < 220; i++) ctx.fillRect(r() * w, r() * h, 2, 2);   // fasteners
  ctx.restore();
}

function text(ctx, str, x, y, size, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
  ctx.font = `800 ${size}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (o.stroke) { ctx.lineWidth = size * 0.08; ctx.strokeStyle = o.stroke; ctx.strokeText(str, 0, 0); }
  ctx.fillStyle = o.color ?? GOLD;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

// Orientation of painted text on each surface is set per side (see SIDES); verified in renders.
export const SIDES = {
  fuseLeft: {}, fuseRight: { rot: Math.PI },
  belly: {}, wingR: {}, wingL: { flipX: true }
};

function script(ctx, str, x, y, size, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
  ctx.font = `italic 700 ${size}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = GOLD; ctx.fillText(str, 0, 0);
  ctx.restore();
}

function crest(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BLUE_DARK; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x + r * 0.45, y + r * 0.4); ctx.lineTo(x - r * 0.45, y + r * 0.4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

let FUSE_TEX = null;
const WING_TEX = {};
// Fuselage UV: u = 0 nose .. 1 tail; v = 0 right waterline, .25 top, .5 left waterline, .75 belly.
function fuselageTexture() {
  if (FUSE_TEX) return FUSE_TEX;
  FUSE_TEX = canvasTexture(2048, 1024, (ctx, w, h) => {
    const U = (u) => u * w, Vv = (v) => v * h;
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.02)'); g.addColorStop(0.25, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    panelLines(ctx, w, h, 11);
    ctx.fillStyle = GOLD;
    // dorsal spine: a point behind the radome, broadening aft between the tails
    ctx.beginPath();
    ctx.moveTo(U(0.07), Vv(0.25));
    ctx.bezierCurveTo(U(0.25), Vv(0.25 - 0.03), U(0.45), Vv(0.25 - 0.05), U(0.62), Vv(0.25 - 0.06));
    ctx.lineTo(U(0.97), Vv(0.25 - 0.045));
    ctx.lineTo(U(0.97), Vv(0.25 + 0.045));
    ctx.lineTo(U(0.62), Vv(0.25 + 0.06));
    ctx.bezierCurveTo(U(0.45), Vv(0.25 + 0.05), U(0.25), Vv(0.25 + 0.03), U(0.07), Vv(0.25));
    ctx.fill();
    // pinstripe from the cockpit back along the upper sides toward the tails
    const pin = (v) => { ctx.fillRect(U(0.12), Vv(v) - 3, U(0.7), 6); };
    pin(0.36); pin(0.14);
    // belly centerline arrow pointing forward
    ctx.fillRect(U(0.2), Vv(0.75) - 5, U(0.62), 10);
    ctx.beginPath(); ctx.moveTo(U(0.13), Vv(0.75)); ctx.lineTo(U(0.21), Vv(0.715)); ctx.lineTo(U(0.21), Vv(0.785)); ctx.closePath(); ctx.fill();
    // big "U.S. NAVY" on the aft fuselage sides, "Blue Angels" script mid-fuselage, crest by the cockpit
    const navy = (v, o) => {
      ctx.save(); ctx.translate(U(0.75), Vv(v)); if (o.rot) ctx.rotate(o.rot);
      ctx.font = '800 112px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('U.S. NAVY', 0, 0, U(0.26));
      ctx.fillRect(-U(0.13), -70, U(0.26), 9);   // gold bar above the lettering
      ctx.restore();
    };
    navy(0.565, SIDES.fuseLeft); navy(0.935, SIDES.fuseRight);
    script(ctx, 'Blue Angels', U(0.45), Vv(0.555), 54, SIDES.fuseLeft);
    script(ctx, 'Blue Angels', U(0.45), Vv(0.945), 54, SIDES.fuseRight);
    crest(ctx, U(0.2), Vv(0.53), 30); crest(ctx, U(0.2), Vv(0.97), 30);
    // radome, exhaust section
    ctx.fillStyle = 'rgba(5,15,40,0.35)'; ctx.fillRect(0, 0, U(0.025), h);
    const ex = ctx.createLinearGradient(U(0.93), 0, U(1), 0);
    ex.addColorStop(0, 'rgba(60,66,80,0)'); ex.addColorStop(0.4, '#3c4250'); ex.addColorStop(1, '#5f6570');
    ctx.fillStyle = ex; ctx.fillRect(U(0.93), Vv(0.55), U(0.07), Vv(0.4));
  });
  return FUSE_TEX;
}

// Lifting-surface UV: u = chord (0 leading edge), v 0..0.5 upper root->tip, 0.5..1 lower root->tip.
function wingTexture(kind) {
  if (WING_TEX[kind]) return WING_TEX[kind];
  WING_TEX[kind] = canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, h / 2, w, h / 2);
    panelLines(ctx, w, h, 23, 0.13);
    if (kind === 'lex') return;
    ctx.fillStyle = GOLD;
    const tip = kind === 'stab' ? 0.075 : 0.05;
    ctx.fillRect(0, h * (0.5 - tip), w, h * tip); ctx.fillRect(0, h * (1 - tip), w, h * tip);
    if (kind === 'wingR' || kind === 'wingL') {
      // "U.S. NAVY" across the lower surface, running along the span
      const o = SIDES[kind];
      ctx.save();
      ctx.translate(w * 0.5, h * 0.735);
      ctx.rotate(Math.PI / 2);
      ctx.scale(o.flipX ? -1 : 1, 1);
      ctx.font = '800 300px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('U.S. NAVY', 0, 0, h * 0.4);
      ctx.restore();
    }
  });
  return WING_TEX[kind];
}

function tailTexture(num, side) {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, w, h);
    panelLines(ctx, w, h, 31 + num, 0.12);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, h * 0.44, w, h * 0.06); ctx.fillRect(0, h * 0.94, w, h * 0.06);   // tip caps
    ctx.fillRect(w * 0.2, h * 0.5 + h * 0.36, w * 0.55, h * 0.012);                   // pinstripe under the cap
    // small tail number on the outboard (lower-half) surface
    const o = { flipY: true };   // reads correctly on the outboard face of both fins
    text(ctx, String(num), w * 0.45, h * 0.72, 330, { ...o, color: GOLD });
  });
}

// ---------- shared geometry (built once) ----------
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const fuse = densify([
    { x: 30.2, w: 0.04, top: 0.04, bot: 0.04, cy: -0.4, p: 2 },
    { x: 29.4, w: 0.55, top: 0.55, bot: 0.5, cy: -0.36, p: 2 },
    { x: 27.8, w: 1.05, top: 1.0, bot: 0.95, cy: -0.3, p: 2 },
    { x: 25.5, w: 1.5, top: 1.4, bot: 1.35, cy: -0.2, p: 2.1 },
    { x: 22.5, w: 1.85, top: 1.7, bot: 1.7, cy: -0.05, p: 2.4 },
    { x: 19.5, w: 2.1, top: 1.82, bot: 1.92, cy: 0.05, p: 2.7 },
    { x: 16, w: 2.25, top: 1.88, bot: 2.08, cy: 0.1, p: 2.9 },
    { x: 12, w: 2.35, top: 1.86, bot: 2.25, cy: 0.15, p: 3 },
    { x: 8, w: 2.65, top: 1.8, bot: 2.35, cy: 0.2, p: 3.1 },
    { x: 4, w: 3.35, top: 1.75, bot: 2.3, cy: 0.25, p: 3.2 },
    { x: 0, w: 3.95, top: 1.75, bot: 2.2, cy: 0.3, p: 3.3 },
    { x: -5, w: 4.15, top: 1.8, bot: 2.1, cy: 0.35, p: 3.3 },
    { x: -11, w: 4.05, top: 1.75, bot: 2.0, cy: 0.35, p: 3.1 },
    { x: -17, w: 3.75, top: 1.6, bot: 1.85, cy: 0.3, p: 2.9 },
    { x: -22, w: 3.35, top: 1.4, bot: 1.65, cy: 0.2, p: 2.7 },
    { x: -26, w: 3.0, top: 1.2, bot: 1.42, cy: 0.05, p: 2.6 },
    { x: -27.6, w: 2.85, top: 1.1, bot: 1.32, cy: 0.0, p: 2.6 }
  ], 4);
  const body = loft(fuse, 56, { capTail: true });

  // intakes (one side; mirrored)
  const intake = loft(densify([
    { x: 7.6, w: 1.0, top: 1.15, bot: 1.25, cy: -0.95, p: 7 },
    { x: 5.5, w: 1.05, top: 1.2, bot: 1.3, cy: -0.95, p: 6 },
    { x: 1, w: 1.0, top: 1.15, bot: 1.25, cy: -0.9, p: 5 },
    { x: -5, w: 0.8, top: 0.9, bot: 1.0, cy: -0.6, p: 4 },
    { x: -9, w: 0.3, top: 0.4, bot: 0.5, cy: -0.4, p: 3 }
  ], 3), 28);
  intake.translate(0, 0, 3.05);

  const lex = surface({ le: 18.5, c: 18.5, z: 1.7, y: 0.55 }, { le: 4.6, c: 4.4, z: 4.3, y: 0.5 }, { t: [0.025, 0.03], nc: 10, ns: 6 });
  const wing = surface({ le: 4.2, c: 15.6, z: 4.0, y: 0.45 }, { le: -2.9, c: 6.6, z: 22.4, y: -0.45 }, { t: [0.055, 0.035], nc: 22, ns: 10 });
  const stab = surface({ le: -19.8, c: 9.4, z: 2.6, y: -0.15 }, { le: -25.2, c: 4.8, z: 11.0, y: -0.6 }, { t: [0.045, 0.035], nc: 14, ns: 6 });
  const fin = surface({ le: -11.8, c: 11.4, z: 0, y: 0 }, { le: -20.2, c: 4.9, z: 9.3, y: 0 }, { t: [0.05, 0.035], nc: 16, ns: 8 });
  fin.rotateX(-70 * Math.PI / 180);
  fin.translate(0, 1.35, 2.2);

  const canopy = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(5.6, 1.5, 1.28);
  canopy.translate(16.4, 1.78, 0);

  // nozzle, burner flame
  const nozzle = new THREE.CylinderGeometry(1.12, 1.3, 3.2, 28, 1, true);
  nozzle.rotateZ(Math.PI / 2);
  const flame = new THREE.CylinderGeometry(0.12, 1.02, 1, 20, 1, true);
  flame.rotateZ(Math.PI / 2);
  flame.translate(-0.5, 0, 0);   // front of the flame at x = 0, extends to x = -1 (scaled later)

  GEO = {
    body, intakeR: intake, intakeL: mirrorZ(intake),
    lexR: lex, lexL: mirrorZ(lex), wingR: wing, wingL: mirrorZ(wing),
    stabR: stab, stabL: mirrorZ(stab), finR: fin, finL: mirrorZ(fin),
    canopy, nozzle, flame
  };
  return GEO;
}

function flameTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    // v = 0 at the nozzle, v = 1 at the aft tip
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,250,240,1)');
    g.addColorStop(0.15, 'rgba(255,214,150,0.95)');
    g.addColorStop(0.45, 'rgba(255,120,60,0.55)');
    g.addColorStop(0.8, 'rgba(200,60,120,0.18)');
    g.addColorStop(1, 'rgba(120,40,160,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {           // shock diamonds
      const y = h * (0.12 + i * 0.14);
      const r = ctx.createRadialGradient(w / 2, y, 0, w / 2, y, h * 0.06);
      r.addColorStop(0, `rgba(255,240,220,${0.5 - i * 0.08})`); r.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = r; ctx.fillRect(0, y - h * 0.07, w, h * 0.14);
    }
  });
}

function vaporTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = rng(7);
    ctx.fillStyle = 'rgba(255,255,255,0)'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h, rad = 6 + r() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(255,255,255,${0.12 + r() * 0.2})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // fade toward the aft edge of the cone
    ctx.globalCompositeOperation = 'destination-in';
    const f = ctx.createLinearGradient(0, 0, 0, h);
    f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.3, 'rgba(0,0,0,1)'); f.addColorStop(0.75, 'rgba(0,0,0,0.8)'); f.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = f; ctx.fillRect(0, 0, w, h);
  });
}

let SHARED_MATS = null;
function sharedMaterials() {
  if (SHARED_MATS) return SHARED_MATS;
  const paint = (map) => new THREE.MeshPhysicalMaterial({ map, metalness: 0.12, roughness: 0.56, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.7 });
  SHARED_MATS = {
    fuse: paint(fuselageTexture()),
    wingR: paint(wingTexture('wingR')),
    wingL: paint(wingTexture('wingL')),
    stab: paint(wingTexture('stab')),
    lex: paint(wingTexture('lex')),
    railGold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.4, roughness: 0.4 }),
    intake: paint(wingTexture('lex')),
    canopy: new THREE.MeshPhysicalMaterial({ color: 0x1b2433, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.72, clearcoat: 1, envMapIntensity: 1.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4c525c, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0.0 }),
    gear: new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.4, roughness: 0.45 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 }),
    flame: new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    vapor: new THREE.MeshBasicMaterial({ map: vaporTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 })
  };
  return SHARED_MATS;
}

function cyl(r1, r2, len, mat, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  return new THREE.Mesh(g, mat);
}

// ---------- the aircraft ----------
export function createHornet(num = 1) {
  const G = geometry(), M = sharedMaterials();
  const root = new THREE.Group();
  root.name = `hornet-${num}`;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); root.add(m); return m; };

  add(G.body, M.fuse);
  add(G.intakeR, M.intake); add(G.intakeL, M.intake);
  add(G.lexR, M.lex); add(G.lexL, M.lex);
  add(G.wingR, M.wingR); add(G.wingL, M.wingL);
  add(G.stabR, M.stab); add(G.stabL, M.stab);
  // gold wingtip rails
  for (const s of [1, -1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 9.5, 10), M.railGold);
    rail.rotation.z = Math.PI / 2; rail.position.set(-5.4, -0.5, 22.55 * s); root.add(rail);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 10), M.railGold);
    nose.rotation.z = -Math.PI / 2; nose.position.set(-0.05, -0.5, 22.55 * s); root.add(nose);
  }
  const tailR = new THREE.MeshPhysicalMaterial({ map: tailTexture(num, 1), metalness: 0.12, roughness: 0.56, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.7 });
  const tailL = new THREE.MeshPhysicalMaterial({ map: tailTexture(num, -1), metalness: 0.12, roughness: 0.56, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.7 });
  add(G.finR, tailR); add(G.finL, tailL);

  // intake mouths
  for (const s of [1, -1]) {
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.0), M.dark);
    mouth.rotation.y = Math.PI / 2;
    mouth.position.set(7.62, -0.95, 3.05 * s);
    root.add(mouth);
  }

  // cockpit
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), M.helmet);
  helmet.position.set(16.6, 2.6, 0); root.add(helmet);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.3), M.dark);
  seat.position.set(15.9, 1.9, 0); root.add(seat);
  const canopy = add(G.canopy, M.canopy);
  canopy.renderOrder = 2;

  // engines
  const glows = [];
  const flames = [];
  for (const s of [1, -1]) {
    const nz = new THREE.Mesh(G.nozzle, M.metal);
    nz.position.set(-28.9, -0.05, 1.45 * s); root.add(nz);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), M.glow.clone());
    disc.rotation.y = -Math.PI / 2; disc.position.set(-28.2, -0.05, 1.45 * s); root.add(disc);
    glows.push(disc);
    const f = new THREE.Mesh(G.flame, M.flame.clone());
    f.position.set(-30.4, -0.05, 1.45 * s); f.visible = false; root.add(f);
    flames.push(f);
  }

  // landing gear + hook
  const gear = new THREE.Group();
  const strut = (x, z, len, tilt = 0) => {
    const c = cyl(0.22, 0.22, len, M.gear, 10);
    c.position.set(x, -1.8 - len / 2, z); c.rotation.x = tilt; gear.add(c);
  };
  const wheel = (x, y, z, r, w) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), M.tire);
    t.rotation.x = Math.PI / 2; t.position.set(x, y, z); gear.add(t);
  };
  strut(18.2, 0, 4.3);
  wheel(18.2, -6.22, 0.42, 0.78, 0.5); wheel(18.2, -6.22, -0.42, 0.78, 0.5);
  for (const s of [1, -1]) { strut(-4.6, 4.6 * s, 4.0, -0.18 * s); wheel(-4.6, -5.75, 5.1 * s, 1.25, 0.75); }
  const doorMat = M.fuse;
  for (const s of [1, -1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.12), doorMat);
    door.position.set(-4.2, -2.9, 3.4 * s); gear.add(door);
  }
  root.add(gear);
  const hook = cyl(0.16, 0.16, 7, M.gear, 8);
  hook.rotation.z = -1.2; hook.position.set(-25.5, -2.6, 0); root.add(hook);

  // vapor effects
  const vaporCone = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 7.5, 9, 40, 1, true), M.vapor.clone());
  vaporCone.rotation.z = Math.PI / 2;  // wide end aft
  vaporCone.position.set(2.5, 0.2, 0); vaporCone.visible = false; root.add(vaporCone);
  const lexVapor = [];
  for (const s of [1, -1]) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.25, 26, 16, 1, true), M.vapor.clone());
    v.rotation.z = Math.PI / 2; v.position.set(-1, 1.4, 2.8 * s); v.visible = false; root.add(v);
    lexVapor.push(v);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  let flick = 0;
  return {
    object: root,
    kind: 'hornet',
    length: 60,
    tail: new THREE.Vector3(-31, -0.3, 0),   // smoke source in body coordinates
    update(state, time) {
      const f = state.flags || {};
      gear.visible = !!f.gear;
      hook.visible = !!f.hook;
      const ab = !!f.ab;
      flick = 0.85 + 0.15 * Math.sin(time * 61) * Math.sin(time * 23.7);
      for (const fl of flames) {
        fl.visible = ab;
        if (ab) { fl.scale.set(12 * flick, 1 + 0.06 * Math.sin(time * 40), 1 + 0.06 * Math.cos(time * 37)); fl.material.opacity = 0.85 * flick; }
      }
      for (const g of glows) g.material.opacity = ab ? 0.95 : 0.25;
      const kts = state.v / 1.6878;
      const vc = THREE.MathUtils.clamp((kts - 555) / 40, 0, 1);
      vaporCone.visible = vc > 0.01;
      vaporCone.material.opacity = vc * (0.55 + 0.15 * Math.sin(time * 13));
      const lv = THREE.MathUtils.clamp(((state.nz ?? 1) - 4.6) / 2, 0, 1) * THREE.MathUtils.clamp((kts - 200) / 80, 0, 1);
      for (const v of lexVapor) { v.visible = lv > 0.02; v.material.opacity = lv * 0.55; }
    }
  };
}
