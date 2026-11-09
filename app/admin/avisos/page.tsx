import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { Flash } from "@/components/admin/Flash";
import { checkResendKey, emailConfig } from "@/lib/email";
import { money } from "@/lib/format";
import { Card } from "@/components/admin/Metrics";
import { removeEmailKey, saveEmailSettings, sendTestEmail } from "./actions";

export const dynamic = "force-dynamic";

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–";
const mask = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");

export default async function AvisosPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const db = adminClient();
  const cfg = await emailConfig(db);
  const check = cfg.apiKey ? await checkResendKey(cfg.apiKey) : null;
  const domain = check?.domains.find((d) => d.name === "cacaofertas.com.br");

  const { data: rows } = await db
    .from("price_alerts")
    .select("email,target_price,price_at_signup,created_at,confirmed_at,canceled_at,last_notified_at,notify_count,products(name,slug)")
    .order("created_at", { ascending: false })
    .limit(300);
  const all = rows || [];
  const active = all.filter((r) => r.confirmed_at && !r.canceled_at);
  const waiting = all.filter((r) => !r.confirmed_at && !r.canceled_at);
  const sent = all.reduce((n, r) => n + (r.notify_count || 0), 0);
  const people = new Set(active.map((r) => r.email.toLowerCase())).size;
  const byProduct = new Map<string, { name: string; slug: string; n: number }>();
  for (const r of all.filter((x) => !x.canceled_at)) {
    const p = r.products as unknown as { name: string; slug: string } | null;
    if (!p) continue;
    const cur = byProduct.get(p.slug) || { ...p, n: 0 };
    cur.n++;
    byProduct.set(p.slug, cur);
  }
  const top = [...byProduct.values()].sort((a, b) => b.n - a.n).slice(0, 15);

  return (
    <div className="wrap admin-page">
      <h1>Avisos de preço</h1>
      <p className="admin-sub">
        Na página de cada produto há o quadro “Me avise quando baixar”. A pessoa confirma o e-mail e recebe um aviso quando o
        preço chega ao valor que ela escolheu ou cai pelo menos 5% (no máximo um e-mail a cada 3 dias por produto). Os avisos
        saem depois de cada coleta.
      </p>
      <Flash ok={sp.ok} erro={sp.erro} />

      <div className="metric-cards">
        <Card label="Avisos ativos" value={String(active.length)} hint={`${people} pessoas`} />
        <Card label="Esperando confirmação" value={String(waiting.length)} hint={cfg.apiKey ? "o e-mail de confirmação já sai" : "saem quando o e-mail for configurado"} />
        <Card label="E-mails de queda enviados" value={String(sent)} />
      </div>

      <section className="admin-section">
        <h2>Envio de e-mail (Resend)</h2>
        {!cfg.apiKey ? (
          <p className="flash flash-erro">
            Ainda não configurado: os avisos estão sendo guardados, mas nenhum e-mail sai. Siga os passos abaixo.
          </p>
        ) : check && !check.ok ? (
          <p className="flash flash-erro">A chave salva foi recusada pelo Resend: {check.error}</p>
        ) : check?.restricted ? (
          <p className="flash flash-ok">
            Chave salva (permissão só de envio). Confira em resend.com → Domains se o cacaofertas.com.br está “Verified” e use
            o e-mail de teste abaixo: se ele chegar, está tudo pronto.
          </p>
        ) : domain?.status === "verified" ? (
          <p className="flash flash-ok">Tudo pronto: chave aceita e domínio cacaofertas.com.br verificado.</p>
        ) : (
          <p className="flash flash-erro">
            Chave aceita, mas o domínio cacaofertas.com.br {domain ? `está “${domain.status}” no Resend` : "ainda não foi adicionado no Resend"}.
            Sem o domínio verificado, os e-mails não saem.
          </p>
        )}
        <ol className="steps">
          <li>
            Crie uma conta grátis em <a href="https://resend.com" target="_blank" rel="noreferrer">resend.com</a> (até 3.000 e-mails por mês).
          </li>
          <li>
            Em <strong>Domains → Add domain</strong>, adicione <code>cacaofertas.com.br</code>, região <strong>São Paulo (sa-east-1)</strong>.
          </li>
          <li>
            O Resend mostra 3 ou 4 registros DNS (MX e TXT de <code>send</code>, TXT <code>resend._domainkey</code> e, opcional, DMARC).
            Crie todos no painel onde está o DNS do domínio e clique em <strong>Verify</strong>.
          </li>
          <li>
            Em <strong>API Keys → Create API key</strong> (permissão “Sending access”), copie a chave (começa com <code>re_</code>) e cole aqui embaixo.
          </li>
          <li>Mande um e-mail de teste. Pronto: as confirmações pendentes saem na próxima coleta.</li>
        </ol>
        <form action={saveEmailSettings} className="admin-form">
          <div className="field">
            <label htmlFor="api_key">Chave da API do Resend {cfg.apiKey ? "(salva; cole outra para trocar)" : ""}</label>
            <input id="api_key" name="api_key" type="password" autoComplete="off" placeholder={cfg.apiKey ? "re_••••••••" : "re_..."} />
          </div>
          <div className="field">
            <label htmlFor="from">Remetente</label>
            <input id="from" name="from" defaultValue={cfg.from} />
          </div>
          <button type="submit" className="btn">Salvar</button>
        </form>
        {cfg.apiKey ? (
          <>
            <form action={sendTestEmail} className="admin-form inline-form">
              <div className="field">
                <label htmlFor="to">Enviar e-mail de teste para</label>
                <input id="to" name="to" type="email" placeholder="voce@email.com" />
              </div>
              <button type="submit" className="btn btn-ghost">Enviar teste</button>
            </form>
            <form action={removeEmailKey}>
              <button type="submit" className="btn btn-ghost">Remover chave</button>
            </form>
          </>
        ) : null}
      </section>

      <section className="admin-section">
        <h2>Produtos com mais avisos</h2>
        {top.length ? (
          <table className="admin-table">
            <thead><tr><th>Produto</th><th>Avisos</th></tr></thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.slug}><td><Link href={`/produto/${p.slug}`}>{p.name}</Link></td><td>{p.n}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">Nenhum aviso criado ainda.</p>
        )}
      </section>

      <section className="admin-section">
        <h2>Últimas inscrições</h2>
        {all.length ? (
          <table className="admin-table">
            <thead>
              <tr><th>Quando</th><th>Produto</th><th>E-mail</th><th>Alvo</th><th>Situação</th><th>Avisos</th></tr>
            </thead>
            <tbody>
              {all.slice(0, 50).map((r, i) => {
                const p = r.products as unknown as { name: string; slug: string } | null;
                return (
                  <tr key={i}>
                    <td>{day(r.created_at)}</td>
                    <td>{p?.name}</td>
                    <td>{mask(r.email)}</td>
                    <td>{r.target_price != null ? money(Number(r.target_price)) : "qualquer queda"}</td>
                    <td>{r.canceled_at ? "cancelado" : r.confirmed_at ? "ativo" : "esperando confirmação"}</td>
                    <td>{r.notify_count ? `${r.notify_count} (último ${day(r.last_notified_at)})` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}
