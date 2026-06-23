/* =====================================================================
   app.js - Lógica e interacción de la ruta de aprendizaje de CS-MRI.
   Conecta los módulos dsp / images / recon con la interfaz.
   ===================================================================== */
(function () {
  'use strict';
  const dsp = CS.dsp, IMG = CS.img, REC = CS.recon;
  const N = 256;

  /* ---------------------- Colormap (inferno) ---------------------- */
  const INFERNO = [
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
    [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]
  ];
  function inferno(v) {
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const s = v * (INFERNO.length - 1), i = Math.floor(s), f = s - i;
    const a = INFERNO[i], b = INFERNO[Math.min(i + 1, INFERNO.length - 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  // Mapa cíclico (rueda de tono) para la FASE, que es periódica.
  function hsv2rgb(h) {
    const i = Math.floor(h * 6), f = h * 6 - i, q = 1 - f; let r, g, b;
    switch (((i % 6) + 6) % 6) {
      case 0: r = 1; g = f; b = 0; break; case 1: r = q; g = 1; b = 0; break;
      case 2: r = 0; g = 1; b = f; break; case 3: r = 0; g = q; b = 1; break;
      case 4: r = f; g = 0; b = 1; break; default: r = 1; g = 0; b = q;
    }
    return [r * 255, g * 255, b * 255];
  }

  /* ------------------------- Renderizado ------------------------- */
  // Dibuja un Float64Array (n×n) en un canvas (backing store n×n).
  function render(canvas, data, n, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(n, n), px = out.data;
    let lo = opts.lo, hi = opts.hi;
    if (lo === undefined || hi === undefined) {
      lo = Infinity; hi = -Infinity;
      for (let i = 0; i < data.length; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    const rng = (hi - lo) || 1, g = opts.gamma || 1, cmap = opts.cmap;
    for (let i = 0; i < n * n; i++) {
      let v = (data[i] - lo) / rng; v = v < 0 ? 0 : v > 1 ? 1 : v;
      if (g !== 1) v = Math.pow(v, g);
      let r, gr, b;
      if (cmap) { const c = cmap(v); r = c[0]; gr = c[1]; b = c[2]; } else { r = gr = b = v * 255; }
      const j = i * 4; px[j] = r; px[j + 1] = gr; px[j + 2] = b; px[j + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }
  // espacio-k: 'mag' = log-magnitud (inferno); 'phase' = fase (rueda de tono).
  function renderKspace(canvas, re, im, n, mode) {
    const N2 = n * n;
    if (mode === 'phase') {
      const ctx = canvas.getContext('2d'), out = ctx.createImageData(n, n), px = out.data;
      for (let i = 0; i < N2; i++) {
        const j = i * 4; px[j + 3] = 255;
        if (re[i] === 0 && im[i] === 0) { px[j] = px[j + 1] = px[j + 2] = 0; continue; }
        const c = hsv2rgb((Math.atan2(im[i], re[i]) + Math.PI) / (2 * Math.PI));
        px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2];
      }
      ctx.putImageData(out, 0, 0); return;
    }
    const mag = new Float64Array(N2);
    for (let i = 0; i < N2; i++) mag[i] = Math.log(1 + Math.hypot(re[i], im[i]));
    render(canvas, mag, n, { cmap: inferno });
  }

  /* --------------------------- Imágenes -------------------------- */
  const REG = {
    phantom: { label: 'Fantoma' },
    axial: { label: 'Cerebro · axial', src: 'assets/brain_axial.png' },
    coronal: { label: 'Cerebro · coronal', src: 'assets/brain_coronal.png' }
  };
  function loadPNG(src) {
    return new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
    });
  }
  async function buildImages() {
    REG.phantom.data = IMG.sheppLogan(N);
    for (const k of ['axial', 'coronal']) {
      try { REG[k].data = IMG.loadImageToFloat(await loadPNG(REG[k].src), N); }
      catch (e) { REG[k].data = IMG.sheppLogan(N); } // respaldo si falla la carga
    }
    // cache de espacio-k por imagen
    for (const k in REG) {
      const re = REG[k].data.slice(), im = new Float64Array(N * N);
      dsp.fft2c(re, im, N); REG[k].kRe = re; REG[k].kIm = im;
    }
  }
  const getData = k => REG[k].data;

  /* ----------------------- Botones segmentados ------------------- */
  function seg(container, items, def, onSel) {
    container.innerHTML = '';
    items.forEach(it => {
      const b = document.createElement('button');
      b.textContent = it.label; b.dataset.id = it.id;
      if (it.id === def) b.classList.add('on');
      b.onclick = () => {
        [...container.children].forEach(c => c.classList.remove('on'));
        b.classList.add('on'); onSel(it.id);
      };
      container.appendChild(b);
    });
  }
  const IMGITEMS = Object.keys(REG).map(id => ({ id, label: REG[id].label }));
  const $ = id => document.getElementById(id);

  /* ======================= NAV / PROGRESO ======================= */
  function initRail() {
    const links = [...document.querySelectorAll('#steps a')];
    const map = {}; links.forEach(a => map[a.dataset.step] = a);
    const obs = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) {
        links.forEach(a => a.classList.remove('active'));
        if (map[e.target.id]) map[e.target.id].classList.add('active');
      }});
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('section.step').forEach(s => obs.observe(s));
    const bar = $('railprog');
    addEventListener('scroll', () => {
      const h = document.documentElement;
      const p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
      bar.style.width = (p * 100) + '%';
    }, { passive: true });
  }

  /* ========================== HERO ============================== */
  function initHero() {
    const ref = getData('axial');
    const mask = IMG.variableDensityMask(N, 0.25, 2, 0.02);
    const sim = REC.simulate(ref, mask, N);
    const r = REC.create({ measRe: sim.measRe, measIm: sim.measIm, mask, n: N, levels: 4, lambda: 0.02, ref });
    render($('heroZF'), r.zerofill, N);            // antes (relleno de ceros)
    r.step(40);
    render($('heroCS'), clamp01(r.x), N);          // después (CS)
    // divisor arrastrable
    const wrap = $('heroReveal'), top = $('heroTop'), handle = $('heroHandle');
    function size() { const w = wrap.clientWidth; $('heroZF').style.width = w + 'px'; $('heroZF').style.height = w + 'px'; }
    function setPct(p) { p = Math.max(2, Math.min(98, p)); top.style.width = p + '%'; handle.style.left = p + '%'; }
    function fromEvent(ev) {
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - wrap.getBoundingClientRect().left;
      setPct(100 * x / wrap.clientWidth);
    }
    let drag = false;
    wrap.addEventListener('mousedown', e => { drag = true; fromEvent(e); });
    addEventListener('mousemove', e => { if (drag) fromEvent(e); });
    addEventListener('mouseup', () => drag = false);
    wrap.addEventListener('touchstart', e => { fromEvent(e); }, { passive: true });
    wrap.addEventListener('touchmove', e => { fromEvent(e); }, { passive: true });
    addEventListener('resize', size); size(); setPct(50);
  }
  function clamp01(a) { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] < 0 ? 0 : a[i] > 1 ? 1 : a[i]; return o; }

  /* ====================== PASO 1 - espacio-k ==================== */
  function initStep1() {
    let cur = 'phantom', kmode = 'mag';
    seg($('s1-imgsel'), IMGITEMS, cur, id => { cur = id; redraw(); });
    seg($('s1-kmode'), [{ id: 'mag', label: 'Magnitud' }, { id: 'phase', label: 'Fase' }], kmode, id => { kmode = id; redraw(); });
    $('s1-frac').addEventListener('input', redraw);
    function redraw() {
      const data = getData(cur);
      render($('s1-img'), data, N, { lo: 0, hi: 1 });
      const fracPct = +$('s1-frac').value, frac = fracPct / 100;
      const side = Math.max(2, Math.round(Math.sqrt(frac) * N));
      const lo = (N - side) >> 1, hiIdx = lo + side;
      // espacio-k recortado al centro: así se ve la aceleración (y el efecto de Gibbs)
      const re = REG[cur].kRe.slice(), im = REG[cur].kIm.slice();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (r < lo || r >= hiIdx || c < lo || c >= hiIdx) { re[r * N + c] = 0; im[r * N + c] = 0; }
      }
      renderKspace($('s1-kspace'), re, im, N, kmode);
      $('s1-kspace-cap').textContent = 'espacio-k (' + (kmode === 'phase' ? 'fase' : 'magnitud') + (fracPct < 100 ? ', recortado' : '') + ')';
      dsp.ifft2c(re, im, N);
      const recon = new Float64Array(N * N); for (let i = 0; i < N * N; i++) recon[i] = re[i];
      render($('s1-recon'), clamp01(recon), N, { lo: 0, hi: 1 });
      const accel = (N * N) / (side * side);
      $('s1-frac-val').textContent = fracPct + '%';
      $('s1-speed').textContent = accel.toFixed(1) + '×';
      $('s1-psnr').textContent = fracPct >= 100 ? '∞ dB' : dsp.psnr(data, clamp01(recon), 1).toFixed(1) + ' dB';
      $('s1-recon-cap').textContent = fracPct >= 100 ? 'Reconstruida (completa)' : 'Reconstruida (anillos de Gibbs)';
    }
    redraw();
  }

  /* ====================== PASO 2 - sparsity ==================== */
  function initStep2() {
    let cur = 'axial';
    seg($('s2-imgsel'), IMGITEMS, cur, id => { cur = id; redraw(); });
    $('s2-keep').addEventListener('input', redraw);
    function redraw() {
      const data = getData(cur);
      const keepPct = +$('s2-keep').value, keepFrac = keepPct / 100;
      const coef = data.slice(); dsp.dwt2(coef, N, 4);
      // umbral por rango: conservar los K mayores en magnitud
      const K = Math.max(1, Math.round(keepFrac * N * N));
      const absv = new Float64Array(N * N); for (let i = 0; i < N * N; i++) absv[i] = Math.abs(coef[i]);
      const sorted = Float64Array.from(absv).sort(); // ascendente
      const thr = keepPct >= 100 ? -1 : sorted[N * N - K];
      const kept = coef.slice(), map = new Float64Array(N * N);
      for (let i = 0; i < N * N; i++) {
        if (absv[i] < thr) kept[i] = 0;
        map[i] = Math.log(1 + Math.abs(kept[i]));
      }
      render($('s2-wav'), map, N, { cmap: inferno });
      dsp.idwt2(kept, N, 4);
      render($('s2-img'), clamp01(kept), N, { lo: 0, hi: 1 });
      $('s2-keep-val').textContent = keepPct + '%';
      $('s2-dropped').textContent = (100 - keepPct) + '%';
      $('s2-psnr').textContent = keepPct >= 100 ? '∞ dB' : dsp.psnr(data, clamp01(kept), 1).toFixed(1) + ' dB';
    }
    redraw();
  }

  /* =================== PASO 3 - incoherencia =================== */
  const MASKITEMS = [
    { id: 'vardens', label: 'Densidad variable' },
    { id: 'lines', label: 'Líneas aleatorias' },
    { id: 'uniform', label: 'Líneas regulares' },
    { id: 'radial', label: 'Radial' }
  ];
  function buildMask(type, R) {
    if (type === 'uniform') return IMG.uniformLinesMask(N, R, 12);
    if (type === 'lines') return IMG.randomLinesMask(N, 1 / R, 3, 10);
    if (type === 'radial') return IMG.radialMask(N, Math.max(8, Math.round(256 / R)));
    return IMG.variableDensityMask(N, 1 / R, 2.5, 0.02);
  }
  const MASKNOTE = {
    vardens: 'Aleatorio + denso en el centro: el mejor para CS. El artefacto es ruido <b>incoherente</b> que la reconstrucción puede quitar.',
    lines: 'Líneas de fase aleatorias (Cartesiano real). Incoherente en una dirección: artefacto parecido a ruido.',
    uniform: 'Submuestreo regular: produce <b>fantasmas</b> nítidos (aliasing coherente) imposibles de separar de la anatomía. CS no los puede arreglar.',
    radial: 'Radios que cruzan el centro (no Cartesiano). Muy incoherente: es el esquema del experimento original de Candès–Romberg–Tao.'
  };
  function initStep3() {
    let cur = 'axial', mtype = 'vardens';
    seg($('s3-imgsel'), IMGITEMS, cur, id => { cur = id; redraw(); });
    seg($('s3-masksel'), MASKITEMS, mtype, id => { mtype = id; redraw(); });
    $('s3-accel').addEventListener('input', redraw);
    function redraw() {
      const R = +$('s3-accel').value;
      $('s3-accel-val').textContent = R + '×';
      const mask = buildMask(mtype, R);
      const maskF = new Float64Array(N * N); for (let i = 0; i < N * N; i++) maskF[i] = mask[i];
      render($('s3-mask'), maskF, N, { lo: 0, hi: 1, cmap: inferno });
      // PSF: |IFFT(mask)|
      const pr = maskF.slice(), pi = new Float64Array(N * N); dsp.ifft2c(pr, pi, N);
      const psf = dsp.magnitude(pr, pi); render($('s3-psf'), psf, N, { gamma: 0.35 });
      // imagen con relleno de ceros
      const sim = REC.simulate(getData(cur), mask, N);
      const zr = sim.measRe.slice(), zi = sim.measIm.slice(); dsp.ifft2c(zr, zi, N);
      const zf = new Float64Array(N * N); for (let i = 0; i < N * N; i++) zf[i] = zr[i];
      render($('s3-alias'), clamp01(zf), N, { lo: 0, hi: 1 });
      const frac = IMG.maskFraction(mask) * 100;
      $('s3-info').innerHTML = `Muestreado: <b>${frac.toFixed(0)}%</b> del espacio-k (R≈${(100 / frac).toFixed(1)}×). ${MASKNOTE[mtype]}`;
    }
    redraw();
  }

  /* ============= PASO 4 - recuperación ℓ1 vs ℓ2 (1D) =========== */
  const N1 = 256;
  function fft1(re, im, inv) {
    dsp.fft1d(re, im, dsp.makePlan(re.length), inv);
    if (inv) { const s = 1 / re.length; for (let i = 0; i < re.length; i++) { re[i] *= s; im[i] *= s; } }
  }
  function makeSparse(k) {
    const x = new Float64Array(N1), pos = new Set();
    while (pos.size < k) pos.add((Math.random() * N1) | 0);
    pos.forEach(p => { x[p] = (Math.random() * 1.4 + 0.3) * (Math.random() < 0.5 ? -1 : 1); });
    return x;
  }
  function pickOmega(M) {
    const s = new Set(); while (s.size < M) s.add((Math.random() * N1) | 0); return [...s];
  }
  function recover1D(sig, omega) {
    const Sr = sig.slice(), Si = new Float64Array(N1); fft1(Sr, Si, false);
    const inO = new Uint8Array(N1); omega.forEach(k => inO[k] = 1);
    const yr = new Float64Array(N1), yi = new Float64Array(N1);
    for (const k of omega) { yr[k] = Sr[k]; yi[k] = Si[k]; }
    // ℓ2 (mínima energía): IFFT del espectro con ceros fuera de Ω
    const l2r = yr.slice(), l2i = yi.slice(); fft1(l2r, l2i, true);
    // ℓ1: umbralizado iterativo + consistencia, con continuación de λ
    let xr = l2r.slice(), xi = l2i.slice();
    let mx = 0; for (let i = 0; i < N1; i++) mx = Math.max(mx, Math.hypot(xr[i], xi[i]));
    const iters = 260;
    for (let it = 0; it < iters; it++) {
      const lam = mx * 0.12 * (1 - it / iters) + 1e-4;
      for (let i = 0; i < N1; i++) {
        const m = Math.hypot(xr[i], xi[i]);
        if (m > lam) { const s = (m - lam) / m; xr[i] *= s; xi[i] *= s; } else { xr[i] = 0; xi[i] = 0; }
      }
      const Xr = xr.slice(), Xi = xi.slice(); fft1(Xr, Xi, false);
      for (const k of omega) { Xr[k] = Sr[k]; Xi[k] = Si[k]; }
      fft1(Xr, Xi, true); xr = Xr; xi = Xi;
    }
    return { l2: l2r, l1: xr };
  }
  function relErr(a, b) {
    let n = 0, d = 0; for (let i = 0; i < a.length; i++) { const e = a[i] - b[i]; n += e * e; d += a[i] * a[i]; }
    return Math.sqrt(n / (d || 1));
  }
  function drawPlot(cv, sig, l2, l1) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 18;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#04060c'; ctx.fillRect(0, 0, W, H);
    let mx = 0.6; for (let i = 0; i < N1; i++) mx = Math.max(mx, Math.abs(sig[i]), Math.abs(l1[i]), Math.abs(l2[i]));
    const x = i => pad + (W - 2 * pad) * i / (N1 - 1);
    const y = v => H / 2 - (H / 2 - pad) * (v / mx);
    ctx.strokeStyle = '#22304a'; ctx.beginPath(); ctx.moveTo(pad, H / 2); ctx.lineTo(W - pad, H / 2); ctx.stroke();
    // ℓ2 (rojo, denso)
    ctx.strokeStyle = 'rgba(255,107,107,.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < N1; i++) { const px = x(i), py = y(l2[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
    // señal real (tallos grises)
    ctx.strokeStyle = 'rgba(160,176,200,.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < N1; i++) if (Math.abs(sig[i]) > 1e-6) { ctx.beginPath(); ctx.moveTo(x(i), H / 2); ctx.lineTo(x(i), y(sig[i])); ctx.stroke(); }
    // ℓ1 (puntos azules)
    ctx.fillStyle = '#2fd6c3';
    for (let i = 0; i < N1; i++) if (Math.abs(l1[i]) > 0.03 * mx) { ctx.beginPath(); ctx.arc(x(i), y(l1[i]), 3, 0, 7); ctx.fill(); }
  }
  function initStep4() {
    let sig = makeSparse(8);
    function run() {
      const k = +$('s4-k').value, mPct = +$('s4-m').value, M = Math.max(2, Math.round(mPct / 100 * N1));
      $('s4-k-val').textContent = k; $('s4-m-val').textContent = mPct + '%';
      $('s4-kshow').textContent = k; $('s4-mshow').textContent = mPct + '%';
      const omega = pickOmega(M);
      const { l2, l1 } = recover1D(sig, omega);
      drawPlot($('s4-plot'), sig, l2, l1);
      const e2 = relErr(sig, l2), e1 = relErr(sig, l1);
      $('s4-l2err').textContent = (e2 * 100).toFixed(1) + '%';
      $('s4-l1err').textContent = (e1 * 100).toFixed(1) + '%';
      const ok = e1 < 0.03;
      $('s4-status').textContent = ok ? '✓ ℓ₁ recupera la señal' : (e1 < 0.15 ? '≈ casi (sube las medidas)' : '✗ faltan medidas');
      $('s4-status').style.color = ok ? 'var(--accent)' : (e1 < 0.15 ? 'var(--amber)' : 'var(--bad)');
    }
    $('s4-k').addEventListener('input', () => { sig = makeSparse(+$('s4-k').value); run(); });
    $('s4-m').addEventListener('input', run);
    $('s4-new').addEventListener('click', () => { sig = makeSparse(+$('s4-k').value); run(); });
    run();
  }

  /* ================= PASO 5 - CS-MRI en vivo =================== */
  function initStep5() {
    let cur = 'axial', mtype = 'vardens', anim = null, st = null;
    seg($('s5-imgsel'), IMGITEMS, cur, id => { cur = id; rebuild(); });
    seg($('s5-masksel'), MASKITEMS, mtype, id => { mtype = id; rebuild(); });
    ['s5-accel', 's5-lambda'].forEach(id => $(id).addEventListener('input', () => {
      if (id === 's5-accel') $('s5-accel-val').textContent = $(id).value + '×';
      if (id === 's5-lambda') $('s5-lambda-val').textContent = (+$(id).value / 1000).toFixed(3);
      rebuild();
    }));
    function stop() { if (anim) cancelAnimationFrame(anim); anim = null; $('s5-run').textContent = '▶ Reconstruir'; }
    function rebuild() {
      stop();
      const R = +$('s5-accel').value, lambda = +$('s5-lambda').value / 1000;
      const ref = getData(cur), mask = buildMask(mtype, R);
      const sim = REC.simulate(ref, mask, N);
      st = REC.create({ measRe: sim.measRe, measIm: sim.measIm, mask, n: N, levels: 4, lambda, ref });
      render($('s5-orig'), ref, N, { lo: 0, hi: 1 });
      renderKspace($('s5-kspace'), sim.measRe, sim.measIm, N);
      render($('s5-zf'), clamp01(st.zerofill), N, { lo: 0, hi: 1 });
      render($('s5-cs'), clamp01(st.x), N, { lo: 0, hi: 1 });
      $('s5-zfpsnr').textContent = st.zerofillPSNR.toFixed(1) + ' dB';
      $('s5-cspsnr').textContent = st.psnr().toFixed(1) + ' dB';
      $('s5-bar').style.width = '0%';
      const frac = IMG.maskFraction(mask) * 100;
      $('s5-iter').innerHTML = `Listo · muestreado ${frac.toFixed(0)}% del espacio-k. Pulsa <b>Reconstruir</b>.`;
    }
    const TOTAL = 60;
    function play() {
      $('s5-run').textContent = '⏸ Pausar';
      function frame() {
        st.step(2);
        render($('s5-cs'), clamp01(st.x), N, { lo: 0, hi: 1 });
        $('s5-cspsnr').textContent = st.psnr().toFixed(1) + ' dB';
        const p = Math.min(1, st.iter / TOTAL);
        $('s5-bar').style.width = (p * 100) + '%';
        $('s5-iter').innerHTML = `Iteración <b>${st.iter}</b>/${TOTAL} · disolviendo artefactos…`;
        if (st.iter < TOTAL) { anim = requestAnimationFrame(frame); }
        else { stop(); $('s5-iter').innerHTML = `Listo · <b>${st.iter}</b> iteraciones. PSNR ${st.psnr().toFixed(1)} dB.`; }
      }
      anim = requestAnimationFrame(frame);
    }
    $('s5-run').addEventListener('click', () => {
      if (anim) { stop(); return; }
      if (st.iter >= TOTAL) rebuild();
      play();
    });
    $('s5-reset').addEventListener('click', rebuild);
    rebuild();
  }

  /* ===================== Lightbox (zoom) ====================== */
  function initLightbox() {
    const lb = $('lightbox'), cv = $('lb-cv'), cap = $('lb-cap');
    function open(srcCanvas, caption) {
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(srcCanvas, 0, 0, cv.width, cv.height);
      cap.textContent = caption || '';
      lb.hidden = false;
    }
    const close = () => { lb.hidden = true; };
    document.querySelectorAll('canvas.zoom').forEach(c => {
      c.addEventListener('click', () => {
        const fig = c.closest('figure'), fc = fig && fig.querySelector('figcaption');
        open(c, fc ? fc.textContent.trim() : '');
      });
    });
    $('lb-close').addEventListener('click', close);
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  /* ============================ INIT =========================== */
  async function init() {
    await buildImages();
    $('loadnote').classList.add('done');
    initRail(); initHero();
    initStep1(); initStep2(); initStep3(); initStep4(); initStep5();
    initLightbox();
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();
})();
