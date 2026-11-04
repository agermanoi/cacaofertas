/**
 * Vídeo de análise "Vale a pena comprar?" com narração (teste: só gera o arquivo, não posta).
 *
 *   npm run review-video -- iphone-17-pro-256gb
 *
 * Precisa de Chromium (Playwright), ffmpeg e edge-tts (pip). Roda no GitHub Actions.
 * Saída: out/review-<slug>.mp4
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { adminClient } from "../lib/supabase";
import type { ProductOverview } from "../lib/types";
import { periodLabel, verdictFor } from "../lib/verdict";
import { mergeSettings } from "../lib/settings";
import { getSpecs } from "../lib/specs";
import { atStore } from "../lib/social";
import { reviewHtml, shortSpec, speakable, spokenMoney, type ReviewScene } from "../lib/review-video";

const FPS = 30;
const VOICE = process.env.TTS_VOICE || "pt-BR-AntonioNeural";
const OUT = join(process.cwd(), "out");
const db = adminClient();

const fileData = (path: string, type: string) => {
  try {
    return `data:${type};base64,${readFileSync(path).toString("base64")}`;
  } catch {
    return null;
  }
};

async function urlData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  for (const u of [url.replace(/\._AC_[A-Z]{2}\d+_\./, "._AC_SL1000_."), url]) {
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; CacaOfertasBot/1.0)" } });
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.startsWith("image/")) return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    } catch {
      /* próxima */
    }
  }
  return null;
}

const duration = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

function formatSeen(iso: string): string {
  const tz = "America/Sao_Paulo";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}`;
}

async function main() {
  const slug = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!slug) throw new Error("Informe o produto: npm run review-video -- <slug>");
  const { data } = await db.from("product_overview").select("*").eq("slug", slug).not("best_price", "is", null).maybeSingle();
  if (!data) throw new Error(`Produto "${slug}" sem preço.`);
  const p = data as ProductOverview;
  const v = verdictFor(p);
  const specs = getSpecs(p.slug, p.specs);
  if (!specs) throw new Error("Produto sem ficha técnica.");

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [{ data: daily }, { data: settingsRow }, { data: offer }] = await Promise.all([
    db.from("product_daily").select("day,min_price").eq("product_id", p.id).gte("day", since).order("day"),
    db.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    p.best_offer_id ? db.from("offers").select("last_seen_at").eq("id", p.best_offer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const s = mergeSettings(settingsRow?.data);
  const price = Number(p.best_price);
  const history = (daily || []).map((d) => ({ day: String(d.day), price: Number(d.min_price) })).filter((h) => h.price > 0);
  if (!history.length || history[history.length - 1].day !== today) history.push({ day: today, price });
  else history[history.length - 1].price = price;
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = p.avg_30d != null ? Number(p.avg_30d) : null;
  const days = Number(p.days_tracked || history.length);
  const pct = v.vsAvg != null ? Math.round(Math.abs(v.vsAvg) * 100) : 0;
  const good = v.kind === "record" || v.kind === "below";
  const badge = v.kind === "record" ? "MENOR PREÇO JÁ VISTO" : v.kind === "below" ? `${pct}% ABAIXO DA MÉDIA` : v.label.toUpperCase();
  const vsLabel = v.vsAvg == null || v.kind === "learning" ? null : pct < 1 ? "Na média" : v.vsAvg > 0 ? `${pct}% abaixo da média` : `${pct}% acima da média`;
  const top = specs.specs.slice(0, 4);

  // roteiro
  const conclusion: Record<string, string> = {
    record: "É o menor preço que já registramos. Se você estava esperando, a hora é boa.",
    below: "O preço está abaixo da média: é uma boa compra.",
    normal: "O preço está no normal. Se não tiver pressa, dá para esperar uma queda.",
    above: "O preço está acima da média. Vale esperar.",
    fake: "O desconto anunciado é menor do que parece. Vale esperar uma queda de verdade.",
    half: "O desconto anunciado é inflado. Vale esperar uma queda de verdade.",
    learning: "Ainda estamos juntando histórico para dar um veredito.",
  };
  const script: { id: ReviewScene["id"]; text: string }[] = [
    { id: "hook", text: `Vale a pena comprar ${p.name} agora? Vamos aos números.` },
    { id: "about", text: specs.summary.split(/(?<=\.)\s/)[0] },
    { id: "specs", text: `Na ficha técnica: ${top.map(([k, val]) => `${k.toLowerCase()}, ${shortSpec(val)}`).join(". ")}.` },
    {
      id: "history",
      text: `Nos ${days} dias que acompanhamos, o menor preço foi ${spokenMoney(min)}${max > min ? ` e o maior, ${spokenMoney(max)}` : ""}${avg != null ? `. A média ficou em ${spokenMoney(avg)}` : ""}.`,
    },
    {
      id: "verdict",
      text: `Hoje o menor preço é ${spokenMoney(price)}${p.best_store ? `, ${atStore(p.best_store)}` : ""}${vsLabel && pct >= 1 ? `, ${pct}% ${v.vsAvg! > 0 ? "abaixo" : "acima"} da média` : ""}. ${conclusion[v.kind] || conclusion.normal}`,
    },
    { id: "end", text: "O histórico completo está no Caça Ofertas, link na bio. Os preços mudam a qualquer momento: confira antes de comprar." },
  ];

  // narração (edge-tts) e tempos de cada cena
  mkdirSync(OUT, { recursive: true });
  const tmp = join(OUT, "review-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const scenes: ReviewScene[] = [];
  let t = 0.4;
  const parts: string[] = [];
  for (const [i, sc] of script.entries()) {
    const mp3 = join(tmp, `${i}.mp3`);
    execFileSync("edge-tts", ["--voice", VOICE, "--rate", "+6%", "--text", speakable(sc.text), "--write-media", mp3]);
    const dur = duration(mp3);
    const gap = sc.id === "end" ? 1.2 : 0.45;
    scenes.push({ id: sc.id, start: t, end: t + dur + gap, text: sc.text });
    parts.push(mp3);
    t += dur + gap;
  }
  scenes[0].start = 0;
  const total = Math.ceil(t * 10) / 10;
  console.log(`Roteiro: ${scenes.map((x) => `${x.id} ${(x.end - x.start).toFixed(1)}s`).join(", ")} · total ${total}s`);

  // áudio: cada trecho no seu início
  const audio = join(tmp, "voz.m4a");
  const inputs = parts.flatMap((f) => ["-i", f]);
  const delays = parts.map((_, i) => `[${i}:a]adelay=${Math.round((scenes[i].start + (i === 0 ? 0.4 : 0.15)) * 1000)}|${Math.round((scenes[i].start + (i === 0 ? 0.4 : 0.15)) * 1000)}[a${i}]`);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", ...inputs,
    "-filter_complex", `${delays.join(";")};${parts.map((_, i) => `[a${i}]`).join("")}amix=inputs=${parts.length}:normalize=0,apad=whole_dur=${total}[out]`,
    "-map", "[out]", "-t", String(total), "-c:a", "aac", "-b:a", "160k", audio,
  ]);

  // quadros
  const html = reviewHtml(
    {
      name: p.name,
      category: p.category,
      photo: await urlData(p.image_url),
      logo: fileData("public/brand/logo.png", "image/png"),
      mascot: fileData("public/brand/mascote.png", "image/png"),
      summary: specs.summary,
      specs: top,
      history,
      price,
      store: p.best_store ? atStore(p.best_store) : null,
      avg,
      min,
      max,
      days,
      badge,
      good,
      vsLabel,
      seen: offer?.last_seen_at ? formatSeen(offer.last_seen_at) : null,
      colors: { primary: s.colors.primary, ink: s.colors.ink },
      host: "cacaofertas.com.br",
    },
    scenes,
    total
  );
  writeFileSync(join(OUT, `review-${p.slug}.html`), html);
  const frames = join(tmp, "f");
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const n = Math.ceil(total * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => (window as unknown as { render: (t: number) => void }).render(x), i / FPS);
    await page.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.png`) });
  }
  await browser.close();

  const mp4 = join(OUT, `review-${p.slug}.mp4`);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    "-framerate", String(FPS), "-i", join(frames, "%05d.png"), "-i", audio,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart", mp4,
  ]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`Pronto: ${mp4} (${(readFileSync(mp4).length / 1024 / 1024).toFixed(1)} MB, ${total}s). Período: ${periodLabel(days)}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
