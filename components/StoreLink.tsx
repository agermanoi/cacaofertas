"use client";

import { useEffect, useState } from "react";

/**
 * Link "Ver na loja".
 * No computador abre em nova aba (o site continua aberto atrás).
 * No celular abre na mesma aba: se o celular tiver o app da loja (Mercado Livre, Shopee...),
 * o sistema troca para o app e não sobra uma aba em branco para trás.
 * O clique é contado pelo ClickTracker (data-track nos links diretos, /go/ nos demais).
 */
export function StoreLink({ href, track, className, children }: { href: string; track?: string; className?: string; children: React.ReactNode }) {
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
      data-store-click=""
      data-track={track || undefined}
      {...(newTab ? { target: "_blank" } : {})}
    >
      {children}
    </a>
  );
}
