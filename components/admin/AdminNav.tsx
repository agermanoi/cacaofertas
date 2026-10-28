"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Produtos", match: (p: string) => p === "/admin" || p.startsWith("/admin/produtos") },
  { href: "/admin/configuracoes", label: "Configurações", match: (p: string) => p.startsWith("/admin/configuracoes") },
  { href: "/admin/mensagens", label: "Mensagens", match: (p: string) => p.startsWith("/admin/mensagens") },
  { href: "/admin/mercadolivre", label: "Mercado Livre", match: (p: string) => p.startsWith("/admin/mercadolivre") },
];

/** Abas do painel. Some na tela de login. */
export function AdminNav() {
  const path = usePathname() || "";
  if (path.startsWith("/admin/login")) return null;
  return (
    <nav className="admin-tabs wrap" aria-label="Seções do painel">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
