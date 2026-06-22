/* =====================================================================
   dsp.js — Núcleo de procesamiento de señal para el explicador de
   Compressed Sensing.

   Contiene, en JavaScript puro y sin dependencias:
     · FFT 1D radix-2 (Cooley-Tukey iterativa, con plan precalculado)
     · FFT/IFFT 2D y sus versiones "centradas" (DC en el centro)
     · Transformada wavelet de Haar 2D multinivel (directa e inversa)
     · Umbralizado suave (soft-threshold), métricas (PSNR/RMSE) y utilidades

   Convenio de datos: una imagen/k-espacio compleja de N×N se guarda como
   dos Float64Array de longitud N*N en orden por filas (row-major): `re`,`im`.

   Validado contra numpy (ver tools/test_dsp.js).
   ===================================================================== */
(function (global) {
  'use strict';
  const SQRT1_2 = Math.SQRT1_2; // 1/√2

  /* ----------------------------- FFT 1D ----------------------------- */
  // Plan reutilizable para un tamaño n (potencia de 2): permutación de
  // bit-reversal + tablas de cos/sin.
  const planCache = new Map();
  function makePlan(n) {
    if (planCache.has(n)) return planCache.get(n);
    if ((n & (n - 1)) !== 0) throw new Error('FFT: n debe ser potencia de 2, no ' + n);
    const rev = new Uint32Array(n);
    let bits = 0; while ((1 << bits) < n) bits++;
    for (let i = 0; i < n; i++) {
      let x = i, r = 0;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const half = n >> 1;
    const cos = new Float64Array(half), sin = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      const a = (2 * Math.PI * k) / n;
      cos[k] = Math.cos(a); sin[k] = Math.sin(a);
    }
    const plan = { n, rev, cos, sin };
    planCache.set(n, plan);
    return plan;
  }

  // FFT in-place sobre re/im (longitud n). inverse=true => sin escalar (1/n).
  function fft1d(re, im, plan, inverse) {
    const n = plan.n, rev = plan.rev, cosT = plan.cos, sinT = plan.sin;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const tstep = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < halfLen; j++, k += tstep) {
          const c = cosT[k];
          const w = inverse ? sinT[k] : -sinT[k]; // exp(∓i·2πk/n) = c + i·w
          const a = i + j, b = a + halfLen;
          const vr = re[b], vi = im[b];
          const tr = c * vr - w * vi;
          const ti = c * vi + w * vr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr;        im[a] += ti;
        }
      }
    }
  }

  /* ----------------------------- FFT 2D ----------------------------- */
  function fft2(re, im, n, inverse) {
    const plan = makePlan(n);
    const tr = new Float64Array(n), ti = new Float64Array(n);
    // filas (contiguas)
    for (let r = 0; r < n; r++) {
      const off = r * n;
      fft1d(re.subarray(off, off + n), im.subarray(off, off + n), plan, inverse);
    }
    // columnas (con buffer)
    for (let c = 0; c < n; c++) {
      for (let r = 0; r < n; r++) { tr[r] = re[r * n + c]; ti[r] = im[r * n + c]; }
      fft1d(tr, ti, plan, inverse);
      for (let r = 0; r < n; r++) { re[r * n + c] = tr[r]; im[r * n + c] = ti[r]; }
    }
    if (inverse) {
      const s = 1 / (n * n);
      for (let i = 0, L = n * n; i < L; i++) { re[i] *= s; im[i] *= s; }
    }
  }

  // Intercambio de cuadrantes (fftshift == ifftshift para n par).
  function fftshift2(re, im, n) {
    const h = n >> 1;
    for (let r = 0; r < h; r++) {
      const r2 = r + h;
      for (let c = 0; c < n; c++) {
        const c2 = (c + h) % n;
        const a = r * n + c, b = r2 * n + c2;
        let t = re[a]; re[a] = re[b]; re[b] = t;
        if (im) { t = im[a]; im[a] = im[b]; im[b] = t; }
      }
    }
  }
  // Versiones "centradas": DC en el centro del array (intuitivo para el usuario).
  function fft2c(re, im, n) { fftshift2(re, im, n); fft2(re, im, n, false); fftshift2(re, im, n); }
  function ifft2c(re, im, n) { fftshift2(re, im, n); fft2(re, im, n, true); fftshift2(re, im, n); }

  /* --------------------- Wavelet de Haar 2D ------------------------- */
  function haarRows(a, n, s) {
    const h = s >> 1, tmp = new Float64Array(s);
    for (let r = 0; r < s; r++) {
      const off = r * n;
      for (let i = 0; i < h; i++) {
        const e = a[off + 2 * i], o = a[off + 2 * i + 1];
        tmp[i] = (e + o) * SQRT1_2; tmp[h + i] = (e - o) * SQRT1_2;
      }
      for (let i = 0; i < s; i++) a[off + i] = tmp[i];
    }
  }
  function haarCols(a, n, s) {
    const h = s >> 1, tmp = new Float64Array(s);
    for (let c = 0; c < s; c++) {
      for (let i = 0; i < h; i++) {
        const e = a[(2 * i) * n + c], o = a[(2 * i + 1) * n + c];
        tmp[i] = (e + o) * SQRT1_2; tmp[h + i] = (e - o) * SQRT1_2;
      }
      for (let i = 0; i < s; i++) a[i * n + c] = tmp[i];
    }
  }
  function ihaarRows(a, n, s) {
    const h = s >> 1, tmp = new Float64Array(s);
    for (let r = 0; r < s; r++) {
      const off = r * n;
      for (let i = 0; i < h; i++) {
        const av = a[off + i], dv = a[off + h + i];
        tmp[2 * i] = (av + dv) * SQRT1_2; tmp[2 * i + 1] = (av - dv) * SQRT1_2;
      }
      for (let i = 0; i < s; i++) a[off + i] = tmp[i];
    }
  }
  function ihaarCols(a, n, s) {
    const h = s >> 1, tmp = new Float64Array(s);
    for (let c = 0; c < s; c++) {
      for (let i = 0; i < h; i++) {
        const av = a[i * n + c], dv = a[(h + i) * n + c];
        tmp[2 * i] = (av + dv) * SQRT1_2; tmp[2 * i + 1] = (av - dv) * SQRT1_2;
      }
      for (let i = 0; i < s; i++) a[i * n + c] = tmp[i];
    }
  }
  // Transformada directa: pirámide de Mallat, L niveles. Modifica `a` in-place.
  function dwt2(a, n, L) { let s = n; for (let l = 0; l < L; l++) { haarRows(a, n, s); haarCols(a, n, s); s >>= 1; } }
  function idwt2(a, n, L) { let s = n >> (L - 1); for (let l = 0; l < L; l++) { ihaarCols(a, n, s); ihaarRows(a, n, s); s <<= 1; } }

  // Umbralizado suave de los coeficientes de detalle (conserva la aproximación LL).
  function softThreshold(a, n, L, t) {
    const LL = n >> L;
    for (let r = 0; r < n; r++) {
      const off = r * n;
      for (let c = 0; c < n; c++) {
        if (r < LL && c < LL) continue;
        const v = a[off + c];
        const m = Math.abs(v) - t;
        a[off + c] = m > 0 ? (v >= 0 ? m : -m) : 0;
      }
    }
  }

  /* --------------------------- Métricas ----------------------------- */
  function rmse(a, b) {
    let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s / a.length);
  }
  function psnr(ref, x, peak) {
    peak = peak || 1;
    let s = 0; for (let i = 0; i < ref.length; i++) { const d = ref[i] - x[i]; s += d * d; }
    const mse = s / ref.length;
    return mse === 0 ? Infinity : 10 * Math.log10((peak * peak) / mse);
  }

  /* --------------------------- Utilidades --------------------------- */
  function magnitude(re, im) {
    const out = new Float64Array(re.length);
    for (let i = 0; i < re.length; i++) out[i] = Math.hypot(re[i], im[i]);
    return out;
  }
  function zeros(n) { return new Float64Array(n); }

  const dsp = {
    makePlan, fft1d, fft2, fftshift2, fft2c, ifft2c,
    dwt2, idwt2, softThreshold, rmse, psnr, magnitude, zeros, SQRT1_2
  };

  const CS = global.CS || (global.CS = {});
  CS.dsp = dsp;
  if (typeof module !== 'undefined' && module.exports) module.exports = dsp;
})(typeof self !== 'undefined' ? self : globalThis);
