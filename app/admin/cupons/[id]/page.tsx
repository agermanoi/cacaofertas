import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase";
import { Flash } from "@/components/admin/Flash";
import { CouponForm, type CouponRow } from "@/components/admin/CouponForm";
import { knownStores } from "../stores";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> };

export default async function EditarCupom({ params, searchParams }: Props) {
  const { id } = await params;
  const { erro } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await adminClient().from("coupons").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as CouponRow;
  return (
    <div className="wrap admin-page">
      <h1>Editar cupom</h1>
      <p className="admin-sub">
        {c.clicks} {c.clicks === 1 ? "clique" : "cliques"} até agora.
      </p>
      <Flash erro={erro} />
      <CouponForm c={c} stores={await knownStores()} />
    </div>
  );
}
