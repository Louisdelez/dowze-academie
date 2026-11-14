// Coucou MIT © Louis Raillé 2026. Pose choreography only; original artwork and sound excluded.
// The launch "coucou" (greeting v2) — port of GreetingCanvasView.swift.
// Mochi drops into the island, bounces, slides to the side and waves hello with
// a quick little hand, then comes back and settles in the compact island.
// Everything is laid out in the same 640×150 reference space as on macOS.

import { closeCurve } from "./anim.ts";

import { COMPACT_W, NOTCH_H, NOTCH_W } from "./layout.ts";

// ── Timing (GT in the Swift file) ─────────────────────────────────────────────

const T = {
  pop0: 1.3,
  pop1: 1.45,
  content0: 2.4,
  tuck0: 2.45,
  tuck1: 2.7,
  badge: 2.72,
  down0: 2.85,
  down1: 3.45,
  blink2: 3.7,
  tint0: 3.85,
  tint1: 4.15,
  end: 4.6,
  autoLeave: 4.9,
  COLLAPSE: 0.34,
};

export const GREETING_END = T.end;

/** The greeting's own sound, played from the start (greeting.wav, the Mac's file). */


// ── Geometry (640×150) ────────────────────────────────────────────────────────

export const GREETING_W = 640;
export const GREETING_H = 150;
const C0 = { x: 320, y: 90 };
const HB = 58;
export const ASP = 1.34;
const EAR_X = 40;
const EAR_HB = 17;
const CARD = { x: 10, y: 36, w: 620, h: 104 };
const CARD_R = 20;

/** IslandRestingLayout for the compact island the greeting lands in. */
const COMPACT = {
  width: COMPACT_W,
  height: NOTCH_H,
  botDiameter: Math.min(20, Math.max(0, NOTCH_H - 6)),
  botCenterY: NOTCH_H / 2,
  miniGridScale: Math.min(1, Math.max(0, NOTCH_H - 4) / 28),
  miniGridCenterX: COMPACT_W - 40,
};

// ── Easing ────────────────────────────────────────────────────────────────────

const E = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  easeIn: (t: number) => t * t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

// ── Pose ──────────────────────────────────────────────────────────────────────

type EyeType = "dot" | "happy" | "content";

export interface Pose {
  hb: number; x: number; y: number; sx: number; sy: number; tilt: number;
  eye: EyeType; open: number; eyeRoll: number;
  lookX: number; lookY: number;
  handL: number; handR: number; wave: number;
  badge: number; tint: number; halo: number; haloBlue: number; minis: number; fx: number;
  header: number; card: number;
  iw: number; ih: number;
}

function greetPose(t: number): Pose {
  // Island size — only the spread of the warp streaks uses it.
  const gx = seg(t, 0, 0.5);
  const g = Math.sin((Math.PI * gx) / 2) + 0.04 * Math.sin(Math.PI * gx) * gx;
  const iw = lerp(NOTCH_W, GREETING_W, g);
  const ih = lerp(COMPACT.height, GREETING_H, g);

  const cx = C0.x;
  const cy = C0.y;
  // Body height: invisible before 0.20, grows 0.15 → 1 with a back ease.
  const hb = t < 0.2 ? 0 : lerp(HB * 0.15, HB, E.back(seg(t, 0.2, 0.6)));

  // Landmarks, in multiples of the body height
  const landY = cy + 0.12 * HB;
  const peakY = cy - 0.15 * HB;
  const dipY = cy + 0.36 * HB;
  const springY = cy - 0.1 * HB;
  const sinkY = cy + 0.3 * HB;
  const drift1 = cx - 0.16 * HB;
  const drift2 = cx - 0.45 * HB;
  const drift3 = cx - 0.57 * HB;
  const drift4 = cx - 0.85 * HB;

  // Lateral travel: slides to the side, waves there, comes back.
  let x: number;
  if (t < 0.85) x = cx;
  else if (t < 1.2) x = lerp(cx, drift1, E.inOut(seg(t, 0.85, 1.2)));
  else if (t < 1.3) x = lerp(drift1, drift2, E.easeIn(seg(t, 1.2, 1.3)));
  else if (t < 1.45) x = lerp(drift2, drift3, E.inOut(seg(t, 1.3, 1.45)));
  else if (t < 2.4) x = lerp(drift3, drift4, E.inOut(seg(t, 1.45, 2.4)));
  else if (t < 2.85) x = drift4;
  else x = lerp(drift4, cx, E.inOut(seg(t, 2.85, 3.45)));

  // Vertical travel: drop in, bounce, plunge and spring for the wave, sink to tuck.
  let y: number;
  if (t < 0.2) y = COMPACT.botCenterY;
  else if (t < 0.6) y = lerp(COMPACT.botCenterY, landY, E.easeIn(seg(t, 0.2, 0.6)));
  else if (t < 0.73) y = lerp(landY, peakY, E.out(seg(t, 0.6, 0.73)));
  else if (t < 0.9) y = lerp(peakY, cy, E.inOut(seg(t, 0.73, 0.9)));
  else if (t < 1.2) y = cy;
  else if (t < 1.3) y = lerp(cy, dipY, E.easeIn(seg(t, 1.2, 1.3)));
  else if (t < 1.45) y = lerp(dipY, springY, E.out(seg(t, 1.3, 1.45)));
  else if (t < 1.6) y = lerp(springY, cy, E.inOut(seg(t, 1.45, 1.6)));
  else if (t < 2.4) y = cy;
  else if (t < 2.7) y = lerp(cy, sinkY, E.inOut(seg(t, 2.4, 2.7)));
  else if (t < 2.85) y = sinkY;
  else y = lerp(sinkY, cy, E.inOut(seg(t, 2.85, 3.45)));

  // Body bob in phase with the waving hand
  if (t >= T.pop1 && t < T.tuck0) {
    const w = t - T.pop1;
    y += Math.sin(w * 2 * Math.PI * 5) * 0.02 * HB * clamp(w / 0.08, 0, 1);
  }

  // Squash and stretch
  const landSqK = t >= 0.52 && t < 0.68 ? Math.sin(Math.PI * seg(t, 0.52, 0.68)) : 0;
  const bounceK = t >= 0.62 && t < 0.84 ? Math.sin(Math.PI * seg(t, 0.62, 0.84)) : 0;
  let sx = 1 + 0.14 * landSqK - 0.1 * bounceK;
  let sy = 1 - 0.14 * landSqK + 0.18 * bounceK;
  const plungeK = t >= 1.18 && t < 1.42 ? Math.sin(Math.PI * seg(t, 1.18, 1.42)) : 0;
  const springK = t >= 1.3 && t < 1.46 ? Math.sin(Math.PI * seg(t, 1.3, 1.46)) : 0;
  sx += 0.12 * plungeK - 0.18 * springK;
  sy -= 0.12 * plungeK - 0.25 * springK;
  let sinkK = 0;
  if (t >= 2.38 && t < 2.7) sinkK = E.inOut(seg(t, 2.38, 2.7));
  else if (t >= 2.7 && t < 2.85) sinkK = 1 - E.inOut(seg(t, 2.7, 2.85));
  sx += 0.18 * sinkK;
  sy -= 0.14 * sinkK;
  const microK = t >= 3.7 && t < 3.82 ? Math.sin(Math.PI * seg(t, 3.7, 3.82)) : 0;
  sx += 0.08 * microK;
  sy -= 0.07 * microK;

  // Eyes
  let eye: EyeType = "dot";
  if (t >= 0.55 && t < 0.8) eye = "happy";
  if (t >= T.content0 && t < T.tuck1) eye = "content";
  const blink = (tb: number) => {
    const k = seg(t, tb, tb + 0.12);
    return k > 0 && k < 1 ? 1 - Math.sin(Math.PI * k) * 0.94 : 1;
  };
  const open = Math.min(blink(1.95), blink(3.05), blink(T.blink2));

  // Look
  let lookX = 0;
  let lookY = 0;
  if (t >= T.pop1 && t < T.content0) { lookX = 0.55; lookY = -0.45; }
  else if (t >= T.content0 && t < T.down0) { lookX = -0.3; lookY = 0.6; }
  else if (t >= T.down0 && t < T.down1) { lookX = 0.3; lookY = 0.6; }
  else if (t >= T.down1) {
    const k = E.inOut(seg(t, T.down1, T.down1 + 0.35));
    lookX = lerp(0.3, 0, k);
    lookY = lerp(0.6, 0, k);
  }

  // Hands
  const handL = t < T.tuck0
    ? E.back(seg(t, T.pop0, T.pop0 + 0.14))
    : 1 - E.easeIn(seg(t, T.tuck0, T.tuck1 - 0.03));
  const handR = t < T.tuck0
    ? E.back(seg(t, T.pop0 + 0.04, T.pop0 + 0.18))
    : 1 - E.easeIn(seg(t, T.tuck0 + 0.03, T.tuck1));
  const wave = t >= T.pop1 && t < T.tuck0 ? t - T.pop1 : -1;

  return {
    hb, x, y, sx, sy, tilt: 0,
    eye, open, eyeRoll: 0,
    lookX, lookY,
    handL, handR, wave,
    badge: E.back(seg(t, T.badge, T.badge + 0.28)),
    tint: 0.6 * E.inOut(seg(t, T.tint0, T.tint1)),
    halo: E.out(seg(t, 0.3, 0.7)),
    haloBlue: seg(t, T.tint0, T.tint1),
    minis: 0,
    fx: 1,
    header: seg(t, 0.35, 0.6),
    card: seg(t, 0.18, 0.45),
    iw, ih,
  };
}

function smallPose(): Pose {
  return {
    hb: (EAR_HB * COMPACT.botDiameter) / 20,
    x: GREETING_W / 2 - COMPACT.width / 2 + EAR_X,
    y: COMPACT.botCenterY,
    sx: 1, sy: 1, tilt: 0,
    eye: "dot", open: 1, eyeRoll: 0,
    lookX: 0, lookY: 0,
    handL: 0, handR: 0, wave: -1,
    badge: 1, tint: 0.6, halo: 0.6, haloBlue: 1,
    minis: 1, fx: 1,
    header: 0, card: 0,
    iw: COMPACT.width, ih: COMPACT.height,
  };
}

/** Mochi's pose `t` seconds in; `tc` is when the collapse began (∞ if not yet). */
export function greetingPose(t: number, tc = Number.POSITIVE_INFINITY): Pose {
  if (t < tc) return greetPose(Math.min(t, T.end + 10));
  const a = greetPose(tc);
  const b = smallPose();
  // Same curve and duration (340 ms) as the island shrinking around him: with
  // the Mac's inOut ease the island got ahead of Mochi and cut his body off
  // when the greeting was left early.
  const k = seg(t, tc, tc + T.COLLAPSE);
  const e = k >= 1 ? 1 : closeCurve(k);
  const p: Pose = { ...a };
  p.iw = lerp(a.iw, b.iw, e);
  p.ih = lerp(a.ih, b.ih, e);
  p.x = lerp(a.x, b.x, e);
  p.y = lerp(a.y, b.y, e);
  p.hb = lerp(a.hb, b.hb, e);
  p.badge = lerp(a.badge, b.badge, e);
  p.tint = lerp(a.tint, b.tint, e);
  p.halo = lerp(a.halo, b.halo, e);
  p.haloBlue = lerp(a.haloBlue, b.haloBlue, e);
  p.header = a.header * (1 - seg(t, tc, tc + 0.1));
  p.card = a.card * (1 - seg(t, tc, tc + 0.18));
  p.handL = a.handL * (1 - seg(t, tc, tc + 0.15));
  p.handR = a.handR * (1 - seg(t, tc, tc + 0.15));
  p.tilt = a.tilt * (1 - e);
  p.sx = lerp(a.sx, 1, e);
  p.sy = lerp(a.sy, 1, e);
  p.eyeRoll = a.eyeRoll * (1 - e);
  const bk = seg(t, tc + 0.14, tc + 0.26);
  p.eye = "dot";
  p.open = bk > 0 && bk < 1 ? 1 - Math.sin(Math.PI * bk) * 0.94 : 1;
  p.lookX = a.lookX * (1 - e);
  p.lookY = a.lookY * (1 - e);
  p.minis = E.back(seg(t, tc + 0.24, tc + 0.42));
  p.fx = 1 - seg(t, tc, tc + 0.2);
  return p;
}

