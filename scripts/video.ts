/**
 * Vídeos verticais (1080 × 1920) para o TikTok, enviados como rascunho para a caixa de entrada.
 *
 *   npm run video -- --pending           automático: faz o vídeo dos posts publicados nas últimas
 *                                        24 h que ainda não foram para o TikTok (GitHub Actions, de hora em hora)
 *   npm run video -- --pending --check   só conta quantos estão pendentes (para pular a instalação do Chromium)
 *   npm run video -- fire-tv-stick-4k    vídeo avulso de um produto
 *   npm run video -- fire-tv-stick-4k --no-send   só gera (não manda para o TikTok)
 *
 * Produto → vídeo animado de 10 s (gráfico do histórico + preço).
 * Cupom / data especial → a arte vertical do post com um zoom lento (8 s).
 *
 * A API do TikTok não aceita legenda em rascunho de vídeo: a legenda fica pronta para copiar
 * em Admin → Redes sociais (botão "Copiar legenda do TikTok").
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../lib/supabase";
import type { ProductOverview } from "../lib/types";
import { isInflated, verdictFor } from "../lib/verdict";
import { mergeSettings } from "../lib/settings";
import { getSocialConfig, pickCandidates } from "../lib/social";
import { tiktokDirectEnabled, tiktokPublishStatus, tiktokSendVideoDraft, tiktokStatus } from "../lib/tiktok";
import { VIDEO_FPS, VIDEO_SECONDS, videoHtml } from "../lib/video";

const db: SupabaseClient = adminClient();
/** marca dos vídeos prontos esperando a publicação direta pelo admin */
const DIRECT_READY = "pronto para publicar";
const OUT = join(process.cwd(), "out");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const fileData = (path: string, type: string) => {
  try {
    return `data:${type};base64,${readFileSync(path).toString("base64")}`;
  } catch {
    return null;
  }
};

async function download(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; CacaOfertasBot/1.0)" } });
    const type = r.headers.get("content-type") || "";
    if (r.ok && type.startsWith("image/")) return { buf: Buffer.from(await r.arrayBuffer()), type };
  } catch {
    /* sem imagem */
  }
  return null;
}

async function urlData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  for (const u of [url.replace(/\._AC_[A-Z]{2}\d+_\./, "._AC_SL1000_."), url]) {
    const d = await download(u);
    if (d) return `data:${d.type};base64,${d.buf.toString("base64")}`;
  }
  return null;
}

function formatSeen(iso: string): string {
  const tz = "America/Sao_Paulo";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}`;
}

function encode(input: string[], mp4: string, seconds: number, filter?: string) {
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    ...input,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=44100:cl=stereo",
    ...(filter ? ["-filter_complex", filter, "-map", "[v]", "-map", "1:a"] : []),
    "-t", String(seconds),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4,
  ]);
}

/* ------------------------------------------------------------ produto (animado) */

let browser: Browser | null = null;

async function productVideo(p: ProductOverview): Promise<string> {
  const v = verdictFor(p);
  if (isInflated(v.kind)) console.warn(`Atenção: ${p.slug} está com desconto inflado (${v.kind}).`);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: daily }, { data: settingsRow }, { data: offer }] = await Promise.all([
    db.from("product_daily").select("day,min_price").eq("product_id", p.id).gte("day", since).order("day"),
    db.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    p.best_offer_id ? db.from("offers").select("last_seen_at").eq("id", p.best_offer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const s = mergeSettings(settingsRow?.data);
  const price = Number(p.best_price);
  const history = (daily || []).map((d) => ({ day: String(d.day), price: Number(d.min_price) })).filter((h) => h.price > 0);
  if (!history.length || history[history.length - 1].day !== today()) history.push({ day: today(), price });
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

  const frames = join(OUT, "frames");
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  browser ||= await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < VIDEO_SECONDS * VIDEO_FPS; i++) {
    await page.evaluate((t) => (window as unknown as { render: (t: number) => void }).render(t), i / VIDEO_FPS);
    await page.screenshot({ path: join(frames, `${String(i).padStart(4, "0")}.png`) });
  }
  await page.close();
  const mp4 = join(OUT, `${p.slug}-${Date.now().toString(36)}.mp4`);
  encode(["-framerate", String(VIDEO_FPS), "-i", join(frames, "%04d.png")], mp4, VIDEO_SECONDS);
  rmSync(frames, { recursive: true, force: true });
  return mp4;
}

/* ------------------------------------------------- cupom / data (arte + zoom) */

async function artVideo(slug: string, storyUrl: string): Promise<string> {
  const img = await download(storyUrl);
  if (!img) throw new Error("arte vertical do post indisponível");
  const src = join(OUT, `${slug}-story.jpg`);
  writeFileSync(src, img.buf);
  const mp4 = join(OUT, `${slug}-${Date.now().toString(36)}.mp4`);
  const secs = 8;
  const frames = secs * VIDEO_FPS;
  encode(
    ["-loop", "1", "-framerate", String(VIDEO_FPS), "-i", src],
    mp4,
    secs,
    `[0:v]scale=2160:3840,zoompan=z='1+0.07*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${VIDEO_FPS},fade=t=in:st=0:d=0.4[v]`,
  );
  rmSync(src, { force: true });
  return mp4;
}

/* ------------------------------------------------------------ envio */

async function upload(mp4: string, slug: string): Promise<string> {
  const buf = readFileSync(mp4);
  console.log(`  vídeo ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  const path = `social/video/${today()}/${slug}-${Date.now().toString(36)}.mp4`;
  const { error } = await db.storage.from("brand").upload(path, buf, { contentType: "video/mp4", upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`upload do vídeo: ${error.message}`);
  return db.storage.from("brand").getPublicUrl(path).data.publicUrl;
}

async function sendAndWait(url: string): Promise<string> {
  const id = await tiktokSendVideoDraft(db, url);
  console.log(`  TikTok: enviado (${id})`);
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await tiktokPublishStatus(db, id);
    console.log(`    ${st.status}${st.reason ? ` — ${st.reason}` : ""}`);
    if (st.status === "SEND_TO_USER_INBOX" || st.status === "PUBLISH_COMPLETE") break;
    if (st.status === "FAILED") throw new Error(`TikTok recusou o vídeo: ${st.reason || st.status}`);
  }
  return id;
}

/* ------------------------------------------------------------ modos */

interface PendingPost {
  id: number;
  kind: string;
  slug: string;
  story_url: string | null;
}

async function pendingPosts(): Promise<PendingPost[]> {
  const cfg = await getSocialConfig(db);
  if (!cfg.tiktok || !cfg.tiktokVideo) return [];
  const { data } = await db
    .from("social_posts")
    .select("id,kind,slug,story_url")
    .eq("status", "published")
    .is("tiktok_publish_id", null)
    .is("tiktok_error", null)
    .gte("published_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("published_at", { ascending: true })
    .limit(4);
  return (data || []) as PendingPost[];
}

async function runPending(checkOnly: boolean) {
  const list = await pendingPosts();
  if (checkOnly) {
    console.log(`Pendentes: ${list.length}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pending=${list.length}\n`);
    return;
  }
  if (!list.length) return console.log("Nada pendente.");
  if (!(await tiktokStatus(db)).connected) return console.log("TikTok não conectado.");

  let fails = 0;
  for (const post of list) {
    console.log(`Post ${post.id} (${post.kind}: ${post.slug})`);
    // trava: marca como em andamento para outra execução não pegar o mesmo
    const { data: lock } = await db
      .from("social_posts")
      .update({ tiktok_error: "gerando vídeo…" })
      .eq("id", post.id)
      .is("tiktok_publish_id", null)
      .is("tiktok_error", null)
      .select("id")
      .maybeSingle();
    if (!lock) continue;
    try {
      let mp4: string;
      if (post.kind === "product") {
        const { data } = await db.from("product_overview").select("*").eq("slug", post.slug).maybeSingle();
        if (!data || (data as ProductOverview).best_price == null) throw new Error("produto sem preço agora");
        mp4 = await productVideo(data as ProductOverview);
      } else {
        if (!post.story_url) throw new Error("post sem arte vertical");
        mp4 = await artVideo(post.slug.replace(/[^\w-]+/g, "-"), post.story_url);
      }
      const url = await upload(mp4, post.slug.replace(/[^\w-]+/g, "-"));
      if (await tiktokDirectEnabled(db)) {
        // postagem direta: o vídeo fica pronto e você publica pelo admin (legenda, privacidade, confirmação)
        await db.from("social_posts").update({ tiktok_video_url: url, tiktok_error: DIRECT_READY }).eq("id", post.id);
        console.log("  pronto para publicar em Admin → Redes sociais");
        continue;
      }
      const id = await sendAndWait(url);
      await db.from("social_posts").update({ tiktok_publish_id: id, tiktok_video_url: url, tiktok_error: null }).eq("id", post.id);
    } catch (e) {
      fails++;
      const msg = (e as Error).message.slice(0, 300);
      console.error(`  erro: ${msg}`);
      await db.from("social_posts").update({ tiktok_error: msg }).eq("id", post.id);
    }
  }
  if (fails === list.length) process.exitCode = 1;
}

async function runOne(slug: string | undefined, send: boolean) {
  let p: ProductOverview;
  if (slug) {
    const { data } = await db.from("product_overview").select("*").eq("slug", slug).not("best_price", "is", null).maybeSingle();
    if (!data) throw new Error(`Produto "${slug}" não encontrado ou sem preço.`);
    p = data as ProductOverview;
  } else {
    const [c] = await pickCandidates(db, await getSocialConfig(db), 1);
    if (!c) throw new Error("Nenhuma oferta boa para o vídeo agora.");
    p = c.p;
  }
  console.log(`Produto: ${p.name} (${p.slug})`);
  const mp4 = await productVideo(p);
  const url = await upload(mp4, p.slug);
  console.log(`  ${url}`);
  if (send) {
    if (!(await tiktokStatus(db)).connected) return console.log("TikTok não conectado: o vídeo ficou só no Storage.");
    await sendAndWait(url);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2);
  if (args.includes("--pending")) await runPending(args.includes("--check"));
  else await runOne(args.find((a) => !a.startsWith("--"))?.trim() || undefined, !args.includes("--no-send"));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => browser?.close());
