"use client";

import { useEffect, useState } from "react";

/**
 * Link "Ver na loja".
 * No computador abre em nova aba (o site continua aberto atrás).
 * No celular abre na mesma aba: se o celular tiver o app da loja (Mercado Livre, Amazon...),
 * o sistema troca para o app e não sobra uma aba em branco para trás.
 */
export function StoreLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const [newTab, setNewTab] = useState(true);

  useEffect(() => {
    const mobile =
      window.matchMedia("(pointer: coarse)").matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (mobile) setNewTab(false);
  }, []);

  return (
    <a
      href={href}
      className={className}
      rel="sponsored nofollow noopener"
      {...(newTab ? { target: "_blank" } : {})}
    >
      {children}
    </a>
  );
}
