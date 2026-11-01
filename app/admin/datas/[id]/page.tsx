import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase";
import { Flash } from "@/components/admin/Flash";
import { EventForm } from "@/components/admin/EventForm";
import type { EventRow } from "@/lib/events";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> };

export default async function EditEvent({ params, searchParams }: Props) {
  const { id } = await params;
  const { erro } = await searchParams;
  let e: EventRow | null = null;
  if (id !== "nova") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const { data } = await adminClient().from("events").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    e = data as EventRow;
  }
  return (
    <div className="wrap admin-page">
      <nav className="crumbs">
        <Link href="/admin/datas">Datas</Link> <span aria-hidden="true">/</span> {e ? e.name : "Nova data"}
      </nav>
      <h1>{e ? `Editar ${e.name}` : "Nova data"}</h1>
      <Flash erro={erro} />
      <EventForm e={e ?? undefined} />
    </div>
  );
}
