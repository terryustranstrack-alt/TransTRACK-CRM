import "server-only";
import { createHash } from "crypto";
import { normalizePhone } from "@/lib/phone";
import { leadStatusLabel, type LeadStatus } from "@/lib/types";

// Kirim "CRM event" ke Meta (Conversions API — panduan "Send a CRM event"
// di Events Manager). Setiap kali lead masuk atau pindah tahap (New →
// Contacted → … → Won/Lost), Meta diberi tahu. Meta mencocokkan orangnya
// dengan yang pernah melihat/klik iklan, lalu belajar iklan mana yang
// menghasilkan lead berkualitas — bukan sekadar chat.
//
// Data pribadi (nomor HP, email, nama, kota) TIDAK dikirim mentah: diacak
// dulu (SHA-256) sesuai syarat Meta. Meta hanya bisa mencocokkan, tidak
// bisa membaca balik isinya.

const GRAPH_API_VERSION = "v26.0";

// Kolom lead yang dibutuhkan untuk membuat event (sesuai isi tabel leads).
export type CapiLead = {
  id: string;
  nama: string | null;
  kontak: string | null;
  email: string | null;
  kota: string | null;
  status: LeadStatus;
  estimasi_nilai: number | null;
};

// Nilai deal untuk dikirim ke Meta: hanya saat lead Won ("Closing") dan
// estimasi nilainya diisi. Dengan ini Meta bisa membedakan deal besar dan
// kecil (optimasi nilai / ROAS di Ads Manager).
function wonValue(lead: CapiLead): { value: number; currency: string } | null {
  if (lead.status !== "Closing") return null;
  const value = Number(lead.estimasi_nilai ?? 0);
  return value > 0 ? { value, currency: "IDR" } : null;
}

// Fitur aktif kalau ID dataset & token sudah diisi di env.
export function metaCapiConfigured(): boolean {
  return !!process.env.META_CAPI_DATASET_ID && !!process.env.META_CAPI_ACCESS_TOKEN;
}

// Acak satu nilai dengan SHA-256 (format yang diminta Meta). Nilai kosong
// tidak dikirim sama sekali.
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Rapikan teks sebelum diacak: huruf kecil, tanpa spasi di ujung.
// `noSpaces` untuk kota (Meta minta "jakartaselatan", bukan "jakarta selatan").
function normalizeText(value: string | null, noSpaces = false): string {
  const v = (value ?? "").trim().toLowerCase();
  return noSpaces ? v.replace(/[^a-z]/g, "") : v;
}

// Data pencocokan orang ("user_data"): HP, email, nama depan/belakang,
// kota, negara, dan ID lead kita sendiri — semuanya diacak.
function buildUserData(lead: CapiLead): Record<string, string[]> {
  const words = normalizeText(lead.nama).split(/\s+/).filter(Boolean);
  const fields: Record<string, string> = {
    ph: normalizePhone(lead.kontak ?? ""),
    em: normalizeText(lead.email),
    fn: words[0] ?? "",
    ln: words.length > 1 ? words[words.length - 1] : "",
    ct: normalizeText(lead.kota, true),
    country: "id",
    external_id: lead.id,
  };
  const userData: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value) userData[key] = [sha256(value)];
  }
  return userData;
}

// Susun satu event sesuai contoh payload di panduan Meta. Nama event =
// nama tahap dalam Bahasa Inggris (New, Contacted, Interested,
// Negotiation, Won, Lost) — di Events Manager tahap-tahap ini nanti
// dipetakan ke corong penjualan. `event_id` = id lead + tahap, supaya kalau
// event yang sama terkirim dua kali, Meta menghitungnya sekali saja.
export function buildCrmEvent(lead: CapiLead) {
  return {
    event_name: leadStatusLabel(lead.status),
    event_time: Math.floor(Date.now() / 1000),
    event_id: `${lead.id}:${lead.status}`,
    action_source: "system_generated",
    user_data: buildUserData(lead),
    custom_data: {
      event_source: "crm",
      lead_event_source: "TransTRACK CRM",
      ...wonValue(lead),
    },
  };
}

// Kirim satu event ke dataset Meta. Return pesan error kalau ditolak
// (untuk dicatat di log), null kalau berhasil. META_CAPI_TEST_EVENT_CODE
// (opsional) membuat event muncul di tab "Test events" saja — untuk uji coba.
export async function sendCrmEvent(
  event: ReturnType<typeof buildCrmEvent>,
): Promise<string | null> {
  const datasetId = process.env.META_CAPI_DATASET_ID;
  const body: Record<string, unknown> = {
    data: [event],
    access_token: process.env.META_CAPI_ACCESS_TOKEN,
  };
  if (process.env.META_CAPI_TEST_EVENT_CODE) {
    body.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
  }
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${datasetId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (res.ok) return null;
  return `Meta ${res.status}: ${await res.text()}`;
}
