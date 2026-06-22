# Pruebas de validación (desarrollo)

Tests de corrección del núcleo de procesamiento (no necesarios para usar la web).
Requieren Node.js:

```bash
node tools/test_dsp.js   # FFT y wavelet de Haar: ida y vuelta a precisión de máquina
node tools/test_1d.js    # recuperación dispersa ℓ1 vs ℓ2 (Candès–Romberg–Tao)
```

Durante el desarrollo, `js/dsp.js` se comparó coeficiente a coeficiente contra
numpy (`np.fft.fft2`) con diferencia 0.0, y la reconstrucción CS completa se
validó contra una implementación de referencia en numpy (diferencia ~1e-15).
