import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessTone } from "@/lib/businessStyle";
import {
  buildCrmEvent,
  metaCapiConfigured,
  sendCrmEvent,
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
  if (!metaCapiConfigured()) {
    return NextResponse.json({ sent: false, reason: "not configured" });
  }

  const body = (await request.json()) as WebhookBody;
  if (!isStageEvent(body) || !body.record) {
    return NextResponse.json({ sent: false, reason: "no stage change" });
  }
  if (await isAcademyLead(body.record.business_unit_id)) {
    return NextResponse.json({ sent: false, reason: "academy lead" });
  }

  const error = await sendCrmEvent(buildCrmEvent(body.record));
  if (error) {
    // Dicatat di log Vercel supaya bisa dicek; tetap balas 200 supaya
    // Supabase tidak mengirim ulang terus-menerus.
    console.error("[meta-capi]", error);
    return NextResponse.json({ sent: false, reason: "meta rejected" });
  }
  return NextResponse.json({ sent: true });
}
