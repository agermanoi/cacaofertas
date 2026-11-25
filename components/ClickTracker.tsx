"use client";

import { useEffect } from "react";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const GO = new RegExp(`^/go/(${UUID})`, "i");
const CUPOM = new RegExp(`^/c/(${UUID})`, "i");

/**
 * Conta os cliques para as lojas: ofertas (/go/… ou link direto com data-track) e cupons (/c/…).
 *
 * O clique só conta quando acontece numa página aberta no navegador (este script roda), e não
 * quando alguém abre o /go/ ou o /c/ direto: robôs que seguem os links da página, trocando de IP
 * e se passando por navegador, inflavam os números (ex.: 25/11, 234 cliques em 35 minutos).
 * O beacon segue mesmo com a página trocando para a loja.
 */
export function ClickTracker() {
  useEffect(() => {
    const sent = new WeakMap<Element, number>();
    function onClick(e: MouseEvent) {
      if (e.type === "auxclick" && e.button !== 1) return; // só o botão do meio (abrir em nova aba)
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      // o mesmo link clicado de novo em menos de 2 s conta uma vez só
      const now = Date.now();
      if (now - (sent.get(a) || 0) < 2000) return;
      let body: { o?: string; c?: string } | null = null;
      const track = a.getAttribute("data-track");
      const path = a.getAttribute("href") || "";
      if (track) body = { o: track };
      else if (GO.test(path)) body = { o: path.match(GO)![1] };
      else if (CUPOM.test(path)) body = { c: path.match(CUPOM)![1] };
      if (!body) return;
      sent.set(a, now);
      try {
        const json = JSON.stringify({ ...body, r: location.href });
        if (!navigator.sendBeacon?.("/api/clique", new Blob([json], { type: "text/plain" }))) {
          fetch("/api/clique", { method: "POST", body: json, keepalive: true }).catch(() => undefined);
        }
      } catch {
        /* sem contagem, o link segue */
      }
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);
  return null;
}
