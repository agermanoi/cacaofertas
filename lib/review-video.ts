/**
 * Vídeo "Vale a pena comprar?" (1080 × 1920, ~45 s, narrado).
 * Análise de preço e ficha técnica — não é review de uso; o vídeo diz isso na tela.
 * A página tem window.render(t); scripts/review-video.ts tira um print por quadro e junta com a narração.
 */

export interface ReviewScene {
  id: "hook" | "about" | "specs" | "history" | "verdict" | "end";
  start: number;
  end: number;
  /** texto narrado (vira legenda) */
  text: string;
}

export interface ReviewData {
  name: string;
  category: string;
  photo: string | null;
  logo: string | null;
  mascot: string | null;
  summary: string;
  specs: [string, string][];
  history: { day: string; price: number }[];
  price: number;
  /** "na Amazon", "no Mercado Livre" */
  store: string | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  days: number;
  badge: string;
  good: boolean;
  vsLabel: string | null;
  seen: string | null;
  colors: { primary: string; ink: string };
  host: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "R$ 7.799,00" falado: "7.799 reais" / "359 reais e 90 centavos" */
export function spokenMoney(v: number): string {
  const r = Math.floor(v);
  const c = Math.round((v - r) * 100);
  return `${r.toLocaleString("pt-BR")} reais${c ? ` e ${c} centavos` : ""}`;
}

/** Unidades e símbolos lidos por extenso na narração. */
export function speakable(s: string): string {
  return s
    .replace(/(\d),(\d)"/g, "$1,$2 polegadas")
    .replace(/(\d)"/g, "$1 polegadas")
    .replace(/(\d)\s?MP\b/g, "$1 megapixels")
    .replace(/(\d)\s?GB\b/g, "$1 gigas")
    .replace(/(\d)\s?TB\b/g, "$1 tera")
    .replace(/(\d)\s?Hz\b/g, "$1 hertz")
    .replace(/(\d)\s?mAh\b/g, "$1 miliamperes-hora")
    .replace(/(\d)\s?h\b/g, "$1 horas")
    .replace(/(\d)\s?W\b/g, "$1 watts")
    .replace(/(\d)\s?L\b/g, "$1 litros")
    .replace(/(\d+)\s?×/g, "$1 vezes")
    .replace(/[()]/g, ", ")
    .replace(/\s{2,}/g, " ");
}

/** "6,3" Super Retina XDR OLED, 2622 × 1206, ProMotion…" -> "6,3" Super Retina XDR OLED" */
export const shortSpec = (v: string) => v.split(/,\s|\s\(|;/)[0].trim();

export function reviewHtml(d: ReviewData, scenes: ReviewScene[], total: number): string {
  const P = d.colors.primary;
  const INK = d.colors.ink;
  const name = d.name.length > 52 ? `${d.name.slice(0, 50)}…` : d.name;
  const nameSize = name.length > 34 ? 60 : name.length > 22 ? 70 : 82;

  // gráfico 840 × 300
  const hist = d.history.length >= 2 ? d.history : [d.history[0] || { day: "", price: d.price }, d.history[0] || { day: "", price: d.price }];
  const vals = hist.map((h) => h.price).concat(d.avg != null ? [d.avg] : []);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < hi * 0.04) {
    hi *= 1.03;
    lo *= 0.97;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const y = (v: number) => Math.round(30 + ((hi - v) / (hi - lo)) * 270);
  const x = (i: number) => Math.round(20 + (i * 800) / (hist.length - 1));
  const pts = hist.map((h, i) => [x(i), y(h.price)]);
  const avgY = d.avg != null ? y(d.avg) : null;
  const specs = d.specs.slice(0, 4);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:${P};font-family:Nunito,sans-serif;color:${INK}}
.l{position:absolute;will-change:transform,opacity}
#bg{inset:0;background:radial-gradient(circle at 50% 28%,#FF9A33 0,${P} 62%)}
#tag{left:60px;top:110px;background:${INK};color:#fff;font-weight:900;font-size:30px;letter-spacing:2px;padding:12px 24px;border-radius:999px}
#logo{right:60px;top:96px;background:#fff;border-radius:20px;padding:10px 20px}
#logo img{height:52px;display:block}
.sc{inset:0}
/* hook */
#hook-q{left:70px;right:70px;top:300px;text-align:center;color:#fff;font-weight:900;font-size:96px;line-height:1.02;text-shadow:0 8px 0 rgba(0,0,0,.12)}
#hook-card{left:150px;right:150px;top:720px;height:640px;background:#fff;border-radius:56px;display:flex;align-items:center;justify-content:center;padding:40px;box-shadow:0 24px 60px rgba(0,0,0,.18)}
#hook-card img{max-width:100%;max-height:100%;object-fit:contain}
/* card branco geral */
.card{left:70px;right:70px;top:230px;height:1220px;background:#fff;border-radius:56px;box-shadow:0 24px 60px rgba(0,0,0,.18)}
#about-photo{left:190px;top:290px;width:700px;height:560px;display:flex;align-items:center;justify-content:center}
#about-photo img{max-width:100%;max-height:100%;object-fit:contain}
#about-name{left:120px;right:120px;top:900px;text-align:center;font-weight:900;font-size:${nameSize}px;line-height:1.05}
#about-cat{left:120px;right:120px;top:${900 + nameSize * 2.3}px;text-align:center;font-weight:800;font-size:38px;color:#5B6573}
/* specs */
#specs-h{left:120px;top:290px;font-weight:900;font-size:64px}
.spec{left:120px;right:120px;height:200px;border:4px solid #F1E6DA;border-radius:32px;padding:26px 34px;display:flex;flex-direction:column;justify-content:center;gap:6px}
.spec b{font-size:30px;font-weight:900;color:${P};text-transform:uppercase;letter-spacing:1px}
.spec span{font-size:46px;font-weight:900;line-height:1.1}
/* history */
#hist-h{left:120px;right:120px;top:290px;font-weight:900;font-size:62px;line-height:1.05}
#hist-sub{left:120px;right:120px;top:440px;font-weight:800;font-size:36px;color:#5B6573}
#chart{left:120px;top:560px;width:840px;height:360px}
.stat{top:990px;width:260px;text-align:center}
.stat b{display:block;font-size:28px;color:#5B6573;font-weight:800;text-transform:uppercase;letter-spacing:1px}
.stat span{display:block;font-size:42px;font-weight:900;margin-top:6px;white-space:nowrap}
/* verdict */
#v-h{left:120px;right:120px;top:300px;text-align:center;font-weight:900;font-size:56px}
#v-price{left:0;right:0;top:420px;text-align:center}
#v-price span{display:inline-block;background:${P};color:${INK};font-weight:900;font-size:150px;padding:0 44px;border-radius:40px;line-height:1.15}
#v-store{left:120px;right:120px;top:650px;text-align:center;font-weight:800;font-size:42px;color:#3B4553}
#v-badge{left:0;right:0;top:770px;text-align:center}
#v-badge span{display:inline-block;background:${d.good ? "#146C2E" : INK};color:#fff;font-weight:900;font-size:50px;padding:18px 38px;border-radius:999px}
#v-vs{left:120px;right:120px;top:900px;text-align:center;font-weight:900;font-size:64px;color:${d.good ? "#146C2E" : d.vsLabel && /acima/.test(d.vsLabel) ? "#9A3412" : INK}}
#v-seen{left:120px;right:120px;top:1040px;text-align:center;font-weight:700;font-size:32px;color:#5B6573}
/* end */
#end{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:38px;background:${P}}
#end .lg{background:#fff;border-radius:36px;padding:26px 46px}
#end .lg img{height:120px;display:block}
#end .t{font-weight:900;font-size:80px;text-align:center;line-height:1.05;color:${INK};padding:0 80px}
#end .cta{background:${INK};color:#fff;font-weight:900;font-size:62px;padding:24px 58px;border-radius:999px}
#end .url{font-weight:900;font-size:44px;color:#fff}
#end .disc{font-weight:800;font-size:30px;color:${INK};opacity:.8;text-align:center;padding:0 120px}
/* legenda */
#cap{left:70px;right:70px;top:1500px;min-height:190px;display:flex;align-items:center;justify-content:center;text-align:center}
#cap span{background:rgba(23,33,47,.88);color:#fff;font-weight:900;font-size:46px;line-height:1.2;padding:16px 26px;border-radius:24px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
#prog{left:0;top:0;height:10px;background:${INK}}
</style></head><body>
<div id="bg" class="l"></div>

<div id="s-hook" class="l sc">
  <div id="hook-q" class="l">Vale a pena comprar agora?</div>
  <div id="hook-card" class="l">${d.photo ? `<img src="${d.photo}">` : d.mascot ? `<img src="${d.mascot}">` : ""}</div>
</div>

<div id="s-about" class="l sc">
  <div class="l card"></div>
  <div id="about-photo" class="l">${d.photo ? `<img src="${d.photo}">` : ""}</div>
  <div id="about-name" class="l">${esc(name)}</div>
  <div id="about-cat" class="l">${esc(d.category)}</div>
</div>

<div id="s-specs" class="l sc">
  <div class="l card"></div>
  <div id="specs-h" class="l">Ficha técnica</div>
  ${specs.map(([k, v], i) => `<div class="l spec" id="spec${i}" style="top:${420 + i * 240}px"><b>${esc(k)}</b><span>${esc(shortSpec(v))}</span></div>`).join("")}
</div>

<div id="s-history" class="l sc">
  <div class="l card"></div>
  <div id="hist-h" class="l">Histórico de preço</div>
  <div id="hist-sub" class="l">${d.days} ${d.days === 1 ? "dia acompanhado" : "dias acompanhados"}</div>
  <svg id="chart" class="l" viewBox="0 0 840 360">
    <g font-family="Nunito" font-weight="800" font-size="28" fill="#5B6573">
      <text x="0" y="350">${ddmm(hist[0].day)}</text><text x="840" y="350" text-anchor="end">${ddmm(hist[hist.length - 1].day)}</text>
    </g>
    <line x1="0" x2="840" y1="310" y2="310" stroke="#E4E7EB" stroke-width="3"/>
    ${avgY != null ? `<g id="avg"><line x1="20" x2="820" y1="${avgY}" y2="${avgY}" stroke="#9AA3AE" stroke-width="3" stroke-dasharray="12 10"/><text x="820" y="${avgY - 14}" text-anchor="end" font-family="Nunito" font-weight="900" font-size="30" fill="#5B6573">média</text></g>` : ""}
    <path id="area" fill="${P}" opacity=".12"/>
    <path id="line" fill="none" stroke="${P}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <circle id="dot" r="18" fill="${P}" stroke="#fff" stroke-width="6"/>
  </svg>
  <div id="st0" class="l stat" style="left:120px"><b>Menor</b><span>${d.min != null ? brl(d.min) : "—"}</span></div>
  <div id="st1" class="l stat" style="left:410px"><b>Média</b><span>${d.avg != null ? brl(d.avg) : "—"}</span></div>
  <div id="st2" class="l stat" style="left:700px"><b>Maior</b><span>${d.max != null ? brl(d.max) : "—"}</span></div>
</div>

<div id="s-verdict" class="l sc">
  <div class="l card"></div>
  <div id="v-h" class="l">Menor preço hoje</div>
  <div id="v-price" class="l"><span>${brl(d.price)}</span></div>
  <div id="v-store" class="l">${esc(d.store || "entre as lojas")}</div>
  <div id="v-badge" class="l"><span>${esc(d.badge)}</span></div>
  <div id="v-vs" class="l">${esc(d.vsLabel || "")}</div>
  <div id="v-seen" class="l">${esc(d.seen ? `Preço visto em ${d.seen}. Pode mudar a qualquer momento.` : "Preços mudam a qualquer momento.")}</div>
</div>

<div id="end" class="l">
  ${d.logo ? `<div class="lg"><img src="${d.logo}"></div>` : ""}
  <div class="t">Histórico completo no site</div>
  <div class="cta">Link na bio</div>
  <div class="url">${esc(d.host)}</div>
  <div class="disc">Análise de preço e ficha técnica, com dados do Caça Ofertas.</div>
</div>

<div id="tag" class="l">ANÁLISE DE PREÇO</div>
${d.logo ? `<div id="logo" class="l"><img src="${d.logo}"></div>` : ""}
<div id="cap" class="l"><span id="capt"></span></div>
<div id="prog" class="l"></div>
<script>
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const seg=(t,a,b)=>cl((t-a)/(b-a));
const out=x=>1-Math.pow(1-x,3);
const back=x=>{const c=1.7;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const S=${JSON.stringify(scenes)};
const T=${total};
const pts=${JSON.stringify(pts)};
const NS=${specs.length};
function set(id,o,tf){const e=$(id);if(!e)return;e.style.opacity=o;e.style.transform=tf||'none'}
function vis(sc,t){const a=out(seg(t,sc.start,sc.start+.35)), b=1-seg(t,sc.end-.25,sc.end);return Math.min(a,b)}
function chunks(text){const w=text.split(' ');const out=[];let cur='';for(const x of w){if((cur+' '+x).trim().length>46&&cur){out.push(cur);cur=x}else cur=(cur+' '+x).trim()}if(cur)out.push(cur);
  const res=[];for(let i=0;i<out.length;i+=2)res.push(out.slice(i,i+2).join(' '));return res}
const CH=S.map(s=>{const c=chunks(s.text);const tot=c.reduce((a,b)=>a+b.length,0)||1;let acc=0;return c.map(x=>{const st=acc/tot;acc+=x.length;return{t:x,a:st,b:acc/tot}})});
window.render=function(t){
  for(const sc of S){const v=vis(sc,t);const el=$(sc.id==='end'?'end':'s-'+sc.id);if(!el)continue;el.style.opacity=v;el.style.display=v<=0?'none':'block';if(sc.id==='end')el.style.display=v<=0?'none':'flex'}
  const H=S.find(s=>s.id==='hook'),A=S.find(s=>s.id==='about'),P=S.find(s=>s.id==='specs'),Hi=S.find(s=>s.id==='history'),V=S.find(s=>s.id==='verdict'),E=S.find(s=>s.id==='end');
  if(H){const k=back(seg(t,H.start,H.start+.6));set('hook-q',1,'translateY('+((1-k)*60)+'px)');set('hook-card',seg(t,H.start+.3,H.start+.7),'scale('+(.7+.3*back(seg(t,H.start+.3,H.start+.9)))+') rotate('+(Math.sin(t*2)*1.5)+'deg)')}
  if(A){set('about-photo',1,'scale('+(.8+.2*back(seg(t,A.start,A.start+.6)))+') translateY('+(Math.sin(t*2)*6)+'px)');set('about-name',out(seg(t,A.start+.3,A.start+.7)),'translateY('+((1-out(seg(t,A.start+.3,A.start+.7)))*40)+'px)');set('about-cat',seg(t,A.start+.5,A.start+.9))}
  if(P){const dur=P.end-P.start;for(let i=0;i<NS;i++){const s0=P.start+.3+i*(dur*.8/NS);set('spec'+i,out(seg(t,s0,s0+.4)),'translateX('+((1-out(seg(t,s0,s0+.4)))*-80)+'px)')}}
  if(Hi){const g=seg(t,Hi.start+.4,Hi.start+(Hi.end-Hi.start)*.55),n=g*(pts.length-1),k=Math.floor(n),f=n-k;
    const dr=pts.slice(0,k+1);if(k<pts.length-1){const a=pts[k],b=pts[k+1];dr.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f])}
    const dd='M'+dr.map(p=>p.join(' ')).join(' L');$('line').setAttribute('d',dd);const last=dr[dr.length-1];
    $('area').setAttribute('d',dd+' L'+last[0]+' 310 L'+pts[0][0]+' 310 Z');$('dot').setAttribute('cx',last[0]);$('dot').setAttribute('cy',last[1]);
    const av=$('avg');if(av)av.style.opacity=seg(t,Hi.start+.6,Hi.start+1);
    for(let i=0;i<3;i++){const s0=Hi.start+(Hi.end-Hi.start)*.45+i*.35;set('st'+i,out(seg(t,s0,s0+.35)),'translateY('+((1-out(seg(t,s0,s0+.35)))*40)+'px)')}}
  if(V){set('v-h',seg(t,V.start,V.start+.3));set('v-price',seg(t,V.start+.2,V.start+.4),'scale('+(.5+.5*back(seg(t,V.start+.2,V.start+.8)))+')');set('v-store',seg(t,V.start+.6,V.start+.9));
    set('v-badge',out(seg(t,V.start+1,V.start+1.4)),'translateY('+((1-out(seg(t,V.start+1,V.start+1.4)))*50)+'px)');set('v-vs',out(seg(t,V.start+1.6,V.start+2)));set('v-seen',seg(t,V.start+2.2,V.start+2.6))}
  const inEnd=E&&t>=E.start;set('tag',inEnd?1-seg(t,E.start,E.start+.3):1);set('logo',inEnd?1-seg(t,E.start,E.start+.3):1);
  // legenda
  let cap='';S.forEach((s,i)=>{if(t>=s.start&&t<s.end){const p=(t-s.start)/(s.end-s.start);const c=CH[i].find(c=>p>=c.a&&p<c.b)||CH[i][CH[i].length-1];cap=c?c.t:''}});
  $('capt').textContent=cap;$('cap').style.opacity=cap?1:0;
  $('prog').style.width=(t/T*1080)+'px';
};
render(0);
</script></body></html>`;
}
