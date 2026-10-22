// Demonstration smoke as camera-facing puffs. Each frame rebuilds every trail from the
// tracks themselves (emission on a fixed time grid), so scrubbing and slow motion
// always show the correct trail.
import * as THREE from 'three';
import { canvasTexture, rng } from './geom.js';

const LIFE = 16;            // seconds a puff lingers
const FINE = 1 / 120;       // emission spacing for fresh smoke
const COARSE_EVERY = 3;     // older smoke keeps every 3rd puff (1/40 s)
const FINE_AGE = 0.9;
const WIND = new THREE.Vector3(7, 0.8, 2.5);   // ft/s drift

function puffTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const r = rng(19);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = r() * w * 0.2;
      const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
      const rad = w * (0.18 + r() * 0.16);
      const g = ctx.createRadialGradient(x - rad * 0.25, y - rad * 0.3, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(0.6, 'rgba(236,240,246,0.16)'); g.addColorStop(1, 'rgba(225,230,238,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  });
}

export class Smoke {
  constructor(scene, maxPerJet = 900, jets = 7) {
    this.max = maxPerJet * jets;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCenter', this.center);
    geo.setAttribute('aData', this.data);
    geo.instanceCount = 0;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, sunDir: { value: new THREE.Vector3(0, 1, 0) } }]);
    uniforms.map.value = puffTexture();
    this.material = new THREE.ShaderMaterial({
      uniforms, fog: true, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 aCenter;
        attribute vec4 aData;     // alpha, seed, size, shade
        varying vec2 vUv;
        varying float vAlpha;
        varying float vShade;
        void main() {
          vUv = position.xy + 0.5;
          float a = aData.y * 6.2831853;
          vec2 r = vec2(position.x * cos(a) - position.y * sin(a), position.x * sin(a) + position.y * cos(a)) * aData.z;
          vec4 mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
          mvPosition.xy += r;
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = aData.x;
          vShade = aData.w;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D map;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vShade;
        void main() {
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(map, vUv);
          float alpha = t.a * vAlpha;
          if (alpha < 0.004) discard;
          vec3 col = mix(vec3(0.78, 0.81, 0.86), vec3(1.0), clamp(t.r * vShade, 0.0, 1.0));
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.geo = geo;
  }

  // jets: [{ track, tail: Vector3 (body coords), visible }]
  update(t, jets) {
    const C = this.center.array, D = this.data.array;
    let n = 0;
    const iNow = Math.floor(t / FINE);
    for (const j of jets) {
      const tr = j.track;
      if (!tr || !j.smokes) continue;
      const tx = j.tail.x, ty = j.tail.y;
      for (let k = 0; n < this.max; k++) {
        const gi = iNow - k;
        const te = gi * FINE;
        const age = t - te;
        if (age > LIFE) break;
        if (age < 0) continue;
        if (age > FINE_AGE && (gi % COARSE_EVERY) !== 0) continue;
        if (te < tr.t0) break;
        // fast pose lookup
        const fi = (te - tr.t0) / (1 / 30);
        const i = Math.min(Math.floor(fi), tr.length - 2);
        if (i < 0) break;
        const u = fi - i;
        const fl = tr.f[i];
        if (!fl || !fl.smoke) continue;
        const a = i * 3, b = a + 3;
        const L = (arr, o) => arr[a + o] + (arr[b + o] - arr[a + o]) * u;
        const px = L(tr.p, 0), py = L(tr.p, 1), pz = L(tr.p, 2);
        const dx = L(tr.d, 0), dy = L(tr.d, 1), dz = L(tr.d, 2);
        const nx = L(tr.n, 0), ny = L(tr.n, 1), nz = L(tr.n, 2);
        const h = (Math.sin(gi * 12.9898) * 43758.5453) % 1;
        const seed = h < 0 ? h + 1 : h;
        const spread = Math.min(age, 6) * 0.9;
        C[n * 3] = px + dx * tx + nx * ty + WIND.x * age + (seed - 0.5) * spread;
        C[n * 3 + 1] = py + dy * tx + ny * ty + WIND.y * age + ((seed * 7.3) % 1 - 0.5) * spread;
        C[n * 3 + 2] = pz + dz * tx + nz * ty + WIND.z * age + ((seed * 3.7) % 1 - 0.5) * spread;
        const size = 9 + 17 * Math.sqrt(age) + age * 2.2;
        const fadeIn = Math.min(1, age / 0.08);
        const fadeOut = 1 - THREE.MathUtils.smoothstep(age, LIFE * 0.45, LIFE);
        const dens = age < FINE_AGE ? 0.55 : 0.9;     // coarse puffs carry the density of the ones skipped
        D[n * 4] = fadeIn * fadeOut * dens * (1.25 / (1 + age * 0.1));
        D[n * 4 + 1] = seed;
        D[n * 4 + 2] = size;
        D[n * 4 + 3] = 1.15 + seed * 0.3;
        n++;
      }
    }
    this.geo.instanceCount = n;
    this.center.needsUpdate = true; this.data.needsUpdate = true;
  }
}
