// Checks the math core embedded in index.html (<script id="core">) and every LaTeX string the page renders.
//   node tests/validate.mjs        (about 10 s)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["A_CONST", "derive", "overlapAnalytic", "overlapMatrixNumeric", "franckCondonTable", "overlapPoly",
  "sqrtFactorPrefactor", "texOverlap", "chi", "boltzmannPop"];
const core = vm.runInNewContext(m[1] + `\n;({${names.join(",")}})`, {});
const katex = createRequire(import.meta.url)(path.join(root, "vendor/katex/katex.min.js"));

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const D0 = p => core.derive({ mu: 7, vg: 0, nE: 6, ...p });

// 1. constant: 1/α = ħ/(μ·2πc·ω̃), 33.715 Å²·cm⁻¹·amu
check("1 alpha constant", Math.abs(core.A_CONST - 33.71526) < 1e-4, core.A_CONST.toFixed(5));

// 2. closed form (eq. 10) against trapezoid integration over a grid of parameters
{
  let worst = 0, where = "";
  for (const wg of [400, 1000, 2200]) for (const we of [150, 700, 1000, 2500]) for (const d of [0, 0.03, -0.08, 0.2]) for (const mu of [1, 7]) {
    const D = D0({ wg, we, d, mu }), M = core.overlapMatrixNumeric(20, 6, D);
    for (let n = 0; n <= 6; n++) for (let k = 0; k <= 20; k++) {
      const e = Math.abs(core.overlapAnalytic(k, n, D) - M[k][n]);
      if (e > worst) { worst = e; where = `wg ${wg} we ${we} d ${d} mu ${mu} v' ${k} v'' ${n}`; }
    }
  }
  check("2 analytical = numerical (v' <= 20, v'' <= 6)", worst < 1e-10, `max |diff| ${worst.toExponential(1)} at ${where}`);
}

// 3. large displacements and levels (the input limits of the page)
{
  let worst = 0;
  for (const p of [{ wg: 1000, we: 400, d: 0.5 }, { wg: 3000, we: 300, d: 0.3, mu: 20 }, { wg: 100, we: 4000, d: -0.4, mu: 50 }]) {
    const D = D0(p), M = core.overlapMatrixNumeric(24, 15, D);
    for (let k = 0; k <= 24; k++) for (let n = 0; n <= 15; n++) worst = Math.max(worst, Math.abs(core.overlapAnalytic(k, n, D) - M[k][n]));
  }
  check("3 analytical = numerical at large d (v' <= 24, v'' <= 15)", worst < 1e-8, `max |diff| ${worst.toExponential(1)}`);
}

// 4. sum rule: Σ_v' FC = 1 (eq. 5)
{
  let worst = 0;
  for (const p of [{ wg: 1000, we: 400, d: 0 }, { wg: 1000, we: 1000, d: 0.1 }, { wg: 1500, we: 900, d: 0.08 }])
    for (const vg of [0, 1, 3]) {
      const D = D0(p); let s = 0;
      for (let k = 0; k < 90; k++) s += core.overlapAnalytic(k, vg, D) ** 2;
      worst = Math.max(worst, Math.abs(s - 1));
    }
  check("4 sum rule", worst < 1e-12, `max |sum - 1| ${worst.toExponential(1)}`);
}

// 5. McHale's problem (eq. 8): same R0, from v'' = 0
{
  const wg = 1000, we = 400, D = D0({ wg, we, d: 0 });
  const fc00 = 2 * Math.sqrt(wg * we) / (wg + we), fc20 = Math.sqrt(wg * we) / (we + wg) * ((we - wg) / (we + wg)) ** 2;
  const s20 = Math.sqrt(Math.sqrt(wg * we) / (we + wg)) * (we - wg) / (we + wg);
  let gen = 0;
  for (let n = 0; n <= 6; n++) {
    const f = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600];
    const want = Math.sqrt(fc00) * Math.sqrt(f[2 * n]) / (2 ** n * f[n]) * ((we - wg) / (we + wg)) ** n;
    gen = Math.max(gen, Math.abs(core.overlapAnalytic(2 * n, 0, D) - want), Math.abs(core.overlapAnalytic(2 * n + 1, 0, D)));
  }
  check("5 FC00, FC20, <2|0> sign, <2n|0> general",
    Math.abs(core.overlapAnalytic(0, 0, D) ** 2 - fc00) < 1e-14 && Math.abs(core.overlapAnalytic(2, 0, D) ** 2 - fc20) < 1e-14 &&
    Math.abs(core.overlapAnalytic(2, 0, D) - s20) < 1e-14 && gen < 1e-14,
    `FC00 ${fc00.toFixed(6)} FC20 ${fc20.toFixed(6)}`);
}

// 6. displaced, same frequency: Poisson (eq. 9)
{
  const D = D0({ wg: 1000, we: 1000, d: 0.1 }); let worst = 0, f = 1;
  for (let k = 0; k <= 12; k++) { if (k) f *= k; worst = Math.max(worst, Math.abs(core.overlapAnalytic(k, 0, D) ** 2 - Math.exp(-D.HR) * D.HR ** k / f)); }
  check("6 Poisson progression", worst < 1e-14, `S = ${D.HR.toFixed(4)}`);
}

// 7. parity and orthogonality labels
{
  const t = core.franckCondonTable(core.derive({ wg: 1000, we: 500, d: 0, mu: 7, vg: 0, nE: 8 }));
  const parityOk = t.every(r => r.parity === (r.vE % 2 === 1) && (r.parity ? r.S === 0 : r.S !== 0));
  const t2 = core.franckCondonTable(core.derive({ wg: 1000, we: 1000, d: 0, mu: 7, vg: 2, nE: 8 }));
  const orthOk = t2.every(r => r.vE === 2 ? Math.abs(r.F - 1) < 1e-12 && !r.orthogonal : r.orthogonal && r.S === 0 && r.parity === (r.vE % 2 === 1));
  const t3 = core.franckCondonTable(core.derive({ wg: 1000, we: 500, d: 0.05, mu: 7, vg: 1, nE: 8 }));
  const noneOk = t3.every(r => !r.parity && !r.orthogonal);
  const t4 = core.franckCondonTable(core.derive({ wg: 1000, we: 1001, d: 0, mu: 7, vg: 0, nE: 4 }));
  check("7 parity forbidden / orthogonal flags", parityOk && orthOk && noneOk && t4[2].nearZero && !t4[0].nearZero);
}

// 8. every table formula is the same number as the overlap
{
  let worst = 0, count = 0;
  for (const p of [{ wg: 1000, we: 500, d: 0 }, { wg: 1000, we: 1000, d: 0.1 }, { wg: 1000, we: 700, d: 0.08 }, { wg: 800, we: 1300, d: -0.05 }])
    for (let n = 0; n <= 4; n++) for (let k = 0; k <= 12; k++) {
      const D = D0(p), poly = core.overlapPoly(k, n, D), pre = core.sqrtFactorPrefactor(k, n);
      let s = 0;
      for (const [key, c] of poly) { const e = key.split(",").map(Number); s += Number(c[0]) / Number(c[1]) * D.rho ** e[0] * D.bE ** e[1] * D.bG ** e[2] * D.gam ** e[3]; }
      const val = D.I00 * Number(pre.r[0]) / Number(pre.r[1]) * Math.sqrt(Number(pre.rad)) * s;
      const want = core.overlapAnalytic(k, n, D);
      if (D.sameR && (k + n) % 2) continue;
      worst = Math.max(worst, Math.abs(val - want)); count++;
    }
  check("8 symbolic table expressions evaluate to the overlap", worst < 1e-12, `${count} expressions, max |diff| ${worst.toExponential(1)}`);
}

// 9. KaTeX parses every equation on the page and every table formula
{
  const dec = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const eqs = [...html.matchAll(/<div class="eq">([\s\S]*?)<\/div>/g)].map(x => dec(x[1]).trim());
  const tex = [];
  for (const p of [{ wg: 1000, we: 500, d: 0 }, { wg: 1000, we: 1000, d: 0 }, { wg: 1000, we: 1000, d: 0.1 }, { wg: 1000, we: 700, d: 0.08 }])
    for (let n = 0; n <= 3; n++) for (let k = 0; k <= 24; k++) tex.push(core.texOverlap(k, n, D0(p)));
  const bad = [];
  for (const [src, display] of [...eqs.map(s => [s, true]), ...tex.map(s => [s, false])]) {
    try { katex.renderToString(src, { throwOnError: true, strict: "error", displayMode: display }); } catch (e) { bad.push(`${src.slice(0, 60)}: ${e.message}`); }
  }
  check("9 LaTeX renders", eqs.length >= 20 && bad.length === 0, `${eqs.length} equations, ${tex.length} table formulas${bad.length ? "\n  " + bad.join("\n  ") : ""}`);
  check("9a formula spot checks",
    core.texOverlap(0, 0, D0({ wg: 1000, we: 500, d: 0 })) === "I_{00}" &&
    core.texOverlap(2, 0, D0({ wg: 1000, we: 500, d: 0 })) === "I_{00}\\,\\frac{\\sqrt{2}}{2}\\,\\rho" &&
    core.texOverlap(1, 0, D0({ wg: 1000, we: 500, d: 0 })) === "0" &&
    core.texOverlap(2, 2, D0({ wg: 1000, we: 1000, d: 0 })) === "1");
}

// 10. hot-state populations (the start menu): Σ_v p_v = 1, p_1 at 1000 cm⁻¹ and 298.15 K
{
  let s = 0; for (let v = 0; v < 200; v++) s += core.boltzmannPop(v, 200, 298.15);
  const p1 = core.boltzmannPop(1, 1000, 298.15), x = Math.exp(-1.438776877 * 1000 / 298.15);
  check("10 Boltzmann populations", Math.abs(s - 1) < 1e-12 && Math.abs(p1 - (1 - x) * x) < 1e-15 && Math.abs(100 * p1 - 0.796) < 0.001,
    `p1(1000 cm-1, 298 K) = ${(100 * p1).toFixed(3)} %`);
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
