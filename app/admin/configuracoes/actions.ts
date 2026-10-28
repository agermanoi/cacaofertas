"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { DEFAULT_SETTINGS, SCRIPT_MAX, mergeSettings, type SiteSettings } from "@/lib/settings";
import { demo } from "@/lib/mock";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function back(msg: { ok?: string; erro?: string }): never {
  redirect(`/admin/configuracoes?${new URLSearchParams(msg as Record<string, string>)}`);
}

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
  if (demo.enabled()) back({ erro: "Modo demonstração: as alterações não são salvas." });
}

/** Envia a imagem para o bucket público "brand" do Supabase e devolve a URL pública. */
async function upload(file: File, kind: "logo" | "icone"): Promise<string> {
  const ext = TYPES[file.type];
  if (!ext) back({ erro: `O arquivo de ${kind} precisa ser PNG, JPG, WEBP ou SVG.` });
  if (file.size > MAX_BYTES) back({ erro: `O arquivo de ${kind} passa de 2 MB. Reduza a imagem e envie de novo.` });
  const path = `${kind}-${Date.now()}.${ext}`;
  const db = adminClient();
  const { error } = await db.storage
    .from("brand")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (error) back({ erro: `Não foi possível enviar o ${kind}: ${error.message}` });
  return db.storage.from("brand").getPublicUrl(path).data.publicUrl;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const raw = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\r\n/g, "\n").trim();

export async function saveSettings(formData: FormData) {
  await requireAdmin();
  const db = adminClient();
  const { data: row } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
  const current = mergeSettings(row?.data);

  let logoUrl = current.logoUrl;
  let iconUrl = current.iconUrl;
  const logo = formData.get("logo_file");
  const icon = formData.get("icon_file");
  if (logo instanceof File && logo.size > 0) logoUrl = await upload(logo, "logo");
  if (icon instanceof File && icon.size > 0) iconUrl = await upload(icon, "icone");
  if (formData.get("logo_reset") === "on") logoUrl = DEFAULT_SETTINGS.logoUrl;
  if (formData.get("icon_reset") === "on") iconUrl = DEFAULT_SETTINGS.iconUrl;

  const ga = text(formData, "ga_id").toUpperCase();
  if (ga && !/^G-[A-Z0-9]{4,20}$/.test(ga)) back({ erro: "O ID do Google Analytics deve ter o formato G-XXXXXXXXXX." });
  const gtm = text(formData, "gtm_id").toUpperCase();
  if (gtm && !/^GTM-[A-Z0-9]{4,12}$/.test(gtm)) back({ erro: "O ID do Tag Manager deve ter o formato GTM-XXXXXXX." });
  for (const k of ["scripts_head", "scripts_bodyStart", "scripts_bodyEnd"]) {
    if (raw(formData, k).length > SCRIPT_MAX) back({ erro: `Um dos campos de script passa de ${SCRIPT_MAX} caracteres.` });
  }

  if (formData.get("gam_enabled") === "on") {
    if (!/^\d{3,20}$/.test(text(formData, "gam_network"))) back({ erro: "O código da rede do GAM deve ter só números (ex.: 21234567890)." });
    if (!text(formData, "gam_parent")) back({ erro: "Informe o ad unit pai do GAM (ex.: cacaofertas)." });
  }

  const email = text(formData, "contact_email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back({ erro: "O e-mail de contato não parece válido." });

  const next: SiteSettings = mergeSettings({
    siteName: text(formData, "siteName"),
    tagline: text(formData, "tagline"),
    logoUrl,
    iconUrl,
    colors: {
      primary: text(formData, "color_primary"),
      primaryLight: text(formData, "color_primaryLight"),
      ink: text(formData, "color_ink"),
      background: text(formData, "color_background"),
    },
    heroTitle: text(formData, "heroTitle"),
    heroText: text(formData, "heroText"),
    announcement: text(formData, "announcement"),
    contact: {
      email,
      whatsapp: text(formData, "contact_whatsapp"),
      instagram: text(formData, "contact_instagram").replace(/^@/, ""),
    },
    analytics: {
      gaId: text(formData, "ga_id"),
      gtmId: text(formData, "gtm_id"),
    },
    scripts: {
      head: raw(formData, "scripts_head"),
      bodyStart: raw(formData, "scripts_bodyStart"),
      bodyEnd: raw(formData, "scripts_bodyEnd"),
    },
    gam: {
      enabled: formData.get("gam_enabled") === "on",
      networkCode: text(formData, "gam_network"),
      parentAdUnit: text(formData, "gam_parent"),
      childUnits: formData.get("gam_child") === "on",
      lazyLoad: formData.get("gam_lazy") === "on",
      refreshSeconds: Number(text(formData, "gam_refresh") || 0),
    },
    adsTxt: raw(formData, "ads_txt"),
    seals: {
      safeBrowsing: formData.get("seal_safebrowsing") === "on",
      html: raw(formData, "seals_html"),
    },
    legal: {
      ownerName: text(formData, "legal_ownerName"),
      document: text(formData, "legal_document"),
      city: text(formData, "legal_city"),
    },
  });

  const { error } = await db
    .from("site_settings")
    .upsert({ id: 1, data: next, updated_at: new Date().toISOString() });
  if (error) back({ erro: `Não foi possível salvar: ${error.message}` });

  revalidatePath("/", "layout");
  revalidatePath("/ads.txt");
  back({ ok: "Configurações salvas. O site já está usando os novos valores." });
}

export async function resetColors() {
  await requireAdmin();
  const db = adminClient();
  const { data: row } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
  const current = mergeSettings(row?.data);
  const { error } = await db
    .from("site_settings")
    .upsert({ id: 1, data: { ...current, colors: DEFAULT_SETTINGS.colors }, updated_at: new Date().toISOString() });
  if (error) back({ erro: `Não foi possível restaurar: ${error.message}` });
  revalidatePath("/", "layout");
  back({ ok: "Cores da identidade visual restauradas." });
}
