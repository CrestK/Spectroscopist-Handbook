/* Pump–Probe Focal Overlap: page controller. Physics lives in overlap.js. */
(function () {
  'use strict';

  const F = window.FocalOverlap;
  const C = F.C;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ------------------------------------------------------------------ state

  const DEFAULTS = {
    mode: '2pa',
    pump: { lambda: 800, w0: 60, fwhm: 60, I0: 100 },
    probe: { lambda: 530, w0: 25, fwhm: 50, I0: 2 },
    angle: 8,
    L: 1000,
    decay: false,
    T1ps: 5,
    dx: 18,
    dy: 0,
    dz: 0,
    delay: 0,
  };

  const PRESETS = [
    { label: '2PA · 800 nm pump, 530 nm probe', set: clone(DEFAULTS) },
    {
      label: 'TA · 400 nm pump, 650 nm probe',
      set: {
        mode: 'ta', pump: { lambda: 400, w0: 90, fwhm: 80, I0: 30 }, probe: { lambda: 650, w0: 35, fwhm: 60, I0: 1 },
        angle: 6, L: 2000, decay: true, T1ps: 3, dx: 0, dy: 0, dz: 0, delay: 400,
      },
    },
    {
      label: '2P-excited TA',
      set: {
        mode: 'ta2', pump: { lambda: 800, w0: 50, fwhm: 80, I0: 300 }, probe: { lambda: 550, w0: 30, fwhm: 60, I0: 2 },
        angle: 10, L: 1000, decay: false, T1ps: 5, dx: 0, dy: 0, dz: 0, delay: 500,
      },
    },
    {
      label: 'Tight focus, 30° crossing',
      set: {
        mode: '2pa', pump: { lambda: 1300, w0: 12, fwhm: 40, I0: 400 }, probe: { lambda: 600, w0: 10, fwhm: 35, I0: 5 },
        angle: 30, L: 500, dx: 0, dy: 0, dz: 0, delay: 0,
      },
    },
    {
      label: 'Matched beams, collinear',
      set: {
        mode: '2pa', pump: { lambda: 800, w0: 40, fwhm: 50, I0: 100 }, probe: { lambda: 800, w0: 40, fwhm: 50, I0: 100 },
        angle: 0, L: 1000, dx: 0, dy: 0, dz: 0, delay: 0,
      },
    },
  ];

  const MODE_TEXT = {
    '2pa': 'Nondegenerate two-photon absorption. One pump photon and one probe photon are absorbed together, so there is signal only while the pulses overlap. The signal goes as ∫ I_pump · I_probe.',
    ta: 'Transient absorption. The pump makes an excited population by one-photon absorption, and the probe reads it out after the pump has passed. The signal goes as ∫ N · I_probe, with N set by the pump fluence.',
    ta2: 'Transient absorption after two-photon excitation. The population scales with I_pump², so the effective pump spot is √2 narrower and overlap is more sensitive to position.',
  };

  const state = clone(DEFAULTS);
  const ui = { top: 'signal', t: 0, playing: false, sliceZ: 0, map: 'xy', cut: 'x', drag: null };

  // ------------------------------------------------------------- formatting

  const minus = (s) => s.replace(/^-/, '−');
  function sig(v, n) {
    n = n || 3;
    if (!isFinite(v)) return '–';
    if (v === 0) return '0';
    const d = clamp(n - 1 - Math.floor(Math.log10(Math.abs(v))), 0, 6);
    return minus(v.toFixed(d));
  }
  const fmtLen = (um) => (Math.abs(um) >= 1000 ? sig(um / 1000) + ' mm' : sig(um) + ' µm');
  function fmtTime(fs) {
    const a = Math.abs(fs);
    if (a < 0.05) return '0 fs';
    if (a >= 1e6) return sig(fs / 1e6) + ' ns';
    if (a >= 1000) return sig(fs / 1000) + ' ps';
    return sig(fs) + ' fs';
  }
  function fmtPct(x) {
    const v = x * 100;
    if (v > 0 && v < 0.1) return '<0.1%';
    return (v >= 99.95 ? '100.0' : v.toFixed(1)) + '%';
  }
  function fmtIntensity(gw) {
    if (gw >= 1000) return sig(gw / 1000) + ' TW/cm²';
    if (gw < 1) return sig(gw * 1000) + ' MW/cm²';
    return sig(gw) + ' GW/cm²';
  }
  function fmtEnergy(j) {
    if (j >= 1e-3) return sig(j * 1e3) + ' mJ';
    if (j >= 1e-6) return sig(j * 1e6) + ' µJ';
    if (j >= 1e-9) return sig(j * 1e9) + ' nJ';
    return sig(j * 1e12) + ' pJ';
  }
  function fmtFluence(jcm2) {
    if (jcm2 >= 1) return sig(jcm2) + ' J/cm²';
    if (jcm2 >= 1e-3) return sig(jcm2 * 1e3) + ' mJ/cm²';
    return sig(jcm2 * 1e6) + ' µJ/cm²';
  }
  const fmtSigned = (v, f) => (f(v).startsWith('0 ') || f(v).startsWith('−') ? '' : '+') + f(v);
  function fmtInput(v) {
    if (!isFinite(v)) return '';
    const r = Number(Math.abs(v) < 1e-9 ? 0 : v.toPrecision(4));
    return String(r);
  }
  const fmtTick = (v) => minus(String(Number(v.toPrecision(6))));

  function niceCeil(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function ticks(a, b, count) {
    const raw = (b - a) / Math.max(1, count);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    const st = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
    const out = [];
    for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
    return out;
  }
  // Length axes switch to mm once they span more than 2 mm.
  const lenUnit = (span) => (span >= 2000 ? { div: 1000, unit: 'mm' } : { div: 1, unit: 'µm' });
  const timeUnit = (span) => (span >= 4000 ? { div: 1000, unit: 'ps' } : { div: 1, unit: 'fs' });

  // ------------------------------------------------------------ beam colours

  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function waveRGB(nm) {
    let c;
    if (nm < 380) c = [0.56, 0.36, 1];
    else if (nm > 780) c = mix([0.93, 0.06, 0.12], [0.86, 0.14, 0.58], clamp((nm - 780) / 420, 0, 1));
    else if (nm < 440) c = [(440 - nm) / 60, 0, 1];
    else if (nm < 490) c = [0, (nm - 440) / 50, 1];
    else if (nm < 510) c = [0, 1, (510 - nm) / 20];
    else if (nm < 580) c = [(nm - 510) / 70, 1, 0];
    else if (nm < 645) c = [1, (645 - nm) / 65, 0];
    else if (nm <= 700) c = [1, 0, 0];
    else c = mix([1, 0, 0], [0.93, 0.06, 0.12], (nm - 700) / 80);
    // Lift very dark hues (deep blue/violet) so they read on the black scene.
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const k = Math.max(0, 0.26 - lum) * 0.8;
    return c.map((v) => Math.min(1, v + k));
  }
  function waveName(nm) {
    if (nm < 380) return 'UV · false color';
    if (nm > 780) return 'NIR · false color';
    if (nm < 450) return 'violet';
    if (nm < 490) return 'blue';
    if (nm < 510) return 'cyan';
    if (nm < 565) return 'green';
    if (nm < 590) return 'yellow';
    if (nm < 625) return 'orange';
    return 'red';
  }
  const cssRGB = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a == null ? 1 : a})`;

  // ------------------------------------------------------------------ theme

  const theme = {};
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    theme.ink = v('--ink');
    theme.ink2 = v('--ink-2');
    theme.muted = v('--muted');
    theme.grid = v('--grid');
    theme.axis = v('--axis');
    theme.panel = v('--panel');
    theme.series = v('--series');
    theme.mapLine = v('--map-line');
    theme.sceneInk = v('--scene-ink');
    theme.sceneDim = v('--scene-dim');
    theme.sceneRule = v('--scene-rule');
    theme.scene = v('--scene');
    theme.seq = v('--seq').split(',').map((s) => s.trim()).filter(Boolean);
    theme.lut = buildLUT(theme.seq);
    $('#map-ramp').style.background = `linear-gradient(90deg, ${theme.seq.join(', ')})`;
  }
  function hexRGB(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return [128, 128, 128];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function buildLUT(stops) {
    const cols = stops.map(hexRGB);
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = (i / 255) * (cols.length - 1);
      const k = Math.min(cols.length - 2, Math.floor(t));
      const c = mix(cols[k], cols[k + 1], t - k);
      lut[i * 3] = c[0];
      lut[i * 3 + 1] = c[1];
      lut[i * 3 + 2] = c[2];
    }
    return lut;
  }

  // --------------------------------------------------------------- controls

  const CTL = {
    'pump.lambda': { label: 'Wavelength λ', unit: 'nm', min: 250, max: 2000, step: 1, hint: 'sets the beam color and z_R' },
    'pump.w0': { label: 'Waist w₀', unit: 'µm', min: 2, max: 1000, log: true, hint: '1/e² radius at focus' },
    'pump.fwhm': { label: 'Pulse duration', unit: 'fs', min: 5, max: 2000, log: true, hint: 'intensity FWHM' },
    'pump.I0': { label: 'Peak intensity I₀', unit: 'GW/cm²', min: 0.01, max: 10000, log: true, hint: 'on axis at focus' },
    'probe.lambda': { label: 'Wavelength λ', unit: 'nm', min: 250, max: 2000, step: 1, hint: 'sets the beam color and z_R' },
    'probe.w0': { label: 'Waist w₀', unit: 'µm', min: 2, max: 1000, log: true, hint: '1/e² radius at focus' },
    'probe.fwhm': { label: 'Pulse duration', unit: 'fs', min: 5, max: 2000, log: true, hint: 'intensity FWHM' },
    'probe.I0': { label: 'Peak intensity I₀', unit: 'GW/cm²', min: 0.01, max: 10000, log: true, hint: 'on axis at focus' },
    angle: { label: 'Crossing angle θ', unit: '°', min: 0, max: 60, step: 0.1, hint: 'between the beam axes' },
    L: { label: 'Sample path length L', unit: 'µm', min: 5, max: 20000, log: true, hint: 'along the probe' },
    dx: { label: 'Δx', unit: 'µm', dynamic: true, hint: 'transverse, in the crossing plane' },
    dy: { label: 'Δy', unit: 'µm', dynamic: true, hint: 'transverse, out of the plane' },
    dz: { label: 'Δz', unit: 'µm', dynamic: true, hint: 'along the probe' },
    delay: { label: 'Pump–probe delay', unit: 'fs', dynamic: true, hint: '> 0: probe after pump' },
    T1ps: { label: 'Lifetime T₁', unit: 'ps', min: 0.02, max: 5000, log: true, hint: 'single-exponential decay' },
  };
  const controls = {};

  function getPath(key) {
    const [a, b] = key.split('.');
    return b ? state[a][b] : state[a];
  }
  function setPath(key, v) {
    const [a, b] = key.split('.');
    if (b) state[a][b] = v;
    else state[a] = v;
  }
  function toSlider(c, v) {
    if (c.spec.log) return (1000 * Math.log(v / c.min)) / Math.log(c.max / c.min);
    return (1000 * (v - c.min)) / (c.max - c.min);
  }
  function fromSlider(c, s) {
    let v = c.spec.log ? c.min * Math.pow(c.max / c.min, s / 1000) : c.min + ((c.max - c.min) * s) / 1000;
    if (c.spec.step) v = Math.round(v / c.spec.step) * c.spec.step;
    else v = Number(v.toPrecision(c.spec.dynamic ? 4 : 3));
    return v;
  }

  function buildControls() {
    document.querySelectorAll('[data-ctl]').forEach((host) => {
      const key = host.dataset.ctl;
      const spec = CTL[key];
      const id = 'c-' + key.replace('.', '-');
      host.className = 'ctl';
      host.innerHTML =
        `<div class="ctl-top"><label for="${id}">${spec.label}</label><span class="ctl-hint">${spec.hint}</span></div>` +
        `<div class="ctl-row"><input type="range" id="${id}-r" min="0" max="1000" step="1" aria-label="${spec.label}">` +
        `<div class="num"><input type="number" id="${id}" step="any" inputmode="decimal"><span class="unit">${spec.unit}</span></div></div>`;
      const c = {
        key, spec, host,
        range: host.querySelector('input[type=range]'),
        num: host.querySelector('input[type=number]'),
        min: spec.min, max: spec.max,
      };
      c.range.addEventListener('input', () => setValue(key, fromSlider(c, +c.range.value)));
      c.num.addEventListener('change', () => {
        const v = parseFloat(c.num.value);
        if (isFinite(v)) setValue(key, v, true);
        else syncControl(c);
      });
      controls[key] = c;
    });
  }

  function setValue(key, v, typed) {
    const c = controls[key];
    if (c.spec.dynamic) v = clamp(v, -1e5, 1e5);
    else v = clamp(v, c.spec.min, c.spec.max);
    setPath(key, v);
    if (typed) syncControl(c, true);
    changed();
  }

  function syncControl(c, force) {
    const v = getPath(c.key);
    c.range.value = String(clamp(toSlider(c, v), 0, 1000));
    if (force || document.activeElement !== c.num) c.num.value = fmtInput(v);
  }

  function syncAll() {
    Object.values(controls).forEach((c) => syncControl(c));
    document.querySelectorAll('#mode button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === state.mode)));
    $('#mode-desc').textContent = MODE_TEXT[state.mode];
    const ta = state.mode !== '2pa';
    $('#t1-box').hidden = !ta;
    $('#decay').checked = state.decay;
    controls.T1ps.range.disabled = !state.decay;
    controls.T1ps.num.disabled = !state.decay;
    for (const beam of ['pump', 'probe']) {
      const col = waveRGB(state[beam].lambda);
      $(`#${beam}-swatch`).style.background = cssRGB(col);
      $(`#${beam}-tag`).textContent = `${Math.round(state[beam].lambda)} nm · ${waveName(state[beam].lambda)}`;
      $(`#key-${beam}`).style.background = cssRGB(col);
    }
    document.querySelectorAll('#topmode button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === ui.top)));
    $('#timebar').hidden = ui.top !== 'pulses';
    $('#key-pop').hidden = ui.top !== 'pulses' || state.mode === '2pa';
    $('#key-sig').textContent = state.mode === '2pa' ? 'Signal (pump × probe)' : 'Signal (population × probe)';
    document.querySelectorAll('#mapplane button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === ui.map)));
    document.querySelectorAll('#cutaxis button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === ui.cut)));
  }

  // Slider ranges that follow the beams: displacements span the region where overlap is non-zero.
  function updateRanges(core) {
    const R = core.R;
    const setHalf = (key, half) => {
      const c = controls[key];
      const h = Math.max(niceCeil(half), niceCeil(Math.abs(getPath(key)) * 1.02));
      c.min = -h;
      c.max = h;
    };
    if (!ui.drag) {
      setHalf('dx', R.x);
      setHalf('dy', R.y);
      setHalf('dz', R.z);
    }
    const W = core.win.W;
    const T = core.M.invT > 0 ? 1 / core.M.invT : 0;
    let lo = -niceCeil(W);
    let hi = niceCeil(core.M.instantaneous ? W : W + (T ? Math.min(4 * T, 40 * W) : W));
    lo = Math.min(lo, -niceCeil(-state.delay * 1.02));
    hi = Math.max(hi, niceCeil(state.delay * 1.02));
    controls.delay.min = lo;
    controls.delay.max = hi;
    const L2 = state.L / 2;
    ui.sliceZ = clamp(ui.sliceZ, -L2, L2);
    const sz = $('#slice-z');
    sz.min = String(-L2);
    sz.max = String(L2);
    sz.step = String(state.L / 400);
    sz.value = String(ui.sliceZ);
    $('#slice-z-out').textContent = minus(fmtLen(ui.sliceZ));
  }

  // ---------------------------------------------------------------- compute

  const cache = new Map();
  function memo(name, key, fn) {
    const hit = cache.get(name);
    if (hit && hit.key === key) return hit.val;
    const val = fn();
    cache.set(name, { key, val });
    return val;
  }

  function modelParams() {
    return {
      mode: state.mode,
      angle: state.angle,
      L: state.L,
      T1: state.mode !== '2pa' && state.decay ? state.T1ps * 1000 : Infinity,
      pump: { lambda: state.pump.lambda, w0: state.pump.w0, fwhm: state.pump.fwhm },
      probe: { lambda: state.probe.lambda, w0: state.probe.w0, fwhm: state.probe.fwhm },
    };
  }

  function computeCore() {
    const p = modelParams();
    const mKey = JSON.stringify(p);
    const M = memo('M', mKey, () => F.createModel(p));
    const cKey = JSON.stringify(Object.assign({}, p, { angle: 0 }));
    const Mc = memo('Mc', cKey, () => F.createModel(Object.assign({}, p, { angle: 0 })));
    const best = memo('best', mKey, () => F.bestAlignment(M));
    const bestC = memo('bestC', cKey, () => F.bestAlignment(Mc));
    const S = F.signal(M, state.dx, state.dy, state.dz, state.delay, 64);
    return {
      p, mKey, cKey, M, Mc, best, bestC,
      R: F.displacementRanges(M),
      win: F.delayWindow(M),
      S,
      fv: Math.min(1, S / best.S),
      eta: S / M.L,
      xfac: best.S / bestC.S,
    };
  }

  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

  // Full width of the peak at fraction q of its maximum; null if it runs off the scan.
  function widthAt(xs, ys, q) {
    let iMax = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i] > ys[iMax]) iMax = i;
    const lvl = ys[iMax] * q;
    let lo = null;
    let hi = null;
    for (let i = iMax; i > 0; i--) if (ys[i - 1] < lvl) { lo = xs[i - 1] + ((lvl - ys[i - 1]) * (xs[i] - xs[i - 1])) / (ys[i] - ys[i - 1]); break; }
    for (let i = iMax; i < ys.length - 1; i++) if (ys[i + 1] < lvl) { hi = xs[i] + ((ys[i] - lvl) * (xs[i + 1] - xs[i])) / (ys[i] - ys[i + 1]); break; }
    return lo === null || hi === null ? null : hi - lo;
  }
  function crossing(xs, ys, lvl) {
    for (let i = 0; i < ys.length - 1; i++) {
      if (ys[i] < lvl && ys[i + 1] >= lvl) return xs[i] + ((lvl - ys[i]) * (xs[i + 1] - xs[i])) / (ys[i + 1] - ys[i]);
    }
    return null;
  }

  function delayScan(core) {
    const lo = controls.delay.min;
    const hi = controls.delay.max;
    const key = [core.mKey, state.dx, state.dy, state.dz, lo, hi].join('|');
    return memo('delayScan', key, () => {
      const xs = linspace(lo, hi, 161);
      const ys = xs.map((d) => F.signal(core.M, state.dx, state.dy, state.dz, d, 32) / core.best.S);
      return { xs, ys };
    });
  }
  function delayRef(core) {
    const lo = controls.delay.min;
    const hi = controls.delay.max;
    return memo('delayRef', [core.cKey, lo, hi].join('|'), () => {
      const xs = linspace(lo, hi, 161);
      const raw = xs.map((d) => F.signal(core.Mc, 0, 0, 0, d, 32));
      const m = Math.max(...raw);
      return { xs, ys: raw.map((v) => v / m) };
    });
  }

  function cutScan(core, axis) {
    const c = controls['d' + axis];
    const key = [core.mKey, axis, state.dx, state.dy, state.dz, state.delay, c.min, c.max].join('|');
    return memo('cut' + axis, key, () => {
      const xs = linspace(c.min, c.max, 101);
      const ys = xs.map((v) => {
        const o = { dx: state.dx, dy: state.dy, dz: state.dz };
        o['d' + axis] = v;
        return F.signal(core.M, o.dx, o.dy, o.dz, state.delay, 28) / core.best.S;
      });
      const h = Math.max(0.05, (c.max - c.min) * 2e-4);
      const o1 = { dx: state.dx, dy: state.dy, dz: state.dz };
      const o2 = { dx: state.dx, dy: state.dy, dz: state.dz };
      o1['d' + axis] += h;
      o2['d' + axis] -= h;
      const slope = (F.signal(core.M, o1.dx, o1.dy, o1.dz, state.delay, 64) - F.signal(core.M, o2.dx, o2.dy, o2.dz, state.delay, 64)) / (2 * h) / core.best.S;
      return { xs, ys, slope };
    });
  }

  // ------------------------------------------------------------- scheduling

  let raf = 0;
  let dirty = true;
  let lastTs = 0;
  function changed() {
    dirty = true;
    schedule();
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame(ts) {
    raf = 0;
    const dt = lastTs ? Math.min(100, ts - lastTs) : 16;
    lastTs = ts;
    const core = computeCore();
    const full = dirty;
    if (full) {
      dirty = false;
      updateRanges(core);
      syncAll();
      renderReadout(core);
      renderDepth(core);
      renderXs(core);
      renderDelay(core);
      renderCut(core);
      startMap(core);
    }
    if (ui.playing) advanceTime(core, dt);
    if (full || ui.playing) renderTop(core);
    if (stepMap(core, full)) schedule();
    if (ui.playing) schedule();
    else lastTs = 0;
  }

  // ---------------------------------------------------------------- readout

  const ICONS = {
    good: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.2 2.2 4.8-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.6l4.6 8.4H1.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 5v2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    bad: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  function renderReadout(core) {
    const { fv, eta, xfac } = core;
    $('#fv').textContent = fv >= 0.9995 ? '100.0' : (fv * 100).toFixed(1);
    $('#fv-fill').style.width = (fv * 100).toFixed(2) + '%';
    $('#fv-meter').setAttribute('aria-valuenow', (fv * 100).toFixed(1));
    const level = fv >= 0.95 ? 'good' : fv >= 0.6 ? 'warn' : 'bad';
    const st = $('#status');
    st.dataset.level = level;
    const levelText = level === 'good' ? 'Near maximum' : level === 'warn' ? 'Partial overlap' : 'Poor overlap';
    st.innerHTML = ICONS[level] + levelText;
    $('#mini-fv').textContent = $('#fv').textContent + '%';
    $('#mini-eta').textContent = fmtPct(eta);
    $('#mini-status').textContent = levelText;
    $('#mini-status').dataset.level = level;

    $('#eta').textContent = fmtPct(eta);
    const I0 = state.pump.I0;
    const tauFactor = state.pump.fwhm * 1e-15 * Math.sqrt(Math.PI / (4 * Math.LN2));
    if (state.mode === '2pa') {
      $('#eta-note').textContent = 'probe-weighted pump intensity ÷ peak';
      $('#ieff-label').textContent = 'Pump intensity seen by probe';
      $('#ieff').textContent = fmtIntensity(eta * I0);
      $('#ieff-note').innerHTML = 'η × I<sub>0</sub> (I<sub>0</sub> = ' + fmtIntensity(I0) + ')';
    } else if (state.mode === 'ta') {
      const F0 = I0 * 1e9 * tauFactor;
      $('#eta-note').textContent = 'probe-weighted pump fluence ÷ peak';
      $('#ieff-label').textContent = 'Pump fluence seen by probe';
      $('#ieff').textContent = fmtFluence(eta * F0);
      $('#ieff-note').innerHTML = 'η × F<sub>0</sub> (F<sub>0</sub> = ' + fmtFluence(F0) + ')';
    } else {
      $('#eta-note').textContent = 'probe-weighted ∫I² dt ÷ peak';
      $('#ieff-label').textContent = 'Equivalent pump intensity';
      $('#ieff').textContent = fmtIntensity(Math.sqrt(Math.max(0, eta)) * I0);
      $('#ieff-note').innerHTML = '√η × I<sub>0</sub>, for the I² excitation';
    }
    $('#xfac').textContent = fmtPct(xfac);
    $('#xfac-note').textContent = state.angle > 0
      ? `best at ${Number(state.angle.toFixed(1))}° ÷ best collinear`
      : 'collinear: no loss from crossing';
    $('#budget').textContent = `Versus perfectly collinear, aligned beams: ${fmtPct(xfac)} × ${fmtPct(fv)} = ${fmtPct(xfac * fv)}`;

    for (const beam of ['pump', 'probe']) {
      const b = state[beam];
      const zR = (Math.PI * b.w0 * b.w0) / (b.lambda / 1000);
      const area = (Math.PI * (b.w0 * 1e-4) ** 2) / 2;
      const tf = b.fwhm * 1e-15 * Math.sqrt(Math.PI / (4 * Math.LN2));
      const E = b.I0 * 1e9 * area * tf;
      const F0 = b.I0 * 1e9 * tf;
      $(`#${beam}-derived`).textContent = `z_R ${fmtLen(zR)} · E ${fmtEnergy(E)} · F₀ ${fmtFluence(F0)}`;
    }
  }

  // ------------------------------------------------------------- canvases

  // Element sizes come from a ResizeObserver so drawing never forces a synchronous layout.
  const sizes = new WeakMap();
  function sizeOf(el) {
    let s = sizes.get(el);
    if (!s) {
      const r = el.getBoundingClientRect();
      s = { width: r.width, height: r.height };
      sizes.set(el, s);
    }
    return s;
  }

  function fitCanvas(cv) {
    const r = sizeOf(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: r.width, H: r.height, dpr };
  }

  const offscreen = document.createElement('canvas');
  function blit(ctx, img, x, y, w, h) {
    offscreen.width = img.width;
    offscreen.height = img.height;
    offscreen.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(offscreen, x, y, w, h);
  }

  const BG = [5 / 255, 7 / 255, 11 / 255];
  const POP = [1, 0.84, 0.6];

  // Lookup tables keep the per-pixel work to a few array reads.
  const LUT_N = 2048;
  const powLUT = (e) => Float32Array.from({ length: LUT_N + 1 }, (_, i) => Math.pow(i / LUT_N, e));
  const P80 = powLUT(0.8);
  const P85 = powLUT(0.85);
  const lp = (lut, x) => lut[x >= 1 ? LUT_N : (x * LUT_N) | 0];
  const TONE_MAX = 6;
  const TONE = Uint8ClampedArray.from({ length: LUT_N + 1 }, (_, i) => 255 * (1 - Math.exp(-1.35 * (i / LUT_N) * TONE_MAX)));
  const tone = (v) => TONE[v >= TONE_MAX ? LUT_N : ((v / TONE_MAX) * LUT_N) | 0];

  function beamLooks() {
    const Imax = Math.max(state.pump.I0, state.probe.I0);
    return {
      cp: waveRGB(state.pump.lambda),
      cr: waveRGB(state.probe.lambda),
      // Brightness follows intensity, compressed so a weak probe stays visible.
      wp: Math.max(0.45, Math.pow(state.pump.I0 / Imax, 0.25)),
      wr: Math.max(0.45, Math.pow(state.probe.I0 / Imax, 0.25)),
    };
  }

  function axisLabelsScene(ctx, rect, xr, yr, xt, yt, xu, yu) {
    ctx.fillStyle = theme.sceneDim;
    ctx.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of xt) {
      const X = rect.x + ((v - xr[0]) / (xr[1] - xr[0])) * rect.w;
      ctx.fillText(fmtTick(v / xu.div), X, rect.y + rect.h + 6);
      ctx.fillRect(X - 0.5, rect.y + rect.h, 1, 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yt) {
      const Y = rect.y + (1 - (v - yr[0]) / (yr[1] - yr[0])) * rect.h;
      ctx.fillText(fmtTick(v / yu.div), rect.x - 7, Y);
      ctx.fillRect(rect.x - 4, Y - 0.5, 4, 1);
    }
  }

  // ---- top view (x–z crossing plane)

  const TOP_PAD = { l: 52, r: 16, t: 14, b: 36 };
  let topView = null;

  function computeTopView(M, pw, ph) {
    const L2 = M.L / 2;
    const edge = Math.max(F.probeWidth(M, L2), F.pumpWidth(M, L2 / M.cos) / M.cos);
    const need = Math.max(2.4 * Math.max(M.w0r, M.w0p / M.cos), 1.25 * edge);
    const full = M.tan * L2 + 1.6 * M.w0p / M.cos;
    const iso = (L2 * ph) / pw;
    const X = Math.max(need, Math.min(full, iso));
    return { z0: -L2, z1: L2, x0: -X, x1: X };
  }

  // Probe profile and arrival times depend only on the geometry; the pump profile also on its offset.
  function topField(M, view, nx, ny) {
    const gKey = [cache.get('M').key, view.z0, view.z1, view.x0, view.x1, nx, ny].join('|');
    const base = memo('topBase', gKey, () => {
      const n = nx * ny;
      const f = { nx, ny, Ar: new Float32Array(n), Tp: new Float32Array(n), Tz: new Float32Array(n) };
      for (let j = 0; j < ny; j++) {
        const x = view.x1 - ((j + 0.5) / ny) * (view.x1 - view.x0);
        for (let i = 0; i < nx; i++) {
          const z = view.z0 + ((i + 0.5) / nx) * (view.z1 - view.z0);
          const k = j * nx + i;
          f.Ar[k] = F.probeSpatial(M, x, 0, z);
          f.Tp[k] = F.pumpArrival(M, x, z);
          f.Tz[k] = z / C;
        }
      }
      return f;
    });
    const Ap = memo('topPump', [gKey, state.dx, state.dy, state.dz].join('|'), () => {
      const a = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const x = view.x1 - ((j + 0.5) / ny) * (view.x1 - view.x0);
        for (let i = 0; i < nx; i++) {
          const z = view.z0 + ((i + 0.5) / nx) * (view.z1 - view.z0);
          a[j * nx + i] = F.pumpSpatial(M, x, 0, z, state.dx, state.dy, state.dz);
        }
      }
      return a;
    });
    return { nx, ny, Ap, Ar: base.Ar, Tp: base.Tp, Tz: base.Tz };
  }

  function timeRange(M, view) {
    const fw = Math.max(state.pump.fwhm, state.probe.fwhm);
    const tp = [F.pumpArrival(M, view.x0, view.z0), F.pumpArrival(M, view.x1, view.z0), F.pumpArrival(M, view.x0, view.z1), F.pumpArrival(M, view.x1, view.z1)];
    const lo = Math.min(...tp, state.delay + view.z0 / C) - 1.5 * fw;
    const hi = Math.max(...tp, state.delay + view.z1 / C) + 1.5 * fw;
    return { lo, hi };
  }

  function advanceTime(core, dt) {
    if (!topView) return;
    const tr = timeRange(core.M, topView);
    const span = tr.hi - tr.lo;
    ui.t += (span / 4500) * dt;
    if (ui.t > tr.hi) ui.t = tr.lo;
  }

  function renderTop(core) {
    const { M } = core;
    const cv = $('#cv-top');
    const { ctx, W, H } = fitCanvas(cv);
    const rect = { x: TOP_PAD.l, y: TOP_PAD.t, w: W - TOP_PAD.l - TOP_PAD.r, h: H - TOP_PAD.t - TOP_PAD.b };
    if (rect.w < 20 || rect.h < 20) return;
    const view = ui.drag && ui.drag.view ? ui.drag.view : computeTopView(M, rect.w, rect.h);
    topView = view;
    const nx = Math.max(60, Math.round(rect.w / 2));
    const ny = Math.max(40, Math.round(rect.h / 2));
    const fld = topField(M, view, nx, ny);
    const look = beamLooks();
    const img = new ImageData(nx, ny);
    const d = img.data;
    const sc = Math.sqrt(M.sc2);
    const tr = timeRange(M, view);
    if (ui.t < tr.lo || ui.t > tr.hi) ui.t = clamp(ui.t, tr.lo, tr.hi);
    const t = ui.t;
    const pulses = ui.top === 'pulses';
    const sp2 = 2 * M.sPu * M.sPu;
    const sr2 = 2 * M.sPr * M.sPr;
    for (let k = 0, n = nx * ny; k < n; k++) {
      const ap = fld.Ap[k];
      const ar = fld.Ar[k];
      let r = BG[0], g = BG[1], b = BG[2];
      if (!pulses) {
        const vp = look.wp * 0.8 * lp(P80, ap);
        const vr = look.wr * 0.8 * lp(P80, ar);
        const pd = M.m === 1 ? ap : ap * ap;
        const dens = pd * ar > 1e-5 ? pd * ar * F.kernel(M, state.delay + fld.Tz[k] - fld.Tp[k], sc) / M.kernelPeak : 0;
        const gl = 1.2 * lp(P85, dens);
        r += look.cp[0] * vp + look.cr[0] * vr + gl;
        g += look.cp[1] * vp + look.cr[1] * vr + gl;
        b += look.cp[2] * vp + look.cr[2] * vr + gl;
      } else {
        const ep = t - fld.Tp[k];
        const er = t - state.delay - fld.Tz[k];
        const ip = ap > 1e-4 ? ap * Math.exp(-(ep * ep) / sp2) : 0;
        const ir = ar > 1e-4 ? ar * Math.exp(-(er * er) / sr2) : 0;
        let pop = 0;
        let inter;
        if (M.instantaneous) inter = ip * ir;
        else {
          const pd = M.m === 1 ? ap : ap * ap;
          pop = pd > 1e-4 ? pd * F.stepResponse(ep, M.sDrive, M.invT) : 0;
          inter = pop * ir;
        }
        const vp = look.wp * (0.1 * ap + 1.1 * ip);
        const vr = look.wr * (0.1 * ar + 1.1 * ir);
        const gl = 1.6 * inter;
        const pp = 0.45 * pop;
        r += look.cp[0] * vp + look.cr[0] * vr + POP[0] * pp + gl;
        g += look.cp[1] * vp + look.cr[1] * vr + POP[1] * pp + gl;
        b += look.cp[2] * vp + look.cr[2] * vr + POP[2] * pp + gl;
      }
      const o = k * 4;
      d[o] = tone(r);
      d[o + 1] = tone(g);
      d[o + 2] = tone(b);
      d[o + 3] = 255;
    }
    ctx.fillStyle = theme.scene;
    ctx.fillRect(0, 0, W, H);
    blit(ctx, img, rect.x, rect.y, rect.w, rect.h);

    const X = (z) => rect.x + ((z - view.z0) / (view.z1 - view.z0)) * rect.w;
    const Y = (x) => rect.y + ((view.x1 - x) / (view.x1 - view.x0)) * rect.h;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    // 1/e² envelopes
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssRGB(look.cr, 0.55);
    for (const sgn of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const z = view.z0 + ((view.z1 - view.z0) * i) / 120;
        const x = sgn * F.probeWidth(M, z);
        if (i) ctx.lineTo(X(z), Y(x));
        else ctx.moveTo(X(z), Y(x));
      }
      ctx.stroke();
    }
    ctx.strokeStyle = cssRGB(look.cp, 0.6);
    const sLo = (view.z0 - state.dz) / M.cos - 2 * (view.x1 - view.x0);
    const sHi = (view.z1 - state.dz) / M.cos + 2 * (view.x1 - view.x0);
    for (const sgn of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const s = sLo + ((sHi - sLo) * i) / 200;
        const w = F.pumpWidth(M, s) * sgn;
        const x = state.dx + s * M.sin + w * M.cos;
        const z = state.dz + s * M.cos - w * M.sin;
        if (i) ctx.lineTo(X(z), Y(x));
        else ctx.moveTo(X(z), Y(x));
      }
      ctx.stroke();
    }
    // slice plane used by the cross-section view
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(X(ui.sliceZ) + 0.5, rect.y);
    ctx.lineTo(X(ui.sliceZ) + 0.5, rect.y + rect.h);
    ctx.stroke();
    // foci
    ctx.strokeStyle = cssRGB(look.cr, 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(0) - 6, Y(0));
    ctx.lineTo(X(0) + 6, Y(0));
    ctx.moveTo(X(0), Y(0) - 6);
    ctx.lineTo(X(0), Y(0) + 6);
    ctx.stroke();
    const fx = X(state.dz);
    const fy = Y(state.dx);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#05070b';
    ctx.beginPath();
    ctx.arc(fx, fy, 7, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = cssRGB(look.cp, 1);
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // labels
    ctx.font = '500 11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    const lz = view.z0 + 0.02 * (view.z1 - view.z0);
    const prX = F.probeWidth(M, lz);
    ctx.fillStyle = cssRGB(look.cr, 1);
    if (Y(prX) - 4 > rect.y + 12) ctx.fillText('probe', X(lz) + 2, Y(prX) - 4);
    // Keep the pump label clear of the probe label.
    const probeEnd = X(lz) + 2 + ctx.measureText('probe').width + 14;
    const pzLabel = Math.max(view.z0 + 0.14 * (view.z1 - view.z0), view.z0 + ((probeEnd - rect.x) / rect.w) * (view.z1 - view.z0));
    const pxAxis = state.dx + (pzLabel - state.dz) * M.tan;
    const pw = F.pumpWidth(M, (pzLabel - state.dz) / M.cos) / M.cos;
    const ly = Y(pxAxis + pw) - 4;
    if (ly > rect.y + 12 && ly < rect.y + rect.h - 4) {
      ctx.fillStyle = cssRGB(look.cp, 1);
      ctx.fillText('pump', X(pzLabel), ly);
    }
    ctx.fillStyle = theme.sceneDim;
    ctx.font = '10.5px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('entrance face', rect.x + 6, rect.y + 4);
    ctx.textAlign = 'right';
    ctx.fillText(pulses ? '' : 'exit face', rect.x + rect.w - 6, rect.y + 4);
    if (pulses) {
      ctx.fillStyle = theme.sceneInk;
      ctx.font = '500 12px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('t = ' + fmtTime(t), rect.x + rect.w - 8, rect.y + 6);
    }

    // axes
    ctx.strokeStyle = theme.sceneRule;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    const zu = lenUnit(view.z1 - view.z0);
    const xu = lenUnit(view.x1 - view.x0);
    axisLabelsScene(ctx, rect, [view.z0, view.z1], [view.x0, view.x1],
      ticks(view.z0, view.z1, Math.max(3, Math.floor(rect.w / 90))),
      ticks(view.x0, view.x1, Math.max(2, Math.floor(rect.h / 50))), zu, xu);
    ctx.fillStyle = theme.sceneDim;
    ctx.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`z (${zu.unit}) along the probe →`, rect.x + rect.w, H - 2);
    ctx.save();
    ctx.translate(12, rect.y + rect.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`x (${xu.unit})`, 0, 0);
    ctx.restore();

    const sx = (view.z1 - view.z0) / rect.w;
    const sy = (view.x1 - view.x0) / rect.h;
    const aniso = Math.max(sx, sy) / Math.min(sx, sy);
    $('#top-sub').textContent = (pulses
      ? 'Instantaneous intensity in the x–z plane at time t. Press Play to watch the pulses cross; the white glow is where they interact.'
      : 'Top view (x–z) through the probe axis, across the full sample depth. White shows where the signal is generated. Drag to move the pump focus.') +
      (aniso > 1.5 ? ` Axes are scaled differently (×${sig(aniso, 2)}).` : '');

    if (pulses) {
      const s = $('#t-scrub');
      if (document.activeElement !== s) s.value = String(Math.round((1000 * (t - tr.lo)) / (tr.hi - tr.lo)));
      $('#t-out').textContent = 't = ' + fmtTime(t);
    }
  }

  // ---- cross-section (x–y at depth z)

  const XS_PAD = { l: 46, r: 14, t: 14, b: 36 };
  let xsView = null;

  function renderXs(core) {
    const { M } = core;
    const cv = $('#cv-xs');
    const { ctx, W, H } = fitCanvas(cv);
    const side = Math.min(W - XS_PAD.l - XS_PAD.r, H - XS_PAD.t - XS_PAD.b);
    if (side < 20) return;
    const rect = { x: XS_PAD.l + (W - XS_PAD.l - XS_PAD.r - side) / 2, y: XS_PAD.t, w: side, h: side };
    const zs = ui.sliceZ;
    const sC = (zs - state.dz) / M.cos;
    const wr = F.probeWidth(M, zs);
    const wpx = F.pumpWidth(M, sC) / M.cos;
    const R = ui.drag && ui.drag.xsR ? ui.drag.xsR : niceCeil(2.4 * Math.max(wr, wpx)) * 1;
    xsView = { R, rect };
    const n = Math.max(80, Math.round(side / 2));
    const look = beamLooks();
    const sc = Math.sqrt(M.sc2);
    const key = [core.mKey, state.dx, state.dy, state.dz, state.delay, zs, R, n].join('|');
    const img = memo('xsImg', key + '|' + look.cp + look.cr + look.wp + look.wr, () => {
      const im = new ImageData(n, n);
      const d = im.data;
      for (let j = 0; j < n; j++) {
        const x = R - ((j + 0.5) / n) * 2 * R;
        for (let i = 0; i < n; i++) {
          const y = -R + ((i + 0.5) / n) * 2 * R;
          const ap = F.pumpSpatial(M, x, y, zs, state.dx, state.dy, state.dz);
          const ar = F.probeSpatial(M, x, y, zs);
          const tau = state.delay + zs / C - F.pumpArrival(M, x, zs);
          const pd = M.m === 1 ? ap : ap * ap;
          const dens = pd * ar > 1e-5 ? pd * ar * F.kernel(M, tau, sc) / M.kernelPeak : 0;
          const vp = look.wp * 0.8 * lp(P80, ap);
          const vr = look.wr * 0.8 * lp(P80, ar);
          const gl = 1.2 * lp(P85, dens);
          const o = (j * n + i) * 4;
          d[o] = tone(BG[0] + look.cp[0] * vp + look.cr[0] * vr + gl);
          d[o + 1] = tone(BG[1] + look.cp[1] * vp + look.cr[1] * vr + gl);
          d[o + 2] = tone(BG[2] + look.cp[2] * vp + look.cr[2] * vr + gl);
          d[o + 3] = 255;
        }
      }
      return im;
    });
    ctx.fillStyle = theme.scene;
    ctx.fillRect(0, 0, W, H);
    blit(ctx, img, rect.x, rect.y, rect.w, rect.h);
    const Xp = (y) => rect.x + ((y + R) / (2 * R)) * rect.w;
    const Yp = (x) => rect.y + ((R - x) / (2 * R)) * rect.h;
    const k = rect.w / (2 * R);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssRGB(look.cr, 0.6);
    ctx.beginPath();
    ctx.arc(Xp(0), Yp(0), wr * k, 0, 2 * Math.PI);
    ctx.stroke();
    const xc = state.dx + (zs - state.dz) * M.tan;
    ctx.strokeStyle = cssRGB(look.cp, 0.65);
    ctx.beginPath();
    ctx.ellipse(Xp(state.dy), Yp(xc), F.pumpWidth(M, sC) * k, wpx * k, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#05070b';
    ctx.beginPath();
    ctx.arc(Xp(state.dy), Yp(xc), 5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = cssRGB(look.cp, 1);
    ctx.beginPath();
    ctx.arc(Xp(state.dy), Yp(xc), 4, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
    // off-screen pump indicator
    if (Math.abs(xc) > R || Math.abs(state.dy) > R) {
      const ang = Math.atan2(-(xc), state.dy);
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const r = rect.w / 2 - 12;
      ctx.fillStyle = cssRGB(look.cp, 1);
      ctx.beginPath();
      const px = cx + r * Math.cos(ang);
      const py = cy + r * Math.sin(ang);
      ctx.moveTo(px + 8 * Math.cos(ang), py + 8 * Math.sin(ang));
      ctx.lineTo(px + 6 * Math.cos(ang + 2.4), py + 6 * Math.sin(ang + 2.4));
      ctx.lineTo(px + 6 * Math.cos(ang - 2.4), py + 6 * Math.sin(ang - 2.4));
      ctx.fill();
    }
    ctx.strokeStyle = theme.sceneRule;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    const u = lenUnit(2 * R);
    const tk = ticks(-R, R, 4);
    axisLabelsScene(ctx, rect, [-R, R], [-R, R], tk, tk, u, u);
    ctx.fillStyle = theme.sceneDim;
    ctx.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`y (${u.unit}) →`, rect.x + rect.w, H - 2);
    ctx.save();
    ctx.translate(12, rect.y + rect.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`x (${u.unit})`, 0, 0);
    ctx.restore();
    ctx.font = '500 11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = cssRGB(look.cr, 1);
    ctx.fillText('probe', rect.x + 6, rect.y + 6);
    ctx.fillStyle = cssRGB(look.cp, 1);
    ctx.fillText('pump', rect.x + 50, rect.y + 6);
    $('#slice-z-out').textContent = minus(fmtLen(zs));
  }

  // ---- overlap map

  const MAP_PAD = { l: 46, r: 8, t: 8, b: 36 };
  const MAP_N = 41;
  let mapJob = null;
  let mapHover = null;

  function mapAxes() {
    const v = controls.dx;
    const h = ui.map === 'xy' ? controls.dy : controls.dz;
    return { v: [v.min, v.max], h: [h.min, h.max], hKey: ui.map === 'xy' ? 'dy' : 'dz' };
  }

  function startMap(core) {
    const ax = mapAxes();
    const key = [core.mKey, ui.map, ui.map === 'xy' ? state.dz : state.dy, state.delay, ax.v, ax.h].join('|');
    if (mapJob && mapJob.key === key) return;
    const vals = mapJob && mapJob.vals.length === MAP_N * MAP_N ? mapJob.vals : new Float32Array(MAP_N * MAP_N);
    mapJob = { key, vals, next: 0, ax, plane: ui.map, done: false };
  }

  // Computes map cells within a time budget; returns true while work remains.
  function stepMap(core, force) {
    if (!mapJob) return false;
    const worked = !mapJob.done;
    if (!mapJob.done) {
      const t0 = performance.now();
      const { ax, vals } = mapJob;
      while (mapJob.next < MAP_N * MAP_N && performance.now() - t0 < 6) {
        const end = Math.min(MAP_N * MAP_N, mapJob.next + MAP_N);
        for (let k = mapJob.next; k < end; k++) {
          const j = Math.floor(k / MAP_N);
          const i = k % MAP_N;
          const dxv = ax.v[1] - (j / (MAP_N - 1)) * (ax.v[1] - ax.v[0]);
          const hv = ax.h[0] + (i / (MAP_N - 1)) * (ax.h[1] - ax.h[0]);
          const dy = mapJob.plane === 'xy' ? hv : state.dy;
          const dz = mapJob.plane === 'xy' ? state.dz : hv;
          vals[k] = F.signal(core.M, dxv, dy, dz, state.delay, 24) / core.best.S;
        }
        mapJob.next = end;
      }
      if (mapJob.next >= MAP_N * MAP_N) mapJob.done = true;
    }
    if (worked || force) renderMap(core);
    return !mapJob.done;
  }

  function contourSegments(vals, N, level) {
    const segs = [];
    const T = { 1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']], 5: [['t', 'r'], ['l', 'b']], 6: [['t', 'b']], 7: [['t', 'l']],
      8: [['t', 'l']], 9: [['t', 'b']], 10: [['t', 'l'], ['b', 'r']], 11: [['t', 'r']], 12: [['l', 'r']], 13: [['b', 'r']], 14: [['l', 'b']] };
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = vals[j * N + i];
        const b = vals[j * N + i + 1];
        const c = vals[(j + 1) * N + i + 1];
        const d = vals[(j + 1) * N + i];
        const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const e = {
          t: [i + (level - a) / (b - a), j],
          r: [i + 1, j + (level - b) / (c - b)],
          b: [i + (level - d) / (c - d), j + 1],
          l: [i, j + (level - a) / (d - a)],
        };
        for (const [p, q] of T[idx]) segs.push([e[p], e[q]]);
      }
    }
    return segs;
  }

  function mapRect(W, H) {
    const side = Math.min(W - MAP_PAD.l - MAP_PAD.r, H - MAP_PAD.t - MAP_PAD.b);
    return { x: MAP_PAD.l + (W - MAP_PAD.l - MAP_PAD.r - side) / 2, y: MAP_PAD.t, w: side, h: side };
  }

  function renderMap(core) {
    if (!mapJob) return;
    const cv = $('#cv-map');
    const { ctx, W, H } = fitCanvas(cv);
    const rect = mapRect(W, H);
    if (rect.w < 20) return;
    const { ax, vals } = mapJob;
    const img = new ImageData(MAP_N, MAP_N);
    const lut = theme.lut;
    for (let k = 0; k < MAP_N * MAP_N; k++) {
      const li = Math.round(clamp(vals[k], 0, 1) * 255) * 3;
      img.data[k * 4] = lut[li];
      img.data[k * 4 + 1] = lut[li + 1];
      img.data[k * 4 + 2] = lut[li + 2];
      img.data[k * 4 + 3] = 255;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme.panel;
    ctx.fillRect(0, 0, W, H);
    const cell = rect.w / (MAP_N - 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (!mapJob.done) ctx.globalAlpha = 0.85;
    blit(ctx, img, rect.x - cell / 2, rect.y - cell / 2, rect.w + cell, rect.h + cell);
    ctx.globalAlpha = 1;
    if (mapJob.done) {
      ctx.strokeStyle = theme.mapLine;
      for (const [lvl, alpha] of [[0.5, 0.45], [0.9, 0.8]]) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [p, q] of contourSegments(vals, MAP_N, lvl)) {
          ctx.moveTo(rect.x + p[0] * cell, rect.y + p[1] * cell);
          ctx.lineTo(rect.x + q[0] * cell, rect.y + q[1] * cell);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const Xh = (h) => rect.x + ((h - ax.h[0]) / (ax.h[1] - ax.h[0])) * rect.w;
    const Yv = (v) => rect.y + ((ax.v[1] - v) / (ax.v[1] - ax.v[0])) * rect.h;
    // best position
    const bh = ui.map === 'xy' ? 0 : core.best.dz;
    ctx.strokeStyle = theme.mapLine;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(Xh(bh) - 5, Yv(core.best.dx));
    ctx.lineTo(Xh(bh) + 5, Yv(core.best.dx));
    ctx.moveTo(Xh(bh), Yv(core.best.dx) - 5);
    ctx.lineTo(Xh(bh), Yv(core.best.dx) + 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // current position
    const ch = ui.map === 'xy' ? state.dy : state.dz;
    const mx = Xh(ch);
    const my = Yv(state.dx);
    ctx.lineWidth = 4;
    ctx.strokeStyle = theme.panel;
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.ink;
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    // axes
    const hu = lenUnit(ax.h[1] - ax.h[0]);
    const vu = lenUnit(ax.v[1] - ax.v[0]);
    ctx.fillStyle = theme.muted;
    ctx.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of ticks(ax.h[0], ax.h[1], 4)) ctx.fillText(fmtTick(v / hu.div), Xh(v), rect.y + rect.h + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of ticks(ax.v[0], ax.v[1], 4)) ctx.fillText(fmtTick(v / vu.div), rect.x - 7, Yv(v));
    ctx.fillStyle = theme.ink2;
    ctx.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${ui.map === 'xy' ? 'Δy' : 'Δz'} (${hu.unit}) →`, rect.x + rect.w, H - 2);
    ctx.save();
    ctx.translate(12, rect.y + rect.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Δx (${vu.unit})`, 0, 0);
    ctx.restore();
    $('#map-sub').innerHTML = ui.map === 'xy'
      ? `f<sub>v</sub> for every transverse pump position at Δz = ${minus(fmtLen(state.dz))}. Click or drag to place the pump there; + marks the best position.`
      : `f<sub>v</sub> for pump positions in the crossing plane at Δy = ${minus(fmtLen(state.dy))}. The ridge runs along the pump's own axis. Click or drag to place the pump.`;
    renderMapTip(core, rect, ax);
  }

  function renderMapTip(core, rect, ax) {
    let tip = $('#map-tip');
    if (!mapHover) {
      if (tip) tip.hidden = true;
      return;
    }
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip';
      tip.id = 'map-tip';
      $('#map-wrap').appendChild(tip);
    }
    const hv = ax.h[0] + ((mapHover.x - rect.x) / rect.w) * (ax.h[1] - ax.h[0]);
    const vv = ax.v[1] - ((mapHover.y - rect.y) / rect.h) * (ax.v[1] - ax.v[0]);
    const dy = ui.map === 'xy' ? hv : state.dy;
    const dz = ui.map === 'xy' ? state.dz : hv;
    const f = F.signal(core.M, vv, dy, dz, state.delay, 48) / core.best.S;
    tip.hidden = false;
    tip.textContent = '';
    const b = document.createElement('b');
    b.textContent = 'f_v ' + fmtPct(f);
    const s = document.createElement('span');
    s.textContent = `Δx ${minus(fmtLen(vv))} · ${ui.map === 'xy' ? 'Δy' : 'Δz'} ${minus(fmtLen(hv))}`;
    tip.append(b, s);
    const wrap = $('#map-wrap').getBoundingClientRect();
    const left = clamp(mapHover.x + 16 + 14, 0, wrap.width - tip.offsetWidth - 4);
    tip.style.left = left + 'px';
    tip.style.top = Math.max(0, mapHover.y - 40) + 'px';
  }

  // ------------------------------------------------------------- SVG charts

  function lineChart(host, o) {
    const W = Math.max(220, sizeOf(host).width);
    const H = o.height || 200;
    const pad = Object.assign({ l: 44, r: 14, t: 10, b: 34 }, o.pad || {});
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const [x0, x1] = o.xDomain;
    const [y0, y1] = o.yDomain;
    const sx = (v) => pad.l + ((v - x0) / (x1 - x0)) * pw;
    const sy = (v) => pad.t + (1 - (clamp(v, y0, y1) - y0) / (y1 - y0)) * ph;
    const parts = [];
    parts.push(`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${o.label}">`);
    for (const v of ticks(y0, y1, 4)) {
      parts.push(`<line class="grid" x1="${pad.l}" x2="${pad.l + pw}" y1="${sy(v)}" y2="${sy(v)}"/>`);
      parts.push(`<text x="${pad.l - 7}" y="${sy(v) + 3.5}" text-anchor="end">${o.yFmt(v)}</text>`);
    }
    parts.push(`<line class="base" x1="${pad.l}" x2="${pad.l + pw}" y1="${sy(y0)}" y2="${sy(y0)}"/>`);
    for (const v of ticks(x0, x1, Math.max(3, Math.floor(pw / 80)))) {
      parts.push(`<line class="base" x1="${sx(v)}" x2="${sx(v)}" y1="${sy(y0)}" y2="${sy(y0) + 4}"/>`);
      parts.push(`<text x="${sx(v)}" y="${sy(y0) + 16}" text-anchor="middle">${o.xFmt(v)}</text>`);
    }
    parts.push(`<text class="axis-title" x="${pad.l + pw}" y="${H - 2}" text-anchor="end">${o.xTitle}</text>`);
    if (o.nowX != null && o.nowX >= x0 && o.nowX <= x1) {
      parts.push(`<line class="now" x1="${sx(o.nowX)}" x2="${sx(o.nowX)}" y1="${pad.t}" y2="${sy(y0)}"/>`);
    }
    o.series.forEach((s) => {
      let dpath = '';
      o.xs.forEach((x, i) => { dpath += (i ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(s.ys[i]).toFixed(1); });
      if (s.area) parts.push(`<path class="area" d="${dpath}L${sx(o.xs[o.xs.length - 1]).toFixed(1)} ${sy(y0)}L${sx(o.xs[0]).toFixed(1)} ${sy(y0)}Z"/>`);
      parts.push(`<path class="line ${s.cls || ''}" d="${dpath}"/>`);
    });
    if (o.marker && o.marker.x >= x0 && o.marker.x <= x1) {
      parts.push(`<circle class="dot" cx="${sx(o.marker.x)}" cy="${sy(o.marker.y)}" r="4.5"/>`);
    }
    parts.push(`<g class="hover" visibility="hidden"><line class="cross" y1="${pad.t}" y2="${sy(y0)}"/><circle class="dot" r="4"/></g>`);
    parts.push(`<rect class="hit" x="${pad.l}" y="${pad.t}" width="${pw}" height="${ph}"/>`);
    parts.push('</svg>');
    host.innerHTML = parts.join('');
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    host.appendChild(tip);
    const svg = host.querySelector('svg');
    const g = svg.querySelector('.hover');
    const hit = svg.querySelector('.hit');
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / r.width) * W;
      const xv = x0 + ((px - pad.l) / pw) * (x1 - x0);
      let bi = 0;
      for (let i = 1; i < o.xs.length; i++) if (Math.abs(o.xs[i] - xv) < Math.abs(o.xs[bi] - xv)) bi = i;
      const X = sx(o.xs[bi]);
      const main = o.series[0];
      g.setAttribute('visibility', 'visible');
      g.querySelector('line').setAttribute('x1', X);
      g.querySelector('line').setAttribute('x2', X);
      g.querySelector('circle').setAttribute('cx', X);
      g.querySelector('circle').setAttribute('cy', sy(main.ys[bi]));
      tip.hidden = false;
      tip.textContent = '';
      const b = document.createElement('b');
      b.textContent = o.tipValue(main.ys[bi]);
      tip.appendChild(b);
      o.series.slice(1).forEach((s) => {
        const e = document.createElement('span');
        e.textContent = `${s.name} ${o.tipValue(s.ys[bi])}`;
        tip.appendChild(e);
      });
      const e = document.createElement('span');
      e.textContent = o.tipX(o.xs[bi]);
      tip.appendChild(e);
      const left = (X / W) * r.width;
      tip.style.left = clamp(left + 12, 0, r.width - tip.offsetWidth) + 'px';
      tip.style.top = '0px';
      host._hoverX = clientX;
    };
    hit.addEventListener('pointermove', (ev) => show(ev.clientX));
    hit.addEventListener('pointerleave', () => {
      g.setAttribute('visibility', 'hidden');
      tip.hidden = true;
      host._hoverX = null;
    });
    if (host._hoverX != null) show(host._hoverX);
  }

  const pctFmt = (v) => `${Math.round(v * 100)}%`;

  function renderDelay(core) {
    const scan = delayScan(core);
    const series = [{ ys: scan.ys, name: 'f_v' }];
    const showRef = state.angle > 0;
    let refW = null;
    if (showRef) {
      const ref = delayRef(core);
      series.push({ ys: ref.ys, cls: 'ref', name: 'collinear' });
      refW = core.M.instantaneous ? widthAt(ref.xs, ref.ys, 0.5) : riseTime(ref.xs, ref.ys);
    }
    const lo = controls.delay.min;
    const hi = controls.delay.max;
    const tu = timeUnit(hi - lo);
    const current = F.signal(core.M, state.dx, state.dy, state.dz, state.delay, 64) / core.best.S;
    lineChart($('#ch-delay'), {
      label: 'Focal overlap versus pump-probe delay',
      xs: scan.xs, series, xDomain: [lo, hi], yDomain: [0, 1.05],
      xFmt: (v) => fmtTick(v / tu.div), yFmt: pctFmt, xTitle: `delay (${tu.unit})`,
      marker: { x: state.delay, y: current }, nowX: state.delay,
      tipValue: (v) => fmtPct(v), tipX: (x) => 'delay ' + fmtSigned(x, fmtTime),
    });
    const lg = $('#delay-legend');
    lg.innerHTML = '<span><i></i>f<sub>v</sub> at the current position</span>' + (showRef ? '<span><i class="ref"></i>collinear beams, peak-normalized</span>' : '');
    let foot;
    if (core.M.instantaneous) {
      const w = widthAt(scan.xs, scan.ys, 0.5);
      const wFlat = 2 * Math.sqrt(2 * Math.LN2) * Math.sqrt(core.M.sc2);
      foot = `Cross-correlation FWHM ${w ? fmtTime(w) : 'wider than the scan'}` +
        (showRef && refW ? ` (collinear ${fmtTime(refW)})` : ` (pulses alone ${fmtTime(wFlat)})`) +
        ` · best delay ${fmtSigned(core.best.delay, fmtTime)}`;
    } else {
      const r = riseTime(scan.xs, scan.ys);
      foot = `10–90% rise ${r ? fmtTime(r) : 'outside the scan'}` + (showRef && refW ? ` (collinear ${fmtTime(refW)})` : '') +
        (state.decay ? ` · peak at ${fmtSigned(core.best.delay, fmtTime)}, then decays with T₁ = ${fmtTime(state.T1ps * 1000)}` : ' · plateau once the pump has passed');
    }
    $('#delay-foot').textContent = foot;
  }

  function riseTime(xs, ys) {
    const m = Math.max(...ys);
    const a = crossing(xs, ys, 0.1 * m);
    const b = crossing(xs, ys, 0.9 * m);
    return a === null || b === null ? null : b - a;
  }

  function renderCut(core) {
    const axis = ui.cut;
    const c = controls['d' + axis];
    const scan = cutScan(core, axis);
    const lu = lenUnit(c.max - c.min);
    const cur = state['d' + axis];
    const current = core.fv;
    lineChart($('#ch-cut'), {
      label: `Focal overlap versus pump displacement along ${axis}`,
      xs: scan.xs, series: [{ ys: scan.ys, area: true, name: 'f_v' }], xDomain: [c.min, c.max], yDomain: [0, 1.05],
      xFmt: (v) => fmtTick(v / lu.div), yFmt: pctFmt, xTitle: `Δ${axis} (${lu.unit})`,
      marker: { x: cur, y: current }, nowX: cur,
      tipValue: (v) => fmtPct(v), tipX: (x) => `Δ${axis} ${minus(fmtLen(x))}`,
    });
    const body = $('#tol tbody');
    body.textContent = '';
    for (const ax of ['x', 'y', 'z']) {
      const s = cutScan(core, ax);
      const fw = widthAt(s.xs, s.ys, 0.5);
      const w90 = widthAt(s.xs, s.ys, 0.9);
      const tr = document.createElement('tr');
      if (ax === axis) tr.setAttribute('aria-current', 'true');
      const cells = [
        'Δ' + ax,
        fw ? fmtLen(fw) : '> scan',
        w90 ? '±' + fmtLen(w90 / 2) : '> scan',
        (Math.abs(s.slope * 100) < 0.005 ? '0.00' : minus((s.slope * 100).toFixed(Math.abs(s.slope * 100) < 0.1 ? 3 : 2))) + ' %/µm',
      ];
      cells.forEach((t) => {
        const td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
  }

  function renderDepth(core) {
    const host = $('#ch-depth');
    const prof = F.depthProfile(core.M, state.dx, state.dy, state.dz, state.delay, 70);
    const L2 = state.L / 2;
    const ymax = Math.max(1e-6, ...prof.f);
    const yTop = Math.max(0.05, Math.min(1, niceCeil(ymax * 1.08)));
    const lu = lenUnit(state.L);
    lineChart(host, {
      label: 'Local overlap through the sample depth',
      xs: prof.z, series: [{ ys: prof.f, area: true, name: 'η(z)' }],
      xDomain: [-L2, L2], yDomain: [0, yTop], height: 150,
      // The scene canvas spans the card edge to edge; this block has 16px side padding.
      pad: { l: TOP_PAD.l - 16, r: TOP_PAD.r - 16 },
      xFmt: (v) => fmtTick(v / lu.div), yFmt: (v) => `${Number((v * 100).toPrecision(3))}%`, xTitle: `z (${lu.unit})`,
      tipValue: (v) => 'η(z) ' + fmtPct(v), tipX: (x) => `z ${minus(fmtLen(x))}`,
    });
    const len = widthAt(prof.z, prof.f, 0.5);
    $('#depth-sub').textContent = `Local overlap η(z): probe-weighted pump drive at each depth, relative to its peak. ` +
      (len ? `Overlap length ${fmtLen(len)} FWHM` : 'Overlap fills the whole sample') + ` of L = ${fmtLen(state.L)}.`;
  }

  // ------------------------------------------------------------- interaction

  function nudge(key, delta) {
    setPath(key, getPath(key) + delta);
    changed();
  }

  function bindDrag(cv, onStart, onMove) {
    cv.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      cv.setPointerCapture(ev.pointerId);
      const r = cv.getBoundingClientRect();
      ui.drag = Object.assign({ x0: ev.clientX - r.left, y0: ev.clientY - r.top }, onStart(ev.clientX - r.left, ev.clientY - r.top));
      ev.preventDefault();
    });
    cv.addEventListener('pointermove', (ev) => {
      if (!ui.drag || !cv.hasPointerCapture(ev.pointerId)) return;
      const r = cv.getBoundingClientRect();
      onMove(ev.clientX - r.left, ev.clientY - r.top, ui.drag);
      changed();
    });
    const end = (ev) => {
      if (cv.hasPointerCapture(ev.pointerId)) cv.releasePointerCapture(ev.pointerId);
      ui.drag = null;
      changed();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  const r1 = (v) => Math.round(v * 10) / 10;

  function bindInteractions() {
    // Top view: drag moves the pump focus in x and z.
    bindDrag($('#cv-top'), () => ({ view: topView, dx: state.dx, dz: state.dz }), (x, y, d) => {
      const cv = sizeOf($('#cv-top'));
      const w = cv.width - TOP_PAD.l - TOP_PAD.r;
      const h = cv.height - TOP_PAD.t - TOP_PAD.b;
      state.dz = r1(d.dz + ((x - d.x0) / w) * (d.view.z1 - d.view.z0));
      state.dx = r1(d.dx - ((y - d.y0) / h) * (d.view.x1 - d.view.x0));
    });
    // Cross-section: drag moves the pump in x and y.
    bindDrag($('#cv-xs'), () => ({ xsR: xsView.R, dx: state.dx, dy: state.dy }), (x, y, d) => {
      const k = (2 * d.xsR) / xsView.rect.w;
      state.dy = r1(d.dy + (x - d.x0) * k);
      state.dx = r1(d.dx - (y - d.y0) * k);
    });
    // Map: place the pump where the pointer is.
    const placeFromMap = (x, y) => {
      const cv = sizeOf($('#cv-map'));
      const rect = mapRect(cv.width, cv.height);
      const ax = mapJob ? mapJob.ax : mapAxes();
      const hv = ax.h[0] + clamp((x - rect.x) / rect.w, 0, 1) * (ax.h[1] - ax.h[0]);
      const vv = ax.v[1] - clamp((y - rect.y) / rect.h, 0, 1) * (ax.v[1] - ax.v[0]);
      state.dx = r1(vv);
      state[ax.hKey] = r1(hv);
    };
    bindDrag($('#cv-map'), (x, y) => { placeFromMap(x, y); changed(); return {}; }, (x, y) => placeFromMap(x, y));
    $('#cv-map').addEventListener('pointermove', (ev) => {
      const r = ev.currentTarget.getBoundingClientRect();
      const rect = mapRect(r.width, r.height);
      const x = ev.clientX - r.left;
      const y = ev.clientY - r.top;
      mapHover = x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h ? { x, y } : null;
      if (mapJob) renderMap(computeCore());
    });
    $('#cv-map').addEventListener('pointerleave', () => {
      mapHover = null;
      if (mapJob) renderMap(computeCore());
    });

    const keyNudge = (cv, map) => cv.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 10 : 1;
      const m = map[ev.key];
      if (!m) return;
      ev.preventDefault();
      nudge(m[0], m[1] * step);
    });
    keyNudge($('#cv-top'), { ArrowUp: ['dx', 1], ArrowDown: ['dx', -1], ArrowRight: ['dz', 1], ArrowLeft: ['dz', -1] });
    keyNudge($('#cv-xs'), { ArrowUp: ['dx', 1], ArrowDown: ['dx', -1], ArrowRight: ['dy', 1], ArrowLeft: ['dy', -1] });
    $('#cv-map').addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 10 : 1;
      const hk = ui.map === 'xy' ? 'dy' : 'dz';
      const m = { ArrowUp: ['dx', 1], ArrowDown: ['dx', -1], ArrowRight: [hk, 1], ArrowLeft: [hk, -1] }[ev.key];
      if (!m) return;
      ev.preventDefault();
      nudge(m[0], m[1] * step);
    });

    const seg = (sel, fn) => document.querySelectorAll(sel + ' button').forEach((b) => b.addEventListener('click', () => { fn(b.dataset.v); changed(); }));
    seg('#mode', (v) => { state.mode = v; });
    seg('#topmode', (v) => {
      ui.top = v;
      if (v !== 'pulses') setPlaying(false);
    });
    seg('#mapplane', (v) => { ui.map = v; });
    seg('#cutaxis', (v) => { ui.cut = v; });

    $('#decay').addEventListener('change', (ev) => { state.decay = ev.target.checked; changed(); });
    $('#slice-z').addEventListener('input', (ev) => { ui.sliceZ = +ev.target.value; changed(); });
    $('#btn-opt').addEventListener('click', () => {
      const core = computeCore();
      state.dx = r1(core.best.dx);
      state.dy = 0;
      state.dz = r1(core.best.dz);
      state.delay = r1(core.best.delay);
      changed();
    });
    $('#btn-center').addEventListener('click', () => {
      state.dx = 0;
      state.dy = 0;
      state.dz = 0;
      changed();
    });
    $('#btn-play').addEventListener('click', () => setPlaying(!ui.playing));
    $('#t-scrub').addEventListener('input', (ev) => {
      const core = computeCore();
      const tr = timeRange(core.M, topView || computeTopView(core.M, 600, 300));
      ui.t = tr.lo + (+ev.target.value / 1000) * (tr.hi - tr.lo);
      setPlaying(false);
      schedule();
    });

    const presets = $('#presets');
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      b.addEventListener('click', () => {
        const s = clone(p.set);
        Object.assign(state, clone(DEFAULTS), s);
        ui.sliceZ = 0;
        changed();
      });
      presets.appendChild(b);
    });

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = e.borderBoxSize && e.borderBoxSize[0];
        sizes.set(e.target, box ? { width: box.inlineSize, height: box.blockSize } : { width: e.contentRect.width, height: e.contentRect.height });
      }
      changed();
    });
    ['#cv-top', '#cv-xs', '#cv-map', '#ch-delay', '#ch-cut', '#ch-depth'].forEach((s) => ro.observe($(s)));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => {
      readTheme();
      cache.delete('xsImg');
      changed();
    };
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }

  // On phones the readout scrolls away; show the slim bar while it is out of view.
  function watchReadout() {
    if (!('IntersectionObserver' in window)) return;
    const narrow = window.matchMedia('(max-width: 860px)');
    let visible = true;
    const update = () => { $('#mini').hidden = visible || !narrow.matches; };
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      update();
    }).observe($('#readout'));
    if (narrow.addEventListener) narrow.addEventListener('change', update);
  }

  function setPlaying(on) {
    ui.playing = on;
    $('#btn-play').textContent = on ? 'Pause' : 'Play';
    if (on) schedule();
  }

  // ------------------------------------------------------------------- boot

  buildControls();
  readTheme();
  bindInteractions();
  watchReadout();
  changed();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => changed());
})();
