# Spectroscopist Handbook

`index.html` is the home page for a set of spectroscopy web pages: calculations and ideas first written in Igor Pro,
moved into the browser so they are easy to use. It lists each page in two columns with a small square preview, a short
description and a link to its source. The pages live in their own repositories; this one holds only the hub, so it stays
small (the page is 6.6 KB, the four previews 18.5 KB).

**Pages:**

| page | live | source |
|---|---|---|
| Franck–Condon overlap factors | https://crestk.github.io/Franck-Condon-Factor/ | [Franck-Condon-Factor](https://github.com/CrestK/Franck-Condon-Factor) |
| Gaussian beam focal overlap | https://beamoverlap.koemel.net/ | [Gaussian-Intensity-Weighted-Focal-Overlap-Public](https://github.com/CrestK/Gaussian-Intensity-Weighted-Focal-Overlap-Public) |
| Find the overlap (game) | https://beamoverlap.game.koemel.net/ | [Beam-Overlap-Game-Public](https://github.com/CrestK/Beam-Overlap-Game-Public) |
| Beam overlap screensaver | https://screensaver.overlap.koemel.net/ | — (preview and description to come) |
| Solvent subtraction | https://crestk.github.io/Solvent-subtraction/ | [Solvent-subtraction](https://github.com/CrestK/Solvent-subtraction) |

**Output:**

- A two-column list (one column below 860 px wide): preview, title, two or three sentences on what the page does, and a
  source link. The preview and the title both open the page.
- A notes section: the pages run in the browser, are static sites, and where their tests are.

## Adding a page

1. Take a screenshot of the page at 1280 × 900, crop a square around its main plot (text is unreadable at this size),
   and save it as a 256 × 256 WebP (quality about 80, a few KB) in `previews/`.
2. Copy one `<div class="entry">` block in `index.html`, give it a new `id`, and set the same `href` on the preview and
   the title. Without a preview yet, use the screensaver's `<a class="thumb empty">` block.
3. If the source link goes to a new GitHub repository, make sure that repository is public and add its name to
   `PUBLIC_REPOS` in `tests/validate.mjs`.
4. Run the tests.

## Use

Open `index.html` in a browser. It needs no server, no build step, no script and no network. To publish it, serve the
repository root from any static host, for example GitHub Pages with "Deploy from a branch" set to the repository root.

## Files

| path | what |
|---|---|
| `index.html` | the page: markup and styles, no script |
| `previews/` | the 256 × 256 WebP previews, shown at 128 px (96 px on a phone) |
| `tests/validate.mjs` | checks the page, the previews and every text file in the repository |

## Tests

```
node tests/validate.mjs     # under 0.1 s
```

- Every preview is a 256 × 256 WebP with no EXIF or XMP metadata and at most 20 KB (4 files, 18.5 KB in all), and
  `previews/` holds nothing the page does not use.
- All 5 entries have a unique id, and their preview and title link to the same page.
- All 15 links are https; the 5 GitHub links go only to the public repositories listed in the test.
- The page loads nothing from elsewhere (no scripts, stylesheets or remote images) and is 6.6 KB.
- No text file in the repository holds an email address, a local file path, a file URL or a chat or session link.
- A broken copy (a missing preview, an unlisted repository, a remote script, an email address, a local path and a
  session link planted) fails checks 1, 2, 4, 5 and 6.
