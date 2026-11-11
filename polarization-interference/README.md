# Birefringence, wave plates and interference

`index.html` is a single-page web app of interactive examples on birefringent crystals, quarter- and half-wave plates
and Young's two-slit interference. The general wave-plate equations are worked out step by step: one Jones matrix,
J(θ, Γ) = e^{iΓ/2}[cos(Γ/2) 1 − i sin(Γ/2) M(θ)], with M(θ) the mirror in the fast axis, gives the half-wave plate
(Γ = π, J = M) and the quarter-wave plate (Γ = π/2), what each does to linear, circular and elliptical light, the
Poincaré-sphere picture and the intensity between polarizers. Each part has presets, plots that move in time
(Play / Pause) and worked examples with their answers. Conventions: E = Re[(E_x, E_y) e^{i(kz − ωt)}], face-on pictures
look back at the source, angles run counterclockwise from x, and right-circular light turns clockwise (Hecht).

**Inputs:** sliders paired with number boxes, menus and example buttons. 1, crystals: crystal and wavelength. 2, double
refraction: crystal, optic axis in the page (at γ from the face normal) or perpendicular to it, angle of incidence,
thickness, wavelength. 3, inside a wave plate: plate (quarter-, half-, full-wave or any Γ) and the input angle from the
fast axis. 5, explorer: light in (linear at α, right- or left-circular, elliptical with azimuth ψ and ellipticity χ),
plate and its fast axis θ; the Poincaré sphere turns when dragged. 6, between polarizers: plate, polarizer angle,
analyzer (crossed, parallel or any angle), plate angle or a turning plate; the retardation for the interference colors.
7, real plates: zero-order, multi-order (order m) or achromatic quartz + MgF₂; quarter- or half-wave; material and
design wavelength, or the two wavelengths of the achromat. 8, two slits: wavelength, slit spacing d, slit width a,
screen distance L, number of slits (1–10) and a point on the screen; the wave picture shows the field or the
time-averaged intensity. 9, coherence: mean wave-train length and path difference; a source (He–Ne laser, green laser,
red LED, filtered white light, white light, any line), d and L. 10, polarization and interference: a half-wave plate,
quarter-wave plate or polarizer over one slit and its angle. Everything recalculates as you type or drag; values out of
range get a red outline and one sentence.

**Output:**

- Crystals: n_o(λ), n_e(λ) and Δn(λ) of calcite, quartz, MgF₂, sapphire, LiNbO₃, KDP, BBO and rutile, and a table of
  eleven crystals (the eight of Hecht's Table 8.1 plus MgF₂, sapphire and BBO) with Δn and the fast axis.
- Double refraction: a crystal slab with the incoming unpolarized beam splitting into an o-beam and an e-beam, moving
  wave crests perpendicular to k, the e-beam's walk-off, polarization marks, and the Huygens wavelets (circle and
  ellipse) at the entry point; a table of the index each wave sees, the angles of k and of the ray, the walk-off, the
  energy speed, where each beam leaves and the gap between them.
- Inside a wave plate: the fast and slow field components and the total field along the beam in 3D as the wave crosses
  the plate, and the polarization face-on at five depths.
- General equations: ten numbered steps from the retardance to the plate between polarizers, a cheat sheet (each
  input through a quarter- and a half-wave plate) and lab recipes (turning polarization, making circular light,
  finding the axes, attenuators, isolators, the magic angle).
- Explorer: the polarization in and out with the field turning in time and the plate's axes, the fast and slow
  components against time before and after the plate with the lag Γ marked, the Poincaré sphere with the path from in
  to out, the rule that applies, J(θ, Γ), and a table of Jones vectors, azimuth, ellipticity, axis ratio, sense and
  Stokes vector.
- Between polarizers: I/I₀ against plate angle for this analyzer and the other one, a face-on diagram with the light
  after the plate and the part the analyzer passes, the formula with the numbers; the interference colors of a plate
  at 45° between crossed and parallel polarizers for retardations up to 2000 nm, with the transmission spectrum.
- Real plates: retardance against wavelength (minus whole waves for multi-order plates) with a zero-order plate for
  comparison; thickness, the band within ±0.01 waves, and the retardance at 405, 532, 632.8, 800 and 1064 nm.
- Two slits: the waves behind the slits (field or intensity) with the bright directions, the pattern on the screen
  with the single-slit envelope and a picture of the screen, phasors and the field against time at a chosen point,
  and a table of fringe spacing, angles, envelope zeros and the path and phase difference at the point.
- Coherence: two wave trains with random phase jumps, one delayed by Δr, and the intensity of their sum with its
  running average against 2I₁[1 + e^{−Δr/ℓ} cos k₀Δr]; fringes from a real source with the visibility envelope and the
  colors of white-light fringes.
- Polarization and interference: fringes with an optic over one slit against no optic, and the visibility against
  its angle.
- 40 worked examples with their answers, the equations (23 numbered items) and notes with conventions and data
  sources. All the math is typeset with KaTeX: 41 displayed equations and about 480 inline formulas in the text,
  captions, tables, slider labels and worked answers, the live captions included.

## Model

Closed forms throughout; no fitting. Crystal indices are the published dispersion formulas (coefficients as in the
refractiveindex.info database): calcite and quartz, Ghosh 1999; MgF₂, Dodge 1984; sapphire, Malitson and Dodge 1972;
LiNbO₃ (congruent), Zelmon et al. 1997; KDP, Zernike 1964; BBO, Eimerl et al. 1987; rutile, DeVore 1951; ice, sodium
nitrate and tourmaline keep Hecht's 589.3 nm values. The e-wave index is 1/n² = cos²θ/n_o² + sin²θ/n_e²; refraction
keeps k_x and solves k⊥²/n_e² + k∥²/n_o² = k₀² for the e-wave, whose ray is the gradient of that surface. Wave plates
are Jones matrices R(θ) diag(1, e^{iΓ}) R(−θ) with Γ = 2π|Δn|d/λ₀; Stokes vectors, the Mueller matrix and the
Poincaré rotation follow from them. Colors use the CIE 1931 observer (the multi-lobe fit of Wyman, Sloan and Shirley
2013), an equal-energy white and sRGB, scaled so white stays white. Slits are Fraunhofer: I = I₁ sinc²β |Σ e^{ijδ}|².
Finite bandwidth sums 121 wavelengths of a line that is Gaussian in wavenumber (white light: 380–750 nm in 1 nm
steps). Wave trains have exponentially distributed lengths from a seeded generator.

Known limits: plane waves; uniaxial crystals only; no reflection losses at crystal faces; wave plates at normal
incidence and one temperature; the interference colors take Δn as constant; the slit wave picture is not to scale
and leaves out the 1/√r spreading so the far waves stay visible; the plate over a slit in part 10 is taken as
compensated for its common phase.

## Use

Open `index.html` in a browser. It needs no server, no build step and no network. To publish it, serve the repository
root from any static host, for example GitHub Pages with "Deploy from a branch" set to the repository root.

## Files

| path | what |
|---|---|
| `index.html` | the app: markup (math as LaTeX: display equations in `<div class="eq">`, inline math between `\(` and `\)`), the core (`<script id="core">`: complex arithmetic, crystal data and dispersion, e-wave index, walk-off and refraction, Wollaston prism, Jones matrices and vectors, Stokes, Mueller and Poincaré, the closed forms, real plates and achromats, CIE colors, slits, spectra, wave trains, polarization and interference, the answers to the worked examples), the UI and the equations as LaTeX source |
| `vendor/katex/` | KaTeX 0.16.47 (MIT license) and its woff2 fonts, which typeset the equations; the same copy as `advanced-optics/vendor/katex/`. Without it the page still works and shows the LaTeX source |
| `tests/validate.mjs` | checks the core inside `index.html` |

## Tests

```
node tests/validate.mjs     # under 1 s
```

- Crystal data: the formulas give Hecht's 589.3 nm table to the digits it lists (calcite within 0.0003, quartz 0.0001;
  rutile is 0.006 high), BBO 1.6551/1.5425, LiNbO₃ 2.2321/2.1560 and KDP 1.4938/1.4599 at 1064 nm, MgF₂ 1.3777/1.3895 and
  sapphire 1.7682/1.7600 at 589.3 nm; quartz, MgF₂, rutile and ice are positive, the rest negative.
- Against an independent Python calculation: Δn(quartz, 632.8 nm) = 0.0090449; zero-order quarter-wave plate 17.4905 µm
  (27.64 wavelengths), order 10 717.112 µm; the 800 nm plate at 400 nm 0.537568 waves; the 450/650 nm achromat 269.525 µm
  quartz + 220.545 µm MgF₂; ±0.01-wave bands 610.30–657.19 nm and 632.23–633.37 nm; calcite at 40° with the optic axis
  out of the page 22.8049° and 25.6229°; walk-off 6.2241° at 45° (at most 6.2612° at 41.870°) and 1.0906 mm through 10 mm;
  Wollaston 19.9974°.
- E-wave: the walk-off formula equals the gradient of the dispersion surface to 7 × 10⁻⁹°, and the ray speed lies on
  the wavelet ellipse; refraction conserves k_x and puts the e-wave on its surface to 1.4 × 10⁻¹⁴.
- Jones matrices of 300 random plates: unitary, det = e^{iΓ}, equal to the symmetric form; half-wave = M(θ); two
  half-wave plates turn by 2(θ₂ − θ₁); two quarter-wave plates make a half-wave plate; crossed ones cancel (8 × 10⁻¹⁶).
- (1, −i)/√2 turns clockwise looking back at the source (right, S₃ = +1); ψ, χ, b/a and the semi-axes round-trip.
- The closed forms tan 2(ψ − θ) = cos Γ tan 2(α − θ) and sin 2χ = −sin Γ sin 2(α − θ), the half-wave rules (2θ − α, −χ),
  the quarter-wave rules (axes along the plate, χ = −φ, circular → θ ± 45°) agree with the matrices to 10⁻¹³.
- The Stokes vector after a plate equals the Mueller matrix and the Poincaré rotation to 7 × 10⁻¹⁶; the formula for a
  plate between polarizers equals |P(β) J ê|² to 9 × 10⁻¹⁶, and crossed + parallel = 1.
- Real plates are exact at the design wavelength for quartz, MgF₂, sapphire and calcite, and the achromat at both of
  its wavelengths.
- Colors: the CIE fit is within 0.01 of the table; white stays (255, 255, 255), R = 0 between crossed polarizers is black,
  crossed + parallel add to white, and 550 nm retardation is magenta, rgb(110, 0, 184).
- Slits: the formula equals a direct sum over 400 points per slit with exact path lengths to 2 × 10⁻⁶ for 1, 2, 3 and 5
  slits; the array factor equals (sin(Nδ/2)/sin(δ/2))²; two slits average 2I₁.
- Coherence: a Gaussian line summed over 121 wavelengths equals 2I₁[1 + V cos k₀Δr] to 2 × 10⁻⁵, with V = ½ at 0.441ℓ_c;
  the seeded wave trains have a mean length of 10.01λ (ℓ = 10λ), match within Δr = 7.3λ 48.0 % of the time against
  e^{−0.73} = 48.2 %, and average 1.701I₁ against 1.702I₁.
- Polarization and interference: a half-wave plate at θ over one slit gives V = |cos 2θ|, a polarizer 2cos²θ/(1 + cos²θ),
  a quarter-wave plate at 45° V = 0.7071 and a shift of ⅛ fringe; crossed polarizations give no fringes.
- All 40 worked examples have an answer and an explanation with the values above.
- KaTeX in strict mode parses all 41 displayed equations, the 250 inline formulas in the page text and the 115 in the
  worked answers, and no formula is left as plain text with HTML sub- and superscripts. In the browser the live
  captions (every preset and menu option) render with no KaTeX errors or warnings.
