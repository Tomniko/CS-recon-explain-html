const dsp=require('../js/dsp.js'); const N1=256;
function fft1(re,im,inv){ dsp.fft1d(re,im,dsp.makePlan(re.length),inv);
  if(inv){const s=1/re.length;for(let i=0;i<re.length;i++){re[i]*=s;im[i]*=s;}}}
function makeSparse(k){const x=new Float64Array(N1),pos=new Set();
  while(pos.size<k)pos.add((Math.random()*N1)|0);
  pos.forEach(p=>{x[p]=(Math.random()*1.4+0.3)*(Math.random()<0.5?-1:1);});return x;}
function pickOmega(M){const s=new Set();while(s.size<M)s.add((Math.random()*N1)|0);return[...s];}
function recover1D(sig,omega){
  const Sr=sig.slice(),Si=new Float64Array(N1);fft1(Sr,Si,false);
  const yr=new Float64Array(N1),yi=new Float64Array(N1);
  for(const k of omega){yr[k]=Sr[k];yi[k]=Si[k];}
  const l2r=yr.slice(),l2i=yi.slice();fft1(l2r,l2i,true);
  let xr=l2r.slice(),xi=l2i.slice();
  let mx=0;for(let i=0;i<N1;i++)mx=Math.max(mx,Math.hypot(xr[i],xi[i]));
  const iters=260;
  for(let it=0;it<iters;it++){const lam=mx*0.12*(1-it/iters)+1e-4;
    for(let i=0;i<N1;i++){const m=Math.hypot(xr[i],xi[i]);
      if(m>lam){const s=(m-lam)/m;xr[i]*=s;xi[i]*=s;}else{xr[i]=0;xi[i]=0;}}
    const Xr=xr.slice(),Xi=xi.slice();fft1(Xr,Xi,false);
    for(const k of omega){Xr[k]=Sr[k];Xi[k]=Si[k];}
    fft1(Xr,Xi,true);xr=Xr;xi=Xi;}
  return{l2:l2r,l1:xr};}
function relErr(a,b){let n=0,d=0;for(let i=0;i<a.length;i++){const e=a[i]-b[i];n+=e*e;d+=a[i]*a[i];}return Math.sqrt(n/(d||1));}
for(const [k,mPct] of [[8,15],[8,30],[8,50],[15,30],[15,50],[25,30],[25,60]]){
  let l1s=0,l2s=0,ok=0,T=8;
  for(let t=0;t<T;t++){const sig=makeSparse(k);const om=pickOmega(Math.round(mPct/100*N1));
    const {l1,l2}=recover1D(sig,om);const e1=relErr(sig,l1);l1s+=e1;l2s+=relErr(sig,l2);if(e1<0.03)ok++;}
  console.log(`k=${k} M=${mPct}%  L1err=${(l1s/T*100).toFixed(1)}%  L2err=${(l2s/T*100).toFixed(1)}%  exact ${ok}/${T}`);
}
