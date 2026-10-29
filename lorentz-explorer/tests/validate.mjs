// Checks the numerical core of index.html (<script id="core">) against closed forms and independent numbers.
import fs from "node:fs";
//   node tests/validate.mjs
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
const names = ["PHYS", "derivedOsc", "chiAt", "csqrt", "spectrum", "detuningGrid", "wavelengthGrid", "argMax", "argMin", "refineExtremum", "interp", "sellmeierN", "SILICA", "BK7", "glassOscillators"];
const core = new Function(m[1] + `\nreturn {${names.join(",")}};`)();
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const { c } = core.PHYS;

// 1. single Na-like line (N = 1e17 m^-3, 100 MHz, f = 1): closed forms
const na = { lam: 589, f: 1, dnu: 1e8, m: 1, q: 1 }, d = core.derivedOsc(na, 1e17, 1);
check("1a alpha_max = 1689.6 m^-1", rel(d.alphaMax, 1689.5945) < 1e-5, d.alphaMax.toFixed(4));
check("1b (n-1)_max = 3.9597e-5", rel(d.dnMax, 3.95966e-5) < 1e-5, d.dnMax.toExponential(6));
check("1c (n-1)_max = alpha_max c/(4 w0)", rel(d.dnMax, d.alphaMax * c / (4 * d.w0)) < 1e-12);
check("1d w0 = 3.198e15 rad/s, wavenumber 16977.9 cm^-1", rel(d.w0, 3.19805e15) < 1e-5 && rel(d.wavenumber, 1e7 / 589) < 1e-12, `${d.w0.toExponential(5)}, ${d.wavenumber.toFixed(2)}`);

// 2. exact curve on the detuning grid: extrema at nu0 -/+ 50 MHz, alpha there = half peak, exact ~ dilute ~ Lorentzian
{
  const nu = core.detuningGrid(d.nu0, d.dnu, 5, 2001), ws = nu.map(v => 2 * Math.PI * v), x = nu.map(v => v - d.nu0), sp = core.spectrum(ws, [d], 1);
  const pMax = core.refineExtremum(x, sp.n, core.argMax(sp.n)), pMin = core.refineExtremum(x, sp.n, core.argMin(sp.n)), pA = core.refineExtremum(x, sp.alpha, core.argMax(sp.alpha));
  check("2a max n at -50 MHz, min at +50 MHz", Math.abs(pMax.x + 5e7) < 5e3 && Math.abs(pMin.x - 5e7) < 5e3, `${pMax.x.toFixed(0)} Hz, ${pMin.x.toFixed(0)} Hz`);
  check("2b exact (n-1)_max matches formula", rel(pMax.y - 1, d.dnMax) < 1e-4, (pMax.y - 1).toExponential(6));
  check("2c exact alpha peak matches formula", rel(pA.y, d.alphaMax) < 1e-4, pA.y.toFixed(3));
  const r1 = core.interp(x, sp.alpha, pMax.x) / pA.y, r2 = core.interp(x, sp.alpha, pMin.x) / pA.y;
  check("2d alpha at n extrema = half peak", Math.abs(r1 - 0.5) < 1e-4 && Math.abs(r2 - 0.5) < 1e-4, `${r1.toFixed(6)}, ${r2.toFixed(6)}`);
  let wd = 0, wl = 0;
  for (let i = 0; i < ws.length; i++) { wd = Math.max(wd, Math.abs(sp.alpha[i] - sp.alphaD[i]) / d.alphaMax, Math.abs(sp.n[i] - sp.nD[i]) / d.dnMax); wl = Math.max(wl, Math.abs(sp.alpha[i] - sp.alphaL[i]) / d.alphaMax, Math.abs(sp.n[i] - sp.nL[i]) / d.dnMax); }
  check("2e exact = dilute = Lorentzian for Na (relative to peak)", wd < 1e-3 && wl < 1e-3, `dilute ${wd.toExponential(1)}, Lorentzian ${wl.toExponential(1)}`);
  check("2f chi small for Na", sp.chiMax < 1e-3, sp.chiMax.toExponential(2));
}

// 3. Sellmeier limit: glass oscillators with gamma -> 0 reproduce the published n
for (const [name, terms, lam, nref] of [["fused silica", core.SILICA, 589.3, 1.45840], ["N-BK7", core.BK7, 587.56, 1.516800]]) {
  const osc = core.glassOscillators(terms, 2.205e28, 1e-9, 10.18, 1);
  const list = osc.map(o => core.derivedOsc(o, 2.205e28, 1)), w = 2 * Math.PI * c / (lam * 1e-9);
  const [cr, ci] = core.chiAt(w, list), n0 = core.csqrt(1 + cr, ci)[0];
  check(`3 ${name}: gamma->0 model = Sellmeier = ${nref}`, Math.abs(n0 - core.sellmeierN(lam, terms)) < 2e-6 && Math.abs(n0 - nref) < 2e-5, `model ${n0.toFixed(6)}, Sellmeier ${core.sellmeierN(lam, terms).toFixed(6)}`);
}
// 3b with the page's widths, n in the window still within ~1e-5 of Sellmeier
{
  const osc = core.glassOscillators(core.SILICA, 2.205e28, 0.02, 10.18, 1.8e12), list = osc.map(o => core.derivedOsc(o, 2.205e28, 1));
  let worst = 0;
  for (let lam = 300; lam <= 2000; lam += 50) { const w = 2 * Math.PI * c / (lam * 1e-9), [cr, ci] = core.chiAt(w, list); worst = Math.max(worst, Math.abs(core.csqrt(1 + cr, ci)[0] - core.sellmeierN(lam, core.SILICA))); }
  check("3b silica with page widths: |n - Sellmeier| 300-2000 nm", worst < 3e-5, worst.toExponential(2));
  console.log("      silica oscillators:", JSON.stringify(osc));
}

// 4. air preset: n - 1 = 2.77e-4 at 589 nm, 2.83e-4 at 400 nm
{
  const dl = core.derivedOsc({ lam: 77, f: 4.02, dnu: 2e14, m: 1, q: 1 }, 2.547e25, 1), nAt = l => { const w = 2 * Math.PI * c / (l * 1e-9); const [cr, ci] = core.chiAt(w, [dl]); return core.csqrt(1 + cr, ci)[0] - 1; };
  check("4 air: n-1 at 589 and 400 nm", rel(nAt(589.3), 2.77e-4) < 0.01 && rel(nAt(400), 2.828e-4) < 0.01, `${nAt(589.3).toExponential(4)}, ${nAt(400).toExponential(4)}`);
}

// 5. complex sqrt: branch and precision
{
  const [a, b] = core.csqrt(1 + 1e-5, 3e-9), [p, q] = core.csqrt(-2, 1e-3), [s, t] = core.csqrt(-4, 0);
  check("5 csqrt keeps tiny imaginary part, Im >= 0 branch", Math.abs(b - 3e-9 / (2 * Math.sqrt(1 + 1e-5))) < 1e-20 && q > 0 && p > 0 && Math.abs(t - 2) < 1e-15 && s === 0, `${b}, (${p}, ${q}), (${s}, ${t})`);
}

// 6. He+ example vs Na: alpha_max ratio = width ratio; dn_max ratio also has omega0 ratio
{
  const he = core.derivedOsc({ lam: 30.378, f: 0.416, dnu: 1.595e9, m: 1, q: 1 }, 1e17, 1);
  const rA = he.alphaMax / d.alphaMax, rN = he.dnMax / d.dnMax, expA = 0.416 * 1e8 / 1.595e9, expN = expA * 30.378 / 589;
  check("6 He+/Na scaling", rel(rA, expA) < 1e-12 && rel(rN, expN) < 1e-12, `alpha ratio ${rA.toExponential(3)}, dn ratio ${rN.toExponential(3)}; He+ alpha_max ${he.alphaMax.toFixed(1)} m^-1, dn_max ${he.dnMax.toExponential(3)}`);
}

// 7. wavelength grid is ascending and resolves a narrow line
{
  const g = core.wavelengthGrid(100, 2000, [d], 3000);
  let asc = true; for (let i = 1; i < g.length; i++) if (!(g[i] > g[i - 1])) asc = false;
  const near = Array.from(g).filter(v => Math.abs(v - 589) < 1e-3).length;
  check("7 wavelength grid ascending, dense around Na line", asc && near > 200, `${g.length} points, ${near} within 1 pm of the line`);
}
console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
