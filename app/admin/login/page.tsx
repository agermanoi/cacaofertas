import { login } from "../actions";
import { adminConfigured } from "@/lib/admin-auth";

type Props = { searchParams: Promise<{ erro?: string; voltar?: string; saiu?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { erro, voltar, saiu } = await searchParams;

  if (!adminConfigured()) {
    return (
      <div className="wrap admin-login">
        <h1>Painel fechado</h1>
        <p>
          Para abrir o painel, defina a variável <code>ADMIN_PASSWORD</code> (e de preferência{" "}
          <code>ADMIN_SESSION_SECRET</code>) na Vercel e faça um novo deploy.
        </p>
      </div>
    );
  }

  return (
    <div className="wrap admin-login">
      <h1>Entrar no painel</h1>
      {saiu ? <p className="flash flash-ok">Você saiu do painel.</p> : null}
      {erro ? (
        <p className="flash flash-erro" role="alert">
          Senha incorreta. Tente de novo.
        </p>
      ) : null}
      <form action={login} className="admin-form narrow">
        <input type="hidden" name="voltar" value={voltar || ""} />
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required autoFocus />
        <button type="submit" className="btn">
          Entrar
        </button>
      </form>
    </div>
  );
}
