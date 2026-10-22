// Airshow spectators: Blender-built figures (assets/models/spectators.bin, see
// .claude/tools/blender/spectators.py) drawn as instanced meshes, each instance with its own
// clothing, skin, hair, shoes and cap. Near the crowd camera the detailed models are used.
import * as THREE from 'three';
import { rng } from './geom.js';

const PART = { skin: 0, shirt: 1, forearm: 2, thigh: 3, shin: 4, shoes: 5, hair: 6, cap: 7, prop: 8, gold: 9, black: 10 };

async function loadFigures(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const hlen = new DataView(buf).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  const base = 4 + hlen;
  const out = {};
  for (const v of head.variants) {
    let o = base + v.offset;
    const pos = new Float32Array(buf.slice(o, o + v.verts * 12)); o += v.verts * 12;
    const nor = new Float32Array(buf.slice(o, o + v.verts * 12)); o += v.verts * 12;
    const part = new Uint8Array(buf.slice(o, o + v.verts)); o += v.verts;
    o += (4 - (v.verts % 4)) % 4;
    const idx = new Uint32Array(buf.slice(o, o + v.indices * 4));
    const g = new THREE.BufferGeometry();
    // Blender Z-up -> three Y-up: (x, y, z) -> (x, z, -y); figures then face -z (the show line)
    const p2 = new Float32Array(pos.length), n2 = new Float32Array(nor.length);
    for (let i = 0; i < pos.length; i += 3) {
      p2[i] = pos[i]; p2[i + 1] = pos[i + 2]; p2[i + 2] = -pos[i + 1];
      n2[i] = nor[i]; n2[i + 1] = nor[i + 2]; n2[i + 2] = -nor[i + 1];
    }
    g.setAttribute('position', new THREE.BufferAttribute(p2, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n2, 3));
    g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(part), 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    (out[v.name] ||= [])[v.lod] = g;
  }
  return out;
}

// One material for every figure: colors come from per-instance attributes chosen by vertex part.
function figureMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float part;
        attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iSkin; attribute vec3 iHair;
        attribute vec3 iCap; attribute vec3 iShoe; attribute vec3 iFlags;   // shortSleeves, shorts, hasCap
        varying vec3 vFig;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int pp = int(part + 0.5);
        if (pp == 0) vFig = iSkin;
        else if (pp == 1) vFig = iShirt;
        else if (pp == 2) vFig = iFlags.x > 0.5 ? iSkin : iShirt;
        else if (pp == 3) vFig = iPants;
        else if (pp == 4) vFig = iFlags.y > 0.5 ? iSkin : iPants;
        else if (pp == 5) vFig = iShoe;
        else if (pp == 6) vFig = iHair;
        else if (pp == 7) { vFig = iCap; if (iFlags.z < 0.5) transformed = vec3(0.0, 4.9, 0.0); }
        else if (pp == 9) vFig = vec3(0.871, 0.456, 0.022);   // Blue Angels gold (linear)
        else if (pp == 10) vFig = vec3(0.012);
        else vFig = iCap * 0.6 + vec3(0.12);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFig;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vFig;');
  };
  return m;
}

const SHIRTS = [0xffffff, 0xf2f2f2, 0x1d3f8f, 0x0b2a66, 0xd9343b, 0xf2c230, 0x2e7d4f, 0x1a1a1a, 0x7fa7d9, 0xe9824b,
  0x8d5aa8, 0xbfbfbf, 0x5b6b3a, 0x9c2b2b, 0x47a3c8, 0xffc72c, 0xff8fa3, 0x6e4b3a];
const PANTS = [0x2b3a55, 0x1f2a44, 0x3b4f7a, 0x2f2f2f, 0xc8b28a, 0x6b6f5a, 0x8a8f99, 0x4a3b2c, 0x9fb0c8];
const SKIN = [0xf1d0b5, 0xe2b48f, 0xc68d65, 0xa8714c, 0x8d5a3b, 0x6b4129, 0xf7dcc6, 0xd9a47e];
const HAIR = [0x1c1410, 0x2e1f16, 0x4a3221, 0x6b4a2e, 0x9a7650, 0xc9a66b, 0x8c8c8c, 0xd8d0c4, 0x2a2a2a];
const CAPS = [0x0b2a66, 0xffc72c, 0xd9343b, 0x1a1a1a, 0xffffff, 0x2e7d4f, 0x1d3f8f, 0xc8b28a];
const SHOES = [0xf2f2f2, 0x1a1a1a, 0x5a4636, 0x8a8f99, 0x2b3a55];

// Weighted poses (sitting people come with their camp chair; kids stay near adults).
const POSES = [['stand', 30], ['hips', 11], ['shade', 12], ['point', 6], ['phone', 13], ['sit', 16], ['kid', 8], ['kidpoint', 4]];

export function buildCrowd(scene, o) {
  const group = new THREE.Group();
  group.name = 'crowd-people';
  scene.add(group);
  const ready = loadFigures(o.url).then((figs) => {
    const r = rng(2026);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const totalW = POSES.reduce((s, p) => s + p[1], 0);
    const pickPose = () => { let x = r() * totalW; for (const [n, w] of POSES) { if ((x -= w) <= 0) return n; } return 'stand'; };
    const people = [];
    // Spectators gather in small groups, packed along the crowd line and thinning toward the tents.
    const CZ = o.crowdZ, cam = o.camera;
    let guard = 0;
    while (people.length < o.count && guard++ < o.count * 10) {
      const gx = (r() - 0.5) * o.width;
      const depth = Math.pow(r(), 1.8) * o.depth;            // denser near the front
      const gz = CZ + 14 + depth;
      const n = 1 + Math.floor(r() * 5);
      const yawG = (r() - 0.5) * 0.5;
      for (let k = 0; k < n && people.length < o.count; k++) {
        const x = gx + (r() - 0.5) * 9, z = gz + (r() - 0.5) * 7;
        if (Math.abs(x - cam.x) < 28 && z < cam.z + 70) continue;   // the announcer's stand
        let pose = pickPose();
        if (pose === 'sit' && depth > o.depth * 0.6) pose = 'stand';   // chairs stay in the front rows
        const yaw = yawG + (r() - 0.5) * 0.7 + (r() < 0.06 ? Math.PI * (r() - 0.5) : 0);
        people.push({ x, z, yaw, pose, s: 0.9 + r() * 0.2 });
      }
    }
    // detailed models for the spectators closest to the crowd camera
    const d2 = (p) => (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
    const near = new Set(people.slice().sort((a, b) => d2(a) - d2(b)).slice(0, o.nearCount));

    const mat = figureMaterial();
    const buckets = {};
    for (const p of people) (buckets[`${p.pose}|${near.has(p) ? 0 : 1}`] ||= []).push(p);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (const [key, list] of Object.entries(buckets)) {
      const [pose, lod] = key.split('|');
      const geo = figs[pose][Number(lod)].clone();
      const n = list.length;
      const attrs = {};
      for (const a of ['iShirt', 'iPants', 'iSkin', 'iHair', 'iCap', 'iShoe', 'iFlags']) attrs[a] = new Float32Array(n * 3);
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      list.forEach((p, i) => {
        m4.compose(p3.set(p.x, 0, p.z), q.setFromAxisAngle(up, p.yaw), s3.set(p.s, p.s * (0.95 + r() * 0.1), p.s));
        mesh.setMatrixAt(i, m4);
        const put = (a, hex) => { col.setHex(hex); attrs[a].set([col.r, col.g, col.b], i * 3); };
        put('iShirt', pick(SHIRTS)); put('iPants', pick(PANTS)); put('iSkin', pick(SKIN)); put('iHair', pick(HAIR));
        put('iCap', pick(CAPS)); put('iShoe', pick(SHOES));
        attrs.iFlags.set([r() < 0.7 ? 1 : 0, r() < 0.4 ? 1 : 0, r() < 0.45 ? 1 : 0], i * 3);
      });
      for (const [a, arr] of Object.entries(attrs)) geo.setAttribute(a, new THREE.InstancedBufferAttribute(arr, 3));
      mesh.computeBoundingSphere();
      mesh.userData.full = n;
      group.add(mesh);
    }

    // the narrator, on the ramp in front of the crowd and facing it, microphone up
    if (o.narrator) {
      const nm = new THREE.InstancedMesh(figs.narrator[0].clone(), mat, 1);
      nm.setMatrixAt(0, m4.compose(p3.set(o.narrator.x, 0, o.narrator.z), q.setFromAxisAngle(up, Math.PI + 0.25), s3.set(1.02, 1.02, 1.02)));
      const one = (hex) => { col.setHex(hex); return new THREE.InstancedBufferAttribute(new Float32Array([col.r, col.g, col.b]), 3); };
      const g = nm.geometry;
      g.setAttribute('iShirt', one(0x2a5fc4)); g.setAttribute('iPants', one(0x2a5fc4));     // royal blue flight suit
      g.setAttribute('iSkin', one(0xd9a47e)); g.setAttribute('iHair', one(0x3a2a1e));
      g.setAttribute('iCap', one(0xc2ad82)); g.setAttribute('iShoe', one(0x111111));       // khaki garrison cap, black boots
      g.setAttribute('iFlags', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 1]), 3));
      nm.computeBoundingSphere();
      nm.name = 'narrator';
      group.add(nm);
    }

    // airshow clutter in the front rows: umbrellas, coolers and blankets
    const umb = new THREE.Group();
    const canopy = new THREE.ConeGeometry(3.6, 1.3, 8); canopy.translate(0, 7.2, 0);
    const pole = new THREE.CylinderGeometry(0.06, 0.06, 7, 5); pole.translate(0, 3.5, 0);
    const nU = 140;
    const cMesh = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({ roughness: 0.7 }), nU);
    const pMesh = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0xdddddd }), nU);
    const ucol = [0xd9343b, 0x1d3f8f, 0xffc72c, 0xffffff, 0x2e7d4f, 0xe9824b, 0x0b2a66];
    for (let i = 0; i < nU; i++) {
      const x = (r() - 0.5) * o.width, z = CZ + 20 + Math.pow(r(), 1.4) * o.depth * 0.7;
      m4.compose(p3.set(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(r() - 0.5, 4, r() - 0.5).normalize(), 0.12), s3.set(1, 1, 1));
      cMesh.setMatrixAt(i, m4); pMesh.setMatrixAt(i, m4);
      cMesh.setColorAt(i, col.setHex(pick(ucol)));
    }
    umb.add(cMesh, pMesh);
    const nC = 160;
    const cooler = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.3, 1.2).translate(0, 0.65, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), nC);
    const blanket = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 5).rotateX(-Math.PI / 2).translate(0, 0.12, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), nC);
    for (let i = 0; i < nC; i++) {
      const x = (r() - 0.5) * o.width, z = CZ + 18 + Math.pow(r(), 1.5) * o.depth * 0.8;
      m4.compose(p3.set(x, 0, z), q.setFromAxisAngle(up, r() * 6), s3.set(1, 1, 1));
      cooler.setMatrixAt(i, m4); cooler.setColorAt(i, col.setHex(pick([0x1d6fd1, 0xd9343b, 0xffffff, 0x2e7d4f, 0xf2c230])));
      m4.compose(p3.set(x + 4, 0, z + 2), q.setFromAxisAngle(up, r() * 6), s3.set(1, 1, 1));
      blanket.setMatrixAt(i, m4); blanket.setColorAt(i, col.setHex(pick([0xb03a2e, 0x2e4a7d, 0xe0c068, 0x6c8e3c, 0xd77a2f, 0x7a4fa0])));
    }
    group.add(umb, cooler, blanket);
    return { count: people.length };
  });
  // performance mode shows about a third of the spectators (instances are in random order)
  let level = 'high';
  const apply = () => {
    for (const m of group.children) if (m.isInstancedMesh && m.userData.full) m.count = level === 'low' ? Math.max(1, Math.round(m.userData.full * 0.3)) : m.userData.full;
  };
  ready.then(apply);
  return { group, ready, setDetail(l) { level = l; apply(); } };
}
