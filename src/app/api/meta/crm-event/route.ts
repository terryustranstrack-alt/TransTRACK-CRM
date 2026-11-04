import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessTone } from "@/lib/businessStyle";
import {
  buildCrmEvent,
  buildWhatsappEvent,
  metaCapiConfigured,
  sendCrmEvent,
  sendWhatsappEvent,
  type CapiLead,
} from "@/lib/metaCapi";

// Dipanggil oleh Supabase (Database Webhook di tabel `leads`) setiap kali
// lead ditambah atau diubah — dari mana pun: Board, halaman lead, ubah
// massal di Prospects, import CSV, maupun chatbot. Jadi tidak ada
// perubahan tahap yang terlewat. Isi kiriman Supabase:
// { type: "INSERT" | "UPDATE" | "DELETE", record, old_record }.

type LeadRow = CapiLead & { business_unit_id: string | null };
type WebhookBody = {
  type: "INSERT" | "UPDATE" | "DELETE";
  record: LeadRow | null;
  old_record: LeadRow | null;
};

// Pastikan yang memanggil benar-benar Supabase kita: header
// x-webhook-secret harus sama dengan META_CAPI_WEBHOOK_SECRET.
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.META_CAPI_WEBHOOK_SECRET ?? "";
  const given = request.headers.get("x-webhook-secret") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Perlu lapor ke Meta? Ya kalau lead baru, atau tahapnya berubah. Edit
// lain (nama, catatan, dll.) tidak dilaporkan.
function isStageEvent(body: WebhookBody): boolean {
  if (!body.record) return false;
  if (body.type === "INSERT") return true;
  return body.type === "UPDATE" && body.record.status !== body.old_record?.status;
}

// Kode klik iklan WhatsApp baru saja tersalin ke lead (tahap tidak
// berubah) — saatnya kirim event WhatsApp untuk tahap lead sekarang.
function isClickIdArrival(body: WebhookBody): boolean {
  return (
    body.type === "UPDATE" &&
    !!body.record?.ctwa_clid &&
    !body.old_record?.ctwa_clid &&
    body.record.status === body.old_record?.status
  );
}

// Dataset Meta ini milik akun iklan TransTRACK, jadi lead Academy tidak
// dikirim ke sini (Academy punya akun iklan sendiri). Lead yang belum
// punya business ikut dikirim — hampir semuanya lead TransTRACK.
async function isAcademyLead(businessUnitId: string | null): Promise<boolean> {
  if (!businessUnitId) return false;
  const { data } = await createAdminClient()
    .from("business_units")
    .select("name")
    .eq("id", businessUnitId)
    .single();
  return businessTone(data?.name as string | undefined) === "academy";
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as WebhookBody;
  const lead = body.record;
  const stageChanged = isStageEvent(body);
  if (!lead || (!stageChanged && !isClickIdArrival(body))) {
    return NextResponse.json({ sent: [], reason: "nothing to report" });
  }

  const sent: string[] = [];
  const errors: string[] = [];

  // 1. Event CRM (semua tahap) — hanya lead TransTRACK, hanya saat tahap
  //    berubah / lead baru.
  if (
    stageChanged &&
    metaCapiConfigured() &&
    !(await isAcademyLead(lead.business_unit_id))
  ) {
    const error = await sendCrmEvent(buildCrmEvent(lead));
    if (error) errors.push(error);
    else sent.push("crm");
  }

  // 2. Event WhatsApp (lead dari iklan Click-to-WhatsApp, TransTRACK maupun
  //    Academy — satu nomor WhatsApp, kode klik menunjuk iklan yang tepat).
  const waEvent = buildWhatsappEvent(lead);
  if (waEvent) {
    const error = await sendWhatsappEvent(waEvent);
    if (error) errors.push(error);
    else sent.push("whatsapp");
  }

  // Ditolak Meta → dicatat di log Vercel. Tetap balas 200 supaya Supabase
  // tidak mengirim ulang terus-menerus.
  for (const error of errors) console.error("[meta-capi]", error);
  return NextResponse.json({ sent, failed: errors.length });
}
