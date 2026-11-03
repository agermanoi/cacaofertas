"use client";

import { useState } from "react";

/** Botão "Copiar" (para colar a legenda no TikTok pelo celular). */
export default function CopyButton({ text, label = "Copiar legenda do TikTok" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "Copiado!" : label}
    </button>
  );
}
