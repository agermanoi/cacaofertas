"use client";

import { useEffect, useState } from "react";

/**
 * Link "Ver na loja".
 * No computador abre em nova aba (o site continua aberto atrás).
 * No celular abre na mesma aba: se o celular tiver o app da loja (Mercado Livre, Shopee...),
 * o sistema troca para o app e não sobra uma aba em branco para trás.
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
      onClick={track ? () => countClick(track) : undefined}
      {...(newTab ? { target: "_blank" } : {})}
    >
      {children}
    </a>
  );
}

/** Link direto (sem /go/): conta o clique por beacon, que segue mesmo com a página trocando para a loja. */
function countClick(id: string) {
  try {
    const body = JSON.stringify({ o: id, r: location.href });
    if (!navigator.sendBeacon?.("/api/clique", new Blob([body], { type: "text/plain" }))) {
      fetch("/api/clique", { method: "POST", body, keepalive: true }).catch(() => undefined);
    }
  } catch {
    /* sem contagem, o link segue */
  }
}
