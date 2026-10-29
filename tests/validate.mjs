// Checks index.html: previews exist and stay small, every entry links consistently, the page loads nothing from
// elsewhere, and no file in the repository holds anything that should not be on a public page.
//   node tests/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// public repositories the page may link to
const PUBLIC_REPOS = ["Franck-Condon-Factor", "Gaussian-Intensity-Weighted-Focal-Overlap-Public", "Beam-Overlap-Game-Public",
  "Solvent-subtraction", "Spectroscopist-Handbook"];
const PREVIEW_PX = 256, PREVIEW_MAX = 20 * 1024, PREVIEWS_TOTAL_MAX = 60 * 1024, PAGE_MAX = 20 * 1024;

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  " + info : ""}`); if (!ok) fails++; };
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

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
  check("1 previews are 256 × 256 WebP, no metadata, ≤ 20 KB each", imgs.length >= 4 && bad.length === 0,
    `${imgs.length} images, ${(total / 1024).toFixed(1)} KB in all${bad.length ? "; " + bad.join("; ") : ""}`);
  const dir = path.join(root, "previews"), files = fs.readdirSync(dir), dirTotal = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  const unused = files.filter(f => !html.includes(`previews/${f}`));
  check("2 previews/ holds only images the page uses, ≤ 60 KB in all", unused.length === 0 && dirTotal <= PREVIEWS_TOTAL_MAX,
    `${files.length} files, ${(dirTotal / 1024).toFixed(1)} KB${unused.length ? "; unused: " + unused.join(", ") : ""}`);
}

// 3. every entry has a unique id, a preview square and a title, both linking to the same page
{
  const entries = [...html.matchAll(/<div class="entry" id="([^"]+)">([\s\S]*?)<\/h3>/g)];
  const ids = entries.map(m => m[1]), bad = [];
  for (const [, id, body] of entries) {
    const thumb = (body.match(/<a class="thumb[^"]*" href="([^"]+)"/) || [])[1], title = (body.match(/<h3><a href="([^"]+)"/) || [])[1];
    if (!thumb || !title || thumb !== title) bad.push(`${id}: preview ${thumb} vs title ${title}`);
  }
  check("3 each entry: preview and title link to the same page", entries.length === 5 && new Set(ids).size === ids.length && bad.length === 0,
    `${entries.length} entries (${ids.join(", ")})${bad.length ? "; " + bad.join("; ") : ""}`);
}

// 4. links: https only, and GitHub links only to the public repositories above
{
  const hrefs = [...html.matchAll(/\shref="([^"]+)"/g)].map(m => m[1]);
  const notHttps = hrefs.filter(h => !h.startsWith("https://")), gh = hrefs.filter(h => /github\.com/.test(h));
  const other = gh.filter(h => !PUBLIC_REPOS.some(r => h === `https://github.com/CrestK/${r}` || h.startsWith(`https://github.com/CrestK/${r}/`)));
  check("4 links are https; GitHub links go to public repositories only", notHttps.length === 0 && other.length === 0,
    `${hrefs.length} links, ${gh.length} to GitHub${notHttps.length ? "; not https: " + notHttps.join(", ") : ""}${other.length ? "; other: " + other.join(", ") : ""}`);
}

// 5. the page loads nothing from elsewhere and needs no script
{
  const ext = [...html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*\s(src|href)="(https?:)?\/\/[^"]*"/g)].map(m => m[0]);
  const scripts = (html.match(/<script\b/g) || []).length, styles = (html.match(/<link\b[^>]*stylesheet/g) || []).length;
  check("5 no external resources, no scripts, page ≤ 20 KB", ext.length === 0 && scripts === 0 && styles === 0 && html.length <= PAGE_MAX,
    `${ext.length} external, ${scripts} scripts, ${styles} stylesheets, ${(html.length / 1024).toFixed(1)} KB`);
}

// 6. nothing private in any text file: no email addresses, no local paths, no chat or session links
{
  const files = [], walk = d => { for (const f of fs.readdirSync(d)) { if (f === ".git") continue; const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(root);
  const text = files.filter(f => /\.(html|md|mjs|js|css|txt|json)$/.test(f) || !path.extname(f));
  const rules = [["email address", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i], ["local path", /(^|[\s"'(])(\/home|\/root|\/tmp|\/Users|[A-Z]:\\)[\\/]/m],
    ["file URL", /file:\/\//], ["chat or session link", /claude\.ai|session_[A-Za-z0-9]{6,}/]];
  const hits = [];
  for (const f of text) { const s = fs.readFileSync(f, "utf8"); for (const [what, re] of rules) if (re.test(s)) hits.push(`${path.relative(root, f)}: ${what}`); }
  check("6 no email addresses, local paths or session links in the repository", hits.length === 0,
    `${text.length} text files${hits.length ? "; " + hits.join("; ") : ""}`);
}

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
