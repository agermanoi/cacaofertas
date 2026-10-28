import { Flash } from "@/components/admin/Flash";
import { CouponForm } from "@/components/admin/CouponForm";
import { knownStores } from "../stores";

type Props = { searchParams: Promise<{ erro?: string }> };

export default async function NovoCupom({ searchParams }: Props) {
  const { erro } = await searchParams;
  return (
    <div className="wrap admin-page">
      <h1>Novo cupom</h1>
      <Flash erro={erro} />
      <CouponForm stores={await knownStores()} />
    </div>
  );
}
