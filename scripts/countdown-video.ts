/**
 * Vídeo "Faltam N dias pra Black Friday": abertura, 4 produtos abaixo da média (com foto real,
 * preço de hoje e a média de 30 dias) e fechamento. Também salva cada tela como PNG (galeria/carrossel).
 * Não posta nada. Saída: out/contagem/
 *
 *   npm run countdown-video
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { adminClient } from "../lib/supabase";
import { pickWeekly } from "../lib/newsletter";

const FPS = 30;
const OUT = join(process.cwd(), "out", "contagem");
const db = adminClient();
const BF = process.env.BF_DATE || "2026-11-27";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const money0 = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const b64 = (p: string, t: string) => `data:${t};base64,${readFileSync(p).toString("base64")}`;

async function img(url: string | null): Promise<string | null> {
  if (!url) return null;
  for (const u of [url.replace(/-[A-Z]\.jpg$/, "-F.jpg"), url]) {
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; CacaOfertasBot/1.0)" } });
      const t = r.headers.get("content-type") || "";
      if (r.ok && t.startsWith("image/")) return `data:${t};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    } catch {
      /* próxima */
    }
  }
  return null;
}

async function main() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const days = Math.round((Date.parse(BF) - Date.parse(today)) / 86_400_000);
  const { data: rows } = await db
    .from("product_overview")
    .select("name,slug,category,best_price,best_store,avg_30d,min_all,days_tracked,image_url")
    .not("best_price", "is", null);
  const picked = pickWeekly(rows || [], 4);
  if (picked.length < 3) throw new Error("Poucos produtos abaixo da média hoje.");
  const items = await Promise.all(
    picked.map(async (p) => {
      const price = Number(p.best_price);
      const avg = Number(p.avg_30d);
      const record = p.min_all != null && price <= Number(p.min_all) + 0.005;
      const pct = Math.round((1 - price / avg) * 100);
      const short = p.name
        .replace(/^(Smart TV|Notebook( Gamer)?|Smartwatch|Cafeteira|Console|Headset Gamer|Monitor Gamer|Fone)\s+/i, "")
        .replace(/\s+(com|de|\d+GB|\d+TB|\d+ ?Hz|5G).*$/i, "")
        .split(/\s+/)
        .slice(0, 4)
        .join(" ");
      const head = record ? `Menor preço que já vimos no ${short}` : `${money0(avg - price)} a menos no ${short}`;
      return { ...p, price, avg, record, pct, head, photo: await img(p.image_url) };
    })
  );
  console.log(`Faltam ${days} dias · ${items.map((i) => `${i.name} ${money(i.price)} (-${i.pct}% vs média)`).join(" | ")}`);

  // tempos: abertura 3,2 s, 3,2 s por produto, fechamento 2,8 s
  const scenes = [
    { id: "hook", d: 3.2 },
    ...items.map((_, i) => ({ id: `p${i}`, d: 3.2 })),
    { id: "end", d: 2.8 },
  ];
  let t = 0;
  const timed = scenes.map((s) => {
    const o = { ...s, start: t, end: t + s.d };
    t += s.d;
    return o;
  });
  const total = Math.round(t * 10) / 10;

  const logo = b64("public/brand/logo.png", "image/png");
  const cards = items
    .map(
      (p, i) => `
<section class="sc" id="p${i}">
  <h1 class="head">${esc(p.head)}</h1>
  <div class="card">
    <div class="tag">${p.record ? "MENOR PREÇO JÁ VISTO" : `${p.pct}% ABAIXO DA MÉDIA`}</div>
    <p class="name">${esc(p.name)}</p>
    <p class="store">${esc(p.best_store || "")} · histórico de ${p.days_tracked} dias</p>
    <div class="ph">${p.photo ? `<img src="${p.photo}">` : ""}</div>
    <p class="avg">Média de 30 dias: <s>${money(p.avg)}</s></p>
    <p class="price">${money(p.price)}</p>
  </div>
</section>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;font-family:Nunito,system-ui,sans-serif}
body{background:linear-gradient(180deg,#FF7800 0%,#FF5A1F 100%);color:#fff}
.sc{position:absolute;inset:0;opacity:0;padding:0 70px}
#hook h1{position:absolute;left:70px;right:170px;top:520px;font-size:150px;line-height:.98;font-weight:900;letter-spacing:-3px}
#hook p{position:absolute;left:70px;right:170px;top:1180px;font-size:58px;font-weight:800}
.head{position:absolute;left:60px;right:60px;top:150px;font-size:84px;line-height:1.02;font-weight:900;letter-spacing:-2px}
.card{position:absolute;left:60px;right:60px;top:560px;height:1040px;background:#FFF8F1;border-radius:44px;color:#17212F;padding:46px 50px;box-shadow:0 30px 60px rgba(0,0,0,.18)}
.tag{display:inline-block;background:#17212F;color:#fff;font-weight:900;font-size:32px;padding:12px 20px;border-radius:16px;margin-bottom:18px}
.name{font-size:50px;font-weight:900;line-height:1.08}
.store{font-size:32px;color:#5B6573;margin-top:12px;font-weight:800}
.ph{position:absolute;left:50px;right:50px;top:330px;height:440px;display:flex;align-items:center;justify-content:center}
.ph img{max-width:100%;max-height:100%;object-fit:contain}
.avg{position:absolute;left:50px;bottom:200px;font-size:38px;color:#5B6573;font-weight:800}
.price{position:absolute;left:50px;bottom:60px;font-size:132px;font-weight:900;color:#E24A00;letter-spacing:-3px}
#end h1{position:absolute;left:70px;right:170px;top:620px;font-size:140px;line-height:1;font-weight:900;letter-spacing:-3px}
#end p{position:absolute;left:70px;right:170px;top:1000px;font-size:54px;font-weight:800;line-height:1.25}
#logo{position:absolute;left:60px;bottom:120px;height:90px;background:#fff;border-radius:22px;padding:14px 22px}
#bar{position:absolute;left:0;top:0;height:10px;background:#17212F}
</style></head><body>
<section class="sc" id="hook"><h1>Faltam ${days} dias pra Black Friday…</h1><p>…e esses já estão abaixo do preço normal 👇</p></section>
${cards}
<section class="sc" id="end"><h1>Links na bio 🔗</h1><p>Histórico de preço de cada um em cacaofertas.com.br</p></section>
<div id="bar"></div>
<script>
const S=${JSON.stringify(timed.map(({ id, start, end }) => ({ id, start, end })))};const T=${total};
const e=x=>x<0?0:x>1?1:1-Math.pow(1-x,3);
window.render=function(t){
  S.forEach((s,i)=>{const el=document.getElementById(s.id);const last=i===S.length-1;
    const a=e((t-s.start)/0.28), b=last?0:e((t-(s.end-0.22))/0.22);
    const on=t>=s.start-0.01&&t<s.end+0.2; el.style.opacity=on?Math.min(a,1-b):0; if(!on)return;
    el.style.transform='translateY('+(60*(1-a))+'px)';
    const card=el.querySelector('.card'); if(card){const k=e((t-s.start-0.12)/0.35);card.style.transform='translateY('+(160*(1-k))+'px) scale('+(0.94+0.06*k)+')';}
    const pr=el.querySelector('.price'); if(pr){const k=Math.max(0,Math.sin(Math.min(1,(t-s.start-0.45)/0.5)*Math.PI));pr.style.transform='scale('+(1+0.07*k)+')';pr.style.transformOrigin='left bottom';}
    const im=el.querySelector('.ph img'); if(im){im.style.transform='scale('+(1+0.05*(t-s.start)/(s.end-s.start))+')';}
  });
  document.getElementById('bar').style.width=(1080*t/T)+'px';
};render(0);
</script></body></html>`;

  rmSync(OUT, { recursive: true, force: true });
  const frames = join(OUT, "f");
  mkdirSync(frames, { recursive: true });
  writeFileSync(join(OUT, "contagem.html"), html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // galeria: um PNG por tela, no ponto em que tudo já entrou
  for (const [i, s] of timed.entries()) {
    await page.evaluate((x) => (window as unknown as { render: (t: number) => void }).render(x), s.start + 1.2);
    await page.screenshot({ path: join(OUT, `tela-${i + 1}.png`) });
  }
  const n = Math.ceil(total * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => (window as unknown as { render: (t: number) => void }).render(x), i / FPS);
    await page.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.png`) });
  }
  await browser.close();
  const mp4 = join(OUT, "contagem-black-friday.mp4");
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(frames, "%05d.png"),
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4,
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`Pronto: ${mp4} (${total}s) e ${timed.length} imagens.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
