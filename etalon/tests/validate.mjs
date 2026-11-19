// Checks the numerical core embedded in index.html (<script id="core">) against closed forms and independent calculations.
//   node tests/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["coeffF", "airyT", "airyR", "phase", "pulseWidth", "pulseSpec", "linspace", "trapz", "etalon", "fracT", "spectra", "outputPeak", "timeRange", "timeGrid", "timeProfiles", "C_CM_FS", "design", "reflectanceForF", "toCm", "fromCm", "applyTilt", "combShift", "tiltForOneFSR", "designDecay", "neighbourHeight", "tailRipple", "specWidth"];
const core = new Function(m[1] + `\nreturn {${names.join(",")}};`)();

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const base = { R: 0.761, fsr: 172, off: 0, tau: 200, lam: 515, n: 1 };

// 1. energy conservation and the multiple-beam sum: T + R = 1, and T equals |Σ partial beams|² summed directly
{
  let worst = 0, worstSum = 0;
  for (const R of [0.04, 0.3, 0.761, 0.95]) for (let d = -7; d <= 7; d += 0.173) {
    worst = Math.max(worst, Math.abs(core.airyT(d, R) + core.airyR(d, R) - 1));
    let re = 0, im = 0; for (let k = 0; k < 2000; k++) { const a = (1 - R) * Math.pow(R, k); re += a * Math.cos(k * d); im += a * Math.sin(k * d); }
    worstSum = Math.max(worstSum, Math.abs(re * re + im * im - core.airyT(d, R)));
  }
  check("1 T + R = 1; T = |sum of partial beams|²", worst < 1e-14 && worstSum < 1e-10, `max |T+R−1| ${worst.toExponential(1)}, max |sum−T| ${worstSum.toExponential(1)}`);
}

// 2. widths: closed-form FWHM against a half-maximum search on the Airy functions
{
  let worstT = 0, worstR = 0;
  for (const R of [0.2, 0.5, 0.761, 0.95, 0.99]) {
    const p = { ...base, R }, E = core.etalon(p), x = core.linspace(-86, 86, 400001);
    let nT = 0, nR = 0;
    for (const v of x) { const d = core.phase(v, p); if (core.airyT(d, R) >= 0.5) nT++; if (core.airyR(d, R) >= E.Rmax / 2) nR++; }
    const dx = 172 / 400000;
    worstT = Math.max(worstT, Math.abs(nT * dx - E.fwhmT)); worstR = Math.max(worstR, Math.abs(nR * dx - E.fwhmR));
  }
  check("2 FWHM formulas = half-maximum search (R = 0.2 … 0.99, FSR 172)", worstT < 2e-3 && worstR < 2e-3, `max diff T ${worstT.toExponential(1)} cm⁻¹, R band ${worstR.toExponential(1)} cm⁻¹`);
}

// 3. limits: no transmission half-maximum below R = 3 − 2√2; reflection band → FSR/2 at low R; FWHM → FSR/finesse at high R
{
  const lo = core.etalon({ ...base, R: 0.17 }), hi2 = core.etalon({ ...base, R: 0.173 }), tiny = core.etalon({ ...base, R: 0.001 }), hi = core.etalon({ ...base, R: 0.97 });
  const ratio = hi.fwhmT * hi.finesse / 172;
  check("3 limits", Number.isNaN(lo.fwhmT) && hi2.fwhmT > 0 && Math.abs(tiny.fwhmR / 172 - 0.5) < 1e-3 && Math.abs(ratio - 1) < 1e-3,
    `R 17.0 % → ${lo.fwhmT}, R 17.3 % → ${hi2.fwhmT.toFixed(1)} cm⁻¹; band/FSR at R 0.1 % = ${(tiny.fwhmR / 172).toFixed(4)}; FWHM·finesse/FSR at R 97 % = ${ratio.toFixed(5)}`);
}

// 4. numbers known independently: 200 fs ↔ 73.6 cm⁻¹, 70 fs ↔ 210 cm⁻¹; FSR 172 cm⁻¹ ↔ 29.07 µm air gap, 193.9 fs round trip; R 76.1 % → 15 cm⁻¹
{
  const E = core.etalon(base), w200 = core.pulseWidth(200), w70 = core.pulseWidth(70);
  const ok = Math.abs(w200 - 73.60) < 0.02 && Math.abs(w70 - 210.3) < 0.1 && Math.abs(E.d_um - 29.07) < 0.005 && Math.abs(E.tRT - 193.93) < 0.02 && Math.abs(E.fwhmT - 15) < 0.1;
  check("4 reference numbers", ok, `Δν(200 fs) ${w200.toFixed(2)}, Δν(70 fs) ${w70.toFixed(1)} cm⁻¹; d ${E.d_um.toFixed(3)} µm; t_rt ${E.tRT.toFixed(2)} fs; FWHM ${E.fwhmT.toFixed(3)} cm⁻¹; finesse ${E.finesse.toFixed(2)}`);
}

// 5. transmitted energy: Fourier-series result against direct numerical integration of T·S
{
  let worst = 0; const info = [];
  for (const p of [base, { ...base, off: 0.5 }, { ...base, off: -0.23, R: 0.3 }, { ...base, R: 0.889, fsr: 400, tau: 70 }, { ...base, R: 0.04, fsr: 30, off: 0.5 }, { ...base, R: 0.98, fsr: 50, tau: 40, off: 0.1 }]) {
    const dnu = core.pulseWidth(p.tau), x = core.linspace(-5 * dnu, 5 * dnu, 2000001), y = x.map(v => core.airyT(core.phase(v, p), p.R) * core.pulseSpec(v, dnu));
    const num = core.trapz(x, y) / (dnu * Math.sqrt(Math.PI / (4 * Math.LN2))), ser = core.fracT(p);
    worst = Math.max(worst, Math.abs(num - ser)); info.push(ser.toFixed(4));
  }
  check("5 transmitted energy: series = numerical integral (6 cases)", worst < 1e-6, `max |diff| ${worst.toExponential(1)}; fractions ${info.join(", ")}`);
}

// 6. time domain: ∫|E_T|² dt and ∫|E_R|² dt against the spectral result (Parseval), including the round-trip phase
{
  let worstT = 0, worstR = 0;
  for (const p of [base, { ...base, off: 0.5 }, { ...base, off: 0.31, R: 0.5 }, { ...base, R: 0.04, fsr: 30, off: 0.5 }, { ...base, R: 0.889, fsr: 400, tau: 70, off: -0.12 }]) {
    const E = core.etalon(p), t = core.linspace(-6 * p.tau, 6 * p.tau + 60 * E.decay + 5 * E.tRT, 400001), I = core.timeProfiles(p, t);
    const norm = p.tau * Math.sqrt(Math.PI / (4 * Math.LN2)), fT = core.fracT(p);
    worstT = Math.max(worstT, Math.abs(core.trapz(t, I.IT) / norm - fT)); worstR = Math.max(worstR, Math.abs(core.trapz(t, I.IR) / norm - (1 - fT)));
  }
  check("6 time domain: pulse-train energies = spectral energies (5 cases)", worstT < 1e-6 && worstR < 1e-6, `max |diff| transmitted ${worstT.toExponential(1)}, reflected ${worstR.toExponential(1)}`);
}

// 7. time domain shapes: low R in reflection gives two pulses of R and R(1−R)² one round trip apart; high finesse tail decays as R² per round trip
{
  const p = { ...base, R: 0.04, fsr: 30, off: 0.5 }, E = core.etalon(p), I = core.timeProfiles(p, Float64Array.from([0, E.tRT]));
  const q = { ...base, R: 0.9, fsr: 100, tau: 50 }, Eq = core.etalon(q), J = core.timeProfiles(q, Float64Array.from([3 * Eq.tRT, 4 * Eq.tRT]));
  const ok = Math.abs(I.IR[0] - 0.04) < 1e-6 && Math.abs(I.IR[1] - 0.04 * 0.96 * 0.96) < 1e-6 && Math.abs(J.IT[1] / J.IT[0] - 0.81) < 1e-6;
  check("7 pulse-train heights", ok, `reflected, R 4 %: ${I.IR[0].toFixed(5)} then ${I.IR[1].toFixed(5)} (expected 0.04000, 0.03686); transmitted, R 90 %: ratio per round trip ${(J.IT[1] / J.IT[0]).toFixed(5)}`);
}

// 8. output peak: 200 fs through the 172 cm⁻¹ / 76.1 % etalon is one peak near 15 cm⁻¹; in reflection at low R the band is ≈ FSR/2 wide;
//    at R 10 % under a pulse much broader than the FSR the transmitted spectrum has no half-maximum within one FSR
{
  const a = core.outputPeak(base, "T"), E = core.etalon(base), b = core.outputPeak({ ...base, R: 0.04, fsr: 30, off: 0.5 }, "R"), c = core.outputPeak({ ...base, R: 0.1, tau: 20 }, "T");
  const ok = Math.abs(a.fwhm - E.fwhmT) < 0.6 && a.fwhm < E.fwhmT && a.share > 0.97 && Math.abs(a.centre) < 1e-9 && Math.abs(b.fwhm - 15) < 0.6 && b.share < 0.5 && Number.isNaN(c.fwhm);
  check("8 strongest output peak", ok, `transmission: FWHM ${a.fwhm.toFixed(2)} cm⁻¹ (etalon ${E.fwhmT.toFixed(2)}), share ${(100 * a.share).toFixed(1)} %; low-R reflection: FWHM ${b.fwhm.toFixed(2)} cm⁻¹, share ${(100 * b.share).toFixed(1)} %; R 10 % with a 20 fs pulse, transmission FWHM ${c.fwhm} (no half-maximum within one FSR)`);
}

// 9. the neighbouring band: symmetric cases give two equal bands; a far transmission peak under a narrow pulse has no band of its own
{
  const r1 = core.outputPeak(base, "R", false), r2 = core.outputPeak(base, "R", true);
  const q = { ...base, R: 0.889, fsr: 400, tau: 70, off: 0.5 }, t1 = core.outputPeak(q, "T", false), t2 = core.outputPeak(q, "T", true);
  const far = core.outputPeak(base, "T", true), E = core.etalon(q);
  const ok = Math.abs(r1.centre + r2.centre) < 1e-6 && Math.abs(r1.fwhm - r2.fwhm) < 1e-6 && Math.abs(r1.share + r2.share - 1) < 1e-3
    && Math.abs(t1.centre - 200) < 1.5 && Math.abs(t1.centre + t2.centre) < 1e-6 && Math.abs(t1.fwhm - t2.fwhm) < 1e-6 && Math.abs(t1.fwhm - E.fwhmT) < 0.5 && Math.abs(t1.share - 0.5) < 5e-3
    && Number.isNaN(far.fwhm) && far.share < 1e-3;
  check("9 the two bands", ok, `reflection, offset 0: ${r1.centre.toFixed(2)} and ${r2.centre.toFixed(2)} cm⁻¹, FWHM ${r1.fwhm.toFixed(2)} and ${r2.fwhm.toFixed(2)} cm⁻¹, shares ${(100 * r1.share).toFixed(1)} + ${(100 * r2.share).toFixed(1)} %; ` +
    `transmission, offset 0.5: ${t1.centre.toFixed(2)} and ${t2.centre.toFixed(2)} cm⁻¹ (etalon peaks at ±200; the slope of the pulse spectrum pulls them in), FWHM ${t1.fwhm.toFixed(2)} and ${t2.fwhm.toFixed(2)} cm⁻¹ (etalon ${E.fwhmT.toFixed(2)}), share ${(100 * t1.share).toFixed(1)} % each; far peak at −172 cm⁻¹ under 200 fs: FWHM ${far.fwhm}, share ${(100 * far.share).toExponential(1)} %`);
}

// 10. plotting grids contain the exact peak positions, sorted
{
  const d = core.spectra({ ...base, R: 0.99, off: 0.137 }, -300, 300, 3001);
  let sorted = true, tmax = 0; for (let i = 1; i < d.x.length; i++) if (d.x[i] < d.x[i - 1]) sorted = false;
  for (const v of d.T) tmax = Math.max(tmax, v);
  check("10 plot grid reaches the peaks", sorted && Math.abs(tmax - 1) < 1e-9, `max T on the grid ${tmax}`);
}

// 11. inverse problem: design(FWHM, FSR) fed back into etalon() returns the same FWHM; limits; unit conversions
{
  let worst = 0; const info = [];
  for (const [w, fsr] of [[15, 172], [15, 400], [3, 500], [0.5, 1000], [100, 172], [171.9, 172]]) {
    const d = core.design(w, fsr), E = core.etalon({ ...base, R: d.R, fsr });
    worst = Math.max(worst, Math.abs(E.fwhmT - w) / w, Math.abs(core.coeffF(d.R) - d.F) / d.F); info.push(`${w}/${fsr} → R ${(100 * d.R).toFixed(3)} %`);
  }
  const edge = core.design(172, 172), over = core.design(200, 172), lim = core.design(171.9999, 172);
  const d15 = core.design(15, 172), gap = core.fromCm(172, "um", 515, 1), back = core.toCm(gap, "um", 515, 1), thz = core.fromCm(172, "thz"), nm = core.fromCm(15, "nm", 515);
  const glass = core.toCm(20, "um", 515, 1.45);
  const ok = worst < 1e-10 && edge === null && over === null && Math.abs(lim.R - (3 - 2 * Math.SQRT2)) < 1e-5 && Math.abs(d15.R - 0.7616) < 5e-4
    && Math.abs(gap - 29.070) < 1e-3 && Math.abs(back - 172) < 1e-9 && Math.abs(thz - 5.1564) < 1e-3 && Math.abs(nm - 0.3978) < 1e-4 && Math.abs(glass - 172.41) < 0.01;
  check("11 etalon for a given bandwidth", ok, `max relative error of the round trip ${worst.toExponential(1)}; ${info.join(", ")}; FWHM ≥ FSR → no solution; ` +
    `172 cm⁻¹ = ${thz.toFixed(4)} THz = ${gap.toFixed(3)} µm of air; 15 cm⁻¹ = ${nm.toFixed(4)} nm at 515 nm; 20 µm of n = 1.45 → ${glass.toFixed(2)} cm⁻¹`);
}

// 12. tilt: the effective FSR and offset reproduce the phase 4π n d cos θ_in ν computed directly; one-FSR tilts; no tilt changes nothing
{
  // λ0 = 500 nm (20000 cm⁻¹) and FSR 200 cm⁻¹: a peak sits exactly on the pulse centre at normal incidence, so offset 0
  let worst = 0;
  for (const n of [1, 1.45]) for (const tilt of [0, 2, 5, 8.11, 12, 20]) {
    const q = { ...base, R: 0.8, fsr: 200, off: 0, lam: 500, n, tilt }, p = core.applyTilt(q), cIn = Math.cos(Math.asin(Math.sin(tilt * Math.PI / 180) / n));
    for (let x = -400; x <= 400; x += 3.7) worst = Math.max(worst, Math.abs(core.airyT(core.phase(x, p), p.R) - core.airyT(2 * Math.PI * (20000 + x) * cIn / 200, 0.8)));
  }
  const a172 = core.tiltForOneFSR(172, 515, 1), a394 = core.tiltForOneFSR(394, 515, 1), a200 = core.tiltForOneFSR(200, 515, 1), glass = core.tiltForOneFSR(172, 515, 1.45);
  const one = core.applyTilt({ ...base, fsr: 172, off: 0.2, tilt: a172 }), none = core.applyTilt({ ...base, fsr: 172, off: 0.2, tilt: 0 });
  const walk = core.etalon(core.applyTilt({ ...base, fsr: 200, tilt: 10 })).walk;
  const ok = worst < 1e-9 && Math.abs(a172 - 7.63) < 0.01 && Math.abs(a394 - 11.56) < 0.01 && Math.abs(core.combShift(a172, 172, 515, 1) - 1) < 1e-12
    && Math.abs(one.off - 0.2) < 1e-9 && Math.abs(one.shift - one.fsr) < 1e-9 && none.fsr === 172 && none.off === 0.2 && none.shift === 0 && Math.abs(walk - 8.816) < 0.01 && glass > a172;
  check("12 tuning by tilt", ok, `max |T(effective) − T(direct)| ${worst.toExponential(1)}; one FSR at ${a172.toFixed(2)}° (172 cm⁻¹), ${a394.toFixed(2)}° (394 cm⁻¹), ${a200.toFixed(2)}° (200 cm⁻¹) at 515 nm in air, ` +
    `${glass.toFixed(2)}° for 172 cm⁻¹ in n = 1.45; at that tilt the shift is ${one.shift.toFixed(2)} cm⁻¹ = the tilted FSR ${one.fsr.toFixed(2)}; walk-off 25 µm gap at 10°: ${walk.toFixed(2)} µm per round trip`);
}

// 13. pulse given by duration and bandwidth (linear chirp): the spectra follow the bandwidth, and the energies of the
//     chirped pulse trains in time still match the spectral energies (Parseval)
{
  let worstT = 0, worstR = 0; const info = [];
  for (const [tau, dnu, extra] of [[200, 100, {}], [150, 210.3, { R: 0.889, fsr: 400 }], [300, 73.6, { off: 0.3 }], [200, 200, { R: 0.04, fsr: 30, off: 0.5 }]]) {
    const p = { ...base, ...extra, tau, dnu, chirp: Math.sqrt((dnu / core.pulseWidth(tau)) ** 2 - 1) }, E = core.etalon(p);
    const t = core.linspace(-6 * tau, 6 * tau + 60 * E.decay + 5 * E.tRT, 600001), I = core.timeProfiles(p, t), norm = tau * Math.sqrt(Math.PI / (4 * Math.LN2)), fT = core.fracT(p);
    // the spectral result itself against direct integration with the given bandwidth
    const x = core.linspace(-5 * dnu, 5 * dnu, 400001), num = core.trapz(x, x.map(v => core.airyT(core.phase(v, p), p.R) * core.pulseSpec(v, dnu))) / (dnu * Math.sqrt(Math.PI / (4 * Math.LN2)));
    worstT = Math.max(worstT, Math.abs(core.trapz(t, I.IT) / norm - fT), Math.abs(num - fT)); worstR = Math.max(worstR, Math.abs(core.trapz(t, I.IR) / norm - (1 - fT)));
    info.push(`${tau} fs/${dnu} cm⁻¹ (C = ${p.chirp.toFixed(2)}) → ${(100 * fT).toFixed(2)} %`);
  }
  const same = core.fracT({ ...base, tau: 200 }) - core.fracT({ ...base, tau: 200, dnu: core.pulseWidth(200) });
  check("13 pulse given by duration and bandwidth", worstT < 1e-6 && worstR < 1e-6 && same === 0 && core.specWidth({ tau: 200 }) === core.pulseWidth(200),
    `max |diff| transmitted ${worstT.toExponential(1)}, reflected ${worstR.toExponential(1)}; transmitted: ${info.join(", ")}`);
}

// 14. design from a decay time: R² per round trip gives the entered decay; agrees with 1/(2πc·FWHM) at high finesse;
//     the ripple estimate ±4√S(FSR) against the transmitted pulse train itself
{
  const d = core.designDecay(354, 172), E = core.etalon({ ...base, R: d.R, fsr: 172 }), back = core.design(d.fwhm, 172);
  const hi = core.designDecay(2000, 400), approx = 1 / (2 * Math.PI * core.C_CM_FS * hi.fwhm);
  let worst = 0; const info = [];
  for (const k of [1.5, 1.75, 2]) {
    const dnu = 150, fsr = k * dnu, p = { ...base, R: 0.9, fsr, tau: core.pulseWidth(dnu), dnu }, tRT = 1 / (core.C_CM_FS * fsr);
    const I = core.timeProfiles(p, Float64Array.from([20 * tRT, 20.5 * tRT])), meas = (I.IT[0] * p.R / I.IT[1] - 1) / (I.IT[0] * p.R / I.IT[1] + 1), est = core.tailRipple(fsr, dnu);
    worst = Math.max(worst, Math.abs(meas - est) / est); info.push(`${k}×: ±${(100 * est).toFixed(1)} % (pulse train ±${(100 * meas).toFixed(1)} %)`);
  }
  const ok = Math.abs(E.decay - 354) < 1e-9 && Math.abs(back.R - d.R) < 1e-12 && Math.abs(d.fwhm - 15) < 0.2 && Math.abs(approx / 2000 - 1) < 2e-3 && worst < 0.1
    && Math.abs(core.neighbourHeight(300, 200) - Math.exp(-4 * Math.LN2 * 2.25)) < 1e-15;
  check("14 decay time and continuous decay", ok, `354 fs at 172 cm⁻¹ → R ${(100 * d.R).toFixed(2)} %, FWHM ${d.fwhm.toFixed(2)} cm⁻¹; 2000 fs at 400 cm⁻¹: 1/(2πc·FWHM) = ${approx.toFixed(1)} fs; ripple at FSR = ${info.join(", ")}`);
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
