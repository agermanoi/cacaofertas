"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { FORMATS, allSizes, sizesLabel, type AdFormat } from "@/lib/ad-formats";

export type { AdFormat } from "@/lib/ad-formats";

/**
 * Espaço de anúncio servido pelo Google Ad Manager (GPT).
 *
 * A configuração (rede, ad unit pai, lazy load, refresh) vem de Admin → Configurações
 * e é colocada em window.__coAds pelo layout. Sem anúncios ativos, os espaços ficam ocultos
 * (classe ads-off no body), sem deixar buracos na página.
 *
 * Modo "parceiro" (window.__coAdsPartner): o site só cria o <div id="ad-<posição>"> e um script de
 * terceiros (ex.: TagLovers) o preenche. Se nada for colocado no espaço em 10 s, ele se esconde
 * (classe ad-empty) e volta a aparecer quando o parceiro preencher.
 *
 * - Altura mínima reservada para não causar CLS.
 * - Lazy load nativo do GPT.
 * - Refresh só quando o anúncio já foi visto e continua ≥ 50% na tela, com a aba ativa.
 * - NEXT_PUBLIC_ADS_DEBUG=1 mostra contorno e tamanhos de cada slot.
 */

type AdsConfig = {
  network: string;
  parent: string;
  child: boolean;
  lazy: boolean;
  refresh: number;
};

declare global {
  interface Window {
    googletag: any;
    __coAds?: AdsConfig;
    __coAdsPartner?: boolean;
    __coAdsState?: { visible: Map<string, number>; timers: Map<string, number>; refreshes: Map<string, number>; listeners: boolean };
  }
}

/** Segmentação do slot: setConfig (API atual do GPT) ou setTargeting (versões antigas). */
function target(slot: any, values: Record<string, string>) {
  if (typeof slot.setConfig === "function") slot.setConfig({ targeting: values });
  else for (const [k, v] of Object.entries(values)) slot.setTargeting(k, v);
}

function pageType(path: string): string {
  const seg = path.split("/")[1] || "home";
  return seg || "home";
}

function ensureListeners(cfg: AdsConfig) {
  const w = window;
  w.__coAdsState ||= { visible: new Map(), timers: new Map(), refreshes: new Map(), listeners: false };
  const st = w.__coAdsState;
  if (st.listeners) return;
  st.listeners = true;
  w.googletag.cmd.push(() => {
    const pubads = w.googletag.pubads();
    // anúncios não personalizados até a pessoa aceitar os cookies de publicidade (LGPD)
    let consent: string | null = null;
    try {
      consent = localStorage.getItem("co_consent");
    } catch {
      /* sem armazenamento: trata como não aceito */
    }
    pubads.setPrivacySettings({ nonPersonalizedAds: consent !== "granted" });

    pubads.addEventListener("slotRenderEnded", (e: any) => {
      const el = document.getElementById(e.slot.getSlotElementId());
      el?.closest(".ad")?.classList.toggle("ad-empty", Boolean(e.isEmpty));
    });

    pubads.addEventListener("slotVisibilityChanged", (e: any) => {
      st.visible.set(e.slot.getSlotElementId(), e.inViewPercentage);
    });

    if (cfg.refresh > 0) {
      // Depois de uma impressão visível, agenda o próximo refresh
      pubads.addEventListener("impressionViewable", (e: any) => {
        const slot = e.slot;
        const id = slot.getSlotElementId();
        window.clearTimeout(st.timers.get(id));
        const tick = () => {
          // slot removido (troca de página)
          if (!document.getElementById(id)) return;
          const seen = (st.visible.get(id) ?? 0) >= 50 && document.visibilityState === "visible";
          if (!seen) {
            st.timers.set(id, window.setTimeout(tick, 5000)); // tenta de novo quando voltar à tela
            return;
          }
          const n = (st.refreshes.get(id) || 0) + 1;
          st.refreshes.set(id, n);
          target(slot, { refresh: String(n) });
          pubads.refresh([slot]);
        };
        st.timers.set(id, window.setTimeout(tick, cfg.refresh * 1000));
      });
    }
  });
}

export function AdSlot({ id, format, className }: { id: string; format: AdFormat; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname() || "/";
  const f = FORMATS[format];
  const elId = `ad-${id}`;
  const debug = process.env.NEXT_PUBLIC_ADS_DEBUG === "1";

  // modo parceiro: só observa se o espaço foi preenchido
  useEffect(() => {
    const el = ref.current;
    if (!window.__coAdsPartner || !el) return;
    const box = el.closest(".ad");
    const filled = () => Array.from(el.children).some((c) => !c.classList.contains("ad-debug-info"));
    const update = () => box?.classList.toggle("ad-empty", !filled());
    const obs = new MutationObserver(update);
    obs.observe(el, { childList: true, subtree: true });
    const timer = window.setTimeout(update, 10_000);
    return () => {
      obs.disconnect();
      window.clearTimeout(timer);
    };
  }, [elId, path]);

  useEffect(() => {
    const cfg = window.__coAds;
    if (!cfg || !ref.current) return;
    const w = window;
    w.googletag = w.googletag || { cmd: [] };
    ensureListeners(cfg);

    let slot: any = null;
    w.googletag.cmd.push(() => {
      const gt = w.googletag;
      if (!document.getElementById(elId)) return;
      const unit = cfg.parent ? `/${cfg.network}/${cfg.parent}${cfg.child ? `/${id}` : ""}` : `/${cfg.network}/${id}`;
      slot = gt.defineSlot(unit, allSizes(f), elId);
      if (!slot) return; // já definido (ex.: renderização dupla em desenvolvimento)
      const mapping = gt
        .sizeMapping()
        .addSize([1024, 0], f.desktop)
        .addSize([768, 0], f.tablet)
        .addSize([0, 0], f.mobile)
        .build();
      slot.defineSizeMapping(mapping);
      target(slot, { pos: id, formato: format, pagina: pageType(path), refresh: "0" });
      slot.addService(gt.pubads());
      gt.display(elId);
    });

    return () => {
      const st = w.__coAdsState;
      if (st) {
        window.clearTimeout(st.timers.get(elId));
        st.timers.delete(elId);
        st.visible.delete(elId);
        st.refreshes.delete(elId);
      }
      w.googletag.cmd.push(() => {
        if (slot) w.googletag.destroySlots([slot]);
      });
    };
    // path muda = nova página = slot novo
  }, [elId, id, format, f, path]);

  return (
    <aside
      className={`ad ad-${format}${debug ? " ad-debug" : ""}${className ? ` ${className}` : ""}`}
      aria-label="Publicidade"
    >
      <span className="ad-label">Publicidade</span>
      <div ref={ref} id={elId} className={`ad-slot ${elId}`} data-ad-slot={id} data-ad-format={format}>
        {debug ? (
          <span className="ad-debug-info">
            #{elId} · desktop {sizesLabel(f.desktop)} · celular {sizesLabel(f.mobile)}
          </span>
        ) : null}
      </div>
    </aside>
  );
}
