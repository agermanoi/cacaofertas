/**
 * Vídeo vertical (10 s, 1080 × 1920) de uma oferta, enviado como rascunho para o TikTok.
 *
 *   npm run video                        escolhe a melhor oferta do momento (mesma lógica dos posts)
 *   npm run video -- fire-tv-stick-4k    força um produto
 *   npm run video -- fire-tv-stick-4k --no-send   só gera (não manda para o TikTok)
 *
 * Roda no GitHub Actions (precisa de Chromium + ffmpeg). O MP4 fica em out/ e no Storage
 * (brand/social/video/...). No TikTok ele cai na caixa de entrada: você escolhe o som e publica.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { adminClient } from "../lib/supabase";
import type { ProductOverview } from "../lib/types";
import { isInflated, verdictFor } from "../lib/verdict";
import { mergeSettings } from "../lib/settings";
import { getSocialConfig, pickCandidates } from "../lib/social";
import { tiktokPublishStatus, tiktokSendVideoDraft, tiktokStatus } from "../lib/tiktok";
import { VIDEO_FPS, VIDEO_SECONDS, videoHtml } from "../lib/video";

const db = adminClient();
const OUT = join(process.cwd(), "out");

const fileData = (path: string, type: string) => {
  try {
    return `data:${type};base64,${readFileSync(path).toString("base64")}`;
  } catch {
    return null;
  }
};

async function urlData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const tries = [url.replace(/\._AC_[A-Z]{2}\d+_\./, "._AC_SL1000_."), url];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; CacaOfertasBot/1.0)" } });
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.startsWith("image/")) return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    } catch {
      /* tenta a próxima */
    }
  }
  return null;
}

function formatSeen(iso: string): string {
  const tz = "America/Sao_Paulo";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}`;
}

async function pickProduct(slug: string | undefined): Promise<ProductOverview> {
  if (slug) {
    const { data } = await db.from("product_overview").select("*").eq("slug", slug).not("best_price", "is", null).maybeSingle();
    if (!data) throw new Error(`Produto "${slug}" não encontrado ou sem preço.`);
    return data as ProductOverview;
  }
  const cfg = await getSocialConfig(db);
  const [c] = await pickCandidates(db, cfg, 1);
  if (!c) throw new Error("Nenhuma oferta boa para o vídeo agora.");
  return c.p;
}

async function main() {
  const args = process.argv.slice(2);
  const send = !args.includes("--no-send");
  const slug = args.find((a) => !a.startsWith("--"))?.trim() || undefined;

  const p = await pickProduct(slug);
  const v = verdictFor(p);
  if (isInflated(v.kind)) console.warn(`Atenção: ${p.slug} está com desconto inflado (${v.kind}).`);
  console.log(`Produto: ${p.name} (${p.slug}) — ${v.kind}`);

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: daily }, { data: settingsRow }, { data: offer }] = await Promise.all([
    db.from("product_daily").select("day,min_price").eq("product_id", p.id).gte("day", since).order("day"),
    db.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    p.best_offer_id ? db.from("offers").select("last_seen_at").eq("id", p.best_offer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const s = mergeSettings(settingsRow?.data);
  const price = Number(p.best_price);
  const history = (daily || []).map((d) => ({ day: String(d.day), price: Number(d.min_price) })).filter((h) => h.price > 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (!history.length || history[history.length - 1].day !== today) history.push({ day: today, price });
  else history[history.length - 1].price = price;

  const good = v.kind === "record" || v.kind === "below";
  const badge =
    v.kind === "record" ? "MENOR PREÇO JÁ VISTO" : v.kind === "below" ? `${Math.round((v.vsAvg || 0) * 100)}% ABAIXO DA MÉDIA` : "MENOR PREÇO DE HOJE";
  const pct = v.vsAvg != null ? Math.round(v.vsAvg * 100) : 0;

  const html = videoHtml({
    name: p.name,
    store: p.best_store,
    price,
    photo: await urlData(p.image_url),
    logo: fileData("public/brand/logo.png", "image/png"),
    mascot: fileData("public/brand/mascote.png", "image/png"),
    history,
    avg: p.avg_30d != null ? Number(p.avg_30d) : null,
    badge,
    good,
    off: good && pct >= 5 ? `−${pct}%` : null,
    seen: offer?.last_seen_at ? formatSeen(offer.last_seen_at) : null,
    colors: { primary: s.colors.primary, ink: s.colors.ink },
    host: (process.env.NEXT_PUBLIC_SITE_URL || "https://cacaofertas.com.br").replace(/^https?:\/\//, "").replace(/\/$/, ""),
  });

  // quadros
  const frames = join(OUT, "frames");
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  writeFileSync(join(OUT, "video.html"), html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const total = VIDEO_SECONDS * VIDEO_FPS;
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => (window as unknown as { render: (t: number) => void }).render(t), i / VIDEO_FPS);
    await page.screenshot({ path: join(frames, `${String(i).padStart(4, "0")}.png`) });
  }
  await browser.close();

  const mp4 = join(OUT, `${p.slug}.mp4`);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    "-framerate", String(VIDEO_FPS), "-i", join(frames, "%04d.png"),
    "-f", "lavfi", "-t", String(VIDEO_SECONDS), "-i", "anullsrc=r=44100:cl=stereo",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4,
  ]);
  rmSync(frames, { recursive: true, force: true });
  const buf = readFileSync(mp4);
  console.log(`Vídeo: ${mp4} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);

  const path = `social/video/${today}/${p.slug}-${Date.now().toString(36)}.mp4`;
  const { error } = await db.storage.from("brand").upload(path, buf, { contentType: "video/mp4", upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Upload do vídeo: ${error.message}`);
  const url = db.storage.from("brand").getPublicUrl(path).data.publicUrl;
  console.log(`Storage: ${url}`);

  if (!send) return;
  const tk = await tiktokStatus(db);
  if (!tk.connected) {
    console.log("TikTok não conectado: o vídeo ficou só no Storage e nos arquivos da execução.");
    return;
  }
  const id = await tiktokSendVideoDraft(db, url);
  console.log(`TikTok: enviado (publish_id ${id}). Acompanhando…`);
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await tiktokPublishStatus(db, id);
    console.log(`  ${st.status}${st.reason ? ` — ${st.reason}` : ""}`);
    if (st.status === "SEND_TO_USER_INBOX" || st.status === "PUBLISH_COMPLETE") {
      console.log("Pronto: abra o TikTok → caixa de entrada/notificações para escolher o som e publicar.");
      return;
    }
    if (st.status === "FAILED" || st.status === "ERRO") throw new Error(`TikTok recusou o vídeo: ${st.reason || st.status}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
