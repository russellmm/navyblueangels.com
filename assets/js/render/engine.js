// The flight theater: renders a maneuver's tracks with aircraft, smoke and cameras.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/three/addons/OrbitControls.js';
import { createWorld, CROWD_Z } from './world.js';
import { createHornet } from './hornet.js';
import { createC130 } from './c130.js';
import { Smoke } from './smoke.js';
import { buildManeuver } from '../sim/maneuvers.js';
import { KT, GROUND_Y } from '../sim/flight.js';

const DEG = Math.PI / 180;
export const CAMERAS = {
  crowd: 'Crowd',
  eye: 'Eye level',
  chase: 'Chase',
  photo: 'Photo jet',
  orbit: 'Orbit',
  map: 'Map'
};
const JET_COLORS = { 1: 0xf0b429, 2: 0x7fc8ff, 3: 0xff8a7a, 4: 0xb9f27c, 5: 0xffffff, 6: 0xd7a6ff, 7: 0xf0b429 };

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

export class Theater {
  constructor(container, o = {}) {
    this.container = container;
    this.o = o;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!o.capture });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxPixelRatio ?? 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.classList.add('theater-canvas');
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    this.renderer = renderer;

    this.world = createWorld(renderer, o.world);
    this.scene = this.world.scene;
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 2, 600000);
    this.camera.position.set(0, 6, CROWD_Z + 60);
    this.smoke = new Smoke(this.scene);

    this.jets = new Map();            // id -> { model, track }
    this.pathGroup = new THREE.Group(); this.scene.add(this.pathGroup);
    this.t = 0; this.speed = 1; this.playing = !!o.autoplay; this.loop = o.loop ?? true;
    this.mode = o.camera ?? 'crowd';
    this.focusId = null;
    this.listeners = {};
    this.showPaths = false;
    this.camState = { target: new THREE.Vector3(0, 300, 0), fov: 30, up: new THREE.Vector3(0, 1, 0), pos: this.camera.position.clone(), init: false };
    this.blend = null;
    this.clock = performance.now();
    this.visible = true;

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 60; this.controls.maxDistance = 30000;

    this._resize = () => this.resize();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(this._resize); this.ro.observe(container); }
    window.addEventListener('resize', this._resize);
    if (window.IntersectionObserver) {
      this.io = new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; if (this.visible) this.clock = performance.now(); }, { threshold: 0.01 });
      this.io.observe(container);
    }
    document.addEventListener('visibilitychange', () => { this.clock = performance.now(); });
    this.resize();
    this._frame = (now) => this.frame(now);
    this.raf = requestAnimationFrame(this._frame);
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); return this; }
  emit(name, ...a) { for (const fn of this.listeners[name] ?? []) fn(...a); }

  resize() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 450;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  model(id) {
    if (!this.jets.has(id)) {
      const m = id === 7 ? createC130() : createHornet(id);
      this.scene.add(m.object);
      this.jets.set(id, { model: m, track: null });
    }
    return this.jets.get(id);
  }

  load(id, opts = {}) {
    const r = buildManeuver(id, opts);
    if (!r) return null;
    this.maneuverId = id;
    this.result = r;
    for (const j of this.jets.values()) { j.track = null; j.model.object.visible = false; }
    for (const [k, tr] of Object.entries(r.tracks)) {
      const j = this.model(Number(k));
      j.track = tr;
    }
    this.focusIds = (r.focus ?? Object.keys(r.tracks)).map(Number);
    if (!this.focusIds.includes(this.focusId)) this.focusId = this.focusIds[0];
    this.duration = r.duration;
    this.events = r.events;
    this.firedUpTo = -1;
    this.buildPaths();
    this.seek(opts.t ?? 0);
    this.camState.init = false;
    this.emit('load', r);
    return r;
  }

  buildPaths() {
    for (const c of [...this.pathGroup.children]) { c.geometry.dispose(); this.pathGroup.remove(c); }
    for (const [id, j] of this.jets) {
      if (!j.track) continue;
      const tr = j.track, pts = [];
      for (let i = 0; i < tr.length; i += 3) pts.push(tr.p[i * 3], tr.p[i * 3 + 1], tr.p[i * 3 + 2]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: JET_COLORS[id] ?? 0xffffff, transparent: true, opacity: 0.75, fog: false, depthWrite: false }));
      line.renderOrder = 6;
      this.pathGroup.add(line);
    }
    this.pathGroup.visible = this.showPaths || this.mode === 'map';
  }

  play() { this.playing = true; this.emit('state'); }
  pause() { this.playing = false; this.emit('state'); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t) {
    this.t = Math.max(0, Math.min(t, this.duration ?? 0));
    this.firedUpTo = this.t - 1e-3;
    this.restartAt = null;
    this.emit('time', this.t);
  }
  setSpeed(s) { this.speed = s; this.emit('state'); }
  setPaths(on) { this.showPaths = on; this.pathGroup.visible = on || this.mode === 'map'; }
  setBox(on) { this.world.box.visible = on; }
  setFocus(id) { if (this.jets.get(id)?.track) { this.focusId = id; this.emit('state'); } }

  setCamera(mode) {
    if (!CAMERAS[mode]) return;
    this.blend = { from: { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov }, t: 0 };
    this.mode = mode;
    this.controls.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      const c = this.centroid();
      this.controls.target.copy(c);
      this.camera.position.copy(c).add(new THREE.Vector3(420, 160, 520));
      this.camera.up.set(0, 1, 0);
      this.lastCentroid = c.clone();
    }
    this.pathGroup.visible = this.showPaths || mode === 'map';
    this.world.box.visible = this.boxPref ?? mode === 'map';
    this.camState.init = false;
    this.emit('state');
  }

  // ---- per-frame pose ----
  poseAll() {
    const t = this.t;
    this.poses = this.poses || {};
    for (const [id, j] of this.jets) {
      const m = j.model.object;
      if (!j.track) { m.visible = false; continue; }
      const s = j.track.sample(t, this.poses[id] || (this.poses[id] = {}));
      m.visible = s.active || t > j.track.t1;
      const nose = new THREE.Vector3(...s.d), up = new THREE.Vector3(...s.n);
      const a = s.alpha;
      const fwd = nose.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      const upA = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(nose, -Math.sin(a));
      const right = new THREE.Vector3().crossVectors(fwd, upA);
      const mat = new THREE.Matrix4().makeBasis(fwd, upA, right);
      m.quaternion.setFromRotationMatrix(mat);
      m.position.set(s.p[0], s.p[1] + (j.model.groundOffset ?? 0), s.p[2]);
      j.model.update(s, performance.now() / 1000);
      const sc = this.mode === 'map' ? this.mapScale ?? 1 : 1;
      m.scale.setScalar(sc);
    }
  }

  centroid(ids = this.focusIds) {
    const c = new THREE.Vector3(); let n = 0;
    for (const id of ids) {
      const s = this.poses?.[id];
      if (!s || !s.p) continue;
      c.x += s.p[0]; c.y += s.p[1]; c.z += s.p[2]; n++;
    }
    return n ? c.multiplyScalar(1 / n) : c.set(0, 400, 0);
  }

  spread(c, ids = this.focusIds) {
    let r = 0;
    for (const id of ids) { const s = this.poses?.[id]; if (s?.p) r = Math.max(r, Math.hypot(s.p[0] - c.x, s.p[1] - c.y, s.p[2] - c.z)); }
    return r;
  }

  updateCamera(dt) {
    const cam = this.camera, st = this.camState;
    const k = (rate) => 1 - Math.exp(-rate * dt);
    const focus = this.poses?.[this.focusId];
    if (this.mode === 'crowd' || this.mode === 'eye') {
      const c = this.centroid();
      const pos = new THREE.Vector3(0, 13, CROWD_Z + 30);   // front of the crowd, on the announcer's stand
      if (!st.init) { st.target.copy(c); st.fov = 30; st.init = true; }
      st.target.lerp(c, k(5));
      cam.position.copy(pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(st.target);
      const D = pos.distanceTo(st.target);
      const R = this.spread(st.target) + 45;
      const fovWant = this.mode === 'eye' ? 62 : THREE.MathUtils.clamp((2 * Math.atan(R / D) / DEG) * 2.4, 3.5, 58);
      st.fov += (fovWant - st.fov) * k(this.mode === 'eye' ? 6 : 2.2);
      cam.fov = st.fov;
    } else if (this.mode === 'chase' && focus) {
      const p = new THREE.Vector3(...focus.p), d = new THREE.Vector3(...focus.d), n = new THREE.Vector3(...focus.n);
      const want = p.clone().addScaledVector(d, -150).addScaledVector(n, 26);
      if (!st.init) { st.pos.copy(want); st.up.copy(n); st.init = true; }
      st.pos.lerp(want, k(4));
      st.up.lerp(n, k(3)).normalize();
      cam.position.copy(st.pos);
      cam.up.copy(st.up);
      cam.lookAt(p.clone().addScaledVector(d, 40));
      cam.fov += (50 - cam.fov) * k(4);
    } else if (this.mode === 'photo' && focus) {
      const c = this.centroid();
      const d = new THREE.Vector3(...focus.d), n = new THREE.Vector3(...focus.n);
      const l = new THREE.Vector3().crossVectors(d, n);
      // fly off the formation's right wing, slightly high and aft (coordinated photo platform)
      const R = this.spread(c);
      const off = 180 + R * 2.2;
      const want = c.clone().addScaledVector(l, off).addScaledVector(n, off * 0.22).addScaledVector(d, -off * 0.25);
      if (!st.init) { st.pos.copy(want); st.up.copy(n); st.init = true; }
      st.pos.lerp(want, k(3));
      st.up.lerp(n, k(2)).normalize();
      cam.position.copy(st.pos);
      cam.up.copy(st.up);
      cam.lookAt(c);
      cam.fov += (42 - cam.fov) * k(4);
    } else if (this.mode === 'orbit') {
      const c = this.centroid();
      if (this.lastCentroid) {
        const delta = c.clone().sub(this.lastCentroid);
        cam.position.add(delta); this.controls.target.add(delta);
      }
      this.lastCentroid = c;
      cam.fov += (45 - cam.fov) * k(4);
      this.controls.update();
    } else if (this.mode === 'map') {
      const b = this.mapBounds();
      const ext = Math.max(b.w / cam.aspect, b.h) * 0.62 + 2000;
      const H = ext / Math.tan(22 * DEG);
      cam.position.set(b.cx, H, b.cz + 1);
      cam.up.set(0, 0, -1);
      cam.lookAt(b.cx, 0, b.cz);
      cam.fov = 44;
      this.mapScale = Math.max(1, H / 900);
    }
    if (this.blend) {
      this.blend.t += dt / 0.7;
      const u = THREE.MathUtils.smootherstep(Math.min(this.blend.t, 1), 0, 1);
      if (u < 1 && this.mode !== 'map' && this.blend.from) {
        cam.position.lerpVectors(this.blend.from.pos, cam.position.clone(), u);
        cam.quaternion.slerpQuaternions(this.blend.from.quat, cam.quaternion.clone(), u);
        cam.fov = this.blend.from.fov + (cam.fov - this.blend.from.fov) * u;
      } else this.blend = null;
    }
    cam.updateProjectionMatrix();
  }

  mapBounds() {
    if (this._mb && this._mb.id === this.maneuverId) return this._mb;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const j of this.jets.values()) {
      if (!j.track) continue;
      const P = j.track.p;
      for (let i = 0; i < P.length; i += 9) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
    }
    x0 = Math.min(x0, -3000); x1 = Math.max(x1, 3000); z1 = Math.max(z1, CROWD_Z + 600); z0 = Math.min(z0, -2000);
    this._mb = { id: this.maneuverId, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, h: z1 - z0 };
    return this._mb;
  }

  telemetry(id = this.focusId) {
    const s = this.poses?.[id];
    if (!s || !s.p) return null;
    const d = s.d, n = s.n;
    const pitch = Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG;
    let u0 = [-d[0] * d[1], 1 - d[1] * d[1], -d[2] * d[1]];
    const ul = Math.hypot(...u0) || 1; u0 = u0.map((v) => v / ul);
    const l0 = [d[1] * u0[2] - d[2] * u0[1], d[2] * u0[0] - d[0] * u0[2], d[0] * u0[1] - d[1] * u0[0]];
    const bank = Math.atan2(n[0] * l0[0] + n[1] * l0[1] + n[2] * l0[2], n[0] * u0[0] + n[1] * u0[1] + n[2] * u0[2]) / DEG;
    return {
      id, alt: Math.max(0, s.p[1] - GROUND_Y), kts: s.v / KT, g: s.nz, aoa: s.alpha / DEG, pitch, bank,
      flags: s.flags || {}
    };
  }

  frame(now) {
    this.raf = requestAnimationFrame(this._frame);
    const dtReal = Math.min(0.1, (now - this.clock) / 1000);
    this.clock = now;
    if (!this.visible || document.hidden || !this.result) return;
    if (this.playing) {
      if (this.restartAt != null) {
        if (now >= this.restartAt) { this.restartAt = null; this.seek(0); this.emit('restart'); }
      } else {
        this.t += dtReal * this.speed;
        if (this.t >= this.duration) {
          this.t = this.duration;
          this.emit('end');
          if (this.loop && this.playing) this.restartAt = now + 1500;
        }
      }
      this.emit('time', this.t);
    }
    // fire events crossed this frame
    for (const e of this.events ?? []) if (e.t > this.firedUpTo && e.t <= this.t) this.emit('event', e);
    this.firedUpTo = this.t;

    this.poseAll();
    this.updateCamera(dtReal);
    const smokers = [];
    for (const [, j] of this.jets) if (j.track) smokers.push({ track: j.track, tail: j.model.tail, smokes: j.model.kind === 'hornet' });
    this.smoke.update(this.t, smokers);
    this.renderer.render(this.scene, this.camera);
    this.emit('frame', this.t);
  }

  snapshot(type = 'image/jpeg', q = 0.9) {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL(type, q);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect(); this.io?.disconnect();
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
  }
}
