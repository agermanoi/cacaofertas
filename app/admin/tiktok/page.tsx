import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase";
import { Flash } from "@/components/admin/Flash";
import { TIKTOK_SCOPES, TIKTOK_STATE_COOKIE, tiktokExchangeCode, tiktokRedirectUri, tiktokStatus, tiktokUrlPrefix } from "@/lib/tiktok";
import { siteUrl } from "@/lib/site";
import { disconnectTiktok, saveTiktokKeys, saveVerifyFile, startTiktokConnect } from "./actions";

type Props = {
  searchParams: Promise<{ code?: string; state?: string; error?: string; error_description?: string; ok?: string; erro?: string }>;
};

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

export default async function TiktokPage({ searchParams }: Props) {
  const sp = await searchParams;
  const db = adminClient();

  // Volta da tela de autorização do TikTok: ?code=...&state=...
  if (sp.code || sp.error) {
    if (sp.error) redirect(`/admin/tiktok?erro=${encodeURIComponent(sp.error_description || "Autorização cancelada no TikTok.")}`);
    const jar = await cookies();
    const expected = jar.get(TIKTOK_STATE_COOKIE)?.value;
    if (!expected || expected !== sp.state) redirect("/admin/tiktok?erro=A autorização expirou ou veio de outra aba. Clique em Conectar de novo.");
    const r = await tiktokExchangeCode(db, sp.code!);
    if (!r.ok) redirect(`/admin/tiktok?erro=${encodeURIComponent(`Não foi possível conectar: ${r.error}`)}`);
    redirect(`/admin/tiktok?ok=${encodeURIComponent(`TikTok conectado (${r.user}). Ligue o TikTok em Redes sociais → Configurações.`)}`);
  }

  const st = await tiktokStatus(db);
  const site = siteUrl();

  return (
    <div className="wrap admin-page">
      <nav className="crumbs">
        <Link href="/admin/social">Redes sociais</Link> <span aria-hidden="true">/</span> TikTok
      </nav>
      <h1>TikTok</h1>
      <p className="admin-sub">
        Cada post vai como <strong>rascunho</strong> para a caixa de entrada do TikTok, com a arte vertical e a legenda.
        Você abre o app, escolhe uma música e publica. Não precisa da auditoria do TikTok.
      </p>
      <Flash ok={sp.ok} erro={sp.erro} />

      <section className="admin-section">
        <h2>1. Dados para criar o app em developers.tiktok.com</h2>
        <table className="kv-table">
          <tbody>
            <tr>
              <th>Site (Web/Desktop URL)</th>
              <td><code>{site}</code></td>
            </tr>
            <tr>
              <th>Termos de Serviço</th>
              <td><code>{site}/termos-de-uso</code></td>
            </tr>
            <tr>
              <th>Política de Privacidade</th>
              <td><code>{site}/politica-de-privacidade</code></td>
            </tr>
            <tr>
              <th>Produtos</th>
              <td>Login Kit + Content Posting API</td>
            </tr>
            <tr>
              <th>Escopos</th>
              <td><code>{TIKTOK_SCOPES.replace(",", ", ")}</code></td>
            </tr>
            <tr>
              <th>Redirect URI (Login Kit, Web)</th>
              <td><code>{tiktokRedirectUri()}</code></td>
            </tr>
            <tr>
              <th>URL prefix a verificar</th>
              <td><code>{tiktokUrlPrefix()}</code></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>2. Chaves do app</h2>
        <form action={saveTiktokKeys} className="admin-form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="client_key">Client key</label>
              <input id="client_key" name="client_key" autoComplete="off" placeholder={st.configured ? "já salvo (deixe em branco para manter)" : ""} />
            </div>
            <div className="field">
              <label htmlFor="client_secret">Client secret</label>
              <input id="client_secret" name="client_secret" type="password" autoComplete="off" placeholder={st.configured ? "já salvo (deixe em branco para manter)" : ""} />
            </div>
          </div>
          <p className="hint">Ficam guardadas no banco, fora do código e do navegador.</p>
          <div className="form-actions">
            <button className="btn">Salvar chaves</button>
          </div>
        </form>
      </section>

      <section className="admin-section">
        <h2>3. Verificar o endereço das artes</h2>
        <p className="hint">
          No app do TikTok, em URL properties, adicione o prefixo <code>{tiktokUrlPrefix()}</code>. O TikTok dá um arquivo
          .txt para baixar: cole aqui o nome e o conteúdo, salve e clique em Verificar lá.
        </p>
        <form action={saveVerifyFile} className="admin-form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="vname">Nome do arquivo</label>
              <input id="vname" name="name" placeholder="tiktokXXXX.txt" />
            </div>
            <div className="field">
              <label htmlFor="vcontent">Conteúdo do arquivo</label>
              <input id="vcontent" name="content" placeholder="tiktok-developers-site-verification=..." />
            </div>
          </div>
          {st.verifyFiles.length ? (
            <p className="hint">
              Publicados:{" "}
              {st.verifyFiles.map((f) => (
                <a key={f} href={`/tiktok/${f}`} target="_blank" rel="noopener">
                  /tiktok/{f}{" "}
                </a>
              ))}
            </p>
          ) : null}
          <div className="form-actions">
            <button className="btn">Publicar arquivo</button>
          </div>
        </form>
        <p className="hint">Se o TikTok oferecer verificação por DNS (registro TXT), também funciona: adicione no DNS do domínio.</p>
      </section>

      <section className="admin-section">
        <h2>4. Conectar a conta</h2>
        {st.connected ? (
          <>
            <p>
              Conectado: <strong>{st.user}</strong>
              {st.refreshExpires ? <span className="muted"> · reconectar até {when(st.refreshExpires)}</span> : null}
              {st.scopes ? <span className="muted"> · permissões: {st.scopes}</span> : null}
            </p>
            <div className="form-actions">
              <form action={startTiktokConnect}>
                <button className="btn btn-ghost">Reconectar</button>
              </form>
              <form action={disconnectTiktok}>
                <button className="btn btn-ghost btn-danger">Desconectar</button>
              </form>
            </div>
          </>
        ) : (
          <form action={startTiktokConnect}>
            <p className="hint">Entre com a conta do TikTok do site e autorize. Funciona em modo Sandbox antes da aprovação, se a conta estiver como usuária de teste do app.</p>
            <button className="btn" disabled={!st.configured}>
              Conectar TikTok
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
