import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { blackFriday } from "@/lib/format";
import "./globals.css";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Caça Ofertas";
// Wordmark: a última palavra vai na etiqueta amarela
const NAME_WORDS = SITE_NAME.split(" ");
const NAME_LAST = NAME_WORDS.pop();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: histórico de preços para a Black Friday`, template: `%s | ${SITE_NAME}` },
  description:
    "Histórico de preços e menor preço atual dos produtos mais buscados na Black Friday. Veja se o desconto é real antes de comprar.",
  openGraph: { siteName: SITE_NAME, locale: "pt_BR", type: "website" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#14213D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { days } = blackFriday();
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap"
        />
      </head>
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        <header className="top">
          <div className="wrap top-inner">
            <Link href="/" className="brand" aria-label={`${SITE_NAME}, página inicial`}>
              {NAME_WORDS.join(" ")} <span>{NAME_LAST}</span>
            </Link>
            <p className="countdown">
              {days === 0 ? "Hoje é Black Friday" : `Faltam ${days} ${days === 1 ? "dia" : "dias"} para a Black Friday`}
            </p>
            <Link href="/como-funciona" className="top-link">
              Como funciona
            </Link>
          </div>
        </header>
        <main id="conteudo">{children}</main>
        <footer className="foot">
          <div className="wrap foot-inner">
            <p>
              Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão e o preço para você
              não muda. Isso não influencia o veredito, que é calculado só pelo histórico.
            </p>
            <p>
              Preços coletados automaticamente e sujeitos a mudança. Confira o valor final na loja antes de pagar.{" "}
              <Link href="/como-funciona">Saiba como medimos</Link>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
