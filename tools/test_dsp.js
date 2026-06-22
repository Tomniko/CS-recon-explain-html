const dsp = require('../js/dsp.js');
const N = 8;
function input(n){ const a=new Float64Array(n*n);
  for(let r=0;r<n;r++)for(let c=0;c<n;c++) a[r*n+c]=Math.sin(0.3*r+0.1*c)+0.5*Math.cos(0.07*r*c); return a; }

// 1) FFT roundtrip
let re=input(N).slice(), im=new Float64Array(N*N); const orig=re.slice();
dsp.fft2(re,im,N,false); dsp.fft2(re,im,N,true);
let e=0; for(let i=0;i<N*N;i++) e=Math.max(e,Math.abs(re[i]-orig[i]));
console.log('fft2 roundtrip max err:', e.toExponential(3));

// 2) Haar roundtrip
let h=input(N).slice(); const horig=h.slice();
dsp.dwt2(h,N,3); dsp.idwt2(h,N,3);
let he=0; for(let i=0;i<N*N;i++) he=Math.max(he,Math.abs(h[i]-horig[i]));
console.log('haar roundtrip max err:', he.toExponential(3));

// 3) fft2c magnitude -> dump for python comparison
let cr=input(N).slice(), ci=new Float64Array(N*N);
dsp.fft2c(cr,ci,N);
const mag=dsp.magnitude(cr,ci);
console.log('FFT2C_MAG_START');
console.log(Array.from(mag).map(v=>v.toFixed(8)).join(','));
console.log('FFT2C_MAG_END');
