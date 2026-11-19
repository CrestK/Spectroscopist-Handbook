# Etalon transmission and reflection

`index.html` is a single-page web app that shows what a Fabry–Perot etalon does to a femtosecond pulse, in transmission
and in reflection. The model is two equal, lossless mirrors (Airy function) and a Gaussian input pulse, transform-limited or linearly chirped.

**Inputs:** mirror reflectance *R* (0.01–99.9 %), free spectral range (0.5–2000 cm⁻¹), offset of the nearest transmission
peak from the pulse centre at normal incidence (−0.5 to 0.5 FSR), tilt of the etalon (0–60°, angle of incidence outside
the etalon), the input pulse as a duration τ (5–5000 fs, intensity FWHM), as a bandwidth Δν (3–3000 cm⁻¹, FWHM) or as both (a pulse that is
not transform-limited; Δν cannot be below the transform limit of τ), pulse centre wavelength
λ₀ (150–5000 nm) and the refractive index in the gap (1–5). λ₀ and *n* set the listed gap, the nm values and the size of the tilt shift.
Everything recalculates as you type or drag. Four example buttons load 200 fs → 15 cm⁻¹, 70 fs → 15 cm⁻¹, a 25 µm air gap with
12.5 cm⁻¹ peaks, and a low-*R* etalon used in reflection; Reset returns to the first. A second set of inputs, "Etalon for a given bandwidth",
takes the wanted transmission bandwidth (FWHM in cm⁻¹, THz or nm, or the 1/e decay time of the transmitted pulse in fs or
ps) and a spacing (FSR in cm⁻¹, THz or nm, a gap thickness in µm, or a multiple of the input bandwidth); a button copies the resulting *R* and FSR into the main inputs.

**Output:**

- A drawing of the etalon with the incident beam and the transmitted and reflected partial beams, each labelled with its
  share of the incident intensity.
- Transmission plot: etalon transmission, input spectrum and transmitted spectrum against wavenumber from the pulse centre.
  Orange bars mark the FWHM of the output bands, and a line under the plot gives the etalon peak FWHM and the position,
  FWHM and share of the two output bands nearest the pulse centre.
- Reflection plot: the same for the reflected light. The two plots share their zoom (drag to zoom, double-click to zoom out).
- A table of the etalon (FSR, gap, round-trip time, coefficient of finesse, finesse, decay time, input bandwidth) and a
  table comparing transmission and reflection (maximum, minimum, FWHM, pulse energy, and the position, FWHM and share of the
  output for the nearest output band and the next one).
- "Etalon needed" table: mirror reflectance, finesse, coefficient of finesse, FSR, gap, peak FWHM, decay time, round-trip
  time, the tilt that tunes over one FSR, transmission between the peaks, and for the input pulse the height of the
  neighbouring peaks and the ripple they leave on the decay in time.
- "Tuning by tilt": peak shift (in FSR) against tilt angle with the current tilt marked, and a table with the tilt for one
  FSR, the shift at the current tilt in cm⁻¹, FSR and nm, the FSR at that tilt and the walk-off per round trip.
- Transmitted and reflected intensity against time, in units of the input peak intensity.
- The equations at the bottom of the page.

## Model

- Round-trip phase δ = 2π ν / FSR, FSR = 1 / (2 *n d* cos θ).
- Transmission *T* = 1 / [1 + *F* sin²(δ/2)], *F* = 4*R* / (1 − *R*)²; reflection 1 − *T*.
- Transmission peak FWHM = (2 FSR / π) arcsin(1/√*F*), defined only for *R* > 17.2 %; finesse π√*R* / (1 − *R*).
- Reflection bright band FWHM = FSR [1 − (2/π) arcsin(1/√(2 + *F*))], never below FSR/2.
- Inverse: *F* = 1 / sin²(π · FWHM / (2 FSR)), *R* = [*F* + 2 − 2√(*F* + 1)] / *F*, for FWHM < FSR; from a decay time τc,
  *R* = exp[−t_rt / (2τc)].
- Continuous decay: neighbouring peaks at *S*(FSR) = exp[−4 ln 2 (FSR/Δν)²] leave a ripple of about ±4√*S* on the tail
  (±18 % at FSR = 1.5 Δν, ±1.6 % at 2 Δν).
- Input pulse: field envelope exp[−2 ln 2 (1 + i*C*) t²/τ²] with c·τ·Δν = 0.4413 √(1 + *C*²).
- Tilt: peaks move as ν(θ) = ν(0)/cos θ_in with sin θ = *n* sin θ_in; one FSR at cos θ_in = 1 − FSR/ν; walk-off 2*d* tan θ_in
  per round trip. A tilt is applied as an effective FSR and peak offset, so every plot follows it.
- Time domain: a sum of delayed copies of the input, one round trip apart.

Not included: the change of *R* with angle and polarisation, broadening from beam divergence at a tilt, mirror loss, unequal mirrors, coating dispersion and phase, dispersion in the gap, beam walk-off and
divergence, surface flatness.

## Use

Open `index.html` in a browser. It needs no server, no build step and no network. To publish it, serve the repository
root from any static host, for example GitHub Pages with "Deploy from a branch" set to the repository root.

## Files

| path | what |
|---|---|
| `index.html` | the app: markup, the core (`<script id="core">`: Airy functions, widths, the inverse design, tilt tuning, pulse energies, output-band search, pulse trains in time), the UI and the equations |
| `tests/validate.mjs` | checks the core inside `index.html` |

## Tests

```
node tests/validate.mjs     # about 5 s
```

- *T* + *R* = 1 to 2e-16, and *T* equals the directly summed partial beams to 3e-15.
- The FWHM formulas match a half-maximum search to 3e-4 cm⁻¹ (transmission) and 7e-4 cm⁻¹ (reflection band) for *R* = 0.2–0.99.
- Limits: no transmission half-maximum at *R* = 17.0 %, one at 17.3 %; reflection band → 0.5006 FSR at *R* = 0.1 %;
  FWHM × finesse / FSR = 1.00004 at *R* = 97 %.
- Reference numbers: 200 fs ↔ 73.60 cm⁻¹, 70 fs ↔ 210.3 cm⁻¹; FSR 172 cm⁻¹ ↔ 29.070 µm air gap and 193.93 fs round trip;
  *R* = 76.1 % gives 15.05 cm⁻¹.
- Transmitted pulse energy: the Fourier-series result matches numerical integration to 8e-13 in 6 cases.
- Time domain: the energies of the transmitted and reflected pulse trains match the spectral energies to 4e-13 in 5 cases.
- Pulse-train heights: reflection at *R* = 4 % gives 0.04000 then 0.03686; transmission at *R* = 90 % falls by 0.81000 per round trip.
- Strongest output peak: 14.64 cm⁻¹ for the 200 fs example (100 % of the transmitted light); 15.47 cm⁻¹ and 37.7 % for the
  low-*R* reflection example.
- The two bands: reflection at offset 0 gives ∓17.28 cm⁻¹, 38.24 cm⁻¹ FWHM and 50.0 % each; transmission at offset 0.5
  (70 fs, FSR 400 cm⁻¹) gives ±199.25 cm⁻¹, 15.36 cm⁻¹ FWHM and 50.0 % each; a far transmission peak under a narrow pulse
  has no half-maximum of its own.
- The plotting grid contains the exact peak positions.
- Etalon for a given bandwidth: the reflectance fed back into the forward formula returns the wanted FWHM to 2e-13 in 6
  cases (15 cm⁻¹ at 172 cm⁻¹ → 76.164 %, at 400 cm⁻¹ → 88.899 %); FWHM ≥ FSR gives no solution; 172 cm⁻¹ = 5.1564 THz =
  29.070 µm of air; 15 cm⁻¹ = 0.3978 nm at 515 nm; 20 µm of *n* = 1.45 → 172.41 cm⁻¹.
- Tuning by tilt: the effective FSR and offset reproduce the directly computed phase 4π*nd* cos θ_in ν to 5e-13 for
  *n* = 1 and 1.45 and tilts up to 20°; one FSR at 7.63° (172 cm⁻¹), 11.56° (394 cm⁻¹) and 8.23° (200 cm⁻¹) at 515 nm in
  air; walk-off 8.82 µm per round trip for a 25 µm gap at 10°.
- Pulse given by duration and bandwidth: for four chirped pulses (C = 0.92 to 2.53) the energies of the pulse trains in
  time match the spectral energies to 6e-13.
- Decay time: 354 fs at 172 cm⁻¹ gives R = 76.04 % and 15.09 cm⁻¹; the ripple estimate matches the pulse train itself
  (±17.7 % against ±17.4 % at 1.5 Δν, ±1.6 % against ±1.5 % at 2 Δν).
