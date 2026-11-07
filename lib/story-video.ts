/**
 * Modelo do vídeo de história narrada (1080 × 1920), para canais de conteúdo (ex.: motivacional).
 * Visual escuro e cinematográfico: tipografia animada por cena + legenda palavra por palavra.
 * A página tem window.render(t); scripts/story-video.ts tira um print por quadro e junta com a narração.
 */

export type StorySceneType = "number" | "title" | "road" | "nos" | "quote" | "end";

export interface StorySceneInput {
  type: StorySceneType;
  text: string;
  big?: string;
  kicker?: string;
  value?: number;
  prefix?: string;
  label?: string;
}

export interface StoryScene extends StorySceneInput {
  start: number;
  end: number;
}

export interface Word {
  w: string;
  s: number;
  e: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Junta as palavras em blocos curtos (até 4 palavras, quebra em pausa ou pontuação). */
export function captionGroups(words: Word[]): { s: number; e: number; words: Word[] }[] {
  const groups: { s: number; e: number; words: Word[] }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) groups.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((n, x) => n + x.w.length + 1, 0);
    if (prev && (w.s - prev.e > 0.35 || cur.length >= 4 || chars + w.w.length > 22 || /[.,!?;:]$/.test(prev.w))) flush();
    cur.push(w);
  }
  flush();
  // cada bloco fica na tela até o próximo começar
  for (let i = 0; i < groups.length - 1; i++) groups[i].e = Math.min(groups[i + 1].s, groups[i].e + 0.6);
  return groups;
}

function sceneHtml(sc: StoryScene, i: number): string {
  const big = esc(sc.big || "");
  const kicker = sc.kicker ? `<div class="kicker">${esc(sc.kicker)}</div>` : "";
  const words = (sc.big || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, k) => `<span class="bw" data-k="${k}">${esc(w)}</span>`)
    .join(" ");
  switch (sc.type) {
    case "number":
      return `<div class="sc" id="s${i}"><div class="num"><span class="pre">${esc(sc.prefix || "")}</span><span class="n">0</span></div><div class="lab">${esc(sc.label || "")}</div></div>`;
    case "road":
      return `<div class="sc" id="s${i}">
<svg class="road" viewBox="0 0 1080 1100" preserveAspectRatio="none">
  <defs><linearGradient id="rg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#222" stop-opacity="0"/><stop offset=".35" stop-color="#1c1c22"/><stop offset="1" stop-color="#2a2a33"/></linearGradient></defs>
  <g class="rd"><path d="M500 0 L580 0 L1000 1100 L80 1100 Z" fill="url(#rg${i})"/>
  <path d="M500 0 L80 1100" stroke="#F5B83D" stroke-opacity=".5" stroke-width="6"/><path d="M580 0 L1000 1100" stroke="#F5B83D" stroke-opacity=".5" stroke-width="6"/>
  ${Array.from({ length: 9 }, (_, k) => `<rect class="dash" data-k="${k}" x="530" width="20" fill="#fff" fill-opacity=".8"/>`).join("")}</g>
</svg>
<div class="title bot">${kicker}<div class="big">${words}</div></div></div>`;
    case "nos":
      return `<div class="sc" id="s${i}">${Array.from({ length: 14 }, (_, k) => `<div class="no" data-k="${k}">NÃO</div>`).join("")}<div class="title"><div class="big huge">${big}</div></div></div>`;
    case "quote":
      return `<div class="sc" id="s${i}"><div class="title"><div class="big huge">${words}</div><div class="line"></div></div></div>`;
    case "end":
      return `<div class="sc" id="s${i}"><div class="title"><div class="big">${words}</div><div class="follow">Siga para a próxima</div></div></div>`;
    default:
      return `<div class="sc" id="s${i}"><div class="title">${kicker}<div class="big">${words}</div></div></div>`;
  }
}

export function storyHtml(scenes: StoryScene[], words: Word[], total: number, accent = "#F5B83D"): string {
  const groups = captionGroups(words);
  const A = accent;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:#08080B;color:#fff;font-family:Inter,sans-serif}
.l{position:absolute;will-change:transform,opacity}
#bg{inset:-200px}
.blob{position:absolute;border-radius:50%;filter:blur(120px)}
#b1{width:900px;height:900px;background:${A};opacity:.20}
#b2{width:700px;height:700px;background:#7A3B12;opacity:.30}
#vig{inset:0;background:radial-gradient(ellipse at 50% 42%,transparent 35%,rgba(0,0,0,.85) 100%)}
#grain{inset:-100px;opacity:.09;mix-blend-mode:overlay}
.sc{position:absolute;inset:0;opacity:0}
.title{position:absolute;left:90px;right:90px;top:430px;height:640px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:34px}
.title.bot{top:330px;height:420px}
.kicker{font-weight:900;font-size:40px;letter-spacing:10px;text-transform:uppercase;color:${A}}
.big{font-family:Anton,sans-serif;font-size:136px;line-height:1.02;text-transform:uppercase;letter-spacing:1px}
.big.huge{font-size:210px}
.bw{display:inline-block}
.num{position:absolute;left:0;right:0;top:420px;text-align:center;font-family:Anton,sans-serif;font-size:470px;line-height:1;color:${A};text-shadow:0 0 80px rgba(245,184,61,.35)}
.num .pre{font-size:300px;vertical-align:top}
.lab{position:absolute;left:80px;right:80px;top:930px;text-align:center;font-family:Anton,sans-serif;font-size:96px;text-transform:uppercase}
.road{position:absolute;left:0;top:820px;width:1080px;height:1100px}
.no{position:absolute;font-family:Anton,sans-serif;font-size:120px;color:#fff;opacity:0}
.line{height:12px;width:0;background:${A};border-radius:6px}
.follow{font-weight:900;font-size:52px;background:${A};color:#111;padding:22px 52px;border-radius:999px}
#cap{left:60px;right:60px;top:1170px;height:300px;display:flex;align-items:center;justify-content:center;text-align:center}
#cap .g{font-weight:900;font-size:74px;line-height:1.12;word-spacing:14px;text-transform:uppercase;text-shadow:0 6px 0 #000,0 0 30px rgba(0,0,0,.9)}
#cap .w{display:inline-block;transform-origin:50% 60%}
#prog{left:0;top:0;height:8px;background:${A}}
</style></head><body>
<div id="bg" class="l"><div id="b1" class="blob"></div><div id="b2" class="blob"></div></div>
${scenes.map(sceneHtml).join("\n")}
<div id="vig" class="l"></div>
<svg id="grain" class="l" width="1280" height="2120"><filter id="nz"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#nz)"/></svg>
<div id="cap" class="l"><div class="g"></div></div>
<div id="prog" class="l"></div>
<script>
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const seg=(t,a,b)=>cl((t-a)/(b-a));
const out=x=>1-Math.pow(1-x,3);
const back=x=>{const c=1.6;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const SC=${JSON.stringify(scenes.map((s) => ({ type: s.type, start: s.start, end: s.end, value: s.value || 0 })))};
const GR=${JSON.stringify(groups.map((g) => ({ s: g.s, e: g.e, w: g.words.map((w) => [w.w, w.s]) })))};
const TOTAL=${total};
const ACC=${JSON.stringify(A)};
let lastG=-1;
function rnd(k){const x=Math.sin(k*999.7)*10000;return x-Math.floor(x)}
window.render=function(t){
  // fundo: manchas de luz lentas e grão
  $('b1').style.transform='translate('+(260+Math.sin(t*.23)*160)+'px,'+(420+Math.cos(t*.17)*220)+'px)';
  $('b2').style.transform='translate('+(420+Math.cos(t*.19)*200)+'px,'+(1300+Math.sin(t*.21)*200)+'px)';
  $('grain').style.transform='translate('+(-Math.floor(rnd(Math.floor(t*24))*90))+'px,'+(-Math.floor(rnd(Math.floor(t*24)+7)*90))+'px)';
  SC.forEach((s,i)=>{
    const el=$('s'+i); const L=t-s.start, D=s.end-s.start;
    const vis=t>=s.start-.3&&t<s.end+.3;
    if(!vis){el.style.opacity=0;return}
    const fin=out(seg(t,s.start-.05,s.start+.35)), fo=seg(t,s.end-.25,s.end+.1);
    const o=fin*(1-fo);
    el.style.opacity=o;
    el.style.filter=fo>0?'blur('+(fo*14)+'px)':'none';
    el.style.transform='scale('+(1+.06*cl(L/D))+')';
    el.querySelectorAll('.bw').forEach(w=>{const k=+w.dataset.k;const p=seg(L,.15+k*.12,.55+k*.12);w.style.opacity=p;w.style.transform='translateY('+((1-out(p))*60)+'px) scale('+(.85+.15*back(p))+')'});
    if(s.type==='number'){
      const p=out(seg(L,.1,1.5));
      el.querySelector('.n').textContent=Math.round(s.value*p).toLocaleString('pt-BR');
      el.querySelector('.num').style.transform='scale('+(.7+.3*back(seg(L,0,.6)))+')';
      const lb=el.querySelector('.lab'); const q=out(seg(L,1.2,1.6)); lb.style.opacity=q; lb.style.transform='translateY('+((1-q)*50)+'px)';
    }
    if(s.type==='road'){
      el.querySelectorAll('.dash').forEach(d=>{const k=+d.dataset.k;const ph=((k/9)+L*.35)%1;const y=Math.pow(ph,2.2)*1100;d.setAttribute('y',y);d.setAttribute('height',10+ph*120);d.setAttribute('x',540-(4+ph*16));d.setAttribute('width',8+ph*32)});
      const sw=out(seg(L,D*.42,D*.75));
      el.querySelector('.rd').setAttribute('transform','translate('+(sw*700)+' 0) skewX('+(-sw*30)+')');
      el.querySelector('.road').style.opacity=1-sw*.85;
    }
    if(s.type==='nos'){
      el.querySelectorAll('.no').forEach(n=>{const k=+n.dataset.k;const at=.2+k*(D*.8/14);const p=seg(L,at,at+.12);
        n.style.left=(40+rnd(k+1)*760)+'px';n.style.top=(260+rnd(k+21)*1250)+'px';
        n.style.opacity=p*(.10+rnd(k+40)*.18);n.style.transform='rotate('+((rnd(k+3)-.5)*40)+'deg) scale('+(1.8-.8*out(p))*(.6+rnd(k+9)*.9)+')'});
      const b=el.querySelector('.big');const p=seg(L,0,.25);b.style.opacity=p;b.style.transform='scale('+(2.2-1.2*out(p))+')';
    }
    if(s.type==='quote'){el.querySelector('.line').style.width=(out(seg(L,1.2,2.4))*520)+'px'}
    if(s.type==='end'){const f=el.querySelector('.follow');const p=seg(L,.8,1.2);f.style.opacity=p;f.style.transform='scale('+(.6+.4*back(p))+')'}
  });
  // legenda
  let gi=-1; for(let k=0;k<GR.length;k++){if(t>=GR[k].s-.05&&t<GR[k].e){gi=k;break}}
  const g=$('cap').firstElementChild;
  if(gi!==lastG){g.innerHTML=gi<0?'':GR[gi].w.map(w=>'<span class="w">'+w[0].replace(/[&<>]/g,'')+'</span>').join(' ');lastG=gi}
  if(gi>=0){
    const G=GR[gi]; const pin=out(seg(t,G.s-.05,G.s+.12));
    g.style.opacity=pin; g.style.transform='scale('+(.92+.08*back(pin))+')';
    g.querySelectorAll('.w').forEach((el,k)=>{const on=t>=G.w[k][1]-.03&&(k===G.w.length-1||t<G.w[k+1][1]-.03);el.style.color=on?ACC:'#fff';el.style.transform='none'});
  }
  $('prog').style.width=(t/TOTAL*1080)+'px';
};
render(0);
</script></body></html>`;
}
