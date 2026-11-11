// Checks the numerical core embedded in index.html (<script id="core">) against closed forms, published crystal data,
// numbers from an independent Python calculation, the physics the formulas must obey (unitarity, boundary conditions,
// energy) and the worked examples on the page.
//   node tests/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["C0", "DEG", "LN2", "cx", "cadd", "csub", "cmul", "cscale", "cabs", "carg", "cconj", "cexpi", "wrap90",
  "CRYSTALS", "crystalN", "deltaN", "neTheta", "walkoff", "maxWalkoff", "refractUniaxial", "slabExit", "wollaston",
  "jMul", "jApply", "jRot", "waveplateJ", "waveplateJsym", "polarizerJ", "jonesLinear", "jonesEllipse", "RIGHT", "LEFT", "stokes", "ellipseOf", "fieldAt",
  "retarderMueller", "muellerApply", "poincareRotate", "sphereOf", "linearThroughPlate", "betweenPolarizers", "insidePlate",
  "retardance", "plateThickness", "designPlate", "frac", "plateBand", "cmf", "filteredRGB", "toDisplay", "tintRGB",
  "slitsI", "slitsParts", "fringeSpacing", "spectrumSamples", "polyI", "visGauss", "cohLength", "mulberry32", "phaseTrain", "trainPhase", "twoSlitPol", "QUIZ"];
// new Function keeps the core in this realm (Node's vm sandbox makes typed arrays much slower)
const c = new Function(m[1] + `\nreturn {${names.join(",")}};`)(), t0 = Date.now();

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const g = (v, n) => Number(v.toPrecision(n || 6));
const e = v => (v + 1e-300).toExponential(1);
const D = c.DEG, PI = Math.PI;
const rnd = c.mulberry32(20261111), U = (a, b) => a + (b - a) * rnd();
const cz = (a, b) => c.cabs(c.csub(a, b));
const mdiff = (A, B) => Math.max(...A.map((z, i) => cz(z, B[i])));
const vdiff = (a, b) => Math.max(cz(a[0], b[0]), cz(a[1], b[1]));
const angDiff = (a, b, per) => { const d = ((a - b) % per + per + per / 2) % per - per / 2; return Math.abs(d); };

// 1. crystal data: Hecht's Table 8.1 at 589.3 nm and published values elsewhere
{
  const tol = { calcite: 3e-4, quartz: 2e-4, linbo3: 5e-3, kdp: 5e-3, rutile: 7e-3 };
  let worst = "", bad = 0;
  for (const [k, t] of Object.entries(tol)) {
    const r = c.crystalN(k, 589.3), h = c.CRYSTALS[k].hecht, d = Math.max(Math.abs(r.no - h[0]), Math.abs(r.ne - h[1]));
    if (d > t) bad++;
    worst += `${k} ${g(d, 2)}, `;
  }
  const pub = [["bbo", 1064, 1.6551, 1.5425, 2e-4], ["linbo3", 1064, 2.2321, 2.1560, 1.5e-3], ["kdp", 1064, 1.4938, 1.4599, 3e-4], ["mgf2", 589.3, 1.3777, 1.3895, 2e-4], ["sapphire", 589.3, 1.7682, 1.7600, 2e-4]];
  for (const [k, l, no, ne, t] of pub) { const r = c.crystalN(k, l); if (Math.abs(r.no - no) > t || Math.abs(r.ne - ne) > t) { bad++; worst += `${k}@${l} off, `; } }
  const signs = ["quartz", "mgf2", "rutile", "ice"].every(k => c.deltaN(k, 589.3) > 0) && ["calcite", "sapphire", "linbo3", "kdp", "bbo", "nano3", "tourmaline"].every(k => c.deltaN(k, 589.3) < 0);
  check("1 crystal indices: Hecht's 589.3 nm table (calcite, quartz, LiNbO₃, KDP, rutile), BBO, LiNbO₃ and KDP at 1064 nm, MgF₂ and sapphire at 589.3 nm; signs of Δn", bad === 0 && signs, worst.replace(/, $/, ""));
}

// 2. Python reference: quartz and MgF₂ birefringence, plate thicknesses, achromat, bands
{
  const dq = c.deltaN("quartz", 632.8), d0 = c.plateThickness(dq, 632.8, 0.25), m10 = c.plateThickness(dq, 632.8, 10.25);
  const z8 = c.designPlate({ kind: "zero", mat: "quartz", lam: 800, target: 0.25 }), ach = c.designPlate({ kind: "achro", l1: 450, l2: 650, target: 0.25 });
  const zb = c.plateBand(c.designPlate({ kind: "zero", mat: "quartz", lam: 632.8, target: 0.25 }), 632.8, 0.01, 200, 2000);
  const mb = c.plateBand(c.designPlate({ kind: "multi", m: 10, mat: "quartz", lam: 632.8, target: 0.25 }), 632.8, 0.01, 200, 2000);
  check("2 Python numbers: Δn(quartz, 632.8 nm) = 0.0090449, zero-order quarter-wave 17.4905 µm, order 10 717.112 µm, 800 nm plate at 400 nm 0.537568 waves, achromat 269.525 + 220.545 µm, bands 610.30–657.19 and 632.23–633.37 nm",
    rel(dq, 0.009044897065932034) < 1e-12 && rel(d0, 17.490525193024762) < 1e-12 && rel(m10, 717.1115329140154) < 1e-12 && rel(z8.waves(400), 0.5375678564031999) < 1e-12
    && rel(ach.dq, 269.52471293) < 1e-9 && rel(ach.dm, 220.5449245) < 1e-9 && rel(ach.waves(550), 0.26193395684907755) < 1e-9
    && Math.abs(zb[0] - 610.30) < 0.02 && Math.abs(zb[1] - 657.19) < 0.02 && Math.abs(mb[0] - 632.23) < 0.02 && Math.abs(mb[1] - 633.37) < 0.02,
    `d₀ = ${g(d0)} µm, order 10 ${g(m10)} µm, ${g(z8.waves(400))} waves, achromat ${g(ach.dq)} + ${g(ach.dm)} µm, bands ${g(zb[0], 5)}–${g(zb[1], 5)}, ${g(mb[0], 5)}–${g(mb[1], 5)} nm`);
}

// 3. e-wave index and walk-off: limits, the gradient of the dispersion relation, the wavelet ellipse
{
  const no = 1.6584, ne = 1.4864;
  let worst = 0, surf = 0;
  for (let i = 0; i < 200; i++) {
    const th = U(1, 89), n = c.neTheta(no, ne, th), t = th * D, k = [n * Math.sin(t), n * Math.cos(t)], h = 1e-6;   // axis along the second coordinate
    const F = q => q[0] * q[0] / (ne * ne) + q[1] * q[1] / (no * no), gx = (F([k[0] + h, k[1]]) - F([k[0] - h, k[1]])) / (2 * h), gz = (F([k[0], k[1] + h]) - F([k[0], k[1] - h])) / (2 * h);
    const rho = Math.atan2(gx, gz) / D - th;
    worst = Math.max(worst, Math.abs(rho - c.walkoff(no, ne, th)), Math.abs(F(k) - 1));
    const v = 1 / (n * Math.cos(rho * D)), r = [v * Math.sin((th + rho) * D), v * Math.cos((th + rho) * D)];   // ray-speed point lies on the wavelet
    surf = Math.max(surf, Math.abs((r[1] * no) ** 2 + (r[0] * ne) ** 2 - 1));
  }
  const mx = c.maxWalkoff(no, ne);
  check("3 e-wave: n(0°) = n_o, n(90°) = n_e; walk-off = gradient of k⊥²/n_e² + k∥²/n_o²; ray speed lies on the wavelet ellipse; calcite 6.2241° at 45°, at most 6.2612° at 41.870°",
    Math.abs(c.neTheta(no, ne, 0) - no) < 1e-15 && Math.abs(c.neTheta(no, ne, 90) - ne) < 1e-15 && worst < 1e-8 && surf < 1e-12
    && Math.abs(c.walkoff(no, ne, 45) - 6.224117593214103) < 1e-7 && Math.abs(mx.rho - 6.26117090733004) < 1e-7 && Math.abs(mx.th - 41.8696) < 1e-3,
    `gradient vs formula ${e(worst)}, wavelet ${e(surf)}, ρ(45°) = ${g(c.walkoff(no, ne, 45))}°, max ${g(mx.rho)}° at ${g(mx.th)}°`);
}

// 4. refraction into the crystal: k_x conserved, the e-wave obeys its dispersion relation, the worked example
{
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const no = U(1.3, 2.6), ne = U(1.3, 2.6), thI = U(-80, 80), gam = U(-90, 90), R = c.refractUniaxial(1, no, ne, thI, "in", gam), kx = Math.sin(thI * D);
    const k = [R.e.n * Math.sin(R.e.thK * D), R.e.n * Math.cos(R.e.thK * D)], a = [Math.sin(gam * D), Math.cos(gam * D)], ka = k[0] * a[0] + k[1] * a[1], kp2 = R.e.n ** 2 - ka * ka;
    worst = Math.max(worst, Math.abs(k[0] - kx), Math.abs(kp2 / (ne * ne) + ka * ka / (no * no) - 1), Math.abs(R.o.n * Math.sin(R.o.thK * D) - kx));
    const N0 = c.refractUniaxial(1, no, ne, 0, "in", gam);   // normal incidence: n(γ) and the walk-off away from (or toward) the axis
    worst = Math.max(worst, Math.abs(N0.e.n - c.neTheta(no, ne, gam)), Math.abs(Math.abs(N0.e.rho) - Math.abs(c.walkoff(no, ne, gam))));
  }
  const ex = c.refractUniaxial(1, 1.6584, 1.4864, 40, "perp"), rh = c.refractUniaxial(1, 1.6584, 1.4864, 0, "in", 45), gap = c.slabExit(rh, 10, 0).gap;
  check("4 refraction: k_x conserved, e-wave on its dispersion surface, n(γ) and walk-off at normal incidence; calcite at 40° (axis out of the page): 22.8049°, 25.6229°, Δ 2.8179°; rhomb 10 mm: 1.0906 mm",
    worst < 1e-10 && Math.abs(ex.o.thK - 22.804938124264403) < 1e-9 && Math.abs(ex.e.thK - 25.622884560682962) < 1e-9 && Math.abs(gap - 1.0906068289440134) < 1e-8 && rh.e.rho < 0,
    `worst ${e(worst)}, o ${g(ex.o.thK)}°, e ${g(ex.e.thK)}°, gap ${g(gap)} mm`);
}

// 5. Wollaston prism: exact trace against Python, the rule of thumb, symmetry
{
  const w = c.wollaston(1.6584, 1.4864, 45), q = c.wollaston(1.5443, 1.5534, 45), rule = 2 * Math.asin(1.5534 - 1.5443) / D;
  check("5 Wollaston: calcite with 45° wedges 10.5651° and −9.4323° (19.9974°); quartz 1.0428°, close to 2 arcsin|Δn| = 1.0428°",
    Math.abs(w.a - 10.565056487449816) < 1e-9 && Math.abs(w.b + 9.432334888533058) < 1e-9 && Math.abs(q.split - rule) < 0.002, `calcite ${g(w.split)}°, quartz ${g(q.split)}° vs ${g(rule)}°`);
}

// 6. wave-plate Jones matrices: unitary, det e^{iΓ}, the symmetric form, half-wave = mirror, quarter + quarter = half
{
  let worst = 0;
  const id = [c.cx(1), c.cx(0), c.cx(0), c.cx(1)];
  for (let i = 0; i < 300; i++) {
    const th = U(-180, 180), G = U(0, 4 * PI), J = c.waveplateJ(th, G), Jh = J.map(z => c.cconj(z)), JdJ = c.jMul([Jh[0], Jh[2], Jh[1], Jh[3]], J);
    const det = c.csub(c.cmul(J[0], J[3]), c.cmul(J[1], J[2]));
    const built = c.jMul(c.jMul(c.jRot(th), [c.cx(1), c.cx(0), c.cx(0), c.cexpi(G)]), c.jRot(-th));
    worst = Math.max(worst, mdiff(JdJ, id), cz(det, c.cexpi(G)), mdiff(J, c.waveplateJsym(th, G)), mdiff(J, built));
    const th2 = U(-90, 90), H1 = c.waveplateJ(th, PI), H2 = c.waveplateJ(th2, PI), rot = c.jMul(H2, H1);
    worst = Math.max(worst, mdiff(rot, c.jRot(2 * (th2 - th))), mdiff(c.jMul(c.waveplateJ(th, PI / 2), c.waveplateJ(th, PI / 2)), H1));
    const crossed = c.jMul(c.waveplateJ(th + 90, PI / 2), c.waveplateJ(th, PI / 2)), ph = crossed[0];   // equals e^{iπ/2} times 1
    worst = Math.max(worst, mdiff(crossed, [ph, c.cx(0), c.cx(0), ph]), Math.abs(c.cabs(ph) - 1));
    const M = c.waveplateJ(th, PI), c2 = Math.cos(2 * th * D), s2 = Math.sin(2 * th * D);
    worst = Math.max(worst, mdiff(M, [c.cx(c2), c.cx(s2), c.cx(s2), c.cx(-c2)]));
  }
  check("6 Jones: J†J = 1, det J = e^{iΓ}, R(θ)diag(1, e^{iΓ})R(−θ) = e^{iΓ/2}[cos(Γ/2) − i sin(Γ/2)M(θ)], J_λ/2 = M(θ), two half-wave plates turn by 2(θ₂ − θ₁), λ/4 + λ/4 = λ/2, crossed λ/4 plates cancel",
    worst < 1e-12, `worst ${e(worst)} over 300 random plates`);
}

// 7. the sense of rotation: right-circular and χ > 0 turn clockwise seen looking back at the source; ellipse parameters round-trip
{
  let bad = 0, worst = 0;
  const sense = v => { const a = c.fieldAt(v, 0.3), b = c.fieldAt(v, 0.31); return a.x * b.y - a.y * b.x; };   // > 0 counterclockwise (x right, y up)
  if (!(sense(c.RIGHT) < 0 && sense(c.LEFT) > 0 && c.stokes(c.RIGHT)[3] > 0.999 && c.stokes(c.LEFT)[3] < -0.999)) bad++;
  for (let i = 0; i < 300; i++) {
    const psi = U(-89, 89), chi = U(-44, 44), v = c.jonesEllipse(psi, chi), E = c.ellipseOf(v), S = c.stokes(v), P = c.sphereOf(psi, chi);
    if (Math.abs(chi) > 1 && Math.sign(sense(v)) !== -Math.sign(chi)) bad++;
    worst = Math.max(worst, angDiff(E.psi, psi, 180), Math.abs(E.chi - chi), Math.abs(E.ratio - Math.abs(Math.tan(chi * D))), Math.abs(S[0] - 1), ...[1, 2, 3].map(j => Math.abs(S[j] - P[j - 1])));
    const tr = []; for (let k = 0; k < 720; k++) { const f = c.fieldAt(v, 2 * PI * k / 720); tr.push(Math.hypot(f.x, f.y)); }
    worst = Math.max(worst, Math.abs(Math.max(...tr) - Math.cos(chi * D)), Math.abs(Math.min(...tr) - Math.abs(Math.sin(chi * D))));   // semi-axes cos χ and sin χ
  }
  check("7 handedness: (1, −i)/√2 turns clockwise looking back at the source (right, S₃ = +1); χ > 0 clockwise; ψ, χ, b/a and the semi-axes round-trip", bad === 0 && worst < 1e-6, `${bad} wrong senses, worst ${e(worst)}`);
}

// 8. closed forms against the matrices: linear light through any plate, half- and quarter-wave rules, circular light
{
  let worst = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const a = U(-90, 90), th = U(-90, 90), G = U(0, 2 * PI), E = c.ellipseOf(c.jApply(c.waveplateJ(th, G), c.jonesLinear(a))), F = c.linearThroughPlate(a, th, G);
    worst = Math.max(worst, Math.abs(E.chi - F.chi)); if (Math.abs(E.chi) < 44) { worst = Math.max(worst, angDiff(E.psi, F.psi, 180)); n++; }
    const H = c.ellipseOf(c.jApply(c.waveplateJ(th, PI), c.jonesLinear(a)));
    worst = Math.max(worst, angDiff(H.psi, 2 * th - a, 180), Math.abs(H.chi));
    const phi = c.wrap90(a - th), Q = c.ellipseOf(c.jApply(c.waveplateJ(th, PI / 2), c.jonesLinear(a)));
    if (Math.abs(phi) < 44) worst = Math.max(worst, Math.abs(Q.chi + phi), angDiff(Q.psi, th, 180));
    else if (Math.abs(phi) > 46) worst = Math.max(worst, angDiff(Q.psi, th + 90, 180), Math.abs(Math.sin(2 * Q.chi * D) + Math.sin(2 * phi * D)));
    const QR = c.ellipseOf(c.jApply(c.waveplateJ(th, PI / 2), c.RIGHT)), QL = c.ellipseOf(c.jApply(c.waveplateJ(th, PI / 2), c.LEFT));
    const HR = c.ellipseOf(c.jApply(c.waveplateJ(th, PI), c.RIGHT));
    worst = Math.max(worst, Math.abs(QR.chi), Math.abs(QL.chi), angDiff(QR.psi, th + 45, 180), angDiff(QL.psi, th - 45, 180), Math.abs(HR.chi + 45));
    const v = c.jonesEllipse(U(-90, 90), U(-44, 44)), Ev = c.ellipseOf(v), Hv = c.ellipseOf(c.jApply(c.waveplateJ(th, PI), v));
    worst = Math.max(worst, angDiff(Hv.psi, 2 * th - Ev.psi, 180), Math.abs(Hv.chi + Ev.chi));
  }
  check("8 closed forms: tan 2(ψ − θ) = cos Γ tan 2(α − θ), sin 2χ = −sin Γ sin 2(α − θ); λ/2: 2θ − α and −χ; λ/4: axes along the plate, χ = −φ; circular → linear at θ ± 45°; λ/2 flips the hand",
    worst < 1e-8, `worst ${e(worst)} (${n} azimuths compared)`);
}

// 9. Stokes, Mueller and the Poincaré rotation agree with the Jones calculation; plates keep |S|
{
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const v = c.jonesEllipse(U(-90, 90), U(-45, 45)), th = U(-180, 180), G = U(0, 2 * PI), S = c.stokes(v), So = c.stokes(c.jApply(c.waveplateJ(th, G), v));
    const SM = c.muellerApply(c.retarderMueller(th, G), S), SP = c.poincareRotate(S.slice(1), th, G);
    worst = Math.max(worst, ...[0, 1, 2, 3].map(j => Math.abs(So[j] - SM[j])), ...[0, 1, 2].map(j => Math.abs(So[j + 1] - SP[j])), Math.abs(Math.hypot(...SP) - 1));
    const ax = [Math.cos(2 * th * D), Math.sin(2 * th * D), 0], on = c.poincareRotate(ax, th, G);   // the fast-axis point stays put
    worst = Math.max(worst, ...[0, 1, 2].map(j => Math.abs(on[j] - ax[j])));
  }
  check("9 Stokes vector after the plate = Mueller matrix × S = Poincaré rotation by Γ about (cos 2θ, sin 2θ, 0); the fast-axis point stays put", worst < 1e-12, `worst ${e(worst)}`);
}

// 10. a plate between polarizers; the state inside the plate
{
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const a = U(-90, 90), b = U(-90, 180), th = U(-90, 180), G = U(0, 2 * PI);
    const out = c.jApply(c.polarizerJ(b), c.jApply(c.waveplateJ(th, G), c.jonesLinear(a))), I = c.cabs(out[0]) ** 2 + c.cabs(out[1]) ** 2;
    worst = Math.max(worst, Math.abs(I - c.betweenPolarizers(a, b, th, G)), Math.abs(c.betweenPolarizers(a, a + 90, th, G) + c.betweenPolarizers(a, a, th, G) - 1),
      Math.abs(c.betweenPolarizers(a, a + 90, th, G) - Math.sin(2 * (th - a) * D) ** 2 * Math.sin(G / 2) ** 2));
    const phi = U(-90, 90), full = c.jApply(c.waveplateJ(0, G), c.jonesLinear(phi));
    worst = Math.max(worst, vdiff(c.insidePlate(phi, G, 1), full), vdiff(c.insidePlate(phi, G, 0), c.jonesLinear(phi)));
  }
  check("10 between polarizers: the formula = |P(β) J(θ, Γ) ê(α)|²; crossed + parallel = 1; crossed = sin²2(θ − α) sin²(Γ/2); the plate's state at full depth = J ê", worst < 1e-12, `worst ${e(worst)}`);
}

// 11. real plates: thickness ↔ retardance, the achromat is right at both wavelengths, orders
{
  let worst = 0;
  for (const mat of ["quartz", "mgf2", "sapphire", "calcite"]) for (const lam of [355, 532, 800, 1550]) for (const tg of [0.25, 0.5]) {
    const P = c.designPlate({ kind: "multi", m: 3, mat, lam, target: tg }), Z = c.designPlate({ kind: "zero", mat, lam, target: tg });
    worst = Math.max(worst, Math.abs(P.waves(lam) - 3 - tg), Math.abs(Z.waves(lam) - tg), Math.abs(c.retardance(c.deltaN(mat, lam), Z.d, lam) - 2 * PI * tg), Math.abs(P.d / Z.d - (3 + tg) / tg));
  }
  for (const [l1, l2, tg] of [[450, 650, 0.25], [700, 1000, 0.5], [500, 900, 0.25]]) { const A = c.designPlate({ kind: "achro", l1, l2, target: tg }); worst = Math.max(worst, Math.abs(A.waves(l1) - tg), Math.abs(A.waves(l2) - tg)); }
  check("11 real plates: zero- and multi-order retardance exact at the design wavelength for quartz, MgF₂, sapphire and calcite; the quartz + MgF₂ achromat is exact at both wavelengths", worst < 1e-12, `worst ${e(worst)}`);
}

// 12. colors: CIE fit near the tabulated values, white stays white, crossed + parallel = white, the first-order red is magenta
{
  const tab = [[450, 0.3362, 0.0380, 1.7721], [555, 0.5121, 1.0000, 0.0058], [600, 1.0622, 0.6310, 0.0008], [650, 0.2835, 0.1070, 0.0000]];
  let cie = 0;
  for (const [l, x, y, z] of tab) { const f = c.cmf(l); cie = Math.max(cie, Math.abs(f[0] - x), Math.abs(f[1] - y), Math.abs(f[2] - z)); }
  let add = 0;
  for (let R = 0; R <= 3000; R += 37) { const a = c.tintRGB(R, true), b = c.tintRGB(R, false); add = Math.max(add, ...[0, 1, 2].map(j => Math.abs(a[j] + b[j] - 1))); }
  const white = c.toDisplay(c.filteredRGB(() => 1)), black = c.toDisplay(c.tintRGB(0, true)), red1 = c.toDisplay(c.tintRGB(550, true));
  check("12 colors: CIE 1931 fit within 0.05 of the table at 450, 555, 600 and 650 nm; white → (255, 255, 255); R = 0 crossed is black; crossed + parallel = white; 550 nm retardation is magenta (green lowest)",
    cie < 0.05 && white.every(v => v === 255) && black.every(v => v === 0) && add < 1e-12 && red1[1] < red1[0] && red1[1] < red1[2],
    `CIE ${g(cie, 2)}, crossed + parallel ${e(add)}, 550 nm → rgb(${red1.join(", ")})`);
}

// 13. slits: the formula against a direct sum of the fields from points across each slit, with exact distances
{
  const lam = 632.8e-9, d = 0.25e-3, a = 0.05e-3, L = 1e6;   // far away, so Fraunhofer holds (Fresnel phase across 5 slits ≈ 5 × 10⁻⁶ rad)
  let worst = 0;
  for (const N of [1, 2, 3, 5]) for (const y of [0, 0.13, 0.31, 0.507, 1.234, 2.71].map(f => f * lam * L / d)) {
    let re = 0, im = 0; const M = 400;
    for (let j = 0; j < N; j++) for (let s = 0; s < M; s++) {
      const ys = j * d + (s + 0.5) / M * a - a / 2, h = y - ys, r = Math.hypot(L, h), ph = 2 * PI * (h * h / (r + L)) / lam;   // r − L, without rounding error
      re += Math.cos(ph) / M; im += Math.sin(ph) / M;
    }
    worst = Math.max(worst, Math.abs(re * re + im * im - c.slitsI(y, lam, d, a, L, N)) / (N * N));
  }
  // array factor against sin(Nδ/2)/sin(δ/2) away from its singular points; fringe average 2I₁ for two narrow slits
  let af = 0;
  for (let i = 0; i < 200; i++) { const N = 2 + Math.floor(rnd() * 8), dl = U(0.1, 6.1), y = dl * lam * 1.5 / (2 * PI * d); const p = c.slitsParts(y, lam, d, 0, 1.5); if (Math.abs(Math.sin(p.delta / 2)) < 0.05) continue; af = Math.max(af, Math.abs(c.slitsI(y, lam, d, 0, 1.5, N) - (Math.sin(N * p.delta / 2) / Math.sin(p.delta / 2)) ** 2) / (N * N)); }
  let avg = 0; const dy = c.fringeSpacing(lam, d, 1.5); for (let i = 0; i < 1000; i++) avg += c.slitsI((i + 0.5) / 1000 * dy, lam, d, 0, 1.5, 2) / 1000;
  check("13 slits: sinc²β × |Σe^{ijδ}|² = direct sum over 400 points per slit for 1, 2, 3, 5 slits; array factor = (sin(Nδ/2)/sin(δ/2))²; the average over a fringe is 2I₁",
    worst < 1e-5 && af < 1e-12 && Math.abs(avg - 2) < 1e-4, `direct sum ${e(worst)}, array factor ${e(af)}, average ${g(avg)}`);
}

// 14. coherence: a Gaussian line gives 2I₁[1 + V cos k₀Δr]; V(0.441ℓ_c) = ½; random phase jumps give V = e^{−Δr/ℓ}
{
  const lam0 = 630e-9, dl = 20e-9, d = 0.25e-3, L = 1, smp = c.spectrumSamples("gauss", lam0, dl);
  let worst = 0;
  for (let i = 0; i <= 60; i++) { const y = i * 1.2e-3, s = y / Math.hypot(y, L), dr = d * s, V = c.visGauss(dr, lam0, dl); worst = Math.max(worst, Math.abs(c.polyI(y, smp, d, 0, L, 2) - 2 * (1 + V * Math.cos(2 * PI * dr / lam0)))); }
  const half = c.visGauss(2 * Math.LN2 / PI * c.cohLength(lam0, dl), lam0, dl);
  const tr = c.phaseTrain(5, 2e6, 10), gaps = tr.pos.length - 1, meanGap = tr.pos[tr.pos.length - 1] / gaps;
  let same = 0, avg = 0; const M = 200000, dr = 7.3;
  for (let i = 0; i < M; i++) { const t = 1000 + i * 9.7; const a = c.trainPhase(tr, t), b = c.trainPhase(tr, t - dr); if (a === b) same++; avg += 2 + 2 * Math.cos(a - b + 2 * PI * dr); }
  const want = Math.exp(-dr / 10);
  check("14 coherence: Gaussian line summed over 121 wavelengths = 2I₁[1 + V cos k₀Δr]; V = ½ at 0.441ℓ_c; seeded wave trains: mean length ℓ, no jump within Δr a fraction e^{−Δr/ℓ} of the time, average 2I₁[1 + e^{−Δr/ℓ} cos k₀Δr]",
    worst < 2e-4 && Math.abs(half - 0.5) < 1e-12 && Math.abs(meanGap / 10 - 1) < 0.02 && Math.abs(same / M - want) < 0.01 && Math.abs(avg / M - 2 * (1 + want * Math.cos(2 * PI * dr))) < 0.02,
    `line ${e(worst)}, mean train ${g(meanGap, 4)} λ, matched ${g(same / M, 4)} vs ${g(want, 4)}, average ${g(avg / M, 4)} vs ${g(2 * (1 + want * Math.cos(2 * PI * dr)), 4)}`);
}

// 15. polarization and interference: half-wave plate over one slit gives V = |cos 2θ|; quarter-wave at 45°: 0.7071 and ⅛ fringe; a polarizer; energy
{
  let worst = 0;
  const e1 = c.jonesLinear(0);
  for (let i = 0; i < 200; i++) {
    const th = U(0, 180), H = c.twoSlitPol(0, e1, c.jApply(c.waveplateJ(th, PI), e1)), P = c.twoSlitPol(0, e1, c.jApply(c.polarizerJ(th), e1)), cb = Math.cos(th * D) ** 2;
    worst = Math.max(worst, Math.abs(H.V - Math.abs(Math.cos(2 * th * D))), Math.abs(P.V - 2 * cb / (1 + cb)));
    let mean = 0; const e2 = c.jApply(c.waveplateJ(th, U(0, 2 * PI)), e1); for (let k = 0; k < 64; k++) mean += c.twoSlitPol(2 * PI * k / 64, e1, e2).I / 64;
    worst = Math.max(worst, Math.abs(mean - 2));
  }
  const Q = c.twoSlitPol(0, e1, c.jApply(c.waveplateJ(45, PI / 2), e1)), O = c.twoSlitPol(1.234, e1, c.jonesLinear(90));
  check("15 polarization and interference: half-wave plate at θ → V = |cos 2θ|; polarizer → 2cos²θ/(1 + cos²θ); quarter-wave at 45° → V = 0.7071, shift 45° (⅛ fringe); crossed polarizations: I = 2I₁, no fringes; the average stays 2I₁",
    worst < 1e-12 && Math.abs(Q.V - Math.SQRT1_2) < 1e-12 && Math.abs(Q.shift / D - 45) < 1e-9 && O.V < 1e-15 && Math.abs(O.I - 2) < 1e-15, `worst ${e(worst)}, quarter-wave V = ${g(Q.V)}, shift ${g(Q.shift / D)}°`);
}

// 16. the worked examples: every answer exists and has the value computed independently (Python above or by hand)
{
  const want = { k1: 11.571582346609264, k2: 1.5653568260606654, d1: 25.622884560682962, d2: 22.804938124264403, d3: 2.817946436418559, d5: 1.0906068289440134, d6: 19.997391375982872,
    i1: 17.490525193024762, i2: 27.63989442639817, i3: 1.3342564224416003, i4: 0.5, g1: -30, g2: 45, g3: 0.5773502691896257, g5: 27.367805158622673, b1: 45, b2: 0.5, b3: 0.5, b4: 0.25,
    r1: 717.1115329140154, r2: 0.5375678564031999, y1: 3.7968, y2: 0.4350854127498837, y3: 5.6952, y4: 0.5, y5: 9, c1: 19.845, c2: 0.4412712003053032, c3: 2, f1: 0, f2: Math.SQRT1_2, f3: Math.SQRT1_2 };
  const bad = [];
  for (const [k, q] of Object.entries(c.QUIZ)) { if (q.choices ? !q.choices.some(([v]) => v === q.answer) : !Number.isFinite(q.value)) bad.push(k); if (!q.how) bad.push(k + " no text"); }
  for (const [k, v] of Object.entries(want)) { const q = c.QUIZ[k]; if (!q || (v === 0 ? Math.abs(q.value) > 1e-12 : rel(q.value, v) > 2e-5)) bad.push(`${k} ${q && q.value}`); }
  const choice = { k3: "pos", d4: "o", g4: "l45", x1: "a", x2: "hwp", b5: "m", r3: "a", y6: "red" };
  for (const [k, v] of Object.entries(choice)) if (!c.QUIZ[k] || c.QUIZ[k].answer !== v) bad.push(`${k} answer`);
  const els = [...html.matchAll(/class="qa" data-q="(\w+)"/g)].map(x => x[1]), missing = els.filter(k => !c.QUIZ[k]), unused = Object.keys(c.QUIZ).filter(k => !els.includes(k));
  check("16 worked examples: answers and texts present, values right, every example on the page has an answer", bad.length === 0 && missing.length === 0 && unused.length === 0,
    `${els.length} examples${bad.length ? "; bad: " + bad.join(", ") : ""}${missing.length ? "; missing: " + missing.join(", ") : ""}${unused.length ? "; unused: " + unused.join(", ") : ""}`);
}

// 17. every equation parses in the bundled KaTeX in strict mode: the display equations, the inline \( … \) math in the
// page text and in the worked answers, so a typo or a stray Unicode symbol fails here instead of showing red on the page
{
  const katex = createRequire(import.meta.url)(path.join(root, "vendor/katex/katex.min.js"));
  const decode = x => x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const display = [...body.matchAll(/<div class="eq">([\s\S]*?)<\/div>/g)].map(x => decode(x[1].trim()));
  const inline = [...body.replace(/<div class="eq">[\s\S]*?<\/div>/g, "").matchAll(/\\\(([\s\S]+?)\\\)/g)].map(x => decode(x[1]));
  const quiz = Object.values(c.QUIZ).flatMap(q => [q.how, q.unit || "", ...(q.choices || []).map(ch => ch[1])]).flatMap(t => [...String(t).matchAll(/\\\(([\s\S]+?)\\\)/g)].map(x => x[1]));
  const bad = [];
  for (const [src, mode] of [...display.map(x => [x, true]), ...inline.map(x => [x, false]), ...quiz.map(x => [x, false])]) {
    try { katex.renderToString(src, { displayMode: mode, throwOnError: true, strict: "error" }); } catch (err) { bad.push(`"${src.slice(0, 40)}…": ${String(err.message).split("\n")[0]}`); }
  }
  // no formula left as plain text with HTML sub- and superscripts in the prose (labels of number boxes excepted)
  const leftovers = [...body.matchAll(/<(p|li|td|th)[^>]*>(?:(?!<\/\1>)[\s\S])*?<su[bp]>/g)].map(x => x[0].slice(-60));
  check("17 every equation parses in KaTeX (strict): display, inline in the text and inline in the worked answers; no formulas left in plain text",
    display.length > 40 && inline.length > 100 && quiz.length > 60 && bad.length === 0 && leftovers.length === 0,
    `${display.length} display, ${inline.length} inline in the text, ${quiz.length} in the answers${bad.length ? "; " + bad.join("; ") : ""}${leftovers.length ? "; plain: " + leftovers.join(" | ") : ""}`);
}

console.log(`${fails ? `${fails} FAILED` : "all passed"} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
