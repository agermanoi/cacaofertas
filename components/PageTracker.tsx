"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Conta a visita de cada página (métricas do painel). Não usa cookies. */
export function PageTracker() {
  const path = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!path || path.startsWith("/admin")) return;
    const params = new URLSearchParams(window.location.search);
    // referrer externo só vale na primeira página; depois a navegação é interna
    const ref = first.current ? document.referrer : window.location.origin + "/";
    first.current = false;
    const data = JSON.stringify({ p: path, r: ref, u: params.get("utm_source") || "" });
    try {
      if (!navigator.sendBeacon?.("/api/v", new Blob([data], { type: "text/plain" }))) {
        fetch("/api/v", { method: "POST", body: data, keepalive: true }).catch(() => undefined);
      }
    } catch {
      /* sem métricas, tudo bem */
    }
  }, [path]);

  return null;
}
