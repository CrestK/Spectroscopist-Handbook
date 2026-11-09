# Advanced optics: interactive examples

`index.html` is a single-page web app of worked, interactive examples for an advanced optics class (PHSX 855,
with Homework 4 and 5): waves and phasors, light in vacuum, the refractive index of real glasses, pulses
in glass, conductors, the Lorentz oscillator, reflection and refraction of s and p light, a tilted window, and
polarizers. Each part loads the homework numbers or a real material, has plots that move in time (Play / Pause), and
ends with questions that check a typed answer and explain it. Notation follows D. J. Griffiths,
*Introduction to Electrodynamics*, ch. 9: e^i(kz − ωt), k̃ = k + iκ, α = 2κ, and the α, β of the Fresnel equations.

**Inputs:** every part has sliders paired with number boxes (the boxes take values beyond the slider, e.g. `1e17`),
menus and example buttons. 1, waves: shape (harmonic, two waves, standing wave, Gaussian pulse, wave packet, two
pulses), direction, amplitude, period T (fs), index n, phases, observation point, pulse width. 2, light in vacuum:
polarization (linear at ψ, circular, elliptical with E₀ᵧ/E₀ₓ and δ); a source (field, intensity, CW or pulsed Gaussian
beam, lamp) with power, diameter, pulse energy and length, repetition rate, distance and wavelength. 3, index:
materials to show, wavelength, plot range; the material for the Cauchy fit; the prism glass, apex angle and angle of
incidence. 4, pulses: glass, center wavelength, pulse length, slab thickness (µm) and glass thickness (mm). 5,
conductors: material or σ and ε_r, frequency; a metal and wavelength for measured optical constants. 6, Lorentz
oscillator: λ₀, linewidth Δν, density N, oscillator strength f, plot range, drive detuning. 7, interface: media 1 and
2 (glasses, water, metals, custom n), wavelength, angle of incidence, incident amplitude. 8, tilted window: glass,
wavelength, angle, number of plates, input polarization. 9, polarizers: input light, up to three polarizers and their
axes, ideal or leaking polarizers, a turning middle polarizer. Everything recalculates as you type or drag.

**Output:**

- Waves: a snapshot D(z), a history graph D(t) at one point and the phasor in the complex plane, all moving; a table
  of T, f, ω, λ₀, v, λ and k.
- Light in vacuum: E and B along the beam in 3D and an end view of E; intensity, E₀, B₀, energy density, radiation
  pressure, photon energy and flux, and for pulses the peak power and fluence.
- Index: n(λ) of air, water, fused silica, CaF₂, N-BK7, N-F2, N-SF11, sapphire, diamond and silicon with a table of n,
  λ/n, c/n, n_g, GVD, n_d and Abbe number; a Cauchy fit with its error and the Sellmeier resonances; rays of eight
  colors through a prism with the deviation and spread.
- Pulses: a femtosecond pulse meeting a glass slab (field, envelope, reflections, delay against a pulse in vacuum),
  and a pulse spreading in thick glass with the wavelength across it (chirp); tables of n, n_g, velocities, R, delays,
  GDD and output length.
- Conductors: skin depth against frequency, E and B inside the conductor with their phase lag, a table of k, κ, d,
  φ, B₀/E₀, energy ratio and relaxation time; reflectance of silver, gold and copper and their skin depth from measured
  optical constants against the DC model.
- Lorentz oscillator: α and n − 1 against detuning (exact and near-resonance formulas), the anomalous
  region and the n extrema, a table of both; the driven electron against the field with its phase lag.
- Interface: ray diagrams and animated field maps for s and p side by side, R and T (or r and t, or the phase of r)
  against angle with Brewster's and the critical angle, tables of r, t, E₀R, E₀T, R, T, θ_T, α and β, and the three
  fields written out in the form HW 5-1 asks for.
- Tilted window: plates in the beam with s and p symbols sized by amplitude, T_s, T_p and the degree of polarization
  against angle, and a table.
- Polarizers: the chain seen face-on with the field after each polarizer, Malus's law step by step, and the output
  against the polarizer angle or, when the middle one turns, against time.
- 33 questions, the equations (34 numbered items) and notes with the data sources.

## Model

Closed forms throughout; no fitting. Glass and crystal indices are the published Sellmeier fits (coefficients as in
the refractiveindex.info database): Schott catalogue 2017 (N-BK7, N-F2, N-SF11), Malitson 1965 (fused silica) and 1963
(CaF₂), Malitson and Dodge 1972 (sapphire, o ray), Daimon and Masumura 2007 (water, 20 °C), Peter 1923 (diamond),
Salzberg and Villa 1957 (silicon, 1.36–11 µm), Ciddor 1996 (air); metals from Johnson and Christy 1972. n_g and GVD use
analytic derivatives of the Sellmeier sum. A Gaussian pulse after a group-delay dispersion φ₂ is the exact
second-order solution; the slab keeps the front reflection, the transmitted pulse, one internal reflection and its
exit. Conductors use k̃² = μεω² + iμσω written without cancellation. The Lorentz line is the exact single oscillator
ñ = √(1 + χ̃) next to the near-resonance formulas. The Fresnel equations are Griffiths' (complex n₂ and cos θ_T cover
metals and total internal reflection), with T = Re(ñ₂ cos θ_T)/(n₁ cos θ_I) |t|² (ñ₂* for p). Plates add reflections in
intensity. Polarizers are Jones matrices J = p̂p̂ᵀ + √ε b̂b̂ᵀ, and unpolarized light is averaged over two orthogonal inputs.

Known limits: plane waves and sharp interfaces; no thin-film interference; one oscillator without Doppler broadening;
the DC conductivity model is not valid for metals above about 10¹³ Hz (the page says so and shows measured data
instead); each Sellmeier curve is only drawn inside its measured range.

## Use

Open `index.html` in a browser. It needs no server, no build step and no network. To publish it, serve the repository
root from any static host, for example GitHub Pages with "Deploy from a branch" set to the repository root.

## Files

| path | what |
|---|---|
| `index.html` | the app: markup, the core (`<script id="core">`: complex arithmetic, waves, intensities, Sellmeier data and derivatives, Cauchy fit, prism, metal data, pulse propagation, conductors, Lorentz oscillator, Fresnel equations and interface fields, plates, Jones polarizers, the answers to the questions), the UI and the equations |
| `tests/validate.mjs` | checks the core inside `index.html` |

## Tests

```
node tests/validate.mjs     # well under 1 s
```

- Homework 4-2: α_max = 1689.59 m⁻¹ and (n − 1)_max = 3.95966 × 10⁻⁵; the exact model puts the n extrema at
  −0.49998γ and +0.50002γ, where α is 0.500001 of its peak (HW 4-1), and the anomalous region is 100 MHz wide. The
  near-resonance formulas agree with the exact curve to 8 × 10⁻⁵ of the peak, and ñ² = 1 + χ̃.
- Homework 5-1: θ_T = 26.7685°, α = 1.26266, E₀R = −2.7125 V/m, E₀T = 17.6513 V/m, R = 0.011772, T = 0.988228,
  k_Tz = 1.46791 × 10⁷ rad/m and ω = 3.13942 × 10¹⁵ rad/s, as computed independently in Python.
- Homework 5-2 and 5-3: 1, 0.5, 0 and 0.1875 W/m² from 2 W/m²; the turning polarizer gives four maxima per turn and the
  Jones chain matches (I₁/8)(1 − cos 4ωt) to 3 × 10⁻¹⁶; Malus's law to 4 × 10⁻¹⁶; crossed polarizers leaking 10⁻⁵ pass
  2 × 10⁻⁵ W/m².
- Fresnel: R + T = 1 to 9 × 10⁻¹⁶ over all angles for glass, total internal reflection and silver; r_p = 0 at
  Brewster's angle with θ_B + θ_T = 90°; R = 1 beyond the critical angle; r_p = −r_s² at 45°; Hecht's forms give the
  same r_s and the opposite r_p. The field maps obey Maxwell's boundary conditions at the surface (tangential E,
  normal εE, tangential H) and ∇·E = 0 to 2 × 10⁻⁶ for glass, total internal reflection, gold and water to glass.
- Glasses: n_d and V_d match the Schott catalogue and Malitson (N-BK7 1.51680/64.17, N-F2 1.62005/36.43, N-SF11
  1.78472/25.68, fused silica 1.45846/67.82, CaF₂ 1.43385/95.00) to 1.5 × 10⁻⁵ and 0.02; sapphire, water, diamond,
  silicon, air and infrared values match a Python evaluation to 10⁻⁵. Analytic dn/dλ and d²n/dλ² match
  Richardson-extrapolated differences to 1.4 × 10⁻⁷; GVD at 800 nm is 44.65 fs²/mm (N-BK7) and 36.16 fs²/mm (fused
  silica), n_g(N-BK7) = 1.52665.
- Cauchy fit to N-BK7 over 400–700 nm: rms 3.6 × 10⁻⁵, effective resonance at 91 nm (between the Sellmeier terms at
  77 and 142 nm), off by 1.1 × 10⁻² at 2 µm. Prism: δ_min = 38.6467° for N-BK7 at 60°, symmetric, and no smaller
  deviation at any other angle.
- Pulses: the envelope has a 20 fs FWHM; after 446.5 fs² the measured width equals the formula (65.05 fs, the 20 fs
  pulse after 10 mm of N-BK7), the energy is unchanged to 10⁻⁶ and the chirp equals −d(phase)/dt to 10⁻⁵. The slab field
  is continuous at both faces, the exit peak arrives at L + c(t − n_g L/c) to 0.1 nm, and R = 4.139 %.
- Conductors: k̃² = μεω² + iμσω to 2 × 10⁻¹⁶ of |k̃|²; copper at 60 Hz d = 8.4163 mm with φ = 45°; seawater 2.2972 m at
  10 kHz and 11.042 mm with φ = 23.40° at 1 GHz; τ(copper) = 1.486 × 10⁻¹⁹ s. Silver at 495.9 nm: ñ = 0.05 + 3.093i,
  d = 25.5 nm, R = 98.1 %, against 2.6 nm from the DC model.
- Waves and sources: λ = cT/n, the harmonic wave and the Gaussian pulse satisfy the wave equation to 1.4 × 10⁻⁷, the
  phasor turns clockwise along +z; sunlight 1361 W/m² gives E₀ = 1012.65 V/m and 25 V/m gives 0.82951 W/m²; the Gaussian
  beam and pulse peak factors integrate back to P and E; circular polarization keeps |E| constant.
- Plates: the closed form (1 − R)/(1 + (2N − 1)R) equals a surface-by-surface recursion to 6 × 10⁻¹⁶; N-BK7 at Brewster's
  angle (633 nm): R_s = 15.454 %, T_s = 0.7323 for one plate, 0.2148 for ten, nine plates to get below 25 %. The driven
  electron lags by 0°, 45°, 90° and 180°.
- All 33 questions on the page have an answer and an explanation, and the homework ones carry the homework values.
