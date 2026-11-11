# Spectroscopist Handbook

`index.html` is the home page for a set of spectroscopy web pages: calculations and ideas first written in Igor Pro,
moved into the browser so they are easy to use. It lists each page in two columns with a small square preview and a
short description. Every page is kept in this repository as a copy, in its own folder, so the handbook is one site on
one domain. The originals stay in their own repositories and on their own sites.

**Live page:** https://handbook.koemel.net/

**Pages:**

| folder | page | copied from | standalone site |
|---|---|---|---|
| `franck-condon/` | Franck–Condon overlap factors | [Franck-Condon-Factor](https://github.com/CrestK/Franck-Condon-Factor) at `94197c8` | — |
| `focal-overlap/` | Gaussian beam focal overlap | [Gaussian-Intensity-Weighted-Focal-Overlap-Public](https://github.com/CrestK/Gaussian-Intensity-Weighted-Focal-Overlap-Public) at `ab0337d` | https://beamoverlap.koemel.net/ |
| `overlap-game/` | Find the overlap (game) | [Beam-Overlap-Game-Public](https://github.com/CrestK/Beam-Overlap-Game-Public) at `a1a1261` | https://beamoverlap.game.koemel.net/ |
| `screensaver/` | Beam overlap screensaver | a single `index.html`, added by hand | https://screensaver.overlap.koemel.net/ |
| `solvent-subtraction/` | Solvent subtraction | [Solvent-subtraction](https://github.com/CrestK/Solvent-subtraction) at `19f2435` | — |
| `lorentz-explorer/` | Lorentz oscillator: absorption and refractive index | its `index.html`, README and tests, added by hand | — |
| `shg-narrowing/` | Spectral narrowing by SHG in BBO | made here, with its README and tests | — |
| `advanced-optics/` | Advanced optics: interactive examples | made here, with its README and tests | — |
| `polarization-interference/` | Birefringence, wave plates and interference | made here, with its README and tests | — |
| `exam-scan/` | Exam scan check | made here: a browser port of `check_scan.py` and `rotate_pdf.py`, with its README and tests | — |

Each copy holds only what the page needs to run (its `index.html`, scripts, and for Franck–Condon, advanced optics and wave plates the bundled KaTeX),
plus its tests where the original has them. READMEs, CNAME files and `package.json` stay in the originals; the Lorentz
oscillator, SHG narrowing, advanced optics and wave plates pages have no repository of their own, so their READMEs (model, references, test numbers) are kept in their folders. The copies
are not edited, so they keep the look of the original pages, and the focal overlap and game pages still load their web
fonts from Google Fonts. The game keeps best times per site in the browser, so scores set here and on its standalone
site are separate.

**Output:**

- A two-column list (one column below 860 px wide): preview, title, a few sentences on what the page does, and links to
  the source repository and the standalone site where there is one. The preview and the title both open the copy here.
- A notes section: the pages run in the browser, are static folders, and where their tests are.

## Updating a copy

Copy the same files again from the original repository and record the new commit in the table above. For example:

```
git clone --depth 1 https://github.com/CrestK/Solvent-subtraction ../Solvent-subtraction
cp ../Solvent-subtraction/index.html solvent-subtraction/ && cp -r ../Solvent-subtraction/tests solvent-subtraction/
node tests/validate.mjs
```

## Adding a page

1. Copy the page into a new folder named after it (no CNAME, README or `package.json`).
2. Take a screenshot of the page at 1280 × 900, crop a square around its main plot (text is unreadable at this size),
   and save it as a 256 × 256 WebP (quality about 80, a few KB) in `previews/`.
3. Copy one `<div class="entry">` block in `index.html`, set its `id` to the folder name and both links to
   `<folder>/index.html`. Without a preview yet, use `<a class="thumb empty" href="…">preview to come</a>` in place of
   the image link.
4. Add the folder to `COPIES` in `tests/validate.mjs`, its tests to `COPY_TESTS` if it has them, and its repository to
   `PUBLIC_REPOS` if the page links to it on GitHub (the repository must be public).
5. Run the tests.

## Use

Open `index.html` in a browser. The home page needs no server, no build step, no script and no network, and so do the
copies (they also open straight from disk; the links go to `<folder>/index.html` for that reason). The exam scan page is
the exception: its PDF reader is a JavaScript module, so it has to be served, by this site or a local web server
(`python3 -m http.server` in the repository root). To publish it, serve the
repository root from any static host. Here it is GitHub Pages, "Deploy from a branch" with `main` and the repository
root, on the domain in `CNAME`; the pages are then at https://handbook.koemel.net/franck-condon/index.html and so on.
The empty `.nojekyll` file tells Pages to serve the files as they are instead of running them through Jekyll.

## Files

| path | what |
|---|---|
| `index.html` | the home page: markup and styles, no script |
| `CNAME`, `.nojekyll` | the GitHub Pages domain, and "serve as is, no Jekyll" |
| `previews/` | the 256 × 256 WebP previews, shown at 128 px (96 px on a phone) |
| `franck-condon/`, `focal-overlap/`, `overlap-game/`, `screensaver/`, `solvent-subtraction/`, `lorentz-explorer/`, `shg-narrowing/`, `advanced-optics/`, `polarization-interference/`, `exam-scan/` | the pages |
| `tests/validate.mjs` | checks the home page, the previews, the copies and every text file in the repository |

The home page is 12.1 KB and the ten previews 50.3 KB; the pages are about 5.3 MB, most of it pdf.js in
`exam-scan/vendor/` (2.4 MB) and KaTeX in `franck-condon/vendor/`, `advanced-optics/vendor/` and `polarization-interference/vendor/`.

## Tests

```
node tests/validate.mjs            # about 25 s
node tests/validate.mjs --quick    # under 0.1 s, without the copied pages' own tests
```

- Every preview is a 256 × 256 WebP with no EXIF or XMP metadata and at most 20 KB (10 files, 50.3 KB in all), and
  `previews/` holds nothing the page does not use.
- All 10 entries have a unique id matching their folder, and their preview and title link to `<folder>/index.html`.
- All 20 local links on the home page resolve; the 8 remote links are https. The home page loads nothing from
  elsewhere (no scripts, stylesheets or remote images).
- Every page folder has its `index.html` and no CNAME, and all 72 local references (scripts, modules, stylesheets, images, and one font
  file for each of the 20 `@font-face` rules in each copy of KaTeX, which list woff2, woff and ttf as fallbacks; only woff2 is shipped)
  exist.
- No text file in the repository (32 files, pages included; third-party files in `vendor/` folders are left out, and
  pdf.js is checked by its hashes in `exam-scan/tests`) holds an email address, a local file path, a file URL or a
  chat or session link, and all 11 GitHub links go to the public repositories listed in the test.
- The copied pages' own tests pass where they now live: Franck–Condon 11 checks (about 6 s), solvent subtraction 50
  checks (about 10 s), Lorentz oscillator 17 checks (under 1 s), SHG narrowing 47 checks (about 1.5 s), advanced optics 23 checks (under 1 s), wave plates and interference 17 checks (under 1 s), exam scan check 22 checks (about 6 s).
- A broken copy of the repository (a missing preview, a link to an unlisted repository, a remote script, an email
  address, a local path, a session link, a deleted script in a copy and a CNAME in a copy) fails checks 1, 2, 5, 6
  and 7, each naming the problem.
