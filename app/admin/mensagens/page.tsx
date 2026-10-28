import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { deleteMessage, setRead } from "./actions";

type Msg = { id: number; name: string; email: string; subject: string; message: string; read: boolean; created_at: string };

async function load(): Promise<{ list: Msg[]; error?: string }> {
  if (demo.enabled()) return { list: [] };
  const { data, error } = await adminClient()
    .from("contact_messages")
    .select("id,name,email,subject,message,read,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return { list: (data as Msg[]) || [], error: error?.message };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function Mensagens() {
  const { list, error } = await load();
  const unread = list.filter((m) => !m.read).length;

  return (
    <div className="wrap admin-page">
      <div className="admin-bar">
        <div>
          <h1>Mensagens</h1>
          <p className="admin-sub">
            {list.length
              ? `${list.length} ${list.length === 1 ? "mensagem" : "mensagens"}, ${unread} não ${unread === 1 ? "lida" : "lidas"}.`
              : "Mensagens enviadas pela página de Contato aparecem aqui."}
          </p>
        </div>
      </div>
      {error ? <p className="flash flash-erro">Não foi possível carregar: {error}</p> : null}
      {!list.length && !error ? <p className="empty">Nenhuma mensagem ainda.</p> : null}

      <ul className="msg-list">
        {list.map((m) => (
          <li key={m.id} className={m.read ? "msg" : "msg msg-unread"}>
            <div className="msg-head">
              <strong>{m.subject}</strong>
              <span className="msg-meta">
                {m.name} · <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}>{m.email}</a> ·{" "}
                {when(m.created_at)}
              </span>
            </div>
            <p className="msg-body">{m.message}</p>
            <div className="msg-actions">
              <a className="btn btn-small" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}>
                Responder por e-mail
              </a>
              <form action={setRead}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="read" value={m.read ? "0" : "1"} />
                <button className="btn btn-ghost btn-small">{m.read ? "Marcar como não lida" : "Marcar como lida"}</button>
              </form>
              <form action={deleteMessage}>
                <input type="hidden" name="id" value={m.id} />
                <button className="btn btn-ghost btn-small btn-danger">Excluir</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
