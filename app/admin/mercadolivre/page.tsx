import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { ML_STATE_COOKIE, mlConfigured, mlExchangeCode, mlRedirectUri, mlStatus } from "@/lib/mercadolivre-auth";
import { clearMlAffiliate, disconnectMl, saveMlAffiliate, startMlConnect } from "./actions";
import { adminClient } from "@/lib/supabase";

type Props = {
  searchParams: Promise<{ code?: string; state?: string; error?: string; ok?: string; erro?: string; conta?: string }>;
};

const ERROS: Record<string, string> = {
  config: "Faltam ML_CLIENT_ID e ML_CLIENT_SECRET na Vercel. Cadastre as duas e faça um novo deploy.",
  state: "A autorização expirou ou veio de outra aba. Clique em Conectar de novo.",
  negado: "A autorização foi cancelada na tela do Mercado Livre.",
};

export default async function MercadoLivrePage({ searchParams }: Props) {
  const sp = await searchParams;

  // Volta da tela de autorização do ML: ?code=TG-...&state=...
  if (sp.code || sp.error) {
    if (sp.error) redirect("/admin/mercadolivre?erro=negado");
    const jar = await cookies();
    const expected = jar.get(ML_STATE_COOKIE)?.value;
    if (!expected || expected !== sp.state) redirect("/admin/mercadolivre?erro=state");
    const r = await mlExchangeCode(sp.code!);
    if (!r.ok) redirect(`/admin/mercadolivre?erro=${encodeURIComponent(r.error)}`);
    redirect(`/admin/mercadolivre?ok=conectado&conta=${encodeURIComponent(r.nickname)}`);
  }

  const configured = mlConfigured();
  const status = configured ? await mlStatus() : { connected: false as const };
  const { data: affRow } = await adminClient().from("kv").select("value").eq("key", "ml_affiliate_params").maybeSingle();
  const aff = String(affRow?.value || "");
  const ok =
    sp.ok === "afiliado"
      ? "Link de afiliado do Mercado Livre salvo. Todos os cliques para o ML já saem com o seu código."
      : sp.ok === "afiliado-removido"
        ? "Código de afiliado do Mercado Livre removido."
        : sp.ok === "conectado"
      ? `Mercado Livre conectado${sp.conta ? ` (${sp.conta})` : ""}. A próxima coleta já usa essa conta.`
      : sp.ok === "desconectado"
        ? "Mercado Livre desconectado. A coleta deixa de consultar o ML até você conectar de novo."
        : undefined;
  const erro = sp.erro ? ERROS[sp.erro] ?? sp.erro : undefined;

  return (
    <div className="wrap admin-page">
      <nav className="crumbs">
        <Link href="/admin">Produtos</Link> <span aria-hidden="true">/</span> Mercado Livre
      </nav>
      <h1>Mercado Livre</h1>
      <p className="admin-sub">A coleta usa a API oficial do Mercado Livre, que exige uma conta autorizada.</p>
      <Flash ok={ok} erro={erro} />

      {!configured ? (
        <section className="admin-section">
          <h2>Falta configurar o app</h2>
          <ol className="steps">
            <li>
              Em <strong>developers.mercadolivre.com.br</strong>, crie uma aplicação.
            </li>
            <li>
              Em Redirect URI, coloque exatamente: <code>{mlRedirectUri()}</code>
            </li>
            <li>Marque os escopos de leitura e offline access.</li>
            <li>
              Cadastre <code>ML_CLIENT_ID</code> e <code>ML_CLIENT_SECRET</code> na Vercel (e nos secrets do GitHub) e faça um
              novo deploy.
            </li>
          </ol>
        </section>
      ) : (
        <section className="admin-section">
          <div className="ml-status">
            <span className={`chip ${status.connected ? "chip-on" : "chip-off"}`}>
              {status.connected ? "Conectado" : "Não conectado"}
            </span>
            {status.connected ? (
              <span>
                {status.nickname ? <strong>{status.nickname}</strong> : "Conta autorizada"}
                {status.updatedAt ? `, autorização renovada em ${new Date(status.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
              </span>
            ) : (
              <span>Conecte uma conta do Mercado Livre para a coleta trazer os preços de lá.</span>
            )}
          </div>

          <div className="form-actions">
            <form action={startMlConnect}>
              <button type="submit" className="btn">
                {status.connected ? "Conectar outra vez" : "Conectar Mercado Livre"}
              </button>
            </form>
            {status.connected ? (
              <form action={disconnectMl}>
                <button type="submit" className="btn btn-ghost">
                  Desconectar
                </button>
              </form>
            ) : null}
          </div>

          <p className="hint">
            Você vai para a tela do Mercado Livre, autoriza e volta para cá. A Redirect URI do app precisa ser exatamente{" "}
            <code>{mlRedirectUri()}</code>. A autorização se renova sozinha a cada coleta; só reconecte se a coleta ficar mais
            de 6 meses parada ou se você trocar a senha do ML.
          </p>
        </section>
      )}

      <section className="admin-section">
        <h2>Link de afiliado (comissão)</h2>
        {aff ? (
          <p className="flash flash-ok">
            Ativo: os cliques para o Mercado Livre saem com <code>{aff}</code>.
          </p>
        ) : (
          <p className="flash flash-erro">
            Sem código de afiliado: os cliques para o Mercado Livre não estão gerando comissão.
          </p>
        )}
        <form action={saveMlAffiliate} className="admin-form">
          <div className="field">
            <label htmlFor="ml_link">Link de afiliado gerado no portal</label>
            <input id="ml_link" name="link" placeholder="https://mercadolivre.com/sec/... ou o link longo com matt_word e matt_tool" />
            <p className="hint">
              No <a href="https://www.mercadolivre.com.br/afiliados" target="_blank" rel="noopener">portal de afiliados</a>, vá
              em Ferramentas → Gerador de link, gere um link de qualquer produto e cole aqui. O painel tira dele o seu código
              (matt_word e matt_tool) e aplica em todos os links do Mercado Livre do site.
            </p>
          </div>
          <div className="form-actions">
            <button className="btn">Salvar</button>
          </div>
        </form>
        {aff ? (
          <form action={clearMlAffiliate}>
            <button className="btn btn-ghost btn-small btn-danger">Remover código</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
