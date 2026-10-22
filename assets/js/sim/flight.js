// Kinematic flight-path engine.
//
// World frame (feet):
//   +x  along the show line toward CROWD RIGHT (as seen from the spectators)
//   +y  altitude above ground level
//   +z  toward the crowd. Show line is z = 0, crowd line is z = +1500.
//   CP (center point) is the origin.
//
// Body frame: d = nose (forward), n = canopy (up), l = d x n = right wing.
// A Pilot flies scripted segments (pull, roll, coordinated turn, ...) on a
// fixed time step, so every path is continuous, banks follow turn rate and
// formation members inherit the lead's attitude.

export const G = 32.174;          // ft/s^2
export const KT = 1.6878099;      // ft/s per knot
export const NM = 6076.12;        // ft
export const DT = 1 / 30;         // simulation step (s)
export const DEG = Math.PI / 180;
export const GROUND_Y = 7.6;      // reference-point height with gear on the runway (surface at 0.6 ft)
export const CROWD_Z = 1500;

// ---------- small vector helpers (plain arrays so the sim runs in Node too) ----------
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  // Rodrigues rotation of v about unit axis k by angle a
  rot: (v, k, a) => {
    const c = Math.cos(a), s = Math.sin(a), kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const cx = k[1] * v[2] - k[2] * v[1], cy = k[2] * v[0] - k[0] * v[2], cz = k[0] * v[1] - k[1] * v[0];
    return [v[0] * c + cx * s + k[0] * kv * (1 - c), v[1] * c + cy * s + k[1] * kv * (1 - c), v[2] * c + cz * s + k[2] * kv * (1 - c)];
  }
};
const UP = [0, 1, 0];

export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Named headings. Directions are where the aircraft is pointing.
const HEADINGS = {
  R: [1, 0, 0],   // toward crowd right
  L: [-1, 0, 0],  // toward crowd left
  A: [0, 0, -1],  // away from the crowd
  T: [0, 0, 1]    // toward / over the crowd
};
export function heading(h) {
  if (Array.isArray(h)) return V.norm(h);
  if (typeof h === 'number') return [Math.cos(h * DEG), 0, -Math.sin(h * DEG)]; // degrees CCW from +x seen from above, 90 = away
  return HEADINGS[h].slice();
}

// ---------- Track: uniformly sampled pose history ----------
export class Track {
  constructor(t0 = 0) {
    this.t0 = t0;
    this.p = []; this.d = []; this.n = []; this.v = []; this.f = [];
    this.finalized = false;
  }
  get length() { return this.v.length; }
  get t1() { return this.t0 + (this.length - 1) * DT; }
  push(p, d, n, v, flags) {
    this.p.push(p[0], p[1], p[2]); this.d.push(d[0], d[1], d[2]); this.n.push(n[0], n[1], n[2]);
    this.v.push(v); this.f.push(flags);
  }
  pose(i) {
    const k = i * 3;
    return {
      p: [this.p[k], this.p[k + 1], this.p[k + 2]],
      d: [this.d[k], this.d[k + 1], this.d[k + 2]],
      n: [this.n[k], this.n[k + 1], this.n[k + 2]],
      v: this.v[i], f: this.f[i]
    };
  }
  truncate(len) {
    this.p.length = this.d.length = this.n.length = len * 3;
    this.v.length = this.f.length = len;
  }
  indexAt(t) { return (t - this.t0) / DT; }

  // Interpolated state at time t (clamped to the track's span).
  sample(t, out = {}) {
    const fi = clamp(this.indexAt(t), 0, this.length - 1);
    const i = Math.min(Math.floor(fi), this.length - 2 < 0 ? 0 : this.length - 2);
    const u = this.length > 1 ? fi - i : 0;
    const k = i * 3, k2 = (i + 1) * 3;
    const P = this.p, D = this.d, N = this.n;
    const L = (a, j) => a[k + j] + ((this.length > 1 ? a[k2 + j] : a[k + j]) - a[k + j]) * u;
    out.p = [L(P, 0), L(P, 1), L(P, 2)];
    out.d = V.norm([L(D, 0), L(D, 1), L(D, 2)]);
    let n = [L(N, 0), L(N, 1), L(N, 2)];
    n = V.norm(V.sub(n, V.mul(out.d, V.dot(n, out.d))));
    out.n = n;
    const j = this.length > 1 ? Math.min(i + 1, this.length - 1) : i;
    out.v = this.v[i] + (this.v[j] - this.v[i]) * u;
    out.flags = this.f[Math.round(fi)];
    out.nz = this.nz ? this.nz[i] + (this.nz[j] - this.nz[i]) * u : 1;
    out.alpha = this.alpha ? this.alpha[i] + (this.alpha[j] - this.alpha[i]) * u : 0;
    out.active = t >= this.t0 - 1e-6 && t <= this.t1 + 1e-6;
    return out;
  }

  // Extend with straight, unaccelerated flight until time t.
  extendTo(t) {
    if (this.length === 0) return;
    let last = this.pose(this.length - 1);
    while (this.t1 < t - 1e-9) {
      const p = V.add(last.p, V.mul(last.d, last.v * DT));
      this.push(p, last.d, last.n, last.v, last.f);
      last = { ...last, p };
    }
  }

  // Derived load factor and angle of attack from the sampled motion.
  finalize() {
    const n = this.length;
    const nz = new Float32Array(n), alpha = new Float32Array(n);
    const vel = (i) => { const k = i * 3; return [this.d[k] * this.v[i], this.d[k + 1] * this.v[i], this.d[k + 2] * this.v[i]]; };
    for (let i = 0; i < n; i++) {
      const a = i > 0 && i < n - 1 ? V.mul(V.sub(vel(i + 1), vel(i - 1)), 1 / (2 * DT)) : [0, 0, 0];
      const k = i * 3;
      const up = [this.n[k], this.n[k + 1], this.n[k + 2]];
      const onGround = this.p[k + 1] <= GROUND_Y + 0.5;
      nz[i] = onGround ? 1 : (V.dot(a, up) + G * up[1]) / G;
    }
    // light smoothing so finite-difference noise does not jitter the attitude
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) { s += nz[j]; c++; }
      sm[i] = s / c;
    }
    for (let i = 0; i < n; i++) {
      const kts = Math.max(this.v[i] / KT, 60);
      const onGround = this.p[i * 3 + 1] <= GROUND_Y + 0.5;
      // F/A-18E: about 4.5 deg AoA at 1 g / 300 kts, scaling with load and 1/V^2.
      const a = (this.aoaRef ?? 4.5) * sm[i] * (300 / kts) ** 2;
      alpha[i] = onGround ? 0 : clamp(a, -6, this.aoaMax ?? 32) * DEG;
    }
    this.nz = sm; this.alpha = alpha;
    this.finalized = true;
    return this;
  }
}

// ---------- Pilot: scripted flight on a fixed step ----------
export class Pilot {
  constructor(o = {}) {
    this.p = [o.x ?? 0, o.alt ?? GROUND_Y, o.z ?? 0];
    this.d = heading(o.dir ?? 'L');
    this.n = UP.slice();
    this._ortho();
    if (o.pitch) this._pitch(o.pitch * DEG);
    if (o.bank) this._roll(o.bank * DEG);
    this.v = (o.kts ?? 300) * KT;
    this.t = o.t0 ?? 0;
    this.flags = { smoke: o.smoke ?? true, ab: !!o.ab, gear: !!o.gear, hook: !!o.hook };
    this.track = o.track ?? new Track(this.t);
    this.events = [];
    this.kind = o.kind ?? 'hornet';
    this.speedTarget = null;
    this.altHold = null;
    if (!o.track) this._rec();
  }

  // Continue flying from an existing track at time t (formation break / detach).
  static from(track, t, o = {}) {
    const i = Math.round(track.indexAt(t));
    track.truncate(i + 1);
    const s = track.pose(i);
    const pl = new Pilot({ track, t0: track.t0 + i * DT, kind: o.kind });
    pl.p = s.p; pl.d = s.d; pl.n = s.n; pl.v = s.v;
    pl.flags = { ...(typeof s.f === 'object' ? s.f : pl.flags) };
    return pl;
  }

  // ---- internals ----
  _ortho() {
    this.d = V.norm(this.d);
    this.n = V.norm(V.sub(this.n, V.mul(this.d, V.dot(this.n, this.d))));
    if (V.len(this.n) < 0.5 || !isFinite(this.n[0])) this.n = V.norm(V.cross(V.cross(this.d, UP), this.d));
  }
  get l() { return V.cross(this.d, this.n); }
  _roll(a) { this.n = V.rot(this.n, this.d, a); }
  _pitch(a) { const l = this.l; this.d = V.rot(this.d, l, a); this.n = V.rot(this.n, l, a); }
  _yawWorld(a) { this.d = V.rot(this.d, UP, a); this.n = V.rot(this.n, UP, a); }
  _rec() { this.track.push(this.p, this.d, this.n, this.v, { ...this.flags }); }

  get kts() { return this.v / KT; }
  get alt() { return this.p[1]; }
  get gamma() { return Math.asin(clamp(this.d[1], -1, 1)); }   // flight-path angle (rad)
  // Bank: signed angle between canopy and the wings-level up vector (right wing down positive).
  get bank() {
    const d = this.d;
    let u0 = V.sub(UP, V.mul(d, d[1]));
    if (V.len(u0) < 1e-4) return 0;
    u0 = V.norm(u0);
    const l0 = V.cross(d, u0);
    return Math.atan2(V.dot(this.n, l0), V.dot(this.n, u0));
  }

  // One integration step with body / world rates (rad/s) and optional acceleration.
  _step(r = {}) {
    const d0 = this.d;
    if (r.roll) this._roll(r.roll * DT);
    if (r.pitch) this._pitch(r.pitch * DT);
    if (r.yaw) this._yawWorld(r.yaw * DT);
    // Altitude hold: gently trim the flight-path angle toward the target altitude.
    if (this.altHold != null && !r.noAlt) {
      const err = this.altHold - this.p[1];
      const want = clamp(err / Math.max(this.v * 6, 1), -12 * DEG, 12 * DEG);
      const dg = clamp(want - this.gamma, -6 * DEG * DT, 6 * DEG * DT);
      let ax = V.cross(this.d, UP);
      if (V.len(ax) > 1e-3) { ax = V.norm(ax); this.d = V.rot(this.d, ax, dg); this.n = V.rot(this.n, ax, dg); }
    }
    this._ortho();
    // speed
    let acc = r.acc ?? 0;
    if (r.energy) acc -= G * this.d[1] * r.energy;
    if (this.speedTarget != null && r.acc == null) {
      const want = this.speedTarget.kts * KT, rate = this.speedTarget.rate * KT;
      acc = clamp((want - this.v) / DT, -rate, rate);
    }
    this.v = Math.max(this.v + acc * DT, r.minV ?? 0);
    const dm = V.norm(V.add(d0, this.d));
    this.p = V.add(this.p, V.mul(dm, this.v * DT));
    if (r.ground) { this.p[1] = GROUND_Y; }
    this.t += DT;
    this._rec();
  }

  // Run a rate profile that ramps up/down so the integrated angle lands on `total`.
  _angle(total, rateFn, apply, o = {}) {
    if (Math.abs(total) < 1e-6) return this;
    const sign = Math.sign(total), goal = Math.abs(total);
    const tau = o.ramp ?? 0.35;
    let done = 0, cur = 0, guard = 0;
    while (done < goal - 1e-6 && guard++ < 20000) {
      const max = Math.abs(rateFn());
      const accel = max / tau;
      const remaining = goal - done;
      if (remaining <= (cur * cur) / (2 * accel) + cur * DT * 0.5) cur = Math.max(cur - accel * DT, max * 0.06);
      else cur = Math.min(cur + accel * DT, max);
      const step = Math.min(cur * DT, remaining);
      done += step;
      apply(sign * step / DT);
    }
    return this;
  }

  // ---- public segment API (chainable) ----
  set(flags) { Object.assign(this.flags, flags); return this; }
  smoke(on = true) { return this.set({ smoke: on }); }
  ab(on = true) { return this.set({ ab: on }); }
  gear(on = true) { return this.set({ gear: on, hook: on }); }
  mark(label, o = {}) { this.events.push({ t: this.t, label, ...o }); return this; }
  speed(kts, rate = 12) { this.speedTarget = kts == null ? null : { kts, rate }; return this; }
  hold(alt) { this.altHold = alt; return this; }

  fly(sec, o = {}) {
    const n = Math.max(1, Math.round(sec / DT));
    for (let i = 0; i < n; i++) this._step({ energy: o.energy, acc: o.acc });
    return this;
  }
  flyDist(ft, o = {}) { return this.fly(ft / Math.max(this.v, 1), o); }
  // Fly straight until predicate(this) is true.
  until(pred, o = {}) {
    let guard = 0;
    while (!pred(this) && guard++ < (o.max ?? 120) / DT) this._step({ energy: o.energy, acc: o.acc });
    return this;
  }
  untilX(x) { const s = Math.sign(x - this.p[0]); return this.until((p) => Math.sign(x - p.p[0]) !== s); }
  untilZ(z) { const s = Math.sign(z - this.p[2]); return this.until((p) => Math.sign(z - p.p[2]) !== s); }
  untilAlt(y, o) { const s = Math.sign(y - this.p[1]); return this.until((p) => Math.sign(y - p.p[1]) !== s, o); }
  untilKts(k, o) { const s = Math.sign(k - this.kts); return this.until((p) => Math.sign(k - p.kts) !== s, o); }

  // Pitch toward the canopy (positive) or away (negative) by deg.
  // o.g = radial acceleration in g, or o.r = radius (ft). o.energy trades speed for height.
  pull(deg, o = {}) {
    const rate = () => (o.r ? this.v / o.r : ((o.g ?? 5) * G) / Math.max(this.v, 50));
    const energy = o.energy ?? 0.55;
    return this._angle(deg * DEG, rate, (w) => this._step({ pitch: w, energy, roll: o.roll ? o.roll * DEG : 0 }), o);
  }
  push(deg, o = {}) { return this.pull(-deg, o); }

  // Roll about the nose. Positive = right roll. o.rate deg/s.
  roll(deg, o = {}) {
    const rate = (o.rate ?? 180) * DEG;
    const pitch = o.pull ? o.pull * DEG : 0;
    return this._angle(deg * DEG, () => rate, (w) => this._step({ roll: w, pitch, energy: o.energy ?? (pitch ? 0.55 : 0) }), { ramp: o.ramp ?? 0.25 });
  }
  // Roll to an absolute bank angle (deg, right positive, 180 = inverted) by the shortest way
  // unless o.dir ('L' | 'R') is given.
  rollTo(bankDeg, o = {}) {
    let diff = bankDeg * DEG - this.bank;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (o.dir === 'R' && diff < 0) diff += 2 * Math.PI;
    if (o.dir === 'L' && diff > 0) diff -= 2 * Math.PI;
    return this.roll(diff / DEG, o);
  }
  // Roll so the canopy (lift vector) points as close as possible to world direction `dir`.
  rollToward(dir, o = {}) {
    const w = V.norm(dir);
    const proj = V.norm(V.sub(w, V.mul(this.d, V.dot(w, this.d))));
    const ang = Math.atan2(V.dot(V.cross(this.n, proj), this.d), V.dot(this.n, proj));
    return this.roll(ang / DEG, o);
  }

  // Pitch until the flight-path angle reaches gammaDeg (pulls or pushes as needed).
  pitchTo(gammaDeg, o = {}) {
    const target = gammaDeg * DEG;
    const rate = () => ((o.g ?? 4) * G) / Math.max(this.v, 50);
    let cur = 0, guard = 0;
    while (guard++ < 6000) {
      const err = target - this.gamma;
      if (Math.abs(err) < 0.1 * DEG) break;
      // a positive pitch raises gamma when the canopy points up (cos(bank) > 0)
      let u0 = V.sub(UP, V.mul(this.d, this.d[1]));
      const upright = V.len(u0) > 1e-3 ? V.dot(this.n, V.norm(u0)) : this.n[1];
      const s = Math.sign(err) * (upright >= 0 ? 1 : -1);
      const max = rate(), accel = max / 0.35;
      const stop = (cur * cur) / (2 * accel);
      cur = Math.abs(err) <= stop ? Math.max(cur - accel * DT, max * 0.06) : Math.min(cur + accel * DT, max);
      this._step({ pitch: s * Math.min(cur, Math.abs(err) / DT), energy: o.energy ?? 0.55 });
    }
    return this;
  }

  // Coordinated turn about world vertical. deg > 0; o.dir 'L' | 'R' relative to the pilot.
  // o.bank (deg) or o.r (radius, ft). Rolls in and out at o.rollRate; turn rate follows bank.
  // o.remaining (optional) returns the heading change still needed (rad) instead of deg.
  turn(deg, o = {}) {
    const yawSign = o.dir === 'R' ? -1 : 1;      // +yaw about world up = left turn
    const wings = -yawSign;                      // right turn = right (+) bank
    const rollRate = (o.rollRate ?? 90) * DEG;
    const bankFor = () => (o.r ? Math.atan((this.v * this.v) / (G * o.r)) : (o.bank ?? 60) * DEG);
    const goal = deg * DEG;
    let turned = 0, guard = 0, rollingOut = false;
    const remaining = o.remaining ?? (() => goal - turned);
    while (guard++ < 40000) {
      const b = this.bank;
      const omega = Math.sign(b) === wings ? (G * Math.tan(Math.min(Math.abs(b), 85 * DEG))) / Math.max(this.v, 50) : 0;
      const outAng = (Math.abs(b) / rollRate) * omega * 0.5;
      const rem = remaining(turned);
      if (!rollingOut && rem <= outAng + omega * DT) rollingOut = true;
      if (rollingOut && Math.abs(b) < 0.2 * DEG) break;
      const want = rollingOut ? 0 : bankFor() * wings;
      const rollCmd = clamp((want - b) / DT, -rollRate, rollRate);
      const yaw = Math.min(omega, Math.max(rem, 0) / DT) * yawSign;
      turned += Math.abs(yaw) * DT;
      this._step({ roll: rollCmd, yaw, energy: o.energy ?? 0 });
    }
    return this;
  }

  // Signed horizontal bearing to a world point: positive = target to the left.
  bearingTo(target) {
    const to = V.norm([target[0] - this.p[0], 0, target[2] - this.p[2]]);
    const h = V.norm([this.d[0], 0, this.d[2]]);
    return Math.atan2(V.dot(V.cross(h, to), UP), V.dot(h, to));
  }

  // Turn (direction o.dir, or the short way) until the nose points at a world (x, z) target.
  turnToward(target, o = {}) {
    const b0 = this.bearingTo(target);
    const dir = o.dir ?? (b0 >= 0 ? 'L' : 'R');
    const s = dir === 'L' ? 1 : -1;
    const remaining = (turned) => {
      let r = s * this.bearingTo(target);
      if (r < 0) r = turned > 20 * DEG || r > -25 * DEG ? Math.max(r, 0) : r + 2 * Math.PI;
      // target inside the turn circle: give up after a full circle rather than orbit forever
      return turned > 2 * Math.PI + 0.3 ? 0 : r;
    };
    return this.turn(0, { ...o, dir, remaining });
  }

  // Fly straight toward (x, z) until abeam / reaching it, steering finely.
  flyTo(target, o = {}) {
    let guard = 0;
    while (guard++ < (o.max ?? 300) / DT) {
      const to = [target[0] - this.p[0], 0, target[2] - this.p[2]];
      const dist = Math.hypot(to[0], to[2]);
      const h = V.norm([this.d[0], 0, this.d[2]]);
      if (V.dot(to, h) <= 0 || dist < this.v * DT) break;
      const b = Math.atan2(V.dot(V.cross(h, V.norm(to)), UP), V.dot(h, V.norm(to)));
      this._step({ yaw: clamp(b / DT, -2 * DEG, 2 * DEG), energy: o.energy });
    }
    return this;
  }

  // Climb at gamma to an altitude and level off (leading the level-off).
  climbTo(alt, o = {}) {
    const g = o.gamma ?? 20;
    const sgn = alt >= this.p[1] ? 1 : -1;
    this.pitchTo(sgn * Math.abs(g), { g: o.g ?? 2.5, energy: o.energy });
    const R = (this.v * this.v) / ((o.g ?? 2.5) * G);
    const lead = R * (1 - Math.cos(Math.abs(this.gamma)));
    this.until((p) => (sgn > 0 ? p.p[1] >= alt - lead : p.p[1] <= alt + lead), { energy: o.energy });
    this.pitchTo(0, { g: o.g ?? 2.5, energy: o.energy });
    return this;
  }

  // Ground roll from a standstill, rotate and lift off.
  takeoff(o = {}) {
    this.set({ gear: true });
    const accel = (o.accel ?? 0.55) * G;
    const rot = (o.rotate ?? 145) * KT;
    while (this.v < rot) this._step({ acc: accel, ground: true });
    this.mark(o.label ?? 'Rotate');
    this.pitchTo(o.climb ?? 4, { g: 1.25, energy: 0 });
    return this;
  }

  // Final approach flare, touchdown and rollout to a stop.
  land(o = {}) {
    this.until((p) => p.p[1] <= (o.flareAlt ?? 90), { max: 200 });
    this.pitchTo(-2, { g: 1.3, energy: 0 });
    this.until((p) => p.p[1] <= GROUND_Y + 0.5, { max: 60 });
    this.p[1] = GROUND_Y; this.pitchTo(0, { g: 3, energy: 0 });
    this.mark('Touchdown');
    const dec = (o.decel ?? 0.35) * G;
    while (this.v > 0.5) this._step({ acc: -dec, ground: true });
    this.v = 0;
    return this;
  }

  // Low transition: stay low, accelerate, raise the gear.
  lowTransition(o = {}) {
    this.hold(o.alt ?? 40);
    const acc = (o.accel ?? 0.6) * G;
    let gearUp = false;
    const target = (o.kts ?? 330) * KT;
    while (this.v < target) {
      this._step({ acc });
      if (!gearUp && this.p[1] > 20) { this.set({ gear: false, hook: false }); gearUp = true; }
    }
    this.hold(null);
    return this;
  }
}

// ---------- formations ----------
// Slot offsets in the reference aircraft's body frame: [forward, up, right] in feet.
export const FORMS = {
  diamond:     { 1: [0, 0, 0], 2: [-30, -5, 24], 3: [-30, -5, -24], 4: [-58, -10, 0] },
  delta:       { 1: [0, 0, 0], 2: [-30, -5, 24], 3: [-30, -5, -24], 4: [-58, -10, 0], 5: [-58, -10, -48], 6: [-58, -10, 48] },
  doubleV:     { 1: [0, 0, 0], 2: [-30, -5, 24], 3: [-30, -5, -24], 4: [-62, -10, 0], 5: [-90, -15, -24], 6: [-90, -15, 24] },
  fingertip:   { 1: [0, 0, 0], 2: [-30, 0, 30], 3: [-30, 0, -30], 4: [-60, 0, 60] },
  echelonR:    { 1: [0, 0, 0], 2: [-30, -5, 26], 4: [-60, -10, 52], 3: [-90, -15, 78] },
  echelonL:    { 1: [0, 0, 0], 3: [-30, -5, -26], 4: [-60, -10, -52], 2: [-90, -15, -78] },
  lineAbreast: { 1: [0, 0, 0], 2: [-4, -2, 50], 3: [-4, -2, -50], 4: [-8, -4, 100], 5: [-8, -4, -100] },
  trail:       { 1: [0, 0, 0], 2: [-90, -10, 0], 3: [-180, -20, 0], 4: [-270, -30, 0] },
  section:     { 5: [0, 0, 0], 6: [-20, -16, 0] },          // #6 stacked under #5
  sectionWide: { 5: [0, 0, 0], 6: [-6, 0, -60] },
  fortus:      { 5: [0, 18, 0], 6: [0, 0, 0] },             // #5 inverted above #6
  solo:        { 5: [0, 0, 0], 6: [0, 0, 0] },
  fingertip6:  { 1: [0, 0, 0], 2: [-30, 0, 30], 3: [-30, 0, -30], 4: [-60, 0, 60], 5: [-60, 0, -60], 6: [-90, 0, 90] }
};

// Build member tracks that fly in formation on a reference track.
//   schedule: [{ t, form, dur }] - formation changes (blended over dur seconds)
//   rolls:    { id: [{ t, deg, dur }] } - each member's own roll about its nose
//   lag:      { id: seconds } (unused by default)
export function formationTracks(ref, ids, schedule, rolls = {}) {
  const out = {};
  const steps = schedule.slice().sort((a, b) => a.t - b.t);
  const slotAt = (id, t, alt = 1000) => {
    let cur = FORMS[steps[0].form][id] ?? [0, 0, 0];
    for (let k = 1; k < steps.length; k++) {
      const s = steps[k];
      if (t <= s.t) break;
      const to = FORMS[s.form][id] ?? cur;
      const raw = clamp((t - s.t) / (s.dur ?? 3), 0, 1);
      const u = smooth(raw);
      // slide across under the others: the farther a jet moves sideways, the deeper it steps down
      // (no step-down close to the ground, e.g. joining up right after takeoff)
      const lowFade = clamp((alt - 60) / 240, 0, 1);
      const dip = -Math.min(40, 0.35 * Math.abs(to[2] - cur[2]) + 0.1 * Math.abs(to[0] - cur[0])) * Math.sin(Math.PI * raw) * lowFade;
      cur = V.lerp(cur, to, u);
      cur = [cur[0], cur[1] + dip, cur[2]];
    }
    return cur;
  };
  const rollAt = (id, t) => {
    let a = 0;
    for (const r of rolls[id] ?? []) {
      if (t <= r.t) continue;
      const u = r.dur ? clamp((t - r.t) / r.dur, 0, 1) : 1;
      // linear in the middle, eased at the ends (like an aileron roll)
      const e = r.ease === false ? u : (u < 0.15 ? (u * u) / 0.3 : u > 0.85 ? 1 - ((1 - u) * (1 - u)) / 0.3 : u - 0.075) / 0.85;
      a += r.deg * DEG * clamp(e, 0, 1);
    }
    return a;
  };
  for (const id of ids) {
    const tr = new Track(ref.t0);
    for (let i = 0; i < ref.length; i++) {
      const t = ref.t0 + i * DT;
      const s = ref.pose(i);
      const l = V.cross(s.d, s.n);
      const o = slotAt(id, t, s.p[1]);
      const p = V.add(s.p, V.add(V.mul(s.d, o[0]), V.add(V.mul(s.n, o[1]), V.mul(l, o[2]))));
      // keep formation members off the runway surface during takeoff
      if (p[1] < GROUND_Y) p[1] = GROUND_Y;
      const ra = rollAt(id, t);
      const n = ra ? V.rot(s.n, s.d, ra) : s.n;
      tr.push(p, s.d, n, s.v, { ...s.f });
    }
    out[id] = tr;
  }
  return out;
}

// Blend a track's poses onto another (e.g. a rendezvous) between t0 and t1.
export function blendInto(track, target, t0, t1) {
  const i0 = Math.max(0, Math.round(track.indexAt(t0)));
  target.extendTo(track.t1);
  track.extendTo(target.t1);
  for (let i = i0; i < track.length; i++) {
    const t = track.t0 + i * DT;
    const u = smooth((t - t0) / (t1 - t0));
    const a = track.pose(i), b = target.sample(t);
    const k = i * 3;
    const p = V.lerp(a.p, b.p, u), d = V.norm(V.lerp(a.d, b.d, u)), n = V.norm(V.lerp(a.n, b.n, u));
    track.p[k] = p[0]; track.p[k + 1] = p[1]; track.p[k + 2] = p[2];
    track.d[k] = d[0]; track.d[k + 1] = d[1]; track.d[k + 2] = d[2];
    track.n[k] = n[0]; track.n[k + 1] = n[1]; track.n[k + 2] = n[2];
    track.v[i] = a.v + (b.v - a.v) * u;
    if (u >= 1) track.f[i] = b.flags;
  }
  return track;
}

// Simple secant solver for tuning a scalar parameter so that f(x) = 0.
export function solve(f, x0, x1, iters = 14) {
  let f0 = f(x0), f1 = f(x1);
  for (let i = 0; i < iters && Math.abs(f1) > 1e-3; i++) {
    if (f1 === f0) break;
    const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
    x0 = x1; f0 = f1; x1 = x2; f1 = f(x1);
  }
  return x1;
}

// Time when a track passes closest to a point (horizontal distance).
export function closestPass(track, x, z) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < track.length; i++) {
    const dx = track.p[i * 3] - x, dz = track.p[i * 3 + 2] - z;
    const dd = dx * dx + dz * dz;
    if (dd < best) { best = dd; bi = i; }
  }
  return { t: track.t0 + bi * DT, dist: Math.sqrt(best), i: bi, alt: track.p[bi * 3 + 1] };
}
