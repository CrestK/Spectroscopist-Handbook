/* Find the Overlap: page controller (rendering, hardware controls, rounds, scoreboard). */
(function () {
  'use strict';

  const F = window.FocalOverlap;
  const G = window.OverlapGame;
  const C = F.C;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const LEVEL_KEYS = ['easy', 'medium', 'hard'];

  // ------------------------------------------------------------- storage

  // Scores live in this browser's localStorage. If storage is blocked the board still works
  // for the current visit.
  const SCORE_KEY = 'find-the-overlap.scores.v1';
  const NAME_KEY = 'find-the-overlap.name';
  const LEVEL_KEY = 'find-the-overlap.level';
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
  let memoryScores = null;

  function loadScores() {
    const raw = store.get(SCORE_KEY, null) || memoryScores || {};
    const out = {};
    for (const k of LEVEL_KEYS) {
      out[k] = (Array.isArray(raw[k]) ? raw[k] : [])
        .filter((e) => e && typeof e.name === 'string' && isFinite(e.ms))
        .sort((a, b) => a.ms - b.ms);
    }
    return out;
  }
  function saveScores(scores) {
    memoryScores = scores;
    return store.set(SCORE_KEY, scores);
  }

  // ---------------------------------------------------------------- state

  const S = {
    phase: 'title', // title | play | won | score
    level: G.LEVELS[store.get(LEVEL_KEY, 'medium')] ? store.get(LEVEL_KEY, 'medium') : 'medium',
    round: null,
    prep: null,
    index: 0,
    results: [],
    mirror: { x: 0, y: 0 },
    stage: 0,
    clockStart: 0,
    elapsed: 0,
    running: false,
    lockSince: null,
    meas: null,
    spec: null,
    specAt: 0,
    trend: [],
    savedId: null,
    t0: performance.now(),
  };

  // ------------------------------------------------------------ formatting

  const minus = (s) => s.replace(/^-/, '−');
  function sig(v, n) {
    if (!isFinite(v)) return '–';
    if (v === 0) return '0';
    const d = clamp((n || 3) - 1 - Math.floor(Math.log10(Math.abs(v))), 0, 6);
    return minus(v.toFixed(d));
  }
  function fmtTime(fs) {
    const a = Math.abs(fs);
    if (a < 0.5) return '0 fs';
    if (a >= 1e6) return sig(fs / 1e6) + ' ns';
    if (a >= 1000) return sig(fs / 1000) + ' ps';
    return minus(String(Math.round(fs))) + ' fs';
  }
  const fmtPct = (x) => (x * 100).toFixed(1) + '%';

  // --------------------------------------------------------- beam colours

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
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const k = Math.max(0, 0.26 - lum) * 0.8;
    return c.map((v) => Math.min(1, v + k));
  }
  const cssRGB = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a == null ? 1 : a})`;
  const AMBER = '#ffb21e';
  const TRACE = '#5cc8ff';

  // Lookup table for the soft tone curve used on the beam scenes.
  const TONE_N = 2048;
  const TONE_MAX = 6;
  const TONE = Uint8ClampedArray.from({ length: TONE_N + 1 }, (_, i) => 255 * (1 - Math.exp(-1.35 * (i / TONE_N) * TONE_MAX)));
  const tone = (v) => TONE[v >= TONE_MAX ? TONE_N : ((v / TONE_MAX) * TONE_N) | 0];
  const BG = [5 / 255, 7 / 255, 11 / 255];
  const POP = [1, 0.84, 0.6];

  // --------------------------------------------------------------- canvases

  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: r.width, H: r.height };
  }
  const offscreen = document.createElement('canvas');
  function blit(ctx, img, x, y, w, h) {
    offscreen.width = img.width;
    offscreen.height = img.height;
    offscreen.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, x, y, w, h);
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

  // ------------------------------------------------------------- the round

  function looks() {
    const r = S.round;
    const Imax = 1;
    return { cp: waveRGB(r.pump.lambda), cr: waveRGB(r.probe.lambda), wp: Imax, wr: 0.8 };
  }

  function newRound() {
    S.round = G.makeRound(S.level);
    S.prep = G.prepare(S.round);
    S.mirror = { x: S.round.mirror.start.x, y: S.round.mirror.start.y };
    S.stage = S.round.stage.start;
    S.trend = [];
    S.lockSince = null;
    S.spec = null;
    S.specAt = 0;
    S.meas = G.measure(S.prep, S.mirror, S.stage);
    fields.key = null;
    setupMirror();
    buildStage();
    updateHud();
  }

  function startGame() {
    S.index = 0;
    S.results = [];
    S.savedId = null;
    newRound();
    S.phase = 'play';
    S.clockStart = performance.now();
    S.elapsed = 0;
    S.running = true;
    showOverlay(null);
  }

  function updateHud() {
    const r = S.round;
    const lv = r.level;
    $('#hud-round').textContent = `${Math.min(S.index + 1, G.ROUNDS)} / ${G.ROUNDS}`;
    $('#hud-level').textContent = lv.name;
    const resp = r.levelKey === 'easy' ? 'excited state τ = 4.3 ns' : `Raman bands τ = ${fmtTime(r.lifetime)}`;
    $('#hud-sample').textContent = `${lv.sample} · ${resp} · pulses ${r.pump.fwhm} / ${r.probe.fwhm} fs · θ = ${r.angle}°`;
    $('#key-pump').style.background = cssRGB(waveRGB(r.pump.lambda));
    $('#key-probe').style.background = cssRGB(waveRGB(r.probe.lambda));
    $('#spec-sub').textContent = r.levelKey === 'easy'
      ? 'Coumarin 153 band with the cyclohexane Raman lines on top'
      : 'Stimulated Raman of cyclohexane';
    $('#spec-note').textContent = r.level.targetLine
      ? 'The amber line marks the signal at full overlap. Get the main peak up to it and hold it there.'
      : 'Maximise the bands. There is no target line on hard.';
    $('#mirror-note').textContent = `One knob turn moves the pump ${r.mirror.turn} µm at the sample. Shift + arrow keys for bigger steps.`;
    $('#stage-note').textContent = `Fine step ${Math.round(r.stage.fine * 1000)} µm (${fmtTime(r.stage.fine * G.FS_PER_MM)}). Micrometer: 0.5 mm per turn.`;
  }

  // ---------------------------------------------------------- main scene

  const fields = { key: null };

  function sceneView(W, H) {
    const r = S.round;
    const M = S.prep.M;
    const wComb = Math.hypot(r.pump.w0, r.probe.w0);
    const dx0 = Math.abs(r.mirror.start.x - r.mirror.target.x);
    const Zv = r.L / 2 + Math.max(140, 0.7 * r.L);
    const X = Math.max(2.6 * wComb, dx0 + (1.6 * r.pump.w0) / M.cos, (Zv * H) / W * 0.5);
    return { z0: -Zv, z1: Zv, x0: -X, x1: X };
  }

  function buildFields(view, nx, ny) {
    const M = S.prep.M;
    const key = [S.round.pump.lambda, S.round.probe.w0, S.round.angle, view.z0, view.x1, nx, ny].join('|');
    if (fields.key !== key) {
      const n = nx * ny;
      Object.assign(fields, { key, nx, ny, Ar: new Float32Array(n), Tp: new Float32Array(n), Tz: new Float32Array(n), inside: new Uint8Array(n), pumpKey: null, Ap: new Float32Array(n) });
      for (let j = 0; j < ny; j++) {
        const x = view.x1 - ((j + 0.5) / ny) * (view.x1 - view.x0);
        for (let i = 0; i < nx; i++) {
          const z = view.z0 + ((i + 0.5) / nx) * (view.z1 - view.z0);
          const k = j * nx + i;
          fields.Ar[k] = F.probeSpatial(M, x, 0, z);
          fields.Tp[k] = F.pumpArrival(M, x, z);
          fields.Tz[k] = z / C;
          fields.inside[k] = Math.abs(z) <= S.round.L / 2 ? 1 : 0;
        }
      }
    }
    const dx = S.meas.dx;
    const dy = S.meas.dy;
    const pumpKey = String(dx);
    if (fields.pumpKey !== pumpKey) {
      fields.pumpKey = pumpKey;
      for (let j = 0; j < ny; j++) {
        const x = view.x1 - ((j + 0.5) / ny) * (view.x1 - view.x0);
        for (let i = 0; i < nx; i++) {
          const z = view.z0 + ((i + 0.5) / nx) * (view.z1 - view.z0);
          fields.Ap[j * nx + i] = F.pumpSpatial(M, x, 0, z, dx, 0, 0);
        }
      }
    }
    return fields;
  }

  function renderMain(now) {
    const cv = $('#cv-main');
    const { ctx, W, H } = fitCanvas(cv);
    if (W < 40 || H < 40) return;
    const M = S.prep.M;
    const view = sceneView(W, H);
    const nx = Math.max(80, Math.round(W / 2));
    const ny = Math.max(50, Math.round(H / 2));
    const f = buildFields(view, nx, ny);
    const lk = looks();
    const delay = S.meas.delay;
    // One laser shot every loop: the pump crosses the view, the probe arrives `delay` later.
    const span = (view.z1 - view.z0) / C;
    const pad = 3 * Math.max(M.sPu, M.sPr);
    const tA = view.z0 / C - 0.15 * span - pad;
    const tB = view.z1 / C + 0.15 * span + pad;
    const t = tA + (((now - S.t0) % 2800) / 2800) * (tB - tA);
    const sp2 = 2 * M.sPu * M.sPu;
    const sr2 = 2 * M.sPr * M.sPr;
    const rPeak = S.prep.rPeak || (G.response(S.prep, 0), S.prep.rPeak);
    // The pump is drawn in its own plane; a Y offset only weakens what it shares with the probe.
    const yAtt = Math.exp((-2 * S.meas.dy * S.meas.dy) / (S.round.pump.w0 * S.round.pump.w0 + S.round.probe.w0 * S.round.probe.w0));
    const img = new ImageData(nx, ny);
    const d = img.data;
    for (let k = 0, n = nx * ny; k < n; k++) {
      const ap = f.Ap[k];
      const ar = f.Ar[k];
      const ep = t - f.Tp[k];
      const er = t - delay - f.Tz[k];
      const ip = ap > 1e-4 ? ap * Math.exp(-(ep * ep) / sp2) : 0;
      const ir = ar > 1e-4 ? ar * Math.exp(-(er * er) / sr2) : 0;
      let pop = 0;
      if (f.inside[k] && ap > 1e-4) pop = (ap * F.stepResponse(ep, M.sDrive, M.invT)) / rPeak;
      const inter = pop * ir * yAtt;
      const vp = lk.wp * (0.22 * ap + 1.1 * ip);
      const vr = lk.wr * (0.22 * ar + 1.1 * ir);
      const gl = 2 * inter;
      const pp = 0.32 * pop;
      const tint = f.inside[k] ? 0.03 : 0;
      const o = k * 4;
      d[o] = tone(BG[0] + tint + lk.cp[0] * vp + lk.cr[0] * vr + POP[0] * pp + gl);
      d[o + 1] = tone(BG[1] + tint + lk.cp[1] * vp + lk.cr[1] * vr + POP[1] * pp + gl);
      d[o + 2] = tone(BG[2] + tint * 1.4 + lk.cp[2] * vp + lk.cr[2] * vr + POP[2] * pp + gl);
      d[o + 3] = 255;
    }
    blit(ctx, img, 0, 0, W, H);

    const X = (z) => ((z - view.z0) / (view.z1 - view.z0)) * W;
    const Y = (x) => ((view.x1 - x) / (view.x1 - view.x0)) * H;
    // cuvette walls
    ctx.strokeStyle = 'rgba(190,210,235,0.35)';
    ctx.lineWidth = 1.5;
    for (const z of [-S.round.L / 2, S.round.L / 2]) {
      ctx.beginPath();
      ctx.moveTo(X(z), 0);
      ctx.lineTo(X(z), H);
      ctx.stroke();
    }
    ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(190,210,235,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`SAMPLE · ${S.round.L} µm`, X(0), 8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = cssRGB(lk.cr);
    ctx.fillText('PROBE', 10, Y(0) - F.probeWidth(M, view.z0) * (H / (view.x1 - view.x0)) - 4);
    const pzL = view.z0 + 0.12 * (view.z1 - view.z0);
    const pxL = S.meas.dx + pzL * M.tan + (F.pumpWidth(M, pzL / M.cos) / M.cos) * 1.1;
    if (Y(pxL) > 22 && Y(pxL) < H - 30) {
      ctx.fillStyle = cssRGB(lk.cp);
      ctx.fillText('PUMP', X(pzL), Y(pxL));
    }
    // pump off the top or bottom of the view
    const xc = S.meas.dx;
    if (xc > view.x1 || xc < view.x0) {
      ctx.fillStyle = cssRGB(lk.cp);
      ctx.textAlign = 'center';
      ctx.textBaseline = xc > view.x1 ? 'top' : 'bottom';
      ctx.fillText(xc > view.x1 ? '▲ pump is above the view' : '▼ pump is below the view', W / 2, xc > view.x1 ? 24 : H - 6);
    }
    // scale bar
    const bar = ticks(0, (view.z1 - view.z0) / 4, 1)[1] || 100;
    ctx.strokeStyle = 'rgba(190,210,235,0.5)';
    ctx.fillStyle = 'rgba(190,210,235,0.6)';
    ctx.lineWidth = 2;
    const bx = W - 14 - (bar / (view.z1 - view.z0)) * W;
    ctx.beginPath();
    ctx.moveTo(bx, 14);
    ctx.lineTo(W - 14, 14);
    ctx.stroke();
    ctx.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${bar} µm`, W - 14, 19);
  }

  function renderCard() {
    const cv = $('#cv-card');
    const { ctx, W, H } = fitCanvas(cv);
    if (W < 20) return;
    const r = S.round;
    const M = S.prep.M;
    const wComb = Math.hypot(r.pump.w0, r.probe.w0);
    const off = Math.hypot(r.mirror.start.x - r.mirror.target.x, r.mirror.start.y - r.mirror.target.y);
    const R = Math.max(2.2 * wComb, off + 1.3 * r.pump.w0);
    const n = 72;
    const img = new ImageData(n, n);
    const lk = looks();
    for (let j = 0; j < n; j++) {
      const x = R - ((j + 0.5) / n) * 2 * R;
      for (let i = 0; i < n; i++) {
        const y = -R + ((i + 0.5) / n) * 2 * R;
        const ap = F.pumpSpatial(M, x, y, 0, S.meas.dx, S.meas.dy, 0);
        const ar = F.probeSpatial(M, x, y, 0);
        const o = (j * n + i) * 4;
        img.data[o] = tone(BG[0] + 0.9 * (lk.cp[0] * ap + lk.cr[0] * ar));
        img.data[o + 1] = tone(BG[1] + 0.9 * (lk.cp[1] * ap + lk.cr[1] * ar));
        img.data[o + 2] = tone(BG[2] + 0.9 * (lk.cp[2] * ap + lk.cr[2] * ar));
        img.data[o + 3] = 255;
      }
    }
    blit(ctx, img, 0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }

  // ----------------------------------------------------------- spectrometer

  const NU = Float64Array.from({ length: 751 }, (_, i) => 200 + i * 2);
  const SPEC_PAD = { l: 38, r: 14, t: 24, b: 30 };
  const Y_MAX = 12;

  function renderSpec(now) {
    const cv = $('#cv-spec');
    const { ctx, W, H } = fitCanvas(cv);
    const rect = { x: SPEC_PAD.l, y: SPEC_PAD.t, w: W - SPEC_PAD.l - SPEC_PAD.r, h: H - SPEC_PAD.t - SPEC_PAD.b };
    if (rect.w < 40 || !S.spec) return;
    const X = (nu) => rect.x + ((nu - 200) / 1500) * rect.w;
    const Y = (v) => rect.y + (1 - clamp(v, -1, Y_MAX) / Y_MAX) * rect.h;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.lineWidth = 1;
    for (const v of [0, 2, 4, 6, 8, 10, 12]) {
      ctx.strokeStyle = v === 0 ? '#34404f' : '#1a222d';
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(Y(v)) + 0.5);
      ctx.lineTo(rect.x + rect.w, Math.round(Y(v)) + 0.5);
      ctx.stroke();
      ctx.fillStyle = '#7f8a9c';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v), rect.x - 6, Y(v));
    }
    ctx.textBaseline = 'top';
    for (let v = 200; v <= 1700; v += 300) {
      ctx.textAlign = v === 200 ? 'left' : v === 1700 ? 'right' : 'center';
      ctx.fillText(String(v), X(v), rect.y + rect.h + 6);
    }
    ctx.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillStyle = '#b6c0ce';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Raman shift (cm⁻¹)', rect.x + rect.w, H - 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('mOD', 4, 3);

    if (S.round.level.targetLine) {
      ctx.strokeStyle = 'rgba(255,178,30,0.75)';
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(Y(G.FULL_SIGNAL)) + 0.5);
      ctx.lineTo(rect.x + rect.w, Math.round(Y(G.FULL_SIGNAL)) + 0.5);
      ctx.stroke();
      ctx.fillStyle = AMBER;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = '10.5px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillText('full overlap', rect.x + rect.w - 2, Y(G.FULL_SIGNAL) - 2);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y - 2, rect.w, rect.h + 4);
    ctx.clip();
    ctx.strokeStyle = TRACE;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const y = S.spec.y;
    for (let i = 0; i < NU.length; i++) {
      const px = X(NU[i]);
      const py = Y(y[i]);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#7f8a9c';
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const b of [801, 1028, 1266, 1444]) ctx.fillText(String(b), X(b), rect.y - 4);
    if (S.round.levelKey === 'easy') ctx.fillText('C153', X(G.DYE_BAND.center), rect.y - 4);

    // lock-in progress
    if (S.lockSince !== null && S.phase === 'play') {
      const p = clamp((now - S.lockSince) / LOCK_MS, 0, 1);
      const cx = rect.x + rect.w - 22;
      const cy = rect.y + 40;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#263142';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = '#3ddc84';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p);
      ctx.stroke();
      ctx.fillStyle = '#3ddc84';
      ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('LOCKING', cx - 18, cy);
    }
  }

  function renderTrend(now) {
    const cv = $('#cv-trend');
    const { ctx, W, H } = fitCanvas(cv);
    const pad = { l: 38, r: 10, t: 8, b: 8 };
    const w = W - pad.l - pad.r;
    const h = H - pad.t - pad.b;
    ctx.clearRect(0, 0, W, H);
    const span = 20000;
    const X = (t) => pad.l + (1 - (now - t) / span) * w;
    const Y = (v) => pad.t + (1 - clamp(v, 0, Y_MAX) / Y_MAX) * h;
    ctx.strokeStyle = '#1a222d';
    ctx.lineWidth = 1;
    for (const v of [0, 6, 12]) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Math.round(Y(v)) + 0.5);
      ctx.lineTo(pad.l + w, Math.round(Y(v)) + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#7f8a9c';
    ctx.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('12', pad.l - 6, Y(12));
    ctx.fillText('0', pad.l - 6, Y(0));
    const pts = S.trend.filter((p) => now - p.t <= span);
    if (pts.length > 1) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
      ctx.lineTo(X(pts[pts.length - 1].t), Y(0));
      ctx.lineTo(X(pts[0].t), Y(0));
      ctx.closePath();
      ctx.fillStyle = 'rgba(92,200,255,0.1)';
      ctx.fill();
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
      ctx.strokeStyle = TRACE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const last = pts[pts.length - 1];
      ctx.fillStyle = TRACE;
      ctx.strokeStyle = '#070a0f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(last.t), Y(last.v), 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#7f8a9c';
    ctx.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Main peak, last 20 s', pad.l + 6, pad.t + 2);
  }

  // ---------------------------------------------------------------- mirror

  function setupMirror() {
    const R = S.round.mirror.R;
    for (const ax of ['x', 'y']) {
      const sl = $('#sl-' + ax);
      sl.min = String(-R);
      sl.max = String(R);
      sl.step = '0.1';
    }
    const col = cssRGB(waveRGB(S.round.pump.lambda));
    $('#mirror-spot').setAttribute('fill', col);
    $('#mirror-spot-glow').setAttribute('fill', col);
  }

  function moveMirror(ax, delta) {
    if (S.phase !== 'play') return;
    const R = S.round.mirror.R;
    S.mirror[ax] = Math.round(clamp(S.mirror[ax] + delta, -R, R) * 100) / 100;
  }

  function updateMirrorGraphics() {
    const r = S.round;
    const turn = r.mirror.turn;
    for (const ax of ['x', 'y']) {
      const deg = (S.mirror[ax] / turn) * 360;
      document.querySelector(`#knob-${ax} .knob-rot`).setAttribute('transform', `rotate(${deg.toFixed(1)})`);
      const sl = $('#sl-' + ax);
      if (document.activeElement !== sl) sl.value = String(S.mirror[ax]);
      document.querySelector(`#knob-${ax}`).setAttribute('aria-valuetext', `${ax.toUpperCase()} tilt ${S.mirror[ax].toFixed(1)}`);
    }
    const R = r.mirror.R;
    const cx = 115 + (S.mirror.x / R) * 30;
    const cy = 105 - (S.mirror.y / R) * 30;
    for (const id of ['#mirror-spot', '#mirror-spot-glow']) {
      $(id).setAttribute('cx', cx.toFixed(1));
      $(id).setAttribute('cy', cy.toFixed(1));
    }
  }

  // Drag a knob up/right to turn it clockwise; the wheel and arrow keys also turn it.
  function bindKnob(el, onTurn) {
    let last = null;
    el.addEventListener('pointerdown', (ev) => {
      el.setPointerCapture(ev.pointerId);
      last = { x: ev.clientX, y: ev.clientY };
      if (el.focus) el.focus({ preventScroll: true });
      ev.preventDefault();
    });
    el.addEventListener('pointermove', (ev) => {
      if (!last || !el.hasPointerCapture(ev.pointerId)) return;
      const d = (ev.clientX - last.x - (ev.clientY - last.y)) * 1.5;
      last = { x: ev.clientX, y: ev.clientY };
      onTurn(d);
    });
    const end = () => { last = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      onTurn((ev.deltaY < 0 ? 1 : -1) * (ev.shiftKey ? 60 : 8));
    }, { passive: false });
    el.addEventListener('keydown', (ev) => {
      const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key];
      if (!dir) return;
      ev.preventDefault();
      onTurn(dir * (ev.shiftKey ? 100 : 10));
    });
  }

  function drawKnurls() {
    document.querySelectorAll('.knurl').forEach((g) => {
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * 2 * Math.PI;
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', (21 * Math.cos(a)).toFixed(2));
        l.setAttribute('y1', (21 * Math.sin(a)).toFixed(2));
        l.setAttribute('x2', (24 * Math.cos(a)).toFixed(2));
        l.setAttribute('y2', (24 * Math.sin(a)).toFixed(2));
        g.appendChild(l);
      }
    });
  }

  // ------------------------------------------------------------ delay stage

  const SV = 'http://www.w3.org/2000/svg';
  const RAIL = { x0: 40, x1: 540 };
  const stageX = (mm) => RAIL.x0 + (mm / S.round.stage.travel) * (RAIL.x1 - RAIL.x0);

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SV, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function buildStage() {
    const svg = $('#stage-svg');
    svg.textContent = '';
    const st = S.round.stage;
    const defs = el('defs', {}, svg);
    const grad = el('linearGradient', { id: 'anod2', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#28303c' }, grad);
    el('stop', { offset: '1', 'stop-color': '#141920' }, grad);
    const beamCol = cssRGB(waveRGB(S.round.pump.lambda), 0.85);

    el('rect', { x: 14, y: 62, width: 560, height: 86, rx: 8, fill: 'url(#anod2)', stroke: '#313a48' }, svg);
    el('rect', { x: 30, y: 98, width: 520, height: 10, rx: 3, fill: '#2b3340', stroke: '#3a4454' }, svg);
    // millimetre scale
    const major = st.travel <= 10 ? 1 : 5;
    const minor = st.travel <= 10 ? 0.5 : 1;
    for (let v = 0; v <= st.travel + 1e-9; v += minor) {
      const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      el('line', { x1: stageX(v), x2: stageX(v), y1: 112, y2: isMajor ? 122 : 117, stroke: '#7f8a9c', 'stroke-width': 1 }, svg);
      if (isMajor) {
        const t = el('text', { x: stageX(v), y: 138, 'text-anchor': 'middle', fill: '#9aa5b5', 'font-size': 14, 'font-family': 'IBM Plex Mono, monospace' }, svg);
        t.textContent = String(v);
      }
    }
    const unit = el('text', { x: 552, y: 138, fill: '#9aa5b5', 'font-size': 14, 'font-family': 'IBM Plex Mono, monospace' }, svg);
    unit.textContent = 'mm';
    // ruler estimate of time zero
    const r0 = stageX(st.ruler.center - st.ruler.half);
    const r1 = stageX(st.ruler.center + st.ruler.half);
    el('rect', { x: r0, y: 92, width: Math.max(2, r1 - r0), height: 22, fill: 'rgba(255,178,30,0.14)', stroke: 'rgba(255,178,30,0.7)', rx: 2 }, svg);
    const rl = el('text', { x: clamp((r0 + r1) / 2, 170, 420), y: 164, 'text-anchor': 'middle', fill: AMBER, 'font-size': 14, 'font-family': 'IBM Plex Sans, sans-serif' }, svg);
    rl.textContent = `ruler estimate of time zero: ${st.ruler.center.toFixed(2)} ± ${st.ruler.half} mm`;

    // beam to and from the retroreflector
    const beams = el('g', { id: 'stage-beams' }, svg);
    el('line', { id: 'beam-in', x1: 0, y1: 26, x2: 0, y2: 26, stroke: beamCol, 'stroke-width': 2.5 }, beams);
    el('line', { id: 'beam-out', x1: 0, y1: 46, x2: 0, y2: 46, stroke: beamCol, 'stroke-width': 2.5 }, beams);
    el('line', { id: 'beam-mid', x1: 0, y1: 26, x2: 0, y2: 46, stroke: beamCol, 'stroke-width': 2.5 }, beams);

    // carriage with a hollow roof retroreflector
    const car = el('g', { class: 'carriage', id: 'carriage', tabindex: 0, role: 'slider', 'aria-label': 'Delay stage carriage' }, svg);
    el('rect', { x: -36, y: 70, width: 72, height: 42, rx: 6, fill: '#2a323e', stroke: '#4a5566', 'stroke-width': 1.5 }, car);
    el('rect', { x: -6, y: 14, width: 30, height: 58, rx: 4, fill: '#1b2129', stroke: '#4a5566' }, car);
    el('polyline', { points: '2,18 20,36 2,54', fill: 'none', stroke: '#c9d2de', 'stroke-width': 3, 'stroke-linejoin': 'round' }, car);
    el('circle', { cx: -22, cy: 91, r: 3, fill: '#0d1117' }, car);
    el('circle', { cx: 22, cy: 91, r: 3, fill: '#0d1117' }, car);

    // micrometer
    el('rect', { x: 576, y: 92, width: 30, height: 22, rx: 3, fill: '#8d97a6' }, svg);
    el('line', { x1: 548, y1: 103, x2: 576, y2: 103, stroke: '#8d97a6', 'stroke-width': 4 }, svg);
    const mic = el('g', { class: 'knob', id: 'micrometer', transform: 'translate(630 103)', tabindex: 0, role: 'slider', 'aria-label': 'Micrometer, fine delay' }, svg);
    el('circle', { class: 'knob-body', r: 24 }, mic);
    const rot = el('g', { class: 'knob-rot' }, mic);
    const kn = el('g', { class: 'knurl' }, rot);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * 2 * Math.PI;
      el('line', { x1: 21 * Math.cos(a), y1: 21 * Math.sin(a), x2: 24 * Math.cos(a), y2: 24 * Math.sin(a) }, kn);
    }
    el('line', { class: 'knob-mark', x1: 0, y1: -4, x2: 0, y2: -19 }, rot);
    const ml = el('text', { x: 630, y: 146, class: 'lbl' }, svg);
    ml.textContent = 'fine';

    bindCarriage(car, svg);
    bindKnob(mic, (deg) => moveStage((deg / 360) * 0.5));
    updateStageGraphics();
  }

  function moveStage(deltaMm) {
    if (S.phase !== 'play') return;
    S.stage = Math.round(clamp(S.stage + deltaMm, 0, S.round.stage.travel) * 1e4) / 1e4;
  }

  function svgPoint(svg, ev) {
    const p = svg.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  function bindCarriage(car, svg) {
    let grab = null;
    car.addEventListener('pointerdown', (ev) => {
      car.setPointerCapture(ev.pointerId);
      grab = svgPoint(svg, ev).x - stageX(S.stage);
      if (car.focus) car.focus({ preventScroll: true });
      ev.preventDefault();
    });
    car.addEventListener('pointermove', (ev) => {
      if (grab === null || !car.hasPointerCapture(ev.pointerId) || S.phase !== 'play') return;
      const x = svgPoint(svg, ev).x - grab;
      S.stage = Math.round(clamp(((x - RAIL.x0) / (RAIL.x1 - RAIL.x0)) * S.round.stage.travel, 0, S.round.stage.travel) * 1e4) / 1e4;
    });
    const end = () => { grab = null; };
    car.addEventListener('pointerup', end);
    car.addEventListener('pointercancel', end);
    car.addEventListener('keydown', (ev) => {
      const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key];
      if (!dir) return;
      ev.preventDefault();
      moveStage(dir * S.round.stage.fine * (ev.shiftKey ? 100 : 10));
    });
  }

  function updateStageGraphics() {
    const x = stageX(S.stage);
    const car = $('#carriage');
    if (!car) return;
    car.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    car.setAttribute('aria-valuetext', `${S.stage.toFixed(3)} mm`);
    const tip = x + 11;
    $('#beam-in').setAttribute('x2', tip.toFixed(2));
    $('#beam-out').setAttribute('x2', tip.toFixed(2));
    $('#beam-mid').setAttribute('x1', tip.toFixed(2));
    $('#beam-mid').setAttribute('x2', tip.toFixed(2));
    $('#micrometer .knob-rot').setAttribute('transform', `rotate(${(((S.stage % 0.5) / 0.5) * 360).toFixed(1)})`);
    $('#stage-readout').innerHTML = `${S.stage.toFixed(3)} <small>mm</small>`;
  }

  // ------------------------------------------------------------- the loop

  const LOCK_MS = 700;

  function frame(now) {
    if (S.round) {
      S.meas = G.measure(S.prep, S.mirror, S.stage);
      if (S.running) S.elapsed = now - S.clockStart;
      if (S.phase === 'play') {
        if (S.meas.overlap >= G.WIN) {
          if (S.lockSince === null) S.lockSince = now;
          else if (now - S.lockSince >= LOCK_MS) win(now);
        } else {
          S.lockSince = null;
        }
      }
      if (!S.spec || now - S.specAt > 80) {
        S.spec = G.spectrum(S.prep, S.meas, NU, Math.random);
        S.specAt = now;
        S.trend.push({ t: now, v: S.spec.peak + G.NOISE * (Math.random() + Math.random() - 1) });
        while (S.trend.length && now - S.trend[0].t > 21000) S.trend.shift();
      }
      renderMain(now);
      renderCard();
      renderSpec(now);
      renderTrend(now);
      updateMirrorGraphics();
      updateStageGraphics();
      $('#hud-clock').textContent = G.fmtClock(S.phase === 'play' || S.phase === 'won' ? S.elapsed : 0);
    }
    requestAnimationFrame(frame);
  }

  // --------------------------------------------------------------- rounds

  function win(now) {
    S.phase = 'won';
    S.running = false;
    S.elapsed = now - S.clockStart;
    const res = {
      ms: S.elapsed,
      overlap: S.meas.overlap,
      delay: S.meas.delay,
      dx: S.meas.dx,
      dy: S.meas.dy,
      round: S.round,
      prep: S.prep,
    };
    S.results.push(res);
    showWin(res);
  }

  function showWin(res) {
    const r = res.round;
    const last = S.index + 1 >= G.ROUNDS;
    $('#win-eyebrow').textContent = `Beam ${S.index + 1} of ${G.ROUNDS} · overlap locked`;
    $('#win-title').textContent = `${fmtPct(res.overlap)} overlap in ${G.fmtClock(res.ms)}`;
    const facts = $('#win-facts');
    facts.textContent = '';
    const add = (label, text) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = label + ' ';
      li.append(b, document.createTextNode(text));
      facts.appendChild(li);
    };
    add('Timing:', `the probe arrived ${fmtTime(Math.abs(res.delay))} ${res.delay >= 0 ? 'after' : 'before'} the pump.`);
    add('Position:', `pump within ${Math.hypot(res.dx, res.dy).toFixed(1)} µm of the probe (beams ${r.pump.w0} µm and ${r.probe.w0} µm, crossing at ${r.angle}°).`);
    if (r.levelKey === 'easy') {
      add('Lifetime:', 'Coumarin 153 stays excited for 4.3 ns, so on this time axis the response never decays. The cyclohexane lines only show up within a few ps of time zero.');
    } else {
      const w = G.bandWidth(r.lifetime);
      add('Lifetime:', `the 801 cm⁻¹ band is ${w.toFixed(1)} cm⁻¹ wide, so its coherence lives τ = 1/(πcΔν) = ${fmtTime(r.lifetime)}. Broader bands mean shorter lifetimes and a narrower window in time.`);
    }
    $('#btn-next').textContent = last ? 'See your score' : 'Next beam';
    showOverlay('#ov-win');
    animateReward(res);
  }

  function animateReward(res) {
    const t0 = performance.now();
    const step = (now) => {
      if (S.phase !== 'won') return;
      const p = clamp((now - t0) / 1600, 0, 1);
      drawReward(res, 1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function drawReward(res, reveal) {
    const cv = $('#cv-reward');
    const { ctx, W, H } = fitCanvas(cv);
    const prep = res.prep;
    const r = res.round;
    const M = prep.M;
    const d = res.delay;
    const sMax = Math.max(M.sPu, M.sPr);
    const lo = Math.min(-4 * sMax, d - 4 * M.sPr) - 40;
    const tail = r.levelKey === 'easy' ? 1500 : 4 * r.lifetime;
    const hi = Math.max(d + 4 * M.sPr, tail, 4 * sMax);
    const pad = { l: 16, r: 16, t: 18, b: 30 };
    const w = W - pad.l - pad.r;
    const h = H - pad.t - pad.b;
    const X = (t) => pad.l + ((t - lo) / (hi - lo)) * w;
    const Y = (v) => pad.t + (1 - v / 1.1) * h;
    ctx.clearRect(0, 0, W, H);
    const tu = hi - lo > 4000 ? { div: 1000, unit: 'ps' } : { div: 1, unit: 'fs' };
    ctx.strokeStyle = '#1a222d';
    ctx.fillStyle = '#7f8a9c';
    ctx.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of ticks(lo, hi, Math.max(3, Math.floor(w / 90)))) {
      ctx.beginPath();
      ctx.moveTo(Math.round(X(v)) + 0.5, pad.t);
      ctx.lineTo(Math.round(X(v)) + 0.5, pad.t + h);
      ctx.stroke();
      ctx.fillText(minus(String(Number((v / tu.div).toPrecision(6)))), X(v), pad.t + h + 6);
    }
    ctx.strokeStyle = '#34404f';
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(0) + 0.5);
    ctx.lineTo(pad.l + w, Y(0) + 0.5);
    ctx.stroke();
    ctx.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#b6c0ce';
    ctx.fillText(`time after the pump (${tu.unit})`, pad.l + w, H - 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, 0, w * reveal, H);
    ctx.clip();
    const N = 400;
    const curve = (fn, stroke, fill) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = lo + ((hi - lo) * i) / N;
        const v = fn(t);
        if (i) ctx.lineTo(X(t), Y(v));
        else ctx.moveTo(X(t), Y(v));
      }
      if (fill) {
        ctx.lineTo(X(hi), Y(0));
        ctx.lineTo(X(lo), Y(0));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const t = lo + ((hi - lo) * i) / N;
          if (i) ctx.lineTo(X(t), Y(fn(t)));
          else ctx.moveTo(X(t), Y(fn(t)));
        }
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    const cp = waveRGB(r.pump.lambda);
    const cr = waveRGB(r.probe.lambda);
    curve((t) => G.response(prep, t), AMBER, 'rgba(255,178,30,0.12)');
    curve((t) => Math.exp(-(t * t) / (2 * M.sPu * M.sPu)), cssRGB(cp), cssRGB(cp, 0.18));
    curve((t) => Math.exp(-((t - d) * (t - d)) / (2 * M.sPr * M.sPr)), cssRGB(cr), cssRGB(cr, 0.18));
    ctx.restore();

    if (reveal > 0.98) {
      ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      ctx.fillStyle = cssRGB(cp);
      ctx.fillText('PUMP', X(0), Y(1.02));
      ctx.fillStyle = cssRGB(cr);
      ctx.fillText('PROBE', X(d), Y(1.02) - (Math.abs(X(d) - X(0)) < 50 ? 14 : 0));
      ctx.fillStyle = AMBER;
      ctx.textAlign = 'left';
      const tl = r.levelKey === 'easy' ? Math.min(hi * 0.55, hi - 200) : Math.min(hi * 0.6, 1.2 * r.lifetime + 2 * M.sDrive);
      const label = r.levelKey === 'easy' ? 'C153 RESPONSE · τ = 4.3 ns' : `RAMAN RESPONSE · τ = ${fmtTime(r.lifetime).toUpperCase()}`;
      ctx.fillText(label, X(tl) + 6, Y(G.response(prep, tl)) - 4);
    }
  }

  function nextRound() {
    if (S.index + 1 >= G.ROUNDS) {
      showScore();
      return;
    }
    S.index += 1;
    newRound();
    S.phase = 'play';
    S.clockStart = performance.now();
    S.elapsed = 0;
    S.running = true;
    showOverlay(null);
  }

  // ------------------------------------------------------------ scoreboard

  const totalMs = () => S.results.reduce((a, r) => a + r.ms, 0);

  function showScore() {
    S.phase = 'score';
    const lv = G.LEVELS[S.level];
    $('#score-eyebrow').textContent = `${lv.name} · ${G.ROUNDS} beams aligned`;
    $('#score-total').textContent = G.fmtClock(totalMs());
    const rows = $('#score-rows');
    rows.textContent = '';
    S.results.forEach((res, i) => {
      const tr = document.createElement('tr');
      const resp = res.round.levelKey === 'easy' ? 'C153, 4.3 ns' : `Raman bands, ${fmtTime(res.round.lifetime)}`;
      [String(i + 1), resp, fmtPct(res.overlap), G.fmtClock(res.ms)].forEach((txt, k) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (k >= 2) td.className = 'num';
        tr.appendChild(td);
      });
      rows.appendChild(tr);
    });
    const scores = loadScores()[S.level];
    const isBest = !scores.length || totalMs() < scores[0].ms;
    $('#score-badge').hidden = !isBest;
    $('#score-best').textContent = scores.length ? `Best on this browser: ${G.fmtClock(scores[0].ms)} by ${scores[0].name}.` : 'First score on this browser for this level.';
    $('#score-best').hidden = false;
    $('#player-name').value = store.get(NAME_KEY, '') || '';
    $('#save-form').hidden = false;
    $('#save-note').textContent = 'Scores are kept in this browser only.';
    S.savedId = null;
    renderBoard('#score-board', '#score-board-h');
    showOverlay('#ov-score');
    $('#player-name').focus({ preventScroll: true });
  }

  function saveScore(name) {
    const scores = loadScores();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: name.slice(0, 24),
      ms: Math.round(totalMs()),
      date: new Date().toISOString(),
      overlaps: S.results.map((r) => Math.round(r.overlap * 1000) / 10),
    };
    scores[S.level].push(entry);
    scores[S.level].sort((a, b) => a.ms - b.ms);
    scores[S.level] = scores[S.level].slice(0, 100);
    const ok = saveScores(scores);
    store.set(NAME_KEY, entry.name);
    S.savedId = entry.id;
    const rank = scores[S.level].findIndex((e) => e.id === entry.id) + 1;
    $('#save-form').hidden = true;
    $('#score-best').textContent = rank > 0
      ? `Saved: ${entry.name} is #${rank} of ${scores[S.level].length} on ${G.LEVELS[S.level].name}.`
      : 'Saved.';
    if (!ok) $('#score-best').textContent += ' This browser is blocking storage, so the board resets when you leave.';
    renderBoard('#score-board', '#score-board-h');
  }

  function renderBoard(bodySel, headSel) {
    const list = loadScores()[S.level];
    $(headSel).textContent = `Scoreboard · ${G.LEVELS[S.level].name}`;
    const body = $(bodySel);
    body.textContent = '';
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'empty';
      td.textContent = 'No scores yet. Play a game to set the first one.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    list.slice(0, 10).forEach((e, i) => {
      const tr = document.createElement('tr');
      if (e.id && e.id === S.savedId) tr.className = 'me';
      const date = new Date(e.date);
      [String(i + 1), e.name, G.fmtClock(e.ms), isNaN(date) ? '' : date.toLocaleDateString()].forEach((txt, k) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (k === 0 || k === 2) td.className = 'num';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function refreshTitle() {
    document.querySelectorAll('#levels .level').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.level === S.level));
      const best = loadScores()[b.dataset.level][0];
      $('#best-' + b.dataset.level).textContent = best ? `Best: ${G.fmtClock(best.ms)} · ${best.name}` : 'No best time yet';
    });
    renderBoard('#title-board', '#title-board-h');
    const clr = $('#btn-clear');
    clr.classList.remove('armed');
    clr.textContent = 'Clear scoreboard';
  }

  function toTitle() {
    S.phase = 'title';
    S.running = false;
    S.elapsed = 0;
    newRound();
    refreshTitle();
    showOverlay('#ov-title');
  }

  function showOverlay(sel) {
    for (const id of ['#ov-title', '#ov-win', '#ov-score']) $(id).hidden = id !== sel;
    if (sel === '#ov-title') $('#btn-play').focus({ preventScroll: true });
    if (sel === '#ov-win') $('#btn-next').focus({ preventScroll: true });
  }

  // ------------------------------------------------------------- wiring

  function bind() {
    drawKnurls();
    bindKnob($('#knob-x'), (deg) => moveMirror('x', (deg / 360) * S.round.mirror.turn));
    bindKnob($('#knob-y'), (deg) => moveMirror('y', (deg / 360) * S.round.mirror.turn));
    for (const ax of ['x', 'y']) {
      $('#sl-' + ax).addEventListener('input', (ev) => {
        if (S.phase !== 'play') return;
        S.mirror[ax] = +ev.target.value;
      });
    }
    document.querySelectorAll('[data-axis]').forEach((b) => b.addEventListener('click', (ev) => {
      const k = ev.shiftKey ? 10 : 1;
      moveMirror(b.dataset.axis, (+b.dataset.dir * k * S.round.mirror.turn) / 36);
    }));
    document.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => {
      moveStage(+b.dataset.stage * S.round.stage.fine);
    }));
    document.querySelectorAll('#levels .level').forEach((b) => b.addEventListener('click', () => {
      S.level = b.dataset.level;
      store.set(LEVEL_KEY, S.level);
      newRound();
      refreshTitle();
    }));
    $('#btn-play').addEventListener('click', startGame);
    $('#btn-next').addEventListener('click', nextRound);
    $('#btn-again').addEventListener('click', startGame);
    $('#btn-menu').addEventListener('click', toTitle);
    $('#btn-quit').addEventListener('click', toTitle);
    $('#save-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = $('#player-name').value.trim();
      if (!name) {
        $('#save-note').textContent = 'Enter a name to save your score.';
        $('#player-name').focus();
        return;
      }
      saveScore(name);
    });
    $('#btn-clear').addEventListener('click', (ev) => {
      const b = ev.currentTarget;
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = `Click again to clear ${G.LEVELS[S.level].name}`;
        return;
      }
      const scores = loadScores();
      scores[S.level] = [];
      saveScores(scores);
      refreshTitle();
    });
  }

  bind();
  toTitle();
  // Open the page with #debug to inspect the game state from the console.
  if (location.hash === '#debug') window.findOverlapDebug = { S, G };
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fields.key = null; });
})();
