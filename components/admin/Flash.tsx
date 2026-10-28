/** Mensagens que voltam das ações via ?ok= e ?erro= */
export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return (
    <div className="flash-stack">
      {ok ? (
        <p className="flash flash-ok" role="status">
          {ok}
        </p>
      ) : null}
      {erro ? (
        <p className="flash flash-erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
