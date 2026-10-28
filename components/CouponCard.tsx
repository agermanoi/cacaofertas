"use client";

import { useEffect, useState } from "react";
import type { Coupon } from "@/lib/coupons";

/**
 * Cartão de cupom. "Copiar e ir à loja" copia o código e abre a loja pelo
 * link de afiliado (/c/[id], que também conta o clique).
 */
export function CouponCard({ c, expires }: { c: Coupon; expires: string | null }) {
  const [copied, setCopied] = useState(false);
  const [newTab, setNewTab] = useState(true);

  useEffect(() => {
    // No celular, mesma aba (o app da loja abre sem deixar aba em branco)
    if (window.matchMedia("(pointer: coarse)").matches) setNewTab(false);
  }, []);

  async function copy() {
    if (!c.code) return;
    try {
      await navigator.clipboard.writeText(c.code);
    } catch {
      /* navegador sem permissão: o código continua visível para copiar à mão */
    }
    setCopied(true);
  }

  return (
    <article className={c.highlight ? "coupon coupon-hl" : "coupon"}>
      <header className="coupon-head">
        <span className="coupon-store">{c.store}</span>
        {c.discount ? <span className="coupon-off">{c.discount}</span> : null}
      </header>
      <h3 className="coupon-title">{c.title}</h3>
      {c.description ? <p className="coupon-desc">{c.description}</p> : null}

      <div className="coupon-action">
        {c.code ? (
          <>
            <code className="coupon-code" aria-label={`Código do cupom: ${c.code}`}>
              {c.code}
            </code>
            <a
              href={`/c/${c.id}`}
              className="btn"
              rel="sponsored nofollow noopener"
              {...(newTab ? { target: "_blank" } : {})}
              onClick={copy}
            >
              {copied ? "Copiado! Abrindo a loja" : "Copiar e ir à loja"}
            </a>
          </>
        ) : (
          <a
            href={`/c/${c.id}`}
            className="btn"
            rel="sponsored nofollow noopener"
            {...(newTab ? { target: "_blank" } : {})}
          >
            Ativar oferta na loja
          </a>
        )}
      </div>

      <footer className="coupon-foot">
        {expires ? <span>{expires}</span> : <span>Sem data de validade informada</span>}
        {c.rules ? (
          <details>
            <summary>Regras</summary>
            <p>{c.rules}</p>
          </details>
        ) : null}
      </footer>
    </article>
  );
}
