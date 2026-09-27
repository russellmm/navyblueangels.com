(function () {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const calloutEl = document.getElementById("callout");
  const mTitle = document.getElementById("mTitle");
  const mRef = document.getElementById("mRef");
  const mMeta = document.getElementById("mMeta");
  const mDesc = document.getElementById("mDesc");
  const mList = document.getElementById("mList");
  const filtersEl = document.getElementById("filters");
  const searchEl = document.getElementById("mSearch");
  const progressEl = document.getElementById("progress");
  const speedValueEl = document.getElementById("speedValue");
  const resultCountEl = document.getElementById("resultCount");
  const formationBadgeEl = document.getElementById("formationBadge");
  const manualLinkEl = document.getElementById("manualLink");

  let W = 1920, H = 1080;
  const JET_SIZE = 5;
  const C130_SIZE = 8;
  const GOLD = "#e6b422";
  const ROLES = [
    ["#1 Lead / Boss", "Pace, altitude, and the break call."],
    ["#2 Right Wing", "Right wingtip of the Diamond."],
    ["#3 Left Wing", "Mirrors #2 on the left."],
    ["#4 Slot", "Closes the Diamond under Lead."],
    ["#5 Lead Solo", "Sneak, opposing passes, high-alpha."],
    ["#6 Opposing Solo", "Vertical rolls and opposing work."]
  ];

  const FORM = {
    diamond: { 1:[0,0,0], 2:[-20,0,34], 3:[-20,0,-34], 4:[-40,0,0] },
    delta: { 1:[0,0,0], 2:[-20,0,34], 3:[-20,0,-34], 4:[-40,0,0], 5:[-36,0,62], 6:[-36,0,-62] },
    trail: { 1:[0,0,0], 2:[-28,0,0], 3:[-56,0,0], 4:[-84,0,0] },
    lineabreast: { 1:[0,0,0], 2:[0,0,34], 3:[0,0,-34], 4:[0,0,68], 5:[0,0,-68] },
    echelonR: { 1:[0,0,0], 2:[-22,0,26], 3:[-44,0,52], 4:[-66,0,78] },
    echelonL: { 1:[0,0,0], 2:[-22,0,-26], 3:[-44,0,-52], 4:[-66,0,-78] },
    doubleV: { 1:[0,0,0], 2:[-24,0,34], 3:[-24,0,-34], 4:[-48,0,0], 5:[-48,0,64], 6:[-48,0,-64] }
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(t, a, b) { return Math.max(a, Math.min(b, t)); }
  function remap(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function angNorm(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function lerpAng(a, b, t) { return a + angNorm(b - a) * t; }
  function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smoother01(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function expFollow(dt, rate) { return 1 - Math.exp(-Math.max(0, dt) * rate); }

  function basis(yaw, pitch, roll) {
    yaw = isFinite(yaw) ? yaw : 0;
    pitch = isFinite(pitch) ? pitch : 0;
    roll = isFinite(roll) ? roll : 0;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const fwd = { x: cp * cy, y: sp, z: cp * sy };
    const up0 = { x: -sp * cy, y: cp, z: -sp * sy };
    const rgt0 = { x: -sy, y: 0, z: cy };
    const rgt = { x: rgt0.x * cr + up0.x * sr, y: rgt0.y * cr + up0.y * sr, z: rgt0.z * cr + up0.z * sr };
    const up = { x: up0.x * cr - rgt0.x * sr, y: up0.y * cr - rgt0.y * sr, z: up0.z * cr - rgt0.z * sr };
    return { fwd, up, rgt };
  }

  function place(lead, off, extra) {
    extra = extra || {};
    const yaw = isFinite(lead.yaw) ? lead.yaw : 0;
    const pitch = isFinite(lead.pitch) ? lead.pitch : 0;
    const roll = isFinite(lead.roll) ? lead.roll : 0;
    const b = basis(yaw, pitch, roll);
    return {
      x: (lead.x || 0) + b.fwd.x * off[0] + b.up.x * off[1] + b.rgt.x * off[2],
      y: (lead.y || 0) + b.fwd.y * off[0] + b.up.y * off[1] + b.rgt.y * off[2],
      z: (lead.z || 0) + b.fwd.z * off[0] + b.up.z * off[1] + b.rgt.z * off[2],
      yaw: yaw, pitch: pitch, roll: roll + (extra.roll || 0),
      gear: extra.gear != null ? extra.gear : lead.gear,
      burner: extra.burner != null ? extra.burner : lead.burner,
      smoke: extra.smoke != null ? extra.smoke : (lead.smoke !== false),
      kind: extra.kind || "hornet", n: extra.n
    };
  }

  function formJets(lead, name, nums, rolls) {
    const src = FORM[name] || FORM.diamond;
    const out = [null, null, null, null, null, null];
    nums.forEach(function (n) {
      const off = src[n] || [0, 0, 0];
      out[n - 1] = place(lead, off, { n: n, roll: rolls && rolls[n] || 0, gear: lead.gear, burner: lead.burner, kind: lead.kind });
    });
    return out;
  }

  function orient(p, fn, t) {
    const dt = 0.014;
    const a = fn(clamp(t - dt, 0, 1));
    const b = fn(clamp(t + dt, 0, 1));
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    p.yaw = Math.atan2(dz, dx);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz) + 1e-6);
    return p;
  }

  function showLinePass(t, opt) {
    const p = { x: lerp(opt.from, opt.to, t), y: opt.y, z: opt.z || 0, roll: opt.roll || 0, gear: opt.gear, burner: opt.burner, smoke: opt.smoke };
    p.yaw = opt.to < opt.from ? Math.PI : 0; p.pitch = 0;
    return p;
  }

  // Vertical loop in the show-line plane. dir +1 = flying +X (left→right); -1 = flying -X.
  // Pitch runs a full 0..2π so the jets go inverted at the top instead of yawing around.
  function loopLead(u, R, y0, x0, z0, dir) {
    dir = dir == null ? -1 : dir;
    const a = u * Math.PI * 2;
    return {
      x: x0 + dir * R * Math.sin(a),
      y: y0 + R * (1 - Math.cos(a)),
      z: z0 || 0,
      yaw: dir > 0 ? 0 : Math.PI,
      pitch: a,
      roll: 0
    };
  }

  // Half Cuban Eight at constant path speed: 5/8 loop, half-roll on the 45° downline while still flying, pull to level.
  function cubanLead(u, R, y0, x0, dir) {
    dir = dir == null ? 1 : dir;
    const yawIn = dir > 0 ? 0 : Math.PI;
    const yawOut = dir > 0 ? Math.PI : 0;
    const aPull = Math.PI * 1.25;
    const loopLen = aPull * R;
    const downLen = R * 0.75;
    const recLen = R * 0.9;
    const s = u * (loopLen + downLen + recLen);
    const x1 = x0 + dir * R * Math.sin(aPull);
    const y1 = y0 + R * (1 - Math.cos(aPull));
    let x, y, pitch, roll;
    if (s < loopLen) {
      const a = s / R;
      x = x0 + dir * R * Math.sin(a);
      y = y0 + R * (1 - Math.cos(a));
      pitch = a;
      roll = 0;
    } else if (s < loopLen + downLen) {
      const d = s - loopLen;
      x = x1 - dir * d * Math.cos(Math.PI / 4);
      y = y1 - d * Math.sin(Math.PI / 4);
      pitch = aPull;
      roll = (d / downLen) * Math.PI;
    } else {
      const v = (s - loopLen - downLen) / recLen;
      x = x1 - dir * (downLen * Math.cos(Math.PI / 4) + v * recLen * 0.9);
      y = lerp(y1 - downLen * Math.sin(Math.PI / 4), y0 + 12, v);
      pitch = aPull;
      roll = Math.PI;
    }
    if (roll >= Math.PI * 0.92) {
      const v = s < loopLen + downLen ? 0 : (s - loopLen - downLen) / recLen;
      return { x: x, y: y, z: 0, yaw: yawOut, pitch: lerp(-Math.PI / 4, 0, v), roll: 0 };
    }
    return { x: x, y: y, z: 0, yaw: yawIn, pitch: pitch, roll: roll };
  }

  function takeoffRun(u, fromX, toX) {
    const rotate = smoother01(remap(u, 0.28, 1));
    return {
      x: lerp(fromX, toX, u),
      y: lerp(2.2, 16, rotate * rotate),
      z: 0,
      yaw: toX >= fromX ? 0 : Math.PI,
      pitch: rotate * 0.18,
      roll: 0,
      burner: 1,
      gear: 1 - smoother01(remap(u, 0.45, 1)),
      smoke: true
    };
  }

  function climbingPass(t, fromX, toX, y0, yPeak, z0) {
    const x = lerp(fromX, toX, t);
    const climb = Math.sin(Math.PI * t);
    const y = y0 + climb * (yPeak - y0);
    const dx = toX - fromX;
    const dy = Math.cos(Math.PI * t) * Math.PI * (yPeak - y0);
    return {
      x: x, y: y, z: z0 || 0,
      yaw: dx < 0 ? Math.PI : 0,
      pitch: Math.atan2(dy, Math.abs(dx) + 1e-6),
      roll: 0
    };
  }

  function immelmannLead(u, R, y0, x0, dir) {
    dir = dir == null ? -1 : dir;
    const yawIn = dir > 0 ? 0 : Math.PI;
    const yawOut = dir > 0 ? Math.PI : 0;
    const loopLen = Math.PI * R;
    const exitLen = R * 1.4;
    const s = u * (loopLen + exitLen);
    const roll = clamp((s - loopLen * 0.58) / (loopLen * 0.42 + exitLen * 0.5), 0, 1) * Math.PI;
    let x, y, yaw, pitch;
    if (s < loopLen) {
      const a = s / R;
      x = x0 + dir * R * Math.sin(a);
      y = y0 + R * (1 - Math.cos(a));
      yaw = yawIn;
      pitch = a;
    } else {
      x = x0 - dir * (s - loopLen);
      y = y0 + 2 * R;
      yaw = yawIn;
      pitch = Math.PI;
    }
    if (roll >= Math.PI * 0.92) return { x: x, y: y, z: 0, yaw: yawOut, pitch: 0, roll: 0 };
    return { x: x, y: y, z: 0, yaw: yaw, pitch: pitch, roll: roll };
  }

  function hesitationRoll(t, t0, t1, points, dir) {
    const u = remap(t, t0, t1);
    if (t < t0) return 0;
    if (t > t1) return (dir || 1) * Math.PI * 2;
    const idx = Math.min(points - 1, Math.floor(u * points));
    const local = u * points - idx;
    const hold = local < 0.38 ? 0 : (local - 0.38) / 0.62;
    return (dir || 1) * (idx + hold) * (Math.PI * 2 / points);
  }

  function gatedRoll(t, t0, t1, turns, dir) {
    const u = remap(t, t0, t1);
    return (dir || 1) * u * Math.PI * 2 * (turns || 1);
  }
  function mixPose(a, b, t, extra) {
    const u = smoother01(t);
    extra = extra || {};
    return Object.assign({
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      z: lerp(a.z || 0, b.z || 0, u),
      yaw: lerpAng(a.yaw || 0, b.yaw || 0, u),
      pitch: lerpAng(a.pitch || 0, b.pitch || 0, u),
      roll: lerpAng(a.roll || 0, b.roll || 0, u),
      gear: b.gear != null ? b.gear : a.gear,
      burner: b.burner != null ? b.burner : a.burner,
      smoke: b.smoke != null ? b.smoke : a.smoke,
      kind: b.kind || a.kind,
      n: b.n != null ? b.n : a.n
    }, extra);
  }

  const M = [];
  function add(m) { M.push(m); }

  add({ id: "diamond-hold", name: "Diamond Formation", ref: "—", tags: ["formation"], min: 0, max: 0, kin: 0, kout: 0, meta: "Formation study · no standalone manual envelope", dur: 8,
    desc: "Lead, Right Wing, Left Wing, Slot — the signature four-ship F/A-18E Diamond.",
    jets: function (t) { return formJets(showLinePass(t, { from: 175, to: -175, y: 36, z: 0 }), "diamond", [1, 2, 3, 4]); } });
  add({ id: "delta-hold", name: "Delta Formation", ref: "—", tags: ["formation"], min: 0, max: 0, kin: 0, kout: 0, meta: "Formation study · no standalone manual envelope", dur: 8,
    desc: "All six Super Hornets. #5 and #6 close the back corners of the Delta.",
    jets: function (t) { return formJets(showLinePass(t, { from: 180, to: -180, y: 40, z: 0 }), "delta", [1, 2, 3, 4, 5, 6]); } });
  add({ id: "line-abreast", name: "Line Abreast", ref: "2-30 / 3-7", tags: ["formation", "flat"], min: 0, max: 0, kin: 0, kout: 0, meta: "Formation study · see loop and flat pass pages", dur: 8,
    desc: "#1–#5 abreast on the 500′ show line.",
    jets: function (t) { return formJets(showLinePass(t, { from: 170, to: -170, y: 28, z: -8 }), "lineabreast", [1, 2, 3, 4, 5]); } });
  add({ id: "echelon", name: "Right Echelon Parade", ref: "2-25", tags: ["formation", "high", "low", "flat"], min: 200, max: 800, kin: 310, kout: 290, dur: 10,
    desc: "Non-aerobatic circular pass at about 60° AOB, crossing CP at ≥200′ AGL.",
    jets: function (t) {
      const a = lerp(0.15, Math.PI * 1.15, t); const R = 128;
      const lead = { x: R * Math.cos(a), y: 32, z: 32 - R * Math.sin(a) * 0.42, roll: 0.85 };
      orient(lead, function (u) { const b = lerp(0.15, Math.PI * 1.15, u); return { x: R * Math.cos(b), y: 32, z: 32 - R * Math.sin(b) * 0.42 }; }, t);
      lead.roll = 0.9;
      return formJets(lead, "echelonR", [1, 2, 3, 4]);
    } });
  add({ id: "burner-go", name: "Diamond Burner Go / Loop on Takeoff", ref: "2-10b", tags: ["high", "takeoff"], min: 0, max: 9400, kin: 0, kout: 380, dur: 16,
    desc: "Fingertip takeoff, slide to Diamond on a low show-line transition, then pull straight into a loop. No turn-around — the loop starts from the same heading as the takeoff. Clear is a climbing turn behind the crowd.",
    jets: function (t) {
      if (t < 0.18) {
        const u = remap(t, 0, 0.18);
        const lead = takeoffRun(u, -110, 6);
        const blend = smoother01(remap(u, 0.35, 0.75));
        const a = formJets(lead, "echelonR", [1, 2, 3, 4]);
        if (blend <= 0) return a;
        const b = formJets(lead, "diamond", [1, 2, 3, 4]);
        if (blend >= 1) return b;
        return a.map(function (ja, i) { return ja && b[i] ? mixPose(ja, b[i], blend) : (b[i] || ja); });
      }
      if (t < 0.86) {
        const u = remap(t, 0.18, 0.86);
        const lead = loopLead(u, 102, 16, 6, 0, 1);
        lead.burner = u < 0.42 ? 1 : 0;
        lead.gear = 0;
        lead.smoke = true;
        return formJets(lead, "diamond", [1, 2, 3, 4]);
      }
      const u = remap(t, 0.86, 1);
      const lead = { x: 6 + u * 40, y: 16 + u * 30, z: u * 52, yaw: u * 0.9, pitch: 0.14, roll: u * 0.3, gear: 0, smoke: true };
      return formJets(lead, "diamond", [1, 2, 3, 4]);
    } });
  add({ id: "half-cuban", name: "Diamond Half-Cuban Eight on Takeoff", ref: "2-10a", tags: ["high", "takeoff"], min: 0, max: 9500, kin: 0, kout: 380, dur: 14,
    desc: "Fingertip to Diamond on a low transition, then a Half-Cuban Eight: 5/8 loop, half-roll on the 45° downline, pull to level. Exit heading is opposite the takeoff.",
    jets: function (t) {
      if (t < 0.22) {
        const u = remap(t, 0, 0.22);
        const lead = takeoffRun(u, -100, 4);
        return formJets(lead, u < 0.55 ? "echelonR" : "diamond", [1, 2, 3, 4]);
      }
      const lead = cubanLead(remap(t, 0.22, 1), 96, 16, 4, 1);
      lead.burner = t < 0.45 ? 1 : 0;
      lead.gear = 0;
      lead.smoke = true;
      return formJets(lead, "diamond", [1, 2, 3, 4]);
    } });
  add({ id: "dirty-roll-5", name: "Dirty Roll on Takeoff, Blue Angel 5", ref: "2-12", tags: ["high", "low", "flat", "solo", "takeoff"], min: 0, max: 700, kin: 0, kout: 200, dur: 8,
    desc: "Takeoff, then a 360° roll away from the crowd with the gear still down. Clear is a climbing turn behind the crowd.",
    jets: function (t) {
      let p;
      if (t < 0.28) p = takeoffRun(remap(t, 0, 0.28), -120, -20);
      else if (t < 0.78) {
        const u = remap(t, 0.28, 0.78);
        p = { x: lerp(-20, 90, u), y: 16, z: 0, yaw: 0, pitch: 0.04, roll: gatedRoll(t, 0.32, 0.72, 1, 1), gear: 1 };
      } else {
        const u = remap(t, 0.78, 1);
        p = { x: 90 + u * 24, y: 16 + u * 24, z: u * 44, yaw: u * 0.7, pitch: 0.22, roll: 0, gear: 1 };
      }
      p.n = 5; p.smoke = true; p.burner = t < 0.4 ? 1 : 0;
      return [null, null, null, null, p, null];
    } });
  add({ id: "immelmann-6", name: "Low Transition Immelmann, Blue Angel 6", ref: "2-13", tags: ["high", "low", "solo", "takeoff"], min: 0, max: 4500, kin: 0, kout: 275, dur: 12,
    desc: "Low transition, Immelmann (half-loop + half-roll to upright), track the show line left-to-right, then a 270° rolling turn that points the nose at the crowd and clears behind them above 2,000′.",
    jets: function (t) {
      let p;
      const R = 88, x0 = 10, y0 = 16, dir = -1;
      if (t < 0.16) p = takeoffRun(remap(t, 0, 0.16), 118, x0);
      else if (t < 0.78) p = immelmannLead(remap(t, 0.16, 0.78), R, y0, x0, dir);
      else {
        const u = remap(t, 0.78, 1);
        const x1 = x0 - dir * R * 1.4;
        const y1 = y0 + 2 * R;
        const turnR = 62;
        const a = u * (Math.PI / 2);
        p = {
          x: x1 + turnR * Math.sin(a),
          y: y1,
          z: turnR * (1 - Math.cos(a))
        };
        orient(p, function (s) {
          const v = remap(s, 0.78, 1);
          const b = v * (Math.PI / 2);
          return { x: x1 + turnR * Math.sin(b), y: y1, z: turnR * (1 - Math.cos(b)) };
        }, t);
        p.roll = u * Math.PI * 1.5;
      }
      p.n = 6; p.gear = t < 0.12 ? 1 : 0; p.burner = t < 0.45 ? 1 : 0; p.smoke = true;
      return [null, null, null, null, null, p];
    } });
  add({ id: "diamond-360", name: "Diamond 360", ref: "2-15", tags: ["high", "low", "flat"], min: 200, max: 800, kin: 310, kout: 290, dur: 10,
    desc: "Non-aerobatic right-to-left circular pass at less than 60° AOB.",
    jets: function (t) {
      const a = lerp(-0.2, Math.PI * 1.2, t); const R = 132;
      const lead = { x: Math.cos(a) * R, y: 30, z: 8 - Math.sin(a) * 58, roll: 0.7 };
      orient(lead, function (u) { const b = lerp(-0.2, Math.PI * 1.2, u); return { x: Math.cos(b) * R, y: 30, z: 8 - Math.sin(b) * 58 }; }, t);
      lead.roll = 0.72; return formJets(lead, "diamond", [1, 2, 3, 4]);
    } });
  add({ id: "knife-edge", name: "Opposing Knife Edge", ref: "2-16", tags: ["high", "low", "flat", "solo"], min: 100, max: 1500, kin: 400, kout: 400, dur: 7,
    desc: "At CP each solo rolls to 90° bank before the cross.",
    jets: function (t) {
      const hold = 1 - smoother01(Math.abs(t - 0.5) / 0.22);
      const bank = Math.max(0, hold) * Math.PI / 2;
      return [null, null, null, null,
        { x: lerp(-175, 175, t), y: 24, z: 0, yaw: 0, pitch: 0, roll: bank, n: 5, smoke: true },
        { x: lerp(175, -175, t), y: 24, z: 2, yaw: Math.PI, pitch: 0, roll: -bank, n: 6, smoke: true }];
    } });
  add({ id: "diamond-roll", name: "Diamond Roll", ref: "2-17", tags: ["high", "low"], min: 200, max: 2600, kin: 365, kout: 365, dur: 9,
    desc: "Approaching center point in Diamond, all four roll 360° together. The text describes a roll beginning at 1,500 ft and an apex near 3,200 ft; the page's data box lists a 2,600 ft maximum.",
    jets: function (t) {
      const lead = climbingPass(t, 160, -160, 22, 78, 0);
      lead.roll = gatedRoll(t, 0.28, 0.72, 1, 1);
      lead.smoke = true;
      return formJets(lead, "diamond", [1, 2, 3, 4]);
    } });
  add({ id: "inv-inv", name: "Inverted-to-Inverted Roll", ref: "2-18", tags: ["high", "low", "flat", "solo"], min: 100, max: 1500, kin: 400, kout: 400, dur: 8,
    desc: "Solos roll inverted at the box edge, then 360° back to inverted across CP.",
    jets: function (t) {
      const spin = Math.PI + gatedRoll(t, 0.26, 0.76, 1, 1);
      const y = 26 + remap(t, 0.5, 1) * 16;
      return [null, null, null, null,
        { x: lerp(-195, 195, t), y: y, z: 0, yaw: 0, pitch: 0, roll: spin, n: 5, smoke: true },
        { x: lerp(195, -195, t), y: y, z: 3, yaw: Math.PI, pitch: 0, roll: -spin, n: 6, smoke: true }];
    } });
  add({ id: "d-aileron", name: "Diamond Aileron Roll", ref: "2-19", tags: ["high", "low", "flat"], min: 200, max: 400, kin: 400, kout: 400, dur: 7,
    desc: "Simultaneous 360° rolls inside the aerobatic box.",
    jets: function (t) {
      const lead = showLinePass(t, { from: 175, to: -175, y: 26, z: 0 });
      lead.roll = gatedRoll(t, 0.22, 0.78, 1, 1);
      return formJets(lead, "diamond", [1, 2, 3, 4]);
    } });
  add({ id: "fortus", name: "Fortus", ref: "2-20", tags: ["high", "low", "flat", "solo"], min: 200, max: 1000, kin: 275, kout: 275, dur: 9,
    desc: "Both dirty from crowd right. #5 rolls inverted at the box edge; #6 stays upright abeam. They climb at CP; #5 rolls upright past ¾ NM and both clear crowd-left.",
    jets: function (t) {
      const climb = remap(t, 0.48, 0.78) * 28;
      const r5 = t < 0.18 ? gatedRoll(t, 0.02, 0.18, 0.5, 1) : (t < 0.72 ? Math.PI : Math.PI + gatedRoll(t, 0.72, 0.9, 0.5, 1));
      const pitch = remap(t, 0.48, 0.6) * 0.22;
      const x = lerp(160, -160, t);
      return [null, null, null, null,
        { x: x, y: 22 + climb, z: -8, yaw: Math.PI, pitch: pitch, roll: r5, n: 5, gear: 1, smoke: true },
        { x: x, y: 22 + climb, z: 10, yaw: Math.PI, pitch: pitch, roll: 0, n: 6, gear: 1, smoke: true }];
    } });
  add({ id: "dirty-loop", name: "Diamond Dirty Loop", ref: "2-21", tags: ["high"], min: 200, max: 6900, kin: 180, kout: 220, dur: 12,
    desc: "Diamond loop over CP with landing gear and hooks extended.",
    jets: function (t) { const lead = loopLead(t, 98, 18, 0, 0, -1); lead.gear = 1; lead.smoke = true; return formJets(lead, "diamond", [1, 2, 3, 4]); } });
  add({ id: "mrt", name: "Solo Minimum-Radius Turn", ref: "2-22", tags: ["high", "low", "solo"], min: 150, max: 1000, kin: 350, kout: 200, dur: 9,
    desc: "Level 390° turn at 150′ AGL away from the crowd. After the turn #5 pitches vertical outboard of the show line; #6 rendezvous from behind the crowd.",
    jets: function (t) {
      const turn = Math.min(1, t / 0.78);
      const a = turn * Math.PI * 2.16;
      const R = 62;
      const p5 = { x: 28 + Math.cos(a) * R, y: 16, z: -18 - Math.sin(a) * R, n: 5, smoke: true, roll: 1.05 };
      orient(p5, function (u) {
        const b = Math.min(1, u / 0.78) * Math.PI * 2.16;
        return { x: 28 + Math.cos(b) * R, y: 16, z: -18 - Math.sin(b) * R };
      }, t);
      p5.roll = t < 0.78 ? 1.05 : 0;
      if (t > 0.78) {
        const u = remap(t, 0.78, 1);
        p5.y += u * 70;
        p5.pitch = 1.2;
        p5.burner = 1;
      }
      const p6 = { x: lerp(140, 40, t), y: 36, z: lerp(80, 20, t), yaw: Math.PI, n: 6, smoke: true };
      return [null, null, null, null, p5, p6];
    } });
  add({ id: "farvel", name: "Double Farvel", ref: "2-23", tags: ["high", "low", "flat"], min: 200, max: 400, kin: 385, kout: 385, dur: 9,
    desc: "#1 and #4 inverted, #2 and #3 upright. Diamond flat pass at 200′.",
    jets: function (t) {
      const lead = showLinePass(t, { from: 175, to: -175, y: 24, z: 0 });
      const inv = gatedRoll(t, 0.02, 0.16, 0.5, 1) + gatedRoll(t, 0.68, 0.9, 0.5, 1);
      if (t > 0.7) lead.y += remap(t, 0.7, 1) * 24;
      return formJets(lead, "diamond", [1, 2, 3, 4], { 1: inv, 4: t < 0.78 ? inv : Math.PI + remap(t, 0.78, 0.95) * Math.PI });
    } });
  add({ id: "opp-mrt", name: "Opposing Minimum-Radius Turn", ref: "2-24", tags: ["high", "low", "flat", "solo"], min: 200, max: 1500, kin: 400, kout: 400, dur: 10,
    desc: "The solos arrive abeam from behind the crowd, turn away from one another, and cross again over center point. The high-show clear is 40° nose-up with 3½ rolls; the manual specifies 2½ rolls for low and 1½ for flat.",
    jets: function (t) {
      function solo(sign, n) {
        let p;
        if (t < 0.32) {
          const u = remap(t, 0, 0.32);
          p = { x: sign * 28, y: 28, z: lerp(95, -38, u), yaw: -Math.PI / 2, pitch: 0, roll: 0 };
        } else if (t < 0.52) {
          const u = remap(t, 0.32, 0.52);
          const ang = u * 1.5 * Math.PI;
          p = {
            x: sign * (28 + Math.sin(ang) * 48),
            y: 24,
            z: -38 + Math.cos(ang) * 38,
            roll: sign * ang
          };
          orient(p, function (s) {
            const v = remap(s, 0.32, 0.52);
            const a2 = v * 1.5 * Math.PI;
            return { x: sign * (28 + Math.sin(a2) * 48), y: 24, z: -38 + Math.cos(a2) * 38 };
          }, t);
          p.roll = sign * ang;
        } else if (t < 0.72) {
          const u = remap(t, 0.52, 0.72);
          p = { x: lerp(sign * -70, sign * 70, u), y: 20, z: 0, yaw: sign > 0 ? 0 : Math.PI, pitch: 0, roll: 0 };
        } else {
          const u = remap(t, 0.72, 1);
          const clear = filter === "flat" ? { pitch: 0.17, turns: 1.5 } : filter === "low" ? { pitch: 0.35, turns: 2.5 } : { pitch: 0.7, turns: 3.5 };
          p = { x: sign * 70 + sign * u * 30, y: 20 + u * 55, z: u * 18, yaw: sign > 0 ? 0.15 : Math.PI - 0.15, pitch: clear.pitch, roll: sign * u * clear.turns * Math.PI * 2 };
        }
        p.n = n; p.smoke = true;
        return p;
      }
      return [null, null, null, null, solo(1, 5), solo(-1, 6)];
    } });
  add({ id: "opp-hrolls", name: "Opposing Horizontal Rolls", ref: "2-26", tags: ["high", "low", "flat", "solo"], min: 100, max: 7500, kin: 400, kout: 200, dur: 10,
    desc: "Slight climb, 720° of aileron roll, then a 90° pull to vertical and a 90° roll to clear behind the crowd.",
    jets: function (t) {
      function solo(dir, n) {
        let p;
        if (t < 0.52) {
          const u = t / 0.52;
          p = { x: lerp(dir * 155, dir * 10, u), y: 22 + u * 8, z: 0, yaw: dir > 0 ? Math.PI : 0, pitch: 0.06, roll: gatedRoll(t, 0.12, 0.5, 2, dir) };
        } else if (t < 0.72) {
          const u = remap(t, 0.52, 0.72);
          p = { x: dir * 10, y: 30 + u * 90, z: 0, yaw: dir > 0 ? Math.PI : 0, pitch: u * 1.4, roll: 0 };
        } else {
          const u = remap(t, 0.72, 1);
          p = { x: dir * 10 + u * 8, y: 120 + u * 20, z: u * 50, yaw: dir > 0 ? Math.PI - 0.4 : 0.4, pitch: 1.2 - u * 0.4, roll: dir * u * Math.PI / 2 };
        }
        p.n = n; p.smoke = true;
        return p;
      }
      return [null, null, null, null, solo(-1, 5), solo(1, 6)];
    } });
  add({ id: "changeover", name: "Changeover Roll", ref: "2-27a", tags: ["high", "low"], min: 300, max: 5300, kin: 365, kout: 350, dur: 10,
    desc: "From crowd-left: left echelon, climb, 360° left roll shifting back to Diamond 90° through the roll, then egress behind crowd-right.",
    jets: function (t) {
      const formBlend = smoother01(remap(t, 0.38, 0.62));
      const lead = climbingPass(t, -155, 150, 26, 82, 16);
      lead.z = lerp(16, 36, remap(t, 0.55, 1));
      lead.roll = gatedRoll(t, 0.28, 0.7, 1, -1);
      lead.smoke = true;
      const a = formJets(lead, "echelonL", [1, 2, 3, 4]);
      if (formBlend <= 0) return a;
      const b = formJets(lead, "diamond", [1, 2, 3, 4]);
      if (formBlend >= 1) return b;
      return a.map(function (ja, i) { return ja && b[i] ? mixPose(ja, b[i], formBlend) : (b[i] || ja); });
    } });
  add({ id: "sneak", name: "Sneak Pass, Blue Angel 5", ref: "2-28", tags: ["high", "low", "flat", "solo"], min: 50, max: 500, kin: 600, kout: 600, dur: 5,
    desc: "Flat pass on the 500′ show line at 50′ AGL and 600 knots.",
    jets: function (t) {
      const p = { x: lerp(-185, 185, t), y: 8, z: 22, yaw: 0, pitch: 0, roll: 0, n: 5, burner: 1, smoke: true };
      if (t > 0.78) {
        const u = remap(t, 0.78, 1);
        p.z += u * 36; p.y += u * 14; p.yaw = u * 0.45;
      }
      return [null, null, null, null, p, null];
    } });
  add({ id: "vert-rolls", name: "Sneak to Vertical Rolls, Blue Angel 6", ref: "2-29", tags: ["high", "solo"], min: 500, max: 15000, kin: 600, kout: 200, dur: 9,
    desc: "From behind the crowd, level at 500′ through CP, then pull ~85° nose-high and fly vertical rolls.",
    jets: function (t) {
      let p;
      if (t < 0.36) {
        const u = remap(t, 0, 0.36);
        p = { x: 0, y: 26, z: lerp(100, 0, u), yaw: -Math.PI / 2, pitch: 0, roll: 0 };
      } else {
        const u = remap(t, 0.36, 1);
        const pull = Math.min(1, u / 0.18);
        p = { x: 0, y: 26 + u * 150, z: -u * 8, yaw: -Math.PI / 2, pitch: pull * 1.48, roll: gatedRoll(t, 0.48, 0.98, 4, 1) };
      }
      p.n = 6; p.burner = 1; p.smoke = true;
      return [null, null, null, null, null, p];
    } });
  add({ id: "la-loop", name: "Line Abreast Loop", ref: "2-30", tags: ["high"], min: 200, max: 8400, kin: 420, kout: 350, dur: 14,
    desc: "#1–#5 transition to line-abreast, loop over CP, then #1–#4 return to Diamond and detach #5 crowd-left.",
    jets: function (t) {
      if (t < 0.16) {
        const lead = showLinePass(remap(t, 0, 0.16), { from: 150, to: 0, y: 22, z: 0 });
        const blend = smoother01(remap(t, 0.04, 0.14));
        const a = formJets(lead, "diamond", [1, 2, 3, 4, 5]);
        const b = formJets(lead, "lineabreast", [1, 2, 3, 4, 5]);
        if (blend <= 0) return a;
        if (blend >= 1) return b;
        return a.map(function (ja, i) { return ja && b[i] ? mixPose(ja, b[i], blend) : (b[i] || ja); });
      }
      if (t < 0.78) return formJets(loopLead(remap(t, 0.16, 0.78), 100, 22, 0, 0, -1), "lineabreast", [1, 2, 3, 4, 5]);
      const u = remap(t, 0.78, 1);
      const lead = { x: lerp(0, -140, u), y: 22, z: 0, yaw: Math.PI, pitch: 0, roll: 0 };
      const d = formJets(lead, "diamond", [1, 2, 3, 4]);
      d[4] = { x: lead.x - 28, y: 28 + u * 18, z: -24 - u * 16, yaw: Math.PI, n: 5, smoke: true };
      return d;
    } });
  add({ id: "four-point", name: "Opposing Four-Point Roll", ref: "2-31", tags: ["high", "low", "flat", "solo"], min: 200, max: 1500, kin: 400, kout: 400, dur: 8,
    desc: "Left four-point rolls, crossing CP inverted.",
    jets: function (t) {
      const spin = hesitationRoll(t, 0.18, 0.84, 4, -1);
      return [null, null, null, null,
        { x: lerp(-175, 175, t), y: 24, z: 0, yaw: 0, roll: spin, n: 5, smoke: true },
        { x: lerp(175, -175, t), y: 24, z: 3, yaw: Math.PI, roll: spin, n: 6, smoke: true }];
    } });
  add({ id: "vert-break", name: "Diamond Vertical Break", ref: "2-32", tags: ["high"], min: 500, max: 9000, kin: 400, kout: 300, dur: 9,
    desc: "Trail from behind the crowd, climb, diamond at 30° nose-up, then a four-way split at 60° nose-up.",
    call: function (t) { return t > 0.48 && t < 0.62 ? "BREAK" : ""; },
    jets: function (t) {
      if (t < 0.46) {
        const u = remap(t, 0, 0.46);
        const lead = { x: 0, y: 24 + u * 70, z: lerp(95, 6, u), yaw: -Math.PI / 2, pitch: 0.35 + u * 0.7, roll: 0, smoke: true };
        const blend = smoother01(remap(u, 0.4, 0.7));
        const a = formJets(lead, "trail", [1, 2, 3, 4]);
        if (blend <= 0) return a;
        const b = formJets(lead, "diamond", [1, 2, 3, 4]);
        if (blend >= 1) return b;
        return a.map(function (ja, i) { return ja && b[i] ? mixPose(ja, b[i], blend) : (b[i] || ja); });
      }
      const u = remap(t, 0.46, 1);
      return [{ x: 0, z: -1, n: 1 }, { x: 0.95, z: 0.15, n: 2 }, { x: -0.95, z: 0.15, n: 3 }, { x: 0, z: 1, n: 4 }].map(function (d) {
        return { x: d.x * u * 120, y: 94 + u * 70, z: 6 + d.z * u * 90, yaw: Math.atan2(d.z, d.x || 0.001), pitch: 1.0, n: d.n, smoke: true, burner: 1 };
      }).concat([null, null]);
    } });
  add({ id: "vert-pitch", name: "Vertical Pitch", ref: "2-33", tags: ["high", "solo"], min: 50, max: 9000, kin: 420, kout: 480, dur: 11,
    desc: "Opposing pull to 65–70° nose-up, roll inverted, Split-S through CP, then a right 360° roll and clear behind the crowd.",
    jets: function (t) {
      function solo(dir, n) {
        const yawIn = dir > 0 ? Math.PI : 0;
        if (t < 0.24) {
          const u = remap(t, 0, 0.24);
          return { x: dir * lerp(150, 40, u), y: 14 + remap(u, 0.32, 1) * 70, z: 0, yaw: yawIn, pitch: remap(u, 0.32, 1) * 1.15, roll: remap(u, 0.5, 1) * Math.PI, n: n, smoke: true };
        }
        if (t < 0.62) {
          const u = remap(t, 0.24, 0.62);
          const a = u * Math.PI;
          return { x: dir * 40 * Math.cos(a), y: 84 - 62 * (1 - Math.cos(a)), z: 0, yaw: yawIn, pitch: Math.PI + a, roll: Math.PI, n: n, smoke: true };
        }
        const u = remap(t, 0.62, 1);
        return { x: dir * lerp(-40, 130, u) * (dir > 0 ? -1 : 1), y: 22, z: u * 36, yaw: dir > 0 ? 0.35 : Math.PI - 0.35, pitch: 0, roll: u * Math.PI * 2, n: n, smoke: true };
      }
      return [null, null, null, null, solo(-1, 5), solo(1, 6)];
    } });
  add({ id: "tuck", name: "Tuck-Over Roll", ref: "2-35", tags: ["high", "low", "flat", "solo"], min: 200, max: 1500, kin: 400, kout: 400, dur: 7,
    desc: "Simultaneous left 450° rolls at CP, clear behind the crowd.",
    jets: function (t) {
      const spin = gatedRoll(t, 0.32, 0.86, 1.25, -1);
      const a = { x: lerp(-170, 170, t), y: 24, z: 8, yaw: 0, roll: spin, n: 5, smoke: true };
      const b = { x: lerp(-170, 170, t), y: 24, z: -8, yaw: 0, roll: spin, n: 6, smoke: true };
      if (t > 0.72) { const u = remap(t, 0.72, 1); a.z += u * 40; b.z += u * 40; }
      return [null, null, null, null, a, b];
    } });
  add({ id: "low-break", name: "Diamond Low-Break Cross", ref: "2-36", tags: ["high", "low", "flat"], min: 500, max: 700, kin: 360, kout: 330, dur: 11,
    desc: "From behind the crowd, the Diamond separates four ways, flies outbound at 700 ft, reverses toward the show line, then crosses center point together. The diagram labels inbound aircraft at 150, 300, and 450 ft; the data box lists 500–700 ft.",
    call: function (t) { return t > 0.18 && t < 0.32 ? "BREAK" : ""; },
    jets: function (t) {
      const dirs = [{ h: Math.PI, yIn: 16, n: 1 }, { h: 0.4, yIn: 28, n: 2 }, { h: -0.4, yIn: 40, n: 3 }, { h: 0, yIn: 16, n: 4 }];
      if (t < 0.18) return formJets({ x: 0, y: 28, z: lerp(95, 12, remap(t, 0, 0.18)), yaw: -Math.PI / 2, pitch: 0, roll: 0 }, "diamond", [1, 2, 3, 4]);
      return dirs.map(function (d) {
        if (t < 0.42) {
          const u = remap(t, 0.18, 0.42);
          return { x: Math.cos(d.h) * u * 115, y: 32, z: 12 + Math.sin(d.h) * u * 70, yaw: d.h, n: d.n, smoke: true };
        }
        if (t < 0.62) {
          const u = remap(t, 0.42, 0.62);
          const x0 = Math.cos(d.h) * 115, z0 = 12 + Math.sin(d.h) * 70;
          const a = u * Math.PI;
          return {
            x: x0 + Math.cos(d.h + Math.PI / 2) * Math.sin(a) * 28,
            y: 32,
            z: z0 + Math.sin(d.h + Math.PI / 2) * Math.sin(a) * 28,
            yaw: d.h + a, n: d.n, smoke: true, roll: 0.7
          };
        }
        const u = remap(t, 0.62, 1);
        const x0 = Math.cos(d.h) * 115, z0 = 12 + Math.sin(d.h) * 70;
        return { x: lerp(x0, 0, u), y: d.yIn, z: lerp(z0, 0, u), yaw: Math.atan2(-z0, -x0), n: d.n, smoke: true };
      }).concat([null, null]);
    } });
  add({ id: "high-alpha", name: "Section High-Alpha Pass", ref: "2-37", tags: ["high", "low", "flat", "solo"], min: 500, max: 1500, kin: 120, kout: 250, dur: 9,
    desc: "Both solos ~120 KCAS abeam. At CP #5 continues straight; #6 pitches to 60°, rolls inverted, then clears behind the crowd.",
    jets: function (t) {
      const x = lerp(-140, 140, t);
      const a = { x: x, y: 26, z: 12, yaw: 0, pitch: 0.48, roll: 0, n: 5, smoke: true };
      let b;
      if (t < 0.5) b = { x: x, y: 26, z: -12, yaw: 0, pitch: 0.48, roll: 0, n: 6, smoke: true };
      else {
        const u = remap(t, 0.5, 1);
        b = { x: x + u * 10, y: 26 + Math.min(1, u / 0.35) * 50, z: -12 + u * 48, yaw: -0.35 * u, pitch: 0.48 + Math.min(1, u / 0.35) * 0.55, roll: gatedRoll(t, 0.58, 0.82, 0.5, -1) + gatedRoll(t, 0.82, 1, 0.25, 1), n: 6, smoke: true };
      }
      return [null, null, null, null, a, b];
    } });
  add({ id: "burner270", name: "Diamond Burner 270", ref: "2-38", tags: ["high", "low", "flat"], min: 200, max: 500, kin: 220, kout: 400, dur: 10,
    desc: "From crowd-left in front of the crowd: slightly climbing left 270° in afterburner, then egress crowd-left behind the crowd.",
    jets: function (t) {
      const a = lerp(-0.2, Math.PI * 1.5, t); const R = 88;
      const lead = { x: -28 + Math.cos(a) * R, y: 22 + t * 14, z: 18 + Math.sin(a) * R * 0.62, burner: 1 };
      orient(lead, function (u) { const b = lerp(-0.2, Math.PI * 1.5, u); return { x: -28 + Math.cos(b) * R, y: 22 + u * 14, z: 18 + Math.sin(b) * R * 0.62 }; }, t);
      lead.burner = 1; lead.roll = 0.9; lead.smoke = true;
      return formJets(lead, "diamond", [1, 2, 3, 4]);
    } });
  add({ id: "delta-roll", name: "Delta Roll", ref: "2-39", tags: ["high", "low"], min: 200, max: 4300, kin: 365, kout: 365, dur: 10,
    desc: "From crowd-right behind the crowd, climb toward CP and roll 360° near 4,000′. Egress crowd-left in front of the crowd.",
    jets: function (t) {
      const lead = climbingPass(t, 150, -150, 22, 92, lerp(40, 8, t));
      lead.z = lerp(48, 10, t);
      lead.roll = gatedRoll(t, 0.32, 0.68, 1, 1);
      lead.smoke = true;
      return formJets(lead, "delta", [1, 2, 3, 4, 5, 6]);
    } });
  add({ id: "fleur", name: "Fleur De Lis", ref: "2-40", tags: ["high"], min: 200, max: 1000, kin: 420, kout: 350, dur: 13,
    desc: "Double-V climb toward center point, then all six split. The solos fly 1½ rolls; the Diamond rejoins during a loop over center point. The diagram labels 8,000 ft while the data box lists 1,000 ft maximum.",
    call: function (t) { return t > 0.26 && t < 0.4 ? "SPLIT" : ""; },
    jets: function (t) {
      if (t < 0.28) {
        const u = remap(t, 0, 0.28);
        return formJets({ x: 0, y: 24 + u * 50, z: lerp(88, 10, u), yaw: -Math.PI / 2, pitch: 0.55, roll: 0, smoke: true }, "doubleV", [1, 2, 3, 4, 5, 6]);
      }
      const dJets = formJets(loopLead(remap(t, 0.28, 1), 96, 74, 0, 0, 1), "diamond", [1, 2, 3, 4]);
      const u = remap(t, 0.28, 1);
      dJets[4] = { x: 12 + u * 130, y: 74 + Math.sin(u * Math.PI) * 20, z: 10 + u * 36, yaw: 0.15, pitch: 0.1, roll: u * Math.PI * 3, n: 5, smoke: true, burner: 1 };
      dJets[5] = { x: -12 + u * 110, y: 74 + Math.sin(u * Math.PI) * 20, z: 10 + u * 55, yaw: 0.55, pitch: 0.1, roll: -u * Math.PI * 3, n: 6, smoke: true, burner: 1 };
      return dJets;
    } });
  add({ id: "loop-break", name: "Loop Break / 6-Plane Cross", ref: "2-41", tags: ["high"], min: 200, max: 8400, kin: 420, kout: 400, dur: 16,
    desc: "Six-aircraft loop from crowd-right. They separate on the vertical down, fly outbound to 3 NM at 1,000 ft, reverse with Half-Cuban Eights, and recross at labeled inbound altitudes of 150, 300, and 450 ft. The data box lists a 200 ft minimum.",
    call: function (t) { return t > 0.36 && t < 0.5 ? "BREAK" : t > 0.82 ? "CROSS" : ""; },
    jets: function (t) {
      const headings = [Math.PI, 0.45, -2.5, 0, 2.2, -0.45]; const altsIn = [16, 28, 40, 16, 28, 40];
      if (t < 0.42) {
        const lead = loopLead(remap(t, 0, 0.42) * 0.72, 100, 20, 20, 0, -1);
        return formJets(lead, "delta", [1, 2, 3, 4, 5, 6]);
      }
      return headings.map(function (h, i) {
        const n = i + 1;
        if (t < 0.6) {
          const u = remap(t, 0.42, 0.6);
          return { x: Math.cos(h) * u * 125, y: lerp(90, 36, u), z: Math.sin(h) * u * 70, yaw: h, pitch: -0.15, n: n, smoke: true };
        }
        if (t < 0.78) {
          const u = remap(t, 0.6, 0.78);
          const a = u * Math.PI * 1.2;
          const x0 = Math.cos(h) * 125, z0 = Math.sin(h) * 70;
          return { x: x0 - Math.sin(h) * Math.sin(a) * 36, y: 36 + (1 - Math.cos(a)) * 32, z: z0 + Math.cos(h) * Math.sin(a) * 36, yaw: h + a, pitch: a, n: n, smoke: true };
        }
        const u = remap(t, 0.78, 1);
        const x0 = Math.cos(h) * 125, z0 = Math.sin(h) * 70;
        return { x: lerp(x0, 0, u), y: altsIn[i], z: lerp(z0, 0, u), yaw: Math.atan2(-z0, -x0), n: n, smoke: true };
      });
    } });
  add({ id: "breakout", name: "Delta Break Out / Head-On", ref: "2-42", tags: ["high", "low", "flat"], min: 300, max: 2900, kin: 330, kout: 300, dur: 12,
    desc: "Manual diagram, crowd view left→right: 6, 2, 1 & 4, 3, 5. Head-on to CP, then peel outboard — 6/2 left, 1&4 straight, 3/5 right. Nobody crosses.",
    call: function (t) { return t > 0.34 && t < 0.5 ? "READY, BREAK!" : ""; },
    jets: function (t) {
      const uIn = Math.min(1, remap(t, 0, 0.38));
      const y0 = 28 + uIn * 22;
      const z0 = lerp(-58, 10, uIn);
      const yaw0 = Math.PI / 2;
      const pitch0 = 0.2;
      const inbound = [
        { n: 1, x: 0, zOff: 10 },
        { n: 2, x: -34, zOff: -4 },
        { n: 3, x: 34, zOff: -4 },
        { n: 4, x: 0, zOff: -18 },
        { n: 5, x: 60, zOff: -8 },
        { n: 6, x: -60, zOff: -8 }
      ].map(function (s) {
        return { x: s.x, y: y0, z: z0 + s.zOff, yaw: yaw0, pitch: pitch0, roll: 0, n: s.n, smoke: true };
      });
      if (t < 0.38) return inbound;
      const u = remap(t, 0.38, 1);
      const peel = [
        { x: 0, y: 1.2, z: 0.8, yaw: 0, pitch: 0.95, roll: 0 },
        { x: -0.9, y: 0.72, z: 0.5, yaw: 0.75, pitch: 0.45, roll: 0.78 },
        { x: 0.9, y: 0.72, z: 0.5, yaw: -0.75, pitch: 0.45, roll: -0.78 },
        { x: 0, y: 1.05, z: 0.75, yaw: 0, pitch: 0.82, roll: 0 },
        { x: 1.3, y: 0.42, z: 0.12, yaw: -1.25, pitch: 0.22, roll: -1.05 },
        { x: -1.3, y: 0.42, z: 0.12, yaw: 1.25, pitch: 0.22, roll: 1.05 }
      ];
      return inbound.map(function (j, i) {
        const p = peel[i];
        return {
          x: j.x + p.x * u * 180,
          y: j.y + p.y * u * 155,
          z: j.z + p.z * u * 105,
          yaw: yaw0 + p.yaw * u,
          pitch: lerp(pitch0, p.pitch, u),
          roll: p.roll * Math.min(1, u / 0.22),
          n: j.n,
          smoke: true,
          burner: 1
        };
      });
    } });
  add({ id: "flat-pass", name: "Diamond Flat Pass", ref: "3-2", tags: ["flat"], min: 200, max: 200, kin: 335, kout: 335, dur: 7,
    desc: "Diamond flat pass at 200′ AGL on the 500′ show line.",
    jets: function (t) { return formJets(showLinePass(t, { from: 170, to: -170, y: 22, z: -12 }), "diamond", [1, 2, 3, 4]); } });
  add({ id: "ech-flat", name: "Left Echelon Flat Pass", ref: "3-3", tags: ["flat"], min: 300, max: 500, kin: 335, kout: 335, dur: 9,
    desc: "Left echelon flat pass, back to Diamond ~1 NM in front of the crowd.",
    jets: function (t) {
      const lead = showLinePass(t, { from: -165, to: 155, y: 30, z: 18 }); lead.yaw = 0;
      const blend = smoother01(remap(t, 0.52, 0.72));
      const a = formJets(lead, "echelonL", [1, 2, 3, 4]);
      if (blend <= 0) return a;
      const b = formJets(lead, "diamond", [1, 2, 3, 4]);
      if (blend >= 1) return b;
      return a.map(function (ja, i) { return ja && b[i] ? mixPose(ja, b[i], blend) : (b[i] || ja); });
    } });
  add({ id: "dirty-clean", name: "Dirty / Clean Flat Pass", ref: "3-5", tags: ["flat"], min: 200, max: 200, kin: 240, kout: 500, dur: 8,
    desc: "Diamond dirty down the show line while #6 overtakes clean.",
    jets: function (t) {
      const lead = showLinePass(t, { from: 165, to: -165, y: 22, z: 0 }); lead.gear = 1;
      const jets = formJets(lead, "diamond", [1, 2, 3, 4]);
      jets[5] = { x: lerp(-36, 70, t), y: 22 + remap(t, 0.45, 1) * 32, z: -16, yaw: 0, n: 6, smoke: true, burner: 1 };
      return jets;
    } });
  add({ id: "man-delta", name: "Maneuvering Delta", ref: "3-8", tags: ["low", "flat"], min: 200, max: 400, kin: 335, kout: 335, dur: 9,
    desc: "Delta left turn across CP to set up the Delta Flat Pass.",
    jets: function (t) {
      const a = lerp(3.4, 1.2, t); const R = 120;
      const lead = { x: Math.cos(a) * R, y: 28, z: 20 + Math.sin(a) * 50, roll: 0.7 };
      orient(lead, function (u) { const b = lerp(3.4, 1.2, u); return { x: Math.cos(b) * R, y: 28, z: 20 + Math.sin(b) * 50 }; }, t);
      lead.roll = 0.75; return formJets(lead, "delta", [1, 2, 3, 4, 5, 6]);
    } });
  add({ id: "delta-ail", name: "Delta Aileron Roll", ref: "3-9", tags: ["low", "flat"], min: 200, max: 500, kin: 400, kout: 400, dur: 7,
    desc: "All six perform simultaneous 360° rolls in the box.",
    jets: function (t) {
      const lead = showLinePass(t, { from: 170, to: -170, y: 26, z: 8 });
      lead.roll = gatedRoll(t, 0.22, 0.78, 1, 1);
      return formJets(lead, "delta", [1, 2, 3, 4, 5, 6]);
    } });
  add({ id: "pitch-up", name: "Delta Pitch-Up Break", ref: "3-11", tags: ["high", "low", "flat"], min: 200, max: 800, kin: 420, kout: 0, dur: 10,
    desc: "Each jet pitches out with ~2 seconds spacing and configures for landing.",
    jets: function (t) {
      return [1, 2, 3, 4, 5, 6].map(function (n) {
        const delay = (n - 1) * 0.09; const u = remap(t, delay, delay + 0.55);
        return { x: lerp(145, -32, clamp(t * 1.1 - delay * 0.3, 0, 1)) + u * 16, y: 22 + u * 24, z: -8 + u * 56, yaw: Math.PI + u * 1.4, pitch: u * 0.25, roll: u * 0.8, n: n, gear: u > 0.55 ? 1 : 0, smoke: u < 0.7 };
      });
    } });
  add({ id: "fat-albert", name: "C-130 Assault Landing", ref: "2-7", tags: ["c130"], min: 0, max: 1200, kin: 135, kout: 0, dur: 10,
    desc: "20–25° nose-down assault approach. After landing, reverse, face the crowd, and exit.",
    jets: function (t) {
      let p;
      if (t < 0.55) {
        const u = remap(t, 0, 0.55);
        p = { x: lerp(-8, 4, u), y: lerp(70, 28, u), z: lerp(90, 18, u), yaw: -1.15, pitch: -0.22 };
      } else if (t < 0.82) {
        const u = remap(t, 0.55, 0.82);
        p = { x: lerp(4, 0, u), y: lerp(28, 3, u), z: lerp(18, 0, u), yaw: lerpAng(-1.15, Math.PI, u), pitch: lerp(-0.22, -0.42, u) };
      } else {
        const u = remap(t, 0.82, 1);
        p = { x: lerp(0, -14, u), y: 3, z: 0, yaw: Math.PI + u * 1.45, pitch: lerp(-0.42, 0, u) };
      }
      p.kind = "c130"; p.n = 0; p.gear = 1; p.smoke = false;
      return [p, null, null, null, null, null];
    } });

  // Additional profiles and show alternatives are separate entries so the
  // low and flat catalogs never replay a high-show aerobatic path by mistake.
  add({ id: "burner-low", name: "Diamond Burner Go / Low Transition", ref: "2-10b", tags: ["low", "flat", "takeoff"], min: 0, max: 0, kin: 0, kout: 0, meta: "Low transition · separate envelope not published", dur: 8,
    desc: "The four aircraft take off in fingertip, move into Diamond, and accelerate in a low transition along the show line. The low and flat sequence lists this takeoff profile in place of the burner loop.",
    jets: function(t){ const lead=takeoffRun(t,-155,155); const blend=smoother01(remap(t,.35,.72)); const a=formJets(lead,"echelonR",[1,2,3,4]),b=formJets(lead,"diamond",[1,2,3,4]); return a.map(function(j,i){return j ? mixPose(j,b[i],blend) : null;}); } });
  add({ id: "half-cuban-break", name: "Diamond Half-Cuban Eight Break Out", ref: "2-11", tags: ["high", "formation"], min: 0, max: 9500, kin: 0, kout: 380, dur: 13,
    desc: "When clouds block the backside loop, the Diamond can break from the Half-Cuban Eight near 500 ft: 1 and 4 continue along the show line while 2 and 3 separate in front of and behind the crowd.",
    jets: function(t){ if(t<.65)return M.find(function(m){return m.id==="half-cuban";}).jets(t/.65*.8); const u=remap(t,.65,1); return [{x:-35-u*140,y:22,z:0,yaw:Math.PI,n:1,smoke:true},{x:-35,y:22,z:-u*135,yaw:-Math.PI/2,n:2,smoke:true},{x:-35,y:22,z:u*135,yaw:Math.PI/2,n:3,smoke:true},{x:-55-u*140,y:22,z:8,yaw:Math.PI,n:4,smoke:true},null,null];} });
  add({ id: "delta-head-on", name: "Delta Head-On / Opposing 360", ref: "2-14", tags: ["high", "low", "flat", "solo"], min: 200, max: 5500, kin: 360, kout: 360, dur: 12,
    desc: "The Delta approaches head-on and climbs. The solos detach 1,500 ft before center point, turn away from one another, and return to cross at center point while the Diamond continues its climb and clears to the right.",
    jets: function(t){const u=remap(t,0,.45),lead={x:0,y:35+u*25,z:lerp(-125,6,u),yaw:Math.PI/2,pitch:.16,smoke:true}; const j=formJets(lead,"delta",[1,2,3,4,5,6]); if(t<.45)return j; const v=remap(t,.45,1); for(let i=0;i<4;i++){j[i].x+=v*90;j[i].y+=v*75;j[i].z+=v*90;j[i].yaw+=v*.7;} j[4]={x:-55*Math.cos(v*Math.PI*2),y:28,z:35*Math.sin(v*Math.PI*2),yaw:v*Math.PI*2,n:5,smoke:true};j[5]={x:55*Math.cos(v*Math.PI*2),y:30,z:-35*Math.sin(v*Math.PI*2),yaw:Math.PI+v*Math.PI*2,n:6,smoke:true};return j;} });
  add({ id: "diamond-dirty-roll", name: "Diamond Dirty Roll", ref: "3-4", tags: ["low"], min: 200, max: 3000, kin: 275, kout: 275, dur: 9,
    desc: "With landing gear extended, all four Diamond aircraft climb and roll 360° together, starting around 1,200 ft. The manual text places the apex near 2,000 ft.",
    jets: function(t){const lead=climbingPass(t,160,-160,22,66,0);lead.roll=gatedRoll(t,.26,.74,1,1);lead.gear=1;lead.smoke=true;return formJets(lead,"diamond",[1,2,3,4]);} });
  add({ id: "roll-inverted-6", name: "Low Transition / Roll to Inverted, Blue Angel 6", ref: "3-1", tags: ["flat", "solo", "takeoff"], min: 0, max: 1000, kin: 0, kout: 350, dur: 9,
    desc: "Blue Angel 6 makes a low transition, pulls to 15–45° nose-up, rolls inverted at 200–500 ft, then completes a 270° roll to clear in front of or behind the crowd.",
    jets: function(t){let p=t<.35?takeoffRun(t/.35,-135,-25):{x:lerp(-25,145,remap(t,.35,1)),y:18+remap(t,.35,1)*28,z:0,yaw:0,pitch:.3,roll:t<.65?Math.PI*remap(t,.35,.65):Math.PI+Math.PI*1.5*remap(t,.65,1),gear:0,smoke:true};p.n=6;return[null,null,null,null,null,p];} });
  add({ id: "mrt-flat", name: "Solo Minimum-Radius Turn (Flat)", ref: "2-22a", tags: ["flat", "solo"], min: 150, max: 500, kin: 350, kout: 200, dur: 9,
    desc: "Blue Angel 6 makes a level 360° turn at 200 ft away from the crowd, then rendezvous over Blue Angel 5 at 500 ft.",
    jets: function(t){const a=t*Math.PI*2,R=62,p6={x:25+R*Math.cos(a),y:23,z:-15-R*Math.sin(a),yaw:a+Math.PI/2,roll:.85,n:6,smoke:true};const p5={x:lerp(135,-80,t),y:24,z:45,yaw:Math.PI,n:5,smoke:true};if(t>.78)p6.y+=remap(t,.78,1)*28;return[null,null,null,null,p5,p6];} });
  add({ id: "sneak-turn", name: "Sneak to Left Turn-Out, Blue Angel 6", ref: "3-6", tags: ["low", "flat", "solo"], min: 500, max: 1500, kin: 600, kout: 400, dur: 7,
    desc: "Blue Angel 6 makes a 500 ft pass from behind the crowd toward the front, then turns out to crowd-left in front of the crowd.",
    jets: function(t){const u=remap(t,.7,1);return[null,null,null,null,null,{x:-u*105,y:28+u*17,z:lerp(120,-110,t),yaw:-Math.PI/2-u*.9,roll:-u*.6,n:6,smoke:true}];} });
  add({ id: "la-flat", name: "Line Abreast Flat Pass", ref: "3-7", tags: ["low", "flat", "formation"], min: 200, max: 500, kin: 335, kout: 335, dur: 8,
    desc: "Aircraft 1–5 move into Line Abreast around 3 NM out, level at 200 ft on the 500 ft show line, then 1–4 return to Diamond while 5 detaches crowd-left.",
    jets: function(t){const lead=showLinePass(t,{from:170,to:-170,y:24,z:-8});const j=formJets(lead,t>.78?"diamond":"lineabreast",t>.78?[1,2,3,4]:[1,2,3,4,5]);if(t>.78)j[4]={x:lead.x-30,y:26,z:-25-remap(t,.78,1)*30,yaw:Math.PI,n:5,smoke:true};return j;} });
  add({ id: "delta-flat", name: "Delta Flat Pass", ref: "3-10", tags: ["high", "low", "flat", "formation"], min: 200, max: 200, kin: 335, kout: 335, dur: 8,
    desc: "All six aircraft make a straight, level pass at 200 ft AGL on the 500 ft show line, then remain in front of the crowd to set up the Delta Break Out or Head-On.",
    jets: function(t){return formJets(showLinePass(t,{from:175,to:-175,y:24,z:-8}),"delta",[1,2,3,4,5,6]);} });
  add({ id: "barrel-break", name: "Barrel Roll Break", ref: "2-34", tags: ["high", "formation"], min: 300, max: 8800, kin: 400, kout: 380, dur: 12,
    desc: "The Diamond approaches from in front of the crowd, climbs, rolls 90° left, and completes the back side of a looping path. Near 500 ft, 1 and 4 continue on the show line while 2 and 3 split in front of and behind the crowd.",
    jets: function(t){if(t<.68){const lead=loopLead(t/.68*.78,95,24,25,-8,-1);lead.roll=-Math.PI/2*remap(t,.25,.52);lead.smoke=true;return formJets(lead,"diamond",[1,2,3,4]);}const u=remap(t,.68,1);return[{x:-35-u*120,y:25,z:0,yaw:Math.PI,n:1,smoke:true},{x:-35,y:25,z:-u*125,yaw:-Math.PI/2,n:2,smoke:true},{x:-35,y:25,z:u*125,yaw:Math.PI/2,n:3,smoke:true},{x:-55-u*120,y:25,z:8,yaw:Math.PI,n:4,smoke:true},null,null];} });
  function addC130(id,name,ref,min,max,kin,kout,desc,flight){add({id:id,name:name,ref:ref,tags:["c130"],min:min,max:max,kin:kin,kout:kout,dur:9,desc:desc,jets:function(t){const p=flight(t);p.kind="c130";p.n=0;p.smoke=false;return[p,null,null,null,null,null];}});}
  addC130("c130-takeoff","C-130 Low Transition Takeoff","2-1",0,1500,0,110,"Fat Albert rotates to a 45° nose-high attitude after takeoff, then levels between 1,000 and 1,500 ft AGL.",function(t){return{x:lerp(-145,145,t),y:2+Math.sin(Math.PI*t/2)*65,z:0,yaw:0,pitch:t<.5?t*.9:.45,gear:t<.4?1:0};});
  addC130("c130-remote","C-130 Remote Entry","2-2",100,1800,240,110,"Entering from behind the crowd, Fat Albert turns to downwind, descends toward the 500 ft line, then climbs 45° after passing center point.",function(t){return{x:lerp(120,-120,t),y:60-30*Math.sin(Math.PI*t)+35*remap(t,.6,1),z:90-100*t,yaw:Math.PI-t*.8,pitch:remap(t,.6,1)*.78};});
  addC130("c130-parade","C-130 Parade Pass","2-3",200,1000,260,260,"After a teardrop turn onto the 30° ingress line, the aircraft descends to 200 ft, turns toward the crowd, and departs on the 30° egress line.",function(t){const a=lerp(-1.1,1.8,t);return{x:130*Math.cos(a),y:25+15*Math.abs(t-.5),z:35+75*Math.sin(a),yaw:a+Math.PI/2,roll:.7};});
  addC130("c130-flat","C-130 Flat Pass","2-4",40,1000,210,260,"Fat Albert returns to the 500 ft line, passes center point at about 50 ft AGL, then climbs away from the crowd.",function(t){return{x:lerp(155,-155,t),y:8+30*remap(t,.72,1),z:5+40*remap(t,.72,1),yaw:Math.PI,pitch:.25*remap(t,.72,1)};});
  addC130("c130-head","C-130 Head-On Pass","2-5",200,1150,210,260,"The aircraft approaches center point head-on and begins a 20° climb before reaching it, then turns to downwind for the assault landing.",function(t){return{x:20+50*remap(t,.7,1),y:28+48*remap(t,.5,1),z:lerp(-125,110,t),yaw:Math.PI/2+remap(t,.7,1),pitch:.35*remap(t,.5,1)};});
  addC130("c130-remote-head","C-130 Remote Head-On Pass","2-6",200,1150,210,260,"At a remote site, Fat Albert approaches head-on, then climbs about 45° to exit behind the crowd.",function(t){return{x:0,y:24+75*remap(t,.48,1),z:lerp(-125,110,t),yaw:Math.PI/2,pitch:.78*remap(t,.48,1)};});

  let idx = M.findIndex(function (m) { return m.id === "burner-go"; });
  if (idx < 0) idx = 0;
  let view = "spectator", playing = true, speed = 1, t = 0, last = performance.now(), filter = "all", hover = -1, search = "";
  let coasting = false, coastT = 0;
  let coastState = [null, null, null, null, null, null];
  const trails = [[], [], [], [], [], [], []];
  const jetSoft = [null, null, null, null, null, null];
  const cam = { x: 0, y: 14, z: 0, zoom: 0.95, tx: 0, ty: 14, tz: 0, tzoom: 0.95 };
  const TAGS = [["all", "All"], ["high", "High"], ["low", "Low"], ["flat", "Flat"], ["solo", "Solos"], ["formation", "Formations"], ["c130", "C-130"]];
  const SHOW_SEQUENCE = {
    high: ["half-cuban","burner-go","half-cuban-break","dirty-roll-5","immelmann-6","delta-head-on","diamond-360","knife-edge","diamond-roll","inv-inv","d-aileron","fortus","dirty-loop","mrt","farvel","opp-mrt","echelon","opp-hrolls","changeover","sneak","vert-rolls","la-loop","four-point","vert-break","vert-pitch","barrel-break","tuck","low-break","high-alpha","burner270","delta-roll","fleur","loop-break","breakout","delta-flat","pitch-up"],
    low: ["burner-low","dirty-roll-5","immelmann-6","delta-head-on","diamond-360","knife-edge","diamond-roll","inv-inv","d-aileron","fortus","diamond-dirty-roll","mrt","farvel","opp-mrt","echelon","opp-hrolls","changeover","sneak","sneak-turn","la-flat","four-point","low-break","tuck","burner270","high-alpha","delta-roll","delta-ail","delta-flat","man-delta","breakout","pitch-up"],
    flat: ["burner-low","dirty-roll-5","roll-inverted-6","delta-head-on","diamond-360","knife-edge","flat-pass","inv-inv","d-aileron","fortus","dirty-clean","mrt-flat","farvel","opp-mrt","echelon","opp-hrolls","ech-flat","sneak","sneak-turn","la-flat","four-point","low-break","tuck","burner270","high-alpha","delta-ail","delta-flat","man-delta","breakout","pitch-up"],
    c130: ["c130-takeoff","c130-remote","c130-parade","c130-flat","c130-head","c130-remote-head","fat-albert"]
  };
  const PDF_PAGE = {"2-10a":19,"2-10b":20,"2-11":21,"2-22a":33,"2-27a":39,"2-30 / 3-7":42};
  function pageFor(ref) {
    if (PDF_PAGE[ref]) return PDF_PAGE[ref];
    const second = /^2-(\d+)$/.exec(ref), third = /^3-(\d+)$/.exec(ref);
    if (third) return Number(third[1]) + 54;
    if (!second) return 1;
    const n = Number(second[1]);
    return n + (n <= 7 ? 11 : n <= 22 ? 10 : n <= 27 ? 11 : 12);
  }

  function resizeStage() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const nextW = Math.max(960, Math.round((rect.width || 1600) * dpr));
    const nextH = Math.max(540, Math.round((rect.height || 900) * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    W = canvas.width;
    H = canvas.height;
  }
  window.addEventListener("resize", resizeStage);
  if (window.ResizeObserver) {
    new ResizeObserver(resizeStage).observe(canvas.parentElement || canvas);
  }

  function filtered() {
    const base = M.map(function (m, i) { return { m: m, i: i }; });
    const sequence = SHOW_SEQUENCE[filter];
    const matches = sequence ? sequence.map(function (id) { return base.find(function (x) { return x.m.id === id; }); }).filter(Boolean) : base.filter(function (x) { return filter === "all" || x.m.tags.indexOf(filter) >= 0; });
    if (filter === "all") matches.sort(function (a,b) {
      const rank = function (x) { return (x.m.ref === "—" || x.m.id === "line-abreast" ? 2000 : x.m.tags.indexOf("c130") >= 0 ? 1000 : 0) + pageFor(x.m.ref); };
      return rank(a) - rank(b);
    });
    return matches.filter(function (x) { return !search || (x.m.name + " " + x.m.ref + " " + x.m.desc).toLowerCase().indexOf(search) >= 0; });
  }
  function stepManeuver(direction) {
    const list = filtered();
    if (!list.length) return;
    const current = list.findIndex(function (x) { return x.i === idx; });
    setManeuver(list[(current + direction + list.length) % list.length].i);
  }
  function setManeuver(i, reset) {
    idx = (i + M.length) % M.length;
    if (reset !== false) {
      t = 0;
      coasting = false;
      coastT = 0;
      trails.forEach(function (tr) { tr.length = 0; });
      for (let s = 0; s < jetSoft.length; s++) jetSoft[s] = null;
    }
    const m = M[idx];
    const raw = m.jets(clamp(t, 0, 0.999));
    for (let s = 0; s < jetSoft.length; s++) jetSoft[s] = raw[s] || null;
    aimCamera(raw, 1, m, true);
    mTitle.textContent = m.name; mRef.textContent = m.ref === "—" ? "FORMATION STUDY" : "MANUAL " + m.ref;
    mMeta.textContent = m.meta || (m.min.toLocaleString() + "–" + m.max.toLocaleString() + " ft AGL · " + m.kin + "→" + m.kout + " knots");
    mDesc.textContent = m.desc;
    formationBadgeEl.textContent = m.tags.indexOf("c130") >= 0 ? "FAT ALBERT" : m.tags.indexOf("solo") >= 0 ? "SOLO FLIGHT" : m.name.indexOf("Delta") >= 0 || m.name.indexOf("6-Plane") >= 0 ? "SIX AIRCRAFT" : "FORMATION FLIGHT";
    manualLinkEl.href = "maneuvers-manual.pdf#page=" + pageFor(m.ref);
    progressEl.value = String(Math.round(t * 1000));
    document.querySelectorAll(".m-item").forEach(function (el) { el.classList.toggle("on", Number(el.dataset.i) === idx); });
  }
  function buildList() {
    filtersEl.innerHTML = "";
    TAGS.forEach(function (tg) {
      const b = document.createElement("button"); b.className = "chip" + (filter === tg[0] ? " on" : ""); b.type = "button"; b.textContent = tg[1];
      b.onclick = function () { filter = tg[0]; buildList(); const list = filtered(); if (list.length && !list.some(function (x) { return x.i === idx; })) setManeuver(list[0].i); }; filtersEl.appendChild(b);
    });
    mList.innerHTML = "";
    const matches = filtered();
    resultCountEl.textContent = matches.length + " SHOWN";
    matches.forEach(function (x, n) {
      const b = document.createElement("button"); b.className = "m-item" + (x.i === idx ? " on" : ""); b.type = "button"; b.dataset.i = String(x.i);
      b.textContent = x.m.name;
      const sub = document.createElement("small"); sub.textContent = (SHOW_SEQUENCE[filter] ? String(n + 1).padStart(2, "0") + " · " : "") + x.m.ref + " · " + x.m.tags.filter(function (tg) { return tg !== "formation"; }).join(" · "); b.appendChild(sub);
      b.onclick = function () { setManeuver(x.i); }; mList.appendChild(b);
    });
    if (!matches.length) { const empty = document.createElement("p"); empty.className = "empty-result"; empty.textContent = "No maneuvers match this search."; mList.appendChild(empty); }
  }
  document.getElementById("playBtn").onclick = function () { playing = !playing; this.textContent = playing ? "PAUSE" : "PLAY"; };
  document.getElementById("prevBtn").onclick = function () { stepManeuver(-1); };
  document.getElementById("nextBtn").onclick = function () { stepManeuver(1); };
  document.getElementById("replayBtn").onclick = function () {
    t = 0;
    coasting = false;
    coastT = 0;
    playing = true;
    document.getElementById("playBtn").textContent = "PAUSE";
    trails.forEach(function (tr) { tr.length = 0; });
    for (let s = 0; s < jetSoft.length; s++) jetSoft[s] = null;
  };
  document.getElementById("spd").oninput = function (e) { speed = Number(e.target.value); speedValueEl.textContent = speed.toFixed(1).replace(/\.0$/, "") + "×"; };
  searchEl.addEventListener("input", function () { search = searchEl.value.trim().toLowerCase(); buildList(); });
  progressEl.addEventListener("input", function () { t = Number(progressEl.value) / 1000; coasting = false; playing = false; document.getElementById("playBtn").textContent = "PLAY"; trails.forEach(function (tr) { tr.length = 0; }); for (let s = 0; s < jetSoft.length; s++) jetSoft[s] = null; });
  document.querySelectorAll("[data-maneuver]").forEach(function (b) { b.addEventListener("click", function () { const i = M.findIndex(function (m) { return m.id === b.dataset.maneuver; }); if (i >= 0) { filter = "all"; search = ""; searchEl.value = ""; buildList(); setManeuver(i); document.getElementById("theater").scrollIntoView({ behavior: "smooth" }); } }); });
  document.querySelectorAll("[data-show]").forEach(function (b) { b.addEventListener("click", function () { filter = b.dataset.show; search = ""; searchEl.value = ""; buildList(); const first = filtered()[0]; if (first) setManeuver(first.i); document.getElementById("theater").scrollIntoView({ behavior: "smooth" }); }); });
  document.querySelectorAll("[data-view]").forEach(function (b) {
    b.onclick = function () { view = b.dataset.view; document.querySelectorAll("[data-view]").forEach(function (x) { x.classList.toggle("active", x === b); }); };
  });
  window.addEventListener("keydown", function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); document.getElementById("playBtn").click(); }
    if (e.code === "ArrowRight") stepManeuver(1);
    if (e.code === "ArrowLeft") stepManeuver(-1);
    if (e.key === "1") document.querySelector("[data-view=spectator]").click();
    if (e.key === "2") document.querySelector("[data-view=profile]").click();
    if (e.key === "3") document.querySelector("[data-view=overhead]").click();
  });
  canvas.addEventListener("mousemove", function (e) {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height);
    hover = -1;
    currentJets().forEach(function (j, i) {
      if (!j) return;
      const p = project(j.x, j.y, j.z);
      if (Math.hypot(p.sx - mx, p.sy - my) < 42) hover = i;
    });
  });
  canvas.addEventListener("mouseleave", function () { hover = -1; });

  function projectWith(x, y, z, c) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(z) || !c || !isFinite(c.zoom)) {
      return { sx: W / 2, sy: H / 2, depth: 120 };
    }
    const zx = x - (c.x || 0);
    const zy = y - (c.y || 0);
    const zz = z - (c.z || 0);
    const fit = Math.min(W / 1600, H / 900) || 1;
    const zm = c.zoom || 1;
    if (view === "overhead") {
      const k = 2.35 * fit * zm;
      return { sx: W / 2 + zx * k, sy: H * 0.52 + zz * k * 0.9, depth: 220 - y };
    }
    if (view === "profile") {
      const kx = 2.45 * fit * zm;
      const ky = 1.55 * fit * zm;
      return { sx: W / 2 + zx * kx, sy: H * 0.82 - zy * ky, depth: 90 - z };
    }
    const depth = Math.max(80, 250 - zz);
    const scX = (3.35 * fit * zm) * (220 / depth);
    const scY = (2.72 * fit * zm) * (220 / depth);
    const sx = W / 2 + zx * scX;
    const sy = H * 0.84 - zy * scY - zz * 0.035;
    if (!isFinite(sx) || !isFinite(sy)) return { sx: W / 2, sy: H / 2, depth: 120 };
    return { sx: sx, sy: sy, depth: depth };
  }
  function project(x, y, z) { return projectWith(x, y, z, cam); }

  function aimCamera(jets, dt, m, snap) {
    // Crowd view, camera planted on the ground so loops occupy the sky.
    cam.tx = 0; cam.ty = 14; cam.tz = 0; cam.tzoom = 0.95;
    if (snap) {
      cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; cam.zoom = cam.tzoom;
      return;
    }
    const k = expFollow(dt, 3.2);
    cam.x += (cam.tx - cam.x) * k;
    cam.y += (cam.ty - cam.y) * k;
    cam.z += (cam.tz - cam.z) * k;
    cam.zoom += (cam.tzoom - cam.zoom) * k;
  }

  function blendJet(prev, next, dt) {
    if (!next) return null;
    if (!prev) {
      return {
        x: next.x, y: next.y, z: next.z,
        yaw: next.yaw || 0, pitch: next.pitch || 0, roll: next.roll || 0,
        gear: next.gear || 0, burner: next.burner || 0, smoke: next.smoke,
        kind: next.kind, n: next.n
      };
    }
    const k = expFollow(dt, 32);
    const pa = basis(prev.yaw || 0, prev.pitch || 0, prev.roll || 0);
    const pb = basis(next.yaw || 0, next.pitch || 0, next.roll || 0);
    const align = pa.fwd.x * pb.fwd.x + pa.fwd.y * pb.fwd.y + pa.fwd.z * pb.fwd.z;
    const rk = align > 0.82 ? 1 : expFollow(dt, 22);
    return {
      x: prev.x + (next.x - prev.x) * k,
      y: prev.y + (next.y - prev.y) * k,
      z: prev.z + (next.z - prev.z) * k,
      yaw: lerpAng(prev.yaw || 0, next.yaw || 0, rk),
      pitch: lerpAng(prev.pitch || 0, next.pitch || 0, rk),
      roll: lerpAng(prev.roll || 0, next.roll || 0, rk),
      gear: next.gear, burner: next.burner, smoke: next.smoke,
      kind: next.kind, n: next.n
    };
  }

  function smoothJets(raw, dt) {
    const out = [null, null, null, null, null, null];
    for (let i = 0; i < 6; i++) {
      jetSoft[i] = blendJet(jetSoft[i], raw[i] || null, dt);
      out[i] = jetSoft[i];
    }
    return out;
  }

  function rotateP(p, yaw, pitch, roll) {
    let x = p[0], y = p[1], z = p[2];
    yaw = yaw || 0; pitch = pitch || 0; roll = roll || 0;
    if (!isFinite(yaw) || !isFinite(pitch) || !isFinite(roll)) { yaw = 0; pitch = 0; roll = 0; }
    const cr = Math.cos(roll), sr = Math.sin(roll);
    let y1 = y * cr - z * sr, z1 = y * sr + z * cr; y = y1; z = z1;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let x2 = x * cp - y * sp, y2 = x * sp + y * cp; x = x2; y = y2;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    return { x: x * cy - z * sy, y: y2, z: x * sy + z * cy };
  }

  const BA = "#0b2f78", BA2 = "#071e54", BA3 = "#133a92", GD = "#e8c547", GD2 = "#f4d56a";
  const CAN = "#8fb9de", CAND = "#1a3a58", INT = "#101215", NOZ = "#2a2d33", WHT = "#e8eef6";

  function buildSuperHornet() {
    const P = [];
    function poly(c, v) { P.push({ c: c, v: v }); }
    function both(c, v) {
      poly(c, v);
      poly(c, v.map(function (p) { return [p[0], p[1], -p[2]]; }).reverse());
    }
    /* pointed radome */
    poly(BA, [[6.35, 0.12, 0], [5.25, 0.46, 0.34], [5.25, 0.46, -0.34]]);
    both(BA2, [[6.35, 0.12, 0], [5.25, -0.22, 0.3], [5.25, 0.46, 0.34]]);
    poly(BA2, [[6.35, 0.12, 0], [5.25, -0.22, -0.3], [5.25, -0.22, 0.3]]);
    /* forward fuselage */
    poly(BA, [[5.25, 0.46, 0.34], [3.55, 0.52, 0.42], [3.55, 0.52, -0.42], [5.25, 0.46, -0.34]]);
    both(BA3, [[5.25, 0.46, 0.34], [5.25, -0.22, 0.3], [3.55, -0.32, 0.48], [3.55, 0.52, 0.42]]);
    poly(BA2, [[5.25, -0.22, 0.3], [5.25, -0.22, -0.3], [3.55, -0.32, -0.48], [3.55, -0.32, 0.48]]);
    /* gold fuselage cheat line */
    both(GD, [[5.05, 0.08, 0.36], [3.6, 0.1, 0.5], [1.2, 0.08, 0.7], [1.2, -0.02, 0.7], [3.6, 0.0, 0.5], [5.05, 0.0, 0.36]]);
    /* single-seat canopy (F/A-18E) */
    poly(CAND, [[4.35, 0.48, 0.18], [3.55, 1.08, 0], [2.15, 0.98, 0], [1.85, 0.5, 0.22], [3.4, 0.5, 0.4]]);
    poly(CAND, [[4.35, 0.48, -0.18], [3.4, 0.5, -0.4], [1.85, 0.5, -0.22], [2.15, 0.98, 0], [3.55, 1.08, 0]]);
    poly(CAN, [[4.35, 0.48, 0.18], [4.35, 0.48, -0.18], [3.55, 1.08, 0]]);
    poly(CAN, [[3.55, 1.08, 0], [2.15, 0.98, 0], [1.85, 0.5, 0.22], [1.85, 0.5, -0.22]]);
    poly(GD2, [[4.42, 0.46, 0.2], [4.42, 0.46, -0.2], [3.62, 1.05, 0]]);
    /* spine / mid fuselage */
    poly(BA, [[3.55, 0.52, 0.42], [0.4, 0.48, 0.55], [0.4, 0.48, -0.55], [3.55, 0.52, -0.42]]);
    both(BA3, [[3.55, 0.52, 0.42], [3.55, -0.32, 0.48], [0.6, -0.38, 0.62], [0.4, 0.48, 0.55]]);
    poly(BA2, [[3.55, -0.32, 0.48], [3.55, -0.32, -0.48], [0.6, -0.38, -0.62], [0.6, -0.38, 0.62]]);
    /* Super Hornet LEX — large, unvented */
    both(BA, [[3.7, 0.28, 0.45], [2.4, 0.22, 1.05], [1.15, 0.16, 1.72], [0.55, 0.12, 1.55], [1.5, 0.35, 0.58]]);
    both(BA2, [[3.4, 0.05, 0.5], [2.35, -0.05, 1.0], [1.2, -0.08, 1.65], [1.15, 0.16, 1.72], [2.4, 0.22, 1.05]]);
    both(GD, [[3.55, 0.26, 0.52], [2.35, 0.2, 1.08], [1.2, 0.15, 1.7], [1.28, 0.2, 1.55], [2.4, 0.24, 1.0]]);
    /* rectangular caret intakes */
    both(INT, [[2.62, 0.18, 0.58], [2.48, 0.16, 1.28], [2.48, -0.38, 1.22], [2.62, -0.36, 0.58]]);
    both(BA3, [[2.62, 0.18, 0.58], [2.62, -0.36, 0.58], [1.15, -0.34, 0.7], [1.2, 0.2, 0.72]]);
    both(BA2, [[2.48, 0.16, 1.28], [1.15, 0.12, 1.55], [1.1, -0.32, 1.42], [2.48, -0.38, 1.22]]);
    both(BA2, [[2.62, -0.36, 0.58], [2.48, -0.38, 1.22], [1.1, -0.32, 1.42], [1.15, -0.34, 0.7]]);
    /* trapezoid wing with leading-edge snag */
    both(BA, [[1.2, 0.14, 1.55], [0.05, 0.12, 3.25], [-0.7, 0.1, 5.05], [-1.45, 0.08, 4.95], [-1.75, 0.1, 3.05], [-1.95, 0.12, 1.4]]);
    both(BA2, [[1.2, 0.02, 1.55], [-1.95, 0.0, 1.4], [-1.75, -0.02, 3.05], [-1.45, -0.04, 4.95], [-0.7, 0.0, 5.05], [0.05, 0.02, 3.25]]);
    both(GD, [[1.22, 0.15, 1.52], [0.08, 0.13, 3.22], [-0.68, 0.11, 5.05], [-0.55, 0.11, 5.05], [0.18, 0.13, 3.18], [1.32, 0.15, 1.48]]);
    both(GD2, [[-0.62, 0.11, 4.92], [-0.7, 0.1, 5.05], [-1.45, 0.08, 4.95], [-1.28, 0.09, 4.82]]);
    /* empty wingtip rail */
    both(BA2, [[-0.55, 0.12, 5.05], [-0.62, 0.12, 5.38], [-1.42, 0.1, 5.32], [-1.45, 0.1, 4.95]]);
    both(GD, [[-0.55, 0.13, 5.06], [-0.62, 0.13, 5.36], [-0.78, 0.13, 5.34], [-0.7, 0.13, 5.06]]);
    /* rear fuselage / twin engine booms */
    poly(BA, [[0.4, 0.48, 0.55], [-3.15, 0.55, 0.62], [-3.15, 0.55, -0.62], [0.4, 0.48, -0.55]]);
    both(BA3, [[0.4, 0.48, 0.55], [0.6, -0.38, 0.62], [-3.0, -0.42, 0.78], [-3.15, 0.55, 0.62]]);
    poly(BA2, [[0.6, -0.38, 0.62], [0.6, -0.38, -0.62], [-3.0, -0.42, -0.78], [-3.0, -0.42, 0.78]]);
    both(GD, [[0.5, 0.06, 0.68], [-2.8, 0.08, 0.8], [-2.8, -0.02, 0.8], [0.5, -0.04, 0.68]]);
    /* engine nacelles + round nozzles */
    both(BA2, [[-3.0, 0.42, 0.18], [-5.45, 0.38, 0.22], [-5.45, 0.38, 0.78], [-3.0, 0.42, 0.85]]);
    both(BA3, [[-3.0, 0.42, 0.85], [-5.45, 0.38, 0.78], [-5.45, -0.28, 0.72], [-3.0, -0.32, 0.78]]);
    both(BA2, [[-3.0, 0.42, 0.18], [-3.0, -0.32, 0.22], [-5.45, -0.28, 0.18], [-5.45, 0.38, 0.22]]);
    both(NOZ, [[-5.45, 0.38, 0.22], [-5.45, 0.38, 0.78], [-5.45, -0.28, 0.72], [-5.45, -0.28, 0.18]]);
    both(INT, [[-5.52, 0.28, 0.32], [-5.52, 0.28, 0.66], [-5.52, -0.16, 0.62], [-5.52, -0.16, 0.28]]);
    /* canted twin vertical tails */
    both(BA, [[-3.05, 0.52, 0.55], [-4.95, 0.48, 0.58], [-4.55, 2.22, 1.18], [-3.55, 2.05, 1.08]]);
    both(BA2, [[-3.05, 0.52, 0.72], [-3.55, 2.05, 1.22], [-4.55, 2.22, 1.32], [-4.95, 0.48, 0.75]]);
    both(GD, [[-3.12, 0.7, 0.78], [-3.6, 2.0, 1.2], [-3.48, 2.0, 1.16], [-3.02, 0.7, 0.72]]);
    both(GD2, [[-4.5, 2.18, 1.2], [-4.55, 2.22, 1.18], [-4.95, 0.55, 0.62], [-4.82, 0.55, 0.62]]);
    /* all-moving stabs with leading-edge snag */
    both(BA, [[-3.55, 0.22, 0.7], [-4.15, 0.18, 2.55], [-5.35, 0.14, 2.38], [-5.15, 0.18, 0.55]]);
    both(BA2, [[-3.55, 0.08, 0.7], [-5.15, 0.04, 0.55], [-5.35, 0.02, 2.38], [-4.15, 0.06, 2.55]]);
    both(GD, [[-3.55, 0.23, 0.72], [-4.15, 0.19, 2.55], [-4.02, 0.19, 2.5], [-3.48, 0.23, 0.7]]);
    return P;
  }
  const HORNET = buildSuperHornet();

  const HERK = [
    { c: "#0a2a6b", v: [[6, 0.4, 0], [-6, 0.4, 1.2], [-6, 0.4, -1.2]] },
    { c: "#082048", v: [[6, 0.4, 0], [-6, -0.7, 0.9], [-6, 0.4, 1.2]] },
    { c: "#0c3480", v: [[0.6, 0.6, 0], [-1.2, 0.6, 9], [-2.4, 0.6, 8.2], [-1, 0.6, 0]] },
    { c: "#0c3480", v: [[0.6, 0.6, 0], [-1.2, 0.6, -9], [-2.4, 0.6, -8.2], [-1, 0.6, 0]] },
    { c: "#e6b422", v: [[-1, 0.62, 7.4], [-1.2, 0.62, 9], [-2, 0.62, 7.6]] },
    { c: "#071830", v: [[-5, 0.5, 0], [-7.2, 3.2, 0], [-7.4, 0.5, 0.4]] },
    { c: "#d0e4ff", v: [[3.2, 0.5, 0], [1.4, 1.3, 0], [0.6, 0.5, 0.5]] }
  ];

  function shade(hex, lum) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * lum);
    const g = Math.round(((n >> 8) & 255) * lum);
    const b = Math.round((n & 255) * lum);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function faceN(a, b, c) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  function drawMesh(j, mesh, size) {
    const L = { x: 0.42, y: 0.82, z: -0.36 };
    const polys = mesh.map(function (poly) {
      const w = poly.v.map(function (v) {
        const r = rotateP(v, j.yaw, j.pitch, j.roll);
        return { x: j.x + r.x * size, y: j.y + r.y * size, z: j.z + r.z * size };
      });
      const n = w.length > 2 ? faceN(w[0], w[1], w[2]) : { x: 0, y: 1, z: 0 };
      const lum = clamp(0.38 + Math.max(0, n.x * L.x + n.y * L.y + n.z * L.z) * 0.72, 0.32, 1.15);
      const pts = w.map(function (p) { return project(p.x, p.y, p.z); });
      const depth = pts.reduce(function (s, p) { return s + p.depth; }, 0) / pts.length;
      return { c: shade(poly.c, lum), pts: pts, depth: depth };
    }).sort(function (a, b) { return b.depth - a.depth; });

    polys.forEach(function (poly) {
      ctx.beginPath();
      poly.pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy); });
      ctx.closePath();
      ctx.fillStyle = poly.c;
      ctx.fill();
    });

    if (j.n) {
      const side = rotateP([4.15, 0.22, 0.62], j.yaw, j.pitch, j.roll);
      const np = project(j.x + side.x * size, j.y + side.y * size, j.z + side.z * size);
      ctx.font = "bold 13px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillStyle = "#3a2a08";
      ctx.fillText(String(j.n), np.sx + 1, np.sy + 1);
      ctx.fillStyle = GD2;
      ctx.fillText(String(j.n), np.sx, np.sy);
      const tail = rotateP([-4.15, 1.35, 1.05], j.yaw, j.pitch, j.roll);
      const tp = project(j.x + tail.x * size, j.y + tail.y * size, j.z + tail.z * size);
      ctx.font = "bold 11px Segoe UI";
      ctx.fillStyle = GD2;
      ctx.fillText(String(j.n), tp.sx, tp.sy);
    }

    if (j.gear) {
      ctx.strokeStyle = WHT; ctx.lineWidth = 2;
      const pts = [[2.6, -0.35, 0], [-0.4, -0.4, 1.15], [-0.4, -0.4, -1.15]];
      pts.forEach(function (v) {
        const a = rotateP([v[0], 0.1, v[2]], j.yaw || 0, j.pitch || 0, j.roll || 0);
        const b = rotateP([v[0], v[1] - 1.5, v[2]], j.yaw || 0, j.pitch || 0, j.roll || 0);
        const p0 = project(j.x + a.x * size, j.y + a.y * size, j.z + a.z * size);
        const p1 = project(j.x + b.x * size, j.y + b.y * size, j.z + b.z * size);
        if (!isFinite(p0.sx) || !isFinite(p1.sx)) return;
        ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
        ctx.fillStyle = WHT; ctx.beginPath(); ctx.arc(p1.sx, p1.sy, 2.4, 0, Math.PI * 2); ctx.fill();
      });
      const hk0 = rotateP([-3.2, -0.2, 0], j.yaw, j.pitch, j.roll);
      const hk1 = rotateP([-5.0, -1.3, 0], j.yaw, j.pitch, j.roll);
      const q0 = project(j.x + hk0.x * size, j.y + hk0.y * size, j.z + hk0.z * size);
      const q1 = project(j.x + hk1.x * size, j.y + hk1.y * size, j.z + hk1.z * size);
      ctx.strokeStyle = "#c9ccd2"; ctx.beginPath(); ctx.moveTo(q0.sx, q0.sy); ctx.lineTo(q1.sx, q1.sy); ctx.stroke();
    }

    if (j.burner) {
      [0.5, -0.5].forEach(function (side) {
        const r = rotateP([-5.55, 0.05, side], j.yaw || 0, j.pitch || 0, j.roll || 0);
        const tail = project(j.x + r.x * size, j.y + r.y * size, j.z + r.z * size);
        if (!isFinite(tail.sx) || !isFinite(tail.sy)) return;
        const g = ctx.createRadialGradient(tail.sx, tail.sy, 0, tail.sx, tail.sy, 22);
        g.addColorStop(0, "#fff6c8"); g.addColorStop(0.35, "#ff8a2b"); g.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tail.sx, tail.sy, 22, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (view === "overhead") { g.addColorStop(0, "#14361f"); g.addColorStop(1, "#0c2418"); }
    else { g.addColorStop(0, "#071428"); g.addColorStop(0.55, "#163a7a"); g.addColorStop(0.78, "#4d87c4"); g.addColorStop(1, "#8aa468"); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawBox() {
    ctx.save();
    const line = []; for (let x = -240; x <= 240; x += 20) line.push(project(x, 0, 0));
    ctx.beginPath(); line.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy); });
    ctx.setLineDash([8, 6]); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    const crowd = []; for (let x = -240; x <= 240; x += 20) crowd.push(project(x, 0, 78));
    ctx.beginPath(); crowd.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy); });
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
    const cp = project(0, 0, 0);
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(cp.sx, cp.sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = "12px Segoe UI"; ctx.fillText("CP", cp.sx + 8, cp.sy + 4);
    ctx.fillStyle = "rgba(245,215,110,.8)"; const sl = project(-230, 0, 0); ctx.fillText("SHOW LINE", sl.sx, sl.sy - 8);
    ctx.fillStyle = "rgba(200,220,255,.8)"; const cl = project(-230, 0, 78); ctx.fillText("CROWD", cl.sx, cl.sy + 14);
    if (view !== "profile") {
      for (let i = -4; i <= 4; i++) { const p = project(i * 28, 0, 82); ctx.fillStyle = "rgba(20,24,20,.55)"; ctx.fillRect(p.sx - 3, p.sy - 8, 6, 10); }
    }
    ctx.restore();
  }
  function drawTrail(tr) {
    if (tr.length < 2) return;
    const pts = tr.map(function (p) { return project(p.x, p.y, p.z); });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].sx + pts[i + 1].sx) / 2;
      const my = (pts[i].sy + pts[i + 1].sy) / 2;
      ctx.quadraticCurveTo(pts[i].sx, pts[i].sy, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.sx, last.sy);
    ctx.strokeStyle = "rgba(230,240,255,.22)"; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.stroke();
  }
  function currentJets() { return jetSoft.slice(); }

  function sampleVel(m, i) {
    const a = m.jets(0.97)[i];
    const b = m.jets(0.999)[i];
    if (!a || !b) return { x: 0, y: 0, z: 0 };
    const dt = 0.029 * m.dur;
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt, z: (b.z - a.z) / dt };
  }

  function beginCoast(m) {
    const raw = m.jets(0.999);
    coasting = true;
    coastT = 0;
    for (let i = 0; i < 6; i++) {
      const j = raw[i];
      if (!j) { coastState[i] = null; continue; }
      let v = sampleVel(m, i);
      let spd = Math.hypot(v.x, v.y, v.z);
      const b = basis(j.yaw, j.pitch, j.roll);
      if (!isFinite(spd) || spd < 12) {
        spd = 70;
        v = { x: b.fwd.x * spd, y: b.fwd.y * spd, z: b.fwd.z * spd };
      } else if (spd < 40) {
        const s = 55 / spd;
        v = { x: v.x * s, y: v.y * s, z: v.z * s };
      }
      coastState[i] = {
        x: j.x, y: j.y, z: j.z,
        yaw: j.yaw || 0, pitch: j.pitch || 0, roll: j.roll || 0,
        gear: j.gear, burner: j.burner, smoke: j.smoke, kind: j.kind, n: j.n,
        vx: v.x, vy: v.y, vz: v.z
      };
    }
  }

  function stepCoast(dt) {
    const out = [null, null, null, null, null, null];
    for (let i = 0; i < 6; i++) {
      const s = coastState[i];
      if (!s) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      out[i] = s;
    }
    return out;
  }

  function allOffscreen(jets) {
    let seen = false;
    for (let i = 0; i < jets.length; i++) {
      const j = jets[i];
      if (!j) continue;
      seen = true;
      const p = project(j.x, j.y, j.z);
      const pad = 110;
      if (p.sx > -pad && p.sx < W + pad && p.sy > -pad && p.sy < H + pad) return false;
    }
    return true;
  }

  function loop(now) {
    resizeStage();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const m = M[idx];
    if (playing && !coasting) {
      t += dt * speed / m.dur;
      if (t >= 1) beginCoast(m);
    }
    let jets;
    if (coasting) {
      if (playing) coastT += dt * speed;
      jets = stepCoast(playing ? dt * speed : 0);
      for (let s = 0; s < 6; s++) jetSoft[s] = jets[s];
      if (playing && coastT > 0.4 && (allOffscreen(jets) || coastT > 3.2)) {
        t = 0;
        coasting = false;
        coastT = 0;
        trails.forEach(function (tr) { tr.length = 0; });
        for (let s = 0; s < jetSoft.length; s++) jetSoft[s] = null;
        jets = smoothJets(m.jets(0), 1);
      }
    } else {
      const raw = m.jets(clamp(t, 0, 0.999));
      jets = smoothJets(raw, dt);
    }
    aimCamera(jets, dt, m);
    jets.forEach(function (j, i) {
      if (j && j.smoke !== false) {
        const lastP = trails[i][trails[i].length - 1];
        if (!lastP || Math.hypot(j.x - lastP.x, j.y - lastP.y, j.z - lastP.z) > 0.7) {
          trails[i].push({ x: j.x, y: j.y, z: j.z });
        }
        if (trails[i].length > 140) trails[i].shift();
      } else trails[i].length = 0;
    });
    ctx.clearRect(0, 0, W, H); drawSky(); drawBox(); trails.forEach(drawTrail);
    const drawList = jets.map(function (j, i) { return { j: j, i: i }; }).filter(function (x) { return x.j; });
    drawList.sort(function (a, b) { return project(b.j.x, b.j.y, b.j.z).depth - project(a.j.x, a.j.y, a.j.z).depth; });
    drawList.forEach(function (x) {
      if (x.j.kind === "c130") drawMesh(x.j, HERK, C130_SIZE);
      else drawMesh(x.j, HORNET, JET_SIZE);
    });
    progressEl.value = String(Math.round(Math.min(t, 1) * 1000));
    hud.innerHTML = "VIEW <b>" + view.toUpperCase() + "</b><br>ILLUSTRATIVE PROGRESS <b>" + Math.round(Math.min(t, 1) * 100) + "%</b><br>MANUAL ALTITUDE <b>" + (m.meta ? m.ref === "—" ? "FORMATION STUDY" : "SEE PAGE " + m.ref : m.min.toLocaleString() + "–" + m.max.toLocaleString() + " FT AGL") + "</b>";
    const call = m.call ? m.call(t) : "";
    calloutEl.textContent = call; calloutEl.classList.toggle("on", !!call);
    if (hover >= 0 && ROLES[hover] && jets[hover]) {
      const p = project(jets[hover].x, jets[hover].y, jets[hover].z);
      const tx = p.sx + 18, ty = p.sy - 48;
      ctx.fillStyle = "rgba(10,42,107,.92)"; ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
      ctx.fillRect(tx, ty, 210, 44); ctx.strokeRect(tx, ty, 210, 44);
      ctx.fillStyle = GOLD; ctx.font = "bold 12px Segoe UI"; ctx.textAlign = "left"; ctx.fillText(ROLES[hover][0], tx + 8, ty + 18);
      ctx.fillStyle = "#fff"; ctx.font = "11px Segoe UI"; ctx.fillText(ROLES[hover][1], tx + 8, ty + 34);
    }
    requestAnimationFrame(loop);
  }
  const params = new URLSearchParams(location.search);
  if (params.get("capture") === "1") document.body.classList.add("capture-mode");
  if (params.get("view")) view = params.get("view");
  if (params.get("pause") === "1") playing = false;
  const want = params.get("m");
  if (want) {
    const found = M.findIndex(function (m) { return m.id === want; });
    if (found >= 0) idx = found;
  }
  if (params.get("t")) t = clamp(Number(params.get("t")) || 0, 0, 0.999);

  window.__BA = {
    M: M,
    sequences: SHOW_SEQUENCE,
    cam: cam,
    project: project,
    seek: function (id, time, v) {
      if (id) {
        const found = M.findIndex(function (m) { return m.id === id; });
        if (found >= 0) idx = found;
      }
      playing = false;
      t = clamp(time == null ? t : time, 0, 0.999);
      coasting = false;
      coastT = 0;
      if (v) view = v;
      trails.forEach(function (tr) { tr.length = 0; });
      setManeuver(idx, false);
      return { id: M[idx].id, t: t, view: view };
    },
    frame: function () {
      last = performance.now();
      const m = M[idx];
      const raw = m.jets(clamp(t, 0, 0.999));
      for (let s = 0; s < 6; s++) jetSoft[s] = raw[s] || null;
      aimCamera(raw, 1, m, true);
      resizeStage();
      ctx.clearRect(0, 0, W, H); drawSky(); drawBox();
      const jets = raw;
      const drawList = jets.map(function (j, i) { return { j: j, i: i }; }).filter(function (x) { return x.j; });
      drawList.sort(function (a, b) { return project(b.j.x, b.j.y, b.j.z).depth - project(a.j.x, a.j.y, a.j.z).depth; });
      drawList.forEach(function (x) {
        if (x.j.kind === "c130") drawMesh(x.j, HERK, C130_SIZE);
        else drawMesh(x.j, HORNET, JET_SIZE);
      });
      return canvas.toDataURL("image/png");
    }
  };

  buildList(); setManeuver(idx, false);
  document.getElementById("playBtn").textContent = playing ? "PAUSE" : "PLAY";
  requestAnimationFrame(loop);
})();
