import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireCustomer } from "@/lib/portal/require-customer";
import { weightLogSchema } from "@/lib/validations/schemas";
import { weightLogDateError } from "@/lib/portal/weight";
import { todayInTz, addDays } from "@/lib/format";
import { CACHE_TAGS } from "@/lib/data/tags";
import type { WeightResponse } from "@/lib/supabase/types";

const HISTORY_DAYS = 365;

export async function GET(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const from = addDays(todayInTz(req.cookies.get("tz")?.value), -HISTORY_DAYS);
  const [logsRes, clientRes] = await Promise.all([
    auth.supabase
      .from("weight_logs")
      .select("id, log_date, weight_kg")
      .eq("client_id", auth.clientId)
      .gte("log_date", from)
      .order("log_date", { ascending: true }),
    auth.supabase
      .from("clients")
      .select("weight_kg, target_weight_kg")
      .eq("id", auth.clientId)
      .maybeSingle(),
  ]);
  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 });

  const body: WeightResponse = {
    logs: (logsRes.data ?? []).map((l) => ({ ...l, weight_kg: Number(l.weight_kg) })),
    weight_kg: clientRes.data?.weight_kg != null ? Number(clientRes.data.weight_kg) : null,
    target_weight_kg:
      clientRes.data?.target_weight_kg != null ? Number(clientRes.data.target_weight_kg) : null,
  };
  return NextResponse.json(body);
}

export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = weightLogSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const dateError = weightLogDateError(body.log_date, req.cookies.get("tz")?.value);
  if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

  // RLS client: "Customer manage own" rejects any row that is not the caller's.
  const { data, error } = await auth.supabase
    .from("weight_logs")
    .upsert(
      { client_id: auth.clientId, log_date: body.log_date, weight_kg: body.weight_kg },
      { onConflict: "client_id,log_date" }
    )
    .select("id, log_date, weight_kg")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The admin client card shows the latest weight.
  revalidateTag(CACHE_TAGS.clients, "max");
  return NextResponse.json({ log: { ...data, weight_kg: Number(data.weight_kg) } });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const logDate = req.nextUrl.searchParams.get("log_date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return NextResponse.json({ error: "invalid log_date" }, { status: 400 });
  }
  const { data, error } = await auth.supabase
    .from("weight_logs")
    .delete()
    .eq("client_id", auth.clientId)
    .eq("log_date", logDate)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  revalidateTag(CACHE_TAGS.clients, "max");
  return NextResponse.json({ ok: true });
}
