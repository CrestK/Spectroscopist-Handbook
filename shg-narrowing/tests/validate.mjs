// Checks the numerical core embedded in index.html (<script id="core">) against the refractiveindex.info database,
// textbook values, closed forms, a Python reference implementation of the same model, an independent time-domain
// formula and the split-step numbers the depletion flag was calibrated with.
//   node tests/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["C0", "EPS0", "LN2", "SINC2_HALF", "GVM_BW", "TBP", "SELLMEIER", "nO", "nE", "indices", "groupIndexO", "groupIndexE", "thetaPM",
  "phaseMatch", "walkoff", "pmLimit", "gvmZero", "widthUnits", "cmToHz", "nmToHz", "bwFromTau", "tauFromBw", "chirpedTau", "makeModel",
  "shFwhm", "fwhmCm", "shSpectrum", "shPulse", "gvmOnlyPulse", "ffExitPulse", "halfWidth", "trapz", "etalonT", "etalonFilter",
  "peakIntensity", "irisFraction", "etaPerIntensity", "depletionLevel", "walkLevel", "gvmOnlyFwhm", "analyse", "csvSpectrum", "csvPulse", "csvLength",
  "etalonR", "etalonField", "etalonDecay", "etalonTotal", "fft", "pulseFFT", "etalonPoint", "analyseEtalon", "csvEtSpectrum", "csvEtPulse", "csvBandwidth", "maxOf",
  "etalonTilt", "tiltForShift"];
// new Function keeps the core in this realm (Node's vm sandbox makes typed arrays much slower)
const core = new Function(m[1] + `\nreturn {${names.join(",")}};`)();
const t0 = Date.now();

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const f = (v, n) => Number(v.toPrecision(n || 5));
const DEG = 180 / Math.PI, C = core.C0, interp = (x, y, v) => { let a = 0, b = x.length - 1; if (v <= x[0]) return y[0]; if (v >= x[b]) return y[b]; while (b - a > 1) { const m = (a + b) >> 1; if (x[m] <= v) a = m; else b = m; } return y[a] + (y[b] - y[a]) * (v - x[a]) / (x[b] - x[a]); };
const toCm = w => w / (2 * Math.PI * 100 * C);
const model = (lf, tauFs, Lmm, gddFs2 = 0, set = "kato", res = 1) => core.makeModel({ set, lf, tauFs, Lmm, gddFs2, res });
const fwhm = (lf, tauFs, Lmm, gddFs2 = 0, set = "kato", res = 1) => toCm(core.shFwhm(model(lf, tauFs, Lmm, gddFs2, set, res)).fwhm);

// 1. Sellmeier coefficients. Eimerl and Tamošauskas: the coefficient lines of the refractiveindex.info database files
//    (main/BaB2O4/nk/*.yml), evaluated with the database's own formula definitions. Kato: the equations as printed in
//    vendor data sheets.
{
  const DB = { // formula 4: n² = C1 + C2 λ^C3/(λ² − C4^C5) + C6 λ^C7/(λ² − C8^C9) + C10 λ^C11 + …; formula 2: n² = 1 + C1 + Σ Ci λ²/(λ² − Ci+1)
    eimerl: { o: [4, "2.7405 0.0184 0 0.0179 1 0 0 0 1 -0.0155 2"], e: [4, "2.3730 0.0128 0 0.0156 1 0 0 0 1 -0.0044 2"] },
    tamosauskas: { o: [2, "0 0.90291 0.003926 0.83155 0.018786 0.76536 60.01"], e: [2, "0 1.151075 0.007142 0.21803 0.02259 0.656 263"] },
    kato: { o: [4, "2.7359 0.01878 0 0.01822 1 0 0 0 1 -0.01354 2"], e: [4, "2.3753 0.01224 0 0.01667 1 0 0 0 1 -0.01516 2"] },
  };
  const formula = ([type, s], l) => {
    const c = s.split(" ").map(Number);
    if (type === 2) { let n2 = 1 + c[0]; for (let i = 1; i < c.length; i += 2) n2 += c[i] * l * l / (l * l - c[i + 1]); return Math.sqrt(n2); }
    let n2 = c[0] + c[1] * l ** c[2] / (l * l - c[3] ** c[4]) + c[5] * l ** c[6] / (l * l - c[7] ** c[8]);
    for (let i = 9; i < c.length; i += 2) n2 += c[i] * l ** c[i + 1];
    return Math.sqrt(n2);
  };
  let worst = 0;
  for (const set of Object.keys(DB)) for (let l = 0.2; l <= 2.6; l += 0.05) {
    worst = Math.max(worst, Math.abs(core.nO(set, l) - formula(DB[set].o, l)), Math.abs(core.nE(set, l, Math.PI / 2) - formula(DB[set].e, l)));
  }
  check("1 Sellmeier indices = database / data-sheet equations, 0.2–2.6 µm", worst < 1e-12, `max |Δn| ${worst.toExponential(1)}`);
}

// 2. analytic group index against a central difference (h = 1e-4 µm), ordinary and extraordinary at 25°
{
  let worst = 0;
  const h = 1e-5, th = 25 / DEG;
  for (const set of Object.keys(core.SELLMEIER)) for (let l = 0.25; l <= 2; l += 0.05) {
    const go = core.nO(set, l) - l * (core.nO(set, l + h) - core.nO(set, l - h)) / (2 * h);
    const ge = core.nE(set, l, th) - l * (core.nE(set, l + h, th) - core.nE(set, l - h, th)) / (2 * h);
    worst = Math.max(worst, Math.abs(core.groupIndexO(set, l) - go), Math.abs(core.groupIndexE(set, l, th) - ge));
  }
  check("2 analytic group index = central difference (h = 1e-5 µm)", worst < 1e-8, `max |Δn_g| ${worst.toExponential(1)}`);
}

// 3. phase-matching angle and GVM (Kato) against a NumPy reference (central differences, h = 1e-4 µm), and textbook angles
{
  const ref = [[0.66, 36.01, 320.3], [0.8, 29.18, 193.8], [1.03, 23.32, 94.8], [1.11, 22.15, 73.6], [1.3, 20.46, 35.5]];
  let dth = 0, dg = 0;
  const got = [];
  for (const [lf, th, g] of ref) { const p = core.phaseMatch("kato", lf); dth = Math.max(dth, Math.abs(p.th * DEG - th)); dg = Math.max(dg, rel(p.gvmFsMm, g)); got.push(`${lf * 1000}: ${(p.th * DEG).toFixed(2)}°, ${p.gvmFsMm.toFixed(1)}`); }
  check("3a θ_pm and GVM at 660–1300 nm = NumPy reference (Kato)", dth < 0.006 && dg < 0.005, `${got.join("; ")} fs/mm; max Δθ ${dth.toFixed(4)}°, max GVM ${(100 * dg).toFixed(2)} %`);
  const t1064 = core.thetaPM("kato", 1.064) * DEG, t800 = core.thetaPM("kato", 0.8) * DEG, g800 = core.phaseMatch("kato", 0.8).gvmFsMm;
  check("3b textbook: 1064 nm → 22.8°, 800 nm → 29.2° and 190–195 fs/mm", Math.abs(t1064 - 22.8) < 0.05 && Math.abs(t800 - 29.2) < 0.05 && g800 > 190 && g800 < 195,
    `${t1064.toFixed(3)}°, ${t800.toFixed(3)}°, ${g800.toFixed(1)} fs/mm`);
  let worst = 0;
  for (const set of Object.keys(core.SELLMEIER)) for (let l = 0.45; l <= 2; l += 0.05) {
    const th = core.thetaPM(set, l), d = Math.abs(core.nE(set, l / 2, th) - core.nO(set, l));
    if (Number.isFinite(th)) worst = Math.max(worst, d);
  }
  const lim = core.pmLimit("kato") * 1000;
  check("3c n_e(θ_pm, λ/2) = n_o(λ); no phase matching below 409.5 nm", worst < 1e-12 && core.phaseMatch("kato", 0.405) === null && Math.abs(lim - 409.53) < 0.05,
    `max |Δn| ${worst.toExponential(1)}; limit ${lim.toFixed(2)} nm (Eimerl ${(core.pmLimit("eimerl") * 1000).toFixed(2)}, Tamošauskas ${(core.pmLimit("tamosauskas") * 1000).toFixed(2)})`);
}

// 4. the three Sellmeier sets against the NumPy reference; Kato and Tamošauskas agree within about 3 %
{
  const lams = [0.66, 0.8, 1.03, 1.11, 1.3], g = set => lams.map(l => core.phaseMatch(set, l).gvmFsMm);
  const k = g("kato"), e = g("eimerl"), t = g("tamosauskas");
  const eRef = [315.5, 188.7, 88.8, 67.1, 27.6], tRef = [315.3, 192.6, 94.8, 73.4, 34.5];
  const de = Math.max(...e.map((v, i) => rel(v, eRef[i]))), dt = Math.max(...t.map((v, i) => rel(v, tRef[i])));
  check("4a GVM, Eimerl and Tamošauskas = NumPy reference", de < 0.005 && dt < 0.005, `Eimerl ${e.map(v => v.toFixed(1)).join(", ")}; Tamošauskas ${t.map(v => v.toFixed(1)).join(", ")} fs/mm`);
  const kt = Math.max(...k.map((v, i) => rel(v, t[i]))), ke = Math.max(...k.slice(0, 3).map((v, i) => rel(e[i], v)));
  check("4b Kato vs Tamošauskas within 3.1 % at 660–1300 nm; Eimerl vs Kato within 7 % to 1030 nm, then −9 % and −22 %",
    kt < 0.032 && ke < 0.07 && Math.abs(e[3] / k[3] - 1 + 0.088) < 0.01 && Math.abs(e[4] / k[4] - 1 + 0.222) < 0.01,
    `Kato/Tam max ${(100 * kt).toFixed(1)} %; Eimerl/Kato ${e.map((v, i) => (100 * (v / k[i] - 1)).toFixed(1)).join(", ")} %`);
  const z = Object.keys(core.SELLMEIER).map(s => core.gvmZero(s) * 1000), g1500 = Object.keys(core.SELLMEIER).map(s => core.phaseMatch(s, 1.5).gvmFsMm);
  check("4c GVM = 0 at 1541 / 1471 / 1518 nm; |GVM| < 6 fs/mm at 1500 nm (not 90, Pontecorvo 2013)",
    Math.abs(z[0] - 1541.1) < 0.5 && Math.abs(z[1] - 1470.5) < 0.5 && Math.abs(z[2] - 1517.7) < 0.5 && g1500.every(v => Math.abs(v) < 6),
    `${z.map(v => v.toFixed(1)).join(", ")} nm; at 1500 nm ${g1500.map(v => v.toFixed(1)).join(", ")} fs/mm`);
}

// 5. spatial walk-off at the SH
{
  const r = [0.8, 1.03, 1.11, 1.064].map(l => core.phaseMatch("kato", l).rho * 1e3);
  check("5 walk-off: 67.8, 56.8, 54.3 mrad at 800, 1030, 1110 nm; 55.6 at 1064 nm (vendor ≈ 56)",
    Math.abs(r[0] - 67.8) < 0.06 && Math.abs(r[1] - 56.8) < 0.06 && Math.abs(r[2] - 54.3) < 0.06 && Math.abs(r[3] - 56) < 0.6, r.map(v => v.toFixed(2)).join(", "));
}

// 6. simple formula: sinc²(1.39156) = ½ and 0.886/GDM at 25 mm
{
  const x = core.SINC2_HALF, s = (Math.sin(x) / x) ** 2;
  const ref = [[0.66, 3.69], [0.8, 6.10], [1.03, 12.46], [1.11, 16.06], [1.3, 33.29]];
  const got = ref.map(([l]) => core.widthUnits(core.GVM_BW / (0.025 * Math.abs(core.phaseMatch("kato", l).delta)), l / 2).cm);
  const d = Math.max(...got.map((v, i) => rel(v, ref[i][1])));
  check("6 sinc²(1.39156) = ½; 0.886/GDM at 25 mm = 3.69, 6.10, 12.46, 16.06, 33.29 cm⁻¹", Math.abs(s - 0.5) < 1e-14 && Math.abs(core.GVM_BW - 0.88589) < 1e-5 && d < 0.005,
    `${got.map(v => v.toFixed(2)).join(", ")} cm⁻¹; GVM_BW ${core.GVM_BW.toFixed(6)}`);
}

// 7. units: 1 nm at 555 nm ↔ cm⁻¹ ↔ GHz round trip; 200 fs ↔ 73.6 cm⁻¹
{
  const hz = core.nmToHz(1, 0.555), w = core.widthUnits(hz, 0.555), back = core.widthUnits(core.cmToHz(w.cm), 0.555).nm, tau = core.tauFromBw(core.bwFromTau(200));
  const ff = core.widthUnits(core.bwFromTau(200), 1.11);
  check("7 1 nm at 555 nm = 32.47 cm⁻¹ = 973.4 GHz and back; 200 fs = 73.60 cm⁻¹ = 9.068 nm at 1110 nm",
    Math.abs(back - 1) < 1e-12 && Math.abs(w.cm - 1e7 / 555 ** 2) < 1e-9 && Math.abs(tau - 200) < 1e-9 && Math.abs(ff.cm - 73.596) < 0.001,
    `${w.cm.toFixed(4)} cm⁻¹, ${w.ghz.toFixed(2)} GHz, back ${back}; ${ff.cm.toFixed(3)} cm⁻¹, ${ff.nm.toFixed(3)} nm`);
}

// 8. full model, 1110 nm and 200 fs: thin-crystal limit and the 2, 7 and 25 mm crystals
//    NumPy reference of the same model (direct Ω₁ grid, converged, Δν = 0.4413/τ): 104.07, 92.94, 50.55, 15.88 cm⁻¹;
//    earlier NumPy run (Δν = 0.441/τ, coarser grid): 104.0, 92.9, 50.6, 15.9; split-step at low intensity: 92.95, 50.59, 15.96.
{
  const ff = core.widthUnits(core.bwFromTau(200), 1.11).cm, thin = fwhm(1.11, 200, 0.05);
  check("8a L = 0.05 mm: SH = √2 × FF (104.08 cm⁻¹)", rel(thin, Math.SQRT2 * ff) < 2e-4, `${thin.toFixed(3)} vs ${(Math.SQRT2 * ff).toFixed(3)}`);
  const got = [2, 7, 25].map(L => fwhm(1.11, 200, L)), py = [92.94, 50.55, 15.88], hand = [92.9, 50.6, 15.9], ss = [92.95, 50.59, 15.96];
  const dpy = Math.max(...got.map((v, i) => rel(v, py[i]))), dh = Math.max(...got.map((v, i) => rel(v, hand[i]))), ds = Math.max(...got.map((v, i) => rel(v, ss[i])));
  check("8b 2, 7, 25 mm = NumPy reference (0.1 %), earlier run (1 %), split-step low intensity (0.6 %)", dpy < 0.001 && dh < 0.01 && ds < 0.006,
    `${got.map(v => v.toFixed(3)).join(", ")} cm⁻¹; max ${(100 * dpy).toFixed(3)} / ${(100 * dh).toFixed(2)} / ${(100 * ds).toFixed(2)} %`);
  const m25 = model(1.11, 200, 25), go = toCm(core.gvmOnlyFwhm(m25)), simple = core.widthUnits(core.GVM_BW / m25.gdm, 0.555).cm;
  check("8c 25 mm: full model = GVM-only sinc² × FF spectrum (FF dispersion negligible at 200 fs), 1 % below 0.886/GDM",
    rel(got[2], go) < 0.001 && got[2] < simple && rel(got[2], simple) < 0.015, `${got[2].toFixed(3)} vs ${go.toFixed(3)} vs ${simple.toFixed(3)} cm⁻¹`);
}

// 9. full model, 800 nm and 35 fs (FF 420 cm⁻¹): FF dispersion shows
//    NumPy reference: 584.46 cm⁻¹ at 0.05 mm (below √2 × 420.6 = 594.8 from the FF acceptance in 50 µm), 6.168 cm⁻¹ at
//    25 mm on a grid fine enough to resolve it (an earlier 6.37 came from a grid with 1.8 cm⁻¹ steps)
{
  const a = fwhm(0.8, 35, 0.05), b = fwhm(0.8, 35, 25), simple = core.widthUnits(core.GVM_BW / model(0.8, 35, 25).gdm, 0.4).cm;
  check("9 800 nm, 35 fs: 584.5 cm⁻¹ at 0.05 mm, 6.168 cm⁻¹ at 25 mm, above 0.886/GDM = 6.10", rel(a, 584.46) < 0.001 && rel(b, 6.168) < 0.002 && b > simple,
    `${a.toFixed(2)}, ${b.toFixed(4)} cm⁻¹, simple ${simple.toFixed(3)}`);
}

// 10. grid convergence: twice as fine inner and outer grids change the FWHM by < 0.1 %
{
  const cases = [[0.8, 35, 25, 0], [0.8, 35, 25, -1000], [1.11, 200, 7, 0], [1.5, 200, 25, 0], [1.11, 200, 25, 20000]];
  const d = cases.map(c => rel(fwhm(...c, "kato", 2), fwhm(...c)));
  check("10 FWHM converged: res × 2 changes it by < 0.1 %", Math.max(...d) < 0.001, d.map(v => (100 * v).toFixed(4) + " %").join(", "));
}

// 11. FWHM falls monotonically with L (34 lengths, 0.1–30 mm)
{
  const Ls = Array.from({ length: 34 }, (_, i) => 0.1 * Math.pow(300, i / 33));
  let ok = true, out = [];
  for (const [lf, tau] of [[1.11, 200], [0.8, 35], [1.3, 200]]) { const w = Ls.map(L => fwhm(lf, tau, L)); ok = ok && w.every((v, i) => i === 0 || v < w[i - 1]); out.push(`${lf * 1000} nm ${tau} fs: ${w[0].toFixed(1)} → ${w[w.length - 1].toFixed(2)}`); }
  check("11 FWHM decreases monotonically with L", ok, out.join("; ") + " cm⁻¹");
}

// 12. chirp: no effect without a phase-matching filter (thin crystal); an effect only through the FF dispersion in a long crystal
{
  const th = [0, 5000, -5000].map(g => fwhm(1.11, 200, 0.05, g)), lg = [-1000, 0].map(g => fwhm(0.8, 35, 25, g)), c200 = [-20000, 0, 20000].map(g => fwhm(1.11, 200, 25, g));
  const dth = Math.max(...th.map(v => rel(v, th[0]))), d200 = Math.max(...c200.map(v => rel(v, c200[1])));
  check("12 GDD ±5000 fs², 0.05 mm: same FWHM; 800/35 fs/25 mm: −1000 fs² broadens 6.17 → 6.51; 1110/200 fs/25 mm: ±20000 fs² < 0.01 %",
    dth < 1e-6 && rel(lg[0], 6.515) < 0.003 && lg[0] > 1.05 * lg[1] && d200 < 1e-4,
    `thin ${dth.toExponential(1)}; ${lg.map(v => v.toFixed(3)).join(" vs ")} cm⁻¹; 200 fs ${(100 * d200).toFixed(4)} %`);
}

// 13. absolute undepleted efficiency per unit intensity (d_eff = 2 pm/V)
{
  const eta = (lf, tau, L, d = 2) => { const mm = model(lf, tau, L), fw = core.shFwhm(mm), sp = core.shSpectrum(mm, fw); return core.etaPerIntensity(mm, sp.integral, d); };
  const got = [2, 7, 25].map(L => eta(1.11, 200, L)), ref = [5.38e-10, 3.52e-9, 1.46e-8];
  const d = Math.max(...got.map((v, i) => rel(v, ref[i])));
  check("13a η_peak/I₀ at 2, 7, 25 mm = split-step low-intensity limit (1 %)", d < 0.01, `${got.map(v => v.toExponential(3)).join(", ")} per W/cm²`);
  // thin crystal: η = κ²A₀²L²/√2 with κ = 2ω d/(nc), A₀² = I/(2nε₀c)
  const mm = model(1.11, 200, 0.05), n = mm.pm.nF, kap = 2 * mm.w0 * 2e-12 / (n * C), closed = kap * kap * 1e4 / (2 * n * core.EPS0 * C) * (0.05e-3) ** 2 / Math.SQRT2;
  const thin = eta(1.11, 200, 0.05), sc = eta(1.11, 200, 7, 3) / got[1];
  check("13b thin crystal = κ²A₀²L²/√2 (textbook η × 1/√2); η ∝ d_eff²", rel(thin, closed) < 2e-3 && Math.abs(sc - 2.25) < 1e-9, `${thin.toExponential(4)} vs ${closed.toExponential(4)}; (3/2)² → ${sc.toFixed(6)}`);
  // GVM-only time domain: A₂(t) = iκ ∫₀ᴸ A₁²(t − δz) dz = iκ A₀² √(π/8a)/|δ| [erf(√(2a) t) − erf(√(2a)(t − |δ|L))]
  const erf = x => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.5 * a); return s * (1 - t * Math.exp(-a * a - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))); };
  const pm = core.phaseMatch("kato", 1.11), dl = Math.abs(pm.delta), a = 2 * core.LN2 / (200e-15) ** 2, k2 = (2 * (2 * Math.PI * C / 1.11e-6) * 2e-12 / (pm.nF * C)) ** 2, A2 = 1e4 / (2 * pm.nF * core.EPS0 * C);
  const td = [2, 7, 25].map(L => {
    const Lm = L * 1e-3, N = 40001, t1 = -3e-12, t2 = 3e-12 + dl * Lm, dt = (t2 - t1) / (N - 1);
    let s = 0;
    for (let i = 0; i < N; i++) { const t = t1 + i * dt, v = Math.sqrt(Math.PI / (8 * a)) / dl * (erf(Math.sqrt(2 * a) * t) - erf(Math.sqrt(2 * a) * (t - dl * Lm))); s += v * v * dt; }
    return k2 * A2 * s / Math.sqrt(Math.PI / (2 * a));
  });
  const dtd = Math.max(...got.map((v, i) => rel(v, td[i])));
  check("13c = GVM-only time-domain formula (erf) to 0.3 %", dtd < 0.003, `${td.map(v => v.toExponential(4)).join(", ")}; max ${(100 * dtd).toFixed(3)} %`);
}

// 14. peak intensity, iris and the flags
{
  const I = core.peakIntensity(2, 200, 2), iris = core.irisFraction(2, 2);
  check("14a 2 µJ, 200 fs, 2 mm → I₀ = 2.07 × 10⁸ W/cm²; iris at D = d passes exactly ½", rel(I, 2.0727e8) < 1e-4 && Math.abs(iris - 0.5) < 1e-15, `${I.toExponential(5)} W/cm², ${iris}`);
  // split-step table: (L, I₀, undepleted η_peak); our η_peak = (η/I₀)·I₀ should match, and the flag follow η_beam = η_peak/2
  const rows = [[2, 5.4e8, 0.29], [2, 3.0e9, 1.6], [7, 9.7e7, 0.34], [7, 5.4e8, 1.9], [7, 3.0e9, 10.6], [25, 1.7e7, 0.25], [25, 9.7e7, 1.4], [25, 5.4e8, 7.9], [25, 3.0e9, 44]];
  const per = { 2: 5.3833e-10, 7: 3.5183e-9, 25: 1.4623e-8 };
  const bad = rows.filter(([L, I0, e]) => rel(per[L] * I0, e) > 0.06);
  const lv = [0.05, 0.1, 0.99, 1, 9.99, 10, 22].map(core.depletionLevel).join(""), wl = [0.4, 0.5, 0.51, 1, 1.01].map(v => core.walkLevel(v, 1)).join("");
  check("14b undepleted η_peak of the split-step table reproduced (to its 2 digits); flag levels at 0.1, 1, 10; walk-off at w/2 and w",
    bad.length === 0 && lv === "0112233" && wl === "00112", `${rows.map(([L, I0]) => (per[L] * I0).toFixed(2)).join(", ")}; levels ${lv}, walk ${wl}`);
}

// 15. the SH pulse in time
{
  const pulse = (lf, tau, L, g = 0) => { const mm = model(lf, tau, L, g), fw = core.shFwhm(mm), sp = core.shSpectrum(mm, fw); return { mm, sp, p: core.shPulse(sp, 801) }; };
  const thin = pulse(1.11, 200, 0.05), long = pulse(1.11, 200, 25), mid = pulse(1.11, 200, 7), c35 = pulse(0.8, 35, 25), ch = pulse(1.11, 200, 0.05, 20000);
  const tw = r => r.p.fw.fwhm * 1e15;
  check("15a thin crystal: SH pulse = τ/√2 = 141.4 fs; with 20000 fs² chirp, τ_chirped/√2", rel(tw(thin), 200 / Math.SQRT2) < 2e-3 && rel(tw(ch), core.chirpedTau(200, 20000) / Math.SQRT2) < 5e-3,
    `${tw(thin).toFixed(2)} fs; ${tw(ch).toFixed(1)} vs ${(core.chirpedTau(200, 20000) / Math.SQRT2).toFixed(1)} fs`);
  const gw = r => core.halfWidth(r.p.t, core.gvmOnlyPulse(r.mm, r.p.t)).fwhm * 1e15;
  check("15b 7 and 25 mm: full model = GVM-only pulse (0.3 %); 25 mm flat top between 0.9 and 1.0 GDM",
    rel(tw(mid), gw(mid)) < 0.003 && rel(tw(long), gw(long)) < 0.003 && tw(long) > 0.9 * long.mm.gdm * 1e15 && tw(long) < long.mm.gdm * 1e15,
    `${tw(mid).toFixed(1)} vs ${gw(mid).toFixed(1)} fs; ${tw(long).toFixed(1)} vs ${gw(long).toFixed(1)} fs, GDM ${(long.mm.gdm * 1e15).toFixed(1)} fs`);
  // the GVM-only pulse against the closed form [erf(√(2a)(t + G/2)) − erf(√(2a)(t − G/2))]² (transform limit)
  const erf = x => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.5 * a); return s * (1 - t * Math.exp(-a * a - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))); };
  const a = 2 * core.LN2 / (200e-15) ** 2, G = long.mm.gdm, cf = long.p.t.map(t => (erf(Math.sqrt(2 * a) * (t + G / 2)) - erf(Math.sqrt(2 * a) * (t - G / 2))) ** 2);
  const go = core.gvmOnlyPulse(long.mm, long.p.t), gmax = Math.max(...go), cmax = Math.max(...cf);
  let worst = 0; for (let i = 0; i < cf.length; i++) worst = Math.max(worst, Math.abs(go[i] / gmax - cf[i] / cmax));
  check("15c GVM-only pulse = erf closed form", worst < 2e-4, `max diff ${worst.toExponential(1)} of the peak`);
  const pars = [thin, long, c35].map(r => core.trapz(r.p.t, r.p.I) / (2 * Math.PI * r.sp.integral));
  check("15d Parseval: ∫|E(t)|²dt = 2π∫|E(Ω)|²dΩ (window holds the whole pulse)", pars.every(v => Math.abs(v - 1) < 1e-3), pars.map(v => v.toFixed(6)).join(", "));
  const fine = (() => { const mm = model(0.8, 35, 25, 0, "kato", 2), fw = core.shFwhm(mm); return core.shPulse(core.shSpectrum(mm, fw), 3201); })();
  const pk = Math.max(...c35.p.I), pkf = Math.max(...fine.I), If = Float64Array.from(fine.I, v => v / pkf);
  let dd = 0; for (let i = 0; i < c35.p.t.length; i++) dd = Math.max(dd, Math.abs(c35.p.I[i] / pk - interp(fine.t, If, c35.p.t[i])));
  check("15e 800 nm, 35 fs, 25 mm: pulse shape and its ripples converged (grids × 2, time steps ÷ 4)", dd < 2e-3 && rel(tw(c35), fine.fw.fwhm * 1e15) < 3e-3,
    `max diff ${dd.toExponential(1)} of the peak; FWHM ${tw(c35).toFixed(1)} vs ${(fine.fw.fwhm * 1e15).toFixed(1)} fs`);
  const ffx = core.ffExitPulse(long.mm, long.p.t), ip = ffx.indexOf(Math.max(...ffx));
  check("15f FF leaves at δL/2 = −GDM/2", Math.abs(long.p.t[ip] + G / 2) < 2 * (long.p.t[1] - long.p.t[0]), `${(long.p.t[ip] * 1e12).toFixed(4)} ps vs ${(-G / 2 * 1e12).toFixed(4)} ps`);
}

// 16. etalon: Airy transmission and the filtered spectrum
{
  const T = core.etalonT, F = 1 / Math.sin(Math.PI * 15 / (2 * 172)) ** 2;
  check("16a T = 1 on the orders, ½ at ± line width/2", Math.abs(T(0, 172, 15) - 1) < 1e-15 && Math.abs(T(172, 172, 15) - 1) < 1e-12 && Math.abs(T(7.5, 172, 15) - 0.5) < 1e-12 && Math.abs(T(-7.5, 172, 15) - 0.5) < 1e-12);
  // a flat spectrum over 20 orders passes 1/√(1 + F) of its energy; a spectrum much narrower than the line passes all of it
  const nu = Float64Array.from({ length: 2001 }, (_, i) => -1720 + 3440 * i / 2000), flat = new Float64Array(2001).fill(1);
  const ef = core.etalonFilter(nu, flat, 0, 172, 15);
  // a 10 cm⁻¹ Gaussian against direct quadrature of T × S on a fine grid
  const g = v => Math.exp(-4 * Math.LN2 * v * v / 100), nf = Float64Array.from({ length: 4001 }, (_, i) => -200 + 400 * i / 4000), eg = core.etalonFilter(nf, Float64Array.from(nf, g), 0, 172, 15);
  let num = 0, den = 0; for (let i = 0; i <= 400000; i++) { const v = -200 + 400 * i / 400000, w = (i === 0 || i === 400000 ? 0.5 : 1); num += w * g(v) * T(v, 172, 15); den += w * g(v); }
  check("16b flat spectrum: fraction 1/√(1 + F), line FWHM 15; 10 cm⁻¹ Gaussian: fraction = direct quadrature", rel(ef.fraction, 1 / Math.sqrt(1 + F)) < 2e-3 && rel(ef.fwhm, 15) < 2e-3 && rel(eg.fraction, num / den) < 1e-4,
    `${ef.fraction.toFixed(5)} vs ${(1 / Math.sqrt(1 + F)).toFixed(5)}, FWHM ${ef.fwhm.toFixed(3)}; ${eg.fraction.toFixed(5)} vs ${(num / den).toFixed(5)}`);
}

// 17. the page's analysis, its files, and a wavelength without phase matching
{
  const p = { set: "kato", lfNm: 1110, Lmm: 25, cut: 21.1, tauFs: 200, gddFs2: 0, fsr: 172, lw: 15, Euj: 2, dMm: 2, deff: 2 };
  const t1 = Date.now(), r = core.analyse(p), ms = Date.now() - t1;
  const tilt = Math.asin(r.pm.nF * Math.sin(r.pm.th - 21.1 / DEG)) * DEG;
  check("17a default case: 15.88 cm⁻¹, θ_pm 22.15°, tilt 1.73°, η_beam 1.52 (strong depletion), walk-off 1.36 mm (noticeable)",
    rel(r.widths.full.cm, 15.881) < 1e-3 && Math.abs(r.thetaDeg - 22.148) < 0.002 && Math.abs(r.tiltDeg - tilt) < 1e-12 && Math.abs(r.tiltDeg - 1.733) < 0.002 &&
    rel(r.etaBeam, 1.5155) < 0.005 && r.depletionLevel === 2 && Math.abs(r.walkMm - 1.358) < 0.002 && r.walkLevel === 1 && r.outside.join() === "FF",
    `${r.widths.full.cm.toFixed(3)} cm⁻¹, ${r.thetaDeg.toFixed(3)}°, ${r.tiltDeg.toFixed(3)}°, η_beam ${r.etaBeam.toFixed(4)}, ${r.walkMm.toFixed(3)} mm (${ms} ms)`);
  const csv = core.csvSpectrum(r).trim().split("\n"), data = csv.filter(l => !l.startsWith("#")), head = data[0].split(",");
  const rows = data.slice(1).map(l => l.split(",").map(Number)), peak = Math.max(...rows.map(x => x[2]));
  const pc = core.csvPulse(r).trim().split("\n").filter(l => !l.startsWith("#")), lc = core.csvLength(r, [{ Lmm: 2, full: 92.95 }, { Lmm: 25, full: 15.88 }]).trim().split("\n").filter(l => !l.startsWith("#"));
  check("17b CSV files: header, 7 / 5 / 6 numeric columns, spectrum peak 1",
    head.length === 7 && rows.every(x => x.length === 7 && x.every(Number.isFinite)) && Math.abs(peak - 1) < 1e-6 && pc.length === 1202 && pc.slice(1).every(l => l.split(",").length === 5) && lc.length === 3 && lc[2].split(",").length === 6,
    `${rows.length} spectrum rows, ${pc.length - 1} pulse rows`);
  const bad = core.analyse(Object.assign({}, p, { lfNm: 405 }));
  check("17c 405 nm FF: no phase matching reported with the 409.5 nm limit", bad.ok === false && Math.abs(bad.limitNm - 409.53) < 0.05, `ok ${bad.ok}, limit ${bad.limitNm.toFixed(2)} nm`);
}

// 18. no BBO: a Gaussian pulse straight onto the etalon
{
  const fsr = 172, lw = 15, R = core.etalonR(fsr, lw), F = 4 * R / (1 - R) ** 2;
  let worst = 0;
  for (let d = -400; d <= 400; d += 0.37) { const [tr, ti] = core.etalonField(d, fsr, R); worst = Math.max(worst, Math.abs(tr * tr + ti * ti - core.etalonT(d, fsr, lw))); }
  const t0 = core.etalonField(0, fsr, R), dec = core.etalonDecay(fsr, R), lor = 1 / (2 * Math.PI * core.cmToHz(lw));
  check("18a etalon: F = 4R/(1 − R)² = 1/sin²(π·lw/2FSR); |t|² = T; t = 1 on an order; decay 1/(2·FSR·|ln R|) ≈ 1/(2π·lw)",
    Math.abs(F - 1 / Math.sin(Math.PI * lw / (2 * fsr)) ** 2) < 1e-9 && worst < 1e-12 && Math.abs(t0[0] - 1) < 1e-15 && Math.abs(t0[1]) < 1e-15 && rel(dec, lor) < 0.01,
    `R ${R.toFixed(5)}; max ||t|² − T| ${worst.toExponential(1)}; decay ${(dec * 1e15).toFixed(1)} fs vs ${(lor * 1e15).toFixed(1)} fs`);
  // all orders: the Fourier series against quadrature over ±40 FSR; a flat spectrum gives (1 − R)/(1 + R)
  const quad = sig => { let n = 0, d = 0; const h = 0.01; for (let x = -40 * fsr; x <= 40 * fsr; x += h) { const g = Math.exp(-x * x / (2 * sig * sig)); n += g * core.etalonT(x, fsr, lw); d += g; } return n / d; };
  const sigs = [5, 30, 100, 300], dq = sigs.map(sg => Math.abs(core.etalonTotal(sg, fsr, R) - quad(sg)));
  check("18b energy through all orders = quadrature (σ = 5, 30, 100, 300 cm⁻¹); flat limit (1 − R)/(1 + R)", Math.max(...dq) < 1e-6 && rel(core.etalonTotal(1e5, fsr, R), (1 - R) / (1 + R)) < 1e-9,
    `${sigs.map(sg => core.etalonTotal(sg, fsr, R).toFixed(5)).join(", ")}; max diff ${Math.max(...dq).toExponential(1)}`);
  // FFT against a direct DFT (seeded test vector)
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
  const N = 256, xr = Float64Array.from({ length: N }, rnd), xi = Float64Array.from({ length: N }, rnd), yr = xr.slice(), yi = xi.slice();
  core.fft(yr, yi);
  let df = 0;
  for (let k = 0; k < N; k++) { let sr = 0, si = 0; for (let j = 0; j < N; j++) { const a = -2 * Math.PI * j * k / N; sr += xr[j] * Math.cos(a) - xi[j] * Math.sin(a); si += xr[j] * Math.sin(a) + xi[j] * Math.cos(a); } df = Math.max(df, Math.hypot(sr - yr[k], si - yi[k])); }
  check("18c FFT = direct DFT (N = 256)", df < 1e-11, `max |diff| ${df.toExponential(1)}`);
  // narrow input (1 cm⁻¹ ≪ 15 cm⁻¹ line): passes almost unchanged; energy = quadrature of S·T
  const tau1 = core.tauFromBw(core.cmToHz(1)), n1 = core.etalonPoint({ tauFs: tau1, gddFs2: 0, fsr, lw }), q1 = (() => { const sg = 1 / 2.3548200450309493; let n = 0, d = 0; for (let x = -10; x <= 10; x += 1e-4) { const g = Math.exp(-x * x / (2 * sg * sg)); n += g * core.etalonT(x, fsr, lw); d += g; } return n / d; })();
  check("18d 1 cm⁻¹ input: FWHM, pulse and energy through one order nearly unchanged (= quadrature)", rel(n1.fwhmCm, 1) < 0.005 && rel(n1.tauOutFs, tau1) < 0.005 && Math.abs(n1.central - q1) < 1e-5,
    `${n1.fwhmCm.toFixed(4)} cm⁻¹, ${n1.tauOutFs.toFixed(0)} vs ${tau1.toFixed(0)} fs, ${n1.central.toFixed(5)} vs ${q1.toFixed(5)}`);
  // broad input inside one order (300 cm⁻¹, FSR 1000): line width out, exponential tail with the decay time, FWHM ≈ τ ln 2
  const tb = core.tauFromBw(core.cmToHz(300)), Rb = core.etalonR(1000, lw), b = core.analyseEtalon({ lpNm: 555, tauFs: tb, gddFs2: 0, fsr: 1000, lw }), db = core.etalonDecay(1000, Rb);
  const t = b.time.tPs, y = b.time.out, ip = y.indexOf(core.maxOf(y)), sel = [];
  for (let i = ip; i < t.length; i++) if (t[i] > t[ip] + 2 * db * 1e12 && t[i] < t[ip] + 5 * db * 1e12) sel.push([t[i], Math.log(y[i])]);
  const mx = sel.reduce((a, p) => a + p[0], 0) / sel.length, my = sel.reduce((a, p) => a + p[1], 0) / sel.length;
  const slope = sel.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sel.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  // independent time-domain sum of the copies: E_out(t) = (1 − R) Σ Rᵐ A(t − m/FSR), A the transform-limited envelope
  const trtB = 1e12 / core.cmToHz(1000), aa = 2 * Math.LN2 / (tb / 1000) ** 2;
  let dmax = 0;
  for (let i = 0; i < t.length; i++) { let e = 0; for (let m = 0; Math.pow(Rb, m) > 1e-14; m++) e += (1 - Rb) * Math.pow(Rb, m) * Math.exp(-aa * (t[i] - m * trtB) ** 2); dmax = Math.max(dmax, Math.abs(e * e - y[i])); }
  const wide = core.etalonPoint({ tauFs: core.tauFromBw(core.cmToHz(2900)), gddFs2: 0, fsr, lw }), lim = core.etalonDecay(fsr, R) * 1e15 * Math.LN2;
  check("18e 300 cm⁻¹ input, FSR 1000: FWHM → line width, tail e^(−t/τ_decay), pulse = sum of copies; 2900 cm⁻¹: pulse FWHM → τ ln 2",
    rel(b.widths.etalon.cm, lw) < 0.03 && rel(-1 / slope, db * 1e12) < 0.01 && dmax < 1e-4 && rel(wide.tauOutFs, lim) < 0.015,
    `${b.widths.etalon.cm.toFixed(3)} cm⁻¹; decay ${(-1 / slope).toFixed(4)} vs ${(db * 1e12).toFixed(4)} ps; max |FFT − sum| ${dmax.toExponential(1)} of the input peak; ${wide.tauOutFs.toFixed(1)} vs ${lim.toFixed(1)} fs`);
  // input broader than the FSR (20 fs): a train of copies 1/FSR apart, each R² weaker
  const tr = core.analyseEtalon({ lpNm: 555, tauFs: 20, gddFs2: 0, fsr, lw }), tt = tr.time.tPs, yy = tr.time.out, trt = 1e12 / core.cmToHz(fsr), pk = [];
  for (let m = 0; m < 4; m++) { let best = -1, bi = 0; for (let i = 0; i < tt.length; i++) if (Math.abs(tt[i] - m * trt) < trt / 3 && yy[i] > best) { best = yy[i]; bi = i; } pk.push([tt[bi], best]); }
  const sp = pk.slice(1).map((p, i) => p[0] - pk[i][0]), ra = pk.slice(1).map((p, i) => p[1] / pk[i][1]);
  check("18f 20 fs input: copies 1/FSR = 193.9 fs apart, each R² weaker", sp.every(v => Math.abs(v - trt) < 0.002) && ra.every(v => rel(v, R * R) < 0.01),
    `spacing ${sp.map(v => (v * 1000).toFixed(1)).join(", ")} fs; ratios ${ra.map(v => v.toFixed(4)).join(", ")} vs R² = ${(R * R).toFixed(4)}`);
  // chirp changes the pulse, not the spectrum
  const c0 = core.etalonPoint({ tauFs: 200, gddFs2: 0, fsr, lw }), c1 = core.etalonPoint({ tauFs: 200, gddFs2: 20000, fsr, lw });
  check("18g GDD 20000 fs²: same spectral FWHM and energy, longer input and output pulses", Math.abs(c1.fwhmCm - c0.fwhmCm) < 1e-9 && Math.abs(c1.central - c0.central) < 1e-9 && c1.tauOutFs > c0.tauOutFs && Math.abs(c1.tauInFs - core.chirpedTau(200, 20000)) < 1e-9,
    `${c0.fwhmCm.toFixed(4)} cm⁻¹, ${(100 * c0.central).toFixed(3)} %; pulse ${c0.tauOutFs.toFixed(1)} → ${c1.tauOutFs.toFixed(1)} fs`);
  // the SH after the etalon (BBO mode): energy in time = spectral fraction through all orders
  const bb = core.analyse({ set: "kato", lfNm: 1110, Lmm: 25, cut: 21.1, tauFs: 200, gddFs2: 0, fsr, lw, Euj: 2, dMm: 2, deff: 2 }), b2 = core.analyse({ set: "kato", lfNm: 1110, Lmm: 2, cut: 21.1, tauFs: 200, gddFs2: 0, fsr, lw, Euj: 2, dMm: 2, deff: 2 });
  check("18h SH after the etalon: energy in time = spectral fraction (25 and 2 mm)", Math.abs(bb.etTimeRatio - bb.etalon.fraction) < 1e-3 && Math.abs(b2.etTimeRatio - b2.etalon.fraction) < 1e-3,
    `${bb.etTimeRatio.toFixed(4)} vs ${bb.etalon.fraction.toFixed(4)}; ${b2.etTimeRatio.toFixed(4)} vs ${b2.etalon.fraction.toFixed(4)}; pulse ${bb.tauEtFs.toFixed(0)} and ${b2.tauEtFs.toFixed(0)} fs`);
  // default no-BBO case and its files
  const d = core.analyseEtalon({ lpNm: 555, tauFs: 200, gddFs2: 0, fsr, lw }), cs = core.csvEtSpectrum(d).trim().split("\n").filter(l => !l.startsWith("#")), cp = core.csvEtPulse(d).trim().split("\n").filter(l => !l.startsWith("#"));
  const cb = core.csvBandwidth(d, [Object.assign({ bwCm: 73.6 }, core.etalonPoint({ tauFs: 200, gddFs2: 0, fsr, lw }))]).trim().split("\n").filter(l => !l.startsWith("#"));
  check("18i 555 nm, 200 fs, FSR 172, lw 15: 14.59 cm⁻¹ and 0.426 ps after, 25.5 % through one order; CSV files 5 / 3 / 7 columns",
    rel(d.widths.etalon.cm, 14.594) < 1e-3 && rel(d.tauOutFs, 425.6) < 0.005 && Math.abs(d.central - 0.2545) < 5e-4 && cs.slice(1).every(l => l.split(",").length === 5 && l.split(",").every(v => Number.isFinite(Number(v)))) && cp.slice(1).every(l => l.split(",").length === 3) && cb[1].split(",").length === 7,
    `${d.widths.etalon.cm.toFixed(3)} cm⁻¹, ${d.tauOutFs.toFixed(1)} fs, ${(100 * d.central).toFixed(2)} %; ${cs.length - 1} / ${cp.length - 1} rows`);
}

// 19. tilting the etalon: every order moves to ν̃/cos θ_int
{
  const nu = 1e7 / 555, fsr = 172, lw = 15, t0 = core.etalonTilt(nu, 0, 1, fsr, lw), t1 = core.etalonTilt(nu, 1, 1, fsr, lw), t2 = core.etalonTilt(nu, 2, 1.46, fsr, lw);
  const exact1 = nu * (1 / Math.cos(Math.PI / 180) - 1), ti2 = Math.asin(Math.sin(2 * Math.PI / 180) / 1.46), exact2 = nu * (1 / Math.cos(ti2) - 1), small = nu * (Math.PI / 180) ** 2 / 2;
  const back = core.etalonTilt(nu, core.tiltForShift(nu, lw, 1.46), 1.46, fsr, lw).shift;
  check("19a tilt: 0° → no shift; 1° air → 2.745 cm⁻¹ (≈ ν̃θ²/2); 2° in n = 1.46 → ν̃(1/cos θ_int − 1); FSR, line width × 1/cos θ_int; angle for one line width inverts",
    t0.shift === 0 && t0.k === 1 && Math.abs(t1.shift - exact1) < 1e-9 && rel(t1.shift, small) < 2e-4 && Math.abs(t2.shift - exact2) < 1e-9 && Math.abs(t2.fsr - fsr / Math.cos(ti2)) < 1e-9 && Math.abs(back - lw) < 1e-6,
    `${t1.shift.toFixed(4)} cm⁻¹ (small-angle ${small.toFixed(4)}); ${t2.shift.toFixed(4)} cm⁻¹; one line width at ${core.tiltForShift(nu, lw, 1).toFixed(3)}° (air), ${core.tiltForShift(nu, lw, 1.46).toFixed(3)}° (n = 1.46)`);
  // energy through all orders with the order off centre: closed form against quadrature
  const R = core.etalonR(fsr, lw), quad = (sig, d) => { let n = 0, q = 0; for (let x = -40 * fsr; x <= 40 * fsr; x += 0.01) { const g = Math.exp(-x * x / (2 * sig * sig)); n += g * core.etalonT(x - d, fsr, lw); q += g; } return n / q; };
  const cases = [[30, 7], [30, 50], [100, 120], [5, 86]], dq = cases.map(([sg, d]) => Math.abs(core.etalonTotal(sg, fsr, R, d) - quad(sg, d)));
  check("19b energy through all orders with the order δ off centre = quadrature", Math.max(...dq) < 1e-6, `${cases.map(([sg, d]) => `σ ${sg}, δ ${d}: ${core.etalonTotal(sg, fsr, R, d).toFixed(5)}`).join("; ")}; max diff ${Math.max(...dq).toExponential(1)}`);
  // a 1 cm⁻¹ input with the order moved by one line width passes about T(line width) ≈ 1/5; one order = quadrature of S·T(x − δ)
  const th = core.tiltForShift(nu, lw, 1), q1 = core.etalonPoint({ tauFs: core.tauFromBw(core.cmToHz(1)), gddFs2: 0, fsr, lw, lpNm: 555, tiltDeg: th, nEt: 1 });
  const off = q1.tilt.off, sg1 = 1 / 2.3548200450309493, k = q1.tilt.k;
  let num = 0, den = 0; for (let x = -10; x <= 10; x += 1e-4) { const g = Math.exp(-x * x / (2 * sg1 * sg1)); num += g * core.etalonT(x - off, fsr * k, lw * k); den += g; }
  check("19c 1 cm⁻¹ input, order moved by one line width: passes ≈ T(δ) ≈ 0.2, = quadrature", Math.abs(q1.central - num / den) < 1e-5 && Math.abs(q1.central - core.etalonT(-off, fsr * k, lw * k)) < 0.01 && Math.abs(q1.central - 0.2) < 0.01,
    `δ ${off.toFixed(3)} cm⁻¹ at ${th.toFixed(3)}°; ${q1.central.toFixed(5)} vs ${(num / den).toFixed(5)}`);
  // BBO mode, tilted: energy in time still equals the spectral fraction, and less passes than at 0°
  const pb = { set: "kato", lfNm: 1110, Lmm: 25, cut: 21.1, tauFs: 200, gddFs2: 0, fsr, lw, Euj: 2, dMm: 2, deff: 2 };
  const a0 = core.analyse(pb), a1 = core.analyse(Object.assign({}, pb, { tiltDeg: 2, nEt: 1 }));
  check("19d BBO, etalon at 2°: order 11.0 cm⁻¹ off the SH peak, less passes, energy in time = spectral fraction",
    Math.abs(a1.etTilt.off - 10.98) < 0.05 && a1.etalon.fraction < a0.etalon.fraction && Math.abs(a1.etTimeRatio - a1.etalon.fraction) < 1e-3,
    `δ ${a1.etTilt.off.toFixed(3)} cm⁻¹; ${a0.etalon.fraction.toFixed(4)} → ${a1.etalon.fraction.toFixed(4)} (time ${a1.etTimeRatio.toFixed(4)}); T at the SH peak ${a1.etTCentre.toFixed(3)}`);
}

console.log(`${fails ? `${fails} FAILED` : "all passed"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
