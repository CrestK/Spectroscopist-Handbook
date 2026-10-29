# Exam scan check

`index.html` is a single-page web app that checks a scanned stack of exams for skipped, duplicated, out-of-order,
upside-down and blank pages, and turns pages in the PDF. It is a browser port of two scripts, `check_scan.py` (the
check) and `rotate_pdf.py` (the rotation): the same method and the same report, with the files kept in the browser.

**Live page:** https://handbook.koemel.net/exam-scan/index.html

**Inputs:** the scanned stack as a PDF; a blank copy of the exam as a PDF, or instead "the first *n* scanned pages"
(one complete exam); the resolution of the comparison (default 30 dpi, as the script). Password-protected PDFs ask for
the password. In the page grid: a page selection typed as in `rotate_pdf.py -p` (`1,3-5,9-`, `-4`, `even`, `odd`,
`last`, `all`) or made by clicking and Shift-clicking pages, and buttons that turn the selection 90° either way or 180°.

**Output:**

- The report of `check_scan.py`: a summary line, every issue (MISSING, DUPLICATE, and NOTE for upside-down, blank,
  "looks most like page …" and low-confidence pages), and which scan pages make up each exam, with links to the pages.
- A page-by-page table with the script's `--csv` columns plus the turn each page needs to stand upright.
- Downloads: the report as text and the table as CSV, both in the script's format.
- A grid of every scanned page with its exam and page number; flagged pages are outlined in red, turns show at once.
- "Turn every upside-down and sideways page upright" sets the turns the check found; "Save" writes
  *name*_rotated.pdf. pdf.js reads the new file back and every page's rotation is checked before it is offered.
- The methods at the bottom of the page.

## Method

The check renders every page at 30 dpi in grayscale, turns landscape pages to portrait, shrinks them to 170 × 220
pixels (Lanczos), turns the gray into an ink map relative to the paper level (90th percentile) and blurs it (Gaussian,
radius 1.5). Each scanned page is compared with each template page by normalised correlation over shifts of up to
4 pixels, upright and turned 180°. Pages with almost no ink are set aside as blank. A dynamic programme finds the
most likely global position (exam × *n* + page) of every page, with a cost of 4 for every skipped position or repeat.
A second pass rebuilds each template page as the median of its scanned copies and matches again.

Rotation is a change of each page's `/Rotate` entry, as in `rotate_pdf.py`, so the scanned images are not re-rendered
or recompressed. The page writes the changed page objects as an incremental update after the unchanged original
bytes, with a cross-reference table or stream of the same kind as the file's; an encrypted PDF stays encrypted.

**Privacy:** the PDFs are read with the browser's file picker and stay in the tab's memory. The page carries a
Content-Security-Policy with `connect-src 'self'` and `default-src 'none'`: the browser blocks every connection,
image or form to any other site. pdf.js runs in a worker that inherits this policy.

## Use

Open `index.html` from a web server: this site, or locally `python3 -m http.server` in the repository root and then
http://localhost:8000/exam-scan/. Browsers do not load JavaScript modules (pdf.js) from a page opened straight from
disk. It needs Firefox 114, Chrome 91, Safari 15 or newer (module workers and WebAssembly).

## Files

| path | what |
|---|---|
| `index.html` | the app: markup, the core (`<script id="core">`: image steps exactly as Pillow and numpy, correlation, page sequence, report, page selection, inflate, PDF reader and incremental-update writer), the UI and the methods |
| `vendor/pdfjs/` | pdf.js 6.4.299, legacy build (Mozilla, Apache 2.0): `pdf.min.mjs`, `pdf.worker.min.mjs`, and in `wasm/` the JBIG2/CCITT and JPEG 2000 decoders with their licences |
| `tests/validate.mjs` | checks the core inside `index.html`, the bundled files and the privacy policy |

## Tests

```
node tests/validate.mjs     # about 5 s
```

- Image steps bit for bit: the Lanczos resize (from 30 and 72 dpi, and up), the Gaussian blur, the quarter turn and
  the whole float32 ink map with its ink fraction have the same SHA-256 as `check_scan.py`'s functions with Pillow 13
  and numpy 2 give on the same test images.
- Correlation: a page against itself gives 1 (to 10⁻¹⁰), shifted by 2 pixels still 1.000000, and the fast version
  equals a direct computation to 3×10⁻¹³.
- Page sequence: on 40 random score tables the dynamic programme's cost equals the brute-force optimum exactly.
- A synthetic stack of 10 exams × 6 pages with a missing page, a duplicate, two swapped pages, an upside-down page, a
  blank back and a sideways page: exactly those 7 issues, in the script's wording; turns 180° for the upside-down page
  and 90° clockwise for the sideways one; the same issues with "the first 6 scanned pages" as the template.
- Page selection: 21 cases give the same pages (or an error) as `rotate_pdf.py`'s `parse_pages`; `compact` too.
- Inflate: 20 of 20 zlib and raw deflate streams (stored, fixed and dynamic blocks) decode exactly.
- Rotation on hand-built PDFs with a classic table, an inherited `/Rotate`, an object stream with a PNG-predicted
  cross-reference stream, a hybrid file (table plus `/XRefStm`) and a damaged `startxref`, and two saves in a row:
  the core and the bundled pdf.js read the intended rotation on every page, and the original bytes are kept.
- The bundled pdf.js files have the SHA-256 of the published pdfjs-dist 6.4.299; the page's policy allows connections
  only to its own site and nothing is loaded from elsewhere.

Checked once more widely, outside the tests: on a 61-page synthetic scanned stack made with PyMuPDF and Pillow,
the core run on `check_scan.py`'s own renders gives bit-identical features for all 67 pages, similarities within
7×10⁻⁶, identical page sequences in both passes and an identical report and CSV. The page itself, drawing the pages with
pdf.js, gives the same report; its similarities differ from MuPDF's by 0.013 on average (at most 0.038). Turning pages
in nine PDFs from PyMuPDF, pypdf and Pillow (classic, object streams, incremental updates, inherited rotation, AES-256,
RC4, damaged) gives the rotations pypdf, PyMuPDF, pdf.js and `rotate_pdf.py` all agree on, with text and images
unchanged. In Chromium, requests from the page and from a worker to another site were blocked and none arrived; a
305-page stack took 9.8 s to read and 5.2 s to check on 4 cores. Firefox was not available for testing here.
