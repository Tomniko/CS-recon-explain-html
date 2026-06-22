/* =====================================================================
   recon.js — Reconstrucción por Compressed Sensing para MRI.

   Resuelve (de forma aproximada)   min ‖Ψx‖₁  s.a.  F_u x = y
   con un esquema de umbralizado iterativo + consistencia de datos (POCS):

     x⁰ = F_u^H y                         (relleno con ceros / zero-filled)
     repetir:
        x ← Ψ⁻¹ · softThreshold(Ψ x, λ)   (impone sparsity en wavelets)
        X ← F x ;  X|_medido ← y          (impone los datos medidos)
        x ← F⁻¹ X

   donde Ψ es la wavelet de Haar (dsp.dwt2). El objeto devuelto es "paso a
   paso" (step) para poder animar la convergencia en la página.
   ===================================================================== */
(function (global) {
  'use strict';
  const CS = global.CS || (global.CS = {});
  const dsp = (typeof require !== 'undefined') ? require('./dsp.js') : CS.dsp;

  // Reconstrucción a partir del k-espacio medido (centrado) y la máscara.
  // opts: { measRe, measIm, mask, n, levels, lambda, ref? }
  function create(opts) {
    const n = opts.n, L = opts.levels || 4, lambda = opts.lambda;
    const mask = opts.mask, measRe = opts.measRe, measIm = opts.measIm, ref = opts.ref;
    const N2 = n * n;

    // x⁰ = relleno con ceros (IFFT centrada del k-espacio medido)
    const xRe = measRe.slice(), xIm = measIm.slice();
    dsp.ifft2c(xRe, xIm, n);
    const x = new Float64Array(N2);
    for (let i = 0; i < N2; i++) x[i] = xRe[i];
    const zerofill = x.slice();

    const w = new Float64Array(N2);
    const fre = new Float64Array(N2), fim = new Float64Array(N2);
    let iter = 0;

    function step(k) {
      k = k || 1;
      for (let s = 0; s < k; s++) {
        // 1) sparsity: umbralizado suave en el dominio wavelet
        w.set(x);
        dsp.dwt2(w, n, L);
        dsp.softThreshold(w, n, L, lambda);
        dsp.idwt2(w, n, L);
        // 2) consistencia con los datos medidos
        fre.set(w); fim.fill(0);
        dsp.fft2c(fre, fim, n);
        for (let i = 0; i < N2; i++) {
          if (mask[i]) { fre[i] = measRe[i]; fim[i] = measIm[i]; }
        }
        dsp.ifft2c(fre, fim, n);
        for (let i = 0; i < N2; i++) x[i] = fre[i];
        iter++;
      }
      return x;
    }

    function psnr() { return ref ? dsp.psnr(ref, clamp(x), 1) : NaN; }
    function clamp(a) { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] < 0 ? 0 : (a[i] > 1 ? 1 : a[i]); return o; }

    return {
      get iter() { return iter; },
      x, zerofill, step, psnr,
      zerofillPSNR: ref ? dsp.psnr(ref, clamp(zerofill), 1) : NaN
    };
  }

  // Simula la adquisición: dada la imagen real, calcula su k-espacio centrado
  // y lo enmascara. Devuelve { measRe, measIm, kfull{re,im} }.
  function simulate(image, mask, n) {
    const re = image.slice(), im = new Float64Array(n * n);
    dsp.fft2c(re, im, n);
    const fullRe = re.slice(), fullIm = im.slice();
    const measRe = new Float64Array(n * n), measIm = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) if (mask[i]) { measRe[i] = re[i]; measIm[i] = im[i]; }
    return { measRe, measIm, fullRe, fullIm };
  }

  CS.recon = { create, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = CS.recon;
})(typeof self !== 'undefined' ? self : globalThis);
