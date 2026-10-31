import type { Metadata } from "next";
import Link from "next/link";
import { getSettings, whatsappDigits } from "@/lib/settings";
import { sendMessage } from "./actions";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a equipe: sugestões de produtos, preço errado, parcerias e dúvidas sobre privacidade.",
  alternates: { canonical: "/contato" },
};

type Props = { searchParams: Promise<{ enviado?: string; erro?: string }> };

const SUBJECTS = ["Sugerir um produto", "Preço ou link errado", "Parcerias e publicidade", "Privacidade e dados", "Outro assunto"];

export default async function Contato({ searchParams }: Props) {
  const { enviado, erro } = await searchParams;
  const s = await getSettings();
  const wa = whatsappDigits(s.contact.whatsapp);

  return (
    <article className="wrap page-text page-wide">
      <h1>Contato</h1>
      <p>
        Viu um preço errado, quer sugerir um produto para acompanharmos ou falar de parceria? Mande uma mensagem.
        Respondemos em até 2 dias úteis.
      </p>

      <div className="contact-grid">
        <form action={sendMessage} className="admin-form contact-form" id="formulario">
          {enviado ? (
            <p className="flash flash-ok" role="status">
              Mensagem enviada. Obrigado! Vamos responder no e-mail que você informou.
            </p>
          ) : null}
          {erro ? (
            <p className="flash flash-erro" role="alert">
              {erro}
            </p>
          ) : null}

          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Nome</label>
              <input id="name" name="name" required maxLength={120} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="subject">Assunto</label>
            <select id="subject" name="subject" defaultValue={SUBJECTS[0]}>
              {SUBJECTS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="message">Mensagem</label>
            <textarea id="message" name="message" rows={6} required minLength={10} maxLength={4000} />
          </div>
          <div className="hp" aria-hidden="true">
            <label htmlFor="hp">Não preencha este campo</label>
            <input id="hp" name="hp" tabIndex={-1} autoComplete="off" />
          </div>
          <label className="check">
            <input type="checkbox" name="consent" required />
            <span>
              Li a <Link href="/politica-de-privacidade">Política de Privacidade</Link> e concordo com o uso dos meus
              dados para responder este contato.
            </span>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn">
              Enviar mensagem
            </button>
          </div>
        </form>

        <aside className="contact-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mascote.png" alt="" className="contact-mascot" width={212} height={160} />
          {s.contact.email || wa || s.contact.instagram || s.contact.facebook || s.contact.tiktok ? (
            <dl>
              {s.contact.email ? (
                <>
                  <dt>E-mail</dt>
                  <dd>
                    <a href={`mailto:${s.contact.email}`}>{s.contact.email}</a>
                  </dd>
                </>
              ) : null}
              {wa ? (
                <>
                  <dt>WhatsApp</dt>
                  <dd>
                    <a href={`https://wa.me/${wa}`} rel="noopener">
                      {s.contact.whatsapp}
                    </a>
                  </dd>
                </>
              ) : null}
              {s.contact.instagram ? (
                <>
                  <dt>Instagram</dt>
                  <dd>
                    <a href={`https://www.instagram.com/${s.contact.instagram}/`} rel="noopener">
                      @{s.contact.instagram}
                    </a>
                  </dd>
                </>
              ) : null}
              {s.contact.facebook ? (
                <>
                  <dt>Facebook</dt>
                  <dd>
                    <a href={`https://www.facebook.com/${s.contact.facebook}/`} rel="noopener">
                      facebook.com/{s.contact.facebook}
                    </a>
                  </dd>
                </>
              ) : null}
              {s.contact.tiktok ? (
                <>
                  <dt>TikTok</dt>
                  <dd>
                    <a href={`https://www.tiktok.com/@${s.contact.tiktok}`} rel="noopener">
                      @{s.contact.tiktok}
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p>Prefere outro canal? Use o formulário: todas as mensagens chegam direto para a equipe.</p>
          )}
          <p className="hint">
            Não vendemos produtos. Pedidos, entregas e trocas são com a loja onde você comprou.
          </p>
        </aside>
      </div>
    </article>
  );
}
