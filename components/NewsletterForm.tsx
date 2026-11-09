"use client";

import { useActionState } from "react";
import Link from "next/link";
import { subscribeNewsletter, type NewsletterState } from "@/app/newsletter/actions";

/** Inscrição nas "Quedas da semana" (e-mail semanal). */
export function NewsletterForm({ source, compact = false }: { source: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<NewsletterState, FormData>(subscribeNewsletter, {});
  if (state.ok)
    return (
      <div className={`newsletter ${compact ? "newsletter-compact" : ""}`} role="status">
        <strong>📬 {state.ok}</strong>
      </div>
    );
  return (
    <form action={action} className={`newsletter ${compact ? "newsletter-compact" : ""}`}>
      <p className="newsletter-title">📬 Quedas da semana</p>
      <p className="newsletter-sub">Toda quinta, por e-mail, os produtos que realmente baixaram de preço. Grátis, cancela com um clique.</p>
      <input type="hidden" name="source" value={source} />
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      <div className="newsletter-row">
        <label className="sr-only" htmlFor={`nl-${source}`}>Seu e-mail</label>
        <input id={`nl-${source}`} type="email" name="email" required autoComplete="email" inputMode="email" placeholder="seu@email.com" />
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Enviando…" : "Quero receber"}
        </button>
      </div>
      <p className="newsletter-legal">
        Ao se inscrever você concorda com a <Link href="/politica-de-privacidade">Política de Privacidade</Link>.
      </p>
      {state.erro ? <p className="flash flash-erro" role="alert">{state.erro}</p> : null}
    </form>
  );
}
