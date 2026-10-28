"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, SESSION_DAYS, checkPassword, createSession, verifySession } from "@/lib/admin-auth";
import { parseList, slugify } from "@/lib/slug";
import { parseSpecLines } from "@/lib/specs";
import { demo } from "@/lib/mock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Toda ação confere a sessão de novo; o middleware sozinho não basta. */
async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
  if (demo.enabled()) back("/admin", { erro: "Modo demonstração: as alterações não são salvas." });
}

function back(path: string, msg: { ok?: string; erro?: string }): never {
  const q = new URLSearchParams(msg as Record<string, string>).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

function refreshSite(...slugs: (string | null | undefined)[]) {
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  for (const s of slugs) if (s) revalidatePath(`/produto/${s}`);
}

/* ---------------- Sessão ---------------- */

export async function login(formData: FormData) {
  const password = String(formData.get("senha") || "");
  const voltar = String(formData.get("voltar") || "");
  if (!checkPassword(password)) {
    await sleep(900); // atrasa tentativas por força bruta
    redirect(`/admin/login?erro=1${voltar ? `&voltar=${encodeURIComponent(voltar)}` : ""}`);
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect(voltar.startsWith("/admin") && !voltar.startsWith("//") ? voltar : "/admin");
}

export async function logout() {
  const jar = await cookies();
  jar.delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin/login?saiu=1");
}

/* ---------------- Produtos ---------------- */

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveProduct(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "") || null;
  const formPath = id ? `/admin/produtos/${id}` : "/admin/produtos/novo";

  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const query = String(formData.get("query") || "").trim() || name;
  const slug = slugify(String(formData.get("slug") || "") || name);
  const oldSlug = String(formData.get("old_slug") || "") || null;

  if (!name) back(formPath, { erro: "Informe o nome do produto." });
  if (!category) back(formPath, { erro: "Informe a categoria." });
  if (!slug) back(formPath, { erro: "Não foi possível gerar o endereço da página. Preencha o campo Endereço." });

  const minPrice = num(formData.get("min_price")) ?? 0;
  const maxPrice = num(formData.get("max_price"));
  if (maxPrice != null && maxPrice <= minPrice) {
    back(formPath, { erro: "O preço máximo precisa ser maior que o mínimo." });
  }

  const scrapeUrls = parseList(String(formData.get("scrape_urls") || "").replace(/\s+(?=https?:)/g, "\n"));
  const badUrl = scrapeUrls.find((u) => !/^https:\/\/[^\s]+$/i.test(u));
  if (badUrl) back(formPath, { erro: `URL de raspagem inválida: ${badUrl.slice(0, 80)}. Use endereços completos com https://` });

  const imageUrl = String(formData.get("image_url") || "").trim() || null;
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) back(formPath, { erro: "A imagem precisa ser um endereço https://" });

  const summary = String(formData.get("spec_summary") || "").trim();
  const specLines = parseSpecLines(String(formData.get("spec_lines") || ""));
  const note = String(formData.get("spec_note") || "").trim();
  const specs = summary || specLines.length ? { summary, specs: specLines, ...(note ? { note } : {}) } : null;

  const row = {
    slug,
    name,
    category,
    query,
    must: parseList(String(formData.get("must") || "")),
    exclude: parseList(String(formData.get("exclude") || "")),
    min_price: minPrice,
    max_price: maxPrice,
    scrape_urls: scrapeUrls,
    image_url: imageUrl,
    popularity: Math.round(num(formData.get("popularity")) ?? 50),
    active: formData.get("active") === "on",
    specs,
    updated_at: new Date().toISOString(),
  };

  const db = adminClient();
  const { data, error } = id
    ? await db.from("products").update(row).eq("id", id).select("id, slug").single()
    : await db.from("products").insert(row).select("id, slug").single();

  if (error) {
    const msg =
      error.code === "23505"
        ? `Já existe um produto com o endereço “${slug}”. Escolha outro em Endereço da página.`
        : `Não foi possível salvar: ${error.message}`;
    back(formPath, { erro: msg });
  }

  refreshSite(slug, oldSlug !== slug ? oldSlug : null);

  if (formData.get("coletar") === "on") {
    const r = await dispatchCollect(slug);
    back("/admin", r.ok ? { ok: `“${name}” salvo. Coleta disparada; os preços aparecem em alguns minutos.` } : { ok: `“${name}” salvo.`, erro: r.error });
  }
  back("/admin", { ok: id ? `“${name}” atualizado.` : `“${name}” cadastrado.` });
}

export async function setActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "1";
  const { data, error } = await adminClient()
    .from("products")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("slug, name")
    .single();
  if (error) back("/admin", { erro: `Não foi possível alterar: ${error.message}` });
  refreshSite(data?.slug);
  back("/admin", { ok: active ? `“${data?.name}” voltou para o site.` : `“${data?.name}” pausado: saiu do site e da coleta.` });
}

export async function deleteProduct(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const db = adminClient();
  const { data: prod } = await db.from("products").select("slug, name").eq("id", id).maybeSingle();
  if (!prod) back("/admin", { erro: "Produto não encontrado. Ele pode já ter sido removido." });
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) back(`/admin/produtos/${id}`, { erro: `Não foi possível remover: ${error.message}` });
  refreshSite(prod!.slug);
  back("/admin", { ok: `“${prod!.name}” removido, junto com o histórico de preços.` });
}

export async function collectNow(formData: FormData) {
  await requireAdmin();
  const slug = String(formData.get("slug") || "");
  const r = await dispatchCollect(slug);
  back("/admin", r.ok ? { ok: `Coleta de “${slug}” disparada. Os preços aparecem em alguns minutos.` } : { erro: r.error });
}

/**
 * Dispara o workflow "Coleta de preços" no GitHub Actions para um produto.
 * Env: GITHUB_REPO ("usuario/repositorio"), GITHUB_TOKEN (token fine-grained com Actions: write),
 *      GITHUB_REF (opcional, padrão "main").
 */
async function dispatchCollect(slug: string): Promise<{ ok: boolean; error?: string }> {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    return { ok: false, error: "Coleta sob demanda desligada: configure GITHUB_REPO e GITHUB_TOKEN na Vercel. A coleta automática roda 2x por dia." };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/collect.yml/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ref: process.env.GITHUB_REF || "main", inputs: { slugs: slug } }),
    });
    if (res.status === 204) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, error: `O GitHub recusou a coleta (${res.status}). Confira o token e o repositório. ${body.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: `Não foi possível falar com o GitHub: ${(e as Error).message}` };
  }
}
