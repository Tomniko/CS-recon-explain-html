# Compressed Sensing para MRI · ruta de aprendizaje interactiva

Web educativa que explica, **paso a paso y con demos en vivo**, qué es el
*compressed sensing* (muestreo comprimido) y cómo permite **acelerar la
resonancia magnética** reconstruyendo imágenes con muchos menos datos de los
que exige Nyquist.

Inspirada en el formato de "ruta de aprendizaje" de explicadores como el de los
Vision Transformers. Todo el cálculo (FFT, wavelets y la reconstrucción
iterativa) corre **en el navegador**, sin servidor.

## La ruta

1. **El problema**: la MRI mide el *espacio-k* línea a línea; más líneas = más tiempo.
2. **Sparsity**: las imágenes se comprimen: viven en pocos coeficientes wavelet.
3. **Incoherencia**: submuestrear al azar convierte el *aliasing* en ruido quitable
   (PSF de muestreo aleatorio vs. regular).
4. **Reconstrucción ℓ₁**: el experimento original de Candès–Romberg–Tao: ℓ₁ recupera
   una señal dispersa exacta donde mínimos cuadrados (ℓ₂) fracasa.
5. **CS-MRI en vivo**: elige imagen, patrón de submuestreo y aceleración, y mira cómo
   el algoritmo (umbralizado wavelet + consistencia de datos) disuelve los artefactos.
6. **Las matemáticas**: el problema de optimización, los tres requisitos del CS y las
   referencias a los papers originales.

## Basado en

- Candès, Romberg & Tao, *“Robust uncertainty principles…”*, IEEE TIT 2006.
- Donoho, *“Compressed sensing”*, IEEE TIT 2006.
- Lustig, Donoho & Pauly, *“Sparse MRI”*, Magn. Reson. Med. 2007.
- Lustig, Donoho, Santos & Pauly, *“Compressed sensing MRI”*, IEEE SPM 2008.

## Uso local

Necesita servirse por HTTP (el procesamiento lee píxeles del `<canvas>`, que
requiere mismo origen):

```bash
python3 -m http.server 8000
# abre http://localhost:8000/
```

## Estructura

```
index.html        estructura y contenido (en español)
css/style.css     tema oscuro y maquetación
js/dsp.js         FFT 1D/2D + wavelet de Haar + métricas  (validado contra numpy)
js/images.js      fantoma de Shepp–Logan + máscaras de muestreo del espacio-k
js/recon.js       reconstrucción CS (umbralizado iterativo + POCS), paso a paso
js/app.js         interacción y demos
assets/           imágenes (ver assets/CREDITS.md)
tools/            tests de validación en Node (desarrollo)
```

## Publicado en

Actualmente se puede revisar en el siguiente link:
GitHub Pages → [https://tomniko.github.io/CS-recon-explain-html/](https://tomniko.github.io/CS-recon-explain-html/)

## Créditos de imágenes

La imagen de cerebro proviene de *“7 Tesla MRI of the ex vivo human brain at
100 micron resolution”* (Wikimedia Commons), liberada como **CC0 / dominio
público**. El fantoma de Shepp–Logan se genera por código. Detalles en
[`assets/CREDITS.md`](assets/CREDITS.md).

## Licencia

Código bajo licencia MIT. Contenido educativo de libre uso.
