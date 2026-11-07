/**
 * Vídeo de história narrada (teste para canais de conteúdo, ex.: motivacional). Não posta em lugar nenhum.
 *
 *   npm run story-video -- coronel-sanders              usa data/stories/coronel-sanders.json
 *   npm run story-video -- coronel-sanders --no-tts     sem narração (tempo estimado), para conferir o visual
 *
 * Precisa de Chromium (Playwright), ffmpeg e edge-tts (pip). Roda no GitHub Actions.
 * Saída: out/story-<slug>.mp4
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { adminClient } from "../lib/supabase";
import { storyHtml, type StoryScene, type StorySceneInput, type Word } from "../lib/story-video";

const FPS = 30;
const OUT = join(process.cwd(), "out");

interface Story {
  slug: string;
  title: string;
  voice?: string;
  rate?: string;
  accent?: string;
  scenes: StorySceneInput[];
}

const duration = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

/** Sem tempos da voz: distribui as palavras pelo tamanho de cada uma. */
function spreadWords(text: string, start: number, dur: number): Word[] {
  const ws = text.split(/\s+/).filter(Boolean);
  const weight = ws.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 2 + (/[.,!?;:]$/.test(w) ? 3 : 0));
  const sum = weight.reduce((a, b) => a + b, 0);
  let t = start;
  return ws.map((w, i) => {
    const d = (weight[i] / sum) * dur;
    const r = { w: w.replace(/[.,!?;:]+$/, ""), s: t, e: t + d * 0.9 };
    t += d;
    return r;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--")) || "coronel-sanders";
  const noTts = args.includes("--no-tts");
  const story = JSON.parse(readFileSync(join("data", "stories", `${slug}.json`), "utf8")) as Story;
  const voice = process.env.TTS_VOICE || story.voice || "pt-BR-AntonioNeural";
  const rate = story.rate || "+4%";

  mkdirSync(OUT, { recursive: true });
  const tmp = join(OUT, "story-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  // narração por cena e tempos
  const scenes: StoryScene[] = [];
  const words: Word[] = [];
  const parts: { file: string; at: number }[] = [];
  let t = 0.5;
  for (const [i, sc] of story.scenes.entries()) {
    let dur: number;
    let sw: Word[] = [];
    if (noTts) {
      dur = sc.text.length / 15;
    } else {
      const mp3 = join(tmp, `${i}.mp3`);
      const js = join(tmp, `${i}.json`);
      execFileSync("python3", ["scripts/tts_words.py", voice, rate, sc.text, mp3, js]);
      dur = duration(mp3);
      sw = (JSON.parse(readFileSync(js, "utf8")) as Word[]).map((w) => ({ w: w.w, s: w.s + t, e: w.e + t }));
      parts.push({ file: mp3, at: t });
    }
    if (!sw.length) sw = spreadWords(sc.text, t, dur);
    words.push(...sw);
    const gap = sc.type === "end" ? 1.6 : sc.type === "number" || sc.type === "quote" ? 0.9 : 0.55;
    scenes.push({ ...sc, start: i === 0 ? 0 : t - 0.25, end: t + dur + gap - 0.25 });
    t += dur + gap;
  }
  const total = Math.ceil(t * 10) / 10;
  scenes[scenes.length - 1].end = total + 1;
  console.log(`Roteiro: ${scenes.length} cenas · ${total}s · voz ${noTts ? "(sem)" : voice}`);

  // áudio
  const audio = join(tmp, "voz.m4a");
  if (parts.length) {
    const inputs = parts.flatMap((p) => ["-i", p.file]);
    const delays = parts.map((p, i) => `[${i}:a]adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}[a${i}]`);
    execFileSync("ffmpeg", [
      "-loglevel", "error", "-y", ...inputs,
      "-filter_complex", `${delays.join(";")};${parts.map((_, i) => `[a${i}]`).join("")}amix=inputs=${parts.length}:normalize=0,apad=whole_dur=${total}[out]`,
      "-map", "[out]", "-t", String(total), "-c:a", "aac", "-b:a", "160k", audio,
    ]);
  } else {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=44100:cl=stereo", "-c:a", "aac", audio]);
  }

  // quadros
  const html = storyHtml(scenes, words, total, story.accent);
  writeFileSync(join(OUT, `story-${slug}.html`), html);
  const frames = join(tmp, "f");
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const n = Math.ceil(total * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => (window as unknown as { render: (t: number) => void }).render(x), i / FPS);
    await page.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (i % (FPS * 10) === 0) console.log(`  quadro ${i}/${n}`);
  }
  await browser.close();

  const mp4 = join(OUT, `story-${slug}.mp4`);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"), "-i", audio,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart", mp4,
  ]);
  rmSync(tmp, { recursive: true, force: true });
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = adminClient();
    const path = `social/story/${slug}-${Date.now().toString(36)}.mp4`;
    const { error } = await db.storage.from("brand").upload(path, readFileSync(mp4), { contentType: "video/mp4", cacheControl: "31536000" });
    if (error) console.warn(`upload: ${error.message}`);
    else console.log(`Link: ${db.storage.from("brand").getPublicUrl(path).data.publicUrl}`);
  }
  console.log(`Pronto: ${mp4} (${(readFileSync(mp4).length / 1024 / 1024).toFixed(1)} MB, ${total}s)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
