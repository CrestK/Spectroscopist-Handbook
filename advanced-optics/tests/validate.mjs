// Checks the numerical core embedded in index.html (<script id="core">) against closed forms, Maxwell's boundary
// conditions, published glass data (Schott catalogue, Malitson), numbers from an independent Python calculation and
// the worked examples on the page.
//   node tests/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["C0", "EPS0", "MU0", "QE", "ME", "DEG", "LINES", "C_NM_FS", "C_UM_FS", "cx", "cadd", "csub", "cmul", "cdiv", "cscale", "cabs", "carg", "cconj", "cexpi", "cexp", "csqrt", "goldenMax",
  "waveParams", "harmonic", "phasor", "gaussPulse", "intensityFromField", "fieldFromIntensity", "gaussBeamPeak", "PULSE_PEAK", "emSource", "polState", "eField",
  "MATERIALS", "GLASSES", "sellmeier", "indexOf", "nOf", "inRange", "groupIndex", "gvd", "abbe", "cauchyFit", "cauchyN", "prismTrace", "prismMinDev", "prismMinDevInc",
  "METALS", "metalIndex", "cindex", "normalR", "pulseT0", "pulseEnv", "pulseWidth", "instFreq", "glassPulse", "slabField",
  "CONDUCTORS", "conductorK", "metalOptics", "lorentzParams", "lorentzAt", "lorentzApprox", "lorentzKey", "drivenResponse",
  "fresnel", "brewster", "critical", "interfaceVectors", "interfaceField", "plateStack", "platesFor", "polarizerJ", "polarizerChain", "rotatingI", "QUIZ",
  "HP", "WAVE_GROUP", "waveSource", "waveMedium", "waveSpace", "waveFrom", "waveSolve", "waveLight"];
// new Function keeps the core in this realm (Node's vm sandbox makes typed arrays much slower)
const core = new Function(m[1] + `\nreturn {${names.join(",")}};`)();
const c = core, t0 = Date.now();

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const g = (v, n) => Number(v.toPrecision(n || 6));
const e = v => v.toExponential(1);

// 1. complex square root branch and golden-section search
{
  const a = c.csqrt(c.cx(-4, 0)), b = c.csqrt(c.cx(-1, -1e-12)), d = c.csqrt(c.cx(3, 4));
  const x = c.goldenMax(v => -((v - 2.345) ** 2), 0, 5, true), y = c.goldenMax(v => (v + 1) ** 2, -3, 2, false);
  check("1 √(−4) = 2i, √(−1 − 0i) = −i, √(3 + 4i) = 2 + i; golden search", Math.abs(a.re) < 1e-15 && a.im === 2 && b.im < 0 && Math.abs(d.re - 2) < 1e-15 && Math.abs(d.im - 1) < 1e-15
    && Math.abs(x - 2.345) < 1e-9 && Math.abs(y + 1) < 1e-9, `max at ${g(x, 10)}, min at ${g(y, 10)}`);
}

// 2. waves: λ = cT/n, v = fλ; f(z ∓ vt) satisfies the wave equation; phasor turns clockwise along +z
{
  const p = c.waveParams(2, 1.57), h = 0.01, ht = 0.01 / p.v;
  let worst = 0;
  for (const dir of [1, -1]) for (const [z, t] of [[100, 0.3], [377, 1.1], [905, 2.6]]) {
    const H = (zz, tt) => c.harmonic(zz, tt, 1, p.k, p.omega, 0.4, dir), G = (zz, tt) => c.gaussPulse(zz - dir * p.v * tt - 500, 300);
    for (const F of [H, G]) {
      const dzz = (F(z + h, t) - 2 * F(z, t) + F(z - h, t)) / (h * h), dtt = (F(z, t + ht) - 2 * F(z, t) + F(z, t - ht)) / (ht * ht);
      worst = Math.max(worst, Math.abs(dzz - dtt / (p.v * p.v)) / Math.max(1e-9, Math.abs(dzz) + 1e-6));
    }
  }
  const a0 = c.carg(c.phasor(0, 0, 1, p.k, p.omega, 0, 1)), a1 = c.carg(c.phasor(0, 0.1, 1, p.k, p.omega, 0, 1)), b1 = c.carg(c.phasor(0, 0.1, 1, p.k, p.omega, 0, -1));
  check("2 λ = cT/n, v = λ/T, wave equation for harmonic and pulse, phasor sense", Math.abs(p.lam - 381.9013) < 1e-3 && rel(p.lam / p.T, p.v) < 1e-14 && rel(p.v, c.C_NM_FS / 1.57) < 1e-14
    && worst < 1e-3 && a1 < a0 && b1 > a0, `λ = ${g(p.lam)} nm, worst wave-equation residual ${e(worst)}`);
}

// 3. intensity and field: Python numbers, Gaussian-beam and pulse peak factors by numerical integration
{
  const sun = c.fieldFromIntensity(1361), hw = c.intensityFromField(25);
  // ∫ 2P/(πw²) exp(−2r²/w²) 2πr dr = P
  const w = 0.5e-3, I0 = c.gaussBeamPeak(1, 2 * w);
  let P = 0; for (let i = 0; i < 20000; i++) { const r = (i + 0.5) * 5 * w / 20000; P += I0 * Math.exp(-2 * r * r / (w * w)) * 2 * Math.PI * r * 5 * w / 20000; }
  // ∫ Ppk exp(−4 ln2 t²/τ²) dt = E
  let E = 0; for (let i = -40000; i < 40000; i++) { const t = (i + 0.5) * 1e-4; E += c.PULSE_PEAK * Math.exp(-4 * Math.LN2 * t * t) * 1e-4; }
  const src = c.emSource({ kind: "point", P: 100, r: 2, lam: 550e-9 });
  check("3 sunlight E₀ = 1012.65 V/m, 25 V/m → 0.82951 W/m², beam and pulse peaks integrate to P and E", Math.abs(sun - 1012.65) < 0.01 && Math.abs(hw - 0.82951) < 1e-5
    && rel(P, 1) < 1e-6 && rel(E, 1) < 1e-6 && rel(src.I * 4 * Math.PI * 4, 100) < 1e-14 && rel(c.fieldFromIntensity(hw), 25) < 1e-14,
    `E₀ = ${g(sun)} V/m, I = ${g(hw)} W/m², ∫beam = ${g(P, 8)} W, ∫pulse = ${g(E, 8)} J`);
}

// 4. polarization states: circular keeps |E| constant and turns from x to y; linear stays on one line
{
  const cc = c.polState("ccw"), li = c.polState("lin", 30);
  let spread = 0, off = 0;
  for (let i = 0; i < 64; i++) { const ph = i / 64 * 2 * Math.PI, a = c.eField(ph, cc), b = c.eField(ph, li); spread = Math.max(spread, Math.abs(Math.hypot(a.x, a.y) - Math.SQRT1_2)); off = Math.max(off, Math.abs(b.y * Math.cos(30 * c.DEG) - b.x * Math.sin(30 * c.DEG))); }
  const e0 = c.eField(0, cc), e1 = c.eField(-Math.PI / 2, cc);
  check("4 circular |E| constant, x → y as time runs; linear at 30° stays on its line", spread < 1e-15 && off < 1e-15 && e0.x > 0.7 && Math.abs(e1.x) < 1e-15 && e1.y > 0.7, `|E| spread ${e(spread + 1e-30)}`);
}

// 5. glasses against the Schott catalogue and Malitson: n_d and V_d
{
  const ref = [["bk7", 1.51680, 64.17], ["f2", 1.62005, 36.43], ["sf11", 1.78472, 25.68], ["silica", 1.45846, 67.82], ["caf2", 1.43385, 94.99]];
  const bad = [], out = [];
  for (const [k, nd, vd] of ref) { const n = c.nOf(k, c.LINES.d), v = c.abbe(k); out.push(`${k} ${n.toFixed(5)}/${v.toFixed(2)}`); if (Math.abs(n - nd) > 1.5e-5 || Math.abs(v - vd) > 0.02) bad.push(k); }
  check("5 n_d and V_d match the Schott catalogue and Malitson to 1.5 × 10⁻⁵ and 0.02", bad.length === 0, out.join(", "));
}

// 6. other materials against an independent Python evaluation of the same formulas, and textbook values
{
  const ref = [["sapphire", 587.5618, 1.76817], ["water", 587.5618, 1.33340], ["diamond", 587.5618, 2.41749], ["silicon", 1550, 3.47772], ["bk7", 1064, 1.50663], ["silica", 1550, 1.44402], ["air", 589.3, 1.000277147]];
  let worst = 0; const out = [];
  for (const [k, l, n] of ref) { const v = c.nOf(k, l); worst = Math.max(worst, Math.abs(v - n)); out.push(`${k} ${v.toFixed(5)}`); }
  check("6 sapphire, water, diamond, silicon, air and IR values match Python to 10⁻⁵; water within 5 × 10⁻⁴ of 1.3330",
    worst < 1e-5 && Math.abs(c.nOf("water", 589.3) - 1.3330) < 5e-4, out.join(", "));
}

// 7. analytic dn/dλ and d²n/dλ² against finite differences; n_g and GVD against Python and refractiveindex.info
{
  let worst = 0;
  for (const k of ["bk7", "sf11", "water", "silica"]) for (const l of [400, 600, 800, 1000]) {
    // central differences in nm, Richardson-extrapolated from steps of 2 and 1 nm (error ∝ h⁴)
    const D1 = h => (c.nOf(k, l + h) - c.nOf(k, l - h)) / (2 * h) * 1000, D2 = h => (c.nOf(k, l + h) - 2 * c.nOf(k, l) + c.nOf(k, l - h)) / (h * h) * 1e6;
    const a = c.indexOf(k, l), d1 = (4 * D1(1) - D1(2)) / 3, d2 = (4 * D2(1) - D2(2)) / 3;
    worst = Math.max(worst, rel(a.d1, d1), rel(a.d2, d2));
  }
  const gb = c.gvd("bk7", 800), gs = c.gvd("silica", 800), ng = c.groupIndex("bk7", 800);
  check("7 derivatives match Richardson-extrapolated differences; BK7 at 800 nm: GVD 44.65, n_g 1.52665; silica 36.16 fs²/mm", worst < 1e-6 && Math.abs(gb - 44.652) < 0.01 && Math.abs(gs - 36.162) < 0.01 && Math.abs(ng - 1.52665) < 1e-5,
    `worst ${e(worst)}, GVD ${g(gb, 5)} and ${g(gs, 5)} fs²/mm, n_g ${g(ng)}`);
}

// 8. Cauchy fit: close in the visible, an effective UV resonance between the Sellmeier UV terms, bad in the IR
{
  const f = c.cauchyFit("bk7", 400, 700), at2 = Math.abs(c.cauchyN(f, 2000) - c.nOf("bk7", 2000));
  check("8 Cauchy fit to N-BK7 over 400–700 nm: rms < 10⁻⁴, resonance between 77 and 142 nm, off by > 3 × 10⁻³ at 2 µm",
    f.rms < 1e-4 && f.lam0 > 77 && f.lam0 < 142 && at2 > 3e-3, `A = ${g(f.A)}, B = ${g(f.B)} µm², rms ${e(f.rms)}, λ₀ = ${g(f.lam0, 4)} nm, error at 2 µm ${e(at2)}`);
}

// 9. prism: minimum deviation is symmetric and is a minimum; the Python value for N-BK7
{
  const n = c.nOf("bk7", c.LINES.d), t1 = c.prismMinDevInc(n, 60), tr = c.prismTrace(n, 60, t1), dm = c.prismMinDev(n, 60);
  let isMin = true; for (let a = 30; a <= 89; a += 0.5) { const d = c.prismTrace(n, 60, a); if (!d.tir && d.dev < dm - 1e-9) isMin = false; }
  check("9 prism: δ_min = 38.6467° for N-BK7, symmetric path (θ₂ = 30°), no smaller deviation at other angles", Math.abs(dm - 38.6467) < 1e-3 && Math.abs(tr.t2 - 30) < 1e-9 && Math.abs(tr.dev - dm) < 1e-9 && isMin,
    `δ_min ${g(dm)}°, θ₁ ${g(t1)}°`);
}

// 10. metals: Johnson & Christy table points, silver skin depth and reflectance against the DC model
{
  const a = c.metalIndex("silver", 495.9), mid = c.metalIndex("gold", (0.5209 + 0.5486) / 2 * 1000), s = c.metalOptics("silver", 495.9);
  check("10 silver at 495.9 nm: ñ = 0.05 + 3.093i, d = 25.5 nm, R = 98.1 %; DC model 2.6 nm", Math.abs(a.re - 0.05) < 1e-12 && Math.abs(a.im - 3.093) < 1e-12
    && Math.abs(mid.re - 0.525) < 1e-9 && Math.abs(s.d - 25.52) < 0.01 && Math.abs(s.R - 0.9813) < 1e-4 && Math.abs(s.dDC - 2.580) < 0.005, `d ${g(s.d, 4)} nm, R ${g(s.R, 4)}, DC ${g(s.dDC, 3)} nm`);
}

// 11. pulses: envelope FWHM, broadening measured on the curve, energy kept, chirp from the phase; a worked example
{
  const tau = 20, T0 = c.pulseT0(tau), gdd = 446.5;
  const fwhm = gd => { let hi = 0; const I = t => c.cabs(c.pulseEnv(t, T0, gd)) ** 2, pk = I(0); for (let t = 0; t < 2000; t += 0.001) if (I(t) < pk / 2) { hi = t; break; } return 2 * hi; };
  const energy = gd => { let s = 0; for (let t = -1500; t < 1500; t += 0.05) s += c.cabs(c.pulseEnv(t, T0, gd)) ** 2 * 0.05; return s; };
  const ph = t => c.carg(c.pulseEnv(t, T0, gdd)), dt = 1e-3, tt = 15, wNum = -(ph(tt + dt) - ph(tt - dt)) / (2 * dt);
  const out = c.pulseWidth(20, c.gvd("bk7", 800) * 10);
  check("11 FWHM 20 fs; after 446.5 fs² the curve is as wide as the formula, same energy, chirp = −d(phase)/dt; 20 fs + 10 mm N-BK7 → 65.05 fs",
    Math.abs(fwhm(0) - 20) < 0.002 && Math.abs(fwhm(gdd) - c.pulseWidth(tau, gdd)) < 0.003 && rel(energy(gdd), energy(0)) < 1e-6 && rel(c.instFreq(tt, T0, gdd), wNum) < 1e-5 && Math.abs(out - 65.05) < 0.01,
    `widths ${g(fwhm(0), 5)} and ${g(fwhm(gdd), 5)} fs (formula ${g(c.pulseWidth(tau, gdd), 5)}), out ${g(out, 5)} fs`);
}

// 12. slab: field continuous at both faces, transmitted peak arrives with the group delay, reflectance 4.14 %
{
  const S = Object.assign(c.glassPulse("bk7", 800), { T0: c.pulseT0(10), L: 20 }), eps = 1e-7;
  const jump0 = c.cabs(c.csub(c.slabField(-eps, 1.3, S), c.slabField(eps, 1.3, S)));
  const tL = S.k1 * S.L + 0.7, jumpL = c.cabs(c.csub(c.slabField(S.L - eps, tL, S), c.slabField(S.L + eps, tL, S)));
  const t = 120; let best = 0, zb = 0; for (let z = 20; z < 60; z += 0.002) { const a = c.cabs(c.slabField(z, t, S)); if (a > best) { best = a; zb = z; } }
  const expect = S.L + c.C_UM_FS * (t - S.k1 * S.L);
  check("12 slab: continuous at z = 0 and L, exit peak at L + c(t − n_g L/c), R = 4.139 %, transmitted amplitude² × n = 1 − R",
    jump0 < 1e-5 && jumpL < 1e-5 && Math.abs(zb - expect) < 0.01 && Math.abs(S.R - 0.041385) < 1e-6 && rel(S.t01 * S.t10, 1 - S.R) < 1e-14 && rel(S.n * S.t01 ** 2, 1 - S.R) < 1e-14,
    `jumps ${e(jump0 + 1e-30)}, ${e(jumpL + 1e-30)}; peak at ${g(zb, 6)} µm, expected ${g(expect, 6)} µm`);
}

// 13. conductors: k̃² = μεω² + iμσω exactly, Python numbers, limits
{
  const cases = [[2 * Math.PI * 60, 1, 5.96e7], [2 * Math.PI * 1e9, 81, 4.8], [2 * Math.PI * 1e14, 2.25, 1e-9], [2 * Math.PI * 2.45e9, 1, 5.96e7]];
  let worst = 0;
  for (const [w, er, s] of cases) { const r = c.conductorK(w, er, s); const K2 = r.k ** 2 + r.kappa ** 2; worst = Math.max(worst, Math.abs(r.k ** 2 - r.kappa ** 2 - c.MU0 * er * c.EPS0 * w * w) / K2, Math.abs(2 * r.k * r.kappa - c.MU0 * s * w) / K2); }
  const cu = c.conductorK(2 * Math.PI * 60, 1, 5.96e7), sea = c.conductorK(2 * Math.PI * 1e9, 81, 4.8), s10 = c.conductorK(2 * Math.PI * 1e4, 81, 4.8);
  check("13 k̃² = μεω² + iμσω (to 10⁻¹⁴ of |k̃|²); Cu at 60 Hz d = 8.4163 mm, φ = 45°; seawater 10 kHz 2.2972 m, 1 GHz 11.042 mm and φ = 23.40°; τ_Cu = 1.486 × 10⁻¹⁹ s",
    worst < 1e-12 && Math.abs(cu.d - 8.4163e-3) < 1e-7 && Math.abs(cu.phi / c.DEG - 45) < 1e-9 && rel(cu.d, cu.dGood) < 1e-12 && Math.abs(s10.d - 2.2972) < 1e-4
    && Math.abs(sea.d - 1.1042e-2) < 1e-6 && Math.abs(sea.phi / c.DEG - 23.404) < 1e-3 && Math.abs(cu.tau - 1.486e-19) < 1e-22, `worst ${e(worst)}, d_Cu ${g(cu.d * 1e3, 5)} mm`);
}

// 14. Lorentz, a 589 nm line: closed forms (Python), exact extrema at ω₀ ∓ γ/2 where α = α_max/2, exact = near-resonance formula near the line
{
  const P = c.lorentzParams(589, 1e8, 1e17, 1), K = c.lorentzKey(P);
  const offMax = (K.wMax - P.omega0) / P.gamma, offMin = (K.wMin - P.omega0) / P.gamma;
  let worst = 0; for (let x = -3; x <= 3; x += 0.25) { const w = P.omega0 + x * P.gamma, a = c.lorentzAt(w, P), b = c.lorentzApprox(w, P); worst = Math.max(worst, Math.abs(a.alpha - b.alpha) / K.aMax, Math.abs(a.nm1 - b.nm1) / K.nm1Max); }
  const nt = c.cadd(c.cx(1, 0), c.cx(c.lorentzAt(P.omega0 + 0.3 * P.gamma, P).nm1, c.lorentzAt(P.omega0 + 0.3 * P.gamma, P).kap)), chi = c.lorentzAt(P.omega0 + 0.3 * P.gamma, P).chi;
  const id = c.cabs(c.csub(c.cmul(nt, nt), c.cadd(c.cx(1, 0), chi)));
  check("14 589 nm line, 100 MHz, 10¹⁷ m⁻³, f = 1: α_max = 1689.59 m⁻¹, (n − 1)_max = 3.95966 × 10⁻⁵; exact n extrema at ∓0.49998γ with α/α_max = 0.500001; anomalous width 100 MHz; ñ² = 1 + χ̃",
    Math.abs(K.aMax - 1689.59) < 0.01 && Math.abs(K.nm1Max - 3.95966e-5) < 1e-10 && Math.abs(offMax + 0.49998) < 2e-5 && Math.abs(offMin - 0.50002) < 2e-5
    && Math.abs(K.halfAtMax - 0.500001) < 2e-6 && rel(K.anomalous, 1e8) < 1e-4 && worst < 1e-4 && id < 1e-15 && rel(K.aMaxEx, K.aMax) < 1e-6,
    `extrema at ${g(offMax, 6)}γ and ${g(offMin, 6)}γ, α ratio ${g(K.halfAtMax, 7)}, width ${g(K.anomalous / 1e6, 6)} MHz, near-resonance vs exact ${e(worst)}`);
}

// 15. driven electron: in phase far below, 90° at resonance, 45° at ω₀ − γ/2, out of phase far above
{
  const w0 = 1, gm = 0.01, lag = w => c.drivenResponse(w, w0, gm).lag / c.DEG;
  check("15 driven electron lags 0°, 45°, 90°, 180°", lag(0.2) < 0.2 && Math.abs(lag(1 - gm / 2) - 45) < 0.5 && Math.abs(lag(1) - 90) < 1e-9 && lag(5) > 179.8,
    `${g(lag(0.2), 3)}°, ${g(lag(1 - gm / 2), 4)}°, ${g(lag(1), 4)}°, ${g(lag(5), 5)}°`);
}

// 16. Fresnel, air to n = 1.57 at 45°, p, 600 nm, 25 V/m (Python): θ_T, α, E₀R, E₀T, R, T; s values; wave vectors and ω
{
  const F = c.fresnel(1, 1.57, 45), V = c.interfaceVectors(1, 1.57, 600, 45, "p", 25);
  const ok = Math.abs(F.thT - 26.7685) < 1e-4 && Math.abs(F.alpha.re - 1.26266) < 1e-5 && Math.abs(25 * F.rp.re + 2.7125) < 1e-4 && Math.abs(25 * F.tp.re - 17.6513) < 1e-4
    && Math.abs(F.Rp - 0.011772) < 1e-6 && Math.abs(F.Tp - 0.988228) < 1e-6 && Math.abs(F.rs.re + 0.329393) < 1e-6 && Math.abs(F.ts.re - 0.670607) < 1e-6
    && Math.abs(V.kI[0] - 7.40480e6) < 10 && Math.abs(V.kT[2] - 1.46791e7) < 50 && Math.abs(V.omega - 3.13942e15) < 1e10 && Math.abs(V.ER.amp + 2.7125) < 1e-4 && V.ER.dir[2] > 0 && V.ET.dir[2] < 0;
  check("16 air to n = 1.57, 45°, p, 25 V/m: θ_T = 26.7685°, α = 1.26266, E₀R = −2.7125 V/m, E₀T = 17.6513 V/m, R = 0.011772, T = 0.988228, k and ω", ok,
    `θ_T ${g(F.thT)}°, E₀R ${g(25 * F.rp.re, 5)}, E₀T ${g(25 * F.tp.re, 6)} V/m, k_Tz ${g(V.kT[2], 6)} rad/m`);
}

// 17. Fresnel identities: R + T = 1 (glass, TIR, silver), Brewster r_p = 0, TIR R = 1, r_p = −r_s² at 45°, Hecht's forms
{
  let worstRT = 0, worstH = 0;
  const ag = c.metalIndex("silver", 600);
  for (let th = 0; th < 90; th += 0.7) {
    for (const [n1, n2] of [[1, c.cx(1.57)], [1.5, c.cx(1)], [1.33, c.cx(2.4)], [1, ag]]) { const F = c.fresnel(n1, n2, th); worstRT = Math.max(worstRT, Math.abs(F.Rs + F.Ts - 1), Math.abs(F.Rp + F.Tp - 1)); }
    const n1 = 1, n2 = 1.57, F = c.fresnel(n1, n2, th), cI = Math.cos(th * c.DEG), cT = F.cT.re;
    const rsH = (n1 * cI - n2 * cT) / (n1 * cI + n2 * cT), rpH = (n2 * cI - n1 * cT) / (n2 * cI + n1 * cT);
    worstH = Math.max(worstH, Math.abs(F.rs.re - rsH), Math.abs(F.rp.re + rpH));
  }
  const B = c.fresnel(1, 1.57, c.brewster(1, 1.57)), T = c.fresnel(1.5, 1, 50), A45 = c.fresnel(1, 1.57, 45), N0 = c.fresnel(1, 1.57, 0);
  check("17 R + T = 1 for glass, TIR and silver; r_p(θ_B) = 0, θ_B + θ_T = 90°; R = 1 beyond θ_c; r_p = −r_s² at 45°; Hecht's r_s = r_s, r_p = −r_p; r_s = r_p at 0°",
    worstRT < 1e-12 && cabsLt(B.rp, 1e-14) && Math.abs(B.thI + B.thT - 90) < 1e-9 && Math.abs(T.Rs - 1) < 1e-14 && Math.abs(T.Rp - 1) < 1e-14 && T.Ts === 0
    && Math.abs(A45.rp.re + A45.rs.re ** 2) < 1e-14 && worstH < 1e-14 && Math.abs(N0.rs.re - N0.rp.re) < 1e-15,
    `worst |R + T − 1| ${e(worstRT + 1e-30)}, Hecht difference ${e(worstH + 1e-30)}`);
  function cabsLt(z, tol) { return c.cabs(z) < tol; }
}

// 18. the fields of the maps obey Maxwell at z = 0: tangential E, normal D, tangential H continuous; ∇·E = 0
{
  let worst = 0;
  for (const [n1, n2, th] of [[1, c.cx(1.57), 45], [1.5, c.cx(1), 60], [1, c.metalIndex("gold", 600), 30], [1.33, c.cx(1.52), 70]]) {
    const F = c.fresnel(n1, n2, th), h = 1e-7, x = 0.37;
    const s = z => c.interfaceField(x, z, F, "s").Ey, p = z => c.interfaceField(x, z, F, "p");
    const dz = (f, z) => c.cscale(c.csub(f(z + h), f(z - h)), 1 / (2 * h));
    const scale = 1 + c.cabs(s(-h));
    worst = Math.max(worst, c.cabs(c.csub(s(-1e-12), s(1e-12))) / scale, c.cabs(c.csub(dz(s, -3 * h), dz(s, 3 * h))) / (2 * Math.PI * n1 * 3 * scale));
    const Ea = p(-1e-12), Eb = p(1e-12), N2sq = c.cmul(F.n2, F.n2);
    worst = Math.max(worst, c.cabs(c.csub(Ea.Ex, Eb.Ex)) / scale, c.cabs(c.csub(c.cscale(Ea.Ez, n1 * n1), c.cmul(N2sq, Eb.Ez))) / (n1 * n1 * scale));
    // tangential H ∝ (∂Ex/∂z − ∂Ez/∂x), divergence ∂Ex/∂x + ∂Ez/∂z
    const Hy = z => { const fz = q => p(q).Ex, fx = q => c.interfaceField(q, z, F, "p").Ez; return c.csub(dz(fz, z), c.cscale(c.csub(fx(x + h), fx(x - h)), 1 / (2 * h))); };
    const div = z => c.cadd(c.cscale(c.csub(c.interfaceField(x + h, z, F, "p").Ex, c.interfaceField(x - h, z, F, "p").Ex), 1 / (2 * h)), dz(q => p(q).Ez, z));
    const hs = 2 * Math.PI * n1 * 3 * scale;
    worst = Math.max(worst, c.cabs(c.csub(Hy(-3 * h), Hy(3 * h))) / hs, c.cabs(div(-0.3)) / hs, c.cabs(div(0.2)) / hs);
  }
  check("18 map fields: E_t, εE_z, H_t continuous at z = 0 and ∇·E = 0 for glass, TIR, gold and water to glass", worst < 1e-5, `worst relative mismatch ${e(worst)}`);
}

// 19. plates: closed form = surface-by-surface incoherent recursion; Brewster window and pile-of-plates numbers
{
  const n = c.nOf("bk7", 633), tb = c.brewster(1, n);
  let worst = 0;
  for (const th of [10, 40, tb, 75]) for (const N of [1, 3, 10]) {
    const F = c.fresnel(1, n, th);
    for (const [R, Tc] of [[F.Rs, c.plateStack(n, th, N).Ts], [F.Rp, c.plateStack(n, th, N).Tp]]) {
      let T = 1 - R; for (let k = 1; k < 2 * N; k++) T = T * (1 - R) / (1 - (1 - T) * R);
      worst = Math.max(worst, Math.abs(T - Tc));
    }
  }
  const one = c.plateStack(n, tb, 1), ten = c.plateStack(n, tb, 10);
  check("19 plates: closed form = recursion; N-BK7 at θ_B, 633 nm: R_s = 15.454 %, one plate T_s = 0.7323, ten 0.2148, 9 plates for T_s < 25 %",
    worst < 1e-14 && Math.abs(one.Rs - 0.15454) < 1e-5 && Math.abs(one.Ts - 0.7323) < 1e-4 && Math.abs(ten.Ts - 0.2148) < 1e-4 && Math.abs(one.Tp - 1) < 1e-12 && c.platesFor(n, tb, 0.25) === 9,
    `worst ${e(worst + 1e-30)}, θ_B ${g(tb, 5)}°`);
}

// 20. polarizers: the example setups and the turning polarizer, Malus's law, unpolarized halves, leakage of crossed real polarizers
{
  const ch = (a, eps) => c.polarizerChain({ I0: 2, unpolarized: true }, a, eps || 0).I;
  let malus = 0, unpol = 0;
  for (let a = 0; a < 180; a += 7) { malus = Math.max(malus, Math.abs(c.polarizerChain({ I0: 1, unpolarized: false, angle: 20 }, [a], 0).I - Math.cos((a - 20) * c.DEG) ** 2)); unpol = Math.max(unpol, Math.abs(ch([a]) - 1)); }
  let rot = 0, peaks = 0, prev = -1, prev2 = -1;
  for (let i = 0; i <= 4000; i++) { const t = i / 4000, I = c.polarizerChain({ I0: 2, unpolarized: true }, [0, 360 * 0.5 * t, 90], 0).I; rot = Math.max(rot, Math.abs(I - c.rotatingI(t, 0.5, 1))); }
  for (let i = 0; i <= 4001; i++) { const I = c.rotatingI(i / 4000 * 2, 0.5, 1); if (prev > prev2 && prev > I) peaks++; prev2 = prev; prev = I; }
  check("20 polarizer setups: 1, 0.5, 0, 0.1875 W/m² from 2 W/m²; Malus; unpolarized → I₀/2; crossed pair leaking 10⁻⁵ passes 2 × 10⁻⁵ W/m²; turning polarizer: four maxima per turn",
    Math.abs(ch([0, 0, 0]) - 1) < 1e-15 && Math.abs(ch([0, 45]) - 0.5) < 1e-15 && ch([0, 90]) < 1e-30 && Math.abs(ch([0, 30, 90]) - 0.1875) < 1e-15 && malus < 1e-15 && unpol < 1e-15
    && Math.abs(ch([0, 90], 1e-5) - 2e-5) < 1e-9 && rot < 1e-15 && peaks === 4, `Malus ${e(malus + 1e-30)}, rotating vs chain ${e(rot + 1e-30)}, ${peaks} maxima per turn`);
}

// 21. the worked examples: every answer exists and has the value computed independently
{
  const want = { w1: 381.901, v1: 1012.65, v2: 0.82951, n1: 1.5168, n2: 395.70, n3: 38.647, p1: 1.52665, p2: 65.05, p3: 4.1385, c1: 8.4163, c2: 2.2972, c3: 1.4856,
    l2: 1689.59, l4: 3.9597e-5, i1: 26.7685, i2: -2.7125, i3: 17.651, i4: 57.505, i5: 41.245, o1: 15.454, o2: 9, z1: 2, z2: 0.5, z3: 0, z4: 0.1875, z5: 4 };
  const bad = [];
  for (const [k, q] of Object.entries(c.QUIZ)) { if (q.choices ? !q.choices.some(([v]) => v === q.answer) : !Number.isFinite(q.value)) bad.push(k); if (!q.how) bad.push(k + " no text"); }
  for (const [k, v] of Object.entries(want)) { const q = c.QUIZ[k]; if (!q || (v === 0 ? Math.abs(q.value) > 1e-12 : rel(q.value, v) > 2e-4)) bad.push(`${k} ${q && q.value}`); }
  const els = [...html.matchAll(/class="qa" data-q="(\w+)"/g)].map(x => x[1]), missing = els.filter(k => !c.QUIZ[k]), unused = Object.keys(c.QUIZ).filter(k => !els.includes(k));
  check("21 worked examples: answers and texts present, values right, every example on the page has an answer", bad.length === 0 && missing.length === 0 && unused.length === 0,
    `${els.length} examples${bad.length ? "; bad: " + bad.join(", ") : ""}${missing.length ? "; missing: " + missing.join(", ") : ""}${unused.length ? "; unused: " + unused.join(", ") : ""}`);
}

// 22. converter: the six relations of the diagram hold after any edit; a new medium keeps f, a new wavelength keeps v
{
  const rels = st => [st.omega / (2 * Math.PI * st.f), st.omega * st.T / (2 * Math.PI), st.f * st.T, st.k * st.v / st.omega, st.v * st.T / st.lam, st.k * st.lam / (2 * Math.PI), st.n * st.v / c.C0];
  const s0 = c.waveFrom(c.C0 / 532e-9, c.C0), glass = c.waveSolve(s0, "n", 1.57), blue = c.waveSolve(glass, "lam", 300e-9), L = c.waveLight(s0);
  let st = s0, worst = 0;
  for (const [k, x] of [["n", 1.57], ["lam", 400e-9], ["omega", 2e15], ["T", 3e-15], ["v", 343], ["k", 1e3], ["f", 440], ["n", 2.4]]) {
    st = c.waveSolve(st, k, x); for (const r of rels(st)) worst = Math.max(worst, Math.abs(r - 1));
    if (Math.abs(st[k] / x - 1) > 1e-14) worst = 1;
  }
  check("22 converter: ω = 2πf, ωT = 2π, fT = 1, kv = ω, vT = λ, kλ = 2π after every edit; a new n keeps f, a new λ keeps v; 532 nm is 563.52 THz, 18797 cm⁻¹, 2.3305 eV",
    worst < 1e-14 && Math.abs(glass.f / s0.f - 1) < 1e-15 && Math.abs(glass.lam / (532e-9 / 1.57) - 1) < 1e-14 && Math.abs(blue.v / glass.v - 1) < 1e-15
    && Math.abs(s0.f / 1e12 - 563.52) < 0.01 && Math.abs(L.nu - 18797.0) < 0.1 && Math.abs(L.eV - 2.33053) < 1e-5,
    `worst relation error ${e(worst + 1e-30)}, λ in glass ${g(glass.lam * 1e9, 6)} nm, f ${g(s0.f / 1e12, 6)} THz, ${g(L.nu, 6)} cm⁻¹, ${g(L.eV, 6)} eV`);
}

// 23. every equation on the page parses in the bundled KaTeX, so a LaTeX typo fails here instead of showing red on the page
{
  const katex = createRequire(import.meta.url)(path.join(root, "vendor/katex/katex.min.js"));
  const decode = x => x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const srcs = [...html.matchAll(/<div class="eq">([\s\S]*?)<\/div>/g)].map(x => decode(x[1].trim())), bad = [];
  for (const src of srcs) { try { katex.renderToString(src, { displayMode: true, throwOnError: true }); } catch (err) { bad.push(`"${src.slice(0, 40)}…": ${String(err.message).split("\n")[0]}`); } }
  check("23 every equation parses in KaTeX", srcs.length > 40 && bad.length === 0, `${srcs.length} equations${bad.length ? "; " + bad.join("; ") : ""}`);
}

console.log(`${fails ? `${fails} FAILED` : "all passed"} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
