"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Verdict } from "@/lib/verdict";
import { PriceTag } from "./PriceTag";
import { VerdictBadge } from "./VerdictBadge";

export interface HeroSlide {
  slug: string;
  name: string;
  image: string | null;
  price: number;
  listPrice: number | null;
  store: string | null;
  kicker: string;
  verdict: Verdict;
}

const INTERVAL = 6000;

/**
 * Carrossel do destaque da home.
 * - Passa sozinho a cada 6 s; pausa com o mouse em cima, com foco do teclado ou com a aba em segundo plano.
 * - Setas, bolinhas e arrastar com o dedo (scroll-snap nativo).
 * - Sem animação automática para quem pediu "reduzir movimento" no sistema.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = slides.length;

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const next = (i + total) % total;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [total]
  );

  // Índice atual a partir da rolagem (funciona também ao arrastar com o dedo)
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Avanço automático
  useEffect(() => {
    if (total < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") go(index + 1);
    }, INTERVAL);
    return () => window.clearInterval(t);
  }, [index, paused, total, go]);

  if (!total) return null;

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carrossel"
      aria-label="Ofertas em destaque"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="hero-track" ref={track}>
        {slides.map((s, i) => (
          <div
            key={s.slug}
            className="hero-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${total}`}
            aria-hidden={i !== index}
          >
            <Link href={`/produto/${s.slug}`} className="hero-deal" tabIndex={i === index ? 0 : -1}>
              <span className="hero-deal-kicker">{s.kicker}</span>
              <span className="hero-deal-body">
                <span className="hero-deal-info">
                  <span className="hero-deal-name">{s.name}</span>
                  <PriceTag price={s.price} listPrice={s.listPrice} store={s.store} size="lg" />
                  <VerdictBadge verdict={s.verdict} withDetail />
                </span>
                {s.image ? (
                  <span className="hero-deal-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.image} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" />
                  </span>
                ) : null}
              </span>
            </Link>
          </div>
        ))}
      </div>

      {total > 1 ? (
        <div className="hero-controls">
          <button type="button" className="hero-arrow" aria-label="Oferta anterior" onClick={() => go(index - 1)}>
            ‹
          </button>
          <div className="hero-dots" role="tablist" aria-label="Escolher oferta">
            {slides.map((s, i) => (
              <button
                key={s.slug}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}: ${s.name}`}
                className={i === index ? "on" : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <button type="button" className="hero-arrow" aria-label="Próxima oferta" onClick={() => go(index + 1)}>
            ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
