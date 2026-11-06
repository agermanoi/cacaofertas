/**
 * Vídeo de teste para o TikTok Shop (afiliado): fotos reais do anúncio animadas + narração + legenda.
 * Não posta nada. Saída: shop-video/out/<out>.mp4
 *
 *   node shop-video/render.mjs            (precisa de Chromium/Playwright, ffmpeg e edge-tts)
 *   NO_TTS=1 node shop-video/render.mjs   (prévia sem voz, tempos estimados)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const DIR = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
const FPS = 30;
const OUT = join(DIR, "out");
const TMP = join(OUT, "tmp");
const VOICE = process.env.TTS_VOICE || cfg.voice;
const NO_TTS = !!process.env.NO_TTS;

const b64 = (p, type) => `data:${type};base64,${readFileSync(p).toString("base64")}`;
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(TMP, "f"), { recursive: true });

// narração e tempos
let t = 0.3;
const scenes = [];
const mp3s = [];
for (const [i, sc] of cfg.scenes.entries()) {
  let d;
  if (NO_TTS) d = sc.text.length / 15;
  else {
    const f = join(TMP, `${i}.mp3`);
    execFileSync("edge-tts", ["--voice", VOICE, "--rate", "+8%", "--text", sc.text, "--write-media", f]);
    d = dur(f);
    mp3s.push({ f, at: t });
  }
  const gap = i === cfg.scenes.length - 1 ? 1.3 : 0.3;
  scenes.push({ ...sc, start: i === 0 ? 0 : t - 0.15, end: t + d + gap - 0.15, voiceAt: t, voiceEnd: t + d });
  t += d + gap;
}
const total = Math.ceil(t * 10) / 10;
console.log(`Cenas: ${scenes.map((s) => `${s.id} ${(s.end - s.start).toFixed(1)}s`).join(", ")} · total ${total}s`);

const audio = join(TMP, "voz.m4a");
if (NO_TTS) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(total), "-c:a", "aac", audio]);
} else {
  const ins = mp3s.flatMap((m) => ["-i", m.f]);
  const del = mp3s.map((m, i) => `[${i}:a]adelay=${Math.round(m.at * 1000)}|${Math.round(m.at * 1000)}[a${i}]`).join(";");
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", ...ins,
    "-filter_complex", `${del};${mp3s.map((_, i) => `[a${i}]`).join("")}amix=inputs=${mp3s.length}:normalize=0,apad=whole_dur=${total}[o]`,
    "-map", "[o]", "-t", String(total), "-c:a", "aac", "-b:a", "160k", audio,
  ]);
}

// página animada
const imgs = Object.fromEntries([...new Set(cfg.scenes.map((s) => s.img))].map((n) => [n, b64(join(DIR, "img", n), "image/jpeg")]));
const P = "#FF7800", INK = "#17212F";
const sceneHtml = scenes
  .map((s, i) => `
<section class="sc ${s.id}" id="s${i}">
  <div class="ph"><img src="${imgs[s.img]}"></div>
  <div class="txt">
    <h1>${esc(s.title)}</h1>
    ${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ""}
    ${s.chips ? `<div class="chips">${s.chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
  </div>
</section>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:#EEF2F7;font-family:Nunito,system-ui,sans-serif;color:${INK}}
.sc{position:absolute;inset:0;opacity:0}
.ph{position:absolute;left:0;right:0;top:250px;height:900px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.ph img{width:100%;height:100%;object-fit:cover;will-change:transform}
.specs h1{font-size:76px}
.txt{position:absolute;left:70px;right:170px;top:1180px}
h1{font-weight:900;font-size:92px;line-height:1.02;letter-spacing:-1px}
.hook h1{font-size:104px;color:${INK}}
.hook h1, .price h1{background:linear-gradient(transparent 62%, ${P}55 62%);display:inline}
.price h1{font-size:150px;color:${P};background:none}
.sub{margin-top:22px;font-weight:800;font-size:46px;line-height:1.18;color:#3B4656}
.note{margin-top:22px;font-weight:800;font-size:34px;color:#7A8494}
.chips{margin-top:26px;display:flex;flex-direction:column;gap:16px}
.chips span{align-self:flex-start;background:#fff;border:4px solid ${INK};border-radius:22px;padding:12px 26px;font-weight:900;font-size:44px;opacity:0}
.cta h1{color:${P}}
#arrow{position:absolute;left:90px;top:1530px;font-size:120px;font-weight:900;color:${P};opacity:0}
#top{position:absolute;left:0;right:0;top:0;height:200px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 60px 30px}
#logo{height:70px}
#ia{background:${INK};color:#fff;font-weight:900;font-size:28px;letter-spacing:1px;padding:12px 22px;border-radius:999px}
#cap{position:absolute;left:70px;right:170px;top:1650px;font-weight:800;font-size:40px;line-height:1.2;color:#fff;background:rgba(23,33,47,.86);border-radius:20px;padding:16px 24px;opacity:0}
#bar{position:absolute;left:0;top:200px;height:8px;background:${P}}
</style></head><body>
${sceneHtml}
<div id="arrow">↓ 🛒</div>
<div id="top"><img id="logo" src="${b64(join(DIR, "..", "public/brand/logo.png"), "image/png")}"><span id="ia">CONTEÚDO GERADO POR IA</span></div>
<div id="bar"></div>
<div id="cap"></div>
<script>
const S=${JSON.stringify(scenes.map(({ id, start, end, voiceAt, voiceEnd, text, chips }) => ({ id, start, end, voiceAt, voiceEnd, text, n: chips ? chips.length : 0 })))};
const T=${total};
const ease=x=>x<0?0:x>1?1:1-Math.pow(1-x,3);
// legenda em blocos de ~6 palavras, no ritmo da fala
const caps=S.map(s=>{const w=s.text.split(' ');const out=[];for(let i=0;i<w.length;i+=6)out.push(w.slice(i,i+6).join(' '));return out});
window.render=function(t){
  S.forEach((s,i)=>{
    const el=document.getElementById('s'+i);
    const fin=ease((t-s.start)/0.35), fout=i<S.length-1?ease((t-(s.end-0.2))/0.3):0;
    const vis=t>=s.start-0.01 && t<s.end+0.15;
    el.style.opacity=vis?String(Math.min(fin,1-fout)):'0';
    if(!vis)return;
    const k=(t-s.start)/(s.end-s.start);
    const img=el.querySelector('.ph img');
    const z=1.04+0.16*k, dx=(i%2?-1:1)*30*(k-0.5);
    img.style.transform='translateX('+dx+'px) scale('+z+')';
    const tx=el.querySelector('.txt');
    tx.style.transform='translateY('+(40*(1-fin))+'px)';
    el.querySelectorAll('.chips span').forEach((c,j)=>{const a=ease((t-s.voiceAt-(j+0.6)*(s.voiceEnd-s.voiceAt)/(s.n+0.8))/0.3);c.style.opacity=a;c.style.transform='translateX('+(-40*(1-a))+'px)'});
    if(s.id==='price'){const p=1+0.06*Math.max(0,Math.sin(Math.min(1,(t-s.start)/0.6)*Math.PI));el.querySelector('h1').style.transform='scale('+p+')';el.querySelector('h1').style.transformOrigin='left center';el.querySelector('h1').style.display='inline-block'}
  });
  const last=S[S.length-1], a=ease((t-last.start-0.3)/0.3);
  const ar=document.getElementById('arrow');ar.style.opacity=t>=last.start?a:0;ar.style.transform='translateY('+(Math.sin(t*7)*14)+'px)';
  document.getElementById('bar').style.width=(1080*t/T)+'px';
  const cap=document.getElementById('cap');let txt='';
  S.forEach((s,i)=>{if(t>=s.voiceAt&&t<s.voiceEnd+0.2){const c=caps[i];const j=Math.min(c.length-1,Math.floor((t-s.voiceAt)/((s.voiceEnd-s.voiceAt)/c.length)));txt=c[j]}});
  cap.textContent=txt;cap.style.opacity=txt?1:0;
};
render(0);
</script></body></html>`;
writeFileSync(join(OUT, `${cfg.out}.html`), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.setContent(html, { waitUntil: "load", timeout: 20000 }).catch(() => {});
await page.evaluate(() => document.fonts.ready);
const n = Math.ceil(total * FPS);
const only = process.env.FRAMES ? process.env.FRAMES.split(",").map(Number) : null;
for (let i = 0; i < n; i++) {
  if (only && !only.includes(i)) continue;
  await page.evaluate((x) => window.render(x), i / FPS);
  await page.screenshot({ path: join(TMP, "f", `${String(i).padStart(5, "0")}.png`) });
}
await browser.close();
if (only) process.exit(0);

const mp4 = join(OUT, `${cfg.out}.mp4`);
execFileSync("ffmpeg", [
  "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(TMP, "f", "%05d.png"), "-i", audio,
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "copy", "-shortest", "-movflags", "+faststart", mp4,
]);
rmSync(TMP, { recursive: true, force: true });
console.log(`Pronto: ${mp4} (${(readFileSync(mp4).length / 1048576).toFixed(1)} MB, ${total}s)`);
