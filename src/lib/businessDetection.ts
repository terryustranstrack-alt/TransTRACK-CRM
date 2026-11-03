import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyBusiness, type BotHistoryTurn } from "@/lib/groq";
import type { WhatsappReferral } from "@/lib/whatsapp";
import type {
  AdSource,
  BusinessDetectionLayer,
  BusinessKeywordRule,
} from "@/lib/types";

// Deteksi otomatis Business (TransTRACK / Academy) untuk chat WhatsApp
// yang masuk lewat satu nomor yang sama, dalam 3 lapis:
//   1. "ad"      — data iklan Meta yang ikut di pesan (paling akurat)
//   2. "keyword" — kata kunci di pesan pelanggan (mis. pesan pembuka iklan)
//   3. "ai"      — tebakan AI dari isi chat (cadangan terakhir)
// Hasilnya disimpan di percakapan dulu (lead mungkin belum ada), lalu
// diteruskan ke lead lewat applyDetectionToLead — yang HANYA mengisi field
// lead yang masih kosong, tidak pernah menimpa isian manusia.
//
// Semua fungsi di sini "best effort": gagal apa pun tidak boleh mengganggu
// penerimaan pesan WhatsApp.

type AdminClient = SupabaseClient;

export type Detection = {
  businessUnitId: string;
  produk: string | null;
  by: BusinessDetectionLayer;
};

// Lapis yang lebih akurat boleh menggantikan hasil lapis yang lebih lemah,
// tidak sebaliknya.
const LAYER_PRIORITY: Record<BusinessDetectionLayer, number> = {
  ad: 3,
  keyword: 2,
  ai: 1,
};

const META_ADS_SOURCE = "Meta Ads";
const AI_MAX_ATTEMPTS = 3;

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}

// ── Lapis 1: iklan ──────────────────────────────────────────────────────

// Simpan/perbarui data iklan yang ikut di pesan. Pemetaan Business/Product
// yang sudah diatur admin tidak disentuh. Return baris iklannya.
export async function recordAdReferral(
  admin: AdminClient,
  referral: WhatsappReferral | undefined,
): Promise<AdSource | null> {
  if (!referral?.source_id) return null;
  const { data } = await admin
    .from("ad_sources")
    .upsert(
      {
        source_id: referral.source_id,
        source_type: referral.source_type ?? null,
        headline: referral.headline ?? null,
        body: referral.body ?? null,
        source_url: referral.source_url ?? null,
        media_url: referral.image_url ?? referral.thumbnail_url ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "source_id" },
    )
    .select("*")
    .single();
  return (data as AdSource) ?? null;
}

// Iklan yang sudah dipetakan admin → hasil deteksi. Belum dipetakan → null.
export function detectionFromAd(ad: AdSource): Detection | null {
  if (!ad.business_unit_id) return null;
  return { businessUnitId: ad.business_unit_id, produk: ad.produk, by: "ad" };
}

// ── Lapis 2: kata kunci ─────────────────────────────────────────────────

// Cari aturan kata kunci yang cocok dengan pesan pelanggan. Kalau beberapa
// cocok, pakai kata kunci terpanjang (paling spesifik).
export async function detectFromKeywords(
  admin: AdminClient,
  text: string,
): Promise<Detection | null> {
  const normalized = text.toLowerCase();
  const { data } = await admin.from("business_keyword_rules").select("*");
  const match = ((data ?? []) as BusinessKeywordRule[])
    .filter((r) => {
      const keyword = r.keyword.trim().toLowerCase();
      return keyword !== "" && normalized.includes(keyword);
    })
    .sort((a, b) => b.keyword.trim().length - a.keyword.trim().length)[0];
  if (!match) return null;
  return {
    businessUnitId: match.business_unit_id,
    produk: match.produk,
    by: "keyword",
  };
}

// ── Simpan ke percakapan & teruskan ke lead ─────────────────────────────

// Simpan hasil deteksi ke percakapan, kecuali percakapan itu sudah punya
// hasil dari lapis yang lebih kuat. Lapis yang sama tidak saling menimpa
// (mis. kata kunci di pesan ke-5 tidak mengubah hasil pesan pertama) —
// kecuali iklan, supaya admin bisa membetulkan pemetaan iklan yang salah.
export async function saveConversationDetection(
  admin: AdminClient,
  conversationId: string,
  currentLayer: BusinessDetectionLayer | null,
  detection: Detection,
): Promise<boolean> {
  if (currentLayer) {
    const current = LAYER_PRIORITY[currentLayer];
    const next = LAYER_PRIORITY[detection.by];
    if (current > next || (current === next && detection.by !== "ad")) {
      return false;
    }
  }
  let query = admin
    .from("conversations")
    .update({
      business_unit_id: detection.businessUnitId,
      suggested_produk: detection.produk,
      business_detected_by: detection.by,
    })
    .eq("id", conversationId);
  // Tebakan AI jalan paralel dengan lapis lain — cuma boleh mengisi kalau
  // di detik yang sama belum ada hasil dari iklan / kata kunci.
  if (detection.by === "ai") query = query.is("business_detected_by", null);
  await query;
  return true;
}

// Kalimat penjelas sumber deteksi untuk riwayat aktivitas lead.
function describeLayer(
  layer: BusinessDetectionLayer | null,
  adHeadline: string | null,
): string {
  if (layer === "ad") return `Meta ad${adHeadline ? ` “${adHeadline}”` : ""}`;
  if (layer === "keyword") return "a keyword in the customer's message";
  if (layer === "ai") return "AI reading the chat — please double-check";
  return "a Meta ad";
}

// Teruskan hasil deteksi percakapan ke lead yang terhubung: isi Business,
// Product, iklan asal, dan Source "Meta Ads" — HANYA kalau field lead itu
// masih kosong (Source "WhatsApp" isian otomatis boleh diganti "Meta Ads").
// Setiap pengisian dicatat di riwayat aktivitas lead supaya bisa dikoreksi.
export async function applyDetectionToLead(
  admin: AdminClient,
  conversationId: string,
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("lead_id, business_unit_id, suggested_produk, business_detected_by, ad_source_id")
      .eq("id", conversationId)
      .single();
    if (!conv?.lead_id) return;

    const { data: lead } = await admin
      .from("leads")
      .select("business_unit_id, produk, sumber, ad_source_id")
      .eq("id", conv.lead_id)
      .single();
    if (!lead) return;

    const patch: Record<string, string> = {};
    const filled: string[] = [];

    if (conv.business_unit_id && !lead.business_unit_id) {
      const { data: unit } = await admin
        .from("business_units")
        .select("name")
        .eq("id", conv.business_unit_id)
        .single();
      patch.business_unit_id = conv.business_unit_id;
      filled.push(`business = ${unit?.name ?? "?"}`);
    }
    if (conv.suggested_produk && isBlank(lead.produk)) {
      patch.produk = conv.suggested_produk;
      filled.push(`product = ${conv.suggested_produk}`);
    }
    if (conv.ad_source_id && !lead.ad_source_id) {
      patch.ad_source_id = conv.ad_source_id;
    }
    if (
      conv.ad_source_id &&
      (isBlank(lead.sumber) || lead.sumber === "WhatsApp")
    ) {
      patch.sumber = META_ADS_SOURCE;
      filled.push(`source = ${META_ADS_SOURCE}`);
    }
    if (Object.keys(patch).length === 0) return;

    await admin
      .from("leads")
      .update({ ...patch, tanggal_update: new Date().toISOString() })
      .eq("id", conv.lead_id);

    if (filled.length > 0) {
      let headline: string | null = null;
      if (conv.ad_source_id) {
        const { data: ad } = await admin
          .from("ad_sources")
          .select("headline")
          .eq("id", conv.ad_source_id)
          .single();
        headline = ad?.headline ?? null;
      }
      const layer =
        (conv.business_detected_by as BusinessDetectionLayer | null) ??
        (conv.ad_source_id ? "ad" : null);
      await admin.from("lead_activities").insert({
        lead_id: conv.lead_id,
        type: "note",
        content: `Auto-filled from ${describeLayer(layer, headline)}: ${filled.join(", ")}.`,
        created_by: null,
      });
    }
  } catch {
    // best effort
  }
}

// ── Dipanggil webhook untuk tiap pesan masuk baru (lapis 1 & 2) ─────────

export async function detectBusinessOnInbound(
  admin: AdminClient,
  input: {
    conversationId: string;
    referral: WhatsappReferral | undefined;
    text: string | null;
  },
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("business_detected_by, ad_source_id")
      .eq("id", input.conversationId)
      .single();
    if (!conv) return;

    let detection: Detection | null = null;

    const ad = await recordAdReferral(admin, input.referral);
    if (ad) {
      // Catat iklan pertama yang membawa chat ini.
      if (!conv.ad_source_id) {
        await admin
          .from("conversations")
          .update({ ad_source_id: ad.id })
          .eq("id", input.conversationId);
      }
      detection = detectionFromAd(ad);
    }
    if (!detection && input.text) {
      detection = await detectFromKeywords(admin, input.text);
    }
    if (detection) {
      await saveConversationDetection(
        admin,
        input.conversationId,
        conv.business_detected_by,
        detection,
      );
    }
    await applyDetectionToLead(admin, input.conversationId);
  } catch {
    // best effort
  }
}

// ── Lapis 3: tebakan AI ─────────────────────────────────────────────────

// Kalau lapis 1 & 2 belum menemukan Business, minta AI menebak dari isi
// chat pelanggan. Maksimal 3 kali per percakapan (hemat panggilan AI);
// AI boleh menjawab "belum jelas", dan nanti dicoba lagi di pesan berikutnya.
export async function maybeGuessBusinessWithAI(
  admin: AdminClient,
  conversationId: string,
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("business_detected_by, business_guess_attempts")
      .eq("id", conversationId)
      .single();
    if (!conv || conv.business_detected_by) return;
    if (conv.business_guess_attempts >= AI_MAX_ATTEMPTS) return;

    const { data: recent } = await admin
      .from("messages")
      .select("text_body")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .order("wa_timestamp", { ascending: true, nullsFirst: true })
      .limit(20);
    const customerLines = (recent ?? [])
      .map((m) => (m.text_body as string | null)?.trim() ?? "")
      .filter(Boolean);
    // Terlalu sedikit teks (mis. cuma "halo") — tunggu pesan berikutnya.
    if (customerLines.join(" ").length < 15) return;

    const [{ data: units }, { data: products }] = await Promise.all([
      admin.from("business_units").select("id, name"),
      admin.from("lead_products").select("name, business_unit_id"),
    ]);
    if (!units || units.length === 0) return;

    await admin
      .from("conversations")
      .update({ business_guess_attempts: conv.business_guess_attempts + 1 })
      .eq("id", conversationId);

    // Daftar produk per business (produk umum ikut ke semua business).
    const productsOf = (unitId: string) =>
      (products ?? [])
        .filter((p) => !p.business_unit_id || p.business_unit_id === unitId)
        .map((p) => p.name as string);
    const history: BotHistoryTurn[] = customerLines.map((content) => ({
      role: "user",
      content,
    }));
    const guess = await classifyBusiness(
      history,
      units.map((u) => ({ name: u.name, products: productsOf(u.id) })),
    );

    const unit = units.find((u) => u.name === guess.business);
    if (!unit) return;
    const produk = productsOf(unit.id).includes(guess.product)
      ? guess.product
      : null;

    await saveConversationDetection(admin, conversationId, null, {
      businessUnitId: unit.id,
      produk,
      by: "ai",
    });
    await applyDetectionToLead(admin, conversationId);
  } catch {
    // best effort
  }
}
