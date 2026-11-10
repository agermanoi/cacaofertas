import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase";
import { Flash } from "@/components/admin/Flash";
import { TiktokPublishForm } from "@/components/admin/TiktokPublishForm";
import { tiktokCaption } from "@/lib/social";
import { tiktokCreatorInfo, tiktokDirectEnabled, tiktokMediaUrl, tiktokPublishStatus, type CreatorInfo } from "@/lib/tiktok";
import { publishDirect } from "../../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> };

const STATUS: Record<string, string> = {
  PROCESSING_DOWNLOAD: "O TikTok está baixando o vídeo…",
  PROCESSING_UPLOAD: "O TikTok está processando o vídeo…",
  SEND_TO_USER_INBOX: "Enviado para a caixa de entrada do TikTok.",
  PUBLISH_COMPLETE: "Publicado no perfil ✅",
  FAILED: "Falhou",
};

export default async function PublicarTiktok({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const db = adminClient();
  const { data: post } = await db
    .from("social_posts")
    .select("id,caption,tiktok_video_url,tiktok_publish_id,tiktok_error,created_at")
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const direct = await tiktokDirectEnabled(db);
  let creator: CreatorInfo | null = null;
  let creatorError: string | null = null;
  if (direct && post.tiktok_video_url) {
    try {
      creator = await tiktokCreatorInfo(db);
    } catch (e) {
      creatorError = (e as Error).message;
    }
  }
  const status = post.tiktok_publish_id ? await tiktokPublishStatus(db, post.tiktok_publish_id) : null;

  return (
    <div className="wrap admin-page">
      <p>
        <Link href="/admin/social">← Redes sociais</Link>
      </p>
      <h1>Publicar no TikTok</h1>
      <Flash ok={sp.ok} erro={sp.erro} />

      {!post.tiktok_video_url ? (
        <p className="flash flash-erro">Este post ainda não tem vídeo gerado.</p>
      ) : (
        <div className="tiktok-publish-grid">
          <div>
            <h2>Prévia</h2>
            <video src={tiktokMediaUrl(post.tiktok_video_url)} controls playsInline className="tiktok-preview" />
          </div>
          <div>
            {status ? (
              <div className="admin-section">
                <h2>Situação</h2>
                <p>
                  <strong>{STATUS[status.status] || status.status}</strong>
                  {status.reason ? ` (${status.reason})` : ""}
                </p>
                <p className="hint">
                  Atualize a página para ver o andamento. <Link href={`/admin/tiktok/publicar/${post.id}`}>Atualizar</Link>
                </p>
              </div>
            ) : null}

            {!direct ? (
              <p className="flash flash-erro">
                A postagem direta está desligada. Ligue em <Link href="/admin/tiktok#direct">Admin → TikTok → Postagem direta</Link> e
                reconecte a conta.
              </p>
            ) : creatorError ? (
              <p className="flash flash-erro">Não foi possível ler a conta do TikTok: {creatorError}</p>
            ) : creator ? (
              <>
                <div className="tiktok-creator">
                  {creator.creator_avatar_url ? <img src={creator.creator_avatar_url} alt="" width={48} height={48} /> : null}
                  <div>
                    <span className="hint">Publicando como</span>
                    <strong>{creator.creator_nickname || creator.creator_username}</strong>
                    {creator.creator_username ? <span className="hint"> @{creator.creator_username}</span> : null}
                  </div>
                </div>
                <p className="hint">Duração máxima de vídeo permitida para esta conta: {creator.max_video_post_duration_sec} s.</p>
                {post.tiktok_publish_id && status?.status !== "FAILED" ? (
                  <p className="hint">Este vídeo já foi enviado ao TikTok.</p>
                ) : (
                  <TiktokPublishForm
                    action={publishDirect}
                    postId={post.id}
                    caption={tiktokCaption(post.caption)}
                    privacyOptions={creator.privacy_level_options}
                    commentDisabled={creator.comment_disabled}
                    duetDisabled={creator.duet_disabled}
                    stitchDisabled={creator.stitch_disabled}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
