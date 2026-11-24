import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase";
import { getMlAccessToken } from "@/lib/ml-token";
import { carregarChaves, catalogo, CatalogoErro, ultimoDiagnostico, type Loja } from "@/lib/catalogo";

/**
 * API privada de catálogo para sites parceiros (servidor com servidor).
 * Autenticação: cabeçalho "x-catalogo-chave" igual à variável CATALOGO_API_KEY.
 *
 * POST JSON:
 *   { "acao": "link",   "url": "https://…", "origem": "site" }
 *   { "acao": "buscar", "loja": "mercadolivre" | "shopee", "termo": "air fryer", "limite": 8, "origem": "site" }
 *   { "acao": "checar", "refs": ["ml:p:MLB123", "shopee:111.222"] }   (até 40 por chamada)
 *
 * "origem" (opcional) vira o subId dos links curtos da Shopee, para separar as vendas por site.
 * Não devolve preço.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.CATALOGO_API_KEY || "";
  const recebido = req.headers.get("x-catalogo-chave") || "";
  if (esperado.length < 24 || recebido.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

function resposta(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return resposta({ ok: false, erro: "Chave inválida." }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return resposta({ ok: false, erro: "Envie JSON." }, 400);
  }

  const origem = String(body.origem || "").replace(/[^a-z0-9]/gi, "").slice(0, 30) || null;
  const db = adminClient();
  await carregarChaves(db);
  const cat = catalogo(db, origem);

  try {
    switch (body.acao) {
      case "link": {
        const url = String(body.url || "").trim();
        if (!/^https?:\/\//i.test(url)) return resposta({ ok: false, erro: "Envie a url do produto." }, 400);
        return resposta({ ok: true, item: await cat.link(url) });
      }
      case "buscar": {
        const loja = body.loja === "shopee" ? "shopee" : "mercadolivre";
        const termo = String(body.termo || "").trim().slice(0, 80);
        if (termo.length < 3) return resposta({ ok: false, erro: "Termo muito curto." }, 400);
        const limite = Math.min(12, Math.max(1, Number(body.limite) || 8));
        const itens = await cat.buscar(loja as Loja, termo, limite);
        const diag = ultimoDiagnostico();
        return resposta({ ok: true, itens, ...(diag ? { diagnostico: diag } : {}) });
      }
      case "checar": {
        const refs = (Array.isArray(body.refs) ? body.refs : []).map(String).filter(Boolean).slice(0, 40);
        return resposta({ ok: true, itens: await cat.checar(refs) });
      }
      case "diag_ml": {
        // Diagnóstico da API do Mercado Livre (só GET em api.mercadolibre.com, com o token do projeto)
        const paths = (Array.isArray(body.paths) ? body.paths : []).map(String).filter((x) => x.startsWith("/") && !x.includes("..")).slice(0, 12);
        const token = await getMlAccessToken(db);
        const out = [];
        for (const path of paths) {
          const r = await fetch(`https://api.mercadolibre.com${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
          const txt = await r.text();
          out.push({ path, status: r.status, body: txt.slice(0, Number(body.max) || 700) });
        }
        return resposta({ ok: true, itens: out });
      }
      default:
        return resposta({ ok: false, erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    const msg = e instanceof CatalogoErro ? e.message : "Falha ao consultar a loja. Tente de novo.";
    if (!(e instanceof CatalogoErro)) console.error("[catalogo]", (e as Error).message);
    return resposta({ ok: false, erro: msg }, 502);
  }
}
