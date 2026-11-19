# Exam scan check

`index.html` is a single-page web app that checks a scanned stack of exams for skipped, duplicated, out-of-order,
upside-down and blank pages, turns pages in the PDF, and saves a much smaller copy without the pages you remove (such as
the blank backs of a two-sided scan). The check and the rotation are a browser port of two scripts, `check_scan.py` and
`rotate_pdf.py`: the same method and the same report, with the files kept in the browser.

**Live page:** https://handbook.koemel.net/exam-scan/index.html

**Inputs:** the scanned stack as a PDF; a blank copy of the exam as a PDF, or instead "the first *n* scanned pages"
(one complete exam); the resolution of the comparison (default 30 dpi, as the script). Password-protected PDFs ask for
the password. In the page grid: a page selection typed as in `rotate_pdf.py -p` (`1,3-5,9-`, `-4`, `even`, `odd`,
`last`, `all`), as "page *k* of every *n*" (2 of every 2 is every back of a two-sided scan; *k* can be a list such as
2,4), as the pages the check flagged or found blank, or made by clicking and Shift-clicking pages; buttons that turn
the selection 90° either way or 180°, and that remove it from the smaller copy or put it back. For the smaller copy: the
resolution (default 150 dpi), the JPEG quality (default 50 %) and grayscale.

**Output:**

- The report of `check_scan.py`: a summary line, every issue (MISSING, DUPLICATE, and NOTE for upside-down, blank,
  "looks most like page …" and low-confidence pages), and which scan pages make up each exam, with links to the pages.
- A page-by-page table with the script's `--csv` columns plus the turn each page needs to stand upright.
- Downloads: the report as text and the table as CSV, both in the script's format.
- A grid of every scanned page with its exam and page number; flagged pages are outlined in red, turns show at once.
- "Turn every upside-down and sideways page upright" sets the turns the check found; "Save" writes
  *name*_rotated.pdf. pdf.js reads the new file back and every page's rotation is checked before it is offered. This
  file keeps every page.
- Removed pages are dimmed in the grid. A removed page that the check did not find blank is listed in red, so a back on
  which a student went on writing is not dropped unseen.
- "Estimate the size": the size of the whole smaller copy at 100, 150 and 200 dpi and quality 30–75 %, from 6 sample
  pages, and one page as it would be stored, shown at about paper size. Clicking a size picks those settings.
- "Make the smaller copy" writes *name*_compressed.pdf: the kept pages, turned, each drawn again at the chosen resolution
  and stored as one JPEG image on a page of the same size. pdf.js reads it back before it is offered (page count, page
  sizes, and every page against its page in the scan), and it is refused if it would not be smaller than the scan.
- The methods at the bottom of the page.

## Method

The check renders every page at 30 dpi in grayscale, turns landscape pages to portrait, shrinks them to 170 × 220
pixels (Lanczos), turns the gray into an ink map relative to the paper level (90th percentile) and blurs it (Gaussian,
radius 1.5). Each scanned page is compared with each template page by normalised correlation over shifts of up to
4 pixels, upright and turned 180°. Pages with almost no ink are set aside as blank. A dynamic programme finds the
most likely global position (exam × *n* + page) of every page, with a cost of 4 for every skipped position or repeat.
A second pass rebuilds each template page as the median of its scanned copies and matches again.

The smaller copy draws each kept page with pdf.js at the chosen resolution (with its turn, on white, gray if asked),
encodes it with the browser's JPEG encoder and writes a new PDF with one image per page, the JPEG stored as it is
(DCTDecode), and a cross-reference table. Reading it back, every page is drawn again at the comparison resolution, turned
back, and compared with the scan's own drawing of that page as in the check: similarity at least 0.9, or both blank.
The copy is images only: searchable text (OCR), links and bookmarks are not kept, and it has no password.

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
| `index.html` | the app: markup, the core (`<script id="core">`: image steps exactly as Pillow and numpy, correlation, page sequence, report, page selection, inflate, PDF reader and incremental-update writer, JPEG headers and the smaller copy's PDF writer), the UI and the methods |
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
- Page selection: 21 cases give the same pages (or an error) as `rotate_pdf.py`'s `parse_pages`; `compact` too. "Page
  *k* of every *n*": 8 cases, among them 2 of every 2, 2,4 of every 8, `even` within runs of 4 and 4 refused inputs.
- Inflate: 20 of 20 zlib and raw deflate streams (stored, fixed and dynamic blocks) decode exactly.
- Rotation on hand-built PDFs with a classic table, an inherited `/Rotate`, an object stream with a PNG-predicted
  cross-reference stream, a hybrid file (table plus `/XRefStm`) and a damaged `startxref`, and two saves in a row:
  the core and the bundled pdf.js read the intended rotation on every page, and the original bytes are kept.
- Smaller copy: the size, components and coding of three JPEGs made with Pillow (baseline colour, progressive gray, EXIF
  and a comment before the frame header) are read from their headers, and a PNG, a truncated JPEG and an empty file are
  refused. A PDF of those three as pages of 612 × 792, 841.89 × 595.276 and 200.5 × 100.25 pt has a cross-reference
  table whose every offset points at its object, holds the JPEGs byte for byte, and reads back in the core and in pdf.js
  with those page sizes, image sizes and colours (within 12 of the colours drawn). Grayscale gives the check's own gray
  levels; no pages, a zero page size and a non-JPEG are refused.
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

The smaller copy was tried in Chromium on synthetic scans made with Pillow. 40 pages scanned at 300 dpi in colour
(75 MB, 2 MB a page; one upside-down, one sideways, one blank): at 150 dpi and quality 50 % the copy was 3.3 MB, the
estimate 3.2 MB, in 6.4 s including the read-back; at 100 dpi the estimate was 2.0 MB; at 50 dpi, quality 10 %, in
grayscale, 368 KB, and every page still passed the read-back (lowest similarity 0.991). poppler and pypdf (strict) read
the copies; drawn by poppler, the turned pages are upright. A two-sided scan of 6 exams × 4 pages (48 pages, the backs
blank with faint show-through, one back written on) checked against the blank exam: the check found 23 blank pages;
removing "2 of every 2" listed the written back in red; the copy had exactly the kept pages in order. A password-protected
scan with an OCR text layer gave the warning about the text and an unencrypted copy; a copy that would be larger than
the scan (a 72 dpi scan at 300 dpi) was refused; Stop left no file.
