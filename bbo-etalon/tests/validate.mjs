// Checks the numerical core embedded in index.html (<script id="core">) against published data, closed forms and an
// independent time-domain calculation.
//   node tests/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["C_CM_FS", "TWO_PI_C", "bboNo2", "bboNe2", "bboSHG", "kO", "kE", "pulseWidth", "chirpFor", "nmToCm", "cmToNm", "model", "shPowerAt",
  "coeffF", "airyT", "etalonFwhm", "reflectanceFor", "fsrFor", "roundTrip", "decayTime", "etalonFor", "gridFor", "tables", "simulate", "crystal", "judge",
  "parseLengths", "scanLengths"];
const K = new Function(m[1] + `\nreturn {${names.join(",")}};`)();

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const f = (v, d) => v.toFixed(d), e = v => v.toExponential(1);

// independent helpers: erf (series and continued fraction), the etalon's pulse train summed in time, and the
// transmitted energy of a Gaussian spectrum as a Fourier series (the etalon page's formula)
function erf(x) {
  const a = Math.abs(x);
  if (a < 3) { let s = 0, t = a, n = 0; while (Math.abs(t) > 1e-17 * Math.abs(s) || n < 3) { s += t / (2 * n + 1); n++; t *= -a * a / n; } return Math.sign(x) * 2 / Math.sqrt(Math.PI) * s; }
  let fr = 0; for (let n = 60; n >= 1; n--) fr = n / 2 / (a + fr);
  return Math.sign(x) * (1 - Math.exp(-a * a) / Math.sqrt(Math.PI) / (a + fr));
}
function trainIntensity(field, R, tRT, t) {   // |(1 − R) Σ R^j E(t − j t_rt)|² for a complex field function
  let re = 0, im = 0;
  for (let j = 0; j < 20000; j++) { const w = (1 - R) * Math.pow(R, j); if (w < 1e-14) break; const [a, b] = field(t - j * tRT); re += w * a; im += w * b; }
  return re * re + im * im;
}
function fracT(R, fsr, dnu) {
  const sig = dnu / (2 * Math.sqrt(2 * Math.LN2)), k = 2 * Math.PI * Math.PI * sig * sig / (fsr * fsr);
  let sum = 0, Rm = 1; for (let j = 1; j < 1e6; j++) { Rm *= R; const term = Rm * Math.exp(-k * j * j); if (term < 1e-17) break; sum += term; }
  return (1 - R) / (1 + R) * (1 + 2 * sum);
}
const etal = (R, fsr) => ({ R, fsr });

// 1. BBO: the Tamošauskas (2018) indices against Eimerl et al. (1987), phase-matching angles against the usual
//    tabulated values, group-velocity mismatch against the Sellmeier equations of Zhang et al. (2000), phase matching exact
{
  const eim = { o: l => 2.7405 + 0.0184 / (l * l - 0.0179) - 0.0155 * l * l, e: l => 2.3730 + 0.0128 / (l * l - 0.0156) - 0.0044 * l * l };
  const zh = { o: l => 2.7359 + 0.01878 / (l * l - 0.01822) - 0.01471 * l * l + 0.0006081 * l ** 4 - 0.00006740 * l ** 6,
    e: l => 2.3753 + 0.01224 / (l * l - 0.01667) - 0.01627 * l * l + 0.0005716 * l ** 4 - 0.00006305 * l ** 6 };
  let dn = 0; for (const l of [0.4, 0.532, 0.8, 1.064]) dn = Math.max(dn, Math.abs(Math.sqrt(K.bboNo2(l)) - Math.sqrt(eim.o(l))), Math.abs(Math.sqrt(K.bboNe2(l)) - Math.sqrt(eim.e(l))));
  const gvmZ = lam => {   // GVM from the Zhang equations, with their own phase-matching angle
    const l1 = lam / 1000, a = 1 / zh.o(l1), o = 1 / zh.o(l1 / 2), ee = 1 / zh.e(l1 / 2), th = Math.asin(Math.sqrt((a - o) / (ee - o)));
    const nth = l => 1 / Math.sqrt(Math.cos(th) ** 2 / zh.o(l) + Math.sin(th) ** 2 / zh.e(l)), ng = (n, l) => { const h = 1e-4 * l; return n(l) - l * (n(l + h) - n(l - h)) / (2 * h); };
    return (ng(nth, l1 / 2) - ng(l => Math.sqrt(zh.o(l)), l1)) / 2.99792458e-4;
  };
  const b800 = K.bboSHG(800), b1030 = K.bboSHG(1030), b1064 = K.bboSHG(1064), b1500 = K.bboSHG(1500);
  const z1030 = gvmZ(1030), z1064 = gvmZ(1064);
  const pm = Math.max(...[800, 1030, 1300, 1500].map(l => { const b = K.bboSHG(l); return Math.abs(K.kE(2 * b.w1, b.theta) - 2 * K.kO(b.w1)) / K.kO(b.w1); }));
  const ok = dn < 1e-3 && Math.abs(b800.thetaDeg - 29.2) < 0.1 && Math.abs(b1064.thetaDeg - 22.8) < 0.1 && Math.abs(b1030.gvm / z1030 - 1) < 0.01
    && Math.abs(b1064.gvm / z1064 - 1) < 0.01 && pm < 1e-13 && K.bboSHG(380) === null;
  check("1 BBO dispersion and phase matching", ok, `indices within ${e(dn)} of Eimerl (0.4–1.064 µm); θ ${f(b800.thetaDeg, 2)}° at 800 nm (tables 29.2°), ${f(b1064.thetaDeg, 2)}° at 1064 nm (22.8°), ${f(b1030.thetaDeg, 2)}° at 1030, ${f(b1500.thetaDeg, 2)}° at 1500; ` +
    `GVM ${f(b800.gvm, 1)} fs/mm at 800 nm, ${f(b1030.gvm, 1)} at 1030 (Zhang ${f(z1030, 1)}), ${f(b1064.gvm, 1)} at 1064 (Zhang ${f(z1064, 1)}), ${f(b1500.gvm, 1)} at 1500; |Δk|/k at the phase-matching angle ${e(pm)}; no type I SHG below 410 nm`);
}

// 2. the GVM from group indices equals the slope of the exact phase mismatch for equal photons, Δk(Ω/2, Ω/2)/Ω
{
  let worst = 0; const info = [];
  for (const lam of [800, 1030, 1300]) {
    const b = K.bboSHG(lam), W = 1e-4, dk = (K.kE(2 * b.w1 + W, b.theta) - 2 * K.kO(b.w1 + W / 2) - (K.kE(2 * b.w1 - W, b.theta) - 2 * K.kO(b.w1 - W / 2))) / (2 * W);
    worst = Math.max(worst, Math.abs(dk / b.gvm - 1)); info.push(`${lam} nm ${f(dk, 3)} vs ${f(b.gvm, 3)}`);
  }
  check("2 GVM = d(Δk)/dΩ", worst < 1e-5, `${info.join(", ")} fs/mm; max relative difference ${e(worst)}`);
}

// 3. thin crystal: the second harmonic is √2 as wide as the fundamental and 1/√2 as long, with or without chirp
{
  let worst = 0, worstT = 0; const info = [];
  for (const [tau1, C] of [[200, 0], [100, 0], [150, 2]]) {
    const mm = K.model(515, tau1, C, 0), c = K.crystal(mm, etal(0.761, 172), 0), want = Math.SQRT2 * K.pulseWidth(tau1) * Math.sqrt(1 + C * C);
    worst = Math.max(worst, Math.abs(c.shWidth / want - 1)); worstT = Math.max(worstT, Math.abs(c.shDuration / (tau1 / Math.SQRT2) - 1));
    info.push(`${tau1} fs C ${C}: ${f(c.shWidth, 2)} cm⁻¹ (√2·Δν₁ ${f(want, 2)}), ${f(c.shDuration, 2)} fs`);
  }
  check("3 thin crystal: Δν₂ = √2 Δν₁, τ₂ = τ₁/√2", worst < 2e-4 && worstT < 2e-3, `${info.join("; ")}; max relative error ${e(worst)} (width), ${e(worstT)} (duration)`);
}

// 4. long pulse: the full model reduces to Gaussian × sinc²(GVM·Ω·L/2), and a broad pulse to the sinc² FWHM 0.886/(c·GVM·L)
{
  const lam2 = 515, b = K.bboSHG(1030), info = []; let worst = 0;
  for (const [tau1, L] of [[260, 2], [260, 6], [150, 10]]) {
    const mm = K.model(lam2, tau1, 0, L), c = K.crystal(mm, etal(0.761, 172), L), thin = Math.SQRT2 * K.pulseWidth(tau1);
    const y = x => { const u = Math.PI * K.C_CM_FS * x * b.gvm * L, s = Math.abs(u) < 1e-9 ? 1 : Math.sin(u) / u; return Math.exp(-4 * Math.LN2 * x * x / (thin * thin)) * s * s; };
    let lo = 0, hi = thin; for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (y(mid) > 0.5) lo = mid; else hi = mid; }
    worst = Math.max(worst, Math.abs(c.shWidth / (lo + hi) - 1)); info.push(`${tau1} fs, ${L} mm: ${f(c.shWidth, 2)} vs ${f(lo + hi, 2)} cm⁻¹`);
  }
  const mm = K.model(515, 2000, 0, 10), c = K.crystal(mm, etal(0.95, 30), 10), sincW = 0.8859 / (K.C_CM_FS * b.gvm * 10), thin = Math.SQRT2 * K.pulseWidth(2000);
  check("4 first-order limit: Gaussian × sinc²", worst < 3e-3, `${info.join("; ")}; max relative difference ${e(worst)} (dispersion beyond first order); 2 ps, 10 mm: ${f(c.shWidth, 3)} cm⁻¹ with sinc² alone ${f(sincW, 3)} and the thin crystal ${f(thin, 3)}`);
}

// 5. time domain: the FFT result against the pulse train (1 − R) Σ R^j E₂(t − j t_rt) summed directly, for a thin
//    crystal (Gaussian, chirped or not) and a thick one (first-order SH = erf-smoothed flat top)
{
  let worst = 0; const info = [];
  for (const [tau1, C, R, fsr] of [[283, 0, 0.761, 172], [283, 1.5, 0.761, 172], [100, 0, 0.9, 400], [150, 2.5, 0.8, 300]]) {
    const mm = K.model(515, tau1, C, 0), sim = K.simulate(mm, etal(R, fsr), 0), a = 2 * Math.LN2 * (1 + 0 * C) / (tau1 * tau1 / 2);
    const field = t => { const env = Math.exp(-a * t * t), ph = -a * C * t * t; return [env * Math.cos(ph), env * Math.sin(ph)]; };   // E₂ ∝ exp(−2 ln2 (1 + iC) t²/τ₂²)
    let w = 0; for (let j = 0; j < sim.t.length; j += 3) w = Math.max(w, Math.abs(sim.IT[j] - trainIntensity(field, R, K.roundTrip(fsr), sim.t[j])));
    worst = Math.max(worst, w); info.push(`${tau1} fs C ${C}: ${e(w)}`);
  }
  // thick crystal, 1030 nm: E₂(t) ∝ erf(√α(t + T/2)) − erf(√α(t − T/2)), α = 4 ln2/τ₁²
  const tau1 = 260, L = 4, R = 0.761, fsr = 172, mm = K.model(515, tau1, 0, L), sim = K.simulate(mm, etal(R, fsr), L), T = mm.gvm * L, al = 4 * Math.LN2 / (tau1 * tau1);
  const E2 = t => erf(Math.sqrt(al) * (t + T / 2)) - erf(Math.sqrt(al) * (t - T / 2));
  let p = 0; for (const t of sim.t) p = Math.max(p, E2(t) ** 2);
  let wS = 0, wT = 0;
  for (let j = 0; j < sim.t.length; j += 3) { const t = sim.t[j]; wS = Math.max(wS, Math.abs(sim.ISH[j] - E2(t) ** 2 / p)); wT = Math.max(wT, Math.abs(sim.IT[j] - trainIntensity(s => [E2(s) / Math.sqrt(p), 0], R, K.roundTrip(fsr), t))); }
  check("5 pulse in time = pulse train summed directly", worst < 1e-7 && wS < 3e-3 && wT < 3e-3,
    `thin crystal, max |difference| of the transmitted intensity: ${info.join(", ")}; 4 mm crystal against the first-order flat top: SH ${e(wS)}, transmitted ${e(wT)} (the full model adds the crystal's group-velocity dispersion)`);
}

// 6. energies: the transmitted share equals the Fourier-series result for a Gaussian spectrum, and the pulse energies in
//    time equal the spectral ones (Parseval)
{
  let worst = 0, worstP = 0; const info = [];
  for (const [tau1, C, R, fsr] of [[283, 0, 0.761, 172], [283, 1.5, 0.761, 172], [100, 0, 0.9, 400], [400, 0, 0.5, 60]]) {
    const mm = K.model(515, tau1, C, 0), sim = K.simulate(mm, etal(R, fsr), 0), ref = fracT(R, fsr, Math.SQRT2 * K.pulseWidth(tau1) * Math.sqrt(1 + C * C));
    let sT = 0, sS = 0; for (let j = 0; j < sim.t.length; j++) { sT += sim.IT[j]; sS += sim.ISH[j]; }
    worst = Math.max(worst, Math.abs(sim.eT / sim.eSH - ref)); worstP = Math.max(worstP, Math.abs(sT / sS / (sim.eT / sim.eSH) - 1)); info.push(f(100 * ref, 2) + " %");
  }
  check("6 transmitted energy", worst < 1e-6 && worstP < 1e-12, `thin crystal against the Fourier series (${info.join(", ")}): max |difference| ${e(worst)}; time against spectrum ${e(worstP)}`);
}

// 7. ripple: for a Gaussian second harmonic the beat with the neighbouring peaks gives about ±4√S, S = exp[−4 ln2 (FSR/Δν₂)²];
//    a second harmonic much narrower than the FSR gives a flat tail
{
  const info = []; let worst = 0;
  for (const k of [1.5, 1.75, 2]) {
    const dnu2 = 150, tau1 = Math.SQRT2 * K.pulseWidth(dnu2), mm = K.model(515, tau1, 0, 0), c = K.crystal(mm, etal(0.9, k * dnu2), 0);
    const est = 4 * Math.sqrt(Math.exp(-4 * Math.LN2 * k * k)); worst = Math.max(worst, Math.abs(c.ripple / est - 1));
    info.push(`${k}×: ±${f(100 * c.ripple, 2)} % (estimate ±${f(100 * est, 2)} %)`);
  }
  const flat = K.crystal(K.model(515, Math.SQRT2 * K.pulseWidth(50), 0, 0), etal(0.9, 200), 0);
  check("7 ripple on the decay", worst < 0.15 && flat.ripple < 1e-4, `${info.join(", ")}; FSR = 4 Δν₂: ±${e(100 * flat.ripple)} %`);
}

// 8. bandwidth of the pulse: the etalon page's example (a 200 fs pulse into R 76.1 %, FSR 172 cm⁻¹; that page reads
//    14.637 cm⁻¹ and 99.954 % in one band off a sampled grid) against the half maximum of Gaussian × Airy found here by
//    bisection; the decay time of a high-finesse etalon is 1/(2πc·FWHM)
{
  const c = K.crystal(K.model(515, 200 * Math.SQRT2, 0, 0), etal(0.761, 172), 0), fw = K.etalonFwhm(0.97, 400), dec = K.decayTime(0.97, 400);
  const dnu = K.pulseWidth(200), y = x => Math.exp(-4 * Math.LN2 * x * x / (dnu * dnu)) * K.airyT(x, 0.761, 172);
  let lo = 0, hi = 86; for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (y(mid) > 0.5) lo = mid; else hi = mid; }
  check("8 pulse bandwidth and decay", Math.abs(c.outFwhm - (lo + hi)) < 1e-6 && Math.abs(c.outFwhm - 14.637) < 0.01 && Math.abs(c.share - 0.99954) < 1e-4 && Math.abs(dec * 2 * Math.PI * K.C_CM_FS * fw - 1) < 2e-3,
    `FWHM ${f(c.outFwhm, 4)} cm⁻¹ (Gaussian × Airy ${f(lo + hi, 4)}, etalon page 14.637), ${f(100 * c.share, 3)} % in one band (etalon page 99.954 %); R 97 %, FSR 400: decay ${f(dec, 1)} fs, 1/(2πc·FWHM) ${f(1 / (2 * Math.PI * K.C_CM_FS * fw), 1)} fs`);
}

// 9. etalon settings: R for a wanted FWHM, FSR for a wanted FWHM, and the menu
{
  const R = K.reflectanceFor(15, 172), fsr = K.fsrFor(15, R), a = K.etalonFor("r", 0.5, 172, 15), b = K.etalonFor("fsr", 0.761, 999, 15), c = K.etalonFor("given", 0.5, 99, 15);
  const ok = Math.abs(100 * R - 76.164) < 5e-4 && Math.abs(fsr - 172) < 1e-10 && Math.abs(K.etalonFwhm(a.R, a.fsr) - 15) < 1e-10 && Math.abs(K.etalonFwhm(b.R, b.fsr) - 15) < 1e-10
    && c.R === 0.5 && c.fsr === 99 && Number.isNaN(K.reflectanceFor(200, 172)) && Number.isNaN(K.fsrFor(15, 0.1));
  check("9 etalon for the wanted bandwidth", ok, `15 cm⁻¹ at FSR 172 → R ${f(100 * R, 3)} % (etalon page 76.164 %), back to FSR ${f(fsr, 10)}; R 76.1 % → FSR ${f(b.fsr, 2)} cm⁻¹; a peak wider than the FSR or R below 17.2 % has no solution`);
}

// 10. verdicts on the examples: which crystals give a single clean pulse
{
  const crit = want => ({ ripple: 0.05, tol: 0.1, rise: 1, want }), Ls = [0.1, 0.3, 0.5, 1, 2, 4];
  const run = (lam2, tau1, et, want) => { const mm = K.model(lam2, tau1, 0, 4), g = K.gridFor(mm, et, 4), tb = K.tables(mm, g); return Ls.map(L => { const c = K.crystal(mm, et, L, g, tb); return { L, c, v: K.judge(c, crit(want)) }; }); };
  const t0 = Date.now();
  const a = run(515, K.pulseWidth(K.nmToCm(7, 1030)), etal(0.761, 172), 15), b = run(515, K.pulseWidth(K.nmToCm(8, 1030)), etal(0.761, 172), 15);
  const c = run(400, 100, K.etalonFor("r", 0, 300, 10), 10), d = run(650, 150, K.etalonFor("fsr", 0.85, 0, 12), 12);
  const first = r => { const w = r.find(q => q.v.ok); return w ? w.L : "none"; }, ms = Date.now() - t0;
  const ok = first(a) === 0.1 && a.every(q => q.v.ok) && first(b) === 2 && b.slice(0, 4).every(q => !q.v.okRipple && q.v.okRise && q.v.okWidth)
    && first(c) === 0.5 && first(d) === 4 && ms < 4000;
  check("10 verdicts on the examples", ok, `515 nm, 7 nm fundamental: all work, thinnest ${first(a)} mm (ripple ±${f(100 * a[0].c.ripple, 2)} %); 8 nm: 0.1–1 mm fail on ripple (±${f(100 * b[0].c.ripple, 1)} % at 0.1 mm), thinnest ${first(b)} mm; ` +
    `400 nm, 100 fs, FSR 300: thinnest ${first(c)} mm (0.3 mm ±${f(100 * c[1].c.ripple, 1)} %); 650 nm, 150 fs, R 85 %: thinnest ${first(d)} mm (GVM only ${f(K.bboSHG(1300).gvm, 1)} fs/mm; ±${f(100 * d[4].c.ripple, 1)} % at 2 mm); 24 crystals in ${ms} ms`);
}

// 11. crystal list and scan lengths
{
  const p = K.parseLengths("1, 2;4  0.3mm, x, -1, 0.3,,"), s = K.scanLengths(0.05, 10, 40);
  const ok = JSON.stringify(p.list) === "[0.3,1,2,4]" && JSON.stringify(p.bad) === '["x","-1"]' && s.length === 40 && Math.abs(s[0] - 0.05) < 1e-15 && Math.abs(s[39] - 10) < 1e-12;
  check("11 crystal list", ok, `"1, 2;4  0.3mm, x, -1, 0.3,," → [${p.list.join(", ")}], not lengths: ${p.bad.join(", ")}; scan ${f(s[0], 2)} … ${f(s[39], 1)} mm in 40 steps`);
}

// 12. the page loads nothing from elsewhere
{
  const ext = [...html.matchAll(/<(script|link|img|iframe)\b[^>]*\s(src|href)="(https?:)?\/\/[^"]*"/g)].length + (html.match(/@import|fetch\(|XMLHttpRequest/g) || []).length;
  check("12 self-contained page", ext === 0, `${ext} external resources or network calls`);
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
