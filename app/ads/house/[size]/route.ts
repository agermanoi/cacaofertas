import { siteUrl } from "@/lib/site";
import { getSettings } from "@/lib/settings";
import { HOUSE_SIZES, houseProducts, type HouseSize } from "@/lib/house-ads";

/**
 * Anúncio da casa em HTML (criativo personalizado do Google Ad Manager):
 *   <iframe src="https://SITE/ads/house/970x250#%%CLICK_URL_ESC%%" …>
 * Mostra os produtos do momento (preço de hoje); o clique passa pelo contador do GAM.
 * A URL de clique do GAM vai no "#" (não chega ao servidor), então a página fica em cache
 * e um script a coloca na frente de cada link.
 * Tamanhos: 970x250, 728x90, 300x250, 320x100.
 */
export const revalidate = 600;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const conf = HOUSE_SIZES[size as HouseSize];
  if (!conf) return new Response("Tamanho inválido", { status: 404 });
  const [s, items] = await Promise.all([getSettings(), houseProducts(conf.n)]);
  const base = siteUrl();
  const utm = `utm_source=gam&utm_medium=display&utm_campaign=house-${size}`;
  const href = (path: string) => esc(`${base}${path}${path.includes("?") ? "&" : "?"}${utm}`);
  const logo = s.logoUrl.startsWith("/") ? `${base}${s.logoUrl}` : s.logoUrl;
  const P = s.colors.primary;
  const INK = s.colors.ink;

  const card = (i: (typeof items)[number], cls = "") => `
    <a class="card ${cls}" href="${href(`/produto/${i.p.slug}`)}" target="_blank" rel="noopener">
      <span class="img"><img src="${esc(i.p.image_url!)}" alt=""></span>
      <span class="info">
        <span class="name">${esc(i.p.name)}</span>
        <span class="price">${brl(Number(i.p.best_price))}</span>
        <span class="badge ${i.v.kind === "record" || i.v.kind === "below" ? "good" : ""}">${esc(i.badge)}</span>
      </span>
    </a>`;

  let body = "";
  if (size === "970x250") {
    body = `
    <div class="ad b970">
      <a class="brand" href="${href("/hoje")}" target="_blank" rel="noopener">
        <img class="logo" src="${esc(logo)}" alt="${esc(s.siteName)}">
        <span class="head">Desconto de verdade ou metade do dobro?</span>
        <span class="sub">Veja o histórico de preço antes de comprar.</span>
        <span class="cta">Ver ofertas de hoje ›</span>
      </a>
      <div class="cards">${items.map((i) => card(i)).join("")}</div>
    </div>`;
  } else if (size === "300x250") {
    body = `
    <div class="ad b300">
      <div class="top"><img class="logo" src="${esc(logo)}" alt="${esc(s.siteName)}"><span class="pill">Oferta de hoje</span></div>
      <div class="rot">${items.map((i, k) => card(i, k === 0 ? "on" : "")).join("")}</div>
      <a class="cta" href="${href("/hoje")}" target="_blank" rel="noopener">Ver histórico de preço ›</a>
    </div>`;
  } else {
    const i = items[0];
    body = `
    <a class="ad strip s${conf.w}" href="${href(i ? `/produto/${i.p.slug}` : "/hoje")}" target="_blank" rel="noopener">
      <img class="logo" src="${esc(logo)}" alt="${esc(s.siteName)}">
      ${i ? `<span class="img"><img src="${esc(i.p.image_url!)}" alt=""></span><span class="info"><span class="name">${esc(i.p.name)}</span><span class="price">${brl(Number(i.p.best_price))}</span></span>` : ""}
      <span class="cta">Ver ›</span>
    </a>`;
  }

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=${conf.w}">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${conf.w}px;height:${conf.h}px;overflow:hidden;font-family:Nunito,system-ui,sans-serif;color:${INK};background:${P}}
a{color:inherit;text-decoration:none}
.ad{width:${conf.w}px;height:${conf.h}px;background:${P};display:flex}
.logo{background:#fff;border-radius:10px;padding:5px 10px;height:40px;width:auto;object-fit:contain}
.card{display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden}
.card .img{display:flex;align-items:center;justify-content:center;background:#fff}
.card .img img{max-width:100%;max-height:100%;object-fit:contain}
.card .info{display:flex;flex-direction:column;gap:4px;padding:8px 10px 10px}
.name{font-weight:700;font-size:13px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.price{font-weight:900;font-size:20px;line-height:1.1}
.badge{align-self:flex-start;font-weight:900;font-size:10.5px;padding:2px 8px;border-radius:999px;background:#eef0f3;color:#3b4553;text-transform:uppercase;letter-spacing:.02em}
.badge.good{background:#e3f6e9;color:#146c2e}
.cta{display:inline-block;background:${INK};color:#fff;font-weight:900;border-radius:999px}
.b970{padding:16px;gap:14px}
.b970 .brand{width:250px;flex:none;display:flex;flex-direction:column;gap:8px;justify-content:center}
.b970 .head{font-weight:900;font-size:24px;line-height:1.1}
.b970 .sub{font-weight:700;font-size:14px}
.b970 .cta{align-self:flex-start;padding:8px 14px;font-size:14px;margin-top:4px}
.b970 .cards{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.b970 .card .img{height:110px;padding:8px}
.b300{flex-direction:column;padding:10px;gap:8px}
.b300 .top{display:flex;align-items:center;justify-content:space-between}
.b300 .logo{height:30px;padding:3px 8px;border-radius:8px}
.b300 .pill{background:${INK};color:#fff;font-weight:900;font-size:10.5px;padding:4px 9px;border-radius:999px;text-transform:uppercase}
.b300 .rot{position:relative;flex:1}
.b300 .card{position:absolute;inset:0;flex-direction:row;align-items:center;opacity:0;transition:opacity .5s;pointer-events:none}
.b300 .card.on{opacity:1;pointer-events:auto}
.b300 .card .img{width:120px;height:100%;flex:none;padding:8px}
.b300 .card .info{padding:8px 10px 8px 0}
.b300 .name{font-size:13.5px;-webkit-line-clamp:3}
.b300 .price{font-size:21px}
.b300 .badge{white-space:nowrap;font-size:9.5px;padding:2px 7px}
.b300 .cta{text-align:center;padding:8px;font-size:13px}
.strip{align-items:center;gap:10px;padding:0 10px}
.strip .logo{height:${conf.h > 90 ? 34 : 30}px}
.strip .img{width:${conf.h - 16}px;height:${conf.h - 16}px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none}
.strip .img img{max-width:90%;max-height:90%;object-fit:contain}
.strip .info{flex:1;display:flex;flex-direction:column;min-width:0}
.strip .name{font-size:13px;-webkit-line-clamp:${conf.h > 90 ? 2 : 1}}
.strip .price{font-size:20px}
.strip .cta{padding:7px 12px;font-size:13px;flex:none}
.s320 .logo{display:none}
</style></head><body>${body}
<script>(function(){try{var c=decodeURIComponent(location.hash.slice(1));if(c.indexOf('http')!==0)return;var a=document.querySelectorAll('a');for(var k=0;k<a.length;k++)a[k].href=c+a[k].getAttribute('href').replace(/&amp;/g,'&')}catch(e){}})();</script>
${size === "300x250" && items.length > 1 ? `<script>(function(){var c=document.querySelectorAll('.rot .card'),i=0;setInterval(function(){c[i].classList.remove('on');i=(i+1)%c.length;c[i].classList.add('on')},4000)})();</script>` : ""}
</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, s-maxage=600, stale-while-revalidate=600", "x-robots-tag": "noindex" },
  });
}
