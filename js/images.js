/* =====================================================================
   images.js — Imágenes de prueba y máscaras de muestreo del k-espacio.

     · sheppLogan(n)          fantoma de Shepp–Logan (dominio público)
     · loadImageToFloat(...)  carga una imagen real a Float64Array [0,1]
     · máscaras de submuestreo del k-espacio:
         variableDensityMask  (densidad variable 2D — el caso ideal de CS)
         randomLinesMask      (líneas de fase aleatorias — Cartesiano real)
         uniformLinesMask     (líneas equiespaciadas — produce "fantasmas")
         radialMask           (radios — adquisición no Cartesiana)

   Las máscaras devuelven Uint8Array(n*n): 1 = muestreado, 0 = no medido,
   con el centro del k-espacio (DC) en el centro del array.
   ===================================================================== */
(function (global) {
  'use strict';

  /* --------------------- Fantoma de Shepp–Logan -------------------- */
  // Elipses (Toft, modificadas para mejor contraste): A, a, b, x0, y0, phi°.
  const SL = [
    [1.0, 0.69, 0.92, 0, 0, 0], [-0.8, 0.6624, 0.874, 0, -0.0184, 0],
    [-0.2, 0.11, 0.31, 0.22, 0, -18], [-0.2, 0.16, 0.41, -0.22, 0, 18],
    [0.1, 0.21, 0.25, 0, 0.35, 0], [0.1, 0.046, 0.046, 0, 0.1, 0],
    [0.1, 0.046, 0.046, 0, -0.1, 0], [0.1, 0.046, 0.023, -0.08, -0.605, 0],
    [0.1, 0.023, 0.023, 0, -0.606, 0], [0.1, 0.023, 0.046, 0.06, -0.605, 0]
  ];
  function sheppLogan(n) {
    const a = new Float64Array(n * n);
    for (let r = 0; r < n; r++) {
      const y = (n / 2 - r) / (n / 2);
      for (let c = 0; c < n; c++) {
        const x = (c - n / 2) / (n / 2);
        let v = 0;
        for (let e = 0; e < SL.length; e++) {
          const A = SL[e][0], aa = SL[e][1], bb = SL[e][2], x0 = SL[e][3], y0 = SL[e][4];
          const t = SL[e][5] * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
          const xr = (x - x0) * ct + (y - y0) * st;
          const yr = -(x - x0) * st + (y - y0) * ct;
          if ((xr * xr) / (aa * aa) + (yr * yr) / (bb * bb) <= 1) v += A;
        }
        a[r * n + c] = v < 0 ? 0 : (v > 1 ? 1 : v);
      }
    }
    return a;
  }

  /* ----------------------- Carga de imagen real -------------------- */
  // Dibuja `img` (HTMLImageElement ya cargada) en un canvas n×n y devuelve
  // su luminancia normalizada a [0,1] como Float64Array.
  function loadImageToFloat(img, n) {
    const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    const out = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return out;
  }

  /* --------------------------- Máscaras ---------------------------- */
  // Distancia radial normalizada (0 en el centro, 1 en el borde).
  function radius(n, r, c) {
    const dx = (c - n / 2) / (n / 2), dy = (r - n / 2) / (n / 2);
    return Math.min(1, Math.sqrt(dx * dx + dy * dy));
  }

  // Selección ponderada SIN reemplazo (Efraimidis–Spirakis): de la lista de
  // candidatos `idx` con pesos `w`, elige `k` mediante claves -ln(U)/w.
  function weightedPick(idx, w, k, rng) {
    const m = idx.length;
    const key = new Float64Array(m);
    for (let i = 0; i < m; i++) key[i] = -Math.log(rng() + 1e-12) / (w[i] + 1e-12);
    const order = Array.from({ length: m }, (_, i) => i).sort((p, q) => key[p] - key[q]);
    const chosen = [];
    for (let i = 0; i < k && i < m; i++) chosen.push(idx[order[i]]);
    return chosen;
  }

  // Densidad variable 2D: prob ∝ (1−r)^p, con disco central siempre muestreado.
  function variableDensityMask(n, frac, p, centerFrac, rng) {
    rng = rng || Math.random;
    const mask = new Uint8Array(n * n);
    const cand = [], w = [];
    let forced = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const rr = radius(n, r, c), i = r * n + c;
      if (rr < centerFrac) { mask[i] = 1; forced++; }
      else { cand.push(i); w.push(Math.pow(Math.max(0, 1 - rr), p)); }
    }
    const need = Math.max(0, Math.round(frac * n * n) - forced);
    const chosen = weightedPick(cand, w, need, rng);
    for (const i of chosen) mask[i] = 1;
    return mask;
  }

  // Líneas de codificación de fase aleatorias (Cartesiano real): se eligen
  // columnas completas con densidad variable; banda central garantizada.
  function randomLinesMask(n, frac, p, calib, rng) {
    rng = rng || Math.random;
    const mask = new Uint8Array(n * n);
    const cols = [], w = [];
    const c0 = (n - calib) >> 1;
    const keep = new Uint8Array(n);
    for (let c = 0; c < n; c++) {
      if (c >= c0 && c < c0 + calib) keep[c] = 1;
      else { const rr = Math.abs(c - n / 2) / (n / 2); cols.push(c); w.push(Math.pow(Math.max(0, 1 - rr), p)); }
    }
    const need = Math.max(0, Math.round(frac * n) - calib);
    for (const c of weightedPick(cols, w, need, rng)) keep[c] = 1;
    for (let c = 0; c < n; c++) if (keep[c]) for (let r = 0; r < n; r++) mask[r * n + c] = 1;
    return mask;
  }

  // Líneas equiespaciadas (submuestreo regular) + banda de calibración.
  function uniformLinesMask(n, R, calib) {
    const mask = new Uint8Array(n * n);
    const c0 = (n - calib) >> 1;
    for (let c = 0; c < n; c++) {
      const inCalib = c >= c0 && c < c0 + calib;
      if (c % R === 0 || inCalib) for (let r = 0; r < n; r++) mask[r * n + c] = 1;
    }
    return mask;
  }

  // Radios que pasan por el centro (adquisición radial / no Cartesiana).
  function radialMask(n, nSpokes, rng) {
    rng = rng || Math.random;
    const mask = new Uint8Array(n * n);
    const cx = n / 2, cy = n / 2, R = n * 0.72;
    // offset aleatorio para descorrelacionar los radios
    const off = rng() * Math.PI;
    for (let s = 0; s < nSpokes; s++) {
      const ang = off + s * Math.PI / nSpokes;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let t = -R; t <= R; t += 0.5) {
        const c = Math.round(cx + t * dx), r = Math.round(cy + t * dy);
        if (r >= 0 && r < n && c >= 0 && c < n) mask[r * n + c] = 1;
      }
    }
    return mask;
  }

  function maskFraction(mask) {
    let s = 0; for (let i = 0; i < mask.length; i++) s += mask[i];
    return s / mask.length;
  }

  const CS = global.CS || (global.CS = {});
  CS.img = {
    sheppLogan, loadImageToFloat, variableDensityMask, randomLinesMask,
    uniformLinesMask, radialMask, maskFraction, radius
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CS.img;
})(typeof self !== 'undefined' ? self : globalThis);
