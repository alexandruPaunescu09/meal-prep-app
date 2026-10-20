import { notFound } from "next/navigation";
import { getClientsWithPortalStatus } from "@/lib/data/clients";
import { getClientDiary } from "@/lib/data/client-diary";
import { RANGE_DAYS, buildClientDiaryView } from "@/lib/data/client-diary-view";
import { addDays, todayInTz } from "@/lib/format";
import ClientDiaryClient from "@/components/admin/client-diary-client";

export default async function ClientDiaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { id } = await params;
  const { day } = await searchParams;

  const clients = await getClientsWithPortalStatus();
  const client = clients.find((c) => c.id === id);
  if (!client) notFound();

  const today = todayInTz();
  const from = addDays(today, -(RANGE_DAYS - 1));
  const data = await getClientDiary(id, from, today);
  const view = buildClientDiaryView(data, today);

  return <ClientDiaryClient client={client} view={view} weights={data.weights} initialDay={day ?? null} />;
}
