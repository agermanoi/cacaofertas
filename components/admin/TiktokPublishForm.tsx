"use client";

import { useState } from "react";

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Todos (público)",
  MUTUAL_FOLLOW_FRIENDS: "Amigos (seguidores mútuos)",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Só eu (privado)",
};

interface Props {
  action: (formData: FormData) => void;
  postId: string | number;
  caption: string;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
}

/**
 * Formulário de publicação direta, seguindo as Content Sharing Guidelines do TikTok:
 * privacidade sem padrão, interações desligadas por padrão, declaração de conteúdo comercial
 * e aviso de consentimento antes do botão.
 */
export function TiktokPublishForm(p: Props) {
  const [privacy, setPrivacy] = useState("");
  const [disclose, setDisclose] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [branded, setBranded] = useState(false);
  const [caption, setCaption] = useState(p.caption);

  const brandedPrivateConflict = branded && privacy === "SELF_ONLY";
  const discloseIncomplete = disclose && !yourBrand && !branded;
  const canPost = Boolean(privacy) && !brandedPrivateConflict && !discloseIncomplete && caption.trim().length > 0;
  const label = branded ? "Parceria paga" : yourBrand ? "Conteúdo promocional" : null;

  return (
    <form action={p.action} className="admin-form tiktok-publish">
      <input type="hidden" name="id" value={p.postId} />

      <div className="field">
        <label htmlFor="title">Legenda (caption)</label>
        <textarea id="title" name="title" rows={6} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} />
        <p className="hint">{caption.length}/2200 · até 5 hashtags</p>
      </div>

      <div className="field">
        <label htmlFor="privacy">Quem pode ver este vídeo (privacy)</label>
        <select id="privacy" name="privacy" required value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
          <option value="" disabled>
            Escolha…
          </option>
          {p.privacyOptions.map((o) => (
            <option key={o} value={o} disabled={branded && o === "SELF_ONLY"}>
              {PRIVACY_LABEL[o] || o}
              {branded && o === "SELF_ONLY" ? " (indisponível para conteúdo de marca)" : ""}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend>Permitir que outras pessoas</legend>
        <label className="check">
          <input type="checkbox" name="allow_comment" disabled={p.commentDisabled} />
          <span>Comentem{p.commentDisabled ? " (desativado nas configurações da conta)" : ""}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="allow_duet" disabled={p.duetDisabled} />
          <span>Façam dueto (Duet){p.duetDisabled ? " (desativado nas configurações da conta)" : ""}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="allow_stitch" disabled={p.stitchDisabled} />
          <span>Façam costura (Stitch){p.stitchDisabled ? " (desativado nas configurações da conta)" : ""}</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Conteúdo comercial (content disclosure)</legend>
        <label className="check">
          <input type="checkbox" checked={disclose} onChange={(e) => setDisclose(e.target.checked)} />
          <span>Este vídeo promove uma marca, produto ou serviço</span>
        </label>
        {disclose ? (
          <div className="disclose">
            <label className="check">
              <input type="checkbox" name="brand_organic" checked={yourBrand} onChange={(e) => setYourBrand(e.target.checked)} />
              <span>
                <strong>Sua marca</strong>: você está promovendo você mesmo ou o seu negócio
              </span>
            </label>
            <label className="check">
              <input type="checkbox" name="brand_content" checked={branded} onChange={(e) => setBranded(e.target.checked)} />
              <span>
                <strong>Conteúdo de marca</strong>: você está promovendo outra marca ou um terceiro
              </span>
            </label>
            {label ? <p className="hint">O vídeo será rotulado como “{label}”.</p> : null}
            {discloseIncomplete ? <p className="flash flash-erro">Escolha pelo menos uma das opções acima para publicar.</p> : null}
            {brandedPrivateConflict ? (
              <p className="flash flash-erro">Conteúdo de marca não pode ser privado: escolha outra privacidade.</p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <p className="consent">
        Ao publicar, você concorda com a{" "}
        <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">
          Confirmação de Uso de Música do TikTok
        </a>
        {branded ? (
          <>
            {" "}e com a{" "}
            <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">
              Política de Conteúdo de Marca
            </a>
          </>
        ) : null}
        .
      </p>
      <button type="submit" className="btn" disabled={!canPost}>
        Publicar no TikTok
      </button>
      <p className="hint">Depois de publicar, o TikTok pode levar alguns minutos para processar o vídeo e mostrá-lo no perfil.</p>
    </form>
  );
}
