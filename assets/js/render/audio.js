// Procedural aircraft sound with the Web Audio API (no recordings).
//   Hornet: turbofan roar (loudest aft), turbine whine (forward arc), afterburner rumble + crackle.
//   C-130J: four turboprops (blade-pass buzz with beating), turbine whine, broadband roar.
// Each aircraft is its own 3D source. What you hear is computed at the retarded time
// (sound travels ~1,125 ft/s), so passes are heard after they are seen, with Doppler shift
// and distance-dependent air absorption.
import { KT } from '../sim/flight.js';

const C_SOUND = 1125;            // ft/s
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function noiseBuffer(ctx, seconds, kind) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'crackle') {
    // sparse random pops: the "tearing" crackle of high-thrust jet exhaust
    for (let i = 0; i < n; i++) d[i] = Math.random() < 0.0016 ? (Math.random() * 2 - 1) : 0;
  } else {
    // pink-ish noise (Paul Kellet filter)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

export class FlightAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.8;
    this.voices = new Map();
  }

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      const ctx = this.ctx;
      this.noise = noiseBuffer(ctx, 4, 'pink');
      this.crackle = noiseBuffer(ctx, 3, 'crackle');
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.01; comp.release.value = 0.3;
      this.master.connect(comp).connect(ctx.destination);
      // faint outdoor bed (wind + distant crowd) so silence between passes feels like a show site
      const bed = ctx.createBufferSource(); bed.buffer = this.noise; bed.loop = true;
      const bedF = ctx.createBiquadFilter(); bedF.type = 'lowpass'; bedF.frequency.value = 420;
      this.bedGain = ctx.createGain(); this.bedGain.gain.value = 0.05;
      bed.connect(bedF).connect(this.bedGain).connect(this.master);
      bed.start();
    }
    await this.ctx.resume();
    this.enabled = true;
    return true;
  }

  disable() {
    this.enabled = false;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  setVolume(v) { this.volume = v; }

  // ---- voices ----
  makeVoice(kind) {
    const ctx = this.ctx;
    const v = { kind, nodes: [] };
    const src = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * buf.duration); v.nodes.push(s); return s; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (g = 0) => { const x = ctx.createGain(); x.gain.value = g; return x; };

    v.air = filt('lowpass', 8000, 0.5);           // air absorption, set per frame from distance
    v.out = gain(0);
    v.panner = new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 180, rolloffFactor: 1, maxDistance: 80000 });
    v.air.connect(v.out).connect(v.panner).connect(this.master);

    if (kind === 'c130') {
      v.roarSrc = src(this.noise);
      v.roar = gain(0.5); v.roarSrc.connect(filt('lowpass', 520, 0.6)).connect(v.roar).connect(v.air);
      // four engines: blade-pass buzz near 102 Hz, slightly detuned so they beat like real props
      v.props = [];
      const propLP = filt('lowpass', 900, 0.8);
      v.propGain = gain(0.22);
      propLP.connect(v.propGain).connect(v.air);
      for (const det of [-0.7, -0.2, 0.3, 0.9]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 102 + det; o.start();
        const h = ctx.createOscillator(); h.type = 'square'; h.frequency.value = (102 + det) * 2; h.start();
        const hg = gain(0.25); h.connect(hg).connect(propLP);
        o.connect(propLP);
        v.props.push({ o, h, base: 102 + det }); v.nodes.push(o, h);
      }
      const w = ctx.createOscillator(); w.type = 'sine'; w.frequency.value = 6800; w.start(); v.nodes.push(w);
      v.whineOsc = [{ o: w, base: 6800 }];
      v.whine = gain(0); w.connect(v.whine).connect(v.air);
      return v;
    }

    // Hornet (F414 turbofans)
    v.roarSrc = src(this.noise, 1);
    v.roarF = filt('lowpass', 1400, 0.4);
    v.roar = gain(0);
    v.roarSrc.connect(v.roarF).connect(v.roar).connect(v.air);
    v.rumbleSrc = src(this.noise, 0.5);
    v.rumble = gain(0);
    v.rumbleSrc.connect(filt('lowpass', 160, 0.9)).connect(v.rumble).connect(v.air);
    v.crackSrc = src(this.crackle, 1);
    v.crack = gain(0);
    v.crackSrc.connect(filt('bandpass', 1100, 0.6)).connect(v.crack).connect(v.air);
    v.whine = gain(0);
    v.whineOsc = [];
    for (const [f, a] of [[3900, 1], [5850, 0.6], [2450, 0.5]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.start();
      const g = gain(a); o.connect(g).connect(v.whine);
      v.whineOsc.push({ o, base: f }); v.nodes.push(o);
    }
    v.whine.connect(v.air);
    return v;
  }

  dropVoice(id) {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => { for (const n of v.nodes) { try { n.stop(); } catch { /* already stopped */ } } v.panner.disconnect(); }, 400);
    this.voices.delete(id);
  }

  // Called every frame by the theater page.
  update(th) {
    if (!this.ctx || !this.enabled || !th.result) return;
    const ctx = this.ctx, now = ctx.currentTime, tc = 0.06;
    const audible = th.playing && th.speed <= 4;
    this.master.gain.setTargetAtTime(audible ? this.volume : 0, now, audible ? 0.15 : 0.05);
    if (!audible) return;

    // listener = camera
    const cam = th.camera, L = cam.position;
    const fwd = cam.getWorldDirection(this._f || (this._f = L.clone()));
    const up = cam.up;
    const lst = ctx.listener;
    if (lst.positionX) {
      lst.positionX.setTargetAtTime(L.x, now, tc); lst.positionY.setTargetAtTime(L.y, now, tc); lst.positionZ.setTargetAtTime(L.z, now, tc);
      lst.forwardX.setTargetAtTime(fwd.x, now, tc); lst.forwardY.setTargetAtTime(fwd.y, now, tc); lst.forwardZ.setTargetAtTime(fwd.z, now, tc);
      lst.upX.setTargetAtTime(up.x, now, tc); lst.upY.setTargetAtTime(up.y, now, tc); lst.upZ.setTargetAtTime(up.z, now, tc);
    } else {
      lst.setPosition(L.x, L.y, L.z); lst.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }

    // voices follow the aircraft in the current maneuver
    const live = new Set();
    for (const [id, j] of th.jets) {
      if (!j.track) continue;
      live.add(id);
      if (!this.voices.has(id)) this.voices.set(id, this.makeVoice(j.model.kind));
      this.drive(this.voices.get(id), j.track, th.t, L, now, tc);
    }
    for (const id of [...this.voices.keys()]) if (!live.has(id)) this.dropVoice(id);
    this.bedGain.gain.setTargetAtTime(0.05, now, 0.5);
  }

  drive(v, track, t, L, now, tc) {
    // retarded time: the sound reaching the listener now left the aircraft at te
    let te = t, s = null, dist = 0;
    for (let k = 0; k < 4; k++) {
      s = track.sample(te, this._s || (this._s = {}));
      dist = Math.hypot(s.p[0] - L.x, s.p[1] - L.y, s.p[2] - L.z);
      te = t - dist / C_SOUND;
    }
    const before = te < track.t0;
    s = track.sample(Math.max(te, track.t0), this._s);
    const px = s.p[0], py = s.p[1], pz = s.p[2];
    dist = Math.max(1, Math.hypot(px - L.x, py - L.y, pz - L.z));
    const ux = (L.x - px) / dist, uy = (L.y - py) / dist, uz = (L.z - pz) / dist;   // aircraft -> listener
    const vel = s.v;
    const vRad = vel * (s.d[0] * ux + s.d[1] * uy + s.d[2] * uz);                   // + approaching
    const doppler = clamp(C_SOUND / (C_SOUND - clamp(vRad, -900, 900)), 0.55, 2.2);
    const aft = -(s.d[0] * ux + s.d[1] * uy + s.d[2] * uz);                         // 1 = listener directly behind
    const kts = vel / KT;
    const flags = s.flags || {};

    v.panner.positionX.setTargetAtTime(px, now, tc);
    v.panner.positionY.setTargetAtTime(py, now, tc);
    v.panner.positionZ.setTargetAtTime(pz, now, tc);
    v.air.frequency.setTargetAtTime(clamp(17000 * Math.pow(350 / dist, 0.75), 380, 17000), now, tc);
    v.out.gain.setTargetAtTime(before ? 0 : 30, now, 0.1);   // calibrated: ~0.25 RMS for a pass at the 1,500 ft show line

    if (v.kind === 'c130') {
      for (const p of v.props) { p.o.frequency.setTargetAtTime(p.base * doppler, now, tc); p.h.frequency.setTargetAtTime(p.base * 2 * doppler, now, tc); }
      v.roarSrc.playbackRate.setTargetAtTime(doppler, now, tc);
      const near = smooth(6000, 600, dist);
      v.propGain.gain.setTargetAtTime(0.016 + 0.01 * smooth(-0.5, 0.8, -aft), now, tc);   // oscillators are full scale, noise is ~0.1
      v.roar.gain.setTargetAtTime(0.22 + 0.15 * smooth(-0.3, 0.9, aft), now, tc);
      for (const w of v.whineOsc) w.o.frequency.setTargetAtTime(w.base * doppler, now, tc);
      v.whine.gain.setTargetAtTime(0.002 * near * smooth(-0.2, 0.9, -aft), now, tc);
      return;
    }

    // throttle: idle on the ground at rest, military power in flight, plus afterburner
    const onGround = py < 12;
    const thr = onGround && kts < 5 ? 0.35 : clamp(0.62 + 0.38 * (kts / 420), 0.5, 1);
    const ab = flags.ab ? 1 : 0;
    const aftLobe = 0.28 + 0.72 * smooth(-0.35, 0.85, aft);
    v.roarSrc.playbackRate.setTargetAtTime(doppler * (0.85 + 0.25 * thr), now, tc);
    v.rumbleSrc.playbackRate.setTargetAtTime(doppler * 0.5, now, tc);
    v.roarF.frequency.setTargetAtTime((900 + 1400 * thr + 900 * ab) * doppler, now, tc);
    v.roar.gain.setTargetAtTime((0.55 * thr + 0.35 * ab) * aftLobe, now, tc);
    v.rumble.gain.setTargetAtTime((0.25 * thr + 0.9 * ab) * (0.5 + 0.5 * aftLobe), now, tc);
    v.crack.gain.setTargetAtTime((0.25 * thr * thr + 0.9 * ab) * aftLobe * smooth(9000, 1200, dist), now, tc);
    const fwdLobe = smooth(-0.2, 0.95, -aft);
    for (const w of v.whineOsc) w.o.frequency.setTargetAtTime(w.base * (0.8 + 0.2 * thr) * doppler, now, tc);
    v.whine.gain.setTargetAtTime(0.03 * (0.4 + 0.6 * fwdLobe) * smooth(7000, 500, dist), now, tc);
  }
}
