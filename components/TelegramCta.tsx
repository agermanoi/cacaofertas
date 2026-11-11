/** Convite para o canal do Telegram (só aparece se o canal estiver nas configurações). */
export function TelegramCta({ channel, compact = false }: { channel: string; compact?: boolean }) {
  if (!channel) return null;
  const href = `https://t.me/${channel}`;
  return (
    <aside className={`tg-cta${compact ? " tg-cta-compact" : ""}`}>
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className="tg-cta-icon">
        <circle cx="12" cy="12" r="12" fill="#229ED9" />
        <path
          fill="#fff"
          d="M17.6 7.2 5.9 11.7c-.8.3-.8.8-.1 1l3 .9 1.1 3.6c.1.4.3.5.6.5s.4-.1.6-.3l1.5-1.4 3 2.2c.6.3 1 .2 1.1-.5l2-9.3c.2-.8-.3-1.2-1-.9Zm-7.1 6.6-.3 2.4-.9-3.1 6.7-4.2-5.5 4.9Z"
        />
      </svg>
      <div>
        <strong>Recordes de preço no Telegram</strong>
        {compact ? null : <p>Avisamos no canal quando um produto chega ao menor preço que já vimos. Grátis, sem spam.</p>}
      </div>
      <a className="btn tg-cta-btn" href={href} target="_blank" rel="noopener">
        Entrar no canal
      </a>
    </aside>
  );
}
