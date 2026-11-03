/**
 * Modelo do vídeo vertical (1080 × 1920, 10 s) para TikTok / Reels / Shorts.
 * Gera uma página HTML com window.render(t) — o script scripts/video.ts tira um
 * print por quadro (30 fps) e o ffmpeg junta em MP4.
 */

export const VIDEO_SECONDS = 10;
export const VIDEO_FPS = 30;

export interface VideoData {
  name: string;
  store: string | null;
  price: number;
  /** foto do produto (data URL) */
  photo: string | null;
  logo: string | null;
  mascot: string | null;
  /** histórico diário (menor preço do dia), do mais antigo ao mais novo */
  history: { day: string; price: number }[];
  avg: number | null;
  badge: string;
  good: boolean;
  /** "−38%" etc. (vs. média de 30 dias); null = não mostra */
  off: string | null;
  seen: string | null;
  colors: { primary: string; ink: string };
  host: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function videoHtml(d: VideoData): string {
  const P = d.colors.primary;
  const INK = d.colors.ink;
  const name = d.name.length > 60 ? `${d.name.slice(0, 58)}…` : d.name;
  const nameSize = name.length > 40 ? 54 : name.length > 26 ? 60 : 66;
  const priceTxt = brl(d.price);
  const priceSize = priceTxt.length > 12 ? 120 : priceTxt.length > 10 ? 134 : 150;

  // gráfico: 840 × 240 úteis
  const hist = d.history.length >= 2 ? d.history : [{ day: d.history[0]?.day || "", price: d.price }, { day: d.history[0]?.day || "", price: d.price }];
  const vals = hist.map((h) => h.price).concat(d.avg != null ? [d.avg] : []);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < hi * 0.04) {
    hi *= 1.03;
    lo *= 0.97;
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const y = (v: number) => Math.round(30 + ((hi - v) / (hi - lo)) * 230);
  const x = (i: number) => Math.round(20 + (i * 800) / (hist.length - 1));
  const pts = hist.map((h, i) => [x(i), y(h.price)]);
  const avgY = d.avg != null ? y(d.avg) : null;
  const mid = Math.floor((hist.length - 1) / 2);
  const labels = hist.length > 2 ? [0, mid, hist.length - 1] : [0, hist.length - 1];

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:${P};font-family:Nunito,sans-serif;color:${INK}}
.l{position:absolute;will-change:transform,opacity}
#bg{inset:0;background:radial-gradient(circle at 50% 30%,#FF9A33 0,${P} 60%)}
#hook{left:80px;right:80px;top:330px;text-align:center;font-weight:900;font-size:118px;line-height:1.02;color:#fff;text-shadow:0 8px 0 rgba(0,0,0,.12)}
#hook b{color:${INK};background:#fff;padding:0 22px;border-radius:24px;display:inline-block;margin-top:14px}
#masc{left:310px;top:880px;width:460px}
#card{left:70px;right:70px;top:220px;height:1290px;background:#fff;border-radius:56px;box-shadow:0 24px 60px rgba(0,0,0,.18)}
#prod{left:190px;top:270px;width:700px;height:420px;display:flex;align-items:center;justify-content:center}
#prod img{max-width:100%;max-height:100%;object-fit:contain}
#info{left:120px;right:120px;top:705px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center}
#name{font-weight:900;font-size:${nameSize}px;line-height:1.05}
#store{font-weight:700;font-size:38px;color:#5B6573}
#chart{left:120px;top:925px;width:840px;height:330px}
#price{left:0;right:0;top:1300px;text-align:center}
#price span{display:inline-block;background:${P};color:${INK};font-weight:900;font-size:${priceSize}px;padding:0 40px;border-radius:36px;line-height:1.15}
#off{right:80px;top:1262px;background:${INK};color:#fff;font-weight:900;font-size:50px;padding:10px 24px;border-radius:24px}
#badge{left:0;right:0;top:1550px;text-align:center}
#badge span{display:inline-block;background:${d.good ? "#146C2E" : INK};color:#fff;font-weight:900;font-size:48px;padding:16px 36px;border-radius:999px}
#seen{left:50px;right:50px;top:1660px;text-align:center;font-weight:700;font-size:30px;color:#fff}
#end{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;background:${P}}
#end .logo{background:#fff;border-radius:36px;padding:26px 46px}
#end .logo img{height:120px;display:block}
#end .t{font-weight:900;font-size:84px;text-align:center;line-height:1.05;color:${INK};padding:0 80px}
#end .cta{background:${INK};color:#fff;font-weight:900;font-size:64px;padding:26px 60px;border-radius:999px}
#end .url{font-weight:900;font-size:44px;color:#fff}
#end img.m{width:300px}
#prog{left:0;top:0;height:10px;background:${INK}}
</style></head><body>
<div id="bg" class="l"></div>
<div id="hook" class="l">Será que está<br><b>barato mesmo?</b></div>
${d.mascot ? `<img id="masc" class="l" src="${d.mascot}">` : `<div id="masc" class="l"></div>`}
<div id="card" class="l"></div>
<div id="prod" class="l">${d.photo ? `<img src="${d.photo}">` : d.mascot ? `<img src="${d.mascot}">` : ""}</div>
<div id="info" class="l"><div id="name">${esc(name)}</div>
<div id="store">${esc(d.store ? `menor preço ${/^(amazon|magalu|shopee|kabum|casas bahia)/i.test(d.store) ? "na" : "no"} ${d.store}` : "menor preço entre as lojas")}</div></div>
<svg id="chart" class="l" viewBox="0 0 840 330">
  <g font-family="Nunito" font-weight="700" font-size="28" fill="#5B6573">
    ${labels.map((i, k) => `<text x="${k === 0 ? 0 : k === labels.length - 1 ? 840 : 420}" y="322" text-anchor="${k === 0 ? "start" : k === labels.length - 1 ? "end" : "middle"}">${ddmm(hist[i].day)}</text>`).join("")}
  </g>
  <line x1="0" x2="840" y1="280" y2="280" stroke="#E4E7EB" stroke-width="3"/>
  ${avgY != null ? `<g id="avg"><line x1="20" x2="820" y1="${avgY}" y2="${avgY}" stroke="#9AA3AE" stroke-width="3" stroke-dasharray="12 10"/><text x="820" y="${avgY - 14}" text-anchor="end" font-family="Nunito" font-weight="900" font-size="30" fill="#5B6573">Média 30 dias: ${brl(d.avg!)}</text></g>` : ""}
  <path id="area" fill="${P}" opacity=".12"/>
  <path id="line" fill="none" stroke="${P}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <circle id="dot" r="18" fill="${P}" stroke="#fff" stroke-width="6"/>
</svg>
<div id="price" class="l"><span>${priceTxt}</span></div>
${d.off ? `<div id="off" class="l">${esc(d.off)}</div>` : `<div id="off" class="l"></div>`}
<div id="badge" class="l"><span>${esc(d.badge)}</span></div>
<div id="seen" class="l">${esc(d.seen ? `Preço visto em ${d.seen}. Pode mudar a qualquer momento.` : "Preços mudam a qualquer momento.")}</div>
<div id="end" class="l">
  ${d.logo ? `<div class="logo"><img src="${d.logo}"></div>` : ""}
  <div class="t">Veja o histórico antes de comprar</div>
  <div class="cta">Link na bio</div>
  ${d.mascot ? `<img class="m" src="${d.mascot}">` : ""}
  <div class="url">${esc(d.host)}</div>
</div>
<div id="prog" class="l"></div>
<script>
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const seg=(t,a,b)=>cl((t-a)/(b-a));
const out=x=>1-Math.pow(1-x,3);
const back=x=>{const c=1.7;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const pts=${JSON.stringify(pts)};
const HAS_OFF=${d.off ? "true" : "false"};
function set(id,o,tf){const e=$(id);if(!e)return;e.style.opacity=o;e.style.transform=tf||'none'}
window.render=function(t){
  const h1=out(seg(t,0,.5)), h2=seg(t,2,2.4);
  set('hook',h1*(1-h2),'translateY('+((1-h1)*80-h2*120)+'px) scale('+(.9+.1*back(seg(t,0,.5)))+')');
  const m1=out(seg(t,.3,.9));
  set('masc',m1*(1-h2),'translateY('+((1-m1)*500+Math.sin(t*5)*10)+'px) rotate('+(Math.sin(t*3)*4)+'deg)');
  const c1=out(seg(t,2.2,2.7)), c2=seg(t,8.5,8.8), cardO=c1*(1-c2);
  set('card',cardO,'translateY('+((1-c1)*200)+'px)');
  set('prod',cardO*seg(t,2.5,2.8),'scale('+(.6+.4*back(seg(t,2.5,3.1)))+') translateY('+(Math.sin(t*2)*6)+'px)');
  set('info',cardO*out(seg(t,2.9,3.3)),'translateY('+((1-out(seg(t,2.9,3.3)))*40)+'px)');
  set('chart',cardO*seg(t,3.5,3.8));
  const av=$('avg'); if(av) av.style.opacity=seg(t,3.8,4.2);
  const g=seg(t,3.6,5.4), n=g*(pts.length-1), k=Math.floor(n), f=n-k;
  const dr=pts.slice(0,k+1); if(k<pts.length-1){const a=pts[k],b=pts[k+1];dr.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f])}
  const d='M'+dr.map(p=>p.join(' ')).join(' L');
  $('line').setAttribute('d',d);
  const last=dr[dr.length-1];
  $('area').setAttribute('d',d+' L'+last[0]+' 280 L'+pts[0][0]+' 280 Z');
  $('dot').setAttribute('cx',last[0]);$('dot').setAttribute('cy',last[1]);
  set('price',cardO*seg(t,5.6,5.8),'scale('+(.4+.6*back(seg(t,5.6,6.1)))+')');
  set('off',HAS_OFF?cardO*seg(t,6.2,6.35):0,'rotate('+(-8+Math.sin(t*6)*2)+'deg) scale('+back(seg(t,6.2,6.6))+')');
  set('badge',cardO*out(seg(t,6.7,7.1)),'translateY('+((1-out(seg(t,6.7,7.1)))*60)+'px)');
  set('seen',cardO*seg(t,7.2,7.5));
  const e=out(seg(t,8.6,9.1));
  set('end',e,'scale('+(.92+.08*e)+')');
  $('prog').style.width=(t/${VIDEO_SECONDS}*1080)+'px';
};
render(0);
</script></body></html>`;
}
