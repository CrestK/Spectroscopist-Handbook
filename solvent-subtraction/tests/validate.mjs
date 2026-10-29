// Checks the numerical core embedded in index.html (<script id="core">): the Igor file readers and writers, the numerics
// and every subtraction method on synthetic spectra with known scale, shift and broadening.
//   node tests/validate.mjs        (about 15 s)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["parseIBW", "parsePXP", "parseITX", "parseDelimited", "readWaveFile", "writeIBW", "writeITX", "writeDelimited", "ibwChecksum",
  "igorName", "spline", "splineAt", "savitzkyGolay", "fft", "makeReference", "broadened", "sampleRef", "lstsq", "parseRegions",
  "subtract", "compareMethods", "METHODS", "makeExample", "FWHM_PER_SIGMA", "hsvdDenoise", "symEig", "hermEig"];
// new Function keeps the core in this realm (Node's vm sandbox makes typed arrays much slower)
const core = new Function(m[1] + `\nreturn {${names.join(",")}};`)();

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const close = (a, b, tol) => Math.abs(a - b) <= tol;
const enc = s => new TextEncoder().encode(s);
const P = (r, k) => { const p = r.params.find(q => q.key === k); return p ? p.value : NaN; };

/* ---------- synthetic spectra ---------- */
const FW = core.FWHM_PER_SIGMA;
const SOLVENT = [[384, 0.08, 6], [426, 0.1, 6], [801, 1, 6.5], [1028, 0.45, 7], [1157, 0.12, 7], [1266, 0.36, 8], [1347, 0.06, 8], [1444, 0.55, 9]];
const SOLUTE = [[620, 0.18, 18], [1175, 0.3, 16], [1330, 0.26, 20], [1550, 0.42, 18], [1610, 0.24, 14]];
const REGIONS = [[770, 835], [1005, 1050], [1415, 1475]];
const lor = (x, b) => b[1] / (1 + 4 * ((x - b[0]) / b[2]) ** 2);
const gau = (x, b) => b[1] * Math.exp(-4 * Math.LN2 * ((x - b[0]) / b[2]) ** 2);
// sample: scale·[solvent ⊗ Gaussian(gf) ⊗ Lorentzian(lf)](x − shift(x)) + solute + baseline; exact for Gaussian bands
// (widths add in quadrature) and for Lorentzian bands (widths add), numerical quadrature for Lorentzian ⊗ Gaussian
function synth({ shape = "lor", scale = 0.8, shift = 0, gf = 0, lf = 0, stretch = 0, xc = 1050, dx = 1.4, solute = true, base = true, x0 = 300, n } = {}) {
  n = n || Math.round(1500 / dx);
  const x = Float64Array.from({ length: n }, (_, i) => x0 + i * dx), S = new Float64Array(n), R = new Float64Array(n);
  const sig = gf / FW, nodes = [];
  if (shape === "lor" && gf > 0) { let ws = 0; for (let j = -240; j <= 240; j++) { const s = 6 * sig * j / 240, w = Math.exp(-s * s / (2 * sig * sig)); nodes.push([s, w]); ws += w; } nodes.forEach(q => { q[1] /= ws; }); }
  for (let i = 0; i < n; i++) {
    const xs = x[i] - shift - stretch * (x[i] - xc);
    let sv = 0;
    for (const b of SOLVENT) {
      if (shape === "gauss") { const w = Math.sqrt(b[2] ** 2 + gf ** 2); sv += gau(xs, [b[0], b[1] * b[2] / w, w]); }
      else if (gf > 0) for (const [s, w] of nodes) sv += w * lor(xs - s, [b[0], b[1] * b[2] / (b[2] + lf), b[2] + lf]);
      else sv += lor(xs, [b[0], b[1] * b[2] / (b[2] + lf), b[2] + lf]);
    }
    S[i] = scale * sv + (solute ? SOLUTE.reduce((s, b) => s + lor(x[i], b), 0) : 0) + (base ? 0.12 + 0.04 * (x[i] - 1050) / 750 : 0);
    R[i] = SOLVENT.reduce((s, b) => s + (shape === "gauss" ? gau(x[i], b) : lor(x[i], b)), 0);
  }
  return { x, S, R };
}
const run = (d, id, opt) => core.subtract({ x: d.x, y: d.S }, { x: d.x, y: d.R }, id, Object.assign({ regions: REGIONS, baseline: 1 }, opt || {}));

// 1. .ibw writer and reader round trip (version 5, extended units, NaN/INF, note, checksum)
{
  const data = Float64Array.from([1.5, -2.25, NaN, Infinity, -Infinity, 1e-300, 123456.789]);
  const bytes = core.writeIBW({ name: "my wave!", data, x0: 1234.5, dx: -0.75, xUnits: "cm-1", dataUnits: "mOD", note: "line 1\nline 2 δ" });
  const w = core.parseIBW(bytes);
  const same = Array.from(data).every((v, i) => Object.is(v, w.data[i]));
  check("1 .ibw round trip", same && w.name === "my_wave_" && w.x0 === 1234.5 && w.dx === -0.75 && w.xUnits === "cm-1" && w.dataUnits === "mOD"
    && w.note === "line 1\nline 2 delta" && w.version === 5 && core.ibwChecksum(bytes, true, 384) === 0, `name ${w.name}, units ${w.xUnits}/${w.dataUnits}, note ${JSON.stringify(w.note)}`);
}

// 2. hand-built version 2 (big-endian, float32, note) and version 5 (big-endian, 2D int16) files laid out as in TN003
function ibw2BE(name, values, hsA, hsB, note) {
  const n = values.length, nb = enc(note), size = 16 + 110 + 4 * n + 16 + nb.length, u8 = new Uint8Array(size), dv = new DataView(u8.buffer);
  dv.setInt16(0, 2); dv.setInt32(2, 126 + 4 * n); dv.setInt32(6, nb.length);
  const B = 16;
  dv.setInt16(B, 2); u8.set(enc(name), B + 6); u8.set(enc("V"), B + 34); u8.set(enc("s"), B + 38);
  dv.setInt32(B + 42, n); dv.setFloat64(B + 48, hsA); dv.setFloat64(B + 56, hsB);
  values.forEach((v, i) => dv.setFloat32(B + 110 + 4 * i, v));
  u8.set(nb, B + 110 + 4 * n + 16);
  return u8;
}
function ibw5BE2D(name, rows, cols) {
  const n = rows * cols, u8 = new Uint8Array(384 + 2 * n), dv = new DataView(u8.buffer);
  dv.setInt16(0, 5); dv.setInt32(4, 320 + 2 * n);
  dv.setInt32(64 + 12, n); dv.setInt16(64 + 16, 0x10); u8.set(enc(name), 64 + 28);
  dv.setInt32(64 + 68, rows); dv.setInt32(64 + 72, cols); dv.setFloat64(64 + 84, 2); dv.setFloat64(64 + 116, 10);
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) dv.setInt16(384 + 2 * (r + c * rows), 100 * c + r - 3);
  return u8;
}
{
  const w = core.parseIBW(ibw2BE("ver2", [5, 4, 3.5, -2], 0.5, 100, "hello\rworld"));
  check("2a version 2 big-endian", w.name === "ver2" && Array.from(w.data).join() === "5,4,3.5,-2" && w.dx === 0.5 && w.x0 === 100 && w.note === "hello\nworld" && w.xUnits === "s",
    `${w.name} [${Array.from(w.data)}] note ${JSON.stringify(w.note)}`);
  const v = core.parseIBW(ibw5BE2D("img", 4, 3));
  check("2b version 5 big-endian 2D int16", v.dims.join() === "4,3" && v.data[0] === -3 && v.data[4 + 1] === 98 && v.data[2 * 4 + 3] === 200 && v.dx === 2 && v.x0 === 10,
    `dims ${v.dims}, [${Array.from(v.data)}]`);
  let threw = false; try { core.parseIBW(new Uint8Array(200)); } catch (_) { threw = true; }
  check("2c rejects a file that is not a wave", threw);
}

// 3. Igor text
{
  const itx = [
    "IGOR",
    "WAVES/D/O\twn\t'my spec'",
    "BEGIN",
    "\t100\t1.5",
    "\t101\tNaN",
    "\t102\t-INF",
    "END",
    "X SetScale/P x 5,0.5,\"cm-1\", 'my spec'; SetScale d 0,0,\"OD\", 'my spec'",
    "X Note 'my spec', \"first\\rsecond; \\\"quoted\\\"\"",
    "WAVES/N=(3,2) img",
    "BEGIN",
    "1\t4",
    "2\t5",
    "3\t6",
    "END",
    "X SetScale/I x 0,10,\"\", img",
    "WAVES/T labels",
    "BEGIN",
    "\"a\"",
    "END",
    "WAVES/S plain",
    "BEGIN",
    "7",
    "8",
    "END",
    "X SetScale x 0,10,\"\", plain",
  ].join("\r\n");
  const r = core.parseITX(itx), w = r.waves;
  const spec = w.find(q => q.name === "my spec"), img = w.find(q => q.name === "img"), plain = w.find(q => q.name === "plain");
  check("3a .itx waves, scaling, units, note", w.length === 4 && spec.x0 === 5 && spec.dx === 0.5 && spec.xUnits === "cm-1" && spec.dataUnits === "OD"
    && Number.isNaN(spec.data[1]) && spec.data[2] === -Infinity && spec.note === 'first\nsecond; "quoted"', `${w.map(q => q.name)}; note ${JSON.stringify(spec.note)}`);
  check("3b .itx 2D, /I and full scaling, text wave skipped", img.dims.join() === "3,2" && Array.from(img.data).join() === "1,2,3,4,5,6" && img.dx === 5 && plain.dx === 5
    && r.skipped.length === 1, `img dx ${img.dx}, plain dx ${plain.dx}, skipped ${r.skipped}`);
  const out = core.writeITX([{ name: "res", data: Float64Array.from([1, NaN, 2.5e-7]), x0: 3, dx: -0.1, xUnits: "cm-1", note: "a\nb \"c\"" }, { name: "x_w", data: Float64Array.from([9, 8, 7]) }]);
  const back = core.parseITX(out).waves;
  check("3c .itx writer round trip", back[0].name === "res" && back[0].x0 === 3 && back[0].dx === -0.1 && Number.isNaN(back[0].data[1]) && back[0].data[2] === 2.5e-7
    && back[0].note === 'a\nb "c"' && Array.from(back[1].data).join() === "9,8,7");
}

// 4. packed experiment: folders, superseded and non-wave records, both byte orders
{
  const rec = (type, body, le) => { const u8 = new Uint8Array(8 + body.length), dv = new DataView(u8.buffer); dv.setUint16(0, type, le); dv.setInt16(2, 0, le); dv.setInt32(4, body.length, le); u8.set(body, 8); return u8; };
  const folder = name => { const b = new Uint8Array(32); b.set(enc(name)); return b; };
  const cat = parts => { const u8 = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { u8.set(p, o); o += p.length; } return u8; };
  const le = cat([rec(1, new Uint8Array(40), true), rec(9, folder("Data"), true), rec(3, core.writeIBW({ name: "spec", data: Float64Array.from([1, 2, 3]), x0: 0, dx: 1 }), true),
    rec(3 | 0x8000, core.writeIBW({ name: "old", data: Float64Array.from([0]), x0: 0, dx: 1 }), true), rec(10, new Uint8Array(0), true),
    rec(3, core.writeIBW({ name: "top", data: Float64Array.from([4]), x0: 0, dx: 1 }), true), rec(2, enc("history"), true)]);
  const a = core.parsePXP(le);
  check("4a .pxp little-endian", a.waves.map(w => w.name).join() === "root:Data:spec,root:top" && Array.from(a.waves[0].data).join() === "1,2,3", a.waves.map(w => w.name).join());
  const be = cat([rec(9, folder("BE"), false), rec(3, ibw2BE("w2", [1, 2], 1, 0, ""), false), rec(10, new Uint8Array(0), false)]);
  const b = core.parsePXP(be);
  check("4b .pxp big-endian", b.waves.length === 1 && b.waves[0].name === "root:BE:w2" && Array.from(b.waves[0].data).join() === "1,2", b.waves.map(w => w.name).join());
}

// 5. delimited text and sniffing by content
{
  const csv = core.parseDelimited("# comment\nwavenumber,intensity\n100,1\n101,\n102,3\n");
  check("5a CSV with header and an empty cell", csv.waves.map(w => w.name).join() === "wavenumber,intensity" && Number.isNaN(csv.waves[1].data[1]) && csv.waves[0].data[2] === 102);
  const ws = core.parseDelimited("1 2 3\n4 5 6\n");
  check("5b whitespace columns", ws.waves.length === 3 && ws.waves[2].data[1] === 6 && ws.waves[0].name === "col0");
  const t = core.readWaveFile("export.txt", enc("IGOR\nWAVES w\nBEGIN\n1\n2\nEND\n"));
  const b = core.readWaveFile("noext", core.writeIBW({ name: "bin", data: Float64Array.from([3, 4]), x0: 0, dx: 1 }));
  const tsv = core.writeDelimited([{ name: "x", data: Float64Array.from([1, 2]) }, { name: "y", data: Float64Array.from([NaN, 5]) }]);
  const back = core.parseDelimited(tsv);
  check("5c sniffs .itx in .txt and .ibw without extension; .txt writer round trip", t.waves[0].name === "w" && b.waves[0].name === "bin"
    && back.waves[1].name === "y" && Number.isNaN(back.waves[1].data[0]) && back.waves[1].data[1] === 5);
  let threw = false; try { core.readWaveFile("exp.h5xp", new Uint8Array(10)); } catch (e) { threw = /HDF5/.test(e.message); }
  check("5d .h5xp refused with a reason", threw);
}

// 6. fit regions
{
  const r = core.parseRegions("770-835, 1005 – 1050; -50--20\n2900 to 3000");
  let threw = false; try { core.parseRegions("770-835, abc"); } catch (_) { threw = true; }
  check("6 fit regions", JSON.stringify(r) === "[[770,835],[1005,1050],[-50,-20],[2900,3000]]" && threw, JSON.stringify(r));
}

// 7. numerics: spline, FFT, broadening, shifting, least squares, smoothing
{
  const x = Float64Array.from({ length: 40 }, (_, i) => i * 0.37 + 0.01 * i * i), y = x.map(v => Math.sin(v));
  const sp = core.spline(x, y);
  let nodes = 0, mid = 0, lin = 0;
  for (let i = 0; i < x.length; i++) nodes = Math.max(nodes, Math.abs(core.splineAt(sp, x[i]) - y[i]));
  let hmax = 0;
  for (let i = 3; i < x.length - 4; i++) { const xm = 0.5 * (x[i] + x[i + 1]); hmax = Math.max(hmax, x[i + 1] - x[i]); mid = Math.max(mid, Math.abs(core.splineAt(sp, xm) - Math.sin(xm))); }
  const sl = core.spline(x, x.map(v => 2 * v - 1));
  for (let k = 0; k < 100; k++) { const xq = x[0] + (x[39] - x[0]) * k / 99; lin = Math.max(lin, Math.abs(core.splineAt(sl, xq) - (2 * xq - 1))); }
  const bound = 5 / 384 * hmax ** 4; // interior error bound for |f''''| <= 1
  check("7a natural cubic spline", nodes < 1e-14 && mid < bound && lin < 1e-12, `nodes ${nodes.toExponential(1)}, midpoints ${mid.toExponential(1)} (bound ${bound.toExponential(1)}), linear ${lin.toExponential(1)}`);

  const n = 64, re = Float64Array.from({ length: n }, (_, i) => Math.cos(0.3 * i) + 0.1 * i), im = Float64Array.from({ length: n }, (_, i) => Math.sin(0.7 * i));
  const r2 = Float64Array.from(re), i2 = Float64Array.from(im);
  core.fft(r2, i2, false);
  let e = 0;
  for (let k = 0; k < n; k++) {
    let sr = 0, si = 0;
    for (let j = 0; j < n; j++) { const a = -2 * Math.PI * j * k / n; sr += re[j] * Math.cos(a) - im[j] * Math.sin(a); si += re[j] * Math.sin(a) + im[j] * Math.cos(a); }
    e = Math.max(e, Math.abs(sr - r2[k]), Math.abs(si - i2[k]));
  }
  core.fft(r2, i2, true);
  let e2 = 0; for (let k = 0; k < n; k++) e2 = Math.max(e2, Math.abs(r2[k] - re[k]), Math.abs(i2[k] - im[k]));
  check("7b FFT = DFT, inverse round trip", e < 1e-11 && e2 < 1e-13, `${e.toExponential(1)}, ${e2.toExponential(1)}`);

  // Gaussian ⊗ Gaussian and Lorentzian ⊗ Lorentzian broadening against the closed forms
  const g = synth({ shape: "gauss", gf: 3, solute: false, base: false, scale: 1 }), refG = core.makeReference(g.x, g.R, 0);
  const bG = core.sampleRef(refG, core.broadened(refG, 3, 0), g.x, 0, 0, 0);
  const l = synth({ lf: 2, solute: false, base: false, scale: 1 }), refL = core.makeReference(l.x, l.R, 0);
  const bL = core.sampleRef(refL, core.broadened(refL, 0, 2), l.x, 0, 0, 0);
  let eg = 0, el = 0;
  for (let i = 0; i < g.x.length; i++) { if (g.x[i] > 360 && g.x[i] < 1750) eg = Math.max(eg, Math.abs(bG[i] - g.S[i])); }
  for (let i = 0; i < l.x.length; i++) { if (l.x[i] > 360 && l.x[i] < 1750) el = Math.max(el, Math.abs(bL[i] - l.S[i])); }
  check("7c FFT broadening = closed forms (Gaussian, Lorentzian)", eg < 5e-4 && el < 3e-3, `max error ${eg.toExponential(1)}, ${el.toExponential(1)} (band height 1)`);

  const s = synth({ shape: "gauss", shift: 2.3, solute: false, base: false, scale: 1 }), refS = core.makeReference(s.x, s.R, 0);
  const sh = core.sampleRef(refS, refS.g, s.x, 2.3, 0, 0);
  let es = 0; for (let i = 0; i < s.x.length; i++) if (s.x[i] > 340 && s.x[i] < 1780) es = Math.max(es, Math.abs(sh[i] - s.S[i]));
  check("7d shifted reference (spline + cubic)", es < 2e-3, `max error ${es.toExponential(1)} for a 2.3 shift (band height 1, spacing 1.4)`);

  const N = 200, xs = Float64Array.from({ length: N }, (_, i) => i / 10), noise = Float64Array.from({ length: N }, (_, i) => 0.01 * Math.sin(17.3 * i * i));
  const yy = xs.map((v, i) => 2 - 0.5 * v + noise[i]), one = new Float64Array(N).fill(1);
  const f = core.lstsq([one, xs, xs.map(v => 3 * v)], yy, null);
  const mx = xs.reduce((a, b) => a + b) / N, sxx = xs.reduce((a, v) => a + (v - mx) ** 2, 0), seB = Math.sqrt(f.rss / (N - 2) / sxx);
  check("7e least squares, dependent column, standard error", close(f.coef[0], 2, 0.01) && close(f.coef[1], -0.5, 0.002) && f.coef[2] === 0 && Number.isNaN(f.se[2]) && close(f.se[1], seB, 1e-12),
    `a ${f.coef[0].toFixed(4)}, b ${f.coef[1].toFixed(5)}, se ${f.se[1].toExponential(3)} vs ${seB.toExponential(3)}`);

  const q = Float64Array.from({ length: 30 }, (_, i) => 0.5 * i * i - 3 * i + 1), sg = core.savitzkyGolay(q, 7, 2);
  check("7f Savitzky–Golay keeps a quadratic (edges too)", q.every((v, i) => close(v, sg[i], 1e-9)));
}

// 8. scale-only methods
{
  const d = synth({ scale: 0.7, solute: false });
  const ls = run(d, "ls");
  const b0 = 0.12 + 0.04 * (ls.xc - 1050) / 750, b1 = 0.04 * ls.hw / 750; // baseline in t = (x − x_c)/w
  check("8a least squares, linear baseline", close(P(ls, "scale"), 0.7, 1e-9) && close(P(ls, "b0"), b0, 1e-9) && close(P(ls, "b1"), b1, 1e-9), `a ${P(ls, "scale")}, b0 ${P(ls, "b0")}, b1 ${P(ls, "b1")}`);
  const ga = synth({ shape: "gauss", scale: 0.7, solute: false });
  const ar = run(ga, "area", { regions: [[770, 835], [995, 1060]] });
  check("8b peak area ratio", close(P(ar, "scale"), 0.7, 2e-3) && close(P(ar, "ratio1"), 0.7, 3e-3), `a ${P(ar, "scale").toFixed(5)}, regions ${P(ar, "ratio1").toFixed(4)}, ${P(ar, "ratio2").toFixed(4)}`);
  const broad = (() => { const s = synth({ scale: 0.7, solute: false, base: false }); return { x: s.x, R: s.R, S: s.S.map((v, i) => v + 0.3 * Math.exp(-(((s.x[i] - 1000) / 150) ** 2))) }; })();
  const ro1 = run(broad, "rough", { regions: [], roughOrder: 1 }), ro2 = run(broad, "rough", { regions: [] }), tv = run(broad, "tv", { regions: [] });
  check("8c minimum roughness (1st, 2nd difference) and total variation with a broad solute band", close(P(ro1, "scale"), 0.7, 5e-3) && close(P(ro2, "scale"), 0.7, 1e-3) && close(P(tv, "scale"), 0.7, 5e-3),
    `${P(ro1, "scale").toFixed(5)}, ${P(ro2, "scale").toFixed(5)}, ${P(tv, "scale").toFixed(5)}`);
  const fo = run(d, "ls", { fitOn: 1 });
  check("8d least squares on the first difference", close(P(fo, "scale"), 0.7, 1e-9), `a ${P(fo, "scale")}`);
}

// 9. Taylor expansion
{
  const sh = synth({ shape: "gauss", shift: 0.3, solute: false });
  const t1 = run(sh, "t1", { deriv: "fine" }), t1g = run(sh, "t1"), t1i = run(sh, "t1", { iterate: true });
  check("9a 1st order, shift 0.3 (fine, np.gradient, iterated)", close(P(t1, "shift"), 0.3, 0.01) && close(P(t1, "a0"), 0.8, 0.005) && close(P(t1g, "shift"), 0.3, 0.03)
    && close(P(t1i, "shift"), 0.3, 1e-3), `δ ${P(t1, "shift").toFixed(4)}, ${P(t1g, "shift").toFixed(4)}, ${P(t1i, "shift").toFixed(5)}`);
  const sb = synth({ shape: "gauss", shift: 0.3, gf: 2, solute: false });
  const t2 = run(sb, "t2", { deriv: "fine" }), t2i = run(sb, "t2", { iterate: true }), t3 = run(sb, "t3", { iterate: true }), nl = run(sb, "sbg");
  check("9b 2nd order, shift 0.3 + Gaussian FWHM 2", close(P(t2, "shift"), 0.3, 0.03) && close(P(t2, "gfwhm"), 2, 0.3), `δ ${P(t2, "shift").toFixed(4)}, FWHM ${P(t2, "gfwhm").toFixed(3)}`);
  check("9c iterated 2nd order = nonlinear fit ≈ true values", close(P(t2i, "shift"), P(nl, "shift"), 1e-4) && close(P(t2i, "gfwhm"), P(nl, "gfwhm"), 1e-3)
    && close(P(t2i, "shift"), 0.3, 2e-3) && close(P(t2i, "gfwhm"), 2, 0.03) && close(P(t2i, "a0"), 0.8, 2e-3),
    `δ ${P(t2i, "shift").toFixed(5)}, FWHM ${P(t2i, "gfwhm").toFixed(4)}, a₀ ${P(t2i, "a0").toFixed(5)}; nonlinear δ ${P(nl, "shift").toFixed(5)}, FWHM ${P(nl, "gfwhm").toFixed(4)}`);
  check("9d iterated 3rd order: symmetric broadening gives κ₃ ≈ 0", close(P(t3, "shift"), 0.3, 2e-3) && Math.abs(P(t3, "kappa3")) < 0.03, `δ ${P(t3, "shift").toFixed(4)}, κ₃ ${P(t3, "kappa3").toFixed(4)} (σ³ ≈ 0.6)`);
  const big = synth({ shift: 3, gf: 2 }), t2b = run(big, "t2", { iterate: true }), sbg = run(big, "sbg");
  check("9e iterated Taylor = nonlinear fit for a 3 cm⁻¹ shift", close(P(t2b, "shift"), P(sbg, "shift"), 1e-3) && close(P(t2b, "gfwhm"), P(sbg, "gfwhm"), 5e-3) && close(P(t2b, "shift"), 3, 5e-3),
    `Taylor δ ${P(t2b, "shift").toFixed(5)} w ${P(t2b, "gfwhm").toFixed(4)}; nonlinear δ ${P(sbg, "shift").toFixed(5)} w ${P(sbg, "gfwhm").toFixed(4)}`);
  // narrowing: the reference bands are broader than the sample's
  const narrowS = synth({ shape: "gauss", shift: 0.4, solute: false }), wide = synth({ shape: "gauss", gf: 2, scale: 1, solute: false, base: false });
  const nr = core.subtract({ x: narrowS.x, y: narrowS.S }, { x: wide.x, y: wide.S }, "t2", { regions: REGIONS, baseline: 1, iterate: true, deriv: "fine" });
  const s2 = -((2 / FW) ** 2);
  check("9f narrowing gives σ² < 0", close(P(nr, "sigma2"), s2, 0.15 * Math.abs(s2)) && close(P(nr, "shift"), 0.4, 0.01), `σ² ${P(nr, "sigma2").toFixed(4)} (true ${s2.toFixed(4)}), δ ${P(nr, "shift").toFixed(4)}`);
  const dr = run(synth({ shift: 0.5 }), "tc", { terms: [1, 2] });
  check("9g chosen terms without R", dr.params.length === 4 && Number.isFinite(P(dr, "a1")), dr.params.map(p => p.key).join());
}

// 10. shift and broadening (nonlinear)
{
  const s0 = run(synth({ shift: 2.5 }), "sb0");
  check("10a shift only, 2.5", close(P(s0, "shift"), 2.5, 2e-3) && close(P(s0, "scale"), 0.8, 1e-3), `δ ${P(s0, "shift").toFixed(5)}, a ${P(s0, "scale").toFixed(5)}`);
  const g = run(synth({ shift: 0.6, gf: 3, solute: false }), "sbg");
  check("10b shift + Gaussian, Lorentzian bands", close(P(g, "shift"), 0.6, 2e-3) && close(P(g, "gfwhm"), 3, 0.02) && close(P(g, "scale"), 0.8, 1e-3),
    `δ ${P(g, "shift").toFixed(5)}, w_G ${P(g, "gfwhm").toFixed(4)}, a ${P(g, "scale").toFixed(5)}`);
  const l = run(synth({ shift: -0.8, lf: 2, solute: false }), "sbl");
  check("10c shift + Lorentzian", close(P(l, "shift"), -0.8, 2e-3) && close(P(l, "lfwhm"), 2, 0.02), `δ ${P(l, "shift").toFixed(5)}, w_L ${P(l, "lfwhm").toFixed(4)}`);
  const v = run(synth({ shape: "gauss", shift: 0.4, gf: 2.5, solute: false }), "sbv");
  check("10d Voigt fit of a Gaussian broadening", close(P(v, "gfwhm"), 2.5, 0.08) && P(v, "lfwhm") < 0.1 && close(P(v, "shift"), 0.4, 3e-3), `w_G ${P(v, "gfwhm").toFixed(4)}, w_L ${P(v, "lfwhm").toFixed(4)}`);
  const st = run(synth({ shift: 0.5, stretch: 0.002, gf: 1.5, xc: 1122.5, solute: false }), "sbs");
  check("10e axis stretch", close(P(st, "stretch"), 0.002, 1e-4) && close(P(st, "shift"), 0.5, 0.01) && close(P(st, "gfwhm"), 1.5, 0.1),
    `ε ${P(st, "stretch").toExponential(3)}, δ(x_c) ${P(st, "shift").toFixed(4)}, w_G ${P(st, "gfwhm").toFixed(3)}`);
  const d6 = synth({ shift: 0.6, gf: 3, base: false }), g2 = run(d6, "sbg", { baseline: -1 });
  const man = run(d6, "manual", { manual: { scale: P(g2, "scale"), shift: P(g2, "shift"), gfwhm: P(g2, "gfwhm"), lfwhm: 0, offset: 0 } });
  let dm = 0; man.solvent.forEach((vv, i) => { if (Number.isFinite(vv)) dm = Math.max(dm, Math.abs(vv - g2.solvent[i])); });
  check("10f manual with the fitted values reproduces the fitted model", dm < 1e-12 && man.params.length === 5, `max difference ${dm.toExponential(1)}`);
}

// 11. axes: reversed x, solvent on another grid, example data, all methods
{
  const d = synth({ shift: 0.6, gf: 3 }), rev = { x: d.x.slice().reverse(), S: d.S.slice().reverse(), R: d.R.slice().reverse() };
  const a = run(d, "t2"), b = run(rev, "t2");
  check("11a decreasing x gives the same fit", close(P(a, "shift"), P(b, "shift"), 1e-9) && close(P(a, "gfwhm"), P(b, "gfwhm"), 1e-8) && close(b.result[0], a.result[a.result.length - 1], 1e-12));
  const sam = synth({ scale: 0.7, solute: false }), other = synth({ x0: 350.37, dx: 1.1, n: 1300, solute: false, base: false, scale: 1 });
  const og = core.subtract({ x: sam.x, y: sam.S }, { x: other.x, y: other.R }, "ls", { regions: REGIONS, baseline: 1 });
  const outside = og.result.filter(Number.isNaN).length;
  check("11b solvent on a different grid and range", close(P(og, "scale"), 0.7, 2e-3) && outside > 0 && Number.isNaN(og.result[0]), `a ${P(og, "scale").toFixed(5)}, ${outside} points outside → NaN`);
  const ex = core.makeExample(), x = Float64Array.from(ex.sample.data, (_, i) => ex.sample.x0 + i * ex.sample.dx);
  const S = { x, y: ex.sample.data }, R = { x, y: ex.solvent.data }, regions = core.parseRegions(ex.regions);
  const e1 = core.subtract(S, R, "t2", { regions, baseline: 1, iterate: true }), e2 = core.subtract(S, R, "sbg", { regions, baseline: 1 });
  check("11c example: true scale 0.8, shift 0.6, FWHM 3 recovered within noise", [e1, e2].every(r => close(P(r, "shift"), 0.6, 0.03) && close(P(r, "gfwhm"), 3, 0.5) && close(P(r, "scale") || P(r, "a0"), 0.8, 0.02)),
    `Taylor (iterated) δ ${P(e1, "shift").toFixed(3)}±${e1.params.find(p => p.key === "shift").se.toFixed(3)} w ${P(e1, "gfwhm").toFixed(2)}; nonlinear δ ${P(e2, "shift").toFixed(3)}±${e2.params.find(p => p.key === "shift").se.toFixed(3)} w ${P(e2, "gfwhm").toFixed(2)}±${e2.params.find(p => p.key === "gfwhm").se.toFixed(2)}`);
  const t0 = performance.now(), rows = core.compareMethods(S, R, { regions, baseline: 1 });
  check("11d every method runs on the example", rows.length === core.METHODS.length - 2 && rows.every(r => !r.error && Number.isFinite(r.rms)), `${rows.length} methods in ${(performance.now() - t0).toFixed(0)} ms`);
}

// 12. the HSVD + Taylor pipeline of the "Solvent subtraction with an HSVD-denoised, Taylor-expanded reference" notes:
// cyclohexane Lorentzian bands, 300–1700 cm⁻¹ at 1 cm⁻¹, sample = 0.85·[R ⊗ G(σ 1.2)](ν − 0.5) + solute + quadratic baseline,
// noise 0.003 on both spectra; quoted values: HSVD reference error 3.0 → ≈1.2 (rank 20), ≈0.6 (rank 8) × 10⁻³;
// result noise ≈3.5 × 10⁻³ with the noisy reference, ≈3.0–3.07 with the HSVD reference
{
  const CYC = [[384, 0.04, 9], [426, 0.08, 9], [801, 1.0, 9], [1028, 0.45, 10], [1157, 0.07, 10], [1266, 0.17, 11], [1347, 0.04, 12], [1444, 0.26, 16]];
  const SOL = [[650, 0.02, 14], [1010, 0.02, 14], [1180, 0.025, 14], [1350, 0.015, 16], [1590, 0.03, 16]];
  const N = 1401, x = Float64Array.from({ length: N }, (_, i) => 300 + i), sum = (bands, v) => bands.reduce((a, b) => a + lor(v, b), 0);
  const clean = x.map(v => sum(CYC, v)), solute = x.map(v => sum(SOL, v));
  const nodes = []; let ws = 0;
  for (let j = -200; j <= 200; j++) { const s = 7.2 * j / 200, w = Math.exp(-s * s / (2 * 1.44)); nodes.push([s, w]); ws += w; }
  const sample0 = x.map((v, i) => { let t = 0; for (const [d, w] of nodes) t += w * sum(CYC, v - 0.5 - d); return 0.85 * t / ws + solute[i] + 0.02 + 0.01 * (v - 1000) / 700 + 0.015 * ((v - 1000) / 700) ** 2; });
  let seed = 12345; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647, gn = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const noisy = a => a.map(v => v + 0.003 * gn()), rms = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

  // a. eigen-solvers
  const k = 6, Ar = new Float64Array(k * k), Ai = new Float64Array(k * k);
  for (let a = 0; a < k; a++) for (let b = a; b < k; b++) { Ar[a * k + b] = Ar[b * k + a] = Math.sin(a + 2 * b) + (a === b ? 3 : 0); const im = a === b ? 0 : Math.cos(3 * a - b); Ai[a * k + b] = im; Ai[b * k + a] = -im; }
  const E = core.hermEig(Ar, Ai, k);
  let eres = 0;
  E.vals.forEach((lam, t) => { for (let a = 0; a < k; a++) { let sr = 0, si = 0; for (let b = 0; b < k; b++) { sr += Ar[a * k + b] * E.Ur[t][b] - Ai[a * k + b] * E.Ui[t][b]; si += Ar[a * k + b] * E.Ui[t][b] + Ai[a * k + b] * E.Ur[t][b]; } eres = Math.max(eres, Math.hypot(sr - lam * E.Ur[t][a], si - lam * E.Ui[t][a])); } });
  check("12a Hermitian eigen-decomposition (Householder + QL on the real embedding)", E.vals.length === k && eres < 1e-10 && E.vals.every((v, i) => !i || v <= E.vals[i - 1]), `max |Au − λu| ${eres.toExponential(1)}`);

  // b–d. HSVD on its own
  const c20 = core.hsvdDenoise(clean, 20);
  let e20 = 0, e8 = 0, above = 0;
  for (let r = 0; r < 4; r++) { const R = noisy(clean), d20 = core.hsvdDenoise(R, 20); e20 += rms(d20.y, clean) / 4; e8 += rms(core.hsvdDenoise(R, 8).y, clean) / 4; above = d20.above; }
  check("12b HSVD: a noise-free sum of 8 Lorentzians comes back unchanged", rms(c20.y, clean) < 1e-8 && c20.rows === 350, `rms change ${rms(c20.y, clean).toExponential(1)}, Hankel ${c20.rows} × ${c20.cols}`);
  check("12c HSVD of the noisy reference matches the notes (≈1.2 at rank 20, ≈0.6 at rank 8; 8 bands clearly above the noise edge)",
    e20 > 1.0e-3 && e20 < 1.4e-3 && e8 > 0.5e-3 && e8 < 0.75e-3 && above === 8, `reference error 3.0 → ${(1e3 * e20).toFixed(2)} (rank 20), ${(1e3 * e8).toFixed(2)} (rank 8) × 10⁻³; ${above} above 1.5 τ`);
  // a 0 → 0.5 slope makes a jump at the ends of the periodic DFT: the line is taken out, and the edges are as good as the middle
  const slope = clean.map((v, i) => v + 0.5 * i / N);
  let eEdge = 0, eMid = 0, nE = 0, nM = 0, lineUsed = true;
  for (let r = 0; r < 4; r++) {
    const ds = core.hsvdDenoise(noisy(slope), 20); lineUsed = lineUsed && ds.line;
    for (let i = 0; i < N; i++) { const e2 = (ds.y[i] - slope[i]) ** 2; if (i < 60 || i >= N - 60) { eEdge += e2; nE++; } else { eMid += e2; nM++; } }
  }
  check("12d HSVD with a sloping baseline: line taken out, edges no worse than the middle", lineUsed && Math.sqrt(eEdge / nE) < 1.3 * Math.sqrt(eMid / nM) && Math.sqrt(eMid / nM) < 1.4e-3,
    `error rms × 10⁻³: edges ${(1e3 * Math.sqrt(eEdge / nE)).toFixed(2)}, middle ${(1e3 * Math.sqrt(eMid / nM)).toFixed(2)}`);

  // e–f. Taylor fits on the full pipeline: noise across realizations, away from every band
  const exclude = SOL.map(b => [b[0] - 25, b[0] + 25]), away = x.map(v => CYC.concat(SOL).every(b => Math.abs(v - b[0]) > 30));
  const trial = (opt, nreal, cleanRef) => {
    const res = [], w = [];
    for (let r = 0; r < nreal; r++) {
      const out = core.subtract({ x, y: noisy(sample0) }, { x, y: cleanRef ? clean : noisy(clean) }, "t2", Object.assign({ regions: [], exclude, baseline: 3, subBase: true }, opt));
      res.push(out.result); w.push(P(out, "gfwhm"));
    }
    let v = 0, nv = 0;
    for (let i = 0; i < N; i++) { if (!away[i]) continue; let m = 0; for (const a of res) m += a[i] / nreal; for (const a of res) { v += (a[i] - m) ** 2 / (nreal - 1); } nv++; }
    return { noise: Math.sqrt(v / nv), fwhm: w.reduce((a, b) => a + b) / nreal };
  };
  const plain = trial({}, 12), fine = trial({ deriv: "fine" }, 12), withHsvd = trial({ hsvd: 20 }, 12), perfect = trial({}, 6, true), trueW = 1.2 * FW;
  check("12e np.gradient derivatives resist reference noise (no regression dilution of a₂)", close(plain.fwhm, trueW, 0.4) && fine.fwhm < trueW - 0.8,
    `FWHM ${plain.fwhm.toFixed(2)} (np.gradient) vs ${fine.fwhm.toFixed(2)} (fine), true ${trueW.toFixed(2)}`);
  check("12f Taylor + HSVD reference reaches the noise floor of a perfect reference", plain.noise > 3.3e-3 && withHsvd.noise < 3.2e-3 && withHsvd.noise < 0.92 * plain.noise && close(withHsvd.noise, perfect.noise, 0.25e-3),
    `noise × 10⁻³: noisy reference ${(1e3 * plain.noise).toFixed(2)}, HSVD ${(1e3 * withHsvd.noise).toFixed(2)}, perfect ${(1e3 * perfect.noise).toFixed(2)} (notes: 3.50, 3.02, 3.00)`);

  // g–h. exclusions and HSVD on an uneven axis
  const sx = synth({ scale: 0.7, solute: false, base: false }), spike = { x: sx.x, R: sx.R, S: sx.S.map((v, i) => v + 0.3 * Math.exp(-(((sx.x[i] - 1036) / 4) ** 2))) };
  const inc = run(spike, "ls", { regions: [], baseline: -1 }), exc = run(spike, "ls", { regions: [], exclude: [[1026, 1046]], baseline: -1 });
  check("12g excluded ranges are left out of the fit", Math.abs(P(inc, "scale") - 0.7) > 0.01 && close(P(exc, "scale"), 0.7, 1e-4), `a ${P(inc, "scale").toFixed(4)} with the band, ${P(exc, "scale").toFixed(6)} without`);
  const ux = Float64Array.from({ length: N }, (_, i) => 300 + i * (1 + 1e-4 * i) * 0.88), uR = ux.map(v => sum(CYC, v)), uS = ux.map(v => 0.6 * sum(CYC, v - 0.3));
  const ur = core.subtract({ x: ux, y: uS }, { x: ux, y: uR }, "t1", { regions: [], baseline: -1, hsvd: 20, iterate: true });
  // i. the rank errs high by default, and that keeps weak bands of a Voigt-shaped reference that a low rank cuts
  const vnodes = []; let vws = 0;
  for (let j = -120; j <= 120; j++) { const s = 18 * j / 120, w = Math.exp(-s * s / 18); vnodes.push([s, w]); vws += w; }
  const voigt = x.map(v => CYC.reduce((a, b) => { let t = 0, pk = 0; for (const [s, w] of vnodes) { t += w * lor(v - s, [b[0], 1, b[2]]); pk += w * lor(-s, [0, 1, b[2]]); } return a + b[1] * t / pk; }, 0));
  const vy = noisy(voigt), dAuto = core.hsvdDenoise(vy, "auto"), d8 = core.hsvdDenoise(vy, 8), dLor = core.hsvdDenoise(noisy(clean), "auto");
  const kept = (d, c) => { const i = c - 300; return (d.y[i - 1] + d.y[i] + d.y[i + 1]) / (voigt[i - 1] + voigt[i] + voigt[i + 1]); };
  const t0 = performance.now(); core.hsvdDenoise(vy, 33); const tRebuild = performance.now() - t0;
  check("12i cautious default rank keeps weak Voigt bands that rank 8 cuts; other ranks rebuild from the same decomposition",
    dLor.rank === 40 && dAuto.rank >= 40 && [384, 1347].every(c => kept(dAuto, c) > 0.95) && Math.min(kept(d8, 384), kept(d8, 1347)) < 0.8 && tRebuild < 150,
    `default rank ${dLor.rank} (Lorentzian), ${dAuto.rank} (Voigt); weak bands kept at the default ${[384, 1347].map(c => (100 * kept(dAuto, c)).toFixed(0) + "%").join(", ")}, ` +
    `at rank 8 ${[384, 1347].map(c => (100 * kept(d8, c)).toFixed(0) + "%").join(", ")}; rank 33 rebuilt in ${tRebuild.toFixed(0)} ms`);
  check("12h HSVD on an uneven x axis (resampled evenly first)", close(P(ur, "shift"), 0.3, 2e-3) && close(P(ur, "a0"), 0.6, 2e-3) && ur.refDenoise.kind === "hsvd",
    `δ ${P(ur, "shift").toFixed(4)}, a₀ ${P(ur, "a0").toFixed(4)}`);
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
