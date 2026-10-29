/*
 * Intensity-weighted focal overlap of two crossed Gaussian pump–probe beams.
 *
 * Beams propagate in vacuum (n = 1). Units: lengths in µm, times in fs,
 * wavelengths in nm. The probe travels along +z with its focus at the origin;
 * the pump travels in the x–z plane at the crossing angle θ, with its focus at
 * (dx, dy, dz). The sample occupies −L/2 ≤ z ≤ L/2.
 *
 * Works as a browser global (window.FocalOverlap) and as a CommonJS module.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocalOverlap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = 0.299792458; // speed of light, µm/fs
  const FWHM_TO_SIGMA = 1 / (2 * Math.sqrt(2 * Math.LN2));
  const DEG = Math.PI / 180;

  // erfcx(x) = exp(x²)·erfc(x) for x ≥ 0 (Numerical Recipes erfcc; relative error < 1.2e-7).
  function erfcxPos(x) {
    const t = 1 / (1 + 0.5 * x);
    return t * Math.exp(-1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277)))))))));
  }

  function erfc(x) {
    return x >= 0 ? erfcxPos(x) * Math.exp(-x * x) : 2 - erfcxPos(-x) * Math.exp(-x * x);
  }

  // A unit-area Gaussian (std s) convolved with the causal decay exp(−t/T)·H(t), invT = 1/T
  // (0 means no decay). Rises from 0 to 1 when there is no decay. Written with erfcx so that
  // it never overflows.
  function stepResponse(tau, s, invT) {
    const u = (s * invT - tau / s) * Math.SQRT1_2;
    const g = Math.exp(-0.5 * tau * tau / (s * s));
    if (u >= 0) return 0.5 * g * erfcxPos(u);
    return Math.exp(0.5 * s * s * invT * invT - tau * invT) - 0.5 * g * erfcxPos(-u);
  }

  /**
   * Build the derived constants for one configuration.
   * p = { mode: '2pa' | 'ta' | 'ta2', angle (deg), L (µm), T1 (fs, Infinity = no decay),
   *       pump: { lambda (nm), w0 (µm), fwhm (fs) }, probe: { lambda, w0, fwhm } }
   *
   * mode '2pa': nondegenerate two-photon absorption, drive = I_pump (instantaneous).
   * mode 'ta':  transient absorption, one-photon pump, drive = excited population ∝ ∫ I_pump.
   * mode 'ta2': transient absorption, two-photon pump, drive = population ∝ ∫ I_pump².
   */
  function createModel(p) {
    const m = p.mode === 'ta2' ? 2 : 1;
    const th = (p.angle || 0) * DEG;
    const sPu = p.pump.fwhm * FWHM_TO_SIGMA;
    const sPr = p.probe.fwhm * FWHM_TO_SIGMA;
    const drive2 = m === 2 ? sPu * sPu / 2 : sPu * sPu;
    const M = {
      mode: p.mode,
      m,
      theta: th,
      sin: Math.sin(th),
      cos: Math.cos(th),
      tan: Math.tan(th),
      L: p.L,
      w0p: p.pump.w0,
      w0r: p.probe.w0,
      w0p2: p.pump.w0 * p.pump.w0,
      w0r2: p.probe.w0 * p.probe.w0,
      zRp: Math.PI * p.pump.w0 * p.pump.w0 / (p.pump.lambda / 1000),
      zRr: Math.PI * p.probe.w0 * p.probe.w0 / (p.probe.lambda / 1000),
      sPu,
      sPr,
      sDrive: Math.sqrt(drive2),
      sc2: drive2 + sPr * sPr,
      instantaneous: p.mode === '2pa',
      invT: p.mode !== '2pa' && p.T1 > 0 && isFinite(p.T1) ? 1 / p.T1 : 0,
    };
    // Probe-minus-pump arrival time at (x, z) is  delay + kz·z − beta·x.
    M.kz = (1 - M.cos) / C;
    M.beta = M.sin / C;
    M.kernelPeak = M.instantaneous
      ? M.sPu / Math.sqrt(M.sc2)
      : (M.invT === 0 ? 1 : maximize1D(t => stepResponse(t, Math.sqrt(M.sc2), M.invT),
        -4 * Math.sqrt(M.sc2), 4 * Math.sqrt(M.sc2) + 10 / M.invT, 80).y);
    return M;
  }

  // Probe-weighted pump drive for a probe arriving tau after the pump, with the
  // cross-correlation width s. Equals 1 when every probe photon sees the peak drive.
  function kernel(M, tau, s) {
    if (M.instantaneous) return (M.sPu / s) * Math.exp(-0.5 * tau * tau / (s * s));
    return stepResponse(tau, s, M.invT);
  }

  function wSq(w02, zR, s) {
    const r = s / zR;
    return w02 * (1 + r * r);
  }

  /**
   * Signal per unit depth at depth z: the transverse (x, y) and time integrals are done
   * analytically. Returns the local overlap η(z): probe-weighted pump drive relative to its
   * peak (1 = every probe photon sees the peak drive at this depth).
   */
  function slice(M, z, dx, dy, dz, delay) {
    const sin = M.sin, cos = M.cos, m = M.m;
    const wr2 = wSq(M.w0r2, M.zRr, z);
    const a = 2 / wr2;
    const xc = dx + (z - dz) * M.tan; // pump axis position at this depth
    const zl = (z - dz) * cos;
    // Pump width is taken at the centre of the product of the two transverse profiles.
    let s = zl - dx * sin;
    let wp2 = wSq(M.w0p2, M.zRp, s);
    let b = 2 * m / wp2;
    let bp = b * cos * cos;
    let q = a + bp;
    let xm = bp * xc / q;
    s = zl + (xm - dx) * sin;
    wp2 = wSq(M.w0p2, M.zRp, s);
    b = 2 * m / wp2;
    bp = b * cos * cos;
    q = a + bp;
    xm = bp * xc / q;

    const gy = Math.sqrt(Math.PI / (a + b)) * Math.exp(-a * b / (a + b) * dy * dy);
    const gx = Math.sqrt(Math.PI / q) * Math.exp(-a * bp / q * xc * xc);
    const peak = M.w0p2 / wp2;
    const spatial = (2 / (Math.PI * wr2)) * (m === 1 ? peak : peak * peak) * gx * gy;
    // Arrival-time difference varies linearly across x (pulse-front tilt): integrating it over
    // the Gaussian x-profile broadens the cross-correlation.
    const tau = delay + z * M.kz - M.beta * xm;
    const sEff = Math.sqrt(M.sc2 + M.beta * M.beta / (2 * q));
    return spatial * kernel(M, tau, sEff);
  }

  // Integration grid in z: the sample, plus dense patches on every narrow feature (crossing
  // region, the two foci, the time-overlap window). Each patch asks for n steps across itself;
  // every sub-interval between patch edges gets the finest step any covering patch asks for.
  // Returns { edges, counts }: uniform trapezoid steps per sub-interval.
  function zGrid(M, dx, dz, delay, n) {
    const L2 = M.L / 2;
    const regions = [[-L2, L2]];
    const add = (lo, hi) => {
      lo = Math.max(lo, -L2);
      hi = Math.min(hi, L2);
      if (hi > lo) regions.push([lo, hi]);
    };
    if (M.zRr < M.L) add(-4 * M.zRr, 4 * M.zRr);
    const zFocusP = dz + dx * M.tan; // pump focal plane meets the probe axis here
    if (M.zRp / M.cos < M.L) add(zFocusP - 4 * M.zRp / M.cos, zFocusP + 4 * M.zRp / M.cos);
    if (M.tan > 1e-9) {
      const z0 = dz - dx / M.tan; // the two beam axes cross here
      const wr2 = wSq(M.w0r2, M.zRr, z0);
      const wp2 = wSq(M.w0p2, M.zRp, (z0 - dz) / M.cos);
      const sz = Math.sqrt(wr2 + wp2 / (M.m * M.cos * M.cos)) / (2 * M.tan);
      if (16 * sz < M.L) add(z0 - 8 * sz, z0 + 8 * sz);
      const a = 2 / wr2;
      const bp = 2 * M.m * M.cos * M.cos / wp2;
      const r = bp / (a + bp);
      const k = M.kz - M.beta * r * M.tan;
      if (Math.abs(k) > 1e-12) {
        const tau0 = delay - M.beta * r * (dx - dz * M.tan);
        const zt = -tau0 / k;
        const sEff = Math.sqrt(M.sc2 + M.beta * M.beta / (2 * (a + bp)));
        const hw = (8 * sEff + (M.invT > 0 ? 6 / M.invT : 0)) / Math.abs(k);
        if (2 * hw < M.L) add(zt - hw, zt + hw);
      }
    }
    const cuts = [];
    for (const [lo, hi] of regions) cuts.push(lo, hi);
    cuts.sort((u, v) => u - v);
    const edges = [cuts[0]];
    for (let i = 1; i < cuts.length; i++) if (cuts[i] - edges[edges.length - 1] > M.L * 1e-9) edges.push(cuts[i]);
    const counts = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const mid = 0.5 * (edges[i] + edges[i + 1]);
      let density = 0;
      for (const [lo, hi] of regions) if (mid > lo && mid < hi) density = Math.max(density, n / (hi - lo));
      counts.push(Math.max(1, Math.ceil((edges[i + 1] - edges[i]) * density - 1e-9)));
    }
    return { edges, counts };
  }

  function zNodes(M, dx, dz, delay, n) {
    const g = zGrid(M, dx, dz, delay, n);
    const out = [g.edges[0]];
    for (let i = 0; i < g.counts.length; i++) {
      const lo = g.edges[i];
      const h = (g.edges[i + 1] - lo) / g.counts[i];
      for (let j = 1; j <= g.counts[i]; j++) out.push(lo + j * h);
    }
    return out;
  }

  /**
   * Integrated signal S = ∫ η(z) dz over the sample (µm). S / L is the absolute overlap η:
   * the probe-weighted average pump drive relative to its peak.
   */
  function signal(M, dx, dy, dz, delay, n) {
    const g = zGrid(M, dx, dz, delay, n || 48);
    let S = 0;
    let fPrev = slice(M, g.edges[0], dx, dy, dz, delay);
    for (let i = 0; i < g.counts.length; i++) {
      const lo = g.edges[i];
      const h = (g.edges[i + 1] - lo) / g.counts[i];
      let part = 0.5 * fPrev;
      for (let j = 1; j < g.counts[i]; j++) part += slice(M, lo + j * h, dx, dy, dz, delay);
      fPrev = slice(M, g.edges[i + 1], dx, dy, dz, delay);
      S += h * (part + 0.5 * fPrev);
    }
    return S;
  }

  // Local overlap η(z) through the sample, for plotting.
  function depthProfile(M, dx, dy, dz, delay, n) {
    const z = zNodes(M, dx, dz, delay, n || 80);
    const f = z.map(zz => slice(M, zz, dx, dy, dz, delay));
    return { z, f };
  }

  // Coarse scan then golden-section refinement. Returns { x, y } at the maximum.
  function maximize1D(fn, lo, hi, n) {
    n = n || 24;
    let bestI = 0;
    let bestY = -Infinity;
    const xs = [];
    for (let i = 0; i <= n; i++) {
      const x = lo + (hi - lo) * i / n;
      xs.push(x);
      const y = fn(x);
      if (y > bestY) { bestY = y; bestI = i; }
    }
    let a = xs[Math.max(0, bestI - 1)];
    let b = xs[Math.min(n, bestI + 1)];
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a);
    let d = a + g * (b - a);
    let fc = fn(c);
    let fd = fn(d);
    for (let it = 0; it < 40 && b - a > 1e-6 * (Math.abs(hi - lo) + 1e-12); it++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = fn(c); }
      else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = fn(d); }
    }
    const xm = fc > fd ? c : d;
    const ym = Math.max(fc, fd);
    return ym >= bestY ? { x: xm, y: ym } : { x: xs[bestI], y: bestY };
  }

  // Delay range that contains the whole response for this geometry.
  function delayWindow(M) {
    const tilt = M.beta * Math.min(M.w0p / M.cos, M.w0r) * 2;
    const sTot = Math.sqrt(M.sc2 + tilt * tilt);
    const W = 5 * sTot + Math.abs(M.kz) * M.L / 2;
    if (M.instantaneous) return { lo: -W, hi: W, W };
    const T = M.invT > 0 ? 1 / M.invT : 0;
    return { lo: -W, hi: W + Math.min(3 * T, 20 * W), W };
  }

  // Ranges over which the overlap falls to ~zero when the pump is displaced.
  function displacementRanges(M) {
    const rx = 2 * Math.sqrt(M.w0r2 + M.w0p2 / (M.cos * M.cos));
    const ry = 2 * Math.sqrt(M.w0r2 + M.w0p2);
    let rz;
    const focus = M.L / 2 + 2.5 * M.zRp;
    if (M.tan > 1e-3) {
      const sz = Math.sqrt(M.w0r2 + M.w0p2 / (M.cos * M.cos)) / (2 * M.tan);
      rz = Math.min(M.L / 2 + 4 * sz, focus);
    } else {
      rz = focus;
    }
    return { x: rx, y: ry, z: Math.min(rz, 50000) };
  }

  /**
   * Best achievable alignment at this crossing angle: maximises S over the pump position
   * (dx, dz; dy = 0 by symmetry) and the delay. Returns { dx, dz, delay, S }.
   */
  function bestAlignment(M, n) {
    n = n || 32;
    const win = delayWindow(M);
    const R = displacementRanges(M);
    const f = (dx, dz, d) => signal(M, dx, 0, dz, d, n);
    const st = { dx: 0, dz: 0, delay: 0 };
    st.delay = maximize1D(d => f(0, 0, d), win.lo, win.hi, 40).x;
    if (M.tan > 1e-9) {
      for (let r = 0; r < 2; r++) {
        const sx = R.x * (r === 0 ? 0.5 : 0.15);
        st.dx = maximize1D(x => f(x, st.dz, st.delay), st.dx - sx, st.dx + sx, 12).x;
        const sz = Math.min(R.z, sx / M.tan);
        st.dz = maximize1D(z => f(st.dx, z, st.delay), st.dz - sz, st.dz + sz, 12).x;
        const sd = (win.hi - win.lo) * (r === 0 ? 0.25 : 0.08);
        st.delay = maximize1D(d => f(st.dx, st.dz, d),
          Math.max(win.lo, st.delay - sd), Math.min(win.hi, st.delay + sd), 12).x;
      }
    }
    st.S = f(st.dx, st.dz, st.delay);
    return st;
  }

  // ----- point-wise fields, for drawing -----

  // Peak-normalised fluence profile of the pump at (x, y, z) (1 at the pump focus).
  function pumpSpatial(M, x, y, z, dx, dy, dz) {
    const X = x - dx, Z = z - dz, Y = y - dy;
    const s = X * M.sin + Z * M.cos;
    const r = X * M.cos - Z * M.sin;
    const w2 = wSq(M.w0p2, M.zRp, s);
    return (M.w0p2 / w2) * Math.exp(-2 * (r * r + Y * Y) / w2);
  }

  function probeSpatial(M, x, y, z) {
    const w2 = wSq(M.w0r2, M.zRr, z);
    return (M.w0r2 / w2) * Math.exp(-2 * (x * x + y * y) / w2);
  }

  // 1/e² radius of each beam at its own longitudinal coordinate s.
  function pumpWidth(M, s) { return Math.sqrt(wSq(M.w0p2, M.zRp, s)); }
  function probeWidth(M, z) { return Math.sqrt(wSq(M.w0r2, M.zRr, z)); }

  // Arrival times (fs) of the pulse peaks at (x, z); the pump peak passes the origin at t = 0.
  function pumpArrival(M, x, z) { return (x * M.sin + z * M.cos) / C; }
  function probeArrival(z, delay) { return delay + z / C; }

  // Local signal density at a point (time-integrated), relative to the ideal peak density.
  function localDensity(M, x, y, z, dx, dy, dz, delay) {
    const p = pumpSpatial(M, x, y, z, dx, dy, dz);
    const r = probeSpatial(M, x, y, z);
    const tau = probeArrival(z, delay) - pumpArrival(M, x, z);
    return (M.m === 1 ? p : p * p) * r * kernel(M, tau, Math.sqrt(M.sc2)) / M.kernelPeak;
  }

  // Width of a sampled peak at half its maximum (linear interpolation). null if it does not
  // fall to half within the samples.
  function fwhm(xs, ys) {
    let iMax = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i] > ys[iMax]) iMax = i;
    const half = ys[iMax] / 2;
    let left = null;
    let right = null;
    for (let i = iMax; i > 0; i--) {
      if (ys[i - 1] < half) { left = xs[i - 1] + (half - ys[i - 1]) * (xs[i] - xs[i - 1]) / (ys[i] - ys[i - 1]); break; }
    }
    for (let i = iMax; i < ys.length - 1; i++) {
      if (ys[i + 1] < half) { right = xs[i] + (ys[i] - half) * (xs[i + 1] - xs[i]) / (ys[i] - ys[i + 1]); break; }
    }
    return left === null || right === null ? null : right - left;
  }

  return {
    C,
    FWHM_TO_SIGMA,
    erfc,
    stepResponse,
    createModel,
    kernel,
    slice,
    zGrid,
    zNodes,
    signal,
    depthProfile,
    maximize1D,
    delayWindow,
    displacementRanges,
    bestAlignment,
    pumpSpatial,
    probeSpatial,
    pumpWidth,
    probeWidth,
    pumpArrival,
    probeArrival,
    localDensity,
    fwhm,
  };
});
