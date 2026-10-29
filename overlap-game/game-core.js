/*
 * Find the Overlap: round generation, scoring and the spectrometer model.
 * Uses overlap.js for the intensity-weighted pump–probe overlap.
 *
 * Units: µm for beam positions, mm for the delay stage, fs for times, cm⁻¹ for Raman shifts.
 * Works as a browser global (window.OverlapGame) and as a CommonJS module.
 */
(function (root, factory) {
  const F = root.FocalOverlap || (typeof require === 'function' ? require('./overlap.js') : null);
  const api = factory(F);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OverlapGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (F) {
  'use strict';

  const C = F.C; // µm/fs
  const FS_PER_MM = 2000 / C; // a retroreflector doubles the path: 1 mm of travel ≈ 6.67 ps
  const C_CM_PER_PS = 0.0299792458;
  const WIN = 0.95; // overlap needed to lock in a round
  const ROUNDS = 3;

  // Cyclohexane Raman bands between 200 and 1700 cm⁻¹. Positions are the usual calibration
  // lines; relative peak heights are approximate.
  const CYCLOHEXANE = [
    { nu: 384, rel: 0.12 },
    { nu: 426, rel: 0.18 },
    { nu: 801, rel: 1.0 },
    { nu: 1028, rel: 0.4 },
    { nu: 1157, rel: 0.12 },
    { nu: 1266, rel: 0.38 },
    { nu: 1347, rel: 0.06 },
    { nu: 1444, rel: 0.48 },
  ];
  const RESOLUTION = 4; // spectrometer resolution, cm⁻¹ FWHM
  const FULL_SIGNAL = 10; // mOD of the main peak at full overlap
  const NOISE = 0.15; // mOD rms per pixel
  const DYE_BAND = { center: 620, fwhm: 900 }; // broad C153 excited-state band (easy mode)

  const LEVELS = {
    easy: {
      name: 'Easy',
      sample: 'Coumarin 153 in cyclohexane',
      response: 'C153 excited state, τ = 4.3 ns',
      pumpW0: [85, 110], probeW0: [45, 60],
      pumpFwhm: [120, 160], probeFwhm: [80, 110],
      angle: [5, 8], L: [200, 260],
      lifetime: [4.3e6, 4.3e6],
      ramanLifetime: 3000,
      travel: 25, ruler: 0.6, startDelay: [1.0, 3.5], startAfterZero: false,
      fineStep: 0.010, knobTurn: 60, startOffset: [1.3, 2.2],
      targetLine: true,
    },
    medium: {
      name: 'Medium',
      sample: 'Cyclohexane',
      response: 'Raman bands, τ = 1–2.5 ps',
      pumpW0: [60, 75], probeW0: [32, 42],
      pumpFwhm: [200, 400], probeFwhm: [200, 400],
      angle: [6, 10], L: [180, 240],
      lifetime: [1000, 2500],
      travel: 15, ruler: 0.4, startDelay: [0.3, 1.0], startAfterZero: null,
      fineStep: 0.002, knobTurn: 40, startOffset: [1.5, 2.5],
      targetLine: true,
    },
    hard: {
      name: 'Hard',
      sample: 'Cyclohexane',
      response: 'short-lived Raman bands, τ = 0.25–0.6 ps',
      pumpW0: [35, 45], probeW0: [18, 24],
      pumpFwhm: [50, 50], probeFwhm: [50, 50],
      angle: [8, 14], L: [150, 200],
      lifetime: [250, 600],
      travel: 10, ruler: 0.25, startDelay: [0.15, 0.5], startAfterZero: null,
      fineStep: 0.001, knobTurn: 25, startOffset: [1.8, 2.8],
      targetLine: false,
    },
  };

  const COLORS = [405, 450, 488, 515, 532, 561, 600, 633, 680, 800];

  // Small seedable generator so rounds can be reproduced in tests.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round1 = (v) => Math.round(v * 10) / 10;

  /** A new semi-random beam pair and starting misalignment for one round. */
  function makeRound(levelKey, rng) {
    rng = rng || Math.random;
    const lv = LEVELS[levelKey];
    const r = (range) => range[0] + (range[1] - range[0]) * rng();
    const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];

    const pumpLambda = pick(COLORS);
    let probeLambda = pick(COLORS);
    for (let k = 0; k < 20 && Math.abs(probeLambda - pumpLambda) < 70; k++) probeLambda = pick(COLORS);

    const pump = { lambda: pumpLambda, w0: round1(r(lv.pumpW0)), fwhm: Math.round(r(lv.pumpFwhm)) };
    const probe = { lambda: probeLambda, w0: round1(r(lv.probeW0)), fwhm: Math.round(r(lv.probeFwhm)) };
    const wComb = Math.hypot(pump.w0, probe.w0);

    // Mirror: the pump overlaps the probe when the mirror sits at `target`.
    const R = Math.round(3.4 * wComb);
    const target = { x: round1((rng() - 0.5) * 0.9 * R), y: round1((rng() - 0.5) * 0.9 * R) };
    const off = r(lv.startOffset) * wComb;
    const phi = 2 * Math.PI * rng();
    const start = {
      x: round1(clamp(target.x + off * Math.cos(phi), -R, R)),
      y: round1(clamp(target.y + off * Math.sin(phi), -R, R)),
    };

    // Delay stage: time zero sits somewhere in the middle of the travel.
    const travel = lv.travel;
    const zero = Math.round((0.3 + 0.4 * rng()) * travel * 1000) / 1000;
    const after = lv.startAfterZero === null ? rng() < 0.5 : lv.startAfterZero;
    const dist = r(lv.startDelay);
    const stageStart = Math.round(clamp(zero + (after ? dist : -dist), 0, travel) * 1000) / 1000;
    const rulerCenter = Math.round((zero + (rng() - 0.5) * lv.ruler) * 100) / 100;

    return {
      levelKey,
      level: lv,
      pump,
      probe,
      angle: round1(r(lv.angle)),
      L: Math.round(r(lv.L)),
      lifetime: Math.round(r(lv.lifetime)),
      ramanLifetime: lv.ramanLifetime || null,
      mirror: { R, target, start, turn: lv.knobTurn },
      stage: { travel, zero, start: stageStart, fine: lv.fineStep, ruler: { center: rulerCenter, half: lv.ruler } },
    };
  }

  function modelFor(round, lifetime) {
    return F.createModel({ mode: 'ta', angle: round.angle, L: round.L, T1: lifetime, pump: round.pump, probe: round.probe });
  }

  /** Precomputes the models and the best achievable overlap for a round. */
  function prepare(round) {
    const M = modelFor(round, round.lifetime);
    const prep = { round, M, best: F.bestAlignment(M, 32), raman: null };
    if (round.ramanLifetime) {
      const Mr = modelFor(round, round.ramanLifetime);
      prep.raman = { M: Mr, best: F.bestAlignment(Mr, 32) };
    }
    return prep;
  }

  const delayOf = (round, stageMm) => (stageMm - round.stage.zero) * FS_PER_MM;

  /**
   * Overlap for the current mirror (µm) and stage (mm) settings, 0–1, where 1 is the best
   * achievable alignment. `raman` is the cyclohexane-line amplitude (equal to `overlap`
   * except in easy mode, where the dye sets the score).
   */
  function measure(prep, mirror, stageMm) {
    const r = prep.round;
    const dx = mirror.x - r.mirror.target.x;
    const dy = mirror.y - r.mirror.target.y;
    const delay = delayOf(r, stageMm);
    const overlap = clamp(F.signal(prep.M, dx, dy, 0, delay, 32) / prep.best.S, 0, 1);
    const raman = prep.raman ? clamp(F.signal(prep.raman.M, dx, dy, 0, delay, 32) / prep.raman.best.S, 0, 1) : overlap;
    return { overlap, raman, dx, dy, delay };
  }

  /** Lorentzian FWHM (cm⁻¹) of a band whose coherence decays as exp(−t/τ). */
  const bandWidth = (lifetimeFs) => 1 / (Math.PI * C_CM_PER_PS * (lifetimeFs / 1000));

  // Unit-height pseudo-Voigt (Thompson–Cox–Hastings) with Lorentzian and Gaussian FWHMs.
  function voigt(x, x0, gL, gG) {
    const f = Math.pow(Math.pow(gG, 5) + 2.69269 * Math.pow(gG, 4) * gL + 2.42843 * Math.pow(gG, 3) * gL * gL +
      4.47163 * gG * gG * Math.pow(gL, 3) + 0.07842 * gG * Math.pow(gL, 4) + Math.pow(gL, 5), 0.2);
    const q = gL / f;
    const eta = 1.36603 * q - 0.47719 * q * q + 0.11116 * q * q * q;
    const d = (x - x0) / f;
    const L = 1 / (1 + 4 * d * d);
    const G = Math.exp(-4 * Math.LN2 * d * d);
    return eta * L + (1 - eta) * G;
  }

  function gauss(rng) {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  /**
   * Spectrometer trace (mOD) on the Raman-shift grid `nu`.
   * Medium/hard: cyclohexane stimulated Raman lines whose width follows the band lifetime.
   * Easy: the broad, long-lived C153 band, with the cyclohexane lines on top near time zero.
   * Returns { y, peak } where `peak` is the noise-free height of the main feature.
   */
  function spectrum(prep, meas, nu, rng, noise) {
    const r = prep.round;
    const easy = r.levelKey === 'easy';
    const gL = bandWidth(easy ? r.ramanLifetime : r.lifetime);
    const lineAmp = FULL_SIGNAL * (easy ? 0.3 * meas.raman : meas.overlap);
    const y = new Float64Array(nu.length);
    const sigma = noise === undefined ? NOISE : noise;
    const wobble = rng ? 0.06 * (rng() - 0.5) : 0;
    for (let i = 0; i < nu.length; i++) {
      let v = 0;
      if (easy) v += FULL_SIGNAL * meas.overlap * Math.exp(-4 * Math.LN2 * Math.pow((nu[i] - DYE_BAND.center) / DYE_BAND.fwhm, 2));
      for (const b of CYCLOHEXANE) {
        if (Math.abs(nu[i] - b.nu) < 40 * (gL + RESOLUTION)) v += lineAmp * b.rel * voigt(nu[i], b.nu, gL, RESOLUTION);
      }
      if (rng && sigma > 0) v += sigma * gauss(rng) + wobble * Math.cos(nu[i] / 230);
      y[i] = v;
    }
    const peak = easy ? FULL_SIGNAL * meas.overlap : lineAmp;
    return { y, peak };
  }

  /** Sample response after the pump, normalised to its peak, for the end-of-round picture. */
  function response(prep, t) {
    const M = prep.M;
    if (!prep.rPeak) {
      prep.rPeak = M.invT === 0 ? 1
        : F.maximize1D((u) => F.stepResponse(u, M.sDrive, M.invT), -3 * M.sDrive, 3 * M.sDrive + 5 / M.invT, 200).y;
    }
    return F.stepResponse(t, M.sDrive, M.invT) / prep.rPeak;
  }

  function fmtClock(ms) {
    const tenths = Math.round(Math.max(0, ms) / 100);
    const m = Math.floor(tenths / 600);
    const rest = (tenths - 600 * m) / 10;
    return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
  }

  return {
    FS_PER_MM, WIN, ROUNDS, CYCLOHEXANE, RESOLUTION, FULL_SIGNAL, NOISE, DYE_BAND, LEVELS,
    mulberry32, makeRound, prepare, measure, delayOf, bandWidth, voigt, spectrum, response, fmtClock,
  };
});
