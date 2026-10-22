// Geometry builders shared by the aircraft models.
import * as THREE from 'three';

const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

// Interpolate a list of cross-section descriptors so the loft has smooth curvature.
export function densify(sections, perSpan = 4) {
  const keys = Object.keys(sections[0]);
  const out = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[Math.max(0, i - 1)], b = sections[i], c = sections[i + 1], d = sections[Math.min(sections.length - 1, i + 2)];
    for (let k = 0; k < perSpan; k++) {
      const t = k / perSpan, s = {};
      for (const key of keys) s[key] = catmull(a[key] ?? b[key], b[key], c[key] ?? b[key], d[key] ?? c[key], t);
      out.push(s);
    }
  }
  out.push({ ...sections[sections.length - 1] });
  return out;
}

// Loft a closed body from superellipse cross-sections ordered nose (+x) to tail (-x).
// Section: { x, w (half width), top, bot (half heights), cy (center y), p (squareness, 2 = ellipse) }
export function loft(sections, radial = 48, o = {}) {
  const pos = [], uv = [], idx = [];
  const x0 = sections[0].x, x1 = sections[sections.length - 1].x;
  const R = radial;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const e = 2 / Math.max(s.p ?? 2, 0.5);
    for (let j = 0; j <= R; j++) {
      const th = (j / R) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const z = Math.max(s.w, 0) * Math.sign(c) * Math.pow(Math.abs(c), e);
      const hy = sn >= 0 ? s.top : s.bot;
      const y = (s.cy ?? 0) + Math.max(hy, 0) * Math.sign(sn) * Math.pow(Math.abs(sn), e);
      pos.push(s.x, y, z);
      uv.push((x0 - s.x) / (x0 - x1), j / R);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + 1, c = a + (R + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (o.capTail) {
    const last = sections[sections.length - 1];
    const ci = pos.length / 3;
    pos.push(last.x, last.cy ?? 0, 0); uv.push(1, 0.5);
    const base = (sections.length - 1) * (R + 1);
    for (let j = 0; j < R; j++) idx.push(base + j, base + j + 1, ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g, (p, n) => n.y * (p.y - (sections[Math.floor(sections.length / 2)].cy ?? 0)) + n.z * p.z);
  g.computeVertexNormals();
  return g;
}

// Make sure triangles face outward. `outward(p, n)` > 0 when normal n at p points out.
export function fixWinding(g, outward) {
  const p = g.attributes.position, idx = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  let score = 0;
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    if (n.lengthSq() < 1e-10) continue;
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    score += Math.sign(outward(m, n.normalize()));
  }
  if (score < 0) flipWinding(g);
}
export function flipWinding(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index.needsUpdate = true;
}
export function mirrorZ(g) {
  const m = g.clone();
  m.scale(1, 1, -1);
  flipWinding(m);
  m.computeVertexNormals();
  return m;
}

// NACA 00xx half-thickness at chord fraction x (thickness ratio t).
const naca = (x, t) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);

// A lifting surface in local coordinates: chord along -x from the leading edge, span along +z.
//   root/tip: { le: x of leading edge, c: chord, z: span station, y: height }
//   t: [root, tip] thickness ratios. UV: u chordwise, v spanwise; upper surface in v 0..0.5,
//   lower surface in v 0.5..1 so liveries can differ (and text reads correctly) per side.
export function surface(root, tip, o = {}) {
  const nc = o.nc ?? 18, ns = o.ns ?? 8;
  const t = o.t ?? [0.06, 0.04];
  const pos = [], uv = [], idx = [];
  const chordPts = [];
  for (let i = 0; i <= nc; i++) chordPts.push((1 - Math.cos((i / nc) * Math.PI)) / 2);
  const row = (side) => {
    const start = pos.length / 3;
    for (let k = 0; k <= ns; k++) {
      const s = k / ns;
      const le = root.le + (tip.le - root.le) * s;
      const c = root.c + (tip.c - root.c) * s;
      const z = root.z + (tip.z - root.z) * s;
      const y0 = (root.y ?? 0) + ((tip.y ?? 0) - (root.y ?? 0)) * s;
      const th = t[0] + (t[1] - t[0]) * s;
      for (const xc of chordPts) {
        const half = Math.max(naca(xc, th) * c, 0.012);
        pos.push(le - xc * c, y0 + side * half, z);
        uv.push(xc, side > 0 ? s * 0.5 : 0.5 + s * 0.5);
      }
    }
    return start;
  };
  const up = row(1), lo = row(-1);
  const W = nc + 1;
  for (let k = 0; k < ns; k++) for (let i = 0; i < nc; i++) {
    const a = k * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(up + a, up + b, up + c, up + b, up + d, up + c);
    idx.push(lo + a, lo + c, lo + b, lo + b, lo + c, lo + d);
  }
  // tip cap
  const tipRow = ns * W;
  for (let i = 0; i < nc; i++) idx.push(up + tipRow + i, lo + tipRow + i, up + tipRow + i + 1, up + tipRow + i + 1, lo + tipRow + i, lo + tipRow + i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const midY = ((root.y ?? 0) + (tip.y ?? 0)) / 2;
  fixWinding(g, (p, n) => n.y * (p.y - midY));
  g.computeVertexNormals();
  return g;
}

export function canvasTexture(w, h, draw, o = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = o.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.flipY = false;               // canvas y grows with texture v
  tex.anisotropy = o.anisotropy ?? 8;
  if (o.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(o.repeat[0], o.repeat[1]); }
  tex.needsUpdate = true;
  return tex;
}

// Deterministic pseudo-random generator.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
}
