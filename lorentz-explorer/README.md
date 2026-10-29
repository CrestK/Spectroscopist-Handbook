# Lorentz oscillator: absorption and refractive index

`index.html` is a single-page web app that plots the absorption coefficient α(ω) and the refractive index n(ω) of a medium
made of up to three Lorentz oscillators. It solves the model exactly, ñ = √(n_bg² + χ̃), and can overlay the two standard
approximations: the dilute expansion (|χ̃| ≪ 1) and the near-resonance Lorentzian (γ ≪ ω₀).

**Inputs:** number density N (m⁻³), background index n_bg, and for each oscillator the centre wavelength λ₀ (nm),
linewidth Δν (FWHM, Hz), oscillator strength f, oscillating mass m (in mₑ) and charge q (in e). Sliders for N, Δν, λ₀ and m
are logarithmic; the number boxes take any value (e.g. `1e17`). Plot options: x axis as detuning around one line (Hz or
units of Δν) or wavelength (log), log α, n or n − n_bg in the lower pane, comparison curves, and manual y limits for
both panes. Presets: Na vapour at 589 nm, He⁺ 1s→2p at 30.4 nm, air at 1 atm (one effective UV oscillator), fused silica
and N-BK7 glass (from published Sellmeier coefficients). Everything recalculates live.

**Output:**

- Two-pane plot sharing x: α (top) and n (bottom). In detuning mode, dotted lines mark ν₀ ± Δν/2, red dots the extrema
  of n, and a dotted horizontal α_max/2. Drag to zoom x, double-click to reset, hover to read values.
- A table of single-line closed forms for each oscillator: ν₀, ω₀, wavenumber, γ, S = Nq²f/ε₀m, Sellmeier B, α_max,
  (n − n_bg)_max and the frequencies of the n extrema. Under it, the same quantities found numerically from the exact
  curve, and the largest |χ̃| (whether the dilute approximation holds).
- A fixed example spectrum of fused silica from 30 nm to 50 µm with the measured Sellmeier n for comparison.
- The equations at the bottom of the page.

## Model

χ̃ = Σⱼ (N qⱼ² fⱼ / ε₀ mⱼ) / (ωⱼ² − ω² − iγⱼω), ε̃ᵣ = n_bg² + χ̃, n = Re √ε̃ᵣ, α = (2ω/c) Im √ε̃ᵣ.
Near one line with γ ≪ ω₀: α_max = Nq²f/(ε₀ m c γ n_bg); n is largest at ω₀ − γ/2 and smallest at ω₀ + γ/2, where α = α_max/2;
(n − n_bg)_max = Nq²f/(4ε₀ m ω₀ γ n_bg) = α_max c/(4ω₀). With γ → 0 the model is the Sellmeier equation with
Bⱼ = N qⱼ² fⱼ/(ε₀ mⱼ ωⱼ²). Glass data: I. H. Malitson, J. Opt. Soc. Am. 55, 1205 (1965) (fused silica); Schott N-BK7 data sheet.

Known limit: Lorentzian tails fall off far more slowly than real absorption edges, so α inside a glass's transparent
window is much too large; n there is accurate.

## Use

Open `index.html` in a browser. It needs no server, no build step and no network. To publish it, serve the repository
root from any static host, for example GitHub Pages with "Deploy from a branch" set to the repository root.

## Files

| path | what |
|---|---|
| `index.html` | the app: markup, the core (`<script id="core">`: oscillator parameters, susceptibility, complex square root, exact/dilute/Lorentzian spectra, grids, extremum refinement, Sellmeier conversion), the UI and the equations |
| `tests/validate.mjs` | checks the core inside `index.html` |

## Tests

```
node tests/validate.mjs     # well under 1 s
```

- Single line (λ₀ = 589 nm, N = 10¹⁷ m⁻³, Δν = 100 MHz, f = 1): α_max = 1689.59 m⁻¹, (n − 1)_max = 3.95966×10⁻⁵, and (n − 1)_max = α_max c/4ω₀ to 1e-12.
- Exact curve: n extrema at −50.0005 and +50.0045 MHz; α there is 0.499975 of the peak; exact, dilute and Lorentzian agree to 8×10⁻⁵ of the peak.
- Sellmeier limit (γ → 0): fused silica n(589.3 nm) = 1.458402 vs Sellmeier 1.458403; N-BK7 n(587.56 nm) = 1.516801 vs 1.516800. With the page's linewidths, silica n stays within 1.7×10⁻⁵ of Sellmeier from 300 to 2000 nm.
- Air preset: n − 1 = 2.769×10⁻⁴ at 589 nm and 2.827×10⁻⁴ at 400 nm.
- Complex square root keeps a 10⁻⁹ imaginary part on a real part of 1 and picks the Im ≥ 0 branch.
- He⁺ vs Na scaling of α_max and (n − 1)_max matches the closed-form ratios to 1e-12; the wavelength grid is ascending and puts 345 points within 1 pm of a 100 MHz line.
