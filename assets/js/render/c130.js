// Procedural C-130J "Fat Albert" in Blue Angels colors. Body frame as hornet.js (feet).
import * as THREE from 'three';
import { densify, loft, surface, mirrorZ, canvasTexture, rng } from './geom.js';
import { BLUE, GOLD } from './hornet.js';

function fuselageTexture() {
  return canvasTexture(2048, 1024, (ctx, w, h) => {
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, w, h);
    const r = rng(5);
    ctx.strokeStyle = 'rgba(4,12,32,0.18)'; ctx.lineWidth = 2;
    for (let i = 0; i < 30; i++) { const x = r() * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    // gold cheat lines along both sides
    ctx.fillStyle = GOLD;
    ctx.fillRect(w * 0.05, h * 0.465, w * 0.8, h * 0.03);
    ctx.fillRect(w * 0.05, h * 0.965, w * 0.8, h * 0.03);
    ctx.fillRect(w * 0.05, h * 0.0, w * 0.8, h * 0.004);
    // cockpit windows
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(w * 0.04, h * 0.33, w * 0.035, h * 0.06);
    ctx.fillRect(w * 0.04, h * 0.11, w * 0.035, h * 0.06);
    // lettering, upright from each side
    const txt = (s, x, y, rot) => {
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(Math.PI);
      ctx.font = '800 64px "Barlow Condensed", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = GOLD; ctx.fillText(s, 0, 0); ctx.restore();
    };
    txt('U.S. MARINES', w * 0.36, h * 0.42, false);
    txt('U.S. MARINES', w * 0.36, h * 0.08, true);
  });
}

function wingTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = BLUE; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, h / 2, w, h / 2);
    ctx.fillStyle = GOLD; ctx.fillRect(0, h * 0.46, w, h * 0.04); ctx.fillRect(0, h * 0.96, w, h * 0.04);
  });
}

function propTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.08, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(20,20,24,0.55)'); g.addColorStop(0.85, 'rgba(20,20,24,0.25)'); g.addColorStop(1, 'rgba(240,180,40,0.0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(240,180,40,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2); ctx.stroke();
  });
}

export function createC130() {
  const root = new THREE.Group();
  root.name = 'fat-albert';
  const paint = (map) => new THREE.MeshPhysicalMaterial({ map, metalness: 0.12, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const fuseMat = paint(fuselageTexture()), wingMat = paint(wingTexture());
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.8 });
  const add = (g, m) => { const o = new THREE.Mesh(g, m); root.add(o); return o; };

  // fuselage: blunt nose, constant section, upswept tail
  add(loft(densify([
    { x: 49, w: 0.3, top: 0.3, bot: 0.3, cy: 1.5, p: 2 },
    { x: 47.6, w: 3.6, top: 3.4, bot: 3.2, cy: 1.2, p: 2 },
    { x: 44.5, w: 5.6, top: 5.5, bot: 5.4, cy: 1.2, p: 2.1 },
    { x: 40, w: 6.6, top: 6.6, bot: 6.4, cy: 1.0, p: 2.3 },
    { x: 32, w: 7.0, top: 6.9, bot: 6.9, cy: 0.8, p: 2.4 },
    { x: 0, w: 7.0, top: 6.9, bot: 6.9, cy: 0.8, p: 2.4 },
    { x: -20, w: 6.8, top: 6.8, bot: 6.4, cy: 1.2, p: 2.4 },
    { x: -30, w: 5.6, top: 5.8, bot: 4.0, cy: 3.4, p: 2.3 },
    { x: -40, w: 3.4, top: 3.8, bot: 1.6, cy: 6.2, p: 2.2 },
    { x: -48.5, w: 0.8, top: 1.2, bot: 0.5, cy: 7.6, p: 2 }
  ], 3), 48, { capTail: true }), fuseMat);

  // gear sponsons
  for (const s of [1, -1]) {
    const sp = new THREE.Mesh(new THREE.CapsuleGeometry(2.0, 14, 6, 16), fuseMat);
    sp.rotation.z = Math.PI / 2; sp.position.set(-2, -4.7, 6.2 * s); root.add(sp);
  }

  // high wing
  const wing = surface({ le: 8, c: 14.5, z: 6.5, y: 7.6 }, { le: 3.2, c: 6.8, z: 66, y: 8.6 }, { t: [0.15, 0.1], nc: 18, ns: 10 });
  add(wing, wingMat); add(mirrorZ(wing), wingMat);
  // tail
  const stab = surface({ le: -37, c: 11, z: 2, y: 7.5 }, { le: -42, c: 5.5, z: 26, y: 7.5 }, { t: [0.1, 0.08], nc: 12, ns: 6 });
  add(stab, wingMat); add(mirrorZ(stab), wingMat);
  const fin = surface({ le: -31, c: 16, z: 0, y: 0 }, { le: -42.5, c: 7, z: 24, y: 0 }, { t: [0.1, 0.08], nc: 14, ns: 8 });
  fin.rotateX(-Math.PI / 2); fin.translate(0, 8.5, 0);
  add(fin, wingMat);

  // four turboprop nacelles + spinning prop discs
  const props = [];
  const propMat = new THREE.MeshBasicMaterial({ map: propTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  for (const z of [17, 35, -17, -35]) {
    const nac = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 13, 6, 16), fuseMat);
    nac.rotation.z = Math.PI / 2; nac.position.set(7, 6.2, z); root.add(nac);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6.75, 40), propMat);
    disc.rotation.y = Math.PI / 2; disc.position.set(15.6, 6.2, z); root.add(disc);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 16), fuseMat);
    spinner.rotation.z = -Math.PI / 2; spinner.position.set(16.6, 6.2, z); root.add(spinner);
    const blades = new THREE.Group();
    for (let b = 0; b < 6; b++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 6.4, 0.7), dark);
      bl.position.y = 3.3; const piv = new THREE.Group(); piv.rotation.x = (b / 6) * Math.PI * 2; piv.add(bl); blades.add(piv);
    }
    blades.position.set(15.5, 6.2, z); root.add(blades);
    props.push(blades);
  }

  // landing gear
  const gear = new THREE.Group();
  const tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const wheel = (x, z, r = 2.0) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.1, 18), tire); t.rotation.x = Math.PI / 2; t.position.set(x, -9.6 + r, z); gear.add(t); };
  for (const s of [1, -1]) { wheel(1, 6.3 * s); wheel(-6, 6.3 * s); }
  wheel(36, 0.7, 1.4); wheel(36, -0.7, 1.4);
  root.add(gear);

  return {
    object: root,
    kind: 'c130',
    length: 98,
    tail: new THREE.Vector3(-48, 7, 0),
    groundOffset: 2.6,  // C-130 reference point sits higher than the jet's on the ground
    update(state, time) {
      gear.visible = !!state.flags?.gear || state.p[1] < 60;
      for (let i = 0; i < props.length; i++) props[i].rotation.x = time * 28 + i;
    }
  };
}
