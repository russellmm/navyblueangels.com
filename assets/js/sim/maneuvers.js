// The 2026 Blue Angels maneuver catalog, choreographed from the Maneuvers Manual.
// Each entry carries the manual's published data and a build() that flies the
// maneuver with the kinematic engine in flight.js. Geometry and timing are an
// interpretation of the manual's diagrams and text, not flight data.

import {
  Pilot, formationTracks, blendInto, solve, closestPass,
  NM, KT, DEG, DT, GROUND_Y, V, heading
} from './flight.js';

const D4 = [1, 2, 3, 4];
const BOX = NM;                 // aerobatic box edge, either side of CP
const CP = [0, 0, 0];
const dir30 = (sx, sz) => V.norm([sx * Math.cos(30 * DEG), 0, sz * Math.sin(30 * DEG)]);

// ---------- helpers ----------
function finish(tracks, o = {}) {
  const ids = Object.keys(tracks);
  const end = o.end ?? Math.max(...ids.map((k) => tracks[k].t1)) + (o.tail ?? 3);
  for (const k of ids) {
    const tr = tracks[k];
    tr.extendTo(end);
    const keep = Math.round((end - tr.t0) / DT) + 1;
    if (tr.length > keep) tr.truncate(keep);
    if (o.kind?.[k]) tr.kind = o.kind[k];
    if (tr.kind === 'c130') { tr.aoaRef = 3.2; tr.aoaMax = 14; }
    tr.finalize();
  }
  const events = (o.events ?? []).filter((e) => e && e.t >= 0 && e.t <= end).sort((a, b) => a.t - b.t);
  return { tracks, events, duration: end, focus: o.focus ?? ids.map(Number) };
}
const ev = (pilot, label, extra = {}) => ({ t: pilot.t, label, ...extra });
const evAt = (t, label, extra = {}) => ({ t, label, ...extra });
// time a track first satisfies a predicate on its pose
function timeWhen(track, pred) {
  for (let i = 0; i < track.length; i++) if (pred(track.pose(i))) return track.t0 + i * DT;
  return track.t1;
}
const eventsOf = (...pilots) => pilots.flatMap((p) => p.events);

// Detach formation member `id` at time t and continue with its own program.
function detach(tracks, id, t, program) {
  const pl = Pilot.from(tracks[id], t);
  program(pl);
  return pl;
}

// ---------- the catalog ----------
export const MANEUVERS = [];
const add = (m) => MANEUVERS.push(m);

// ===== C-130 "Fat Albert" =====
const C130 = { kind: 'c130' };

add({
  id: 'c130-takeoff', ref: '2-1', name: 'C-130 Low Transition Takeoff', group: 'c130', ids: [7],
  data: { min: "0′", max: "1,000–1,500′", kin: '0', kout: '110' },
  text: 'On takeoff the aircraft will execute a low-transition. At 150-170 KTS, the aircraft will rotate to 45° nose high. The aircraft will level off at 1000-1500’ AGL.',
  build() {
    const p = new Pilot({ x: -5500, dir: 'R', kts: 0, smoke: false, ...C130 });
    p.takeoff({ rotate: 115, accel: 0.22, climb: 2 }).lowTransition({ kts: 162, alt: 30, accel: 0.16 });
    p.mark('Rotate to 45°').pitchTo(45, { g: 1.6, energy: 0.42 });
    p.until((q) => q.alt > 860, { energy: 0.42 }).pitchTo(0, { g: 0.55, energy: 0.3 }).mark('Level off');
    p.speed(150, 4).fly(6).turn(90, { dir: 'L', bank: 30 });
    return finish({ 7: p.track }, { kind: { 7: 'c130' }, events: eventsOf(p) });
  }
});

add({
  id: 'c130-remote', ref: '2-2', name: 'C-130 Remote Entry', group: 'c130', ids: [7],
  data: { min: "100′", max: "1,000–1,800′", kin: '240', kout: '110' },
  text: 'Ingressing from behind the crowd, a turn will be commenced at CP to establish a 1000’ AGL downwind position. The aircraft will then commence a descending turn back to the show line. Abeam CP on the 500’ line at 100’ AGL, the aircraft will commence a 45° nose-up climb to level off at 1000-1800’ AGL.',
  build() {
    const p = new Pilot({ x: 0, alt: 1000, z: 9000, dir: 'A', kts: 240, smoke: false, ...C130 });
    p.until((q) => q.p[2] <= 0).mark('Turn at CP').turn(90, { dir: 'R', r: 6000 });
    p.speed(205, 3).fly(14).hold(100).mark('Descending turn').turn(180, { dir: 'R', r: 3000 });
    p.hold(100).untilX(0).hold(null).mark('45° climb').pitchTo(45, { g: 1.5, energy: 0.42 });
    p.until((q) => q.alt > 1100, { energy: 0.42 }).pitchTo(0, { g: 0.5, energy: 0.3 }).fly(8);
    return finish({ 7: p.track }, { kind: { 7: 'c130' }, events: eventsOf(p) });
  }
});

add({
  id: 'c130-parade', ref: '2-3', name: 'C-130 Parade Pass', group: 'c130', ids: [7],
  data: { min: "200′", max: "1,000′", kin: '260', kout: '260' },
  text: 'The aircraft will complete the teardrop turn towards CP using the 30° ingress line. Once established on the 30° ingress line, a descent from 500’ AGL to 200’ AGL will be made. Abeam the crowd line, a roll into a 60° AOB turn towards will be performed. The turn will be continued to depart on the 30° egress line. Abeam the crowd line on the 30° egress line, wings will be leveled and a 10° nose-up climb will be initiated to 1200’ AGL.',
  build() {
    const din = dir30(-1, 1);              // inbound from in front, crowd right
    const fly = (lead) => {
      const p = new Pilot({ x: 15000, alt: 500, z: -8660, dir: din, kts: 260, smoke: false, ...C130 });
      p.hold(200).until((q) => q.p[0] <= lead).mark('60° AOB turn').turn(60, { dir: 'R', bank: 60 });
      return p;
    };
    const lead = solve((x) => closestPass(fly(x).track, 0, 0).dist - 1, 2600, 3200, 10);
    const p = fly(lead);
    p.fly(9).hold(null).mark('10° climb').climbTo(1200, { gamma: 10, g: 1.2, energy: 0.2 }).fly(4);
    return finish({ 7: p.track }, { kind: { 7: 'c130' }, events: eventsOf(p) });
  }
});

add({
  id: 'c130-flat', ref: '2-4', name: 'C-130 Flat Pass', group: 'c130', ids: [7],
  data: { min: "40′", max: "1,000′", kin: '210', kout: '260' },
  text: 'The aircraft will make a teardrop turn back toward the show line to position itself on the 500’ line. Abeam CP at 50’ AGL, a climbing turn will be commenced away from the crowd to set up for the head on pass.',
  build() {
    const p = new Pilot({ x: 4000, alt: 1000, z: -6400, dir: 'R', kts: 210, smoke: false, ...C130 });
    p.mark('Teardrop').hold(50).turn(180, { dir: 'R', r: 3200 });
    p.speed(260, 2).hold(50).untilX(0).hold(null).mark('Climbing turn away');
    p.pitchTo(8, { g: 1.3, energy: 0.2 }).turn(90, { dir: 'R', bank: 35 }).fly(6);
    return finish({ 7: p.track }, { kind: { 7: 'c130' }, events: eventsOf(p) });
  }
});

add({
  id: 'c130-head', ref: '2-5', name: 'C-130 Head-On Pass', group: 'c130', ids: [7],
  data: { min: "200′", max: "1,150′", kin: '210', kout: '260' },
  text: 'The aircraft will rollout in a head-on profile towards CP at 200-500’ AGL. The aircraft will enter the aerobatic box at 100’ AGL. At ½ nm prior to CP, a 20 degree climb will be commenced followed by a turn to level at 1200’ on downwind to set up for the assault landing.',
  build() {
    const p = new Pilot({ x: 0, alt: 400, z: -14000, dir: 'T', kts: 210, smoke: false, ...C130 });
    p.hold(100).until((q) => q.p[2] >= -BOX).mark('Enter the box at 100′');
    p.until((q) => q.p[2] >= -NM / 2).hold(null).mark('20° climb').pitchTo(20, { g: 1.4, energy: 0.35 });
    p.until((q) => q.alt > 900, { energy: 0.35 }).pitchTo(0, { g: 0.5, energy: 0.2 }).hold(1200);
    p.mark('Turn to downwind').turn(90, { dir: 'L', bank: 30 }).fly(6);
    return finish({ 7: p.track }, { kind: { 7: 'c130' }, events: eventsOf(p) });
  }
});

add({
  id: 'c130-remote-head', ref: '2-6', name: 'C-130 Remote Head-On Pass', group: 'c130', ids: [7],
  data: { min: "200′", max: "1,150′", kin: '210', kout: '260' },
  text: 'The aircraft will commence a turn to remain within 3nm of CP and roll out in a head-on profile towards CP at 200-500’ AGL. The aircraft will enter the aerobatic box at 100’ AGL. At ½ nm from CP, a 45° climb will be commenced to exit behind the crowd.',
  build() {
    const p = new Pilot({ x: -11000, alt: 500, z: -15000, dir: 'R', kts: 210, smoke: false, ...C130 });
    p.mark('Turn inside 3 NM').turnToward(CP, { dir: 'L', bank: 35 });
    p.hold(100).until((q) => q.p[2] >= -NM / 2).hold(null).mark('45° climb');
    p.pitchTo(45, { g: 1.5, energy: 0.42 }).until((q) => q.alt > 1000, { energy: 0.42 }).pitchTo(0, { g: 0.5, energy: 0.2 }).fly(8);
    return finish({ 7: p.track }, { kind: { 7: 'c130' }, events: eventsOf(p) });
  }
});

add({
  id: 'c130-landing', ref: '2-7', name: 'C-130 Assault Landing', group: 'c130', ids: [7],
  data: { min: "0′", max: "1,200′", kin: '135', kout: '0' },
  text: 'Behind the crowd, the landing gear/flaps will be lowered and a turn back towards the show line will be commenced, rolling out on runway centerline at 1000-1200’ AGL. As the intended point of landing is approached, a 20°-25° nose-down approach will be commenced. After landing, the aircraft will back up, face the crowd line, and exit the runway.',
  build() {
    // solve the downwind offset behind the crowd so the final turn rolls out on the runway centerline
    const fly = (z0) => {
      const p = new Pilot({ x: 9000, alt: 1150, z: z0, dir: 'L', kts: 150, smoke: false, ...C130 });
      p.gear(true).mark('Gear and flaps down').speed(135, 2).fly(4).turn(90, { dir: 'R', r: 2600 }).turn(90, { dir: 'L', r: 2600 });
      return p;
    };
    const p = fly(solve((z0) => fly(z0).p[2], 5600, 5300, 10));
    p.fly(6).mark('20° nose-down approach').pitchTo(-21, { g: 0.6, energy: 0 }).land({ flareAlt: 110, decel: 0.3 });
    p.fly(3);
    return finish({ 7: p.track }, { kind: { 7: 'c130' }, events: eventsOf(p) });
  }
});

// ===== Takeoffs =====
function diamondTakeoff(o) {
  const ref = new Pilot({ x: o.x, dir: o.dir, kts: 0, smoke: false });
  ref.ab(true).takeoff({ rotate: 140, label: 'Burner go' });
  const tLift = ref.t;
  ref.lowTransition({ kts: o.kts ?? 360, alt: 40, accel: 0.62 }).mark('Low transition');
  return { ref, tLift };
}
const takeoffSchedule = (tLift, extra = []) => [{ t: 0, form: 'fingertip' }, { t: tLift + 2, form: 'diamond', dur: 5 }, ...extra];

add({
  id: 'half-cuban', ref: '2-10a', name: 'Diamond Half-Cuban Eight on Takeoff', group: 'diamond', ids: D4,
  data: { min: "0′", max: "9,500′", kin: '0', kout: '380' },
  text: 'The Diamond Burner Go is a formation takeoff in fingertip. Immediately after takeoff, the four aircraft will transition to the diamond while accelerating in a low transition on show line. The Half-Cuban Eight commences from the low transition, and the show line clear is a turn behind the crowd.',
  note: 'Once requisite proficiency is gained in both the Diamond Burner Loop and Diamond Half Cuban Eight, these two maneuvers may be linked together for one continuous takeoff maneuver, with the Diamond Half-Cuban Eight being first.',
  build() {
    const { ref, tLift } = diamondTakeoff({ x: -5700, dir: 'R' });
    ref.smoke(true).mark('Pull to the vertical').pull(225, { r: 3500, energy: 0.3 });
    ref.mark('Half roll').roll(180, { rate: 110 }).fly(2).ab(false);
    ref.until((q) => q.alt < 4300).pitchTo(0, { g: 4 }).mark('Clear behind the crowd').turn(100, { dir: 'L', bank: 60 });
    const tracks = formationTracks(ref.track, D4, takeoffSchedule(tLift));
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'burner-loop', ref: '2-10b', name: 'Diamond Burner Go / Burner Loop on Takeoff', group: 'diamond', ids: D4,
  data: { min: "0′", max: "9,400′", kin: '0', kout: '380' },
  text: 'The Diamond Burner Go is a formation takeoff in fingertip. Immediately after takeoff, the four aircraft will transition to the diamond while accelerating in a low transition on show line. The Loop commences from the low transition, and the show line clear is a turn behind the crowd.',
  note: 'Aircraft are non-aerobatic below 4,000’ when outside of designated aerobatic box. The F/A-18 portion of all remote shows will begin with the Delta Head-On maneuver.',
  build() {
    const { ref, tLift } = diamondTakeoff({ x: 5700, dir: 'L' });
    ref.smoke(true).mark('Burner loop').pull(360, { r: 3700, energy: 0.3 }).ab(false);
    ref.mark('Clear behind the crowd').pitchTo(12, { g: 3 }).turn(90, { dir: 'L', bank: 60 });
    const tracks = formationTracks(ref.track, D4, takeoffSchedule(tLift));
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'burner-low', ref: '2-10b', variant: 'Low / flat show', name: 'Diamond Burner Go / Low Transition on Takeoff', group: 'diamond', ids: D4,
  data: { min: "0′", max: "—", kin: '0', kout: '380' },
  text: 'Low and flat show takeoff. The Diamond Burner Go is a formation takeoff in fingertip. Immediately after takeoff, the four aircraft will transition to the diamond while accelerating in a low transition on show line, then clear behind the crowd.',
  note: 'The manual lists this as the low and flat show version of 2-10b; the loop is omitted.',
  build() {
    const { ref, tLift } = diamondTakeoff({ x: 5700, dir: 'L' });
    ref.smoke(true).fly(3).ab(false).mark('Climbing turn behind the crowd').pitchTo(10, { g: 3 }).turn(110, { dir: 'L', bank: 60 });
    const tracks = formationTracks(ref.track, D4, takeoffSchedule(tLift));
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'half-cuban-break', ref: '2-11', name: 'Diamond Half-Cuban Eight Break Out', group: 'diamond', ids: D4,
  data: { min: "0′", max: "9,500′", kin: '0', kout: '380' },
  text: 'If the clouds are biased to crowd left to the point that a Half-Cuban 8 can be accomplished but the backside loop cannot, then a Half-Cuban 8 Break Out can be done. As the formation passes through the horizon at approximately 500\' AGL, they will split in three separate directions. 1 and 4 will exit out the show line while 2 and 3 egress 90° in front of and behind the crowd respectively. The rendezvous will be conducted crowd left.',
  build() {
    const { ref, tLift } = diamondTakeoff({ x: -5700, dir: 'R' });
    ref.smoke(true).mark('Half-Cuban eight').pull(225, { r: 3500, energy: 0.3 }).roll(180, { rate: 110 }).ab(false);
    ref.until((q) => q.alt < 1750).pitchTo(0, { g: 4 });
    const tSplit = ref.t;
    ref.fly(12);
    const tracks = formationTracks(ref.track, D4, takeoffSchedule(tLift));
    detach(tracks, 1, tSplit, (p) => p.pitchTo(4, { g: 2 }).fly(10));
    detach(tracks, 4, tSplit, (p) => p.fly(10));
    detach(tracks, 2, tSplit, (p) => p.turn(90, { dir: 'R', bank: 75 }).fly(6));
    detach(tracks, 3, tSplit, (p) => p.turn(90, { dir: 'L', bank: 75 }).fly(6));
    return finish(tracks, { events: [...eventsOf(ref), evAt(tSplit, 'Break out — three directions')] });
  }
});

add({
  id: 'dirty-roll-takeoff', ref: '2-12', name: 'Dirty Roll on Takeoff, Blue Angel 5', group: 'solo', ids: [5],
  data: { min: "0′", max: "700′", kin: '0', kout: '200' },
  text: 'A left or right 360° roll away from the crowd with the landing gear extended. If this maneuver cannot be performed in the aerobatic box between 1200’-1500’, it must be executed in the aerobatic box beyond the crowd line. It can be flown from either direction based on CP and prevailing wind. The show line clear is a climbing turn behind or in-front of the crowd.',
  note: 'When weather conditions are of concern, the lead solo will perform this maneuver prior to the diamond takeoff and complete an area weather observation.',
  build() {
    const p = new Pilot({ x: -5700, dir: 'R', kts: 0 });
    p.ab(true).takeoff({ rotate: 140 }).ab(false).speed(195, 9);
    p.pitchTo(9, { g: 1.4 }).until((q) => q.alt > 330).pitchTo(4, { g: 1.2 });
    p.untilX(-1000).mark('Dirty roll').roll(-360, { rate: 95, pull: 1.6 });
    p.pitchTo(0, { g: 1.5 }).fly(6).mark('Climbing turn').pitchTo(8, { g: 2 }).turn(100, { dir: 'L', bank: 45 });
    return finish({ 5: p.track }, { events: eventsOf(p) });
  }
});

add({
  id: 'immelmann-6', ref: '2-13', name: 'Low Transition / Immelmann on Takeoff, Blue Angel 6', group: 'solo', ids: [6],
  data: { min: "0′", max: "4,500′", kin: '0', kout: '275' },
  text: '#6 will execute a low transition and at 330 KCAS will execute a vertical pull to complete an Immelmann maneuver. They will then track down show line from left to right and complete a 270° roll to clear behind the crowd at an altitude of > 2,000’.',
  note: 'Weather may preclude the Immelmann, and #6 will execute the roll to inverted (see Flat Show Takeoff). At show sites where the runway is offset significantly crowd left or crowd right of center point, #5 and #6 will modify their takeoff maneuvers to remain within the aerobatic box.',
  build() {
    const p = new Pilot({ x: 5700, dir: 'L', kts: 0 });
    p.ab(true).takeoff({ rotate: 140 }).lowTransition({ kts: 330, alt: 35 }).mark('Vertical pull at 330 KCAS');
    p.pull(180, { g: 6, energy: 0.45 }).ab(false).mark('Ease AOA — inverted level off');
    p.fly(5).mark('270° roll').roll(270, { rate: 160 }).turn(90, { dir: 'R', bank: 80 }).pitchTo(6, { g: 2 }).fly(4);
    return finish({ 6: p.track }, { events: eventsOf(p) });
  }
});

add({
  id: 'delta-head-on', ref: '2-14', name: 'Delta Head-On / Opposing 360', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "500′ / 200′", max: "5,500′", kin: '360', kout: '360' },
  text: 'The Delta will roll out in a head on set up and commence a climb. The solos are detached from the formation 1500’ prior to CP. All aircraft are non-aerobatic and above 500’ when crossing the spectator area. The Diamond continues the climb and exits the show line in a right turn. The solos then turn away from each other to cross back at CP.',
  note: 'This maneuver is done at remote / over water show sites and in Low / Flat Shows where Diamond Burner Loop on takeoff and Low Transition / Split S on takeoff are not conducted.',
  build() {
    const ref = new Pilot({ x: 0, alt: 300, z: -15000, dir: 'T', kts: 360 });
    ref.until((q) => q.p[2] >= -6500).mark('Commence climb').pitchTo(9, { g: 2 });
    ref.until((q) => q.p[2] >= -1500);
    const tDet = ref.t;
    ref.until((q) => q.p[2] >= 4500).pitchTo(10, { g: 2 }).mark('Diamond exits in a right turn').turn(90, { dir: 'R', bank: 50 }).pitchTo(3, { g: 1.5 });
    const tracks = formationTracks(ref.track, [1, 2, 3, 4, 5, 6], [{ t: 0, form: 'delta' }]);
    // The solos turn away from each other and cross back at CP (mirror images, so they meet on x = 0).
    const solo = (id, sign, alt) => detach(tracks, id, tDet, (p) => {
      p.pitchTo(0, { g: 2 }).until((q) => q.p[2] >= 3000).hold(alt);
      p.turnToward([sign * 35, 0, 0], { dir: sign > 0 ? 'L' : 'R', bank: 74 }).flyTo([sign * 35, 0, 0]).fly(4).hold(null).pitchTo(8, { g: 3 }).fly(5);
    });
    // heading toward the crowd, #5 (left back corner) is on the +x side and #6 on -x
    solo(5, 1, 200); solo(6, -1, 260);
    const c = closestPass(tracks[5], 0, 0);
    return finish(tracks, { events: [...eventsOf(ref), evAt(tDet, 'Solos detach 1,500′ prior to CP'), evAt(c.t, 'Solos cross at CP')] });
  }
});

add({
  id: 'diamond-360', ref: '2-15', name: 'Diamond 360', group: 'diamond', ids: D4,
  data: { min: "200′", max: "800′", kin: '310', kout: '290' },
  text: 'In Diamond formation the Diamond executes a non-aerobatic right to left circular pass at less than 60° AOB crossing over CP at a minimum ALT of 200’.',
  build() {
    const R = 4300, z0 = 1000;
    const xc = Math.sqrt(2 * z0 * R - z0 * z0);
    const ref = new Pilot({ x: -11000, alt: 400, z: z0, dir: 'R', kts: 310 });
    ref.speed(290, 0.4).untilX(xc - 400).mark('Circular pass — <60° AOB').hold(250).turn(360, { dir: 'L', r: R });
    ref.hold(400).fly(10);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    const c = closestPass(ref.track, 0, 0);
    return finish(tracks, { events: [...eventsOf(ref), evAt(c.t, 'Over CP')] });
  }
});

add({
  id: 'knife-edge', ref: '2-16', name: 'Opposing Knife Edge', group: 'solo', ids: [5, 6],
  data: { min: "100′", max: "1,500′", kin: '400', kout: '400' },
  text: 'At CP each pilot will roll his aircraft into a 90° angle of bank prior to the cross. After the cross, both aircraft will roll upright and clear in front of the crowd.',
  build() {
    const a = new Pilot({ x: -11000, alt: 200, z: 30, dir: 'R', kts: 400 });
    const b = new Pilot({ x: 11000, alt: 200, z: -30, dir: 'L', kts: 400 });
    a.untilX(-1150).mark('Knife edge').roll(90, { rate: 170 }).untilX(1300).roll(-90, { rate: 170 });
    b.untilX(1150).roll(-90, { rate: 170 }).untilX(-1300).roll(90, { rate: 170 });
    a.fly(1).mark('Clear in front of the crowd').pitchTo(10, { g: 4 }).turn(90, { dir: 'L', bank: 75 });
    b.fly(1).pitchTo(10, { g: 4 }).turn(90, { dir: 'R', bank: 75 });
    const c = closestPass(a.track, 0, 0);
    return finish({ 5: a.track, 6: b.track }, { events: [...eventsOf(a), evAt(c.t, 'Cross at CP')] });
  }
});

function formationRoll(o) {
  const ref = new Pilot({ x: o.x, alt: 200, z: o.z, dir: o.dir, kts: o.kts });
  if (o.gear) ref.gear(true);
  ref.until((q) => q.p[2] <= o.climbAtZ || (o.climbAtX != null && Math.abs(q.p[0]) <= o.climbAtX)).mark('Commence climb').pitchTo(o.climb, { g: 2.6 });
  ref.until((q) => q.alt >= o.rollAlt).mark(`360° roll — apex ≈ ${o.apex}`).roll(-360, { rate: o.rate, pull: o.pull, energy: 0.5 });
  ref.pitchTo(-o.down, { g: 2.5 }).hold(200).until((q) => q.alt < 320, { max: 40 });
  return ref;
}

add({
  id: 'diamond-roll', ref: '2-17', name: 'Diamond Roll', group: 'diamond', ids: D4,
  data: { min: "200′", max: "2,600′", kin: '365', kout: '365' },
  text: 'Approaching CP in Diamond, all four aircraft roll 360° in formation, starting the roll at 1500’ and topping at approximately 3200’. Minimum altitude on the ingress and egress roll line is 200’.',
  note: 'The data box lists 2,600′ maximum while the text describes topping at about 3,200′; the animation follows the text.',
  build() {
    const d = dir30(-1, -1);
    const ref = formationRoll({ x: 15000, z: 7600, dir: d, kts: 365, climbAtZ: 3600, climb: 24, rollAlt: 1500, apex: '3,200′', rate: 62, pull: 4.2, down: 12 });
    ref.mark('Egress crowd left').turn(30, { dir: 'L', bank: 45 }).fly(8);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'inv-inv', ref: '2-18', name: 'Inverted-to-Inverted Roll', group: 'solo', ids: [5, 6],
  data: { min: "100′", max: "1,500′", kin: '400', kout: '400' },
  text: 'Each pilot will roll his aircraft inverted at the edge of the aerobatic box. Crossing CP, each pilot will execute a 360° roll back to inverted and continue away from center point with a very slight climb. Once .5NM from center point is reached, both aircraft will clear behind the crowd.',
  build() {
    const six = new Pilot({ x: -12500, alt: 200, z: -25, dir: 'R', kts: 400 });
    const five = new Pilot({ x: 12500, alt: 200, z: 25, dir: 'L', kts: 400 });
    for (const [p, s] of [[six, -1], [five, 1]]) {
      p.untilX(s * BOX).mark('Roll inverted at the box edge').rollTo(180, { rate: 150 });
      p.untilX(s * 1000).mark('360° roll back to inverted').roll(s * 360, { rate: 240 });
      p.pitchTo(2, { g: 1.5 }).untilX(-s * NM / 2).mark('Clear behind the crowd');
      p.rollTo(s < 0 ? 90 : -90, { rate: 180 }).turn(90, { dir: s < 0 ? 'R' : 'L', bank: 75 }).pitchTo(8, { g: 3 }).fly(4);
    }
    const c = closestPass(six.track, 0, 0);
    return finish({ 5: five.track, 6: six.track }, { events: [...eventsOf(six), evAt(c.t, 'Cross at CP')] });
  }
});

add({
  id: 'aileron-roll', ref: '2-19', name: 'Diamond Aileron Roll', group: 'diamond', ids: D4,
  data: { min: "200′", max: "400′", kin: '400', kout: '400' },
  text: 'All four aircraft perform simultaneous 360° rolls within the aerobatic box.',
  build() {
    const ref = new Pilot({ x: -12000, alt: 220, z: 0, dir: 'R', kts: 400 });
    ref.untilX(0);
    const tcp = ref.t;
    ref.untilX(4500).mark('Clear behind the crowd').pitchTo(10, { g: 3 }).turn(90, { dir: 'R', bank: 60 });
    const rolls = Object.fromEntries(D4.map((id) => [id, [{ t: tcp - 1.3, deg: -360, dur: 2.6 }]]));
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }], rolls);
    return finish(tracks, { events: [evAt(tcp - 1.3, 'Simultaneous 360° rolls'), ...eventsOf(ref)] });
  }
});

add({
  id: 'fortus', ref: '2-20', name: 'Fortus', group: 'solo', ids: [5, 6],
  data: { min: "200′", max: "1,000′", kin: '275', kout: '275' },
  text: 'Both aircraft will approach from crowd right in the dirty configuration. #5 will roll inverted at the edge of the aerobatic box at a minimum of 200’. #6 will move to an abeam position upright, creating a mirror image effect. At CP both aircraft will climb. At 3/4nm, #5 will roll upright and both aircraft will clear crowd left behind the crowd.',
  note: 'In a single solo situation, #5 or #6 will perform an inverted dirty flat pass, rolling in at 1NM and rolling upright at 3/4nm.',
  build() {
    const ref = new Pilot({ x: 12500, alt: 220, z: 0, dir: 'L', kts: 275 });
    ref.gear(true).mark('Lower landing gear').untilX(BOX);
    const tIn = ref.t;
    ref.untilX(0).mark('Climb at CP').pitchTo(6, { g: 1.6 });
    ref.untilX(-0.75 * NM);
    const tUp = ref.t;
    ref.fly(2).mark('Clear crowd left behind the crowd').turn(90, { dir: 'L', bank: 55 });
    const tracks = formationTracks(ref.track, [5, 6],
      [{ t: 0, form: 'sectionWide' }, { t: tIn + 0.4, form: 'fortus', dur: 4 }, { t: tUp + 1.8, form: 'sectionWide', dur: 3 }],
      { 5: [{ t: tIn - 0.5, deg: 180, dur: 1.4 }, { t: tUp, deg: 180, dur: 1.4 }] });
    return finish(tracks, { events: [evAt(tIn - 0.5, '#5 rolls inverted'), ...eventsOf(ref), evAt(tUp, '#5 rolls upright')] });
  }
});

add({
  id: 'dirty-loop', ref: '2-21', name: 'Diamond Dirty Loop', group: 'diamond', ids: D4,
  data: { min: "200′", max: "6,900′", kin: '180', kout: '220' },
  text: 'In the Diamond formation all four aircraft will complete a loop over CP on the show line with the landing gear and hooks extended.',
  note: 'The published 180-knot entry speed cannot carry a loop of the drawn size without thrust, so the animation enters faster and bleeds speed over the top.',
  build() {
    const ref = new Pilot({ x: -11000, alt: 220, z: 0, dir: 'R', kts: 250 });
    ref.gear(true).ab(true).untilX(-400).mark('Dirty loop').pull(360, { r: 3150, energy: 0.16 }).ab(false);
    ref.fly(4).mark('Clear behind the crowd').turn(90, { dir: 'R', bank: 50 });
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'mrt', ref: '2-22', name: 'Solo Minimum-Radius Turn', group: 'solo', ids: [5],
  data: { min: "150′", max: "1,000′", kin: '350', kout: '200' },
  text: 'This maneuver is a non-aerobatic level horizontal 390° turn at 150’ AGL, away from the crowd. At the completion of the 390° turn, #5 will exit the flight line vertically outboard of the show line and level off above 1000’ AGL. #6 will rendezvous from behind the crowd.',
  build() {
    const p = new Pilot({ x: -12000, alt: 200, z: 0, dir: 'R', kts: 350 });
    p.hold(150).untilX(-300).mark('390° minimum-radius turn').speed(200, 7).turn(390, { dir: 'L', bank: 81, rollRate: 200 });
    p.hold(null).mark('Exit vertically').ab(true).pitchTo(70, { g: 6 }).until((q) => q.alt > 1500).rollTo(180, { rate: 200 }).pitchTo(0, { g: 3 }).rollTo(0, { rate: 200 }).ab(false).fly(5);
    return finish({ 5: p.track }, { events: eventsOf(p) });
  }
});

add({
  id: 'mrt-flat', ref: '2-22a', name: 'Solo Minimum-Radius Turn (Flat)', group: 'solo', ids: [5, 6],
  data: { min: "150′", max: "500′", kin: '350', kout: '200' },
  text: 'This maneuver is a non-aerobatic level horizontal 360° turn at 200’ AGL, away from the crowd. At the completion of the 360° turn, #6 will rendezvous over the top of #5 at 500’ AGL.',
  build() {
    const p = new Pilot({ x: -12000, alt: 200, z: 0, dir: 'R', kts: 350 });
    p.hold(200).untilX(-300).mark('Level 360° turn').speed(220, 7).turn(360, { dir: 'L', bank: 81, rollRate: 200 });
    p.hold(500).speed(300, 8).fly(14);
    const tJoin = p.t - 3;
    const join = formationTracks(p.track, [6], [{ t: 0, form: 'solo' }]);
    // #6 runs in from behind the crowd on a converging line
    const j = join[6].sample(tJoin);
    const dir = V.norm([0.6, 0, -0.8]);
    const s6 = new Pilot({ x: j.p[0] - dir[0] * 380 * KT * tJoin, alt: 520, z: j.p[2] - dir[2] * 380 * KT * tJoin, dir, kts: 380 });
    s6.fly(tJoin + 15);
    const top = formationTracks(p.track, [6], [{ t: 0, form: 'section' }])[6];
    for (let i = 0; i < top.length; i++) { top.p[i * 3 + 1] += 40; }
    blendInto(s6.track, top, tJoin - 4, tJoin + 1);
    return finish({ 5: p.track, 6: s6.track }, { events: [...eventsOf(p), evAt(tJoin, '#6 rendezvous over the top')] });
  }
});

add({
  id: 'farvel', ref: '2-23', name: 'Double Farvel', group: 'diamond', ids: D4,
  data: { min: "200′", max: "400′", kin: '385', kout: '385' },
  text: '#1 & #4 roll inverted simultaneously at the edge of the aerobatic box while #2 & #3 remain upright. Maintaining a diamond formation they commence a flat pass at 200’. No later than 1NM past CP #1 & #4 sequentially roll upright in a climb.',
  build() {
    const ref = new Pilot({ x: 13000, alt: 350, z: 0, dir: 'L', kts: 385 });
    ref.hold(210).untilX(BOX + 600);
    const tIn = ref.t;
    ref.untilX(-NM + 1500).hold(null).mark('Climb — roll upright').pitchTo(12, { g: 2.4 });
    const tUp = ref.t;
    ref.fly(5).turn(90, { dir: 'L', bank: 55 });
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }], {
      1: [{ t: tIn, deg: 180, dur: 1.5 }, { t: tUp + 1.2, deg: -180, dur: 1.4 }],
      4: [{ t: tIn, deg: -180, dur: 1.5 }, { t: tUp, deg: 180, dur: 1.4 }]
    });
    return finish(tracks, { events: [evAt(tIn, '#1 & #4 roll inverted'), ...eventsOf(ref)] });
  }
});

add({
  id: 'opp-mrt', ref: '2-24', name: 'Opposing Minimum-Radius Turn', group: 'solo', ids: [5, 6],
  data: { min: "500′ / 200′", max: "1,500′", kin: '400', kout: '400' },
  text: 'From behind the crowd, #5 & #6 will approach in an abeam formation at 400 KCAS and 500’ AGL crossing over the spectator area. They will extend to approximately 1500’ past the show line with #5 moving 50\'-75\' aft of #6. Each aircraft will roll 270° away from each other and commence a cross. They will cross again over CP at a minimum of 200’ AGL. Both A/C will roll out in front of the show line, pull 40° nose up and execute 3 1/2 rolls.',
  note: 'Low show clear is 20° nose up and 2 1/2 rolls. Flat show clear is 10° nose up and 1 1/2 rolls.',
  variants: { low: 'Low show clear: 20° nose up, 2½ rolls', flat: 'Flat show clear: 10° nose up, 1½ rolls' },
  build(opts = {}) {
    const R = 2050;
    const clear = opts.show === 'flat' ? [10, 540] : opts.show === 'low' ? [20, 900] : [40, 1260];
    const fly = (side, aft, rollZ) => {
      const p = new Pilot({ x: side * R, alt: 500, z: 9000 + aft, dir: 'A', kts: 400 });
      p.until((q) => q.p[2] <= rollZ).mark('Roll 270° away').roll(side * -270, { rate: 260 });
      p.hold(200).turn(270, { dir: side < 0 ? 'R' : 'L', r: R, rollRate: 200 });
      return p;
    };
    // z where the -x jet crosses x = 0 heading crowd left (the second cross)
    const crossZ = (z) => {
      const tr = fly(-1, 0, z).track;
      for (let i = tr.length - 1; i > 0; i--) if (tr.p[i * 3] <= 0 && tr.p[(i - 1) * 3] > 0) return tr.p[i * 3 + 2];
      return 0;
    };
    const rz = solve(crossZ, -1000, -1400, 8);
    const six = fly(-1, 0, rz), five = fly(1, 60, rz + 60);
    for (const [p, s] of [[six, -1], [five, 1]]) {
      p.hold(null).fly(1.5).mark(`Pull ${clear[0]}° nose up — ${clear[1] / 360} rolls`).pitchTo(clear[0], { g: 5 });
      p.roll(s * clear[1], { rate: 260, energy: 0.6 }).pitchTo(0, { g: 3 }).rollTo(0).fly(3);
    }
    const c = closestPass(six.track, 0, 0);
    const top = closestPass(six.track, 0, -2 * R);
    return finish({ 5: five.track, 6: six.track }, { events: [...eventsOf(six), evAt(top.t, 'First cross'), evAt(c.t, 'Second cross at CP')] });
  }
});

add({
  id: 'echelon-parade', ref: '2-25', name: 'Echelon Parade', group: 'diamond', ids: D4,
  data: { min: "200′", max: "800′", kin: '310', kout: '290' },
  text: 'In right Echelon the Diamond executes a right to left non-aerobatic circular pass at approximately 60° AOB crossing over CP at a minimum altitude of 200’.',
  build() {
    const R = 4300, z0 = 1000;
    const xc = Math.sqrt(2 * z0 * R - z0 * z0);
    const ref = new Pilot({ x: -11000, alt: 400, z: z0, dir: 'R', kts: 310 });
    ref.speed(290, 0.4).untilX(xc - 400).mark('Right echelon — 60° AOB').hold(250).turn(360, { dir: 'L', r: R });
    ref.hold(400).fly(8);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'echelonR' }]);
    const c = closestPass(ref.track, 0, 0);
    return finish(tracks, { events: [...eventsOf(ref), evAt(c.t, 'Over CP')] });
  }
});

add({
  id: 'opp-hrolls', ref: '2-26', name: 'Opposing Horizontal Rolls', group: 'solo', ids: [5, 6],
  data: { min: "100′", max: "7,500′", kin: '400', kout: '200' },
  text: 'Approaching CP, each pilot will commence a 3-4° climb and then roll the aircraft 720°. After rolling wings level, both pilots will pull 90° nose up, then roll 90° and pull to level flight. Once upright the pilots clear heading behind the crowd.',
  build() {
    const six = new Pilot({ x: -12000, alt: 150, z: -30, dir: 'R', kts: 400 });
    const five = new Pilot({ x: 12000, alt: 150, z: 30, dir: 'L', kts: 400 });
    for (const [p, s] of [[six, -1], [five, 1]]) {
      p.untilX(s * 3200).pitchTo(3.5, { g: 1.5 }).untilX(s * 1750).mark('720° roll').roll(-s * 720, { rate: 270 });
      p.fly(0.6).mark('Pull to the vertical').pull(90, { g: 6.5, energy: 0.9 }).until((q) => q.kts < 250, { energy: 0.9 });
      p.mark('Roll 90°, pull to level').rollToward([0, 0, 1], { rate: 180 }).pull(90, { g: 3.5, energy: 0.9 }).rollTo(0).mark('Clear behind the crowd').fly(6);
    }
    const c = closestPass(six.track, 0, 0);
    return finish({ 5: five.track, 6: six.track }, { events: [...eventsOf(six), evAt(c.t, 'Cross at CP')] });
  }
});

function echelonRoll(changeover) {
  const ref = new Pilot({ x: -9600, alt: 500, z: 5200, dir: 'A', kts: 365 });
  ref.until((q) => q.p[2] <= 3500).mark('Transition to left echelon').turn(90, { dir: 'R', r: 4200 });
  const tEch = 4;
  ref.untilX(-3600).mark('Commence climb').pitchTo(28, { g: 2.6 });
  ref.until((q) => q.alt > 1800).mark('360° roll to the left');
  const tRoll = ref.t;
  ref.roll(-360, { rate: 70, pull: 3.6, energy: 0.55 });
  const tAfter = ref.t;
  ref.pitchTo(-8, { g: 2.5 });
  if (changeover) ref.mark('Egress behind the crowd, crowd right').turn(90, { dir: 'R', bank: 55 }).fly(4);
  else ref.mark('Egress right — back to Diamond').fly(14);
  const schedule = [{ t: 0, form: 'diamond' }, { t: tEch, form: 'echelonL', dur: 8 },
    changeover ? { t: tRoll + 90 / 70, form: 'diamond', dur: 3 } : { t: tAfter + 1.5, form: 'diamond', dur: 6 }];
  const tracks = formationTracks(ref.track, D4, schedule);
  return finish(tracks, { events: [...eventsOf(ref), changeover ? evAt(tRoll + 90 / 70, 'Shift to Diamond 90° through the roll') : null] });
}

add({
  id: 'left-echelon-roll', ref: '2-27', name: 'Left Echelon Roll', group: 'diamond', ids: D4,
  data: { min: "300′", max: "5,300′", kin: '365', kout: '350' },
  text: 'Ingressing from crowd left in front of the crowd, the Diamond transitions to left echelon. Approaching CP they commence a climb and then roll the formation 360° to the left and egress to the right as they transition back to Diamond.',
  build: () => echelonRoll(false)
});

add({
  id: 'changeover', ref: '2-27a', name: 'Changeover Roll', group: 'diamond', ids: D4,
  data: { min: "300′", max: "5,300′", kin: '365', kout: '350' },
  text: 'Ingressing from crowd left in front of the crowd, the Diamond transitions to left echelon. Approaching CP they commence a climb and then roll the formation 360° to the left, shifting to Diamond 90° through the roll and egress behind the crowd, crowd right.',
  build: () => echelonRoll(true)
});

add({
  id: 'sneak', ref: '2-28', name: 'Sneak Pass, Blue Angel 5', group: 'solo', ids: [5],
  data: { min: "50′", max: "500′", kin: '600', kout: '600' },
  text: 'A flat pass on the 500’ show line at 50’ AGL. Once past the spectator area, a clear to crowd right behind the crowd is executed.',
  build() {
    const p = new Pilot({ x: -16000, alt: 60, z: 0, dir: 'R', kts: 600 });
    p.hold(50).untilX(0).mark('Over CP at 50′');
    p.untilX(2600).hold(null).mark('Clear behind the crowd').pitchTo(14, { g: 4 }).turn(100, { dir: 'R', bank: 78 });
    return finish({ 5: p.track }, { events: eventsOf(p) });
  }
});

add({
  id: 'sneak-vertical', ref: '2-29', name: 'Sneak to Vertical Rolls, Blue Angel 6', group: 'solo', ids: [6],
  data: { min: "500′", max: "15,000′", kin: '600', kout: '200' },
  text: 'From behind the spectator area, Blue Angel #6 approaches CP straight and level at 500’ AGL. Passing CP, #6 pulls to 85° nose high and executes a series of vertical rolls with a clear behind the crowd.',
  build() {
    const p = new Pilot({ x: 0, alt: 500, z: 15000, dir: 'A', kts: 600 });
    p.ab(true).untilZ(0).mark('Pull to 85° nose high').pitchTo(85, { g: 7, energy: 0.8 });
    p.mark('Vertical rolls').roll(1080, { rate: 220, energy: 0.8 }).until((q) => q.kts < 230, { energy: 0.8, max: 60 }).ab(false);
    p.mark('Clear behind the crowd').rollToward([0, 0, 1], { rate: 160 }).pull(120, { g: 3, energy: 0.6 }).rollTo(0).pitchTo(-12, { g: 2 }).fly(6);
    return finish({ 6: p.track }, { events: eventsOf(p) });
  }
});

add({
  id: 'la-loop', ref: '2-30', name: 'Line Abreast Loop', group: 'diamond', ids: [1, 2, 3, 4, 5],
  data: { min: "200′", max: "8,400′", kin: '420', kout: '350' },
  text: 'At approximately 3-1/2NM, aircraft #1,2,3,4 and 5 transition to a Line Abreast formation. Approaching CP, they complete a loop. Egressing crowd left, aircraft #1-4 shift back to Diamond and detach #5.',
  build() {
    const ref = new Pilot({ x: 13500, alt: 200, z: 0, dir: 'L', kts: 420 });
    ref.untilX(-300).mark('Line abreast loop').pull(360, { r: 3750, energy: 0.42 });
    ref.fly(3);
    const tDet = ref.t;
    ref.mark('Back to Diamond — detach #5').fly(12);
    const tracks = formationTracks(ref.track, [1, 2, 3, 4, 5],
      [{ t: 0, form: 'lineAbreast' }, { t: tDet, form: 'delta', dur: 4 }]);
    detach(tracks, 5, tDet + 1, (p) => p.pitchTo(8, { g: 3 }).turn(90, { dir: 'L', bank: 70 }));
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'four-point', ref: '2-31', name: 'Opposing Four-Point Roll', group: 'solo', ids: [5, 6],
  data: { min: "200′", max: "1,500′", kin: '400', kout: '400' },
  text: 'Approaching CP at 200’ AGL, each aircraft executes a left four point roll crossing over CP in the inverted position. High show clears will be executed in front of the crowd. Low and flat show clears will be executed behind the crowd.',
  build(opts = {}) {
    const behind = opts.show === 'low' || opts.show === 'flat';
    const five = new Pilot({ x: -12000, alt: 200, z: 30, dir: 'R', kts: 400 });
    const six = new Pilot({ x: 12000, alt: 200, z: -30, dir: 'L', kts: 400 });
    for (const [p, s] of [[five, -1], [six, 1]]) {
      p.untilX(s * 1520).mark('Left four-point roll');
      p.roll(-90, { rate: 220 }).fly(0.32).roll(-90, { rate: 220 }).fly(0.5).roll(-90, { rate: 220 }).fly(0.32).roll(-90, { rate: 220 });
      p.fly(1.6).mark(behind ? 'Clear behind the crowd' : 'Clear in front of the crowd').pitchTo(10, { g: 4 });
      const toCrowd = s < 0 ? 'R' : 'L';
      p.turn(90, { dir: behind ? toCrowd : (toCrowd === 'R' ? 'L' : 'R'), bank: 72 }).fly(3);
    }
    const c = closestPass(five.track, 0, 0);
    return finish({ 5: five.track, 6: six.track }, { events: [...eventsOf(five), evAt(c.t, 'Inverted over CP')] });
  }
});

add({
  id: 'vertical-break', ref: '2-32', name: 'Diamond Vertical Break', group: 'diamond', ids: D4,
  data: { min: "500′", max: "9,000′", kin: '400', kout: '300' },
  text: 'Approaching from directly behind the crowd in a trail formation, the four diamond aircraft will commence a climb approaching CP. At 30° nose up they will transition back to the diamond formation. Reaching 60° nose up, they will split in four separate directions. At this point the maneuver is complete and they will rendezvous crowd left in front of the crowd.',
  build() {
    const ref = new Pilot({ x: 0, alt: 500, z: 14000, dir: 'A', kts: 400 });
    ref.untilZ(2800).mark('Commence climb').pitchTo(30, { g: 3.5 });
    const t30 = ref.t;
    ref.pitchTo(60, { g: 3.5 });
    const t60 = ref.t;
    ref.fly(6);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'trail' }, { t: t30 - 2.5, form: 'diamond', dur: 3.5 }]);
    detach(tracks, 1, t60, (p) => p.pull(115, { g: 4, energy: 0.6 }).rollTo(0, { rate: 160 }).pitchTo(-5, { g: 2 }).fly(5));
    detach(tracks, 2, t60, (p) => p.rollTo(80, { rate: 200 }).pull(100, { g: 4.5 }).rollTo(0, { rate: 160 }).pitchTo(-10, { g: 3 }).fly(6));
    detach(tracks, 3, t60, (p) => p.rollTo(-80, { rate: 200 }).pull(100, { g: 4.5 }).rollTo(0, { rate: 160 }).pitchTo(-10, { g: 3 }).fly(6));
    detach(tracks, 4, t60, (p) => p.rollTo(180, { rate: 200 }).pull(70, { g: 3.5 }).rollTo(0, { rate: 160 }).pitchTo(-5, { g: 2 }).fly(8));
    return finish(tracks, { events: [...eventsOf(ref), evAt(t30 - 1, '30° — back to Diamond'), evAt(t60, '60° — split four ways')] });
  }
});

add({
  id: 'vertical-pitch', ref: '2-33', name: 'Vertical Pitch', group: 'solo', ids: [5, 6],
  data: { min: "50′ / 100′", max: "9,000′", kin: '420', kout: '480' },
  text: 'Approaching CP at a minimum of 50’, each aircraft pulls 65°-70° nose up and then rolls to inverted. Both aircraft complete a split “S” and cross over CP. At CP each pilot performs a right 360° roll, then clears behind the crowd.',
  build() {
    const fly = (side, zOff, rollAlt) => {
      const p = new Pilot({ x: side * 15000, alt: 100, z: zOff, dir: side < 0 ? 'R' : 'L', kts: 420 });
      p.untilX(side * 5200).mark('Pull 65°–70° nose up').pitchTo(67, { g: 5.5, energy: 0.6 });
      p.until((q) => q.alt >= rollAlt, { energy: 0.6 }).mark('Roll inverted').roll(180, { rate: 200, energy: 0.6 });
      p.mark('Split S').pull(247, { g: 5.2, energy: 0.55 }).hold(150);
      return p;
    };
    const minAlt = (p) => { let m = 1e9; for (let i = 0; i < p.track.length; i++) if (p.track.t0 + i * DT > 8) m = Math.min(m, p.track.p[i * 3 + 1]); return m; };
    const ra = solve((h) => minAlt(fly(-1, 0, h)) - 150, 3500, 4200, 10);
    const six = fly(-1, -35, ra), five = fly(1, 35, ra);
    for (const [p, s] of [[six, -1], [five, 1]]) {
      p.until((q) => (s < 0 ? q.p[0] <= 450 : q.p[0] >= -450)).mark('Right 360° roll at CP').roll(360, { rate: 280 });
      p.hold(null).fly(1).mark('Clear behind the crowd').pitchTo(8, { g: 3 }).turn(90, { dir: s < 0 ? 'L' : 'R', bank: 70 }).fly(3);
    }
    return finish({ 5: five.track, 6: six.track }, { events: eventsOf(six) });
  }
});

add({
  id: 'barrel-break', ref: '2-34', name: 'Barrel Roll Break', group: 'diamond', ids: D4,
  data: { min: "300′", max: "8,800′", kin: '400', kout: '380' },
  text: 'Ingressing from in front of the crowd 2000’ crowd right, the diamond formation will commence a vertical climb. Approaching 1.7 NM from CP, they will roll the formation 90° to the left and complete the back side of the looping maneuver. As the formation passes through the horizon at approximately 500\' AGL, they will split in three separate directions. 1 and 4 will exit out the show line while 2 and 3 egress 90° in front of and behind the crowd respectively. The rendezvous will be conducted behind the crowd.',
  build() {
    const R2 = 3200;
    const ref = new Pilot({ x: 2000, alt: 350, z: -15000, dir: 'T', kts: 400 });
    ref.until((q) => q.p[2] >= -1400 - 2900).mark('Vertical climb').pull(90, { r: 2900, energy: 0.5 });
    ref.until((q) => q.alt >= 500 + R2 * 1.05, { energy: 0.85, max: 20 });
    ref.mark('Roll 90° left').roll(-90, { rate: 90, energy: 0.85 }).mark('Back side of the loop').pull(270, { r: R2, energy: 0.5 });
    const tSplit = ref.t;
    ref.fly(10);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    detach(tracks, 1, tSplit, (p) => p.pitchTo(5, { g: 2 }).fly(8));
    detach(tracks, 4, tSplit, (p) => p.fly(8));
    detach(tracks, 2, tSplit, (p) => p.turn(90, { dir: 'R', bank: 75 }).fly(5));
    detach(tracks, 3, tSplit, (p) => p.turn(90, { dir: 'L', bank: 75 }).fly(5));
    return finish(tracks, { events: [...eventsOf(ref), evAt(tSplit, 'Split — three directions')] });
  }
});

add({
  id: 'tuck-over', ref: '2-35', name: 'Tuck-Over Roll', group: 'solo', ids: [5, 6],
  data: { min: "200′", max: "1,500′", kin: '400', kout: '400' },
  text: 'MANEUVER (UPRIGHT TOR): At CP, both aircraft will perform simultaneous left 450° rolls and clear behind the crowd. MANEUVER (INVERTED TOR): At the edge of the aerobatic box, both aircraft will perform a left roll to inverted. At CP, both aircraft will perform simultaneous left 240° rolls and clear behind the crowd.',
  build() {
    // Section flies as two independent aircraft so each rolls about its own axis.
    const mk = (z, alt) => {
      const p = new Pilot({ x: 13000, alt, z, dir: 'L', kts: 400 });
      p.untilX(1050).mark('Simultaneous left 450° rolls').roll(-450, { rate: 280 });
      p.mark('Clear behind the crowd').turn(110, { dir: 'L', bank: 78, rollRate: 120 }).pitchTo(10, { g: 3 }).fly(3);
      return p;
    };
    const five = mk(-40, 250), six = mk(40, 250);
    return finish({ 5: five.track, 6: six.track }, { events: eventsOf(five) });
  }
});

add({
  id: 'low-break-cross', ref: '2-36', name: 'Diamond Low-Break Cross', group: 'diamond', ids: D4,
  data: { min: "500′", max: "700′", kin: '360', kout: '330' },
  text: 'Approaching from directly behind the crowd in diamond formation at 500’ AGL, all four aircraft will separate in 4 different directions. All four aircraft will fly the outbound leg at 700’ AGL, then execute a reversal turn to the show line and simultaneously cross over CP. The rendezvous is executed behind the crowd.',
  note: 'Inbound altitudes: #1, #4 at 150′ AGL; #2 at 300′ AGL; #3 at 450′ AGL.',
  build() {
    const ref = new Pilot({ x: 0, alt: 500, z: 12000, dir: 'A', kts: 360 });
    ref.untilZ(-300);
    const tB = ref.t;
    ref.fly(4);
    const plan = { 1: ['L', 55, 150, -45], 2: ['R', 55, 300, 0], 3: ['L', 125, 450, 0], 4: ['R', 125, 150, 45] };
    const build = (id, legSec) => {
      const tr = formationTracks(ref.track, [id], [{ t: 0, form: 'diamond' }])[id];
      const [dir, ang, inAlt, off] = plan[id];
      const p = Pilot.from(tr, tB);
      p.hold(700).turn(ang, { dir, bank: 70 }).fly(legSec).mark('Reversal turn');
      p.turnToward([off, 0, 0], { dir, bank: 75 }).hold(inAlt).flyTo([off, 0, 0]).fly(5);
      return p.track;
    };
    const arrive = (id, s) => closestPass(build(id, s), plan[id][3], 0).t;
    const base = { 1: 14, 2: 14, 3: 10, 4: 10 };
    const target = Math.max(...D4.map((id) => arrive(id, base[id]))) + 1;
    const tracks = {};
    for (const id of D4) {
      const leg = solve((s) => arrive(id, s) - target, base[id], base[id] + 2, 10);
      tracks[id] = build(id, leg);
    }
    return finish(tracks, { events: [evAt(tB, 'Break — four directions'), evAt(target, 'Simultaneous cross at CP')] });
  }
});

add({
  id: 'high-alpha', ref: '2-37', name: 'Section High-Alpha Pass', group: 'solo', ids: [5, 6],
  data: { min: "500′", max: "1,500′", kin: '120', kout: '250' },
  text: 'Both aircraft slow to approximately 120 KCAS abeam each other. At approximately the center point position, both aircraft will clear simultaneously. #6 will clear with a slow pitch up to 60° nose high, then a left roll to inverted, followed by a right 90° roll then clear behind the crowd above 1000’ AGL. #5 will clear straight ahead and level. This maneuver can be flown from either direction, depending on prevailing wind.',
  build() {
    const five = new Pilot({ x: 7500, alt: 520, z: -45, dir: 'L', kts: 125 });
    const six = new Pilot({ x: 7500, alt: 520, z: 45, dir: 'L', kts: 125 });
    five.hold(520).untilX(0).mark('Clear straight ahead').ab(true).speed(250, 18).fly(14);
    six.hold(520).untilX(0).hold(null).mark('Slow pitch up to 60°').ab(true).pitchTo(60, { g: 1.25, energy: 0.2 });
    six.mark('Left roll to inverted').roll(-180, { rate: 90, energy: 0.2 }).mark('Right 90° roll').roll(90, { rate: 90 });
    six.pull(80, { g: 2.2, energy: 0.3 }).rollTo(0, { rate: 120 }).pitchTo(0, { g: 2 }).ab(false).fly(6);
    return finish({ 5: five.track, 6: six.track }, { events: eventsOf(six) });
  }
});

add({
  id: 'burner-270', ref: '2-38', name: 'Diamond Burner 270', group: 'diamond', ids: D4,
  data: { min: "200′", max: "500′", kin: '220', kout: '400' },
  text: 'Ingressing from crowd left in front of the crowd, the formation approaches in Diamond. Approaching CP at minimum altitude of 200’ AGL they commence a slightly climbing left turn, selecting afterburner as they execute a 270° turn in front of the crowd and egress to crowd left behind the crowd.',
  build() {
    const ref = new Pilot({ x: -9000, alt: 220, z: 700, dir: 'R', kts: 220 });
    ref.untilX(-300).ab(true).mark('Burner — climbing left turn').speed(400, 10).hold(480).turn(270, { dir: 'L', bank: 68 });
    ref.hold(null).ab(false).mark('Egress behind the crowd').fly(12);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'delta-roll', ref: '2-39', name: 'Delta Roll', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "200′", max: "4,300′", kin: '365', kout: '365' },
  text: 'From crowd right behind the crowd, all six aircraft will commence a climb approaching CP and roll 360° in formation at approximately 4000’ AGL. The egress will be crowd left in front of the crowd.',
  build() {
    const d = V.norm([-0.74, 0, -0.67]);
    const ref = new Pilot({ x: 11000, alt: 200, z: 10000, dir: d, kts: 365 });
    ref.until((q) => q.p[2] <= 5200).mark('Commence climb').pitchTo(26, { g: 2.4 });
    ref.until((q) => q.alt >= 3300).mark('360° roll at ≈ 4,000′').roll(-360, { rate: 52, pull: 3.2, energy: 0.5 });
    ref.pitchTo(-14, { g: 2.2 }).hold(200).mark('Egress crowd left in front').turnToward([-30000, 0, -4000], { bank: 40 }).fly(6);
    const tracks = formationTracks(ref.track, [1, 2, 3, 4, 5, 6], [{ t: 0, form: 'delta' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'fleur', ref: '2-40', name: 'Fleur De Lis', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "200′", max: "1,000′", kin: '420', kout: '350' },
  text: 'Approaching the show line in a Double “V” formation, the six aircraft will commence a climb. At approximately 2000’ prior to CP, all six aircraft will split simultaneously. The two solos will execute 1-1/2 rolls and exit crowd right initially, then turn behind the crowd. The four Diamond aircraft will rendezvous during their looping maneuver over CP and egress in Diamond crowd right to crowd right in front of the crowd.',
  note: 'The data box lists 1,000′ maximum while the diagram shows the looping maneuver near 8,000′; the animation follows the diagram.',
  build() {
    const ref = new Pilot({ x: -14000, alt: 300, z: 0, dir: 'R', kts: 420 });
    ref.untilX(-6000).mark('Commence climb').pitchTo(12, { g: 2.5 });
    ref.untilX(-2000);
    const tS = ref.t;
    ref.fly(4);
    const tracks = formationTracks(ref.track, [1, 2, 3, 4, 5, 6], [{ t: 0, form: 'doubleV' }]);
    const loop = (id, tilt) => detach(tracks, id, tS, (p) => {
      p.speed(380, 1.2).rollTo(tilt, { rate: 120 }).pull(360 - 12, { r: 3300, energy: 0 }).rollTo(0, { rate: 120 }).speed(null);
    });
    loop(1, 0); loop(4, 0); loop(2, 38); loop(3, -38);
    const tEnd = Math.max(...[1, 2, 3, 4].map((id) => tracks[id].t1));
    // rejoin: wingmen settle back onto #1 in Diamond for the egress
    const lead = Pilot.from(tracks[1], tracks[1].t1);
    lead.fly(tEnd - lead.t + 14);
    const join = formationTracks(tracks[1], [2, 3, 4], [{ t: 0, form: 'diamond' }]);
    for (const id of [2, 3, 4]) { const pl = Pilot.from(tracks[id], tracks[id].t1); pl.fly(tEnd - pl.t + 14); blendInto(tracks[id], join[id], tEnd - 6, tEnd + 2); }
    detach(tracks, 5, tS, (p) => p.roll(540, { rate: 220, pull: 5 }).rollTo(90, { rate: 180 }).fly(2).turn(90, { dir: 'R', bank: 60 }).fly(6));
    detach(tracks, 6, tS, (p) => p.roll(-540, { rate: 220, pull: 0.5 }).rollTo(90, { rate: 180 }).turn(90, { dir: 'R', bank: 75 }).fly(6));
    return finish(tracks, { events: [...eventsOf(ref), evAt(tS, 'Six-way split'), evAt(tEnd - 6, 'Diamond rendezvous')], end: tEnd + 6 });
  }
});

add({
  id: 'loop-break-cross', ref: '2-41', name: 'Loop Break / 6-Plane Cross', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "200′", max: "8,400′", kin: '420', kout: '400' },
  text: 'From crowd right on the show line, all six aircraft will commence a loop in formation approaching CP. At the vertical down above CP, the six aircraft will slowly separate and exit in six different directions leveling at 1000’ AGL, heading outbound on ingress / egress lines. At 3NM each pilot will perform a Half-Cuban Eight Reversal turn towards CP, descend to his respective altitude and cross CP.',
  note: 'All outbound aircraft are at 1000’ AGL to 3NM. Inbound altitudes are routinely flown higher during the first half of the season. Minimum inbound altitudes: #1, #4: 150’ AGL; #2, #5: 300’ AGL; #3, #6: 450’ AGL.',
  build() {
    const R = 3600;
    const ref = new Pilot({ x: 12000, alt: 200, z: 0, dir: 'L', kts: 420 });
    ref.untilX(-R + 300).mark('Delta loop').pull(255, { r: R, energy: 0.42 });
    const tV = ref.t;
    ref.fly(3);
    const lines = { 1: [-1, 0, 0], 4: [1, 0, 0], 2: dir30(-1, -1), 6: dir30(1, -1), 3: dir30(-1, 1), 5: dir30(1, 1) };
    const inAlt = { 1: 150, 4: 150, 2: 300, 5: 300, 3: 450, 6: 450 };
    const ids = [1, 2, 3, 4, 5, 6];
    const base = formationTracks(ref.track, ids, [{ t: 0, form: 'delta' }]);
    const build = (id, out) => {
      const tr = formationTracks(ref.track, [id], [{ t: 0, form: 'delta' }])[id];
      const p = Pilot.from(tr, tV);
      p.rollToward(lines[id], { rate: 150 }).pull(75, { r: 2700, energy: 0.5 }).rollTo(0, { rate: 120 }).hold(1000);
      p.until((q) => Math.hypot(q.p[0], q.p[2]) >= out).hold(null).mark('Half-Cuban reversal');
      p.pull(225, { g: 4.8, energy: 0.5 }).roll(180, { rate: 140 }).fly(1);
      const lead = (q) => (q.v * q.v) / (4 * 32.174) * (1 - Math.cos(45 * DEG)) * 1.3;
      p.until((q) => q.alt <= inAlt[id] + lead(q), { energy: 0.5 }).pitchTo(0, { g: 4 }).hold(inAlt[id]);
      // jets inbound on the same line from opposite ends pass well to the right of each other
      const aim = V.mul(V.norm(V.cross(V.mul(lines[id], -1), [0, 1, 0])), 90);
      p.turnToward(aim, { bank: 25 }).flyTo(aim).fly(5);
      return p.track;
    };
    const arrive = (id, out) => closestPass(build(id, out), 0, 0).t;
    const target = Math.max(...ids.map((id) => arrive(id, 3 * NM))) + 0.5;
    const tracks = {};
    for (const id of ids) tracks[id] = build(id, solve((o) => arrive(id, o) - target, 3 * NM, 3 * NM - 600, 10));
    void base;
    return finish(tracks, { events: [...eventsOf(ref), evAt(tV, 'Vertical down — six-way separation'), evAt(target, '6-plane cross at CP')] });
  }
});

add({
  id: 'delta-breakout', ref: '2-42', name: 'Delta Break Out / Head-On', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "300′", max: "2,900′", kin: '330', kout: '300' },
  text: 'The Delta will roll out in a head on set up and commence a climb. One nautical mile in front of the crowd, Boss in the #1 jet will call “Ready, Break!” and the Delta will split. The Lead (#1) will pull up into a steady 2G climb straight ahead. The solos (#5 & #6) will pull outboard in a steady, 2G, 60° angle of bank, and offset by 90°. The wingmen (#2 & #3) will pull outboard in a steady 2G, 45° angle of bank, and offset by 45°. The lead and slot (#1 & #4) will continue straight ahead and exit behind the crowd. The solos and wingmen will rendezvous with the lead and slot behind the crowd. If weather precludes the break out, the maneuver becomes a Head-On Pass. Boss will keep the Delta Formation and climb to a minimum of 500’ AGL prior to crossing show line.',
  note: 'Taken literally, the 2 G / 45° and 2 G / 60° numbers would bunch the wingmen and solos together and leave #1 alone at the top. The animation follows what spectators see: an even fan, with #1, #2/#3 and #5/#6 opening at 0°, 45° and 90° around the slot.',
  build() {
    const ref = new Pilot({ x: 0, alt: 300, z: -17000, dir: 'T', kts: 330 });
    ref.until((q) => q.p[2] >= -9500).mark('Commence climb').pitchTo(6, { g: 1.6 });
    ref.until((q) => q.p[2] >= 1500 - NM);
    const tB = ref.t;
    ref.fly(16);
    const ids = [1, 2, 3, 4, 5, 6];
    const tracks = formationTracks(ref.track, ids, [{ t: 0, form: 'delta' }]);
    // Seen head-on from the crowd the break is an even fan around the slot (#4), which flies straight
    // ahead: #1 at the top, #2/#3 on the 45° diagonals, #5/#6 out at 90°, all the same distance from #4
    // as it opens. Gravity acts on everyone equally, so the spread comes from each jet's lift relative
    // to the slot's 1 G. For equal spacing every jet pulls K g relative to #4 in its fan direction:
    //   lift = 1 g up + K g toward the fan angle  ->  bank = atan2(K sin a, 1 + K cos a), G = |lift|.
    // K = 1.5 gives about #1 2.35 G wings level, #2/#3 2.3 G at 28° of bank, #5/#6 1.8 G at 56° of bank.
    const K = 1.5, HOLD = 7;
    const fanBreak = (angleDeg) => (p) => {
      const a = angleDeg * DEG;
      const k = K * (1 - 0.1 * Math.cos(a));            // #1 starts at the formation's front, so it pulls a touch less
      const side = k * Math.sin(a), up = 1 + k * Math.cos(a);
      const bank = Math.atan2(side, up) / DEG, g = Math.hypot(side, up);
      if (Math.abs(bank) > 0.5) p.roll(bank, { rate: 170 });
      p.holdG(HOLD, { g, bank }).rollTo(0, { rate: 90 }).pitchTo(8, { g: 1.5 }).fly(4);
    };
    detach(tracks, 4, tB, (p) => p.fly(16));
    detach(tracks, 1, tB, fanBreak(0));
    // in the Delta, #2 is right wing and #3 left wing; #5 flies the left back corner, #6 the right
    detach(tracks, 2, tB, fanBreak(45));
    detach(tracks, 3, tB, fanBreak(-45));
    detach(tracks, 6, tB, fanBreak(90));
    detach(tracks, 5, tB, fanBreak(-90));
    return finish(tracks, { events: [...eventsOf(ref), evAt(tB, '“Ready… Break!”', { call: true })], end: tB + 16 });
  }
});

add({
  id: 'roll-inverted-6', ref: '3-1', name: 'Low Transition / Roll to Inverted, Blue Angel 6', group: 'solo', ids: [6],
  data: { min: "0′", max: "1,000′", kin: '0', kout: '350' },
  text: '#6 will execute a low transition and at 300KTS pull to 15°-45° nose up. At 200-500’ AGL, roll the aircraft 180° to the inverted position. At 350KTS roll the aircraft 270° and clear in front of or behind the crowd.',
  build() {
    const p = new Pilot({ x: 5700, dir: 'L', kts: 0 });
    p.ab(true).takeoff({ rotate: 140 }).lowTransition({ kts: 300, alt: 35 }).mark('Pull 30° nose up').pitchTo(30, { g: 4 });
    p.until((q) => q.alt >= 300).mark('Roll inverted').roll(180, { rate: 200 }).pitchTo(0, { g: 2.2 });
    p.speed(350, 12).untilKts(349).mark('270° roll — clear behind the crowd').roll(-270, { rate: 200 }).ab(false).turn(90, { dir: 'L', bank: 75 }).fly(4);
    return finish({ 6: p.track }, { events: eventsOf(p) });
  }
});

add({
  id: 'diamond-flat', ref: '3-2', name: 'Diamond Flat Pass', group: 'diamond', ids: D4,
  data: { min: "200′", max: "200′", kin: '335', kout: '335' },
  text: 'The Diamond will perform a flat pass at 200’ AGL on the 500’ show line from crowd right to crowd left.',
  build() {
    const R = 4500;
    const ref = new Pilot({ x: 6000 + R, alt: 500, z: R + 5000, dir: 'A', kts: 335 });
    ref.untilZ(R + 300).mark('Turn onto the show line').hold(200).turn(90, { dir: 'L', r: R });
    ref.untilX(0).mark('Over CP at 200′').fly(14);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'echelon-flat', ref: '3-3', name: 'Left Echelon Flat Pass', group: 'diamond', ids: D4,
  data: { min: "300′", max: "500′", kin: '335', kout: '335' },
  text: 'Ingressing from in front of the crowd crowd left, the Diamond transitions to a left echelon formation on the turn in and conducts a flat pass at 300’ – 500’ AGL on the crowd left in front of the crowd line. The formation transitions back to diamond approximately 1 nautical mile in front of the crowd, crossing center point at or above 500’ AGL and egresses climbing on the crowd right behind the crowd line in diamond formation.',
  build() {
    const d = V.norm([0.9, 0, 0.44]);
    const ref = new Pilot({ x: -3000, alt: 600, z: -21000, dir: 'L', kts: 335 });
    ref.fly(4).mark('Turn in — left echelon').turnToward([0, 0, 0], { dir: 'L', bank: 50 }).hold(400);
    ref.until((q) => Math.hypot(q.p[0], q.p[2]) < NM);
    const tD = ref.t;
    ref.hold(520).until((q) => q.p[2] >= 0).mark('Cross CP at 500′').hold(null).fly(4).mark('Climbing egress behind the crowd').pitchTo(8, { g: 2 }).fly(10);
    void d;
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }, { t: 2, form: 'echelonL', dur: 8 }, { t: tD, form: 'diamond', dur: 6 }]);
    return finish(tracks, { events: [...eventsOf(ref), evAt(tD, 'Back to Diamond')] });
  }
});

add({
  id: 'diamond-dirty-roll', ref: '3-4', name: 'Diamond Dirty Roll', group: 'diamond', ids: D4,
  data: { min: "200′", max: "3,000′", kin: '275', kout: '275' },
  text: 'Approaching CP in Diamond with Landing Gear extended, all four aircraft roll 360° in formation, starting the roll at 1200’ to apex at approximately 2000’. Minimum altitude on the ingress and egress roll line is 200’.',
  build() {
    const ref = new Pilot({ x: -12500, alt: 200, z: 0, dir: 'R', kts: 275 });
    ref.gear(true).untilX(-5200).mark('Commence climb').pitchTo(20, { g: 2.2 });
    ref.until((q) => q.alt >= 1200).mark('360° roll — apex ≈ 2,000′').roll(-360, { rate: 58, pull: 2.6, energy: 0.5 });
    ref.pitchTo(-10, { g: 2 }).hold(200).fly(14);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'dirty-clean', ref: '3-5', name: 'Dirty Clean Flat Pass', group: 'diamond', ids: [1, 2, 3, 4, 6],
  data: { min: "200′", max: "200′", kin: '240 / 500', kout: '240 / 500' },
  text: 'In the Diamond formation all four aircraft will execute a flat pass down show line with the landing gear and hooks extended. Meanwhile, #6 will overtake the diamond while the diamond is approaching center point. #6 will then climb to 1000’ AGL and execute a right hand turn to clear behind the crowd.',
  build() {
    const ref = new Pilot({ x: -7500, alt: 200, z: 0, dir: 'R', kts: 240 });
    ref.gear(true).fly(32);
    const tracks = formationTracks(ref.track, D4, [{ t: 0, form: 'diamond' }]);
    const tOver = (7500 - 600) / (240 * KT);
    const six = new Pilot({ x: -600 - 500 * KT * tOver, alt: 600, z: -90, dir: 'R', kts: 500 });
    six.hold(200).fly(tOver).mark('#6 overtakes the Diamond').fly(1.5).hold(null).pitchTo(15, { g: 4 }).until((q) => q.alt >= 900).pitchTo(0, { g: 2 });
    six.mark('Right turn behind the crowd').turn(110, { dir: 'R', bank: 70 }).fly(3);
    tracks[6] = six.track;
    return finish(tracks, { events: eventsOf(six), end: 30 });
  }
});

add({
  id: 'sneak-turn', ref: '3-6', name: 'Sneak to Left Turn Out, Blue Angel 6', group: 'solo', ids: [6],
  data: { min: "500′", max: "1,500′", kin: '600', kout: '400' },
  text: 'A flat from behind the crowd to in front of the crowd 500’ AGL. Once past the spectator area, a clear to crowd left in front of the crowd is executed.',
  build() {
    const p = new Pilot({ x: 0, alt: 500, z: 15000, dir: 'A', kts: 600 });
    p.hold(500).untilZ(0).mark('Over CP at 500′').untilZ(-1500).hold(null).mark('Left turn out').speed(400, 25).pitchTo(10, { g: 4 }).turn(100, { dir: 'L', bank: 80 }).fly(4);
    return finish({ 6: p.track }, { events: eventsOf(p) });
  }
});

add({
  id: 'la-flat', ref: '3-7', name: 'Line Abreast Flat Pass', group: 'diamond', ids: [1, 2, 3, 4, 5],
  data: { min: "200′", max: "500′", kin: '335', kout: '335' },
  text: 'At approximately 3 NM, aircraft #1,2,3,4 and 5 transition to a Line Abreast formation leveling off at 200’ AGL on the 500’ Show Line. Egressing crowd left, aircraft #1-4 shift back to Diamond and detach #5.',
  build() {
    const R = 4500;
    const ref = new Pilot({ x: 6500 + R, alt: 500, z: R + 4500, dir: 'A', kts: 335 });
    ref.untilZ(R + 300).hold(200).turn(90, { dir: 'L', r: R });
    ref.untilX(0).mark('Line abreast over CP').untilX(-4200);
    const tDet = ref.t;
    ref.mark('Back to Diamond — detach #5').fly(12);
    const tracks = formationTracks(ref.track, [1, 2, 3, 4, 5], [{ t: 0, form: 'delta' }, { t: 3, form: 'lineAbreast', dur: 6 }, { t: tDet, form: 'delta', dur: 4 }]);
    detach(tracks, 5, tDet + 1, (p) => p.pitchTo(8, { g: 3 }).turn(90, { dir: 'L', bank: 70 }));
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'maneuvering-delta', ref: '3-8', name: 'Maneuvering Delta', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "200′", max: "400′", kin: '335', kout: '335' },
  text: 'In Delta formation, all six aircraft will approach from crowd left in front of the crowd. Approaching CP, the formation will commence a left turn to exit the flight line heading crowd right in front of the crowd to set up the Delta Flat Pass. This maneuver can be flown in mirror image from crowd right.',
  build() {
    const ref = new Pilot({ x: -11000, alt: 350, z: 600, dir: 'R', kts: 335 });
    ref.hold(350).untilX(-1600).mark('Left turn away from the crowd').turn(90, { dir: 'L', bank: 50 }).fly(3).turn(90, { dir: 'R', bank: 50 }).mark('Exit crowd right in front').fly(14);
    const tracks = formationTracks(ref.track, [1, 2, 3, 4, 5, 6], [{ t: 0, form: 'delta' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'delta-aileron', ref: '3-9', name: 'Delta Aileron Roll', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "200′", max: "500′", kin: '400', kout: '400' },
  text: 'Ingressing from crowd right or crowd left, all six aircraft will perform simultaneous 360° rolls within the aerobatic box. The Delta will exit in front of the crowd to set up for the Delta Break Out / Head-On or Maneuvering Delta.',
  build() {
    const ref = new Pilot({ x: -12000, alt: 300, z: 0, dir: 'R', kts: 400 });
    ref.untilX(0);
    const tcp = ref.t;
    ref.untilX(4000).mark('Exit in front of the crowd').pitchTo(8, { g: 2.5 }).turn(90, { dir: 'L', bank: 55 });
    const ids = [1, 2, 3, 4, 5, 6];
    const rolls = Object.fromEntries(ids.map((id) => [id, [{ t: tcp - 1.4, deg: -360, dur: 2.8 }]]));
    const tracks = formationTracks(ref.track, ids, [{ t: 0, form: 'delta' }], rolls);
    return finish(tracks, { events: [evAt(tcp - 1.4, 'Six simultaneous 360° rolls'), ...eventsOf(ref)] });
  }
});

add({
  id: 'delta-flat', ref: '3-10', name: 'Delta Flat Pass', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "200′", max: "200′", kin: '335', kout: '335' },
  text: 'Ingressing straight and level at 200’ AGL from crowd right or crowd left, all six aircraft will perform a flat pass on the 500’ show line and exit in front of the crowd to set up for the Delta Break Out / Head On.',
  build() {
    const ref = new Pilot({ x: 12000, alt: 200, z: 0, dir: 'L', kts: 335 });
    ref.untilX(0).mark('Over CP at 200′').untilX(-3500).mark('Exit in front of the crowd').pitchTo(10, { g: 2.5 }).turn(45, { dir: 'R', bank: 45 }).fly(10);
    const tracks = formationTracks(ref.track, [1, 2, 3, 4, 5, 6], [{ t: 0, form: 'delta' }]);
    return finish(tracks, { events: eventsOf(ref) });
  }
});

add({
  id: 'pitch-up-break', ref: '3-11', name: 'Delta Pitch-Up Break', group: 'delta', ids: [1, 2, 3, 4, 5, 6],
  data: { min: "200′", max: "800′", kin: '420', kout: '0' },
  text: 'Ingressing at 200’ on the 500’ line from crowd left or right. Each aircraft pitches out of the formation with approximately 2 second spacing, and turns away from the crowd to downwind, and configures for landing at 15-18’ intervals.',
  build() {
    const ref = new Pilot({ x: 11000, alt: 200, z: 0, dir: 'L', kts: 420 });
    ref.untilX(1200);
    const tB = ref.t;
    ref.fly(20);
    const ids = [1, 2, 3, 4, 5, 6];
    const tracks = formationTracks(ref.track, ids, [{ t: 0, form: 'delta' }]);
    ids.forEach((id, k) => detach(tracks, id, tB + 2 * k, (p) => {
      p.speed(250, 9).hold(800).turn(180, { dir: 'R', bank: 75, rollRate: 150 }).fly(4).smoke(false).gear(true).speed(160, 5).fly(10);
    }));
    return finish(tracks, { events: [evAt(tB, 'Pitch-up break — 2 second spacing')] });
  }
});

// ---------- show sequences (Maneuvers Manual table of contents) ----------
export const SHOWS = {
  high: {
    name: 'High show', ceiling: '10,000′ ceiling · 3 NM visibility',
    blurb: 'The full vertical show: loops, vertical breaks, the Fleur De Lis and the Loop Break / 6-Plane Cross.',
    seq: ['half-cuban', 'burner-loop', 'half-cuban-break', 'dirty-roll-takeoff', 'immelmann-6', 'delta-head-on', 'diamond-360', 'knife-edge', 'diamond-roll', 'inv-inv', 'aileron-roll', 'fortus', 'dirty-loop', 'mrt', 'farvel', 'opp-mrt', 'echelon-parade', 'opp-hrolls', 'changeover', 'sneak', 'sneak-vertical', 'la-loop', 'four-point', 'vertical-break', 'vertical-pitch', 'barrel-break', 'tuck-over', 'low-break-cross', 'high-alpha', 'burner-270', 'delta-roll', 'fleur', 'loop-break-cross', 'delta-breakout', 'delta-flat', 'pitch-up-break']
  },
  low: {
    name: 'Low show', ceiling: '4,500′ ceiling · 3 NM visibility',
    blurb: 'A lower ceiling trades the big vertical maneuvers for rolls, flat passes and the dirty roll.',
    seq: ['burner-low', 'dirty-roll-takeoff', 'immelmann-6', 'delta-head-on', 'diamond-360', 'knife-edge', 'diamond-roll', 'inv-inv', 'aileron-roll', 'fortus', 'diamond-dirty-roll', 'mrt', 'farvel', 'opp-mrt', 'echelon-parade', 'opp-hrolls', 'changeover', 'sneak', 'sneak-turn', 'la-flat', 'four-point', 'low-break-cross', 'tuck-over', 'burner-270', 'high-alpha', 'delta-roll', 'delta-aileron', 'delta-flat', 'maneuvering-delta', 'delta-breakout', 'delta-flat', 'pitch-up-break']
  },
  flat: {
    name: 'Flat show', ceiling: '1,000′ ceiling · 3 NM visibility',
    blurb: 'Under a low ceiling the whole demonstration is flown as level passes, turns and rolls.',
    seq: ['burner-low', 'dirty-roll-takeoff', 'roll-inverted-6', 'delta-head-on', 'diamond-360', 'knife-edge', 'diamond-flat', 'inv-inv', 'aileron-roll', 'fortus', 'dirty-clean', 'mrt-flat', 'farvel', 'opp-mrt', 'echelon-parade', 'opp-hrolls', 'echelon-flat', 'sneak', 'sneak-turn', 'la-flat', 'four-point', 'low-break-cross', 'tuck-over', 'burner-270', 'high-alpha', 'delta-aileron', 'delta-flat', 'maneuvering-delta', 'delta-breakout', 'delta-flat', 'pitch-up-break']
  },
  c130: {
    name: 'Fat Albert', ceiling: '1,000′ ceiling · 3 NM visibility',
    blurb: 'The Marine Corps C-130J opens the show with a low transition takeoff and an assault landing.',
    seq: ['c130-takeoff', 'c130-remote', 'c130-parade', 'c130-flat', 'c130-head', 'c130-remote-head', 'c130-landing']
  }
};

// Which show profiles fly each maneuver.
for (const m of MANEUVERS) m.shows = Object.keys(SHOWS).filter((k) => SHOWS[k].seq.includes(m.id));

export const PAGE = {
  '1-1': 7, '1-2': 8, '1-3': 9, '1-4': 10, '2-1': 12, '2-2': 13, '2-3': 14, '2-4': 15, '2-5': 16, '2-6': 17, '2-7': 18,
  '2-10a': 19, '2-10b': 20, '2-11': 21, '2-12': 22, '2-13': 23, '2-14': 24, '2-15': 25, '2-16': 26, '2-17': 27, '2-18': 28,
  '2-19': 29, '2-20': 30, '2-21': 31, '2-22': 32, '2-22a': 33, '2-23': 34, '2-24': 35, '2-25': 36, '2-26': 37, '2-27': 38,
  '2-27a': 39, '2-28': 40, '2-29': 41, '2-30': 42, '2-31': 43, '2-32': 44, '2-33': 45, '2-34': 46, '2-35': 47, '2-36': 48,
  '2-37': 49, '2-38': 50, '2-39': 51, '2-40': 52, '2-41': 53, '2-42': 54, '3-1': 55, '3-2': 56, '3-3': 57, '3-4': 58,
  '3-5': 59, '3-6': 60, '3-7': 61, '3-8': 62, '3-9': 63, '3-10': 64, '3-11': 65, '3-12': 67, '3-13': 68
};

export const GROUPS = {
  diamond: 'Diamond', solo: 'Solos', delta: 'Delta', c130: 'Fat Albert'
};

const cache = new Map();
export function buildManeuver(id, opts = {}) {
  const m = MANEUVERS.find((x) => x.id === id);
  if (!m) return null;
  const key = id + '|' + (m.variants ? opts.show ?? '' : '');
  if (!cache.has(key)) cache.set(key, m.build(opts));
  return cache.get(key);
}
