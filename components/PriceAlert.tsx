"use client";

import { useActionState } from "react";
import Link from "next/link";
import { subscribeAlert, type AlertState } from "@/app/alerta/actions";

/** "Me avise quando baixar": e-mail + preço desejado (opcional). */
export function PriceAlert({ productId, price }: { productId: string; price: number | null }) {
  const [state, action, pending] = useActionState<AlertState, FormData>(subscribeAlert, {});
  const suggestion = price ? Math.floor(price * 0.9) : null;

  if (state.ok) {
    return (
      <div className="price-alert price-alert-done" role="status">
        <strong>🔔 {state.ok}</strong>
      </div>
    );
  }
  return (
    <form action={action} className="price-alert" aria-labelledby="alerta-titulo">
      <h2 id="alerta-titulo">🔔 Me avise quando baixar</h2>
      <p>Mandamos um e-mail quando o preço cair. Sem cadastro, e você cancela com um clique.</p>
      <input type="hidden" name="product_id" value={productId} />
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      <div className="price-alert-fields">
        <label>
          <span>Seu e-mail</span>
          <input type="email" name="email" required autoComplete="email" inputMode="email" placeholder="voce@email.com" />
        </label>
        <label>
          <span>Avisar abaixo de (opcional)</span>
          <input name="target" inputMode="decimal" placeholder={suggestion ? `ex.: ${suggestion.toLocaleString("pt-BR")}` : "qualquer queda"} />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Enviando…" : "Criar aviso"}
        </button>
      </div>
      <label className="check">
        <input type="checkbox" name="consent" required />
        <span>
          Quero receber avisos de preço deste produto por e-mail. Li a <Link href="/politica-de-privacidade">Política de Privacidade</Link>.
        </span>
      </label>
      {state.erro ? (
        <p className="flash flash-erro" role="alert">
          {state.erro}
        </p>
      ) : null}
    </form>
  );
}
