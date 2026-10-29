// Checks the core embedded in index.html (<script id="core">): the port of check_scan.py against Pillow and numpy,
// the page sequence against brute force, a synthetic stack of exams, page selection, inflate, and page rotation
// read back by the core and by the bundled pdf.js. Also the bundled files and the page's privacy policy.
//   node tests/validate.mjs     # about 10 s
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("index.html has no <script id=\"core\">");
const names = ["rgbaToGray", "rot90ccw", "portrait", "resizeLanczos", "gaussianBlur", "toFeature", "flip180", "prepTemplate", "prepPage", "correlation",
  "matchPages", "bestSequence", "buildReport", "reportText", "reportCsv", "checkStack", "parsePages", "compact", "inflate", "PdfFile", "listPages", "rotatePdf", "THUMB_W", "THUMB_H"];
// new Function keeps the core in this realm (Node's vm sandbox makes typed arrays much slower)
const core = new Function(m[1] + `\nreturn {${names.join(",")}};`)();

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const enc = s => new Uint8Array(Buffer.from(s, "latin1"));

// the deterministic test image of the reference script (same LCG in Python): stripes, a dark disc, noise
function testImage(w, h, seed) {
  let s = seed >>> 0;
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const base = 235 - ((x * 7 + y * 3) % 40 < 3 ? 180 : 0) - ((x - w / 2) ** 2 + (y - h / 3) ** 2 < 400 ? 120 : 0);
    d[y * w + x] = Math.max(0, Math.min(255, base + ((s >>> 16) & 31) - 16));
  }
  return { w, h, data: d };
}

// 1. image steps bit for bit against Pillow 13 and numpy 2 (hashes from check_scan.py's own functions)
{
  const r = img => sha(core.resizeLanczos(img, 170, 220).data);
  const ok = [
    r(testImage(255, 330, 1)) === "147478724ef224373511e8d630b653a93be6f5fc6fd3388883f4178302593405",
    r(testImage(612, 792, 4)) === "8db2e18e4b026f94625230eb3cfc5418e44ffd788c17c1862f7f2203474158f3",
    r(testImage(100, 130, 5)) === "3e3cface5ad9388362ac9df0b99fe30a2cbb557b5c096c1b5d43edb46dffc172",
  ];
  check("1a Lanczos resize = Pillow (down from 30 and 72 dpi, and up)", ok.every(Boolean), ok.join(", "));
  check("1b Gaussian blur 1.5 = Pillow", sha(core.gaussianBlur(testImage(170, 220, 3), 1.5).data) === "70f67a5dda724a8852df1126081fe8c83b6b16cd3678d317716e86c613c8f91e");
  check("1c quarter turn = Pillow rotate(90, expand=True)", sha(core.rot90ccw(testImage(330, 255, 2)).data) === "a05586fa7f68e0f180097b0da3a45d3f08f5ae0c0d0e79488c091c41668ce840");
  const f1 = core.toFeature(testImage(255, 330, 1)), f2 = core.toFeature(core.portrait(testImage(330, 255, 2)));
  const fh = f => sha(Buffer.from(f.f.buffer, f.f.byteOffset, f.f.byteLength));
  check("1d to_feature() = check_scan.py (float32 ink map and ink fraction)",
    fh(f1) === "d4d7a28c729085b249deebea158f809799583ab71b1827943691454989296951" && f1.ink === 0.22176470588235295 &&
    fh(f2) === "ec07eaa786231d2e2efad133f91615f3cfc90a96eac1cfe04c0ca23c811d2b64" && f2.ink === 0.22264705882352942, `ink ${f1.ink}, ${f2.ink}`);
}

// 2. correlation: identical page 1, shifted by 2 px still 1 on the overlap, against a direct computation
{
  const f = core.toFeature(testImage(255, 330, 7)).f, g = core.toFeature(testImage(255, 330, 8)).f, W = core.THUMB_W, H = core.THUMB_H;
  const self = core.correlation(core.prepPage(f), core.prepTemplate(f));
  const shifted = new Float32Array(f.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) shifted[y * W + x] = f[Math.min(H - 1, y + 2) * W + Math.min(W - 1, x + 2)];
  const sh = core.correlation(core.prepPage(shifted), core.prepTemplate(f));
  // direct: every shift, windows minus their means, in plain loops
  let direct = -1;
  for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
    const A = [], B = [];
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) { A.push(g[(y + dy) * W + x + dx]); B.push(f[y * W + x]); }
    const ma = A.reduce((s, v) => s + v, 0) / A.length, mb = B.reduce((s, v) => s + v, 0) / B.length;
    let num = 0, na = 0, nb = 0;
    for (let i = 0; i < A.length; i++) { num += (A[i] - ma) * (B[i] - mb); na += (A[i] - ma) ** 2; nb += (B[i] - mb) ** 2; }
    direct = Math.max(direct, num / (Math.sqrt(na) * (Math.sqrt(nb) + 1e-9) + 1e-9));
  }
  const fast = core.correlation(core.prepPage(g), core.prepTemplate(f));
  check("2 correlation: self = 1, 2-pixel shift = 1, = direct computation", Math.abs(self - 1) < 1e-9 && sh > 0.999 && Math.abs(fast - direct) < 1e-9,
    `self ${self.toFixed(12)}, shifted ${sh.toFixed(6)}, fast − direct ${(fast - direct).toExponential(1)}`);
}

// 3. best_sequence(): the dynamic programme finds the cheapest sequence (brute force over every sequence)
{
  function costOf(pos, score, m, n) {
    const emit = (i, k) => { const row = score.slice(i * n, i * n + n), mx = Math.max(...row), s = row.slice().sort((a, b) => a - b), med = n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; return (mx - row[k]) / Math.max(mx - med, 0.02) * 3; };
    let c = 4 * pos[0] + emit(0, pos[0] % n);
    for (let i = 1; i < m; i++) { const d = pos[i] - pos[i - 1]; c += (d === 0 ? 4 : 4 * (d - 1)) + emit(i, pos[i] % n); }
    return c + (n - 1 - pos[m - 1] % n) * 4;
  }
  let rnd = 12345, worst = 0, cases = 0;
  const rand = () => (rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let t = 0; t < 40; t++) {
    const n = 2 + (t % 3), m = 3 + (t % 3), score = new Float64Array(m * n).map(() => rand());
    const dp = core.bestSequence(score, m, n), G = m + 3 * n;
    let best = Infinity;
    const rec = (i, pos) => { if (i === m) { best = Math.min(best, costOf(pos, score, m, n)); return; } const lo = i ? pos[i - 1] : 0, hi = i ? Math.min(G - 1, pos[i - 1] + 2 * n) : G - 1; for (let g = lo; g <= hi; g++) rec(i + 1, [...pos, g]); };
    rec(0, []);
    worst = Math.max(worst, costOf(Array.from(dp), score, m, n) - best); cases++;
  }
  const clean = core.bestSequence(Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1]), 6, 3);
  check("3 best_sequence = brute-force optimum", worst < 1e-9 && clean.join() === "0,1,2,3,4,5", `${cases} random cases, largest excess cost ${worst}; a clean stack gives ${clean.join(",")}`);
}

// 4. a synthetic stack of 10 exams of 6 pages with the defects of the reference test, through the whole check
const stack = (() => {
  let s = 99;
  const rand = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const W = 255, H = 330;
  const layout = k => { // boxes and text lines that differ from page to page
    let t = 1000 + k * 7919;
    const r = () => (t = (Math.imul(t, 1103515245) + 12345) >>> 0) / 4294967296, items = [];
    let y = 30;
    while (y < 290) { const h = 30 + Math.floor(r() * 45); items.push({ x: 25, y, w: 120 + Math.floor(r() * 90), h: 3 }); items.push({ box: true, x: 25 + Math.floor(r() * 15), y: y + 10, w: 150 + Math.floor(r() * 50), h }); y += h + 22; }
    items.push({ x: 120 + k * 3, y: 316, w: 8, h: 4 });
    return items;
  };
  const draw = (k, student) => {
    const d = new Uint8Array(W * H).fill(240), dx = Math.floor(rand() * 5) - 2, dy = Math.floor(rand() * 5) - 2, paper = 225 + Math.floor(rand() * 25);
    d.fill(paper);
    const put = (x, y, v) => { x += dx; y += dy; if (x >= 0 && x < W && y >= 0 && y < H) d[y * W + x] = Math.min(d[y * W + x], v); };
    for (const it of layout(k)) {
      if (it.box) { for (let x = it.x; x <= it.x + it.w; x++) { put(x, it.y, 40); put(x, it.y + it.h, 40); } for (let y = it.y; y <= it.y + it.h; y++) { put(it.x, y, 40); put(it.x + it.w, y, 40); }
        for (let line = 0; line < 3; line++) { let x = it.x + 6, y = it.y + 8 + line * 9; while (x < it.x + it.w - 10 && y < it.y + it.h - 3) { put(x, y, 60); x++; y += rand() < 0.3 ? 1 : rand() < 0.4 ? -1 : 0; } } }
      else for (let x = it.x; x < it.x + it.w; x++) for (let y = it.y; y < it.y + it.h; y++) put(x, y, 30);
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, d[i] + Math.floor(rand() * 13) - 6));
    void student;
    return { w: W, h: H, data: d };
  };
  const tmpl = [0, 1, 2, 3, 4, 5].map(k => { const img = draw(k, -1); return img; });
  const pages = [];
  for (let e = 0; e < 10; e++) {
    const seq = [0, 1, 2, 3, 4, 5];
    if (e === 2) seq.splice(3, 1);
    if (e === 4) seq.splice(2, 0, 1);
    if (e === 5) [seq[2], seq[3]] = [seq[3], seq[2]];
    for (const k of seq) {
      let img = draw(k, e);
      if (e === 6 && k === 4) img = { ...img, data: img.data.slice().reverse() };
      if (e === 8 && k === 0) img = core.rot90ccw(img);
      pages.push(img);
    }
    if (e === 7) pages.push({ w: W, h: H, data: new Uint8Array(W * H).map(() => 236 + Math.floor(rand() * 9)) });
  }
  return { tmpl, pages };
})();
{
  const t0 = Date.now(), feat = imgs => { const r = imgs.map(i => core.toFeature(core.portrait(i))); return { feats: r.map(x => x.f), ink: r.map(x => x.ink) }; };
  const scan = { ...feat(stack.pages), landscape: stack.pages.map(i => i.w > i.h) }, tmpl = feat(stack.tmpl);
  const res = await core.checkStack(scan, tmpl), r = res.report, texts = r.problems.map(p => p.text);
  const want = [
    "MISSING    exam #3 page 4  (should be just before scan page 16)",
    "DUPLICATE  exam #5 page 2 appears again at scan page 26",
    "NOTE       scan page 33: looks most like page 4 - CHECK (assigned exam #6 page 3)",
    "NOTE       scan page 34: looks most like page 3 - CHECK (assigned exam #6 page 4)",
    "NOTE       scan page 41: upside down (assigned exam #7 page 5)",
    "NOTE       scan page 49: blank page",
    "NOTE       scan page 50: upside down (assigned exam #9 page 1)",
  ];
  check("4a synthetic stack: every planted defect found, nothing else", JSON.stringify(texts) === JSON.stringify(want), `${texts.length} issues; ${r.summary} (${Date.now() - t0} ms)`);
  const turns = r.rows.filter(x => x.turn).map(x => `${x.scan_page}:${x.turn}`).join(", ");
  check("4b turns to upright: page 41 by 180°, the sideways page 50 by 90° clockwise", turns === "41:180, 50:90", turns);
  const txt = core.reportText(r), csv = core.reportCsv(r);
  check("4c report text and CSV in check_scan.py's format", txt.startsWith("Found 10 exams x 6 pages = 60 expected pages; 60 pages matched, 1 blank.\n\n7 issue(s):\n  MISSING    exam #3 page 4") &&
    txt.includes("\n  exam #  3: scan pages 13-17   <-- 5/6 pages\n") && txt.includes("\n  exam #  5: scan pages 24-30   <-- 7/6 pages\n") &&
    csv.startsWith("scan_page,exam,exam_page,similarity,note\r\n1,1,1,") && csv.includes("\r\n49,,,,blank page\r\n"), `${txt.split("\n").length} lines, ${csv.split("\r\n").length - 2} rows`);
  // the same stack with "the first 6 scanned pages" as the template
  const res2 = await core.checkStack(scan, { feats: scan.feats.slice(0, 6), ink: scan.ink.slice(0, 6) });
  check("4d first 6 scanned pages as the template: same issues", JSON.stringify(res2.report.problems.map(p => p.text)) === JSON.stringify(want));
}

// 5. page selection as rotate_pdf.py's parse_pages and compact (cases checked against the Python functions)
{
  const cases = [["all", 5, "0,1,2,3,4"], ["even", 5, "1,3"], ["odd", 5, "0,2,4"], ["last", 5, "4"], ["2-6", 10, "1,2,3,4,5"], ["7-", 10, "6,7,8,9"], ["-4", 10, "0,1,2,3"],
    ["1,4,9-", 10, "0,3,8,9"], ["-3,last", 10, "0,1,2,9"], [" 3 , 1 ", 5, "0,2"], ["6-2", 10, "1,2,3,4,5"], ["ALL", 1, "0"], ["+2", 5, "1"], ["-", 5, "0,1,2,3,4"],
    ["11", 10, null], ["0", 5, null], ["x", 5, null], ["", 5, null], [" , ", 5, null], ["2-x", 5, null], ["3.5", 5, null]];
  const bad = cases.filter(([s, n, want]) => { try { return core.parsePages(s, n).join() !== want; } catch (e) { return want !== null; } });
  const comp = core.compact([1, 2, 3, 7, 9, 10]) === "1-3, 7, 9-10" && core.compact([]) === "none" && core.compact([4]) === "4";
  check("5 page selection and compact() = rotate_pdf.py", !bad.length && comp, bad.length ? JSON.stringify(bad) : `${cases.length} cases`);
}

// 6. inflate against zlib: stored, fixed and dynamic blocks, raw deflate, random and repetitive data
{
  let s = 1;
  const rnd = n => Uint8Array.from({ length: n }, () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 24);
  const text = enc("0 0 612 792 re f\n".repeat(4000) + "xref 0000000015 00000 n \n".repeat(300));
  const inputs = [new Uint8Array(0), enc("a"), rnd(70000), text, Uint8Array.from({ length: 50000 }, (_, i) => (i * 7) & 255)];
  let ok = 0, total = 0;
  for (const data of inputs) for (const c of [b => zlib.deflateSync(b, { level: 0 }), b => zlib.deflateSync(b, { level: 1 }), b => zlib.deflateSync(b, { level: 9 }), b => zlib.deflateRawSync(b)]) {
    total++;
    if (Buffer.from(core.inflate(new Uint8Array(c(Buffer.from(data))))).equals(Buffer.from(data))) ok++;
  }
  const part = core.inflate(new Uint8Array(zlib.deflateSync(Buffer.from(text)).subarray(0, 300)));
  check("6 inflate = zlib", ok === total && part.length > 0 && Buffer.from(text).subarray(0, part.length).equals(Buffer.from(part)), `${ok}/${total} streams; a truncated stream gives its first ${part.length} bytes`);
}

// 7. page rotation on hand-built PDFs, read back by the core and by the bundled pdf.js
function buildPdf({ rotates = [0, 90, 0], pagesRotate = null, objstm = false, hybrid = false, damaged = false }) {
  const out = [], offs = {};
  let len = 0;
  const add = x => { const b = typeof x === "string" ? enc(x) : x; out.push(b); len += b.length; };
  add("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");
  const n = rotates.length, pageNum = i => 3 + 2 * i, contNum = i => 4 + 2 * i;
  const pageDict = i => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${i % 2 ? "792 612" : "612 792"}] ${rotates[i] !== null ? `/Rotate ${rotates[i]} ` : ""}/Contents ${contNum(i)} 0 R /Resources << >> /Title (a \\(page\\) title) >>`;
  const obj = (num, body) => { offs[num] = len; add(`${num} 0 obj\n${body}\nendobj\n`); };
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${rotates.map((r, i) => `${pageNum(i)} 0 R`).join(" ")}] /Count ${n}${pagesRotate !== null ? ` /Rotate ${pagesRotate}` : ""} >>`);
  for (let i = 0; i < n; i++) { const c = `0 0 ${100 + i} 100 re f`; offs[contNum(i)] = len; add(`${contNum(i)} 0 obj\n<< /Length ${c.length} >>\nstream\n${c}\nendstream\nendobj\n`); }
  const stmNum = 3 + 2 * n, xsNum = stmNum + 1, size = xsNum + 1;
  if (objstm) { // pages in a compressed object stream, located by a PNG-predicted cross-reference stream
    const bodies = rotates.map((r, i) => pageDict(i)), hdr = bodies.map((b, i) => `${pageNum(i)} ${bodies.slice(0, i).join(" ").length + (i ? 1 : 0)}`).join(" ") + " ";
    const data = zlib.deflateSync(Buffer.from(hdr + bodies.join(" "), "latin1"));
    offs[stmNum] = len; add(`${stmNum} 0 obj\n<< /Type /ObjStm /N ${n} /First ${hdr.length} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`); add(new Uint8Array(data)); add("\nendstream\nendobj\n");
    const rows = [];
    for (let k = 0; k < size; k++) {
      const pi = rotates.findIndex((r, i) => pageNum(i) === k);
      const row = k === 0 ? [0, 0, 0, 0, 0, 255, 255] : pi >= 0 ? [2, 0, 0, 0, stmNum, 0, pi] : k === xsNum ? [1, ...[24, 16, 8, 0].map(b => (len >>> b) & 255), 0, 0] : [1, ...[24, 16, 8, 0].map(b => (offs[k] >>> b) & 255), 0, 0];
      rows.push(row);
    }
    const png = []; // PNG "Up" filter on every row
    rows.forEach((row, r) => { png.push(2); row.forEach((v, c) => png.push((v - (r ? rows[r - 1][c] : 0)) & 255)); });
    const xs = zlib.deflateSync(Buffer.from(png)), xsAt = len;
    add(`${xsNum} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Root 1 0 R /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${xs.length} >>\nstream\n`); add(new Uint8Array(xs)); add("\nendstream\nendobj\n");
    if (!hybrid) { add(`startxref\n${xsAt}\n%%EOF\n`); return Uint8Array.from(Buffer.concat(out)); }
    // hybrid: a classic table for the old objects, the object stream's pages only in /XRefStm
    const t = len;
    add("xref\n0 1\n0000000000 65535 f\r\n"); // the table leaves out the objects that only the stream knows
    for (let k = 1; k <= stmNum; k++) if (!rotates.some((r, i) => pageNum(i) === k)) add(`${k} 1\n${String(offs[k]).padStart(10, "0")} 00000 n\r\n`);
    add(`trailer\n<< /Size ${size} /Root 1 0 R /XRefStm ${xsAt} >>\nstartxref\n${t}\n%%EOF\n`);
    return Uint8Array.from(Buffer.concat(out));
  }
  for (let i = 0; i < n; i++) obj(pageNum(i), pageDict(i));
  const x = len;
  add(`xref\n0 ${stmNum}\n0000000000 65535 f\r\n`);
  for (let k = 1; k < stmNum; k++) add(`${String(offs[k]).padStart(10, "0")} 00000 n\r\n`);
  add(`trailer\n<< /Size ${stmNum} /Root 1 0 R /ID [<00112233> <44556677>] >>\nstartxref\n${damaged ? 99999 : x}\n%%EOF\n`);
  return Uint8Array.from(Buffer.concat(out));
}
{
  const warn = console.warn; // pdf.js warns that Node has no canvas; nothing here draws, so those lines are dropped
  console.warn = (...a) => { if (!/napi-rs\/canvas|Cannot polyfill/.test(String(a[0]))) warn(...a); };
  const pdfjs = await import(pathToFileURL(path.join(root, "vendor/pdfjs/pdf.min.mjs")).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, "vendor/pdfjs/pdf.worker.min.mjs")).href;
  const readPdfjs = async bytes => { const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }), d = await task.promise, r = []; for (let i = 1; i <= d.numPages; i++) r.push((await d.getPage(i)).rotate); await task.destroy(); return r; };
  const kinds = {
    "classic table": { rotates: [0, 90, 0] },
    "inherited /Rotate": { rotates: [null, 270, null], pagesRotate: 90 },
    "object stream + PNG-predicted xref stream": { rotates: [0, 90, 180, 0], objstm: true },
    "hybrid (table + /XRefStm)": { rotates: [0, 90, 180], objstm: true, hybrid: true },
    "damaged startxref": { rotates: [0, 90, 0], damaged: true },
  };
  for (const [label, spec] of Object.entries(kinds)) {
    const buf = buildPdf(spec), before = core.listPages(buf).map(p => p.rotate), turns = new Map([[0, 90], [1, 180], [2, 270]]);
    const r = core.rotatePdf(buf, turns), want = before.map((v, i) => (v + (turns.get(i) || 0)) % 360);
    const own = core.listPages(r.bytes).map(p => p.rotate), js = await readPdfjs(r.bytes), jsBefore = await readPdfjs(buf);
    const prefix = Buffer.from(r.bytes.subarray(0, buf.length)).equals(Buffer.from(buf));
    check(`7 ${label}: turns read back by the core and by pdf.js`, JSON.stringify(own) === JSON.stringify(want) && JSON.stringify(js) === JSON.stringify(want) && JSON.stringify(jsBefore) === JSON.stringify(before) && prefix,
      `before ${before}, after ${own} (pdf.js ${js}), ${r.kind} update, original kept ${prefix}`);
  }
  // an incremental update written on top of an earlier one, and a second save from the new file
  const upd = buildPdf({ rotates: [0, 90, 0] }), r1 = core.rotatePdf(upd, new Map([[0, 180]])), r2 = core.rotatePdf(r1.bytes, new Map([[0, 90], [2, 90]]));
  const chain = await readPdfjs(r2.bytes), chainOwn = core.listPages(r2.bytes).map(p => p.rotate);
  check("7 two saves in a row (/Prev chain)", chain.join() === "270,90,90" && chainOwn.join() === "270,90,90", `pdf.js ${chain}`);
  const big = core.rotatePdf(upd, new Map([[1, -90]]));
  check("7 turns are taken modulo 360 and nothing else changes", core.listPages(big.bytes).map(p => p.rotate).join() === "0,0,0" && core.rotatePdf(upd, new Map()).bytes === upd);
  let threw = "";
  try { core.rotatePdf(upd, new Map([[5, 90]])); } catch (e) { threw = e.message; }
  check("7 a page outside the document is refused", /outside this document/.test(threw), threw);
  console.warn = warn;
}

// 8. the bundled pdf.js files are the published pdfjs-dist 6.4.299 (legacy build) byte for byte
{
  const want = {
    "pdf.min.mjs": "bccc24ea711db8e44503629519904a5292d73b9daaa214bbe7cdcc282b0f4259",
    "pdf.worker.min.mjs": "145d2dd3ab0c86151011dba95acfa2d5336e2accd59388ea43dbee0efddaaec6",
    "wasm/jbig2.wasm": "466f45c2a61a698152fb5400c27e56ff2ceb73dcb71fde3fc366a502308eaab0",
    "wasm/jbig2_nowasm_fallback.js": "68686ced624a48c42f84cdaa482ec44b72b0de4dc84a0df903af1fb7b45b5d9a",
    "wasm/openjpeg.wasm": "95e5002597af0824004aa57b1900fe019715db389e37640b1e58395e42f00cc5",
  };
  const bad = Object.entries(want).filter(([f, h]) => sha(fs.readFileSync(path.join(root, "vendor/pdfjs", f))) !== h).map(([f]) => f);
  check("8 bundled pdf.js = pdfjs-dist 6.4.299", !bad.length, bad.length ? `changed: ${bad.join(", ")}` : `${Object.keys(want).length} files`);
}

// 9. privacy: a Content-Security-Policy that allows connections only to this site, and nothing loaded from elsewhere
{
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  const dir = k => (csp.split(";").map(s => s.trim()).find(s => s.startsWith(k + " ")) || "").slice(k.length + 1).split(/\s+/);
  const ok = dir("default-src").join() === "'none'" && dir("connect-src").join() === "'self'" && dir("img-src").every(v => ["'self'", "blob:", "data:"].includes(v)) &&
    !/https?:/.test(csp) && dir("form-action").join() === "'none'" && dir("worker-src").every(v => ["'self'", "blob:"].includes(v));
  const remote = [...html.matchAll(/\s(?:src|href)="(https?:)?\/\//g)].length + [...html.matchAll(/import[^;]*["']https?:/g)].length;
  check("9 privacy policy: connections only to this site, no remote scripts", ok && remote === 0, `connect-src ${dir("connect-src").join(" ")}; ${remote} remote references`);
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
