"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Choice = "granted" | "denied";

function apply(choice: Choice) {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; googletag?: { cmd: unknown[]; pubads: () => { setPrivacySettings: (o: object) => void } } };
  const v = choice === "granted" ? "granted" : "denied";
  w.gtag?.("consent", "update", { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v });
  w.googletag?.cmd.push(() => w.googletag!.pubads().setPrivacySettings({ nonPersonalizedAds: choice !== "granted" }));
}

/** Aviso de cookies (LGPD): barra discreta no rodapé, com Aceitar e Recusar. */
export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("co_consent");
    } catch {
      /* navegador sem armazenamento */
    }
    if (!saved) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener("co:cookies", reopen);
    return () => window.removeEventListener("co:cookies", reopen);
  }, []);

  const choose = (c: Choice) => {
    try {
      localStorage.setItem("co_consent", c);
    } catch {
      /* segue sem gravar */
    }
    apply(c);
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="cookie-bar" role="dialog" aria-live="polite" aria-label="Aviso de cookies">
      <p>
        Usamos cookies para medir a audiência e para anúncios. Sem o seu aceite, os anúncios não são personalizados.{" "}
        <Link href="/politica-de-privacidade#cookies">Saiba mais</Link>
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn btn-ghost" onClick={() => choose("denied")}>
          Recusar
        </button>
        <button type="button" className="btn" onClick={() => choose("granted")}>
          Aceitar
        </button>
      </div>
    </div>
  );
}

/** Link do rodapé para rever a escolha. */
export function CookiePrefsLink() {
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => {
        try {
          localStorage.removeItem("co_consent");
        } catch {
          /* ok */
        }
        window.dispatchEvent(new Event("co:cookies"));
      }}
    >
      Preferências de cookies
    </button>
  );
}
