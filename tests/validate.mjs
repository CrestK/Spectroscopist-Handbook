// Checks the handbook: the home page, its previews and links, the copied pages, and that no file in the repository
// holds anything that should not be on a public page. Also runs the copied pages' own tests.
//   node tests/validate.mjs            # about 17 s
//   node tests/validate.mjs --quick    # skip the copied pages' own tests
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const quick = process.argv.includes("--quick");

// public repositories any page may link to
const PUBLIC_REPOS = ["Franck-Condon-Factor", "Gaussian-Intensity-Weighted-Focal-Overlap-Public", "Beam-Overlap-Game-Public",
  "Solvent-subtraction", "Spectroscopist-Handbook"];
// the page folders (copies of other repositories, and pages kept only here), and the ones that bring their own tests
const COPIES = ["franck-condon", "focal-overlap", "overlap-game", "screensaver", "solvent-subtraction", "lorentz-explorer", "exam-scan"];
const COPY_TESTS = ["franck-condon/tests/validate.mjs", "solvent-subtraction/tests/validate.mjs", "lorentz-explorer/tests/validate.mjs", "exam-scan/tests/validate.mjs"];
const PREVIEW_PX = 256, PREVIEW_MAX = 20 * 1024, PREVIEWS_TOTAL_MAX = 60 * 1024, PAGE_MAX = 20 * 1024;

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
const isRemote = u => /^(https?:)?\/\//.test(u);
const files = [], walk = d => { for (const f of fs.readdirSync(d)) { if (f === ".git") continue; const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(root);
const rel = f => path.relative(root, f).split(path.sep).join("/");

// width and height of a WebP file (lossy VP8, lossless VP8L or extended VP8X)
function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return null;
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  if (kind === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  return null;
}
// RIFF chunk names, to find EXIF or XMP metadata
function webpChunks(b) {
  const names = [];
  for (let o = 12; o + 8 <= b.length; o += 8 + b.readUInt32LE(o + 4) + (b.readUInt32LE(o + 4) & 1)) names.push(b.toString("latin1", o, o + 4));
  return names;
}

// 1. every preview image exists, is a 256 × 256 WebP without metadata, and is small
{
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  let total = 0;
  const bad = [];
  for (const tag of imgs) {
    const src = attr(tag, "src"), file = path.join(root, src || "");
    if (!src || !fs.existsSync(file)) { bad.push(`${src}: missing`); continue; }
    const b = fs.readFileSync(file), size = webpSize(b), chunks = webpChunks(b);
    total += b.length;
    if (!size || size[0] !== PREVIEW_PX || size[1] !== PREVIEW_PX) bad.push(`${src}: ${size ? size.join(" × ") : "not WebP"}`);
    if (b.length > PREVIEW_MAX) bad.push(`${src}: ${b.length} bytes`);
    if (chunks.includes("EXIF") || chunks.includes("XMP ")) bad.push(`${src}: has metadata`);
    if (attr(tag, "width") !== "128" || attr(tag, "height") !== "128") bad.push(`${src}: width/height attributes`);
  }
  check("1 previews are 256 × 256 WebP, no metadata, ≤ 20 KB each", imgs.length === COPIES.length && bad.length === 0,
    `${imgs.length} images, ${(total / 1024).toFixed(1)} KB in all${bad.length ? "; " + bad.join("; ") : ""}`);
  const dir = path.join(root, "previews"), names = fs.readdirSync(dir), dirTotal = names.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  const unused = names.filter(f => !html.includes(`previews/${f}`));
  check("2 previews/ holds only images the page uses, ≤ 60 KB in all", unused.length === 0 && dirTotal <= PREVIEWS_TOTAL_MAX,
    `${names.length} files, ${(dirTotal / 1024).toFixed(1)} KB${unused.length ? "; unused: " + unused.join(", ") : ""}`);
}

// 3. every entry has a unique id, a preview and a title, both linking to its copy in this repository
{
  const entries = [...html.matchAll(/<div class="entry" id="([^"]+)">([\s\S]*?)<\/h3>/g)];
  const ids = entries.map(m => m[1]), bad = [];
  for (const [, id, body] of entries) {
    const thumb = (body.match(/<a class="thumb[^"]*" href="([^"]+)"/) || [])[1], title = (body.match(/<h3><a href="([^"]+)"/) || [])[1];
    if (!thumb || thumb !== title) bad.push(`${id}: preview ${thumb} vs title ${title}`);
    else if (thumb !== `${id}/index.html`) bad.push(`${id}: links to ${thumb}, not ${id}/index.html`);
  }
  const same = ids.length === COPIES.length && COPIES.every(c => ids.includes(c));
  check("3 each entry: preview and title link to its copy, <id>/index.html", same && new Set(ids).size === ids.length && bad.length === 0,
    `${entries.length} entries (${ids.join(", ")})${bad.length ? "; " + bad.join("; ") : ""}`);
}

// 4. home page links: local ones resolve, remote ones are https
{
  const hrefs = [...html.matchAll(/\shref="([^"]+)"/g)].map(m => m[1]);
  const local = hrefs.filter(h => !isRemote(h)), missing = local.filter(h => !fs.existsSync(path.join(root, h.split("#")[0])));
  const notHttps = hrefs.filter(h => isRemote(h) && !h.startsWith("https://"));
  check("4 home page: local links resolve, remote links are https", missing.length === 0 && notHttps.length === 0,
    `${local.length} local, ${hrefs.length - local.length} remote${missing.length ? "; missing: " + missing.join(", ") : ""}${notHttps.length ? "; not https: " + notHttps.join(", ") : ""}`);
}

// 5. the home page loads nothing from elsewhere and needs no script
{
  const ext = [...html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*\s(src|href)="(https?:)?\/\/[^"]*"/g)].map(m => m[0]);
  const scripts = (html.match(/<script\b/g) || []).length, styles = (html.match(/<link\b[^>]*stylesheet/g) || []).length;
  check("5 home page: no external resources, no scripts, ≤ 20 KB", ext.length === 0 && scripts === 0 && styles === 0 && html.length <= PAGE_MAX,
    `${ext.length} external, ${scripts} scripts, ${styles} stylesheets, ${(html.length / 1024).toFixed(1)} KB`);
}

// 6. every page folder has its index.html, every relative script, module, stylesheet, font and image it names exists, and no CNAME
{
  const bad = [];
  let refs = 0;
  for (const c of COPIES) {
    const dir = path.join(root, c), page = path.join(dir, "index.html");
    if (!fs.existsSync(page)) { bad.push(`${c}: no index.html`); continue; }
    if (fs.existsSync(path.join(dir, "CNAME"))) bad.push(`${c}: has a CNAME`);
    const s = fs.readFileSync(page, "utf8");
    const named = [...s.matchAll(/<(?:script|link|img)\b[^>]*\s(?:src|href)="([^"#]+)"/g), ...s.matchAll(/\bimport\s(?:[^;"']*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g)].map(m => [page, m[1]]);
    const urls = s => [...s.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m => m[1]).filter(u => !u.startsWith("data:") && !isRemote(u));
    for (const css of files.filter(f => f.startsWith(dir + path.sep) && f.endsWith(".css"))) {
      const s = fs.readFileSync(css, "utf8");
      // an @font-face lists fallbacks (woff2, woff, ttf); the browser takes the first it can use, so one must exist
      for (const m of s.matchAll(/@font-face\s*\{[^}]*\}/g)) {
        const u = urls(m[0]);
        refs++;
        if (u.length && !u.some(x => fs.existsSync(path.join(path.dirname(css), x)))) bad.push(`${rel(css)}: none of ${u.join(", ")}`);
      }
      for (const u of urls(s.replace(/@font-face\s*\{[^}]*\}/g, ""))) named.push([css, u]);
    }
    for (const [from, u] of named) {
      if (isRemote(u)) continue;
      refs++;
      if (!fs.existsSync(path.join(path.dirname(from), u))) bad.push(`${rel(from)}: ${u} missing`);
    }
  }
  check("6 page folders: index.html and every relative script, module, stylesheet, font and image present, no CNAME", bad.length === 0,
    `${COPIES.length} folders, ${refs} local references${bad.length ? "; " + bad.join("; ") : ""}`);
}

// 7. nothing private in any text file: no email addresses, local paths, file URLs, chat or session links, and GitHub
//    links only to the public repositories above. Third-party files in vendor/ folders are left out: they are the
//    published releases (exam-scan/tests checks pdf.js by its hashes), and minified code holds URL schemes and paths.
{
  const text = files.filter(f => (/\.(html|md|mjs|js|css|txt|json)$/.test(f) || !path.extname(f)) && !rel(f).split("/").includes("vendor"));
  const rules = [["email address", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i], ["local path", /(^|[\s"'(])(\/home|\/root|\/tmp|\/Users|[A-Z]:\\)[\\/]/m],
    ["file URL", /file:\/\//], ["chat or session link", /claude\.ai|session_[A-Za-z0-9]{6,}/]];
  const hits = [];
  let gh = 0;
  for (const f of text) {
    const s = fs.readFileSync(f, "utf8");
    for (const [what, re] of rules) if (re.test(s)) hits.push(`${rel(f)}: ${what}`);
    for (const m of s.matchAll(/github\.com\/([\w.-]+)(?:\/([\w.-]+))?/gi)) {
      gh++;
      if (m[1].toLowerCase() !== "crestk" || !PUBLIC_REPOS.some(r => r.toLowerCase() === (m[2] || "").toLowerCase())) hits.push(`${rel(f)}: links ${m[0]}`);
    }
  }
  check("7 no email addresses, local paths or session links; GitHub links to public repositories only", hits.length === 0,
    `${text.length} text files, ${gh} GitHub links${hits.length ? "; " + hits.join("; ") : ""}`);
}

// 8. the copied pages' own tests still pass where they now live
if (quick) console.log("skip  8 copied pages' own tests (--quick)");
else {
  const out = [];
  let ok = true;
  for (const t of COPY_TESTS) {
    const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(root, t)], { encoding: "utf8" });
    const lines = (r.stdout || "").trim().split("\n"), passes = lines.filter(l => l.startsWith("PASS")).length;
    ok = ok && r.status === 0;
    out.push(`${t}: ${passes} PASS, ${lines[lines.length - 1]} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  check("8 copied pages' own tests pass", ok, out.join("; "));
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
