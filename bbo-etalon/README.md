# BBO crystal and etalon for a narrowband pulse

`index.html` is a single-page web app that picks the BBO crystal for making a narrowband pulse (a Raman pump for FSRS,
for example) by frequency doubling a femtosecond pulse and sending the second harmonic through an etalon. For each
crystal length it works out the second harmonic and the pulse that leaves the etalon, and lists which crystals give a
single clean pulse (a sharp rise and an exponential decay) of the wanted bandwidth. The thinnest one that works is the
suggestion. The crystal is modelled with the full phase mismatch from the BBO Sellmeier equations of Tamošauskas et al.
(2018); the etalon as on the etalon page of this site.

**Live page:** https://handbook.koemel.net/bbo-etalon/index.html

**Inputs:**
- **Pulse:** λ₂, the wavelength of the narrowband pulse (the second harmonic), 400–750 nm. The fundamental is at 2λ₂. It is given as a bandwidth Δλ₁ in nm, a duration τ₁ in fs (both transform-limited), or both (the extra bandwidth is a linear chirp).
- **Wanted bandwidth** of the narrowband pulse (FWHM, cm⁻¹).
- **Etalon:** one of
  - mirror reflectance *R* and free spectral range FSR as entered;
  - *R* as entered, with the FSR (gap) set for the wanted bandwidth;
  - the FSR as entered, with *R* set for the wanted bandwidth.

  The gap index *n* is used only for the listed gap.
- **Crystals:** 0.1, 0.3 and 0.5 mm (ticked), plus any other lengths typed as a list; the list is kept in the browser.
- **Criteria for a clean pulse:** at most ±5 % ripple on the decay; bandwidth within ±10 % of the wanted; 10–90 % rise at most 100 % of the 1/e decay time. All three can be changed.

Three examples: 515 nm from a 7 nm fundamental to 15 cm⁻¹, 400 nm from 100 fs to 10 cm⁻¹, and 650 nm from 150 fs to 12 cm⁻¹. Reset restores the defaults. Everything recalculates as you type.

**Output:**

- A line on the fundamental: bandwidth and duration, the phase-matching angle and the group-velocity mismatch (GVM), the thin-crystal second harmonic. A line on the etalon: *R*, FSR, gap, peak FWHM, finesse, decay time, round trip.
- A sentence with the thinnest crystal that works and its pulse, or why none works.
- A table, one row per crystal, with these columns:
  - the second harmonic's FWHM (cm⁻¹ and nm) and duration;
  - FSR / SH FWHM;
  - the pulse's FWHM (cm⁻¹ and nm), 1/e decay and 10–90 % rise, and rise / decay;
  - ripple on the decay;
  - share of the light in one band, and share of the second harmonic the etalon passes;
  - the result.

  Values that miss a criterion are in red; click a row to plot that crystal.
- **Against crystal length** (40 lengths, about 0.05–10 mm, log axes): one plot of the SH and pulse bandwidths with FSR/2 and the wanted bandwidth, and one of the ripple and the rise as a share of the decay with their limits. The lengths that work are shaded, and the listed crystals are dots, filled when they work. A line gives the range that works and the thinnest length, refined between scan points.
- **Selected crystal:** the spectrum (second harmonic, etalon transmission, transmitted band with its FWHM) and the pulse in time (second harmonic, transmitted pulse, and the exponential with the etalon's decay), on a linear or log scale. Drag to zoom, hover to read.
- The methods and equations at the bottom of the page.

## Model

- **Phase matching:** type I (o + o → e), with *n*<sub>e</sub>(θ, λ₂) = *n*<sub>o</sub>(λ₁). The BBO dispersion is from Tamošauskas, Beresnevičius, Gadonas and Dubietis, *Opt. Mater. Express* **8**, 1410 (2018), valid from 0.188 to 5.2 µm, which covers the whole 800–1500 nm fundamental. It gives θ = 29.2° at 800 nm and 22.8° at 1064 nm. The GVM is 193 fs/mm at 800 nm, 95 at 1030 nm, 53 at 1200 nm and 2.6 at 1500 nm. Near 1500 nm the published fits differ by about 6 fs/mm, so results above λ₂ ≈ 700 nm are rough.
- **Second harmonic:** ℰ̃₂(Ω) ∝ ∫ ℰ̃₁(Ω/2 + *u*) ℰ̃₁(Ω/2 − *u*) [1 − e^(−iΔ*kL*)]/(iΔ*kL*) d*u*, with the exact Δ*k* from the Sellmeier equations. This assumes an undepleted fundamental and plane waves, with a Gaussian fundamental (linear chirp allowed).
  - For a Gaussian the integrand splits into the thin-crystal spectrum and a Gaussian weight in *u*, so the crystal enters as one weighted mean per frequency.
  - To first order this is the familiar Gaussian × sinc²(GVM·Ω·*L*/2): in time, a flat top *T* = GVM·*L* long with edges as sharp as τ₁/√2.
- **Etalon:** *t*(Ω) = (1 − *R*)/(1 − *R* e^(iΩ*t*<sub>rt</sub>)), with one peak on the centre of the second harmonic. The transmitted pulse is ℰ̃₂·*t*, taken to time with an FFT on a grid that spans 24 decay times.
- **Criteria:**
  - ripple = (max − min)/(max + min) of *I*<sub>T</sub>(*t*)·e^(*t*/τ<sub>c</sub>), measured from *T*/2 + 2τ₂ until the tail is down to 1 %; for a single etalon band this is flat;
  - rise = 10–90 % rise time over τ<sub>c</sub>;
  - bandwidth = FWHM of the transmitted band, by bisection on the exact spectrum.
- **Why the thinnest:** a thin crystal keeps the second harmonic short and Gaussian, so the pulse switches on fastest. A crystal that is too thin gives a second harmonic wider than about half the FSR, and the pulse breaks into round trips. A thick one gives a flat-topped second harmonic whose sharp edges add a step to the decay every round trip, and a slow rise.

Not included: depletion of the fundamental and the conversion efficiency (thicker crystals convert more at low intensity), focusing, spatial walk-off and angular acceptance, mirror loss, coating dispersion, a peak away from the centre, absorption.

## Use

Open `index.html` in a browser. It needs no server, no build step and no network. To publish it, serve the repository
root from any static host, for example GitHub Pages with "Deploy from a branch" set to the repository root.

## Files

| path | what |
|---|---|
| `index.html` | the app: markup, the core (`<script id="core">`: BBO Sellmeier equations and phase matching, the second harmonic with the full phase mismatch, etalon formulas, FFT, the pulse in time, ripple, rise and bandwidth, the verdict), the UI and the equations |
| `tests/validate.mjs` | checks the core inside `index.html` |

## Tests

```
node tests/validate.mjs     # under 1 s
```

- **BBO dispersion and phase matching:**
  - the indices agree with Eimerl et al. (1987) to 9.7×10⁻⁴ from 0.4 to 1.064 µm;
  - θ is 29.21° at 800 nm and 22.83° at 1064 nm (tabulated 29.2° and 22.8°);
  - the GVM is 94.8 fs/mm at 1030 nm and 85.2 at 1064 nm, against 95.0 and 85.6 from the Zhang et al. (2000) equations;
  - Δ*k* = 0 at the phase-matching angle to 3×10⁻¹⁶, and there is no type I SHG below 410 nm.
- **GVM:** the GVM from group indices equals the slope of the exact Δ*k* for equal photons to 1×10⁻⁸, at 800, 1030 and 1300 nm.
- **Thin crystal:** the second harmonic is √2 as wide as the fundamental to 7×10⁻⁵ and 1/√2 as long to 3×10⁻⁴, also with a chirp of 2.
- **First-order limit:** at 1030 nm the full model gives the width of Gaussian × sinc² to 4×10⁻⁴ (260 fs at 2 and 6 mm, 150 fs at 10 mm). A 2 ps pulse in 10 mm gives 9.90 cm⁻¹, against 10.41 thin and 31.18 for the sinc² alone.
- **Pulse in time:** against the pulse train (1 − *R*) Σ *R*<sup>*j*</sup> *E*₂(*t* − *jt*<sub>rt</sub>) summed directly:
  - thin crystal, four cases with and without chirp: within 8×10⁻⁹ of the peak;
  - 4 mm crystal against the first-order flat top (erf edges): within 2×10⁻⁴ for the second harmonic and 3×10⁻⁵ after the etalon.
- **Energy:** the transmitted share equals the etalon page's Fourier-series result to 5×10⁻⁸ (25.54, 16.07, 9.06 and 35.62 %), and time and spectrum agree to 3×10⁻¹⁵.
- **Ripple:** for a Gaussian second harmonic at FSR = 1.5, 1.75 and 2 × its width, ±17.5, ±5.73 and ±1.56 % (beat estimate ±4√*S*: 17.7, 5.73, 1.56 %). At 4 × its width the ripple is below 10⁻⁴ %.
- **Pulse bandwidth:** 14.6322 cm⁻¹ for a 200 fs pulse at *R* 76.1 %, FSR 172 cm⁻¹, equal to a bisection of Gaussian × Airy. The etalon page reads 14.637 off its grid; the share in one band is 99.954 % on both. The decay time of a high-finesse etalon equals 1/(2π*c*·FWHM).
- **Etalon settings:** 15 cm⁻¹ at FSR 172 gives *R* = 76.164 %, as on the etalon page, and the FSR comes back exactly. Impossible settings give no solution.
- **Verdicts on the examples:**

  | case | thinnest that works |
  |---|---|
  | 515 nm, 7 nm fundamental | all six crystals work, 0.1 mm |
  | 515 nm, 8 nm fundamental | 2 mm (0.1–1 mm fail on ripple: ±10.8 % at 0.1 mm) |
  | 400 nm, 100 fs, FSR 300 | 0.5 mm |
  | 650 nm, 150 fs, *R* 85 % | 4 mm (GVM only 34.5 fs/mm) |

  The 24 crystals take about 0.1 s.
- **Crystal list:** the parser ignores units and repeats and rejects text and negative lengths, and the page loads nothing from elsewhere.

Checked in headless Chromium at 1280 × 900 and 390 × 844, outside the tests:
- no console errors and no sideways scrolling;
- the three examples, the three etalon modes and a chirped pulse all run;
- an impossible duration and a bad crystal list give a message;
- the crystal list survives a reload.
