import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { ML_STATE_COOKIE, mlConfigured, mlExchangeCode, mlRedirectUri, mlStatus } from "@/lib/mercadolivre-auth";
import { disconnectMl, startMlConnect } from "./actions";

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
  const ok =
    sp.ok === "conectado"
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
    </div>
  );
}
