# Spectral narrowing by SHG in BBO

`index.html` is a single-page web app that gives the second-harmonic (SH) spectral width, in cm⁻¹, nm and GHz, after
type-I second-harmonic generation in a long β-BaB₂O₄ (BBO) crystal: the spectral-compression step that makes narrowband
Raman pump pulses for femtosecond stimulated Raman spectroscopy (FSRS). The SH is slower than the fundamental (FF), so only
a narrow band of SH frequencies builds up over the crystal. The page computes the SH spectrum and pulse from an undepleted
coupled-wave model with the exact BBO dispersion (Weiner 1983; Marangoni et al. 2007; Pontecorvo et al. 2013), compares
the width with an etalon (Lorenzo et al. 2024), and flags pump depletion and spatial walk-off. A second source, "no BBO",
sends a Gaussian pulse of any bandwidth straight onto the etalon to show what the etalon alone does to the spectrum and
the pulse, against the input bandwidth.

**Inputs:** the source (SH from a BBO crystal, or a pulse straight onto the etalon); the FF wavelength (400–2000 nm), or the SH wavelength (200–1000 nm) with a switch; the crystal length *L*
(0.001–100 mm, log slider 0.1–30 mm) with buttons for the 2, 7 and 25 mm crystals of Lorenzo et al. 2024 (cut at 23.4°,
22.8° and 21.1°); the cut angle (only used for the external tilt); the Sellmeier equations (Kato 1986, the default; Eimerl
et al. 1987; Tamošauskas et al. 2018); the FF pulse as a transform-limited FWHM τ (5–20000 fs) or as a bandwidth FWHM in
cm⁻¹ or nm; the chirp before the crystal, GDD (fs², positive for normal glass); the etalon FSR and line width (cm⁻¹,
default 172 and 15); and for the depletion check the pulse energy (µJ), the beam FWHM at the crystal (mm) and
*d*<sub>eff</sub> (pm/V, default 2.0). Examples: the OPA after a CARBIDE (1110 nm, 200 fs) and after a Legend Elite
(800 nm, 35 fs). Without a BBO: the pulse wavelength (200–2000 nm), its transform-limited FWHM or bandwidth (with a log
slider over 0.74–2900 cm⁻¹), its GDD and the etalon; examples at 555 nm with 200 fs, 50 cm⁻¹ and 16 cm⁻¹. Everything
recalculates as you type; the curves against length, wavelength and bandwidth fill in in the background.

**Output:**

- SH spectrum against the detuning from the SH centre (cm⁻¹), with the SH wavelength on the top axis: the full model, the
  thin-crystal spectrum (√2 × the FF), the GVM-only sinc² × FF spectrum, the etalon transmission and the SH after one
  etalon order. Drag to zoom, double-click to reset, hover to read values in cm⁻¹ and nm.
- SH pulse against time: the full model (a Fourier transform of the SH field), the GVM-only pulse, the FF at the
  crystal exit and the SH after the etalon (all orders), in a frame moving at the mean group velocity. Undepleted, so it
  does not show the steep rise and exponential tail that depletion gives.
- A bandwidth table in cm⁻¹, nm and GHz: FF, thin crystal, the simple formula 0.886/GDM, GVM only, the full model and after
  the etalon. A table of θ<sub>pm</sub>, the external tilt for the cut angle, the group indices, GVM, GDM, the SH pulse
  FWHM, the compression (thin ÷ full), SH width ÷ etalon FSR and ÷ line width, the SH energy through one etalon order and
  through the others, the walk-off angle and distance, and the wavelength where GVM = 0.
- A depletion check: peak intensity, the undepleted efficiency per intensity, η<sub>peak</sub> and η<sub>beam</sub>, and a
  one-line flag in four levels; a walk-off flag against the beam radius.
- SH FWHM against crystal length (0.1–30 mm, log–log): full model, simple formula, thin-crystal limit, the etalon FSR and
  line width, the 2, 7 and 25 mm crystals marked.
- GVM against FF wavelength (600–1600 nm) for all three Sellmeier sets, with the two values quoted in Pontecorvo et al.
  2013, and the SH FWHM against FF wavelength for the current length.
- Downloads (CSV with `#` header lines): the SH spectrum, the SH pulse and the FWHM against length.
- Without a BBO: the input spectrum, the etalon transmission and what passes (all orders); the input pulse and the output
  (copies 1/FSR apart, each R² weaker, merging into an exponential tail); a table of the widths in cm⁻¹, nm and GHz, the
  pulse FWHM after one order, the energy through one order and through the others, the finesse, R, the round trip and
  the decay time; and, against the input bandwidth (log, from a tenth of the line width to 20 FSR), the FWHM after the
  etalon, the pulse FWHM after one order and the energy through one order and the others. CSV downloads of all three.
- The equations at the bottom of the page, with what is not modelled and the references.

## Model

Type-I (ooe): the FF is an ordinary wave at λ, the SH an extraordinary wave at λ/2 at the phase-matching angle
θ<sub>pm</sub> of the centre wavelength. With a Gaussian FF spectrum *A*(Ω₁) = exp(−Ω₁²/4σ² + i·GDD·Ω₁²/2),

*E*<sub>SH</sub>(Ω) ∝ ∫ *A*(Ω₁) *A*(Ω − Ω₁) *L* sinc(Δ*kL*/2) e<sup>−iΔ*kL*/2</sup> dΩ₁,
Δ*k* = *k*<sub>e</sub>(2ω₀ + Ω; θ<sub>pm</sub>) − *k*<sub>o</sub>(ω₀ + Ω₁) − *k*<sub>o</sub>(ω₀ + Ω − Ω₁),

with *k* = *n*(ω)ω/*c* from the Sellmeier equations, no Taylor expansion. This holds GVM, the FF dispersion (the FF
acceptance), the chirp and the finite FF bandwidth; *L* → 0 gives √2 × the FF width and a long crystal the sinc² of the
simple formula Δν = 0.886/GDM. Made absolute with Boyd's coupling κ = 2ω*d*<sub>eff</sub>/(*nc*) it gives the
undepleted efficiency, which sets the depletion flag; the flag levels come from split-step simulations with depletion
(plane wave and Gaussian beam, 1110 nm, 200 fs, 2–25 mm).

Sellmeier sets: Kato (1986), fitted 0.205–1.064 µm; Eimerl et al. (1987), 0.22–1.06 µm; Tamošauskas et al. (2018),
0.188–5.2 µm. The Eimerl and Tamošauskas coefficients are those of the refractiveindex.info database. Above 1.064 µm
Kato and Eimerl are extrapolated: Kato's GVM stays within about 3 % of Tamošauskas up to 1.3 µm, Eimerl's falls 9 %
low at 1110 nm and 22 % low at 1300 nm.

The etalon is an ideal lossless Airy etalon with one order on the SH peak (or the input pulse):
*t*(ν̃) = (1 − *R*)/(1 − *R* e<sup>2πiν̃/FSR</sup>), with *R* from the FSR and line width. The field is multiplied by *t* and
Fourier transformed for the pulse after it; the energy through all orders for a Gaussian is the closed form
(1 − *R*)/(1 + *R*)[1 + 2Σ*R*<sup>*m*</sup> exp(−2π²*m*²σ²/FSR²)].

Not modelled: pump depletion and back-conversion (flagged only), focusing and angular acceptance, walk-off inside the
model (flagged only), cascaded χ<sup>(2)</sup>, absorption and temperature.

## Use

Open `index.html` in a browser. It needs no server, no build step and no network. It is served as part of the handbook,
at `shg-narrowing/index.html` from the repository root.

## Files

| path | what |
|---|---|
| `index.html` | the app: markup, the core (`<script id="core">`: Sellmeier sets, phase matching, group indices, walk-off, the full undepleted model with its adaptive grids, the SH pulse by Fourier sum, the GVM-only pulse, the etalon (Airy field transmission, the pulse straight onto it, FFT), peak intensity, efficiency, flags, the analysis the page shows and the CSV writers), the UI and the equations |
| `tests/validate.mjs` | checks the core inside `index.html` |

## Tests

```
node tests/validate.mjs     # about 1 s
```

- Sellmeier indices equal the refractiveindex.info database formulas (Eimerl, Tamošauskas) and the data-sheet equations
  (Kato) to 2e-16 from 0.2 to 2.6 µm; the analytic group index equals a central difference to 2.5e-9.
- θ<sub>pm</sub> and GVM (Kato) at 660, 800, 1030, 1110 and 1300 nm: 36.01°, 29.18°, 23.32°, 22.15°, 20.46° and 320.3,
  193.8, 94.8, 73.6, 35.5 fs/mm, as in a NumPy reference; 1064 nm gives 22.78° and 800 nm 29.18° (textbook 22.8° and
  29.2°). n<sub>e</sub>(θ<sub>pm</sub>, λ/2) = n<sub>o</sub>(λ) to 4e-16; no phase matching below 409.5 nm (Eimerl 409.0,
  Tamošauskas 409.9).
- The three sets: Eimerl 315.5, 188.7, 88.8, 67.1, 27.6 and Tamošauskas 315.3, 192.6, 94.8, 73.4, 34.5 fs/mm at the same
  wavelengths; Kato and Tamošauskas within 3.1 %; GVM = 0 at 1541, 1471 and 1518 nm, and between −4.4 and 5.5 fs/mm at
  1500 nm (not the 90 fs/mm quoted by Pontecorvo et al. 2013).
- Walk-off 67.8, 56.8, 54.3 mrad at 800, 1030, 1110 nm and 55.6 mrad at 1064 nm (vendor figure about 56 mrad).
- sinc²(1.39156) = ½ to 1e-14; 0.886/GDM at 25 mm = 3.69, 6.10, 12.46, 16.05, 33.28 cm⁻¹. Unit conversions round-trip
  (1 nm at 555 nm = 32.465 cm⁻¹ = 973.3 GHz; 200 fs = 73.60 cm⁻¹ = 9.068 nm at 1110 nm).
- Full model, 1110 nm, 200 fs: 104.08 cm⁻¹ at 0.05 mm = √2 × the FF to 2e-5; 92.95, 50.55 and 15.88 cm⁻¹ at 2, 7 and
  25 mm, within 0.01 % of the NumPy reference and 0.5 % of the low-intensity split-step widths (92.95, 50.59, 15.96);
  at 25 mm equal to the GVM-only sinc² × FF spectrum (15.880) and 1 % below 0.886/GDM (16.05).
- Full model, 800 nm, 35 fs: 584.5 cm⁻¹ at 0.05 mm (below √2 × 420.6 = 594.8, the FF acceptance of 50 µm) and
  6.168 cm⁻¹ at 25 mm, above 0.886/GDM = 6.10 because the FF dispersion adds to the GVM. A coarser grid gave 6.37.
- Doubling both integration grids changes the FWHM by at most 0.005 % (five cases, chirped and near GVM = 0). The FWHM
  falls monotonically from 0.1 to 30 mm (34 lengths, three cases).
- Chirp: ±5000 fs² leaves the 0.05 mm width unchanged (to 1e-9); −1000 fs² broadens 800 nm, 35 fs, 25 mm from 6.17 to
  6.51 cm⁻¹; ±20000 fs² changes 1110 nm, 200 fs, 25 mm by less than 0.003 %.
- Undepleted efficiency per intensity at 2, 7, 25 mm (*d*<sub>eff</sub> = 2 pm/V): 5.383e-10, 3.518e-9, 1.462e-8 per
  W/cm², within 1 % of the split-step low-intensity limit and 0.07 % of the GVM-only time-domain (erf) formula; the thin
  crystal equals κ²A₀²L²/√2 to 1e-4; scales as *d*<sub>eff</sub>².
- 2 µJ, 200 fs, 2 mm gives 2.0727e8 W/cm²; an iris of diameter *d* passes ½. The undepleted η<sub>peak</sub> of all nine
  split-step rows is reproduced (0.29 … 43.9); flag levels switch at 0.1, 1 and 10, the walk-off flag at *w*/2 and *w*.
- SH pulse: τ/√2 = 141.4 fs for a thin crystal (and τ<sub>chirped</sub>/√2 with 20000 fs²); at 7 and 25 mm equal to the
  GVM-only pulse to 0.3 % (423 and 1745 fs; GDM 1841 fs at 25 mm); the GVM-only pulse equals its erf closed form to 5e-5;
  Parseval holds to 3e-5; the 35 fs ripples are converged (grids × 2, time steps ÷ 4: 7e-4 of the peak).
- Etalon: *T* = 1 on the orders and ½ at ± half the line width; a flat spectrum passes 1/√(1 + *F*) = 0.1353; a 10 cm⁻¹
  Gaussian passes 0.8144, as direct quadrature.
- The default case (1110 nm, 25 mm, 200 fs, 2 µJ, 2 mm): 15.88 cm⁻¹, θ<sub>pm</sub> 22.15°, tilt 1.73° from a 21.1° cut,
  η<sub>beam</sub> 1.52 (strong depletion), walk-off 1.36 mm against *w* = 1.70 mm; the three CSV files parse; 405 nm reports
  no phase matching.
- Etalon field: |*t*|² = *T* to 9e-16, *t* = 1 on an order, *R* = 0.7616 for FSR 172 and line width 15 cm⁻¹, decay time
  356.1 fs (1/(2π·δν) = 353.9 fs). The closed form for the energy through all orders equals quadrature over ±40 FSR to
  3e-14 (σ = 5–300 cm⁻¹); the FFT equals a direct DFT to 1e-12.
- No BBO: a 1 cm⁻¹ input passes 99.680 % (as quadrature) and keeps its width and length; a 300 cm⁻¹ input (FSR 1000) comes
  out 14.98 cm⁻¹ wide with a tail decaying in 0.3540 ps, and the FFT output equals the sum of copies
  (1 − *R*)Σ*R*<sup>*m*</sup>*A*(*t* − *m*/FSR) to 7e-13 of the input peak; a 2900 cm⁻¹ input gives one order a 249.0 fs
  pulse (τ ln 2 = 246.9 fs); a 20 fs input gives copies 193.9 fs apart with intensity ratio *R*² = 0.580; GDD changes the
  pulse but not the spectrum. 555 nm, 200 fs: 14.59 cm⁻¹ and 426 fs after the etalon, 25.5 % through one order.
- SH after the etalon (BBO): the energy in time equals the spectral fraction (0.6747 at 25 mm, 0.2110 at 2 mm).
