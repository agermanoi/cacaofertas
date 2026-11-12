/** Convite para os canais de alertas (Telegram e WhatsApp); só mostra os que estão nas configurações. */
export function TelegramCta({ channel, whatsapp = "", compact = false }: { channel: string; whatsapp?: string; compact?: boolean }) {
  if (!channel && !whatsapp) return null;
  const both = Boolean(channel && whatsapp);
  const where = both ? "no WhatsApp e no Telegram" : whatsapp ? "no WhatsApp" : "no Telegram";
  return (
    <aside className={`tg-cta${compact ? " tg-cta-compact" : ""}`}>
      <span className="tg-cta-icon" aria-hidden="true">
        📲
      </span>
      <div>
        <strong>Recordes de preço {where}</strong>
        {compact ? null : <p>Avisamos no canal quando um produto chega ao menor preço que já vimos. Grátis, sem spam.</p>}
      </div>
      <span className="tg-cta-btns">
        {whatsapp ? (
          <a className="btn tg-cta-btn wa" href={whatsapp} target="_blank" rel="noopener">
            {both ? "WhatsApp" : "Seguir no WhatsApp"}
          </a>
        ) : null}
        {channel ? (
          <a className="btn tg-cta-btn" href={`https://t.me/${channel}`} target="_blank" rel="noopener">
            {both ? "Telegram" : "Entrar no canal"}
          </a>
        ) : null}
      </span>
    </aside>
  );
}
