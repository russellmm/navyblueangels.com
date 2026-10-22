// Show-site environment: atmosphere, airfield, crowd, clouds, aerobatic box overlay.
// World frame matches the sim: +x crowd right, +y up, +z toward the crowd, CP at the origin.
import * as THREE from 'three';
import { canvasTexture, rng } from './geom.js';
import { buildCrowd } from './crowd.js';

const NM = 6076.12;
export const CROWD_Z = 1500;

function groundTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const r = rng(42);
    ctx.fillStyle = '#8f9478'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {      // soft mottling
      ctx.fillStyle = `rgba(${110 + r() * 40},${115 + r() * 35},${85 + r() * 30},0.18)`;
      ctx.beginPath(); ctx.arc(r() * w, r() * h, 30 + r() * 140, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 9000; i++) {     // grain
      const g = 60 + Math.floor(r() * 70);
      ctx.fillStyle = `rgba(${g - 20},${g + 10},${g - 30},0.25)`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
  }, { repeat: [60, 60] });
}

// Farmland patchwork seen from altitude: fields, tree lines and section roads (one tile ~ 9,000 ft).
function macroTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const r = rng(1234);
    ctx.fillStyle = '#7d8a5c'; ctx.fillRect(0, 0, w, h);
    const tones = ['#6f8a4a', '#86955c', '#9a9a68', '#5f7a40', '#a49b6c', '#7b9150', '#8c8a5a', '#69803f', '#b0a578'];
    const cell = 128;
    for (let gy = 0; gy < h; gy += cell) for (let gx = 0; gx < w; gx += cell) {
      // split each section into 2-4 fields
      const vertical = r() < 0.5, n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = tones[Math.floor(r() * tones.length)];
        if (vertical) ctx.fillRect(gx + (k * cell) / n, gy, cell / n, cell);
        else ctx.fillRect(gx, gy + (k * cell) / n, cell, cell / n);
      }
    }
    // woodlots
    for (let i = 0; i < 40; i++) {
      const cx = r() * w, cy = r() * h, rr = 8 + r() * 26;
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(${70 + r() * 20},${92 + r() * 18},${52 + r() * 12},0.55)`;
        ctx.beginPath(); ctx.arc(cx + (r() - 0.5) * rr * 2, cy + (r() - 0.5) * rr * 1.4, rr * (0.3 + r() * 0.4), 0, Math.PI * 2); ctx.fill();
      }
    }
    // section roads
    ctx.strokeStyle = 'rgba(190,185,170,0.7)'; ctx.lineWidth = 2;
    for (let p = 0; p <= w; p += cell) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke(); }
  }, { repeat: [1, 1] });
}

// Multiply a material's albedo by a large-scale texture so tiling detail does not read as a carpet.
function withMacro(mat, macro, scale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.macroMap = { value: macro };
    sh.fragmentShader = 'uniform sampler2D macroMap;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>\n  diffuseColor.rgb *= texture2D(macroMap, vMapUv * ${scale.toFixed(5)}).rgb * 1.7;`);
  };
  return mat;
}

function grassTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = rng(9);
    ctx.fillStyle = '#6f8448'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(${90 + r() * 40},${100 + r() * 30},${50 + r() * 20},0.12)`; ctx.beginPath(); ctx.arc(r() * w, r() * h, 20 + r() * 90, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 16000; i++) {
      const g = 90 + Math.floor(r() * 70);
      ctx.fillStyle = `rgba(${g - 40},${g},${g - 60},0.35)`;
      ctx.fillRect(r() * w, r() * h, 2, 3);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 14;   // mowing stripes
    for (let x = 0; x < w; x += 56) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  }, { repeat: [40, 12] });
}

function runwayTexture(len, wid) {
  // canvas x = runway length, canvas y = width
  return canvasTexture(8192, 136, (ctx, w, h) => {
    const r = rng(3);
    ctx.fillStyle = '#4a4c50'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const g = 60 + Math.floor(r() * 40); ctx.fillStyle = `rgba(${g},${g},${g + 4},0.35)`; ctx.fillRect(r() * w, r() * h, 2, 2); }
    // rubber deposits near touchdown zones
    for (const x0 of [0.08, 0.92]) {
      const g = ctx.createLinearGradient(w * (x0 - 0.06), 0, w * (x0 + 0.06), 0);
      g.addColorStop(0, 'rgba(20,20,20,0)'); g.addColorStop(0.5, 'rgba(20,20,20,0.35)'); g.addColorStop(1, 'rgba(20,20,20,0)');
      ctx.fillStyle = g; ctx.fillRect(w * (x0 - 0.06), h * 0.3, w * 0.12, h * 0.4);
    }
    ctx.fillStyle = '#e8e8e2';
    const px = w / len;                       // pixels per foot
    for (let x = 400; x < len - 400; x += 200) ctx.fillRect(x * px, h / 2 - 1.5, 120 * px, 3);  // centerline
    ctx.fillRect(0, 2, w, 2); ctx.fillRect(0, h - 4, w, 2);                                       // edge lines
    for (const end of [0, 1]) {                                                                    // threshold bars
      for (let k = 0; k < 8; k++) {
        const y = h * (0.1 + k * 0.105);
        const x = end ? w - 30 - 150 * px : 30;
        ctx.fillRect(x, y, 150 * px, h * 0.06);
      }
      for (const d of [900, 1400]) {                                                              // touchdown zone
        const x = end ? w - (d + 75) * px : d * px;
        ctx.fillRect(x, h * 0.2, 75 * px, h * 0.08); ctx.fillRect(x, h * 0.72, 75 * px, h * 0.08);
      }
    }
    ctx.save(); ctx.font = `bold ${h * 0.55}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(380 * px, h / 2); ctx.rotate(Math.PI / 2); ctx.fillText('09', 0, 0); ctx.restore();
    ctx.save(); ctx.font = `bold ${h * 0.55}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(w - 380 * px, h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('27', 0, 0); ctx.restore();
  });
}

function cloudTexture(seed) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    const r = rng(seed);
    for (let i = 0; i < 70; i++) {
      const x = w * (0.2 + r() * 0.6), y = h * (0.45 + (r() - 0.5) * 0.4 * (1 - Math.abs(x / w - 0.5)));
      const rad = 30 + r() * 70;
      const g = ctx.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(246,248,252,0.25)'); g.addColorStop(1, 'rgba(240,244,250,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // flatter, greyer cloud base
    ctx.globalCompositeOperation = 'source-atop';
    const b = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.8);
    b.addColorStop(0, 'rgba(255,255,255,0)'); b.addColorStop(1, 'rgba(205,212,226,0.45)');
    ctx.fillStyle = b; ctx.fillRect(0, 0, w, h);
  });
}

export function createWorld(renderer, o = {}) {
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0xc9dbea);
  scene.fog = new THREE.FogExp2(fogColor, 1 / 95000);

  // --- sky dome (clear airshow day) + image-based lighting from the same dome ---
  const sun = new THREE.Vector3();
  const sunEl = THREE.MathUtils.degToRad(o.sunElevation ?? 42), sunAz = THREE.MathUtils.degToRad(o.sunAzimuth ?? 200);
  sun.setFromSphericalCoords(1, Math.PI / 2 - sunEl, sunAz);
  const skyMat = () => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2a64b8) }, mid: { value: new THREE.Color(0x77a6dc) },
      horizon: { value: new THREE.Color(0xd3e2ef) }, ground: { value: new THREE.Color(0x8e9a86) },
      sunDir: { value: sun.clone() }
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 top, mid, horizon, ground, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col;
        if (h >= 0.0) {
          col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, top, smoothstep(0.18, 0.95, h));
        } else {
          col = mix(horizon, ground, smoothstep(0.0, 0.08, -h));
        }
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.96, 0.88) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat());
  sky.renderOrder = -100; sky.frustumCulled = false;
  sky.onBeforeRender = (r, sc, cam) => { sky.position.copy(cam.position); };
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat());
  envSky.material.depthTest = true;
  envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: 0x5d6e4a }));
  envGround.rotation.x = -Math.PI / 2; envGround.position.y = -8; envScene.add(envGround);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.6;

  const sunLight = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sunLight.position.copy(sun).multiplyScalar(10000);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0xbfd6ee, 0x55603f, 0.55));

  // --- terrain: land with a ragged coastline in front of the crowd, water beyond ---
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900000, 900000),
    new THREE.MeshStandardMaterial({ color: 0x2f5878, roughness: 0.16, metalness: 0.05, envMapIntensity: 1.2 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -3; scene.add(water);

  const r = rng(77);
  const shape = new THREE.Shape();
  const W = 260000, coastZ = -36000;
  // shape space y = -world z: land runs from far behind the crowd out to the coast
  shape.moveTo(-W, -W);
  shape.lineTo(-W, -coastZ);
  for (let x = -W; x <= W; x += 2500) shape.lineTo(x, -coastZ + Math.sin(x / 9000) * 4000 + Math.sin(x / 2300) * 900 + (r() - 0.5) * 700);
  shape.lineTo(W, -W);
  const land = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1),
    withMacro(new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 }), macroTexture(), 1 / 60));
  land.rotation.x = -Math.PI / 2;
  // ShapeGeometry UVs are in shape units; rescale for the texture repeat
  const uv = land.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 9000, uv.getY(i) / 9000);
  scene.add(land);
  // beach strip along the coast
  // airfield grass (closer, finer texture)
  // mown airfield grass, feathered into the farmland at its edges
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1, transparent: true, alphaMap: canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { color: false }), depthWrite: false });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(22000, 9000), grassMat);
  field.geometry.setAttribute('uv1', field.geometry.attributes.uv.clone());
  grassMat.alphaMap.channel = 1;
  field.rotation.x = -Math.PI / 2; field.position.set(0, 0.05, 900); field.renderOrder = -1; scene.add(field);

  // --- runway along the show line, taxiway and apron toward the crowd ---
  // Runway along the show line through center point (crowd left to crowd right), 12,000 x 200 ft.
  const RL = 12000, RW = 200, RY = 0.6;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x55575b, roughness: 0.9 });
  const shoulder = new THREE.MeshStandardMaterial({ color: 0x7b7a72, roughness: 0.95 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.9 });
  const slab = (w, d, x, z, mat, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m; };
  slab(RL + 400, RW + 70, 0, 0, shoulder, RY - 0.15);                       // paved shoulders and overruns
  const runway = slab(RL, RW, 0, 0, new THREE.MeshStandardMaterial({ map: runwayTexture(RL, RW), roughness: 0.85 }), RY);
  runway.renderOrder = 1;
  slab(RL, 75, 0, 560, asphalt, RY - 0.1);                                  // parallel taxiway
  for (const x of [-5900, -3000, 0, 3000, 5900]) slab(75, 490, x, 300, asphalt, RY - 0.12);
  slab(4200, 420, 0, 1150, concrete, RY - 0.1);                             // apron in front of the crowd

  // hangars and buildings beyond the crowd's left and right
  const bldg = new THREE.MeshStandardMaterial({ color: 0xa9a59a, roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x8e979e, roughness: 0.6, metalness: 0.3 });
  const hangar = (x, z, w, d, h) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldg); b.position.set(x, h / 2, z); scene.add(b);
    const rf = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 20, 1, false, 0, Math.PI), roof);
    rf.rotation.z = Math.PI / 2; rf.position.set(x, h, z); rf.scale.set(0.3, 1, 1); scene.add(rf);
  };
  hangar(-3600, 1350, 420, 260, 70); hangar(-3000, 1350, 300, 220, 60); hangar(3400, 1400, 480, 280, 75);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 120, 12), bldg); tower.position.set(2600, 60, 1500); scene.add(tower);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(34, 30, 22, 12), new THREE.MeshStandardMaterial({ color: 0x2b3c4c, metalness: 0.6, roughness: 0.2 }));
  cab.position.set(2600, 131, 1500); scene.add(cab);

  // --- woodland: clustered rounded crowns with varied greens ---
  const crownGeo = new THREE.IcosahedronGeometry(1, 1); crownGeo.scale(22, 18, 22); crownGeo.translate(0, 30, 0);
  const trees = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x3b5a2c, roughness: 1, flatShading: true, envMapIntensity: 0.4 }), 6000);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const tc = new THREE.Color();
  let ti = 0, guard = 0;
  while (ti < trees.count && guard++ < 200000) {
    const cx = (r() - 0.5) * 70000, cz = (r() - 0.5) * 56000 - 6000;
    const nTrees = 10 + Math.floor(r() * 60), spread = 300 + r() * 1400;
    for (let k = 0; k < nTrees && ti < trees.count; k++) {
      const x = cx + (r() - 0.5) * spread, z = cz + (r() - 0.5) * spread * 0.7;
      if (Math.abs(x) < 7000 && z > -2500 && z < 3600) continue;      // keep the airfield and crowd area open
      if (z < -31000) continue;                                       // not in the sea
      const sc = 0.6 + r() * 0.8;
      m4.compose(p3.set(x, 0, z), q.setFromAxisAngle(s3.set(0, 1, 0), r() * 6), s3.set(sc, sc * (0.8 + r() * 0.5), sc));
      trees.setMatrixAt(ti, m4);
      trees.setColorAt(ti, tc.setRGB(0.75 + r() * 0.4, 0.8 + r() * 0.35, 0.7 + r() * 0.3));
      ti++;
    }
  }
  trees.count = ti;
  const treeCount = ti;
  scene.add(trees);

  // --- spectators along the crowd line ---
  const crowd = new THREE.Group();
  // spectators: Blender-built figures, loaded asynchronously (the scene renders while they load)
  const people = buildCrowd(crowd, {
    url: o.crowdUrl ?? 'assets/models/spectators.bin',
    // detailed models only for the closest few hundred; performance mode thins the crowd
    count: o.crowdCount ?? 9000, nearCount: 400,
    width: 3600, depth: 420, crowdZ: CROWD_Z, camera: { x: 0, z: CROWD_Z + 30 },
    narrator: { x: 34, z: CROWD_Z - 12 }
  });
  // tents / chalets behind the crowd
  const tentMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 });
  for (let i = 0; i < 26; i++) {
    const tx = -1700 + i * 136, tz = CROWD_Z + 640 + (i % 2) * 70;
    const t = new THREE.Mesh(new THREE.ConeGeometry(42, 26, 4), tentMat); t.position.set(tx, 30, tz); t.rotation.y = Math.PI / 4; crowd.add(t);
    const b = new THREE.Mesh(new THREE.BoxGeometry(58, 17, 58), tentMat); b.position.set(tx, 8.5, tz); crowd.add(b);
  }
  scene.add(crowd);

  // --- clouds: scattered fair-weather cumulus, mostly away from the box ---
  const clouds = new THREE.Group();
  const cloudMats = [1, 2, 3, 4].map((k) => new THREE.SpriteMaterial({ map: cloudTexture(k * 17), fog: true, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false }));
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 30000 + r() * 110000;
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 8000;
    const y = 11000 + r() * 6000;
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Sprite(cloudMats[Math.floor(r() * 4)]);
      const sc = 2600 + r() * 3600;
      sp.scale.set(sc * 2, sc, 1);
      sp.position.set(x + (r() - 0.5) * sc, y + r() * 500, z + (r() - 0.5) * sc);
      clouds.add(sp);
    }
  }
  scene.add(clouds);

  // --- aerobatic box / show-line overlay (toggleable) ---
  const box = new THREE.Group();
  const lineMat = (c, op) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, fog: false });
  const seg = (pts, mat) => { const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], 2, p[1]))); return new THREE.Line(g, mat); };
  const gold = lineMat(0xf0b429, 0.95), white = lineMat(0xffffff, 0.7), faint = lineMat(0xffffff, 0.35);
  box.add(seg([[-3 * NM, 0], [3 * NM, 0]], gold));                                   // show line
  box.add(seg([[-NM, 0], [NM, 0], [NM, -NM], [-NM, -NM], [-NM, 0]], white));         // minimum aerobatic box
  box.add(seg([[-3 * NM, CROWD_Z], [3 * NM, CROWD_Z]], white));                       // crowd line
  const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
  for (const sx of [-1, 1]) box.add(seg([[sx * 3 * NM * c30, 3 * NM * s30], [-sx * 3 * NM * c30, -3 * NM * s30]], faint)); // 30° lines
  box.add(seg([[0, -3 * NM], [0, 3 * NM]], faint));                                   // head-on line
  for (const k of [-3, -2, -1, 1, 2, 3]) box.add(seg([[k * NM, -200], [k * NM, 200]], white));
  const cpRing = new THREE.Mesh(new THREE.RingGeometry(70, 90, 40), new THREE.MeshBasicMaterial({ color: 0xf0b429, transparent: true, opacity: 0.95, fog: false }));
  cpRing.rotation.x = -Math.PI / 2; cpRing.position.y = 2.2; box.add(cpRing);
  box.visible = false;
  scene.add(box);

  // 'high' or 'low' (performance): fewer trees and spectators
  const setDetail = (level) => {
    trees.count = level === 'low' ? Math.round(treeCount * 0.4) : treeCount;
    people.setDetail(level);
  };
  return { scene, sky, sun: sun.clone(), sunLight, box, clouds, crowd, people, fogColor, setDetail };
}
